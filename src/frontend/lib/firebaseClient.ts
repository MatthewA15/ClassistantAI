"use client";

// Types only, so none of this survives compilation. Every value from the SDK is
// pulled in by the dynamic import in `sdk()` below -- see the note there for
// why that is worth the asynchrony it costs.
import type { FirebaseApp } from "firebase/app";
import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

/**
 * Firebase Auth in the browser. Identity only, and identity is a phone number.
 *
 * This half proves WHO the student is. It is deliberately not Google. The
 * Google account is what the agent needs *access to*, and making it the login
 * as well would mean a student who revokes access also loses their account. A
 * phone number is also the address this product delivers on, so verifying it
 * first verifies the thing that actually has to work.
 *
 * The Gmail/Drive/Docs/Calendar grant is a separate leg through the connector,
 * and has to be: Firebase never surfaces Google's refresh token, so offline
 * access could not come from here even if the login were Google. See
 * docs/design/15-firebase-auth.md.
 *
 * None of the config below is secret. `apiKey` in particular is not a
 * credential, it is a project identifier that every Firebase web app ships to
 * every browser; access is controlled by Auth rules and IAM, not by hiding it.
 *
 * NEXT_PUBLIC_* values are inlined at build time by Next, which only works on a
 * literal `process.env.NEXT_PUBLIC_FOO` expression. Do not refactor these into a
 * loop or a computed key: it builds cleanly and yields undefined at runtime.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * The SDK, fetched on demand rather than bundled into the page.
 *
 * firebase/app plus firebase/auth is around 40 kB gzipped, and it used to be a
 * static import, which put all of it in the chunk the browser has to download
 * and parse before /onboarding can hydrate. None of it is needed to draw the
 * first screen or to type a phone number into it -- the earliest it does any
 * work is the press of "Text me a code" -- so paying for it up front bought
 * nothing and made the first arrival on the page visibly slower.
 *
 * `warmPhoneAuth` below starts this fetch as soon as the number screen mounts,
 * so by the time a student has typed ten digits it has almost always landed and
 * the press is no slower than it was. The import cache makes every later call
 * free, and a failed fetch simply retries on the next one.
 */
async function sdk() {
  const [{ getApp, getApps, initializeApp }, auth] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  return { getApp, getApps, initializeApp, ...auth };
}

/**
 * Pulls the SDK down ahead of the first press, and swallows failures.
 *
 * Called from an effect, so it must never reject: a rejected floating promise
 * here would be an unhandled rejection over a fetch that is only ever an
 * optimisation. Whatever went wrong will surface properly, with a message a
 * student can act on, when `sendVerificationCode` retries the same import.
 */
export function warmPhoneAuth(): void {
  void sdk().catch(() => {});
}

function app(mod: Awaited<ReturnType<typeof sdk>>): FirebaseApp {
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.appId) {
    throw new Error(
      "Firebase web config is missing. Set NEXT_PUBLIC_FIREBASE_API_KEY, " +
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN and NEXT_PUBLIC_FIREBASE_APP_ID.",
    );
  }
  return mod.getApps().length ? mod.getApp() : mod.initializeApp(firebaseConfig);
}

let cached: Auth | undefined;

async function clientAuth(): Promise<Auth> {
  const mod = await sdk();
  if (!cached) {
    cached = mod.getAuth(app(mod));
    // Google's own screens and the SMS itself, in the student's language.
    cached.useDeviceLanguage();
  }
  return cached;
}

/**
 * The invisible reCAPTCHA that phone sign-in refuses to run without.
 *
 * Firebase requires an AppVerifier on every `signInWithPhoneNumber` call: it is
 * what stands between this form and someone spending the project's SMS budget
 * in a loop. Invisible size, so it only ever shows a challenge to traffic Google
 * finds suspicious.
 *
 * Kept as a module-level singleton and reused. Constructing a second verifier
 * against the same container throws, and re-rendering the wizard must not be
 * able to cause that.
 */
let verifier: RecaptchaVerifier | undefined;

async function appVerifier(containerId: string): Promise<RecaptchaVerifier> {
  if (!verifier) {
    const mod = await sdk();
    verifier = new mod.RecaptchaVerifier(await clientAuth(), containerId, {
      size: "invisible",
    });
  }
  return verifier;
}

/**
 * Throws the verifier away after a failure.
 *
 * A reCAPTCHA token is single use. Once a send attempt has failed the widget is
 * spent, and reusing it produces `auth/captcha-check-failed` on every retry
 * after the first, which looks exactly like the student's number being the
 * problem when it is not.
 */
function resetVerifier(): void {
  try {
    verifier?.clear();
  } catch {
    // Already torn down. Nothing to do, and nothing that should stop a retry.
  }
  verifier = undefined;
}

/** What `sendVerificationCode` hands back, to be spent by `confirmCode`. */
export type PendingVerification = ConfirmationResult;

/**
 * Texts a six digit code to a Canadian mobile number.
 *
 * `phone` is ten digits, unformatted. E.164 is assembled here rather than in the
 * component, because Firebase silently fails on anything else and a stray space
 * from a formatted input is the easiest way to produce that.
 */
