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
 *
 * It also asks the SDK for the project's reCAPTCHA config. The project runs
 * reCAPTCHA Enterprise SMS defense (docs/design/15), and Google scores the
 * send partly on how long it has been able to watch the visitor before the
 * press. Fetching the config here starts that observation while the student is
 * still typing, which both hides the fetch's latency and gives an honest
 * student the best possible score — the difference between an SMS that just
 * sends and one that makes them solve a picture puzzle first.
 */
export function warmPhoneAuth(): void {
  void sdk()
    .then(async (mod) => mod.initializeRecaptchaConfig(await clientAuth()))
    .catch(() => {});
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
/**
 * How long a send may stay in flight before we give up on it.
 *
 * `signInWithPhoneNumber` can hang forever: when Google's first check rejects
 * the send, the SDK falls back to a visible reCAPTCHA challenge, and the
 * promise it returns settles only when that challenge is solved. A student who
 * closes the puzzle instead of solving it gets no rejection — the SDK's verify
 * promise simply never resolves — and without a limit the button reads
 * "Sending..." until the page is reloaded. Generous, because a slow solve of a
 * real challenge is a success we must not cut off.
 */
const SEND_TIMEOUT_MS = 90_000;

export async function sendVerificationCode(
  phone: string,
  containerId: string,
): Promise<PendingVerification> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) throw new Error("invalid-phone");

  let expired: ReturnType<typeof setTimeout> | undefined;
  try {
    const mod = await sdk();
    return await Promise.race([
      mod.signInWithPhoneNumber(
        await clientAuth(),
        `+1${digits}`,
        await appVerifier(containerId),
      ),
      new Promise<never>((_, reject) => {
        expired = setTimeout(() => reject(new Error("send-timeout")), SEND_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    resetVerifier();
    throw err;
  } finally {
    // Either way the race is settled; a timer left running would fire into a
    // completed flow.
    clearTimeout(expired);
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
  // Firebase errors carry `code`; our own (`invalid-phone`, `send-timeout`)
  // are plain Errors whose message *is* the code. Without the fallback those
  // two fell through to the generic message and their cases below were dead.
  const code =
    typeof err === "object" && err && "code" in err
      ? String(err.code)
      : err instanceof Error
        ? err.message
        : "";

  // `customData.serverResponse` is the half worth having: it carries Identity
  // Toolkit's own message, which distinguishes causes the SDK flattens into a
  // single code. `auth/invalid-app-credential` alone covers a rejected
  // reCAPTCHA token, an unauthorised domain, and App Check enforcement.
  const detail = err as {
    message?: string;
    customData?: { serverResponse?: unknown; appName?: string };
  };
  const raw = `${detail?.message ?? ""} ${JSON.stringify(detail?.customData?.serverResponse ?? "")}`;

  if (!STUDENT_ERROR.has(code)) {
    // `err` goes last and raw. `message` is non-enumerable on Error, so a
    // plain object literal loses it in any structured view -- including
    // Next's overlay, which renders the summary above as `{}` and reads like
    // the SDK returned nothing. Expand the raw error in DevTools instead.
    console.error("[phone auth]", code || "(no code)", {
      message: detail?.message,
      serverResponse: detail?.customData?.serverResponse,
    }, err);
  }

  // Google's per-number abuse throttle hides behind `invalid-app-credential`:
  // the server says TOO_MANY_ATTEMPTS_TRY_LATER but the SDK reports the same
  // code as a rejected reCAPTCHA (docs/design/15). Telling a throttled student
  // the *check* failed sends them into the retry loop that re-arms the
  // throttle; telling them to wait is the only answer that ends it.
  if (code === "auth/invalid-app-credential" && raw.includes("TOO_MANY_ATTEMPTS")) {
    return "Too many tries with that number. Wait a few minutes and start again.";
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
      // Identity Toolkit rejected the reCAPTCHA leg rather than the number.
      // This used to claim the project's reCAPTCHA config was unfinished, and
      // that was wrong: with the config verified end-to-end it still fires,
      // because Google also uses this code for sends it refuses on policy.
      // The known causes, none of them visible from here (docs/design/15):
      //   - a dev build on `localhost` — Google no longer verifies real
      //     numbers from it at all; use 127.0.0.1 or the test number,
      //   - the per-number throttle (caught above when the server says so),
      //   - reCAPTCHA Enterprise SMS defense scoring the send as fraud.
      // A retry is honest advice for the last one; the first two need the
      // developer, and the console.error above is what serves them.
      return "The sign-in check turned this send down. Try once more, and if it keeps happening wait a few minutes first.";
    case "auth/billing-not-enabled":
      return "SMS sign-in needs billing switched on for this project.";
    case "send-timeout":
      return "That check did not finish. Try sending the code again.";

    default:
      // Already logged above. Every code in this switch was learned by hitting
      // it blind through this branch, so the logging is what keeps the next
      // unmapped one to a glance rather than a bisect.
      return "We could not verify that number. Try again.";
  }
}
