import { cn } from "@/lib/shared/cn";
import type { SessionUser } from "@/lib/shared/types";

/** The user's profile picture, or their initial when they have not set one. */
export function Avatar({
  user,
  size = 32,
  className,
}: {
  user: Pick<SessionUser, "name" | "email" | "avatarVersion">;
  size?: number;
  className?: string;
}) {
  const name = user.name || user.email.split("@")[0] || "?";
  if (user.avatarVersion) {
    return (
      // A small image served by our own API; nothing for the image optimiser to do.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/me/avatar?v=${user.avatarVersion}`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("flex-none rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "flex flex-none items-center justify-center rounded-full bg-accent-soft font-semibold text-accent",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
