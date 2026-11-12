import { Webhook } from "svix";
import { beforeEach, describe, expect, it } from "vitest";
import { handleReceivedEmail, type EnqueueData } from "@/lib/email/handle-received";
import {
  aliasFromRecipients,
  InvalidSignatureError,
  verifyResendWebhook,
} from "@/lib/email/resend";

const SECRET = "whsec_" + Buffer.from("test-secret-test-secret-1234").toString("base64");

function signed(body: object, secret = SECRET) {
  const raw = JSON.stringify(body);
  const id = "msg_123";
  const ts = new Date();
  const signature = new Webhook(secret).sign(id, ts, raw);
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": String(Math.floor(ts.getTime() / 1000)),
    "svix-signature": signature,
  });
  return { raw, headers };
}

const event = (overrides: Record<string, unknown> = {}) => ({
  type: "email.received",
  data: {
    email_id: "email-1",
    message_id: "<abc@mail>",
    to: ["Invoices <inv-abc123@in.example.com>"],
    attachments: [
      { id: "att-1", filename: "invoice.pdf", content_type: "application/pdf" },
      { id: "att-2", filename: "logo.png", content_type: "image/png" },
    ],
    ...overrides,
  },
});

/** Tiny fake of the supabase-js calls handleReceivedEmail makes, with the real unique constraint. */
function fakeDb(inbox: { organization_id: string; enabled: boolean } | null) {
  const events: Record<string, unknown>[] = [];
  const keys = new Set<string>();
  const db = {
    from(table: string) {
      if (table === "invoice_inboxes")
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: inbox }) }) }) };
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const key = `${row.provider}|${row.external_event_id}|${row.attachment_id}`;
              if (keys.has(key)) return { data: null, error: { code: "23505" } };
              keys.add(key);
              const rec = { ...row, id: `ev-${events.length + 1}` };
              events.push(rec);
              return { data: rec, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) => {
            Object.assign(
              events.find((e) => e.id === id)!,
              patch,
            );
            return {};
          },
        }),
      };
    },
  };
  return { db: db as never, events };
}

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

describe("webhook signature verification", () => {
  it("accepts a correctly signed raw body", () => {
    const { raw, headers } = signed(event());
    expect(verifyResendWebhook(raw, headers)).toMatchObject({ type: "email.received" });
  });
  it("rejects forged signatures", () => {
    const { raw, headers } = signed(
      event(),
      "whsec_" + Buffer.from("another-secret-another-secret").toString("base64"),
    );
    expect(() => verifyResendWebhook(raw, headers)).toThrow(InvalidSignatureError);
  });
  it("rejects a tampered body", () => {
    const { raw, headers } = signed(event());
    expect(() => verifyResendWebhook(raw.replace("email-1", "email-9"), headers)).toThrow(
      InvalidSignatureError,
    );
  });
  it("rejects missing headers", () => {
    expect(() => verifyResendWebhook("{}", new Headers())).toThrow(InvalidSignatureError);
  });
});

describe("handleReceivedEmail", () => {
  const enqueued: EnqueueData[] = [];
  const mk = (inbox: { organization_id: string; enabled: boolean } | null) => {
    enqueued.length = 0;
    const f = fakeDb(inbox);
    return {
      ...f,
      deps: {
        db: f.db,
        enqueue: async (d: EnqueueData) => void enqueued.push(d),
        inboundDomain: "in.example.com",
      },
    };
  };

  it("queues one job per PDF attachment for the inbox's organization", async () => {
    const { deps, events } = mk({ organization_id: "org-1", enabled: true });
    const res = await handleReceivedEmail(deps, event(), "svix-1");
    expect(res.body).toEqual({ queued: 1, repeated: 0 });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      orgId: "org-1",
      emailId: "email-1",
      attachmentId: "att-1",
    });
    expect(events[0]).toMatchObject({ provider: "resend", status: "queued" });
  });

  it("ignores repeated delivery of the same event", async () => {
    const { deps } = mk({ organization_id: "org-1", enabled: true });
    await handleReceivedEmail(deps, event(), "svix-1");
    const again = await handleReceivedEmail(deps, event(), "svix-2");
    expect(again.body).toEqual({ queued: 0, repeated: 1 });
    expect(enqueued).toHaveLength(1);
  });

  it("acknowledges but ignores unknown or disabled inboxes", async () => {
    expect((await handleReceivedEmail(mk(null).deps, event(), "x")).body).toMatchObject({
      ignored: expect.any(String),
    });
    expect(
      (await handleReceivedEmail(mk({ organization_id: "o", enabled: false }).deps, event(), "x"))
        .body,
    ).toMatchObject({ ignored: expect.any(String) });
    expect(enqueued).toHaveLength(0);
  });

  it("ignores emails without PDFs and unsupported event types", async () => {
    const { deps } = mk({ organization_id: "org-1", enabled: true });
    const none = await handleReceivedEmail(
      deps,
      event({ attachments: [{ id: "a", filename: "x.docx", content_type: "application/msword" }] }),
      "x",
    );
    expect(none.body).toMatchObject({ ignored: "no PDF attachments" });
    const other = await handleReceivedEmail(deps, { type: "email.sent" }, "x");
    expect(other.status).toBe(200);
    expect(enqueued).toHaveLength(0);
  });

  it("only matches recipients on the configured inbound domain", () => {
    expect(
      aliasFromRecipients(["x@other.com", "Inv <INV-ABC@in.example.com>"], "in.example.com"),
    ).toBe("inv-abc");
    expect(aliasFromRecipients(["x@other.com"], "in.example.com")).toBeNull();
  });
});
