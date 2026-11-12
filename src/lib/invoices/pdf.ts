export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_PAGES = 20;

export type RejectCode = "EMPTY" | "TOO_LARGE" | "NOT_PDF" | "TOO_MANY_PAGES" | "UNREADABLE";

export class DocumentRejectedError extends Error {
  constructor(
    public readonly code: RejectCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentRejectedError";
  }
}

/** Cheap, dependency-free checks run before any parsing: size and `%PDF-` signature. */
export function assertPdfBasics(bytes: Uint8Array, maxBytes = DEFAULT_MAX_BYTES): void {
  if (bytes.byteLength === 0) throw new DocumentRejectedError("EMPTY", "The file is empty.");
  if (bytes.byteLength > maxBytes)
    throw new DocumentRejectedError(
      "TOO_LARGE",
      `File exceeds the ${Math.round(maxBytes / 1048576)} MB limit.`,
    );
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-"))
    throw new DocumentRejectedError("NOT_PDF", "The file is not a valid PDF.");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
