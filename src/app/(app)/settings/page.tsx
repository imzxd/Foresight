import type { Metadata } from "next";
import { CopyButton } from "@/components/layout/copy-button";
import { SettingsForm } from "@/components/layout/settings-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { requireContext } from "@/lib/auth/session";
import { getSettingsData } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireContext();
  const s = await getSettingsData(ctx);
  const demo = ctx.mode === "demo";
  const last = s.recent[0];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader title="Business" />
        <div className="max-w-md p-5">
          <SettingsForm name={ctx.org.name} timezone={ctx.org.timezone} disabled={demo} />
          {demo && <p className="mt-3 text-xs text-muted">Editing is disabled in Demo Mode.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Invoice inbox"
          description="Send or forward supplier PDF invoices to this private address."
        />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <code
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm break-all"
              data-testid="inbox-address"
            >
              {s.address}
            </code>
            <CopyButton value={s.address} disabled={!s.address || demo} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Email connection:</span>
            {demo ? (
              <Badge tone="warn">Demo — not connected</Badge>
            ) : s.configured ? (
              <Badge tone="good">Configured</Badge>
            ) : (
              <Badge tone="warn">Not configured</Badge>
            )}
            {last && (
              <span className="text-xs text-muted">
                Last email event: {last.status} ·{" "}
                {new Date(last.created_at).toLocaleString("en-CA")}
              </span>
            )}
          </div>
          {demo && (
            <p className="text-xs text-muted">
              This is a placeholder address for the fictional demo; it does not receive email.
            </p>
          )}
          {!demo && !s.configured && (
            <p className="text-xs text-muted">
              Inbound email needs RESEND_API_KEY, RESEND_WEBHOOK_SECRET and INBOUND_EMAIL_DOMAIN.
              See docs/setup.md.
            </p>
          )}
          <div className="text-sm">
            <p className="font-medium">How to use it</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
              <li>Ask suppliers to send invoices to the address above.</li>
              <li>Forward existing invoice emails (PDF attached) to it.</li>
              <li>
                Or set up an automatic forwarding rule in your email provider for messages from
                suppliers.
              </li>
              <li>
                Processed invoices appear under Invoices; anything uncertain waits for your review.
              </li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
