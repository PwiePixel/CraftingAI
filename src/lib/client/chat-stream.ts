import type { ChatStreamEvent } from "@/lib/shared/types";

/** Parses the server-sent event stream returned by the chat endpoint. */
export async function* readChatStream(response: Response): AsyncGenerator<ChatStreamEvent> {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data: ")) continue; // comment lines keep the connection alive
        try {
          yield JSON.parse(line.slice(6)) as ChatStreamEvent;
        } catch {
          // Ignore a malformed event rather than aborting the whole reply.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
