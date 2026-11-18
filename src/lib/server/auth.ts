import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { env } from "./env";
import { ApiError, clientIp } from "./http";
import {
  createSession,
  findSession,
  revokeSession,
  sessionCookieName,
  type SessionRow,
} from "./sessions";
import type { UserRow } from "./users";

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
}

/** Resolves the signed-in user for the current request (memoised per render). */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  return findSession(token);
});

/** For pages: sends visitors without a session to the sign-in page. */
export async function requireUser(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}

/** For admin pages: non-admins get a 404 so the area is not discoverable. */
export async function requireAdmin(): Promise<AuthContext> {
  const auth = await requireUser();
  if (auth.user.role !== "admin") notFound();
  return auth;
}

/** For API routes. */
export async function apiUser(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ApiError(401, "unauthenticated", "Please sign in to continue.");
  return auth;
}

export async function apiAdmin(): Promise<AuthContext> {
  const auth = await apiUser();
  if (auth.user.role !== "admin") throw new ApiError(404, "not_found", "Not found.");
  return auth;
}

export async function startSession(user: UserRow, request: Request): Promise<void> {
  const { token, expiresAt } = createSession(user.id, {
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env.isHttps,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) revokeSession(token);
  jar.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: env.isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
