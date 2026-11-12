import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export function Kpi({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
  tone?: "warn";
}) {
  const body = (
    <Card className={cn("h-full p-4", href && "hover:border-accent/40")}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          "num mt-1.5 text-2xl font-semibold tracking-tight",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
