import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { SchoolThemeProvider } from "@/components/theme/SchoolTheme";
import { listSchools } from "@/lib/schools";
import "./globals.css";

/**
 * Type pairing. Both faces are deliberately off the beaten path, since Inter
 * and Plus Jakarta Sans are the default look of every AI-generated landing page.
 * Rationale and the alternatives tested are in docs/design/02-design-system.md.
 *
 * The CSS variable names are font-agnostic on purpose: swapping a face means
 * editing this file only, never globals.css.
 */
const displayFace = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
});

const bodyFace = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body-face",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://classistant.ca"),
  title: {
    default: "Classistant, your semester handled over text",
    template: "%s | Classistant",
  },
  description:
    "Classistant reads your syllabi, builds your calendar, watches for grades and deadlines, and texts you before things go wrong. Built for Canadian students whose school runs on Google.",
  openGraph: {
    title: "Classistant, your semester handled over text",
    description:
      "An agent that signs in to your school account, turns every syllabus into a calendar, and texts you when something needs doing.",
    type: "website",
    locale: "en_CA",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#06203a",
};

/**
 * Async, because the school list is read here and nowhere else.
 *
 * One read for the whole app. `listSchools` is cached for an hour and tagged
 * (lib/schools.ts), so the legal pages and the dashboard do not each pay a
 * Firestore round trip for a list only the hero and the wizard actually use.
 * Reading it here rather than per route is what lets the provider below hand it
 * to every client component through one context instead of five prop chains.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Never empty. `listSchools` serves the seeded catalogue when Firestore gives
   * it nothing, which is what lets `/` stay a prerendered static page: a build
   * container without application default credentials -- the normal case, since
   * lib/firebaseAdmin.ts notes it is the *runtime* service account that holds
   * `datastore.user` -- bakes the seeded list rather than an empty hero.
   *
   * That distinction is load-bearing. The Get started CTA is gated on a school
   * being picked, so a hero with no campus chips has no working path into
   * onboarding at all, and ISR would have held it that way for an hour with no
   * way to flush it. An earlier revision solved that by calling `connection()`
   * to opt out of prerendering whenever the list came back empty; the fallback
   * removes the condition that guard existed for, so it is gone.
   */
  const schools = await listSchools();

  return (
    <html lang="en-CA" className={`${bodyFace.variable} ${displayFace.variable}`}>
      <body className="bg-white antialiased">
        <SchoolThemeProvider schools={schools}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            Skip to content
          </a>
          {children}
        </SchoolThemeProvider>
      </body>
    </html>
  );
}
