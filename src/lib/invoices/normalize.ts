const SUFFIXES =
  /\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|company|lp|llp|ulc)\b\.?/g;

/** Canonical supplier key used for grouping and duplicate matching. */
export function normalizeSupplierName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInvoiceNumber(num: string | null | undefined): string {
  return (num ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^0+/, "");
}

/** Strict YYYY-MM-DD that is also a real calendar date. */
export function parseIsoDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return value;
}
