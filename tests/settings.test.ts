import { describe, expect, it } from "vitest";
import { deepMerge, getSettings, publicSite, updateSettings } from "@/lib/server/settings";
import { DEFAULT_SETTINGS } from "@/lib/shared/settings-schema";

describe("settings", () => {
  it("starts from the defaults", () => {
    expect(getSettings().tiers.lite.model).toBe(DEFAULT_SETTINGS.tiers.lite.model);
    expect(getSettings().defaultTier).toBe("lite");
  });

  it("describes the stock set-up truthfully: models run at an external provider", () => {
    // The public pages only claim self-hosted models once the operator says so.
    expect(DEFAULT_SETTINGS.modelHosting).toBe("third-party");
    expect(getSettings().modelHosting).toBe("third-party");
    expect(() => updateSettings({ modelHosting: "somewhere" })).toThrow();
  });

  it("merges partial updates and keeps everything else", () => {
    const next = updateSettings({ siteName: "Acme Chat", tiers: { pro: { dailyLimit: 25 } } });
    expect(next.siteName).toBe("Acme Chat");
    expect(next.tiers.pro.dailyLimit).toBe(25);
    expect(next.tiers.pro.model).toBe(DEFAULT_SETTINGS.tiers.pro.model);
    expect(getSettings().tiers.pro.dailyLimit).toBe(25);
  });

  it("rejects invalid values", () => {
    expect(() => updateSettings({ tiers: { lite: { dailyLimit: -1 } } })).toThrow();
    expect(() => updateSettings({ tiers: { lite: { model: "bad model; drop" } } })).toThrow();
    expect(() => updateSettings({ legal: { contactEmail: "not-an-email" } })).toThrow();
    expect(() => updateSettings({ defaultTier: "mega" })).toThrow();
  });

  it("is not vulnerable to prototype pollution", () => {
    const merged = deepMerge({ a: { b: 1 } }, JSON.parse('{"__proto__": {"polluted": true}, "a": {"b": 2}}'));
    expect(merged.a.b).toBe(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("never exposes upstream model identifiers publicly", () => {
    const serialised = JSON.stringify(publicSite());
    for (const tier of Object.values(getSettings().tiers)) {
      expect(serialised).not.toContain(tier.model);
    }
  });
});
