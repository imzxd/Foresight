import type { ReactNode } from "react";
import { Logo } from "./logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-4 text-sm text-muted">{footer}</div>}
      <p className="mt-8 text-xs text-muted">
        Operational invoice intelligence, not accounting or financial advice.
      </p>
    </div>
  );
}
