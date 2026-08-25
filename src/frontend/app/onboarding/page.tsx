import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { BuiltBy } from "@/components/site/BuiltBy";
import { Container } from "@/components/ui/primitives";
import { getSession } from "@/lib/onboardingSession";

export const metadata: Metadata = {
  title: "Get set up",
  description:
    "Connect your school account, add your number, and let Classistant take the semester from there.",
  robots: { index: false, follow: true },
};

// Reads the session cookie, so it cannot be statically rendered.
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  // The wizard is a client component and the session cookie is httpOnly, so the
  // identity proven by the Google round trip has to be handed down from here.
  // A student returning from consent lands on this page, not on a fresh one.
  const session = await getSession();
  return (
    <div className="relative min-h-dvh bg-paper">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden"
      >
        <div className="grain-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-sky-200/50 blur-[110px]" />
      </div>

      <Container className="relative py-12 sm:py-16">
        {/* useSearchParams needs a boundary on a statically rendered route. */}
        <Suspense fallback={<div className="min-h-[26rem]" />}>
          <OnboardingWizard
            connected={
              session ? { email: session.email, schoolId: session.schoolId } : null
            }
          />
        </Suspense>

        {/* A "trouble getting in? email chim@wopara.com or read the privacy
            policy" line used to sit here. The privacy policy and terms are
            still linked from the consent step, which is the screen where they
            actually matter. The support address is not on this page any more,
            so a student who cannot get in has nowhere to write from here.

            Everything above this is mechanism: fields, scopes, a progress bar.
            Three faces at the bottom of the page that asks for a school login
            is the cheapest way to say a person is behind it. */}
        <div className="mt-12">
          <BuiltBy />
        </div>
      </Container>
    </div>
  );
}
