/**
 * Feature icon set.
 *
 * One system, so the grid reads as a family rather than a pile of clip art:
 * 24x24 box, 1.8 stroke, round caps and joins, structure drawn in brand blue and
 * the one detail that carries the meaning drawn in light blue. Nothing filled
 * except small accent shapes.
 */

const S = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": true as const,
};

const ink = "var(--color-brand-600)";
const accent = "var(--color-sky-500)";

export function Profile() {
  return (
    <svg {...S}>
      <circle cx="12" cy="8.2" r="3.6" stroke={ink} strokeWidth="1.8" />
      <path
        d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M16.8 4.4a3.4 3.4 0 0 1 0 6" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Files() {
  return (
    <svg {...S}>
      <path
        d="M7.5 6.5h5.2l2.3 2.4h3.5v8.6a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 3.8h6.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 14h5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Syllabus() {
  return (
    <svg {...S}>
      <rect x="4.5" y="3" width="15" height="18" rx="2.2" stroke={ink} strokeWidth="1.8" />
      <path d="M8 7.8h8M8 11.4h8" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 15h3.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="15.6" cy="15.6" r="2.6" fill="var(--color-sky-200)" />
      <path d="M14.5 15.6l.8.8 1.7-1.9" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DueDate() {
  return (
    <svg {...S}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" stroke={ink} strokeWidth="1.8" />
      <path d="M3.5 9.6h17" stroke={ink} strokeWidth="1.8" />
      <path d="M8 3v3.4M16 3v3.4" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <rect x="6.6" y="12.4" width="5.4" height="2.4" rx="1.2" fill={accent} />
      <rect x="13.6" y="16.2" width="3.8" height="2.4" rx="1.2" fill="var(--color-sky-300)" />
    </svg>
  );
}

export function Exam() {
  return (
    <svg {...S}>
      <path d="M12 3.6 21 8l-9 4.4L3 8l9-4.4Z" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6.6 10.2v4.6c0 1.8 2.4 3.2 5.4 3.2s5.4-1.4 5.4-3.2v-4.6" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 8v5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Priority() {
  return (
    <svg {...S}>
      <path d="M4.5 6.5h15M4.5 12h10M4.5 17.5h6" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="18.4" cy="16.6" r="3.2" fill="var(--color-sky-200)" />
      <path d="M18.4 14.9v3.4M16.9 16.6h3" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Pace() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12.6" r="8" stroke={ink} strokeWidth="1.8" />
      <path d="M12 8.4v4.2l2.8 1.8" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.4 3.2h5.2" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Grade() {
  return (
    <svg {...S}>
      <path d="M5 20V9.5M10.4 20V5.5M15.8 20v-7.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 20h17" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="19.2" cy="6.4" r="2.9" fill="var(--color-sky-200)" />
      <path d="M17.9 6.4l.9.9 1.8-2" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Inbox() {
  return (
    <svg {...S}>
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.4" stroke={ink} strokeWidth="1.8" />
      <path d="M3.6 7.6 12 13l8.4-5.4" stroke={ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.8" cy="6.2" r="2.8" fill={accent} stroke="var(--color-white)" strokeWidth="1.6" />
    </svg>
  );
}

export function Compose() {
  return (
    <svg {...S}>
      <path
        d="M19.5 12.4v5.2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h5.2"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m15.4 4.6 3.9 3.9-6 6-4.4.5.5-4.4 6-6Z"
        stroke={accent}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OfficeHours() {
  return (
    <svg {...S}>
      <path
        d="M4 6.2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H9.6L5.4 19.4v-3.6H6a2 2 0 0 1-2-2V6.2Z"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.6 8.4h6.8" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.6 11.6h4" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Call() {
  return (
    <svg {...S}>
      <path
        d="M7.2 3.8 9.4 8 7.6 9.9a11 11 0 0 0 5 5l1.9-1.8 4.2 2.2-.5 2.6a2 2 0 0 1-2.2 1.6C9.4 18.8 5 14.4 4 6.5a2 2 0 0 1 1.6-2.2l1.6-.5Z"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M15.4 4.6a5 5 0 0 1 4 4" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Shield() {
  return (
    <svg {...S}>
      <path
        d="M12 3.2 19 6v5.5c0 4.2-2.8 7.4-7 9.3-4.2-1.9-7-5.1-7-9.3V6l7-2.8Z"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m8.9 11.9 2.2 2.2 4-4.4" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Lock() {
  return (
    <svg {...S}>
      <rect x="4.8" y="10.2" width="14.4" height="10" rx="2.4" stroke={ink} strokeWidth="1.8" />
      <path d="M8.4 10V7.6a3.6 3.6 0 0 1 7.2 0V10" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15.2" r="1.8" fill={accent} />
    </svg>
  );
}

export function Switch() {
  return (
    <svg {...S}>
      <rect x="2.8" y="7.6" width="18.4" height="8.8" rx="4.4" stroke={ink} strokeWidth="1.8" />
      <circle cx="16.8" cy="12" r="2.8" fill={accent} />
    </svg>
  );
}
