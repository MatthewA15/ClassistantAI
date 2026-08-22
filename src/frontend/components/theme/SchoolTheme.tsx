"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSchool, type School } from "@/data/schools";

/**
 * Re-skins the entire site in a school's own colours.
 *
 * Picking a school is the first step of getting started, so the site answering
 * in your school's colours is both the confirmation that it recognised you and
 * the proof that it is actually built for your campus.
 *
 * Every token is derived from the school's ONE published primary colour with
 * `color-mix`, rather than hand-picking a ramp per school. That keeps contrast
 * relationships identical across all six themes, so nothing has to be re-checked
 * for legibility when a school is added.
 */

type Ctx = {
  school: School | null;
  setSchool: (id: string | null) => void;
};

const SchoolThemeContext = createContext<Ctx>({ school: null, setSchool: () => {} });

export function useSchoolTheme() {
  return useContext(SchoolThemeContext);
}

/** Maps one brand colour onto the whole token set. */
function themeVars(primary: string, accent?: string): Record<string, string> {
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

const MANAGED = Object.keys(themeVars("#000"));

export function SchoolThemeProvider({ children }: { children: React.ReactNode }) {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const school = useMemo(() => (schoolId ? getSchool(schoolId) ?? null : null), [schoolId]);

  useEffect(() => {
    const root = document.documentElement;

    // Colours cross-fade only while a switch is happening. A permanent global
    // colour transition would also animate every hover state on the page.
    root.classList.add("theme-shift");
    const done = window.setTimeout(() => root.classList.remove("theme-shift"), 620);

    if (school?.brand) {
      const vars = themeVars(school.brand.primary, school.brand.accent);
      for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
      root.dataset.school = school.id;
    } else {
      for (const key of MANAGED) root.style.removeProperty(key);
      delete root.dataset.school;
    }

    return () => window.clearTimeout(done);
  }, [school]);

  const setSchool = useCallback((id: string | null) => setSchoolId(id), []);
  const value = useMemo(() => ({ school, setSchool }), [school, setSchool]);

  return <SchoolThemeContext.Provider value={value}>{children}</SchoolThemeContext.Provider>;
}
