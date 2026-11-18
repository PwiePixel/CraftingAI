/**
 * Converts \( … \) and \[ … \] math delimiters to $$ … $$, leaving code spans
 * and fenced code blocks untouched.
 */
export function normalizeMath(text: string): string {
  if (!text.includes("\\(") && !text.includes("\\[")) return text;
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_match, body: string) => `\n$$\n${body.trim()}\n$$\n`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_match, body: string) => `$$${body.trim()}$$`),
    )
    .join("");
}
