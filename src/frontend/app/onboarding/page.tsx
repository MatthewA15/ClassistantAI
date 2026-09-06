import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { OnboardingFrame, WizardSkeleton } from "@/components/onboarding/shell";
import { getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { listSchools } from "@/lib/schools";
import { getUser } from "@/lib/users";

export const metadata: Metadata = {
  title: "Get set up",
  description:
    "Connect your school account, add your number, and let Classistant take the semester from there.",
  robots: { index: false, follow: true },
};

// Reads the session cookie, so it cannot be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The page itself is synchronous now, and that is the point.
 *
 * It used to await getSession() and the user read in this function body,
 * above the Suspense boundary. A boundary with nothing suspending under it
 * streams nothing, so the browser held on the previous page until Firebase
 * Admin had verified the session cookie -- a network call, because checkRevoked
 * is on -- and Firestore had answered a query. Two round trips before the first
 * byte, on a route the router could not prefetch either.
 *
 * With the reads moved into a child below the boundary, the frame and the card
 * flush immediately and the wizard arrives when they finish. loading.tsx is the
 * other half: it is what makes the route prefetchable at all.
 * See docs/design/16-onboarding-entry-cost.md.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  /*
   * The only await left above the boundary, and it is free: searchParams is
   * already in hand by the time this runs, so it resolves in a microtask. It is
   * not a reason to move the session reads back up here -- those are two network
   * calls, which is the whole reason they sit below.
   *
   * It buys the school, which the frame needs in order to render the page in
   * that school's colours from the server rather than after hydration.
   */
  const { school } = await searchParams;

  return (
    <OnboardingFrame school={school ? (getSchool(await listSchools(), school) ?? null) : null}>
      {/* Also the boundary useSearchParams needs inside the wizard. */}
      <Suspense fallback={<WizardSkeleton />}>
        <SignedInWizard />
      </Suspense>
    </OnboardingFrame>
  );
}

async function SignedInWizard() {
  // The wizard is a client component and the session cookie is httpOnly, so
  // what has been proven has to be handed down from here. A student returning
  // from the Google consent screen lands on this page, not on a fresh one.
  //
  // Three states, not two, and the wizard opens on a different step for each:
  // nobody here, a verified number with no access grant, or both. The document
  // exists from the moment the number was verified, so what distinguishes the
  // last two is `googleConnected` on it, not whether it is there at all.
  const session = await getSession();
  const record = session ? await getUser(session.uid) : null;

  const account = session
    ? {
        phone: session.phone,
        email: record?.email ?? null,
        schoolId: record?.schoolId ?? null,
        granted: record?.googleConnected ?? false,
      }
    : null;

  return <OnboardingWizard connected={account} />;
}
