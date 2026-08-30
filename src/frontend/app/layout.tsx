import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { connection } from "next/server";
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
  const schools = await listSchools();

  /*
   * An empty list must never be baked into a static page.
   *
   * `/` is prerendered, and this layout wraps it. A build container without
   * application default credentials -- which is the normal case, since
   * lib/firebaseAdmin.ts notes it is the *runtime* service account that holds
   * `datastore.user` -- reads nothing, and the hero would ship with no campus
   * chips. That is not cosmetic: the Get started CTA is gated on a school being
   * picked, so a chipless hero has no working path into onboarding at all, and
   * ISR would hold it that way for an hour with no way to flush it (the
   * seeder's `revalidateTag` is a no-op from a terminal).
   *
   * `connection()` opts this render out of prerendering, so the page is served
   * dynamically instead and the very next request re-reads. It costs static
   * generation only in the case where static generation would have been wrong,
   * and it un-costs it as soon as a build can see a seeded collection.
   */
  if (schools.length === 0) await connection();

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
