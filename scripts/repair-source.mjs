#!/usr/bin/env node
/**
 * Makes an older or customised copy of src/lib/shared/settings-schema.ts
 * compatible with the rest of the code before a build.
 *
 * The pages and the admin dashboard expect certain settings to exist. If the
 * schema file was kept from an earlier version (for example after merging
 * this project into a customised copy), those settings are missing and the
 * build stops with "Property '…' does not exist". This script adds whatever
 * is missing, with its default value, and leaves everything else untouched.
 * It is safe to run any number of times.
 *
 *   node scripts/repair-source.mjs [project directory]
 *
 * install.sh runs it on the copy that is about to be built, never on your
 * own checkout.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Settings the rest of the code relies on: name, schema line, default line. */
const REQUIRED_SETTINGS = [
  ["modelHosting", "z.enum(MODEL_HOSTING)", '"third-party"'],
  ["baseModelSources", "z.string().trim().max(120)", '"Meta and OpenAI"'],
  ["inDevelopment", "z.boolean()", "true"],
  ["maxDailyRegistrations", "z.number().int().min(0).max(1_000_000)", "100"],
];

const HOSTING_DECLARATION = `export const MODEL_HOSTING = ["third-party", "self-hosted"] as const;
export type ModelHosting = (typeof MODEL_HOSTING)[number];

`;

/**
 * Returns the body of the object literal that follows `anchor` (the text
 * between its braces) together with the position right after the opening
 * brace, or null when the anchor is not present.
 */
function objectAfter(source, anchor) {
  const match = anchor.exec(source);
  if (!match) return null;
  const open = match.index + match[0].length; // just behind the "{"
  let depth = 1;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return { open, body: source.slice(open, index) };
    }
  }
  return null;
}

/** Only keys of the object itself count, not keys of nested objects. */
function hasTopLevelKey(body, name) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{" || char === "(" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === ")" || char === "]") {
      depth -= 1;
    } else if (depth === 0 && body.startsWith(name, index) && /^\s*:/.test(body.slice(index + name.length))) {
      const before = index === 0 ? " " : body[index - 1];
      if (!/[\w$]/.test(before)) return true;
    }
  }
  return false;
}

function insertAfterOpening(source, anchor, lines) {
  const target = objectAfter(source, anchor);
  if (!target || lines.length === 0) return source;
  const addition = `\n${lines.map((line) => `  ${line}`).join("\n")}`;
  return source.slice(0, target.open) + addition + source.slice(target.open);
}

const SCHEMA_ANCHOR = /export\s+const\s+settingsSchema\s*=\s*z\s*\.\s*object\s*\(\s*\{/;
const DEFAULTS_ANCHOR = /export\s+const\s+DEFAULT_SETTINGS\b[^=]*=\s*\{/;

/**
 * Adds the missing settings to the text of a settings-schema.ts file.
 * Returns the new text and the names that were added; `problem` is set when
 * the file does not look like a settings schema at all.
 */
export function repairSettingsSchema(source) {
  const schema = objectAfter(source, SCHEMA_ANCHOR);
  const defaults = objectAfter(source, DEFAULTS_ANCHOR);
  if (!schema || !defaults) {
    return { source, added: [], problem: "settingsSchema or DEFAULT_SETTINGS was not found" };
  }

  const added = new Set();
  const schemaLines = [];
  const defaultLines = [];
  for (const [name, schemaValue, defaultValue] of REQUIRED_SETTINGS) {
    if (!hasTopLevelKey(schema.body, name)) {
      schemaLines.push(`${name}: ${schemaValue},`);
      added.add(name);
    }
    if (!hasTopLevelKey(defaults.body, name)) {
      defaultLines.push(`${name}: ${defaultValue},`);
      added.add(name);
    }
  }

  // Defaults first: it sits further down, so earlier positions stay valid.
  let result = insertAfterOpening(source, DEFAULTS_ANCHOR, defaultLines);
  result = insertAfterOpening(result, SCHEMA_ANCHOR, schemaLines);

  const usesHosting = /\bMODEL_HOSTING\b/.test(result);
  if (usesHosting && !/export\s+const\s+MODEL_HOSTING\b/.test(result)) {
    const anchor = SCHEMA_ANCHOR.exec(result);
    result = result.slice(0, anchor.index) + HOSTING_DECLARATION + result.slice(anchor.index);
    added.add("ModelHosting");
  } else if (!/export\s+type\s+ModelHosting\b/.test(result) && usesHosting) {
    const anchor = SCHEMA_ANCHOR.exec(result);
    result =
      result.slice(0, anchor.index) +
      "export type ModelHosting = (typeof MODEL_HOSTING)[number];\n\n" +
      result.slice(anchor.index);
    added.add("ModelHosting");
  }

  return { source: result, added: [...added] };
}

function main() {
  const root = path.resolve(process.argv[2] ?? ".");
  const file = path.join(root, "src/lib/shared/settings-schema.ts");
  if (!fs.existsSync(file)) {
    console.log(`repair-source: ${file} not found, nothing to do.`);
    return;
  }
  const original = fs.readFileSync(file, "utf8");
  const { source, added, problem } = repairSettingsSchema(original);
  if (problem) {
    console.log(`repair-source: left unchanged (${problem}).`);
    return;
  }
  if (added.length === 0) {
    console.log("repair-source: settings schema is complete.");
    return;
  }
  fs.writeFileSync(file, source);
  console.log(`repair-source: added missing settings: ${added.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
