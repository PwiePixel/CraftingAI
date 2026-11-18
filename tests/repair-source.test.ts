import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repairSettingsSchema } from "../scripts/repair-source.mjs";

const current = fs.readFileSync(path.resolve("src/lib/shared/settings-schema.ts"), "utf8");

/** The schema file as it looked before the model-hosting settings existed. */
function olderVersion(source: string): string {
  return source
    .replace(/\/\*\*\n \* Where the language models run[\s\S]*?export type ModelHosting[^\n]*\n\n/, "")
    .replace(/ {2}modelHosting: z\.enum\(MODEL_HOSTING\),\n/, "")
    .replace(/ {2}\/\*\* For self-hosted models[^\n]*\n {2}baseModelSources:[^\n]*\n/, "")
    .replace(/ {2}\/\/ The stock installation sends[^\n]*\n {2}modelHosting: "third-party",\n/, "")
    .replace(/ {2}baseModelSources: "Meta and OpenAI",\n/, "");
}

describe("repairSettingsSchema", () => {
  it("leaves a complete schema untouched", () => {
    const result = repairSettingsSchema(current);
    expect(result.added).toEqual([]);
    expect(result.source).toBe(current);
  });

  it("adds the settings an older schema file is missing", () => {
    const old = olderVersion(current);
    expect(old).not.toContain("modelHosting");
    expect(old).not.toContain("MODEL_HOSTING");

    const result = repairSettingsSchema(old);
    expect(result.added.sort()).toEqual(["ModelHosting", "baseModelSources", "modelHosting"]);
    expect(result.source).toContain('export const MODEL_HOSTING = ["third-party", "self-hosted"] as const;');
    expect(result.source).toContain("export type ModelHosting");
    expect(result.source).toMatch(/settingsSchema = z\.object\(\{\n {2}modelHosting: z\.enum\(MODEL_HOSTING\),/);
    expect(result.source).toMatch(/DEFAULT_SETTINGS: Settings = \{\n {2}modelHosting: "third-party",/);
    // Everything that was there before is still there.
    expect(result.source).toContain('siteName: "lishia.bond"');
    expect(result.source).toContain("maxDailyRegistrations: 100");
  });

  it("is safe to run repeatedly", () => {
    const once = repairSettingsSchema(olderVersion(current)).source;
    const twice = repairSettingsSchema(once);
    expect(twice.added).toEqual([]);
    expect(twice.source).toBe(once);
  });

  it("keeps customisations and ignores look-alike keys in nested objects", () => {
    const custom = olderVersion(current)
      .replace('label: "Lishia Lite"', 'label: "My Model", inDevelopment: false')
      .replace('siteName: "lishia.bond"', 'siteName: "Custom Name"');
    const result = repairSettingsSchema(custom);
    expect(result.source).toContain('siteName: "Custom Name"');
    expect(result.source).toContain('label: "My Model", inDevelopment: false');
    // The nested look-alike does not count as the real setting, which is still present once at the top level.
    expect(result.added).not.toContain("inDevelopment");
  });

  it("does nothing to a file that is not a settings schema", () => {
    const result = repairSettingsSchema("export const something = 1;\n");
    expect(result.problem).toBeTruthy();
    expect(result.source).toBe("export const something = 1;\n");
  });
});
