import { OnboardingFrame, WizardSkeleton } from "@/components/onboarding/shell";

/**
 * The reason this file exists is prefetching, not politeness.
 *
 * /onboarding is force-dynamic, and Next prefetches a dynamic route only as far
 * as its nearest loading boundary. Without this file there was no boundary, so
 * the prefetch fired by the hero's "i'm ready to start" link came back with 186
 * bytes and the router had nothing cached and no idea which chunks the route
 * needed. The click then paid for the server round trip and ~57 kB gzipped of
 * cold JavaScript at once, which is the pause a student sees exactly once.
 *
 * With it, the same prefetch returns this card and preloads the route's chunks
 * while the student is still choosing a school, so the click paints immediately.
 *
 * Nothing here reads the session, and it must stay that way: anything dynamic in
 * this subtree makes the boundary unprefetchable again and quietly restores the
 * stutter.
 */
export default function OnboardingLoading() {
  return (
    <OnboardingFrame>
      <WizardSkeleton />
    </OnboardingFrame>
  );
}
