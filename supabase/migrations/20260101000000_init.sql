-- Kime Foresight initial schema.
-- All money is stored as integer cents. Every organization-scoped table has RLS enabled.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  reporting_currency text not null default 'CAD' check (reporting_currency = 'CAD'),
  timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.invoice_inboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email_alias text not null unique check (email_alias = lower(email_alias)),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index invoice_inboxes_org_idx on public.invoice_inboxes (organization_id);

create table public.invoice_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('resend', 'manual_upload')),
  external_event_id text not null,
  message_id text,
  attachment_id text,
  status text not null default 'received' check (status in ('received', 'queued', 'processed', 'duplicate', 'rejected', 'failed')),
  detail text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  -- Repeated deliveries of the same provider event/attachment can never create a second row.
  unique (provider, external_event_id, attachment_id)
);
create index ingestion_events_org_idx on public.invoice_ingestion_events (organization_id, created_at desc);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source text not null check (source in ('resend', 'manual_upload')),
  original_filename text not null,
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  provider_message_id text,
  provider_attachment_id text,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'needs_review', 'duplicate', 'failed')),
  supplier_name text,
  normalized_supplier_name text,
  invoice_number text,
  invoice_date date,
  due_date date,
  category text check (category in ('Inventory','Packaging','Utilities','Equipment','Rent','Marketing','Professional Services','Other')),
  currency text,
  subtotal_cents bigint check (subtotal_cents is null or subtotal_cents >= 0),
  tax_cents bigint check (tax_cents is null or tax_cents >= 0),
  total_cents bigint check (total_cents is null or total_cents >= 0),
  validation_results jsonb not null default '[]'::jsonb,
  extraction_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Exact-duplicate guard: one non-duplicate record per document hash per organization.
create unique index invoices_org_sha_unique on public.invoices (organization_id, sha256) where status <> 'duplicate';
create unique index invoices_provider_attachment_unique
  on public.invoices (organization_id, provider_message_id, provider_attachment_id)
  where provider_message_id is not null and provider_attachment_id is not null and status <> 'duplicate';
create index invoices_org_date_idx on public.invoices (organization_id, invoice_date desc);
create index invoices_org_status_idx on public.invoices (organization_id, status, created_at desc);
create index invoices_org_supplier_idx on public.invoices (organization_id, normalized_supplier_name, invoice_date);

create table public.invoice_audit_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor text not null,
  action text not null,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_invoice_idx on public.invoice_audit_events (invoice_id, created_at desc);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text not null,
  evidence jsonb not null default '{}'::jsonb,
  related_invoice_ids uuid[] not null default '{}',
  reporting_period text,
  stable_key text not null,
  computed_at timestamptz not null default now(),
  unique (organization_id, stable_key)
);
create index insights_org_idx on public.insights (organization_id, computed_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- Creates a workspace, owner membership and an unguessable inbox alias in one transaction.
create or replace function public.create_organization(org_name text, org_timezone text default 'America/Toronto')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_org uuid;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.organization_members where user_id = uid) then
    raise exception 'workspace already exists';
  end if;
  insert into public.organizations (name, timezone) values (trim(org_name), org_timezone) returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role) values (new_org, uid, 'owner');
  insert into public.invoice_inboxes (organization_id, email_alias)
    values (new_org, 'inv-' || encode(gen_random_bytes(8), 'hex'));
  return new_org;
end $$;

-- Grouped, counted-invoice totals for the dashboard and insight engine.
-- "Counted" = status processed (valid or human-approved) in the reporting currency.
create or replace function public.expense_aggregates(org uuid, since date)
returns table (month text, category text, supplier text, normalized_supplier text, total_cents bigint, invoice_count bigint)
language sql stable security invoker set search_path = public as $$
  select to_char(invoice_date, 'YYYY-MM'),
         coalesce(category, 'Other'),
         min(supplier_name),
         coalesce(normalized_supplier_name, ''),
         sum(total_cents)::bigint,
         count(*)::bigint
  from public.invoices
  where organization_id = org
    and status = 'processed'
    and currency = 'CAD'
    and invoice_date >= since
    and total_cents is not null
  group by 1, 2, 4;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invoice_inboxes enable row level security;
alter table public.invoice_ingestion_events enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_audit_events enable row level security;
alter table public.insights enable row level security;

create policy org_select on public.organizations for select using (public.is_org_member(id));
create policy org_update on public.organizations for update using (public.is_org_member(id)) with check (public.is_org_member(id));

create policy members_select on public.organization_members for select using (user_id = auth.uid());

create policy inbox_select on public.invoice_inboxes for select using (public.is_org_member(organization_id));
create policy inbox_update on public.invoice_inboxes for update
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy ingestion_select on public.invoice_ingestion_events for select using (public.is_org_member(organization_id));
create policy invoices_select on public.invoices for select using (public.is_org_member(organization_id));
create policy audit_select on public.invoice_audit_events for select using (public.is_org_member(organization_id));
create policy insights_select on public.insights for select using (public.is_org_member(organization_id));

-- Writes to invoices, audit events, insights and ingestion events happen only through the server
-- (service role, after explicit membership checks). No insert/update/delete policies are granted
-- to authenticated users on those tables, so clients cannot forge financial records.

revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.invoices, public.invoice_audit_events, public.insights,
  public.invoice_ingestion_events, public.organization_members from authenticated;
revoke execute on function public.create_organization(text, text) from anon, public;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.expense_aggregates(uuid, date) to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Objects live at "<organization_id>/<uuid>.pdf". Members may read their own folder only; uploads
-- go through the server with the service role, so no client write policies exist.
create policy invoices_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and public.is_org_member(((storage.foldername(name))[1])::uuid));
