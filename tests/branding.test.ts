import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Everything a visitor or signed-in user can see; the admin area is excluded. */
const PUBLIC_SOURCES = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/not-found.tsx",
  "src/app/error.tsx",
  "src/app/(auth)",
  "src/app/(app)",
  "src/app/(legal)",
  "src/components/app",
  "src/components/auth",
  "src/components/chat",
  "src/components/legal",
  "src/components/settings",
  "src/lib/server/prompt.ts",
];

function collect(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target).flatMap((entry) => collect(path.join(target, entry)));
}

describe("white-label", () => {
  const files = PUBLIC_SOURCES.flatMap((entry) => collect(path.resolve(entry)));

  it("covers the public pages", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never names the model vendor or its models in anything users can see", () => {
    const offenders = files.filter((file) =>
      /anthropic|claude|haiku|sonnet|opus/i.test(fs.readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("still tells users truthfully that third-party providers process their messages", () => {
    const privacy = fs.readFileSync(path.resolve("src/app/(legal)/privacy/page.tsx"), "utf8");
    const terms = fs.readFileSync(path.resolve("src/app/(legal)/terms/page.tsx"), "utf8");
    expect(privacy).toMatch(/AI model providers/);
    expect(privacy).toMatch(/transmitted to the provider/);
    expect(terms).toMatch(/third-party providers/);
  });
});
