import { NextResponse, type NextRequest } from "next/server";

import { SignInRejected, clearSession, createSession } from "@/lib/authSession";
import { ensureUser, getUser } from "@/lib/users";

/**
 * Turns a Firebase ID token into a session cookie, and back again.
 *
 * A route handler rather than a server action because it has to run on a real
 * request the browser made itself: the ID token comes from the Firebase SDK in
 * the page, straight out of the SMS code confirmation, and the response has to
 * carry a Set-Cookie the browser will keep.
 *
 * The ID token is short lived, single purpose, and useless once spent. The
 * session cookie it becomes is httpOnly, so the page that posted the token can
 * never read what it got back.
 *
 * No school is checked here, unlike the Google-login version this replaced. At
 * this point all that has been proven is a phone number, and a phone number
 * says nothing about which campus anyone is at. School eligibility is enforced
 * one step later, against the address Google returns from the access grant,
 * which is the only address in the flow that is actually proven.
 */

export const dynamic = "force-dynamic";

/** POST { idToken } -> sets the session cookie. */
export async function POST(request: NextRequest) {
  let body: { idToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing sign-in token." }, { status: 400 });
  }

  let session;
  try {
    session = await createSession(idToken);
  } catch (err) {
    if (err instanceof SignInRejected) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("createSession failed", err);
    return NextResponse.json({ error: "We could not sign you in." }, { status: 500 });
  }

  // The document is born here, at the first verified number, and this is the
  // whole point of keying by uid: before the rekey there was no id to write
  // under until the Google grant completed, so a student who stopped after the
  // SMS left nothing behind. Insert-only, so a returning student keeps their
  // school, consent, and grant.
  await ensureUser({ uid: session.uid, phoneNumber: session.phone });

  // A returning student may already have finished the grant on a previous
  // visit, in which case the consent screen is not shown again.
  const record = await getUser(session.uid);

  return NextResponse.json({
    phone: session.phone,
    connected: record?.googleConnected ?? false,
    schoolId: record?.schoolId ?? null,
    email: record?.email ?? null,
    // Added for /signin, which has to choose between the dashboard and the rest
    // of onboarding and cannot tell them apart from `connected` alone: a
    // student can have completed the Google grant and then abandoned the flow
    // before the last step, which leaves `connected` true and the account
    // unfinished. The wizard ignores this field; it decides its opening step
    // from `connected`, which is the right question for it to be asking.
    onboardingComplete: record?.onboardingComplete ?? false,
  });
}

/** DELETE -> signs out, and revokes so the cookie is dead everywhere. */
export async function DELETE() {
  await clearSession();
  return new NextResponse(null, { status: 204 });
}
