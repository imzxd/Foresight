export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#0f766e" />
        <path
          d="M8 7v14M8 14.5 17 7M11.5 12 18 21"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="leading-none">
        <span className="block text-[15px] font-semibold tracking-tight">Kime Foresight</span>
        <span className="mt-0.5 block text-[11px] text-muted">Invoice intelligence</span>
      </span>
    </span>
  );
}
