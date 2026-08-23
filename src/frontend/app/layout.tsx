import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { SchoolThemeProvider } from "@/components/theme/SchoolTheme";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${bodyFace.variable} ${displayFace.variable}`}>
      <body className="bg-white antialiased">
        <SchoolThemeProvider>
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
