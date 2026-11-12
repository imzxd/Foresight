"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Secondary fallback path (testing, odd documents). Uses the same pipeline as email ingestion. */
export function UploadButton({
  disabled,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast.error("Please choose a PDF file.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/invoices/upload", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        outcome?: string;
        processing?: string;
      };
      if (!res.ok) toast.error(json.error ?? "Upload failed.");
      else if (json.outcome === "created")
        toast.success(
          json.processing === "queued"
            ? "Uploaded. Processing has started."
            : "Uploaded and processed.",
        );
      else toast.info(json.message ?? "Already recorded.");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Upload invoice PDF"
        data-testid="upload-input"
        tabIndex={-1}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button
        variant="outline"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        title={disabled ? disabledReason : undefined}
      >
        <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload PDF"}
      </Button>
      {disabled && disabledReason && <p className="mt-1 text-xs text-muted">{disabledReason}</p>}
    </div>
  );
}
