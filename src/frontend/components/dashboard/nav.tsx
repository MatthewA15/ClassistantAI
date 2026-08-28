"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { signOutClient } from "@/lib/firebaseClient";

/**
 * The section switcher, and the way out.
 *
 * ## Why this is a nav and not three floating pills
 *
 * The landing page's header is three separate capsules, and
 * components/site/Header.tsx explains why: over a hero, one wide bar reads as a
 * lid on the page, and the middle capsule has to be able to appear and vanish
 * with the scrollspy without leaving a hole.
 *
 * Neither reason survives here. There is no hero to sit on top of, nothing
 * appears or disappears with scroll position, and the sections are a fixed set
 * of four that a student navigates between repeatedly rather than a
 * scroll-progress indicator they read once. What a tool needs is furniture that
 * does not move, and a rail that is in the same place on every page is the
 * cheapest version of that. The palette, the radii, the ring on every surface
 * and the shadow are all unchanged, which is what keeps this recognisably the
 * same product rather than a second one bolted on.
 */

const SECTIONS = [
  { href: "/dashboard", label: "Overview", icon: OverviewIcon },
  { href: "/dashboard/activity", label: "Activity", icon: ActivityIcon },
  { href: "/dashboard/access", label: "Access", icon: AccessIcon },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account sections" className="lg:sticky lg:top-24 lg:self-start">
      {/*
        A scrolling row on phones and a column on large screens, from one list.

        `-mx-5 px-5` on the row is what keeps the first and last chips from
        being clipped against the container's own gutter while still letting the
        row bleed to both edges, which is the cue that tells a reader it
        scrolls. On lg both are dropped along with the overflow.
      */}
      <ul className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {SECTIONS.map((section) => {
          // Exact match for the index, prefix match for the rest. `startsWith`
          // alone would light /dashboard up on every page in the section, since
          // every one of these paths begins with it.
          const active =
            section.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(section.href);
          const Icon = section.icon;

          return (
            <li key={section.href} className="shrink-0 lg:shrink">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[0.9rem] transition-colors lg:w-full",
                  active
                    ? "bg-white font-bold text-ink-900 shadow-soft ring-1 ring-line"
                    : "font-semibold text-body hover:bg-sky-100 hover:text-ink-900",
                )}
              >
                <Icon className={active ? "text-brand-600" : "text-body-soft"} />
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Ends the session, here and everywhere.
 *
 * Both halves matter and neither is optional. DELETE on the session route
 * clears the httpOnly cookie *and* revokes the refresh tokens, so a copy of the
 * cookie taken from this browser is dead too; `signOutClient` drops the
 * in-memory Firebase user, so the tab is not left believing it is authenticated
 * while the server has stopped agreeing.
 *
 * A document load rather than a router push afterwards, for the same reason the
 * sign-in page uses one: the router would happily serve a cached
 * /dashboard rendered while the cookie still existed.
 */
export function SignOutButton({
  className,
  children = "Sign out",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOutClient();
    } finally {
      // Not in a `catch`: whatever failed, the least bad end state is the
      // student on the signed-out home page rather than sitting on a dashboard
      // wondering whether the press worked. The revoke either happened or the
      // cookie is still there and will be checked on the next request anyway.
      window.location.assign("/");
    }
  };

  return (
    <button type="button" onClick={signOut} disabled={busy} className={className}>
      {busy ? "Signing out..." : children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Icons. Stroked rather than filled, at the same 1.7 weight as the back arrow
   in the onboarding shell, so they read as one family with the rest of the
   site's line work. Sized in the class list rather than by attribute so a
   caller can override.
--------------------------------------------------------------------------- */

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0 transition-colors", className)}
    >
      {children}
    </svg>
  );
}

function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.4" y="2.4" width="5.6" height="5.6" rx="1.7" />
      <rect x="10" y="2.4" width="5.6" height="5.6" rx="1.7" />
      <rect x="2.4" y="10" width="5.6" height="5.6" rx="1.7" />
      <rect x="10" y="10" width="5.6" height="5.6" rx="1.7" />
    </Icon>
  );
}

function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.8 9.4h3.1l1.9-4.7 3 9 2-4.3h4.4" />
    </Icon>
  );
}

function AccessIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* A shield, not a padlock. A padlock says "locked", which is the wrong
          promise: these switches govern what is allowed through, and something
          is always allowed through. */}
      <path d="M9 1.9 15.1 4.1v4.4c0 3.4-2.5 5.9-6.1 7.3-3.6-1.4-6.1-3.9-6.1-7.3V4.1z" />
      <path d="M6.6 8.9 8.3 10.6 11.6 7.2" />
    </Icon>
  );
}

function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 5.1h13M2.5 12.9h13" />
      <circle cx="6.6" cy="5.1" r="1.9" />
      <circle cx="11.4" cy="12.9" r="1.9" />
    </Icon>
  );
}