export async function sendVerificationCode(
  phone: string,
  containerId: string,
): Promise<PendingVerification> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) throw new Error("invalid-phone");

  try {
    const mod = await sdk();
    return await mod.signInWithPhoneNumber(
      await clientAuth(),
      `+1${digits}`,
      await appVerifier(containerId),
    );
  } catch (err) {
    resetVerifier();
    throw err;
  }
}

/**
 * Spends the code. On success the student is signed in and holds an ID token,
 * which /api/auth/session trades for the session cookie.
 *
 * Persistence is in-memory, deliberately: the httpOnly session cookie is the
 * session, and Firebase's default localStorage persistence would keep a second,
 * longer-lived client session that the server cannot see and
 * revokeRefreshTokens cannot reach. This is what Firebase's own session-cookie
 * guide recommends.
 */
export async function confirmCode(
  pending: PendingVerification,
  code: string,
): Promise<string> {
  const mod = await sdk();
  await (await clientAuth()).setPersistence(mod.inMemoryPersistence);
  const credential = await pending.confirm(code.replace(/\D/g, ""));
  // Once the code is spent the widget is too. A student who signs out and back
  // in during the same page life needs a fresh one.
  resetVerifier();
  return credential.user.getIdToken();
}

/** Drops the client-side user. The server session is cleared separately, by
 *  DELETE /api/auth/session, which is the half that actually matters. */
export async function signOutClient(): Promise<void> {
  resetVerifier();
  // Nothing to sign out of if the SDK was never loaded, and loading 40 kB in
  // order to sign out of nothing would be the wrong trade.
  if (!cached) return;
  await cached.signOut();
}

/**
 * Maps Firebase's error codes onto something a student can act on.
 *
 * Every message here has to be true of a phone, not of a password. "Try again"
 * is wrong for a wrong code and right for a network blip, and the difference is
 * the whole value of this function.
 */
/**
 * The codes that mean the student mistyped. Everything else is ours, and gets
 * logged. Kept module level so the set is not rebuilt on every failure.
 */
const STUDENT_ERROR = new Set([
  "auth/invalid-phone-number",
  "invalid-phone",
  "auth/invalid-verification-code",
  "auth/code-expired",
]);

export function phoneErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";

  if (!STUDENT_ERROR.has(code)) {
    // `customData.serverResponse` is the half worth having: it carries Identity
    // Toolkit's own message, which distinguishes causes the SDK flattens into a
    // single code. `auth/invalid-app-credential` alone covers a rejected
    // reCAPTCHA token, an unauthorised domain, and App Check enforcement.
    const detail = err as {
      message?: string;
      customData?: { serverResponse?: unknown; appName?: string };
    };
    // `err` goes last and raw. `message` is non-enumerable on Error, so a
    // plain object literal loses it in any structured view -- including
    // Next's overlay, which renders the summary above as `{}` and reads like
    // the SDK returned nothing. Expand the raw error in DevTools instead.
    console.error("[phone auth]", code || "(no code)", {
      message: detail?.message,
      serverResponse: detail?.customData?.serverResponse,
    }, err);
  }

  switch (code) {
    case "auth/invalid-phone-number":
    case "invalid-phone":
      return "That does not look like a 10 digit Canadian mobile number.";
    case "auth/invalid-verification-code":
      return "That code was not right. Check the text and try again.";
    case "auth/code-expired":
      return "That code expired. Send yourself a new one.";
    case "auth/too-many-requests":
      // Firebase's own rate limit. Retrying immediately makes it worse.
      return "Too many tries from here. Wait a few minutes and start again.";
    case "auth/quota-exceeded":
      return "We cannot send codes right now. Try again a little later.";
    case "auth/captcha-check-failed":
      return "That check did not pass. Try sending the code again.";
    case "auth/network-request-failed":
      return "We could not reach Google. Check your connection and try again.";

    // The next five are our own setup, not the student's, and none can be
    // fixed by trying again. Called out separately so a half-configured project
    // fails loudly during setup instead of looking like an ordinary failure.
    case "auth/unauthorized-domain":
      return "This site is not an authorised domain for sign-in yet.";
    case "auth/configuration-not-found":
      return "Sign-in is not switched on yet. (Firebase Auth is not set up on the project.)";
    case "auth/operation-not-allowed":
      return "Phone sign-in is not enabled for this site yet.";
    case "auth/invalid-app-credential":
      // Identity Toolkit rejected the reCAPTCHA token rather than the number.
      // Distinct from `captcha-check-failed`, which is a spent widget and does
      // clear on a retry: this one is project config and never will.
      return "The sign-in check was rejected. (reCAPTCHA is not accepted for this project yet.)";
    case "auth/billing-not-enabled":
      return "SMS sign-in needs billing switched on for this project.";

    default:
      // Already logged above. Every code in this switch was learned by hitting
      // it blind through this branch, so the logging is what keeps the next
      // unmapped one to a glance rather than a bisect.
      return "We could not verify that number. Try again.";
  }
}
