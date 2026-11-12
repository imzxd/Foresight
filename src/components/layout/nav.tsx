"use client";

import { FileText, LayoutDashboard, Lightbulb, Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active
                ? "bg-accent-soft text-accent-strong"
                : "text-muted hover:bg-info-soft hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ logo, footer }: { logo: ReactNode; footer: ReactNode }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
      <div className="mb-6 px-1">{logo}</div>
      <NavLinks />
      <div className="mt-auto pt-6">{footer}</div>
    </aside>
  );
}

export function MobileNav({ logo, footer }: { logo: ReactNode; footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        {logo}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg p-2 text-muted hover:bg-info-soft cursor-pointer"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="border-b border-line bg-surface px-4 py-3">
          <NavLinks onNavigate={() => setOpen(false)} />
          <div className="mt-4">{footer}</div>
        </div>
      )}
    </div>
  );
}
