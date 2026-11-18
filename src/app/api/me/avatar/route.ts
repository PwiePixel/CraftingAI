import sharp from "sharp";
import { apiUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ApiError, json, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { updateUser } from "@/lib/server/users";

export const dynamic = "force-dynamic";

const MAX_BYTES = 3_000_000;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SIZE = 256;

/** The signed-in user's own profile picture. */
export const GET = route(async () => {
  const { user } = await apiUser();
  const row = getDb().prepare("SELECT data FROM avatars WHERE user_id = ?").get(user.id) as
    | { data: Buffer }
    | undefined;
  if (!row) throw new ApiError(404, "not_found", "No profile picture.");
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(row.data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

/**
 * Stores a new profile picture. Whatever is uploaded is decoded and written
 * again as a small WebP image, so no metadata and no unexpected file content
 * is ever kept or served.
 */
export const PUT = route(async (request) => {
  const { user } = await apiUser();
  const limit = rateLimit(`avatar:${user.id}`, 20, 60 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Too many uploads. Please try again later.", limit.retryAfter);
  }
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    throw new ApiError(415, "unsupported_media_type", "Please upload a PNG, JPEG or WebP image.");
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BYTES) {
    throw new ApiError(413, "payload_too_large", "The image is too large (maximum 3 MB).");
  }
  const input = Buffer.from(await request.arrayBuffer());
  if (input.length === 0 || input.length > MAX_BYTES) {
    throw new ApiError(413, "payload_too_large", "The image is too large (maximum 3 MB).");
  }

  let output: Buffer;
  try {
    output = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate() // apply the camera orientation, then drop all metadata
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    throw new ApiError(400, "invalid_image", "This file could not be read as an image.");
  }

  const version = Date.now();
  getDb()
    .prepare(
      `INSERT INTO avatars (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(user.id, output, version);
  updateUser(user.id, { avatar_version: version });
  return json({ avatarVersion: version });
});

export const DELETE = route(async () => {
  const { user } = await apiUser();
  getDb().prepare("DELETE FROM avatars WHERE user_id = ?").run(user.id);
  updateUser(user.id, { avatar_version: null });
  return json({ avatarVersion: null });
});
