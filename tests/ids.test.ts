import { describe, expect, it } from "vitest";
import { hashIp, ipRateKey, networkPrefix, newId, newToken } from "@/lib/server/ids";

describe("identifiers", () => {
  it("are long, URL-safe and unique", () => {
    expect(newId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 200 }, newToken)).size).toBe(200);
  });
});

describe("address handling", () => {
  it("never stores an address in clear text", () => {
    const hashed = hashIp("203.0.113.7");
    expect(hashed).toMatch(/^[0-9a-f]{24}$/);
    expect(hashed).not.toContain("203");
    expect(hashIp(null)).toBeNull();
  });

  it("uses IPv4 addresses as they are", () => {
    expect(networkPrefix("203.0.113.7")).toBe("203.0.113.7");
    expect(networkPrefix("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("groups IPv6 addresses by their /64 network", () => {
    const expected = "2001:db8:1:2::/64";
    expect(networkPrefix("2001:db8:1:2::1")).toBe(expected);
    expect(networkPrefix("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe(expected);
    expect(networkPrefix("2001:DB8:1:2:ffff::99")).toBe(expected);
    expect(networkPrefix("2001:db8:1:3::1")).not.toBe(expected);
    expect(networkPrefix("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(networkPrefix("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("gives every address in one network the same rate-limit key", () => {
    expect(ipRateKey("2001:db8:1:2::1")).toBe(ipRateKey("2001:db8:1:2:9999::5"));
    expect(ipRateKey("2001:db8:1:2::1")).not.toBe(ipRateKey("2001:db8:1:3::1"));
    expect(ipRateKey("203.0.113.7")).not.toBe(ipRateKey("203.0.113.8"));
    expect(ipRateKey(null)).toBe("unknown");
  });
});
