import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Liveness probe used by the installer and by monitoring. Reveals nothing sensitive. */
export function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
