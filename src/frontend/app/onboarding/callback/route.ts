import { NextResponse, type NextRequest } from "next/server";

import { getSchool } from "@/data/schools";
import { connectorBaseUrl } from "@/lib/googleOAuth";
import { setSession, takePendingOAuth } from "@/lib/onboardingSession";
import { recordGoogleConnection } from "@/lib/users";

/**
 * Where Google sends the student back.
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
 */

export const dynamic = "force-dynamic";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/onboarding", request.nextUrl.origin);
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
    return back(request, {
      error: oauthError === "access_denied" ? "cancelled" : "google",
    });
  }

  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) return back(request, { error: "incomplete" });

  // CSRF. An attacker can make a browser hit this URL with their own code, but
  // not with a state matching the signed cookie we set moments earlier.
  if (!pending || pending.state !== state) return back(request, { error: "state" });

  const school = getSchool(pending.schoolId);
  if (!school || school.status !== "live") return back(request, { error: "school" });

  let payload: { user_id?: string; email?: string; status?: string };
  try {
    // The connector exchanges the code using the client secret it holds and the
    // same redirect_uri that started the flow, then stores the refresh token.
    const res = await fetch(
      `${connectorBaseUrl()}/auth/callback?code=${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      // Body may carry a Google error; it is not safe to show a student and not
      // useful to them either. Log it, show them something they can act on.
      console.error("connector /auth/callback failed", res.status, await res.text());
      return back(request, { error: "exchange" });
    }
    payload = await res.json();
  } catch (err) {
    console.error("connector /auth/callback unreachable", err);
    return back(request, { error: "unreachable" });
  }

  const userId = payload.user_id;
  const email = payload.email?.toLowerCase();
  if (!userId || !email) return back(request, { error: "exchange" });

  // `hd` already pinned the consent screen to the school's domain, but that is a
  // parameter on a URL the browser could have been talked into changing. This is
  // the server-side check that actually enforces school eligibility.
  if (!email.endsWith(`@${school.emailDomain}`)) {
    return back(request, { error: "domain" });
  }

  await recordGoogleConnection({ userId, email, schoolId: school.id });
  await setSession({ userId, email, schoolId: school.id });

  return back(request, { connected: "1" });
}
