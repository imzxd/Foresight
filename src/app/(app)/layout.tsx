import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import { Logo } from "@/components/layout/logo";
import { MobileNav, Sidebar } from "@/components/layout/nav";
import { requireContext } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireContext();
  const footer = (
    <div className="space-y-3">
      <div className="px-1">
        <p className="truncate text-sm font-medium">{ctx.org.name}</p>
        <p className="truncate text-xs text-muted">
          {ctx.mode === "live" ? ctx.email : "Demo workspace"}
        </p>
      </div>
      {ctx.mode === "live" && (
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-info-soft hover:text-ink cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      )}
    </div>
  );
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar logo={<Logo />} footer={footer} />
      <MobileNav logo={<Logo />} footer={footer} />
      <div className="flex min-w-0 flex-1 flex-col">
        {ctx.mode === "demo" && (
          <div
            role="status"
            className="border-b border-warn/20 bg-warn-soft px-4 py-2 text-center text-xs text-warn sm:text-sm"
          >
            <strong>Demo Mode</strong> — all businesses and figures are fictional. Supabase is not
            configured, so uploads and edits are disabled.
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          Operational invoice intelligence, not accounting or financial advice.
        </footer>
      </div>
    </div>
  );
}
