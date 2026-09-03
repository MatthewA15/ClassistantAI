import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PhoneSignIn } from "@/components/auth/PhoneSignIn";
import { OnboardingFrame } from "@/components/onboarding/shell";
import { PortalLoginHandoff } from "@/components/portal/PortalLoginHandoff";
import { themeCss } from "@/components/theme/themeVars";
import { getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { listSchools } from "@/lib/schools";
import { getAccount, hasPortalPassword } from "@/lib/users";

export const metadata: Metadata = {
  title: "Add your portal login",
  description: "Give Classistant the school portal login it needs to check your courses overnight.",
  // A page reached from a text message, about one student's account. Nothing
  // here is for a crawler.
  robots: { index: false, follow: false },
};

// Reads the session cookie.
export const dynamic = "force-dynamic";

/**
 * /portal-login?phone=+1...
 *
 * Where Classy sends a student when it needs their school portal login. This
 * used to be a step in onboarding; docs/design/23 has the reasons it is a page
 * of its own now, and the short version is that the ask is easier to say yes
 * to from someone who has already done something for you.
 *
 * ## The `phone` parameter proves nothing, and that is fine
 *
 * The link Classy texts carries the number it texted, so the student arriving
 * from that text can skip typing it and go straight to the six digit code.
 * That is the whole job of the parameter: a prefill. It is never read on the
 * server, never compared to anything, and never used to decide whose account
 * this is. Identity comes from the SMS round trip exactly as it does on
 * /signin, and a student who is already signed in never sees the number field
 * at all.
 *
 * ## Three states
 *
 *   signed out            the number and the code, then back here
 *   signed in, unfinished sent to onboarding, since there is no account to
 *                         attach a portal login to yet
 *   signed in, finished   the form
 *
 * The session reads sit below a Suspense boundary for the reason /signin and
 * /onboarding put theirs there: verifying the cookie is a network call to
 * Firebase, and a student tapping a link in Messages should see the card
 * before it finishes.
 */
export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone } = await searchParams;

  return (
    // The onboarding wash, not the dashboard frame. This is a hand-off page a
    // student arrives at from a text and leaves from, not a place they
    // navigate around in, so the nav rail would be furniture for a room they
    // are passing through. The school theme is emitted below, once the
    // account is known.
    <OnboardingFrame>
      <main id="main" className="mx-auto w-full max-w-[42rem]">
        <div className="rounded-[1.4rem] bg-white p-6 shadow-soft ring-1 ring-line sm:p-8">
          <Suspense fallback={<HandoffSkeleton />}>
            <Gate phoneHint={phone ?? ""} />
          </Suspense>
        </div>
      </main>
    </OnboardingFrame>
  );
}

async function Gate({ phoneHint }: { phoneHint: string }) {
  const session = await getSession();

  if (!session) {
    return (
      <>
        <h1 className="text-[1.6rem] font-extrabold leading-tight text-ink-900">
          Sign in to continue
        </h1>
        <p className="mt-2.5 text-[0.95rem] leading-[1.6] text-body">
          Classy sent you here to add your school portal login. Your number is your login, so we
          text you a code first.
        </p>
        <div className="mt-7">
          {/* `next` is a literal this file wrote. It must stay that way: a
              destination read from the URL would make this page an open
              redirect wearing a sign-in form. */}
          <PhoneSignIn initialPhone={phoneHint} next="/portal-login" />
        </div>
      </>
    );
  }

  const account = await getAccount(session.uid);
  if (!account?.onboardingComplete) {
    redirect(
      account?.schoolId
        ? `/onboarding?school=${encodeURIComponent(account.schoolId)}`
        : "/onboarding",
    );
  }

  const [sealed, schools] = await Promise.all([hasPortalPassword(session.uid), listSchools()]);
  const school = account.schoolId ? (getSchool(schools, account.schoolId) ?? null) : null;
  const css = school ? themeCss(school) : null;

  return (
    <>
      {/* The school's colours, as a server-rendered stylesheet. Later in the
          document than the frame's own <style> would be, so it wins on equal
          specificity, and the frame above rendered none because it did not know
          the school yet. Same mechanism as DashboardFrame. */}
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <PortalLoginHandoff
        school={school}
        username={account.schoolUsername}
        hasPassword={sealed}
        phone={session.phone}
      />
    </>
  );
}

/** Roughly the height of the signed-out card, so whichever state lands does
 *  not move the page much. Not a shimmer, for the reason /signin gives. */
function HandoffSkeleton() {
  return (
    <>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="h-8 w-3/5 rounded-lg bg-line-soft" />
        <div className="h-4 w-11/12 rounded bg-line-soft/70" />
        <div className="mt-2 flex flex-col gap-2">
          <div className="h-4 w-32 rounded bg-line-soft" />
          <div className="h-[3.1rem] rounded-xl bg-line-soft/60" />
        </div>
        <div className="h-[3.3rem] rounded-xl bg-line-soft" />
      </div>
      <p className="sr-only" role="status">
        Loading.
      </p>
    </>
  );
}
