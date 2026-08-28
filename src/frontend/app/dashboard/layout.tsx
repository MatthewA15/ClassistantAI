import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardFrame } from "@/components/dashboard/chrome";
import { getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { getUser } from "@/lib/users";

export const metadata: Metadata = {
  title: {
    default: "Your account",
    template: "%s | Classistant",
  },
  // Every page under here is somebody's account. None of it should be indexed,
  // and `follow: false` as well, because there is nothing worth crawling out of
  // a page a crawler can only ever see the signed-out redirect of anyway.
  robots: { index: false, follow: false },
};

// Reads the session cookie on every request, so nothing here can be static.
export const dynamic = "force-dynamic";

/**
 * The gate on the whole signed-in area.
 *
 * One check in a layout rather than the same check repeated at the top of four
 * pages. A page added to this directory later is protected by existing, which
 * is the only version of this that stays true: a per-page guard is a rule
 * somebody has to remember, and the failure mode of forgetting is a student's
 * account settings rendering for whoever asked for the URL.
 *
 * `getSession` verifies the Firebase session cookie with `checkRevoked: true`,
 * which is a network call to Firebase per request. That is the price of being
 * able to end a session that is already out in the world, and this is exactly
 * the surface it is worth paying for. See lib/authSession.ts.
 *
 * ## Two redirects, not one
 *
 * Signed out goes to /signin, which is what it looks like.
 *
 * Signed in but unfinished goes to /onboarding, and that is the case worth
 * naming: a student who verified a number and closed the tab holds a perfectly
 * valid session and an account with no school, no Google grant, and no portal
 * password. Every card on every page here would be empty, and several of the
 * controls would be writing preferences onto an account that does not do
 * anything yet. Sending them back to the flow that fills it is both the more
 * useful answer and the one that keeps the pages below from needing a "what if
 * none of this exists" branch in each of them.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/signin");

  const record = await getUser(session.uid);
  if (!record?.onboardingComplete) {
    redirect(record?.schoolId ? `/onboarding?school=${encodeURIComponent(record.schoolId)}` : "/onboarding");
  }

  return (
    <DashboardFrame
      school={record.schoolId ? (getSchool(record.schoolId) ?? null) : null}
      phone={session.phone}
    >
      {children}
    </DashboardFrame>
  );
}
