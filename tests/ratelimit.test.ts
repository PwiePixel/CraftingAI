import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/server/ratelimit";

afterEach(() => {
  vi.useRealTimers();
  resetRateLimits();
});

describe("rateLimit", () => {
  it("allows up to the limit and then blocks", () => {
    for (let i = 0; i < 3; i += 1) expect(rateLimit("key", 3, 1000).ok).toBe(true);
    const blocked = rateLimit("key", 3, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("keeps separate counters per key", () => {
    expect(rateLimit("a", 1, 1000).ok).toBe(true);
    expect(rateLimit("a", 1, 1000).ok).toBe(false);
    expect(rateLimit("b", 1, 1000).ok).toBe(true);
  });

  it("resets after the window", () => {
    vi.useFakeTimers();
    expect(rateLimit("key", 1, 1000).ok).toBe(true);
    expect(rateLimit("key", 1, 1000).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit("key", 1, 1000).ok).toBe(true);
  });
});
