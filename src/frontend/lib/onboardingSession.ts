import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The cookie that carries the scope grant across the Google redirect.
 *
 * This file used to hold two cookies. The session half is gone: identity is a
 * Firebase Auth session cookie now, in lib/authSession.ts, which brings
 * revocation and rotation that a self-signed blob never had.
 *
 * What is left is `classistant_oauth`, and it is deliberately still HMAC signed
 * here rather than folded into Firebase. It is not identity. It is CSRF state
 * plus the two things the wizard cannot keep across a trip to
 * accounts.google.com -- which school was picked, and which address the student
 * said they were about to use -- and Firebase has nowhere to put any of it.
 *
 * Nothing in it is trusted as proof of anything. The `state` is compared against
 * what Google echoes back, and the school is re-checked against the *session's*
 * verified email before a single write happens.
 *
 * SameSite=Lax, not Strict: the return from Google is a top-level cross-site
 * GET. Lax sends cookies on exactly that and Strict does not, which would make
 * the callback see nothing and fail every grant.
 */

const OAUTH_COOKIE = "classistant_oauth";
const OAUTH_TTL_SECONDS = 600; // 10 minutes to get through a consent screen

export type PendingOAuth = {
  state: string;
  schoolId: string;
  /** The address the student typed on the school step. Checked against what
   *  Google actually returns, so a claimed address and a proven one cannot
   *  quietly differ. */
  email: string;
};

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

export async function setPendingOAuth(pending: PendingOAuth): Promise<void> {
  (await cookies()).set(OAUTH_COOKIE, seal(pending), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
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
