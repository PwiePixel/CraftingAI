import { describe, expect, it } from "vitest";
import { legalLinks } from "@/lib/shared/legal-links";

describe("legalLinks", () => {
  it("lists the purchase terms only when something can be bought", () => {
    expect(legalLinks(false).map((link) => link.href)).toEqual([
      "/terms",
      "/privacy",
      "/acceptable-use",
      "/imprint",
    ]);
    expect(legalLinks(true).map((link) => link.href)).toContain("/subscription-terms");
  });
});
