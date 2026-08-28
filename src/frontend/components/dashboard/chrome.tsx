import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/LogoMark";
import { DashboardNav, SignOutButton } from "@/components/dashboard/nav";
import { themeCss } from "@/components/theme/themeVars";
import { Container } from "@/components/ui/primitives";
import type { School } from "@/data/schools";

/**
 * The page around every signed-in screen: the wash, the bar, the rail.
 *
 * No "use client", and the same rule as components/onboarding/shell.tsx applies
 * for the same reason: everything here is markup, and the two interactive
 * pieces (the section links, which need the pathname, and sign out, which needs
 * a handler) are imported from nav.tsx which carries the directive itself. A
 * hook added to this file would pull the entire dashboard shell into a client
 * bundle that currently costs nothing.
 *
 * The school theme is emitted as a server-rendered stylesheet, exactly as the
 * onboarding frame does it. The provider in the root layout sets the same
 * tokens as inline properties on <html> after hydration, but only when
 * something calls setSchool, and nothing on these pages does: a student's
 * school is a fact on their document rather than a choice they are making here.
 * So the <style> is the whole mechanism, and it is why a hard load of the
 * dashboard is already in Alberta's green on its first paint rather than
 * repainting a moment later.
 */
export function DashboardFrame({
  school,
  phone,
  children,
}: {
  school: School | null;
  /** Shown in the bar so a student can tell at a glance which of their numbers
   *  this session belongs to. E.164, because that is what the session carries
   *  and reformatting a number we are showing as identification would only
   *  invite it to disagree with the one on the settings page. */
  phone: string | null;
  children: ReactNode;
}) {
  const css = school ? themeCss(school) : null;

  return (
    <div className="relative min-h-dvh bg-paper">
      {/* A plain <style> with no `precedence`, so React leaves it here rather
          than hoisting it into the head. See themeVars.ts on the doubled
          selector that keeps it ahead of Tailwind's own :root block. */}
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[24rem] overflow-hidden"
      >
        <div className="grain-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute -left-24 -top-40 h-[26rem] w-[26rem] rounded-full bg-sky-200/45 blur-[110px]" />
      </div>

      {/* Sticky rather than fixed. Fixed would need a spacer of exactly the
          bar's height underneath it, and the bar's height changes with the font
          size a student has set in their browser, so the spacer would be right
          only at the default. */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-xl">
        <Container className="flex h-16 items-center gap-4">
          <Link
            href="/dashboard"
            aria-label="Classistant dashboard"
            className="group flex shrink-0 items-center gap-2.5"
          >
            <LogoMark size={26} className="transition-transform duration-300 group-hover:scale-[1.05]" />
            <span className="font-display text-[1rem] font-extrabold tracking-[-0.03em] text-ink-900">
              Classistant
            </span>
          </Link>

          <span className="flex-1" />

          {school ? (
            // Hidden on phones. It is a reassurance rather than a control, and
            // the bar has room for exactly two things at 360px: who you are and
            // how to leave.
            <span className="hidden truncate text-[0.85rem] font-semibold text-body sm:block">
              {school.short ?? school.name}
            </span>
          ) : null}

          {phone ? (
            <span
              aria-label={`Signed in as ${phone}`}
              className="hidden font-mono text-[0.82rem] text-body-soft md:block"
            >
              {phone}
            </span>
          ) : null}

          <SignOutButton className="shrink-0 rounded-lg px-2.5 py-1.5 text-[0.85rem] font-semibold text-brand-600 transition-colors hover:bg-sky-100" />
        </Container>
      </header>

      <Container className="relative py-8 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
          <DashboardNav />
          <main id="main" className="min-w-0">
            {children}
          </main>
        </div>
      </Container>
    </div>
  );
}

/**
 * The heading at the top of a section.
 *
 * Smaller than the landing page's 3.1rem section headings and that is the
 * point: out front the heading is the argument, and in here it is a label on a
 * page whose content is the thing the student came for. A 50px headline over a
 * form asking which hours are quiet reads as a landing page that lost its way.
 */
export function PageHead({
  title,
  lead,
  action,
}: {
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.65rem] font-extrabold leading-[1.12] text-ink-900 sm:text-[1.9rem]">
          {title}
        </h1>
        {lead ? (
          <p className="mt-2 max-w-xl text-[0.95rem] leading-[1.6] text-body">{lead}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
