import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Cookies that carry onboarding across the Google redirect.
 *
 * The wizard is a client component holding its state in React. Sending the
 * student to accounts.google.com destroys all of it, so the two things needed
 * to resume -- which school they picked, and who they turned out to be -- have
 * to survive the round trip somewhere else. These are those two cookies.
 *
 * Both are signed. `classistant_session` carries the Google `sub`, and the
 * connector API is currently deployed with --allow-unauthenticated, so a
 * forged cookie is a read of somebody else's mail. Signing does not fix the
 * open API (that needs IAM or an API key on the connector, see docs/design/12)
 * but it does stop this app from being the thing that hands out the id.
 *
 * SameSite=Lax, not Strict: the return from Google is a top-level cross-site
 * GET. Lax sends cookies on exactly that and Strict does not, which would make
 * the callback see nothing and fail every login.
 */

const OAUTH_COOKIE = "classistant_oauth";
const SESSION_COOKIE = "classistant_session";
const OAUTH_TTL_SECONDS = 600; // 10 minutes to get through a consent screen

export type PendingOAuth = { state: string; schoolId: string; username: string };
export type OnboardingSession = { userId: string; email: string; schoolId: string };

function signingKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return Buffer.from(secret, "utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function seal(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function unseal<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1), "base64url");
  const want = Buffer.from(sign(payload), "base64url");

  // Length check first: timingSafeEqual throws rather than returns false when
  // the buffers differ in length.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

const BASE_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function setPendingOAuth(pending: PendingOAuth): Promise<void> {
  (await cookies()).set(OAUTH_COOKIE, seal(pending), {
    ...BASE_COOKIE,
    maxAge: OAUTH_TTL_SECONDS,
  });
}

export async function takePendingOAuth(): Promise<PendingOAuth | null> {
  const jar = await cookies();
  const pending = unseal<PendingOAuth>(jar.get(OAUTH_COOKIE)?.value);
  // Single use, whether or not it verified. A replayed code should not find a
  // live state waiting for it.
  jar.delete(OAUTH_COOKIE);
  return pending;
}

export async function setSession(session: OnboardingSession): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, seal(session), {
    ...BASE_COOKIE,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSession(): Promise<OnboardingSession | null> {
  return unseal<OnboardingSession>((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
