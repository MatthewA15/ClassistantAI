import "server-only";

import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";

import { adminAuth } from "@/lib/firebaseAdmin";

/**
 * The signed-in session: a verified phone number, in a Firebase session cookie.
 *
 * This replaces the HMAC-signed `{userId, email, schoolId}` blob this app used
 * to mint for itself. That cookie was bearer-only: no revocation, no rotation,
 * no way to end a session from the server once it was handed out. Firebase
 * session cookies fix exactly that, which is why docs/design/12 named them as
 * the intended upgrade.
 *
 * The cookie NAME is unchanged, and that is on purpose. Every student holding an
 * old HMAC cookie fails verification here, gets null, and is sent back through
 * sign-in. Picking a new name instead would leave the stale cookie sitting in
 * their browser for another 30 days doing nothing.
 */

const SESSION_COOKIE = "classistant_session";

/**
 * Fourteen days, which is Firebase's hard ceiling for a session cookie. The old
 * self-signed cookie was set to 30. That is a real reduction in how long a
 * student stays signed in, and it buys revocation: `verifySessionCookie(_, true)`
 * below checks on every request whether the session has been killed, which no
 * 30 day self-signed token could ever do.
 */
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  // Lax, not Strict, for the same reason as the OAuth cookie: the return leg
  // from Google is a top-level cross-site GET, and Strict withholds cookies on
  // exactly that, so the callback would see no session and fail every grant.
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};

export type AuthSession = {
  /**
   * The Firebase uid. This is who is signed in.
   *
   * It is NOT the id the Firestore documents are keyed by. Those are keyed by
   * the Google `sub`, which does not exist until the student completes the
   * access grant, so a signed-in student may legitimately have no document yet.
   * `getUserByAuthUid` is the way across once they do.
   */
  uid: string;
  /** E.164, verified by Google via the SMS. The reason to trust it is that a
   *  code was delivered to it and typed back in. */
  phone: string;
};

/** Thrown for sign-ins we refuse. The message is written to be shown to a
 *  student, because every one of these is something they can act on. */
export class SignInRejected extends Error {}

/**
 * Verifies a freshly minted ID token and exchanges it for a session cookie.
 *
 * `checkRevoked: true` on the ID token as well, so an account disabled seconds
 * ago cannot spend a token minted seconds before that.
 */
export async function createSession(idToken: string): Promise<AuthSession> {
  const auth = adminAuth();

  let decoded: DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    throw new SignInRejected("That sign-in did not check out. Try again.");
  }

  // Phone only. If another provider is ever switched on in the console it must
  // not silently become a way in: nothing downstream would have a verified
  // number, and the number is what this product delivers on.
  if (decoded.firebase?.sign_in_provider !== "phone") {
    throw new SignInRejected("Verify your mobile number to continue.");
  }

  // Present only because Firebase put it there, after its own SMS round trip.
  // Nothing the browser sent is trusted for this.
  const phone = decoded.phone_number;
  if (!phone) {
    throw new SignInRejected("That sign-in carried no verified number. Try again.");
  }

  let cookie: string;
  try {
    cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_TTL_MS });
  } catch (err) {
    // Almost always IAM rather than the student: the runtime service account is
    // missing serviceAccountTokenCreator on itself, so it cannot sign the
    // cookie. Log it loudly, because the student-facing message cannot say so.
    console.error("createSessionCookie failed", err);
    throw new SignInRejected("We could not start your session. Try again in a moment.");
  }

  (await cookies()).set(SESSION_COOKIE, cookie, COOKIE_OPTIONS);

  return { uid: decoded.uid, phone };
}

/**
 * The signed-in student, or null.
 *
 * `checkRevoked: true` is the point of the whole change and costs a network
 * call to Firebase per verification. That is the price of being able to end a
 * session that is already out in the world, which is what the old cookie could
 * not do at any price.
 */
export async function getSession(): Promise<AuthSession | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(raw, true);
    const phone = decoded.phone_number;
    if (!phone) return null;
    return { uid: decoded.uid, phone };
  } catch {
    // Expired, revoked, tampered with, or a leftover from the old HMAC scheme.
    // All four mean the same thing to a caller: nobody is signed in.
    return null;
  }
}

/**
 * Ends the session everywhere, not just in this browser.
 *
 * Revoking first matters. Deleting the cookie alone would leave a still-valid
 * session cookie in anything that had already copied it, which is the exact
 * failure the old scheme had.
 */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);

  if (!raw) return;
  try {
    // checkRevoked false: an already-revoked cookie throws, and there is
    // nothing left to do about it here anyway.
    const decoded = await adminAuth().verifySessionCookie(raw, false);
    await adminAuth().revokeRefreshTokens(decoded.sub);
  } catch {
    // Signing out is not allowed to fail. The cookie is already gone.
  }
}
