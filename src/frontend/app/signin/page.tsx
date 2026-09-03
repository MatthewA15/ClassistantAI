import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LogoMark } from "@/components/brand/LogoMark";
import { PhoneSignIn } from "@/components/auth/PhoneSignIn";
import { BuiltBy } from "@/components/site/BuiltBy";
import { Container } from "@/components/ui/primitives";
import { getSession } from "@/lib/authSession";
import { getUser } from "@/lib/users";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign back in to Classistant with the number you set up with.",
  robots: { index: false, follow: true },
};

// Reads the session cookie.
export const dynamic = "force-dynamic";

/**
 * Signing back in.
 *
 * There was no way to do this before the dashboard existed. Onboarding was the
 * only door, so a returning student's only route back to their own account was
 * to start setting one up again, be recognised by the wizard, and be skipped to
 * whichever step they had reached. That works, and it is a strange thing to ask
 * of someone who finished in September and just wants to turn calls off.
 *
 * The number is the login (docs/design/15), so this page is a phone field. No
 * password to forget, no Google account to be signed in to the wrong one of.
 *
 * ## The page frame is written out here rather than reusing OnboardingFrame
 *
 * That frame carries a school theme and a progress-shaped card, and it exists
 * so that page.tsx and loading.tsx can paint identically through a Suspense
 * boundary. This page has no school (nobody has told us who they are yet, which
 * is the entire point) and no steps. What it shares with onboarding is the
 * wash, which is four elements.
 */
export default function SignInPage() {
  return (
    <div className="relative min-h-dvh bg-paper">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden"
      >
        <div className="grain-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-sky-200/50 blur-[110px]" />
      </div>

      <Container className="relative flex min-h-dvh flex-col justify-center py-12 sm:py-16">
        <main id="main" className="mx-auto w-full max-w-[27rem]">
          <div className="rounded-[1.4rem] bg-white p-6 shadow-soft ring-1 ring-line sm:p-8">
            <Link href="/" aria-label="Classistant home" className="inline-flex items-center gap-2.5">
              <LogoMark size={30} />
              <span className="font-display text-[1.1rem] font-extrabold tracking-[-0.03em] text-ink-900">
                Classistant
              </span>
            </Link>

            <h1 className="mt-7 text-[1.75rem] font-extrabold leading-[1.1] text-ink-900">
              Welcome back
            </h1>
            <p className="mt-2.5 text-[0.95rem] leading-[1.6] text-body">
              Your number is your login. We will text you a code to check it is you.
            </p>

            <div className="mt-7">
              {/* The session read is below this boundary, not above it, for the
                  same reason as /onboarding: verifying a session cookie with
                  checkRevoked on is a network call to Firebase, and a page that
                  awaits one before its first byte holds the browser on the
                  previous screen. See docs/design/16. */}
              <Suspense fallback={<SignInSkeleton />}>
                <SignedOutOnly />
              </Suspense>
            </div>
          </div>

          <p className="mt-6 text-center text-[0.88rem] text-body">
            No account yet?{" "}
            <Link href="/onboarding" className="font-semibold text-brand-600 hover:underline">
              Get set up
            </Link>
          </p>

          <div className="mt-12">
            <BuiltBy />
          </div>
        </main>
      </Container>
    </div>
  );
}

/**
 * Sends an already-signed-in student where they were going instead of asking
 * them to prove a number they have already proven.
 *
 * Two destinations, because being signed in is not the same as being finished:
 * a student who verified a number and then closed the tab holds a valid session
 * and an account with no school, no grant, and no consents. The
 * dashboard would render for them and be almost entirely empty, so they go back
 * to the flow that fills it.
 */
async function SignedOutOnly() {
  const session = await getSession();
  if (session) {
    const record = await getUser(session.uid);
    redirect(record?.onboardingComplete ? "/dashboard" : "/onboarding");
  }

  return <PhoneSignIn />;
}

/** Held at roughly the height of the number field and its button, so the card
 *  does not jump when the form lands. Not a shimmer: this is on screen for a
 *  few hundred milliseconds and an animation over a blank rectangle makes a
 *  short wait feel longer. */
function SignInSkeleton() {
  return (
    <>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 rounded bg-line-soft" />
          <div className="h-[3.1rem] rounded-xl bg-line-soft/60" />
          <div className="h-3.5 w-3/4 rounded bg-line-soft/70" />
        </div>
        <div className="h-[3.3rem] rounded-xl bg-line-soft" />
      </div>
      <p className="sr-only" role="status">
        Loading sign in.
      </p>
    </>
  );
}
