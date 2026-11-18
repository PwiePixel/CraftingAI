import { cn } from "@/lib/shared/cn";

/** The brand mark: a spark on a warm gradient tile. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a4d" />
          <stop offset="1" stopColor="#d9440a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-gradient)" />
      <path
        fill="#fff"
        d="M32 11c1.6 9.9 6.3 15.8 21 21-14.7 5.2-19.4 11.1-21 21-1.6-9.9-6.3-15.8-21-21 14.7-5.2 19.4-11.1 21-21z"
      />
    </svg>
  );
}

export function Logo({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[1.05rem] font-semibold tracking-tight">{name}</span>
    </span>
  );
}
