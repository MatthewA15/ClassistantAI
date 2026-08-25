"use client";

import type { School } from "@/data/schools";
import { schoolInitials } from "@/data/schools";
import { useSceneClock } from "@/components/landing/sceneParts";

/**
 * Two looping scenes for step one of onboarding.
 *
 * Step one asks a student to do something that sounds alarming written down:
 * hand a website their school login. The copy answered that in one sentence,
 * and a sentence is the weakest form the answer can take. These show it.
 *
 *   ConnectScene         what to type, then what Google will ask them to allow
 *   SealedPasswordScene  why "Classistant never sees your password" is true
 *
 * They follow the machinery in components/landing/sceneParts: one clock per
 * scene, views derived from the current time. Beats keep getting re-cut during
 * design and a threshold is a one-line change where a keyframe percentage is
 * fifteen. See docs/design/06-motion-and-svg.md.
 *
 * Both are drawn in a 320x200 box. They sit side by side in one grid row, and
 * two figures of different aspect in that row leave one caption hanging below
 * the other.
 *
 * Every scene is decorative and aria-hidden. The heading, the field label, and
 * the captions carry the meaning, so nothing is lost with animation off.
 * `useSceneClock` parks on its rest beat under prefers-reduced-motion, which is
 * why each is given a rest beat that is a payoff frame rather than a first one.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Structure lines. Same drawing language as the How it works scenes. */
