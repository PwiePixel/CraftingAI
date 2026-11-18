import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/server/prompt";
import { DEFAULT_SETTINGS } from "@/lib/shared/settings-schema";
import { normalizeMath } from "@/lib/shared/math";

describe("system prompt", () => {
  const settings = { ...DEFAULT_SETTINGS, siteName: "Acme Chat", assistantName: "Ace" };

  it("introduces the assistant under the site's own names", () => {
    const prompt = buildSystemPrompt(settings, settings.tiers.pro, "2026-11-18");
    expect(prompt).toContain("You are Ace, the AI assistant of Acme Chat");
    expect(prompt).toContain(settings.tiers.pro.label);
    expect(prompt).toContain("2026-11-18");
    expect(prompt).toContain("never claim to be human");
  });

  it("does not leak the upstream model or vendor", () => {
    for (const tier of Object.values(settings.tiers)) {
      const prompt = buildSystemPrompt(settings, tier, "2026-11-18");
      expect(prompt).not.toMatch(/anthropic|claude|haiku|sonnet|opus/i);
      expect(prompt).not.toContain(tier.model);
    }
  });

  it("is identical for identical input, so the cached prefix can be reused", () => {
    const first = buildSystemPrompt(settings, settings.tiers.lite, "2026-11-18");
    const second = buildSystemPrompt(settings, settings.tiers.lite, "2026-11-18");
    expect(first).toBe(second);
  });

  it("stays neutral about the underlying models when they are self-hosted", () => {
    const prompt = buildSystemPrompt(
      { ...settings, modelHosting: "self-hosted" },
      settings.tiers.lite,
      "2026-11-18",
    );
    expect(prompt).toContain("You are Ace, the AI assistant of Acme Chat");
    expect(prompt).not.toMatch(/third-party/);
    expect(prompt).toMatch(/Do not state or guess which underlying model you are/);
    expect(prompt).toContain("never claim to be human");
  });

  it("appends the operator's custom instructions", () => {
    const prompt = buildSystemPrompt({ ...settings, customInstructions: "Always be brief." }, settings.tiers.lite, "2026-11-18");
    expect(prompt).toContain("Always be brief.");
  });
});

describe("normalizeMath", () => {
  it("converts LaTeX bracket delimiters", () => {
    expect(normalizeMath("Euler: \\(e^{i\\pi} = -1\\).")).toBe("Euler: $$e^{i\\pi} = -1$$.");
    expect(normalizeMath("\\[x^2\\]")).toContain("$$\nx^2\n$$");
  });

  it("leaves code untouched", () => {
    const fenced = "```js\nconst re = /\\(a\\)/;\n```";
    expect(normalizeMath(fenced)).toBe(fenced);
    expect(normalizeMath("use `\\(x\\)` here")).toBe("use `\\(x\\)` here");
  });
});
