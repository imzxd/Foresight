import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies the real migration to an in-process Postgres (PGlite) with minimal stand-ins for
 * Supabase's `auth` and `storage` schemas, then verifies Row Level Security from a user's viewpoint.
 */
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let orgA: string;
let orgB: string;
let invoiceA: string;
let invoiceB: string;

const asUser = async (uid: string | null) => {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`,
  );
};
const asAdmin = () => db.exec("reset role;");

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant select on storage.objects to authenticated;
  `);
  await db.exec(
    readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260101000000_init.sql"),
      "utf8",
    ),
  );
  // Mirror Supabase's default grants so RLS (not missing grants) is what is being tested.
  await db.exec(`
    grant all on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    revoke insert, update, delete on public.invoices, public.invoice_audit_events, public.insights,
      public.invoice_ingestion_events, public.organization_members from authenticated;
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
  `);

  await asUser(USER_A);
  orgA = (await db.query<{ id: string }>("select public.create_organization('Org A') as id"))
    .rows[0]!.id;
  await asUser(USER_B);
  orgB = (await db.query<{ id: string }>("select public.create_organization('Org B') as id"))
    .rows[0]!.id;

  await asAdmin();
  const sha = (c: string) => c.repeat(64);
  invoiceA = (
    await db.query<{
      id: string;
    }>(`insert into invoices (organization_id, source, original_filename, storage_path, sha256, status, supplier_name, currency, total_cents, invoice_date, category)
    values ('${orgA}', 'manual_upload', 'a.pdf', '${orgA}/a.pdf', '${sha("a")}', 'processed', 'A Supplier', 'CAD', 10000, '2026-05-01', 'Inventory') returning id`)
  ).rows[0]!.id;
  invoiceB = (
    await db.query<{
      id: string;
    }>(`insert into invoices (organization_id, source, original_filename, storage_path, sha256, status, supplier_name, currency, total_cents, invoice_date, category)
    values ('${orgB}', 'manual_upload', 'b.pdf', '${orgB}/b.pdf', '${sha("b")}', 'processed', 'B Supplier', 'CAD', 99900, '2026-05-02', 'Rent') returning id`)
  ).rows[0]!.id;
  await db.exec(`
    insert into insights (organization_id, kind, severity, title, body, stable_key) values ('${orgB}', 'x', 'info', 'B only', 'b', 'k1');
    insert into storage.objects (bucket_id, name) values ('invoices', '${orgA}/a.pdf'), ('invoices', '${orgB}/b.pdf');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("Row Level Security", () => {
  it("each user sees only their own organization", async () => {
    await asUser(USER_A);
    const orgs = (await db.query<{ id: string }>("select id from organizations")).rows.map(
      (r) => r.id,
    );
    expect(orgs).toEqual([orgA]);
  });

  it("users cannot read another organization's invoices, insights or inbox", async () => {
    await asUser(USER_A);
    const ids = (await db.query<{ id: string }>("select id from invoices")).rows.map((r) => r.id);
    expect(ids).toEqual([invoiceA]);
    expect((await db.query(`select 1 from invoices where id = '${invoiceB}'`)).rows).toHaveLength(
      0,
    );
    expect((await db.query("select 1 from insights")).rows).toHaveLength(0);
    const inboxes = (
      await db.query<{ organization_id: string }>("select organization_id from invoice_inboxes")
    ).rows;
    expect(inboxes.map((i) => i.organization_id)).toEqual([orgA]);
  });

  it("users cannot forge or modify financial records", async () => {
    await asUser(USER_A);
    await expect(
      db.exec(`update invoices set total_cents = 1 where id = '${invoiceA}'`),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into invoices (organization_id, source, original_filename, storage_path, sha256) values ('${orgA}', 'manual_upload', 'x', 'x', '${"c".repeat(64)}')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(`insert into organization_members values ('${orgB}', '${USER_A}', 'owner')`),
    ).rejects.toThrow();
  });

  it("users cannot edit another organization's settings", async () => {
    await asUser(USER_A);
    await db.exec(`update organizations set name = 'hacked' where id = '${orgB}'`);
    await asAdmin();
    expect(
      (await db.query<{ name: string }>(`select name from organizations where id = '${orgB}'`))
        .rows[0]!.name,
    ).toBe("Org B");
  });

  it("aggregates only include the caller's organization", async () => {
    await asUser(USER_A);
    const rows = (
      await db.query<{ total_cents: string }>(
        `select * from expense_aggregates('${orgB}', '2026-01-01')`,
      )
    ).rows;
    expect(rows).toHaveLength(0);
    const own = (
      await db.query<{ total_cents: string }>(
        `select * from expense_aggregates('${orgA}', '2026-01-01')`,
      )
    ).rows;
    expect(Number(own[0]!.total_cents)).toBe(10000);
  });

  it("storage objects are visible only within the user's organization folder", async () => {
    await asUser(USER_A);
    const names = (await db.query<{ name: string }>("select name from storage.objects")).rows.map(
      (r) => r.name,
    );
    expect(names).toEqual([`${orgA}/a.pdf`]);
  });

  it("anonymous users see nothing and cannot create workspaces", async () => {
    await asUser(null);
    await expect(db.query("select * from invoices")).rejects.toThrow();
    await expect(db.query("select public.create_organization('x')")).rejects.toThrow();
  });

  it("a user may only own one workspace and the inbox alias is unguessable", async () => {
    await asUser(USER_A);
    await expect(db.query("select public.create_organization('Second')")).rejects.toThrow(
      /already exists/,
    );
    const alias = (
      await db.query<{ email_alias: string }>("select email_alias from invoice_inboxes")
    ).rows[0]!.email_alias;
    expect(alias).toMatch(/^inv-[0-9a-f]{16}$/);
  });

  it("the database blocks duplicate document hashes per organization", async () => {
    await asAdmin();
    await expect(
      db.exec(
        `insert into invoices (organization_id, source, original_filename, storage_path, sha256, status) values ('${orgA}', 'manual_upload', 'dup.pdf', 'p', '${"a".repeat(64)}', 'received')`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `insert into invoices (organization_id, source, original_filename, storage_path, sha256, status) values ('${orgA}', 'manual_upload', 'dup.pdf', 'p', '${"a".repeat(64)}', 'duplicate')`,
    );
  });
});
