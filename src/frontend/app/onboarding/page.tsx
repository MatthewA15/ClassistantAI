import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Container } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Get set up",
  description:
    "Connect your school account, add your number, and let Classistant take the semester from there.",
  robots: { index: false, follow: true },
};

export default function OnboardingPage() {
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
          <OnboardingWizard />
        </Suspense>

        <p className="mt-12 text-center text-[0.82rem] text-body-soft">
          Trouble getting in? Email{" "}
          <a href="mailto:hello@classistant.ca" className="font-semibold text-brand-600 hover:underline">
            hello@classistant.ca
          </a>{" "}
          or read the{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </Container>
    </div>
  );
}