const ink = {
  stroke: "var(--color-ink-800)",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

/** Detail lines: dividers, icon interiors, anything inside a UI mock. */
const hair = { ...ink, strokeWidth: 1.8 };

/**
 * Stroke props with a fill, for the shapes that need one.
 *
 * Fill is a parameter rather than something a caller appends, because
 * `fill="#fff" {...ink}` puts the spread last and `ink.fill` silently wins, so
 * the shape comes out unfilled. That is the same ordering trap the Tailwind
 * class lists have (see the frontend conventions), and it is invisible in
 * review: the JSX reads exactly like it works.
 */
const inked = (fill: string, strokeWidth = ink.strokeWidth) => ({ ...ink, fill, strokeWidth });

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Advance width of one glyph at fontSize 8.5 in the monospace stack below.
 * The typed address needs a caret that lands *on* the next character, and the
 * only way to know where that is without measuring text is to fix both the
 * font and the size and do the arithmetic.
 */
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const CH = 5.1;

export function SceneCard({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col">
      <div className="overflow-hidden rounded-[1.1rem] bg-paper ring-1 ring-line">{children}</div>
      <figcaption className="mt-2.5 text-[0.78rem] leading-[1.5] text-body-soft">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Pointer that glides between beats. Same trick as the landing-page Cursor. */
function Pointer({ x, y }: { x: number; y: number }) {
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform 420ms ${EASE}` }}>
      <path
        d="M0 0l9.5 6-4 1.2L4 12z"
        fill="var(--color-ink-900)"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </g>
  );
}

/* ============================================ 1. sign in, then allow ======= */

const CYCLE_A = 16000;

/** Act one: the school's own sign-in page. */
const A1 = { typeIn: 800, typeOut: 4600, reach: 5500, press: 6100, end: 7200 };

/** Act two: Google's consent screen, which is where act one sends you. */
const A2 = { firstTick: 8400, gap: 1300, reach: 14400, press: 14900, done: 15600 };

const PERM_TOP = 24;
const PERM_PITCH = 29;

/**
 * These labels are the only description of the scopes on the page. The written
 * list that used to sit under this step (`ScopeList`) is gone, because this act
 * says the same thing without the paragraph, so the rule that was attached to
 * that list is this file's rule now:
 *
 * Every label must describe something lib/googleOAuth.ts actually requests, and
 * must not suggest anything it does not. "Write emails" is `gmail.compose`,
 * which creates drafts and is incapable of sending, so the word "send" must
 * never appear here. Copy that overstates a scope is the kind of thing a Google
 * app review fails on, and it is also just untrue to the student.
 *
 * Google's own consent screen is still the authoritative list, and a student
 * sees it before anything is granted.
 */
const PERMISSIONS = [
  { label: "Read emails", icon: IconEnvelope },
  { label: "Write emails", icon: IconPencil },
  { label: "Save due dates", icon: IconCalendar },
  { label: "Read PDFs", icon: IconDoc },
  { label: "Write outlines", icon: IconOutline },
];

/**
 * One sequence in two acts: type your address, then approve what it asks for.
 *
 * They are one scene rather than two cards because they are one thing that
 * happens. Pressing Next in act one is what produces act two, and split across
 * two boxes that reads as two separate demands rather than as a flow with an
 * end.
 *
 * The crest is a monogram, never a logo. University logos are trademarks and
 * cannot ship without a licence, so the circle is the school's own brand colour
 * with its initials in it, which claims nothing. Everything else picks up the
 * school theme for free: SchoolThemeProvider overwrites `--color-brand-*` on
 * the document root, so `var(--color-brand-600)` here is already their green,
 * or their maroon, without this file knowing which school is on screen.
 */
export function ConnectScene({ school }: { school: School }) {
  const address = `example@${school.emailDomain}`;

  // Rests at the end of act one, on the fully typed address. Of the two acts
  // that is the one asking the student to do something, and the caption carries
  // what act two says. A rest beat inside act two would park this card on a
  // consent screen with no hint of what to type to reach it.
  const t = useSceneClock(CYCLE_A, 5000, 80);

  const onConsent = t >= A1.end;

  const shown = Math.round(clamp01((t - A1.typeIn) / (A1.typeOut - A1.typeIn)) * address.length);
  const typed = address.slice(0, shown);
  const reaching1 = t >= A1.reach && t < A1.end;
  const pressing1 = t >= A1.press && t < A1.press + 700;

  const checked = PERMISSIONS.filter((_, i) => t >= A2.firstTick + i * A2.gap).length;
  const reaching2 = t >= A2.reach;
  const pressing2 = t >= A2.press && t < A2.press + 700;
  const allowed = t >= A2.done;

  // Long names are common ("Northern Alberta Institute of Technology") and the
  // short form is only set on some schools, so the size steps down rather than
  // letting a name run past the browser frame.
  const name = school.short ?? school.name;
  const nameSize = name.length > 22 ? 7 : 8.5;

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true" role="presentation">
      {/* ---------------------------------------- act one: the school's page */}
      <g opacity={onConsent ? 0 : 1} style={{ transition: "opacity 420ms linear" }}>
        <rect x="14" y="14" width="292" height="172" rx="10" {...inked("#fff")} />
        <path d="M14 38h292" {...hair} />
        {[28, 38, 48].map((cx) => (
          <circle key={cx} cx={cx} cy="26" r="3" fill="var(--color-line)" />
        ))}

        {/* The address bar shows the school's real mail domain and nothing more.
            Inventing a plausible-looking login subdomain would be a factual
            claim about someone else's infrastructure. */}
        <rect x="62" y="19" width="200" height="14" rx="7" fill="var(--color-sky-100)" />
        <g stroke="var(--color-ink-600)" strokeWidth="1.2" fill="none">
          <rect
            x="69"
            y="25.5"
            width="6"
            height="5"
            rx="1.2"
            fill="var(--color-ink-600)"
            stroke="none"
          />
          <path d="M70.4 25.5v-1.3a1.6 1.6 0 013.2 0v1.3" />
        </g>
        <text x="80" y="29.5" fontSize="7" fill="var(--color-body-soft)" fontFamily={MONO}>
          {school.emailDomain}
        </text>

        <circle cx="44" cy="66" r="15" fill="var(--color-brand-600)" />
        <text
          x="44"
          y="70"
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="#fff"
          letterSpacing="0.3"
        >
          {schoolInitials(school.name)}
        </text>
        <text x="68" y="63" fontSize={nameSize} fontWeight="600" fill="var(--color-ink-900)">
          {name}
        </text>
        <text x="68" y="76" fontSize="7" fill="var(--color-body-soft)">
          Sign in to continue
        </text>

        <text x="38" y="104" fontSize="7.5" fill="var(--color-body-soft)">
          Email
        </text>
        <rect
          x="38"
          y="110"
          width="236"
          height="26"
          rx="7"
          fill="#fff"
          stroke="var(--color-brand-500)"
          strokeWidth="2"
        />
        <text x="50" y="127" fontSize="8.5" fill="var(--color-ink-900)" fontFamily={MONO}>
          {typed}
        </text>
        <rect
          x={50 + typed.length * CH}
          y="116"
          width="1.6"
          height="14"
          rx="0.8"
          fill="var(--color-brand-600)"
          style={{ animation: "blink 1.1s step-end infinite" }}
        />

        {/* Says "Continue with Google", not "Next", and is drawn as the real
            button underneath is drawn: white, bordered, with Google's own mark.
            It is the button the student is about to press for real, so a
            generic Next here would be a mock of a screen that does not exist,
            and a brand-filled one would put Google's four colours on a coloured
            plate, which their branding does not allow. */}
        <g
          style={{
            transform: pressing1 ? "translateY(1.5px)" : "none",
            transition: `transform 140ms ${EASE}`,
          }}
        >
          <rect
            x="38"
            y="150"
            width="150"
            height="26"
            rx="7"
            fill={pressing1 ? "var(--color-sky-50)" : "#fff"}
            stroke="var(--color-line)"
            strokeWidth="1.8"
          />
          <GoogleMark x={60} y={157.5} />
          <text x="77" y="167" fontSize="8.5" fontWeight="600" fill="var(--color-ink-900)">
            Continue with Google
          </text>
        </g>

        {/* Parks past the end of the label rather than on it. A pointer centred
            on a button covers the word it is pressing. */}
        <Pointer x={reaching1 ? 170 : 248} y={reaching1 ? 160 : 138} />
      </g>

      {/* ---------------------------------------- act two: what it asks for */}
      <g opacity={onConsent ? 1 : 0} style={{ transition: "opacity 420ms linear" }}>
        <text x="16" y="15" fontSize="8" fill="var(--color-body-soft)">
          Classistant wants to
        </text>

        {PERMISSIONS.map((perm, i) => {
          const y = PERM_TOP + i * PERM_PITCH;
          const on = i < checked;
          const Icon = perm.icon;

          return (
            <g key={perm.label}>
              <rect
                x="14"
                y={y}
                width="292"
                height="25"
                rx="8"
                fill="#fff"
                stroke={on ? "var(--color-brand-500)" : "var(--color-line)"}
                strokeWidth="1.8"
                style={{ transition: "stroke 300ms linear" }}
              />

              <rect
                x="22"
                y={y + 6}
                width="13"
                height="13"
                rx="4"
                fill={on ? "var(--color-brand-600)" : "#fff"}
                stroke={on ? "var(--color-brand-600)" : "var(--color-ink-800)"}
                strokeWidth="1.8"
                style={{ transition: "fill 220ms linear, stroke 220ms linear" }}
              />
              {/* Drawn rather than faded in, so a tick reads as an act. 13 is a
                  little over the path length, which keeps it fully hidden. */}
              <path
                d={`M25.6 ${y + 12.6}l2.8 2.8 5.6-6.2`}
                fill="none"
                stroke="#fff"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="13"
                strokeDashoffset={on ? 0 : 13}
                style={{ transition: `stroke-dashoffset 260ms ${EASE} 60ms` }}
              />

              <g transform={`translate(46 ${y + 6})`}>
                <Icon />
              </g>

              <text x="70" y={y + 16.5} fontSize="9.5" fill="var(--color-ink-900)">
                {perm.label}
              </text>
            </g>
          );
        })}

        <g
          style={{
            transform: pressing2 ? "translateY(1.5px)" : "none",
            transition: `transform 140ms ${EASE}`,
          }}
        >
          <rect
            x="14"
            y="172"
            width="96"
            height="22"
            rx="7"
            fill={allowed || pressing2 ? "var(--color-brand-700)" : "var(--color-brand-600)"}
            style={{ transition: "fill 200ms linear" }}
          />
          <text x="62" y="187" textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">
            {allowed ? "Allowed" : "Allow"}
          </text>
        </g>

        <Pointer
          x={reaching2 ? 82 : 40}
          y={reaching2 ? 181 : PERM_TOP + Math.min(checked, PERMISSIONS.length - 1) * PERM_PITCH + 13}
        />
      </g>
    </svg>
  );
}

/**
 * Google's mark, 11 units square, placed by its top-left corner.
 *
 * Same paths as GoogleGlyph in OnboardingWizard, scaled from their native 20.
 * They keep Google's four colours wherever they appear, which is a branding
 * requirement rather than a style choice, so this is the one thing in these
 * scenes that does not follow the school theme.
 */
function GoogleMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.55)`}>
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.34-.18-1.96H10v3.72h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.74 2.98-4.3 2.98-7.28Z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H1.06v2.58A10 10 0 0 0 10 20Z"
      />
      <path fill="#FBBC05" d="M4.4 11.9a6 6 0 0 1 0-3.82V5.5H1.06a10 10 0 0 0 0 9l3.34-2.6Z" />
      <path
        fill="#EA4335"
        d="M10 3.96c1.47 0 2.78.5 3.82 1.5l2.86-2.86C14.96.98 12.7 0 10 0A10 10 0 0 0 1.06 5.5L4.4 8.08C5.2 5.72 7.4 3.96 10 3.96Z"
      />
    </g>
  );
}

/* Icons. 14x14, drawn from their own origin so a row can just translate them. */

function IconEnvelope() {
  return (
    <g stroke="var(--color-brand-600)" strokeWidth="1.6" fill="none" strokeLinejoin="round">
      <rect x="0.8" y="2.5" width="12.4" height="9.5" rx="1.6" />
      <path d="M1.4 3.6L7 7.9l5.6-4.3" />
    </g>
  );
}

function IconPencil() {
  return (
    <g
      stroke="var(--color-brand-600)"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12l0.7-2.8 6.6-6.6 2.1 2.1-6.6 6.6z" />
      <path d="M8.6 3.3l2.1 2.1" />
    </g>
  );
}

function IconCalendar() {
  return (
    <g
      stroke="var(--color-brand-600)"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="2.6" width="12" height="10.4" rx="1.6" />
      <path d="M1 6h12M4.4 1.2v2.6M9.6 1.2v2.6" />
    </g>
  );
}

function IconDoc() {
  return (
    <g
      stroke="var(--color-brand-600)"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.6 1h5.2l3.6 3.6V13H2.6z" />
      <path d="M7.8 1v3.6h3.6" />
    </g>
  );
}

function IconOutline() {
  return (
    <g
      stroke="var(--color-brand-600)"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1.4" width="12" height="11.2" rx="1.6" />
      <path d="M4 5.2h6M4 8h6M4 10.6h3.4" />
    </g>
  );
}

/* ============================================ 2. the sealed password ====== */

/**
 * The password goes into an envelope, is sealed, and is carried to the school
 * still sealed. Classistant handles it and never opens it.
 *
 * A note on what this does and does not claim. The guarantee being dramatised
 * is "Classistant cannot read your password", which is true. The courier is a
 * metaphor for handling, not a diagram of the network: at this step a student
 * types their password into their school's own page and the browser goes there
 * directly. If this scene is ever reused on step two, where a portal password
 * really does travel through Classistant into Secret Manager, the metaphor
 * becomes the literal truth rather than a simplification of it.
 */

const CYCLE_B = 13000;

/** Storyboard beats, in ms. Named because the numbers are meaningless alone. */
const B = {
  typed: 2400,
  intoEnvelope: 3400,
  flapShut: 4400,
  sealed: 5400,
  toCourier: 7000,
  toSchool: 8600,
  absorbed: 9400,
  refilled: 10800,
  submitted: 11600,
};

export function SealedPasswordScene({ school }: { school: School }) {
  // Rests mid-carry, not on the signed-in frame at the end. Parked on the last
  // beat this scene is a robot standing between two computers, which says
  // nothing. Parked here it is a sealed envelope in the courier's hands under a
  // "cannot see" tag, which is the whole claim in one still frame.
  const t = useSceneClock(CYCLE_B, 7600, 120);

  const typedDots = Math.min(6, Math.max(0, Math.floor((t - 400) / 300)));
  const open = t < B.flapShut;
  const sealed = t >= B.sealed;
  const carrying = t >= B.sealed && t < B.absorbed;

  const envelope =
    t < B.intoEnvelope
      ? { x: 54, y: 140, o: t >= B.typed ? 1 : 0 }
      : t < B.toCourier
        ? { x: 54, y: 140, o: 1 }
        : t < B.toSchool
          ? { x: 160, y: 130, o: 1 }
          : t < B.absorbed
            ? { x: 266, y: 140, o: 1 }
            : { x: 266, y: 80, o: 0 };

  const refilled = t >= B.refilled ? 6 : Math.max(0, Math.floor((t - B.absorbed) / 230));
  const submitting = t >= B.submitted && t < B.submitted + 700;
  const signedIn = t >= B.submitted + 700;

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true" role="presentation">
      {/* -------- the student's screen, on the school's own sign-in page */}
      <Monitor x={10} label={school.emailDomain}>
        <text x="22" y="68" fontSize="6.5" fill="var(--color-body-soft)">
          Password
        </text>
        <rect
          x="22"
          y="72"
          width="64"
          height="16"
          rx="4"
          fill="var(--color-paper)"
          stroke="var(--color-line)"
          strokeWidth="1.4"
        />
        {/* The dots leave the screen when they go into the envelope, which is
            the moment the password stops being on this machine. */}
        <g opacity={t >= B.typed ? 0 : 1} style={{ transition: "opacity 500ms linear" }}>
          {Array.from({ length: typedDots }, (_, i) => (
            <circle key={i} cx={30 + i * 8} cy="80" r="2.4" fill="var(--color-ink-800)" />
          ))}
        </g>
      </Monitor>

      {/* -------- the courier */}
      <g>
        <path d="M160 76v-10" {...ink} />
        <circle cx="160" cy="62" r="3.6" fill="var(--color-brand-600)" />
        <rect x="142" y="76" width="36" height="30" rx="9" {...inked("#fff")} />
        <circle cx="152" cy="90" r="3" fill="var(--color-ink-800)" />
        <circle cx="168" cy="90" r="3" fill="var(--color-ink-800)" />
        <rect x="146" y="112" width="28" height="28" rx="6" {...inked("#fff")} />
        {/* Arms come down and in, so the hands land just outside the carried
            envelope's edges. Splayed outward they read as the envelope being
            stuck to the torso rather than held. */}
        <path d="M147 119l-6 11M173 119l6 11M152 140v12M168 140v12" {...ink} />
      </g>

      {/* "cannot see" chip. Sits above the antenna: to either side it would run
          into a monitor, and the two are only 124 apart. */}
      <g opacity={carrying ? 1 : 0} style={{ transition: "opacity 320ms linear" }}>
        <rect
          x="126"
          y="6"
          width="68"
          height="20"
          rx="10"
          fill="#fff"
          stroke="var(--color-line)"
          strokeWidth="1.6"
        />
        <g stroke="var(--color-ink-800)" strokeWidth="1.4" fill="none" strokeLinecap="round">
          <path d="M135 16c2-2.6 5.4-2.6 7.4 0-2 2.6-5.4 2.6-7.4 0z" />
          <path d="M134.4 19.4l8.6-6.8" />
        </g>
        <text x="148" y="18.6" fontSize="7" fill="var(--color-ink-800)">
          cannot see
        </text>
      </g>

      {/* -------- the school, where the password is actually checked */}
      <Monitor x={222} label={school.emailDomain}>
        <text x="234" y="68" fontSize="6.5" fill="var(--color-body-soft)">
          Password
        </text>
        <rect
          x="234"
          y="72"
          width="64"
          height="14"
          rx="4"
          fill="var(--color-paper)"
          stroke="var(--color-line)"
          strokeWidth="1.4"
        />
        {Array.from({ length: refilled }, (_, i) => (
          <circle key={i} cx={242 + i * 8} cy="79" r="2.4" fill="var(--color-ink-800)" />
        ))}

        {signedIn ? (
          <g>
            <path
              d="M236 93l3.6 3.6 7-7.4"
              fill="none"
              stroke="var(--color-ok)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text x="251" y="96" fontSize="7.5" fontWeight="600" fill="var(--color-ok)">
              Signed in
            </text>
          </g>
        ) : (
          <g
            style={{
              transform: submitting ? "translateY(1.5px)" : "none",
              transition: `transform 140ms ${EASE}`,
            }}
          >
            <rect
              x="234"
              y="88"
              width="40"
              height="10"
              rx="3.5"
              fill={submitting ? "var(--color-brand-700)" : "var(--color-brand-600)"}
            />
            <text x="254" y="95.4" textAnchor="middle" fontSize="6.5" fontWeight="600" fill="#fff">
              Sign in
            </text>
          </g>
        )}
      </Monitor>

      {/* -------- the envelope, drawn last so it passes in front of the courier */}
      <g
        style={{
          transform: `translate(${envelope.x}px, ${envelope.y}px)`,
          opacity: envelope.o,
          transition: `transform 900ms ${EASE}, opacity 380ms linear`,
        }}
      >
        <rect x="-17" y="-12" width="34" height="24" rx="3" {...inked("#fff", 2.6)} />
        {open ? (
          <>
            {[-8, 0, 8].map((cx) => (
              <circle key={cx} cx={cx} cy="3" r="2.2" fill="var(--color-ink-800)" />
            ))}
            <path d="M-17-12L0-26l17 14" {...inked("#fff", 2.6)} />
          </>
        ) : (
          <path d="M-17-12L0 1l17-13" {...inked("none", 2.6)} />
        )}

        {/* Wax seal. The punch is the transition itself: it is parked at 2.4x
            and transparent until the beat, so turning it on plays the stamp. */}
        <g
          style={{
            transform: sealed ? "scale(1)" : "scale(2.4)",
            opacity: sealed ? 1 : 0,
            transition: `transform 240ms ${EASE}, opacity 160ms linear`,
          }}
        >
          <circle cx="0" cy="1" r="5.5" fill="var(--color-brand-600)" />
          <circle cx="0" cy="1" r="3" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.7" />
        </g>
      </g>
    </svg>
  );
}

/**
 * One monitor, drawn from its left edge. Both machines in the scene are the
 * same object at different x, and the brand strip at the top of the screen is
 * what makes each one read as the school's page rather than as Classistant's.
 */
function Monitor({ x, label, children }: { x: number; label: string; children: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y="44" width="88" height="62" rx="6" {...inked("#fff")} />
      <path d={`M${x + 44} 106v14M${x + 28} 120h32`} {...ink} />
      <rect x={x + 6} y="50" width="76" height="50" fill="#fff" />
      <path d={`M${x + 6} 50h76v8h-76z`} fill="var(--color-brand-600)" />
      <text x={x + 10} y="56.5" fontSize="5" fill="#fff" fontFamily={MONO}>
        {label}
      </text>
      {children}
      {/* Redrawn over the children so the screen keeps a clean edge whatever
          they paint. */}
      <rect
        x={x + 6}
        y="50"
        width="76"
        height="50"
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="1.2"
      />
    </g>
  );
}
