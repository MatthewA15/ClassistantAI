"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MANAGED, themeVars } from "@/components/theme/themeVars";
import { getSchool, type School } from "@/data/schools";

/**
 * Re-skins the entire site in a school's own colours, and carries the school
 * list to every client component that needs it.
 *
 * Picking a school is the first step of getting started, so the site answering
 * in your school's colours is both the confirmation that it recognised you and
 * the proof that it is actually built for your campus.
 *
 * Every token is derived from the school's ONE published primary colour with
 * `color-mix`, rather than hand-picking a ramp per school. That keeps contrast
 * relationships identical across all six themes, so nothing has to be re-checked
 * for legibility when a school is added.
 *
 * ## Why the list rides along in here
 *
 * The schools moved into Firestore for issue #36, which only a server component
 * can read. Five client components need the list -- the picker, the hero, the
 * start nudge, the wizard, and this provider itself -- and the alternative to
 * one shared context is five prop chains threaded through layouts that
 * otherwise have no interest in schools.
 *
 * This provider was already the right place: it is mounted once in the root
 * layout, above everything, and it already existed to answer "which school" for
 * the whole tree. `useSchools()` is the read for anything that needs the list;
 * `useSchoolTheme()` stays what it was, for anything that only needs the
 * current one.
 */

type Ctx = {
  school: School | null;
  setSchool: (id: string | null) => void;
  /** Every school, as read from Firestore by the root layout. Empty when the
   *  collection is unseeded or the read failed, which callers must render for
   *  rather than assume away. */
  schools: School[];
};

const SchoolThemeContext = createContext<Ctx>({
  school: null,
  setSchool: () => {},
  schools: [],
});

export function useSchoolTheme() {
  return useContext(SchoolThemeContext);
}

/** The school list, for client components that need more than the current one.
 *  Returns `[]` rather than throwing when the collection could not be read, so
 *  a picker renders its own "could not load" state instead of a boundary. */
export function useSchools(): School[] {
  return useContext(SchoolThemeContext).schools;
}

export function SchoolThemeProvider({
  schools,
  children,
}: {
  schools: School[];
  children: React.ReactNode;
}) {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const school = useMemo(
    () => (schoolId ? getSchool(schools, schoolId) ?? null : null),
    [schools, schoolId],
  );

  /*
   * Whether this run is the mount rather than a real switch.
   *
   * On a page the server themed (see themeCss, and the <style> the onboarding
   * frame renders), the colours on screen at mount are already the right ones
   * and this effect changes none of them. Adding `theme-shift` anyway opened a
   * 620ms window where every element on the page transitions its colours, for a
   * switch that is not happening -- which is what turned the old default-blue
   * flash into a visible fade rather than something you could miss.
   *
   * A ref, not state: flipping it must not re-render, and it must survive the
   * effect it guards.
   */
  const mounted = useRef(false);

  useEffect(() => {
    const root = document.documentElement;

    // Colours cross-fade only while a switch is happening. A permanent global
    // colour transition would also animate every hover state on the page.
    const switching = mounted.current;
    mounted.current = true;

    let done: number | undefined;
    if (switching) {
      root.classList.add("theme-shift");
      done = window.setTimeout(() => root.classList.remove("theme-shift"), 620);
    }

    if (school?.brand) {
      const vars = themeVars(school.brand.primary, school.brand.accent);
      for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
      root.dataset.school = school.id;
    } else {
      for (const key of MANAGED) root.style.removeProperty(key);
      delete root.dataset.school;
    }

    return () => {
      if (done !== undefined) window.clearTimeout(done);
    };
  }, [school]);

  const setSchool = useCallback((id: string | null) => setSchoolId(id), []);
  const value = useMemo(() => ({ school, setSchool, schools }), [school, setSchool, schools]);

  return <SchoolThemeContext.Provider value={value}>{children}</SchoolThemeContext.Provider>;
}
