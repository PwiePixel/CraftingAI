import { cn } from "@/lib/shared/cn";

/**
 * The brand mark. The artwork lives in `public/logo.webp` (cut a little tighter
 * around the face so it stays recognisable at small sizes); the complete
 * picture is `public/logo-full.webp`. Replace these files and
 * `src/app/icon.png` / `apple-icon.png` to change the logo everywhere.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    // A small, pre-sized static file: the image optimiser would add nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.webp"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      // Fixed dimensions: without them the image would be stretched to the
      // full height of a row when it sits next to taller content.
      style={{ width: size, height: size }}
      className={cn("flex-none self-start rounded-[25%] object-cover", className)}
    />
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
