/**
 * Icon set for the feature wall.
 *
 * One system so twenty tiles read as a family: 24 box, 1.9 stroke, round caps
 * and joins, no fills except tiny accent dots. Every icon draws in
 * `currentColor`, so the tile decides the colour and the semantic ones (a
 * warning, a cancellation) can pick up the functional hues without a variant
 * prop.
 *
 * Deliberately literal. At 22px on a small tile there is no room for a clever
 * metaphor, and the icon's whole job is to make the name scannable.
 */

const S = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function IconSyllabus() {
  return (
    <svg {...S}>
      <path d="M5.5 3.5h9l4.5 4.5v12.5h-13.5z" />
      <path d="M14 3.5V8h4.5M8.5 12h7M8.5 16h4.5" />
    </svg>
  );
}

export function IconExam() {
  return (
    <svg {...S}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="M9.5 14.5l1.8 1.8 3.4-3.8" />
    </svg>
  );
}

export function IconLab() {
  return (
    <svg {...S}>
      <path d="M9.5 3.5v6L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3l-4.9-8.5v-6" />
      <path d="M8 3.5h8M7.4 14.5h9.2" />
    </svg>
  );
}

export function IconRoom() {
  return (
    <svg {...S}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function IconWarning() {
  return (
    <svg {...S}>
      <path d="M12 3.5 21 19.5H3z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconHistory() {
  return (
    <svg {...S}>
      <path d="M5 20V9.5M10.3 20V5.5M15.6 20v-7.5M3.5 20h17" />
      <path d="M18.5 8.5 21 6" />
    </svg>
  );
}

export function IconDraft() {
  return (
    <svg {...S}>
      <path d="M20 12.4v5.1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h5.2" />
      <path d="m16 3.6 4 4-6.2 6.2-4.6.6.6-4.6z" />
    </svg>
  );
}

export function IconPdf() {
  return (
    <svg {...S}>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 16.5c2.5-1 4-3.5 4-5.5 0-1-1.5-1-1.5.3 0 2.4 3 5.7 5 5.2" />
    </svg>
  );
}

export function IconMoon() {
  return (
    <svg {...S}>
      <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
    </svg>
  );
}

export function IconDigest() {
  return (
    <svg {...S}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
      <path d="M7 9h6M7 13h10M7 16.5h7" />
    </svg>
  );
}

export function IconFolder() {
  return (
    <svg {...S}>
      <path d="M3.5 6.8a2 2 0 0 1 2-2h3.6l2.2 2.4h7.2a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconOvernight() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.4V12l3 1.9" />
      <path d="M18.5 4.5 20.5 2.5M5.5 4.5 3.5 2.5" />
    </svg>
  );
}

export function IconBlock() {
  return (
    <svg {...S}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <rect x="7" y="12.5" width="7" height="4.5" rx="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconGlobe() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.6 12h16.8M12 3.6c2.2 2.4 3.3 5.3 3.3 8.4s-1.1 6-3.3 8.4c-2.2-2.4-3.3-5.3-3.3-8.4S9.8 6 12 3.6Z" />
    </svg>
  );
}

export function IconOfficeHours() {
  return (
    <svg {...S}>
      <path d="M4 6.4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2H9.6L5.4 19.6V16H6a2 2 0 0 1-2-2z" />
      <path d="M8.6 8.6h6.8M8.6 12h4" />
    </svg>
  );
}

export function IconGroup() {
  return (
    <svg {...S}>
      <circle cx="9.2" cy="8.6" r="3.2" />
      <path d="M3.6 19.4c.6-3 2.8-4.8 5.6-4.8s5 1.8 5.6 4.8" />
      <path d="M16 5.8a3.2 3.2 0 0 1 0 5.8M17.4 14.9c2 .7 3.3 2.3 3.7 4.5" />
    </svg>
  );
}

export function IconCancelled() {
  return (
    <svg {...S}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="M9.6 13.4 14.4 18M14.4 13.4 9.6 18" />
    </svg>
  );
}

export function IconRank() {
  return (
    <svg {...S}>
      <path d="M4 6.5h13M4 12h9M4 17.5h5" />
      <path d="M18.5 10.5v9M15.6 16.6l2.9 2.9 2.9-2.9" />
    </svg>
  );
}

export function IconPlatforms() {
  return (
    <svg {...S}>
      <rect x="3" y="3.5" width="8.5" height="17" rx="2.2" />
      <rect x="14" y="8" width="7" height="12.5" rx="2" />
      <path d="M6.4 17.4h1.7M17 17.6h1.4" />
    </svg>
  );
}

export function IconStop() {
  return (
    <svg {...S}>
      <path d="M4 6.4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2H9.6L5.4 19.6V16H6a2 2 0 0 1-2-2z" />
      <path d="M9.4 10.3h5.2" />
    </svg>
  );
}

export function IconWeight() {
  return (
    <svg {...S}>
      <path d="M12 4.5v15M6.5 7.5h11" />
      <path d="M6.5 7.5 3.5 14a3 3 0 0 0 6 0zM17.5 7.5 14.5 14a3 3 0 0 0 6 0z" />
    </svg>
  );
}

export function IconRefresh() {
  return (
    <svg {...S}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.5 3.5v5h-5" />
    </svg>
  );
}

export function IconThreads() {
  return (
    <svg {...S}>
      <path d="M3.5 6.4a2 2 0 0 1 2-2h8.6a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8.4L4.6 16.2v-2.8a2 2 0 0 1-1.1-1.8z" />
      <path d="M18 9.2h.5a2 2 0 0 1 2 2v5a2 2 0 0 1-1.1 1.8v2.8l-3.2-2.6" />
    </svg>
  );
}

export function IconAnnounce() {
  return (
    <svg {...S}>
      <path d="M4 10v4a2 2 0 0 0 2 2h2l7 4.5V5.5L8 10H6a2 2 0 0 0-2 2Z" />
      <path d="M18.5 9a4.5 4.5 0 0 1 0 6" />
    </svg>
  );
}

export function IconTimer() {
  return (
    <svg {...S}>
      <circle cx="12" cy="13.5" r="7.4" />
      <path d="M12 9.6v4l2.6 1.6M9.4 2.6h5.2" />
    </svg>
  );
}

export function IconShield() {
  return (
    <svg {...S}>
      <path d="M12 3.2 19 6v5.6c0 4.2-2.8 7.4-7 9.2-4.2-1.8-7-5-7-9.2V6z" />
      <path d="m9 12 2.2 2.2 4-4.4" />
    </svg>
  );
}
