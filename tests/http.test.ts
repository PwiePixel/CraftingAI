import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, assertSameOrigin, clientIp, readJson } from "@/lib/server/http";

const post = (headers: Record<string, string>, body?: string) =>
  new Request("https://chat.example.com/api/test", { method: "POST", headers, body });

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError");
}

describe("same-origin check", () => {
  it("accepts requests from the site itself", () => {
    expect(() => assertSameOrigin(post({ origin: "https://chat.example.com" }))).not.toThrow();
  });

  it("rejects other origins, including look-alikes", () => {
    for (const origin of ["https://evil.example", "http://chat.example.com", "https://chat.example.com.evil.example", "null"]) {
      expect(() => assertSameOrigin(post({ origin }))).toThrow(ApiError);
    }
  });

  it("rejects cross-site requests that carry no Origin header", () => {
    expect(() => assertSameOrigin(post({ "sec-fetch-site": "cross-site" }))).toThrow(ApiError);
    expect(() => assertSameOrigin(post({ "sec-fetch-site": "same-site" }))).toThrow(ApiError);
    expect(() => assertSameOrigin(post({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
});

describe("client address", () => {
  it("trusts only the entry appended by the reverse proxy", () => {
    expect(clientIp(post({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(post({}))).toBeNull();
  });
});

describe("readJson", () => {
  const schema = z.object({ name: z.string().min(1) });
  const json = { "content-type": "application/json" };

  it("parses and validates a JSON body", async () => {
    expect(await readJson(post(json, '{"name":"Ada"}'), schema)).toEqual({ name: "Ada" });
  });

  it("requires a JSON content type", async () => {
    const error = await rejection(readJson(post({ "content-type": "text/plain" }, '{"name":"Ada"}'), schema));
    expect(error.status).toBe(415);
  });

  it("rejects malformed and invalid bodies", async () => {
    expect((await rejection(readJson(post(json, "{nope"), schema))).code).toBe("invalid_json");
    expect((await rejection(readJson(post(json, '{"name":""}'), schema))).code).toBe("invalid_request");
  });

  it("enforces the size limit", async () => {
    const body = JSON.stringify({ name: "x".repeat(5000) });
    expect((await rejection(readJson(post(json, body), schema, 1000))).status).toBe(413);
  });
});
