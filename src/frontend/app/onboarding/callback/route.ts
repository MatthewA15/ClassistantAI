import { NextResponse, type NextRequest } from "next/server";

import { getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { storeCredential } from "@/lib/credentials";
import {
  GrantError,
  appBaseUrl,
  exchangeCode,
  type GoogleGrant,
} from "@/lib/googleOAuth";
import { takePendingOAuth } from "@/lib/onboardingSession";
import { recordGoogleConnection } from "@/lib/users";

/**
 * Where Google sends the student back from the scope grant.
 *
 * This route is the reason the frontend owns the OAuth entry point at all. The
 * connector's own /auth/callback returns JSON, so pointing Google straight at
 * it would dead-end the student on a page of raw `{"user_id": ...}` with no way
 * back into the wizard. Instead Google returns *here*, we hand the code to the
 * connector over server-to-server HTTP, and redirect into the next step.
 *
 * The authorization code passes through this process and is never given to the
 * browser. The refresh token never reaches this process at all -- the connector
 * writes it straight to Secret Manager.
 *
 * This route no longer mints a session. Identity was settled by Firebase Auth
 * before the grant started, so what arrives here is authorisation for an
 * already known student, and the job is to check the two are the same person.
 */

export const dynamic = "force-dynamic";

/**
 * Back to the wizard, carrying the school.
 *
 * The school is not decoration on this URL. The onboarding page renders itself
 * in the school's colours from `?school=`, and that is the only way it can know
 * them before hydration -- the alternative source is the user document, which
 * costs the two network calls the page deliberately does not make above its
 * Suspense boundary. Without it the return leg from Google lands on a page
 * painted in the default blue that repaints a moment later.
 *
 * `pending` is gone by the time some of these fire, so it is optional and the
 * wizard still falls back to the school on the user document. One frame of the
 * wrong colour on a path that already failed is not worth more than this.
 *
 * The origin comes from `appBaseUrl()`, never from the request. It was
 * `request.nextUrl.origin`, which is correct in development and wrong
 * everywhere this actually runs: on Cloud Run the container is addressed as
 * `0.0.0.0:8080` from inside, so every redirect out of this route -- the
 * successful one included -- pointed at `https://0.0.0.0:8080/onboarding` and
 * dead-ended the student on a browser error. Safari names it "restricted
 * network port"; the cause is not the port.
 */
function back(params: Record<string, string>, schoolId?: string | null) {
  const url = new URL("/onboarding", appBaseUrl());
  if (schoolId) url.searchParams.set("school", schoolId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;

  // Consume the cookie before anything can return early, so a failed attempt
  // cannot leave a live state behind for a second try.
  const pending = await takePendingOAuth();

  const oauthError = query.get("error");
  if (oauthError) {
    // access_denied is a student clicking Cancel, not a fault.
    return back(
      { error: oauthError === "access_denied" ? "cancelled" : "google" },
      pending?.schoolId,
    );
  }

  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) return back({ error: "incomplete" }, pending?.schoolId);

  // CSRF. An attacker can make a browser hit this URL with their own code, but
  // not with a state matching the signed cookie we set moments earlier.
  if (!pending || pending.state !== state) return back({ error: "state" });

  // A grant with nobody signed in is not something to salvage. Before Firebase
  // Auth this route had no prior identity to check against and simply believed
  // whatever the connector returned.
  const session = await getSession();
  if (!session) return back({ error: "signin" }, pending.schoolId);

  const school = getSchool(pending.schoolId);
  if (!school || school.status !== "live") return back({ error: "school" });

  /*
   * The code exchange, which this route now performs itself.
   *
   * It used to be a call to the connector, which held the client secret and
   * wrote the refresh token to Secret Manager. Both halves of that have moved:
   * the secret is mounted here (apphosting.yaml) and the token is sealed into
   * Firestore below. The connector's job is now reading credentials, not
   * minting them -- docs/ENCRYPTION_CONTRACT.md §1.
   *
   * The authorization code still never reaches the browser, and the refresh
   * token now never reaches it either: it exists in this process only long
   * enough to be encrypted.
   */
  let grant: GoogleGrant;
  try {
    grant = await exchangeCode(code);
  } catch (err) {
    // GrantError already carries a message naming which half failed. Nothing
    // logged here contains a token: on every error path Google's response
    // carries a reason and no credential.
    const reason = err instanceof GrantError ? err.code : "exchange";
    console.error("google code exchange failed", reason, (err as Error)?.message);
    return back({ error: reason }, school.id);
  }

  // `sub` is no longer our document key -- see the header of lib/users.ts --
  // but it is still worth keeping on the user document.
  const { sub: googleSub, email } = grant;

  /*
   * School eligibility, and this is the check that actually enforces it.
   *
   * `hd` already pinned the consent screen to the school's domain, but `hd` is a
   * parameter on a URL that lives in the browser, and the browser is the thing
   * being checked. The address Google returns from the code exchange is the only
   * address in this flow that is proven, so it is the only one worth testing.
   */
  if (!email.endsWith(`@${school.emailDomain}`)) {
    await discard(grant);
    return back({ error: "domain" }, school.id);
  }

  /*
   * And it must be the address they said it would be.
   *
   * The student typed one on the school step; this is the one they actually
   * signed in with. A difference is not necessarily an attack -- picking the
   * wrong account from Google's chooser does it -- but it means the rest of
   * onboarding would be about a different mailbox than the one they think, and
   * silently adopting the second is the wrong way to resolve that.
   */
  if (pending.email && email !== pending.email) {
    await discard(grant);
    return back({ error: "mismatch" }, school.id);
  }

  /*
   * Seal the refresh token before anything else is written.
   *
   * This is the order the contract asks for (§6) and the order that fails
   * safely: if encryption or the KMS wrap throws, nothing has been recorded and
   * the student simply retries. The reverse -- marking the account connected
   * and then failing to store the credential -- would leave a user document
   * claiming access that the agent cannot actually exercise, and it would fail
   * at 3am with nothing pointing at the cause.
   */
  try {
    await storeCredential({
      uid: session.uid,
      type: "google_refresh_token",
      plaintext: grant.refreshToken,
    });
  } catch (err) {
    // Never log the error object raw here: it is the one code path where a
    // token is in scope, and a stack trace can carry arguments with it.
    console.error("could not store the refresh token", (err as Error)?.message);
    return back({ error: "exchange" }, school.id);
  }

  // Adds what the grant proved to a document that already exists. It was
  // created when the number was verified, so this no longer has to carry the
  // phone number across to bind two identities together -- there is only one
  // identity now, and the `sub` is one of its fields.
  await recordGoogleConnection({
    uid: session.uid,
    googleSub,
    email,
    schoolId: school.id,
  });

  return back({ connected: "1" }, school.id);
}

/**
 * Hands a rejected grant back to Google.
 *
 * Reached when the exchange succeeded but the account turned out to be one we
 * will not serve -- the wrong domain, or a different address than the student
 * said. Not storing the token is not sufficient on its own: the student granted
 * Gmail and Drive access to this application at Google, and dropping our copy
 * would leave that grant standing on their account with nothing to show for it.
 * Revoking is the only way to actually give it back.
 *
 * Best effort by design. A failure here must not change what the student sees,
 * because the reason they are being turned away is already the more useful
 * message and there is nothing they could do about a revoke that did not land.
 */
async function discard(grant: GoogleGrant): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({ token: grant.refreshToken }),
    });
  } catch (err) {
    console.error("could not revoke a rejected grant", (err as Error)?.message);
  }
}
