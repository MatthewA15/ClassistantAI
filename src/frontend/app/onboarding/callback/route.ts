import { NextResponse, type NextRequest } from "next/server";

import { getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { appBaseUrl, connectorBaseUrl, connectorIdToken } from "@/lib/googleOAuth";
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

  let payload: { user_id?: string; email?: string; status?: string };
  try {
    // The connector is a private Cloud Run service, so this call carries an
    // OIDC token for the runtime service account. Without it Cloud Run answers
    // 403 with an HTML page before the request ever reaches the connector, and
    // the student sees `error=exchange` for a failure that is not an exchange.
    const idToken = await connectorIdToken();

    // The connector exchanges the code using the client secret it holds and the
    // same redirect_uri that started the flow, then stores the refresh token.
    const res = await fetch(
      `${connectorBaseUrl()}/auth/callback?code=${encodeURIComponent(code)}`,
      {
        cache: "no-store",
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      },
    );
    if (!res.ok) {
      // Body may carry a Google error; it is not safe to show a student and not
      // useful to them either. Log it, show them something they can act on.
      console.error("connector /auth/callback failed", res.status, await res.text());
      // 401/403 is Cloud Run turning us away at the door, not Google turning
      // down the code. Told apart so the logs name the thing that is wrong.
      const denied = res.status === 401 || res.status === 403;
      if (denied) console.error("connector call was not authorised", { hadToken: Boolean(idToken) });
      return back({ error: denied ? "unreachable" : "exchange" }, school.id);
    }
    payload = await res.json();
  } catch (err) {
    console.error("connector /auth/callback unreachable", err);
    return back({ error: "unreachable" }, school.id);
  }

  // The connector returns the Google `sub`. It is no longer our document key --
  // see the header of lib/users.ts -- but it is still how the connector's own
  // `/users/{user_id}/...` endpoints are addressed, so it is stored.
  const googleSub = payload.user_id;
  const email = payload.email?.toLowerCase();
  if (!googleSub || !email) return back({ error: "exchange" }, school.id);

  /*
   * School eligibility, and this is the check that actually enforces it.
   *
   * `hd` already pinned the consent screen to the school's domain, but `hd` is a
   * parameter on a URL that lives in the browser, and the browser is the thing
   * being checked. The address Google returns from the code exchange is the only
   * address in this flow that is proven, so it is the only one worth testing.
   */
  if (!email.endsWith(`@${school.emailDomain}`)) {
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
    return back({ error: "mismatch" }, school.id);
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
