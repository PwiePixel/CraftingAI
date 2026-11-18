import "server-only";

interface Bucket {
  count: number;
  resetAt: number;
}

const store = globalThis as unknown as {
  __craftingRate?: Map<string, Bucket>;
  __craftingRateSweep?: number;
};

function buckets(): Map<string, Bucket> {
  store.__craftingRate ??= new Map();
  return store.__craftingRate;
}

function sweep(now: number): void {
  if (store.__craftingRateSweep && now - store.__craftingRateSweep < 60_000) return;
  store.__craftingRateSweep = now;
  const map = buckets();
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

/**
 * Fixed-window rate limiter held in process memory. The application runs as a
 * single process, so no shared store is needed.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const map = buckets();
  let bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    map.set(key, bucket);
  }
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count >= limit) return { ok: false, remaining: 0, retryAfter };
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfter };
}

export function resetRateLimits(): void {
  buckets().clear();
}
