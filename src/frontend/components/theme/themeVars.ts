import type { School } from "@/data/schools";

/**
 * The colour maths, in a module with no "use client" on it.
 *
 * It lives apart from SchoolTheme.tsx because two very different things need
 * it and only one of them runs in a browser:
 *
 *   SchoolThemeProvider   sets these as inline properties on <html> in an
 *                         effect, which is what repaints the site when a
 *                         student picks a school without reloading.
 *   themeCss below        renders the same values into a <style> the server
 *                         sends, so a page that already knows the school is
 *                         drawn in its colours on the very first paint.
 *
 * Sharing one function is the point. Two copies would drift, and the symptom
 * would be a school whose green is subtly wrong for one frame after every hard
 * load, which nobody would ever catch by reading either file on its own.
 *
 * A server component cannot call a function it imports from a "use client"
 * module -- it gets a client reference, not the function -- so keeping this
 * file free of that directive is what makes the sharing possible at all.
 */

/** Maps one brand colour onto the whole token set. */
export function themeVars(primary: string, accent?: string): Record<string, string> {
  const mix = (pct: number, towards: string) => `color-mix(in oklab, ${primary} ${pct}%, ${towards})`;
  return {
    "--color-brand-700": mix(80, "black"),
    "--color-brand-600": primary,
    "--color-brand-500": mix(86, "white"),
    "--color-brand-400": mix(64, "white"),

    "--color-sky-500": mix(50, "white"),
    "--color-sky-400": mix(36, "white"),
    "--color-sky-300": mix(24, "white"),
    "--color-sky-200": mix(15, "white"),
    "--color-sky-100": mix(8, "white"),
    "--color-sky-50": mix(4, "white"),

    "--color-ink-950": mix(30, "black"),
    "--color-ink-900": mix(38, "black"),
    "--color-ink-800": mix(50, "black"),
    "--color-ink-700": mix(62, "black"),
    "--color-ink-600": mix(74, "black"),

    "--color-paper": mix(3.5, "white"),
    "--color-line": mix(14, "white"),
    "--color-line-soft": mix(7, "white"),
    "--color-body": `color-mix(in oklab, ${primary} 42%, #33445a)`,
    "--color-body-soft": `color-mix(in oklab, ${primary} 26%, #6f8296)`,

    "--color-accent": accent ?? mix(45, "white"),
  };
}

/** Every token a school theme owns. The provider clears exactly these when a
 *  school is dropped, so nothing from the last one survives. */
export const MANAGED = Object.keys(themeVars("#000"));

/**
 * The same tokens as a stylesheet, for a server render.
 *
 * `:root:root` rather than `:root` is deliberate. The default palette is a
 * plain `:root` block inside Tailwind's stylesheet, which is a <link> in the
 * head, and equal specificity would leave this depending on document order --
 * fine today, and quietly broken the day React decides to hoist this <style>
 * above that link. Repeating the selector costs nothing and settles it.
 *
 * Every value here comes from data/schools.ts, which is ours and committed, so
 * there is no untrusted text going into a stylesheet. Keep it that way: a
 * school colour that ever came from a URL or a form would need escaping before
 * it reached this string.
 */
export function themeCss(school: School): string | null {
  if (!school.brand) return null;

  const vars = themeVars(school.brand.primary, school.brand.accent);
  const body = Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");

  return `:root:root{${body}}`;
}
