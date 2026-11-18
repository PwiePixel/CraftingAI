#!/usr/bin/env node
/**
 * Local stand-in for the AI provider, for development and automated tests.
 * It speaks just enough of the Messages API to exercise the chat pipeline
 * without an API key or any cost:
 *
 *   node scripts/mock-upstream.mjs            # listens on 127.0.0.1:4010
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=mock npm run dev
 *
 * Put one of these markers in a message to trigger a specific behaviour:
 *   [[refuse]]  the reply is declined      [[error]]  the provider returns HTTP 500
 *   [[slow]]    the reply streams slowly   [[long]]   the reply hits the length limit
 */
import http from "node:http";

const port = Number(process.env.MOCK_PORT ?? 4010);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function lastUserText(body) {
  const last = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content.map((block) => block.text ?? "").join(" ");
}

function replyFor(body) {
  const text = lastUserText(body);
  const turns = (body.messages ?? []).length;
  return [
    `**Mock reply** from \`${body.model}\` (turn ${turns}).`,
    "",
    `You said: ${text.slice(0, 200)}`,
    "",
    "- A list item",
    "- Another item with `inline code`",
    "",
    "```ts",
    "export const answer: number = 42;",
    "```",
    "",
    "| Column | Value |",
    "| --- | --- |",
    "| effort | " + (body.output_config?.effort ?? "default") + " |",
  ].join("\n");
}

const usage = (output) => ({
  input_tokens: 120,
  output_tokens: output,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
});

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "not found" } }));
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || "{}");
  const text = lastUserText(body);
  console.log(`[mock] ${body.model} stream=${Boolean(body.stream)} messages=${body.messages?.length}`);

  if (text.includes("[[error]]")) {
    res.writeHead(500, { "content-type": "application/json", "x-should-retry": "false" });
    res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "mock failure" } }));
    return;
  }

  const message = {
    id: `msg_mock_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: usage(0),
  };

  if (!body.stream) {
    const opening = /"""\n([\s\S]*?)\n"""/.exec(text)?.[1] ?? text;
    const title = `About ${opening.replace(/[^a-z0-9 ]/gi, "").trim().split(/\s+/).slice(0, 4).join(" ")}`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ...message,
        content: [{ type: "text", text: title }],
        stop_reason: "end_turn",
        usage: usage(8),
      }),
    );
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);

  emit("message_start", { message });
  if (text.includes("[[refuse]]")) {
    emit("message_delta", { delta: { stop_reason: "refusal", stop_sequence: null }, usage: { output_tokens: 0 } });
    emit("message_stop", {});
    res.end();
    return;
  }

  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  const reply = replyFor(body);
  const pieces = reply.match(/[\s\S]{1,12}/g) ?? [];
  const delay = text.includes("[[slow]]") ? 250 : 15;
  for (const piece of pieces) {
    if (res.destroyed) return;
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: piece } });
    await sleep(delay);
  }
  emit("content_block_stop", { index: 0 });
  emit("message_delta", {
    delta: { stop_reason: text.includes("[[long]]") ? "max_tokens" : "end_turn", stop_sequence: null },
    usage: { output_tokens: Math.ceil(reply.length / 4) },
  });
  emit("message_stop", {});
  res.end();
});

server.listen(port, "127.0.0.1", () => console.log(`[mock] upstream listening on http://127.0.0.1:${port}`));
