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
  ["billing", "billingSettingsSchema", "DEFAULT_BILLING"],
];

const BILLING_IMPORT = 'import { billingSettingsSchema, DEFAULT_BILLING } from "./billing-schema";\n';

const HOSTING_DECLARATION = `export const MODEL_HOSTING = ["third-party", "self-hosted"] as const;
export type ModelHosting = (typeof MODEL_HOSTING)[number];

`;

/**
 * Returns a copy of the source in which comments and the contents of string
 * literals are blanked out. Every character keeps its position, so braces and
 * keys can be located without being fooled by text such as "provider's API".
 */
function mask(source) {
  const out = source.split("");
  let index = 0;
  const blank = (from, to) => {
    for (let position = from; position < to; position += 1) {
      if (out[position] !== "\n") out[position] = " ";
    }
  };
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      blank(index, stop);
      index = stop;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(index, stop);
      index = stop;
    } else if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < source.length && source[end] !== char) end += source[end] === "\\" ? 2 : 1;
      blank(index + 1, Math.min(end, source.length));
      index = end + 1;
    } else {
      index += 1;
    }
  }
  return out.join("");
}

/**
 * Returns the body of the object literal that follows `anchor` (the text
 * between its braces, with comments and strings blanked out) together with
 * the position right after the opening brace, or null when it is not there.
 */
function objectAfter(source, anchor) {
  const masked = mask(source);
  const match = anchor.exec(masked);
  if (!match) return null;
  const open = match.index + match[0].length; // just behind the "{"
  let depth = 1;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === "{") depth += 1;
    else if (masked[index] === "}") {
      depth -= 1;
      if (depth === 0) return { open, body: masked.slice(open, index) };
    }
  }
  return null;
}

/** Only keys of the object itself count, not keys of nested objects. */
function hasTopLevelKey(body, name) {
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "{" || char === "(" || char === "[") depth += 1;
    else if (char === "}" || char === ")" || char === "]") depth -= 1;
    else if (depth === 0 && body.startsWith(name, index) && /^\s*:/.test(body.slice(index + name.length))) {
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

  // The billing settings live in their own file and have to be imported.
  if (/\bbillingSettingsSchema\b/.test(result) && !/from\s+"\.\/billing-schema"/.test(result)) {
    const firstImport = /^import\s/m.exec(result);
    const position = firstImport ? firstImport.index : 0;
    result = result.slice(0, position) + BILLING_IMPORT + result.slice(position);
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
