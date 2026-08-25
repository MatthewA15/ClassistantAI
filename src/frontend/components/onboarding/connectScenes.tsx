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
 * Three machines in a row, and a sealed envelope moving along them.
 *
 * You -> Classistant -> School. The middle machine is the one making a promise,
 * so it is the one wearing the "cannot see" tag.
 *
 * The scene runs in three phases, and the last two are the point of it:
 *
 *   1. the first sign-in   the password is typed, sealed, and passed along
 *   2. the overnight run   the clock on your machine runs to 3:16 AM, and
 *                          Classistant sends the same sealed envelope again
 *   3. the next morning    10:26 AM, and it happens again
 *
 * Phases two and three exist because "we ask for this once" is the thing a
 * student actually wants to know, and a scene that stops at the first sign-in
 * implies the opposite: that they will be asked every time. Watching the clock
 * skip past the middle of the night while the envelope goes out on its own is
 * also the clearest statement of why the portal password is needed at all,
 * which is the ask on step two.
 *
 * This replaced a courier robot standing between two monitors. A labelled row
 * of machines is the actual path, and naming the middle one is what turns
 * "Classistant never sees your password" into a statement about a specific
 * thing rather than about a brand.
 *
 * A note on what this does and does not claim, and it matters more here than it
 * did with the robot, because a labelled row of machines reads as a network
 * diagram and phases two and three now assert a storage and reuse story on top
 * of it. At step one a student types their password into their school's own
 * page and the browser goes there directly, so nothing passes through
 * Classistant and nothing is kept. The phases drawn here are step two's story:
 * the portal password, held in Secret Manager and replayed against the school
 * portal overnight. See docs/design/13-connect-scenes.md.
 */

const CYCLE_B = 27000;

/**
 * Storyboard beats, in ms, in three phases. Named because the numbers are
 * meaningless alone, and grouped because re-cutting one phase should not mean
 * recounting the others.
 */
const B = {
  // phase one: the first sign-in
  typed: 2400,
  intoEnvelope: 3400,
  flapShut: 4400,
  sealed: 5400,
  atClassistant: 7000,
  atSchool: 8600,
  absorbed: 9400,
  refilled: 10800,
  submitted: 11600,
  signedIn: 12300,

  // phase two: the overnight run
  nightFrom: 13200,
  nightTo: 16000,
  nightSend: 16400,
  nightAtSchool: 17200,
  nightAbsorbed: 18000,
  nightRefilled: 19000,
  nightSubmitted: 19400,
  nightSignedIn: 20000,

  // phase three: the next morning
  morningFrom: 20800,
  morningTo: 22400,
  morningSend: 22800,
  morningAtSchool: 23600,
  morningAbsorbed: 24400,
  morningRefilled: 25000,
  morningSubmitted: 25300,
  morningSignedIn: 25700,
};

/** Screen centres. The three monitors are 84 wide with 26 between them. */
const M = { you: 8, classistant: 118, school: 228 };
const MID = 42;

const E_YOU = M.you + MID;
const E_CLA = M.classistant + MID;
const E_SCH = M.school + MID;

/** The lane the envelope travels along, below the machines. */
const LANE = 156;

/** Where the envelope waits, level with the machines, so it drops out of one. */
const IN_MACHINE = 118;

/**
 * Wall-clock minutes, counting past midnight so the run reads as one night
 * rather than as the clock jumping backwards.
 *
 *   6:48 PM -> 3:16 AM -> 10:26 AM
 */
const T_EVENING = 18 * 60 + 48;
const T_NIGHT = 24 * 60 + 3 * 60 + 16;
const T_MORNING = 24 * 60 + 10 * 60 + 26;

const lerp = (a: number, b: number, f: number) => a + (b - a) * clamp01(f);

function clockLabel(mins: number) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** What the school's screen is doing during one sign-in attempt. */
function runState(t: number, absorbed: number, refilled: number, submitted: number, done: number) {
  const step = (refilled - absorbed) / 6;
  return {
    dots: Math.min(6, Math.max(0, Math.floor((t - absorbed) / step))),
    submitting: t >= submitted && t < done,
    signedIn: t >= done,
  };
}

export function SealedPasswordScene({ school }: { school: School }) {
  // Rests during the overnight run: envelope sealed on the Classistant machine,
  // the clock on yours reading the middle of the night, the tag up. That single
  // frame carries the whole scene. Parked on the last beat it would be three
  // idle monitors, and parked on the first sign-in it would lose the reuse.
  const t = useSceneClock(CYCLE_B, 16800, 80);

  const typedDots = Math.min(6, Math.max(0, Math.floor((t - 400) / 300)));
  const open = t < B.flapShut;
  const sealed = t >= B.sealed;

  // Every window where the middle machine is holding something it cannot read.
  const holding =
    (t >= B.atClassistant && t < B.absorbed) ||
    (t >= B.nightSend && t < B.nightAbsorbed) ||
    (t >= B.morningSend && t < B.morningAbsorbed);

  const showClock = t >= B.nightFrom;
  const mins =
    t < B.nightTo
      ? lerp(T_EVENING, T_NIGHT, (t - B.nightFrom) / (B.nightTo - B.nightFrom))
      : t < B.morningFrom
        ? T_NIGHT
        : t < B.morningTo
          ? lerp(T_NIGHT, T_MORNING, (t - B.morningFrom) / (B.morningTo - B.morningFrom))
          : T_MORNING;

  // Phase one builds the envelope on your machine. After that it lives in the
  // Classistant machine and drops out of it once per run, which is the reuse.
  const envelope =
    t < B.typed
      ? { x: E_YOU, y: IN_MACHINE, o: 0 }
      : t < B.atClassistant
        ? { x: E_YOU, y: LANE, o: 1 }
        : t < B.atSchool
          ? { x: E_CLA, y: LANE, o: 1 }
          : t < B.absorbed
            ? { x: E_SCH, y: LANE, o: 1 }
            : t < B.nightSend
              ? { x: E_CLA, y: IN_MACHINE, o: 0 }
              : t < B.nightAtSchool
                ? { x: E_CLA, y: LANE, o: 1 }
                : t < B.nightAbsorbed
                  ? { x: E_SCH, y: LANE, o: 1 }
                  : t < B.morningSend
                    ? { x: E_CLA, y: IN_MACHINE, o: 0 }
                    : t < B.morningAtSchool
                      ? { x: E_CLA, y: LANE, o: 1 }
                      : t < B.morningAbsorbed
                        ? { x: E_SCH, y: LANE, o: 1 }
                        : { x: E_YOU, y: IN_MACHINE, o: 0 };

  // The school resets to an empty box when a new envelope is sent, so each run
  // is visibly a fresh sign-in rather than a screen that never changed.
  const run =
    t >= B.morningSend
      ? runState(t, B.morningAbsorbed, B.morningRefilled, B.morningSubmitted, B.morningSignedIn)
      : t >= B.nightSend
        ? runState(t, B.nightAbsorbed, B.nightRefilled, B.nightSubmitted, B.nightSignedIn)
        : runState(t, B.absorbed, B.refilled, B.submitted, B.signedIn);

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true" role="presentation">
      {/* The lane, drawn first so the envelope rides over it. */}
      <path
        d={`M${E_YOU} ${LANE}H${E_SCH}`}
        stroke="var(--color-line)"
        strokeWidth="2"
        strokeDasharray="4 5"
        strokeLinecap="round"
        fill="none"
      />

      {/* -------- you: the password, then the clock running while you sleep */}
      <Monitor x={M.you} header={school.emailDomain} caption="You">
        <g opacity={showClock ? 0 : 1} style={{ transition: "opacity 400ms linear" }}>
          <text x={M.you + 12} y="62" fontSize="6.5" fill="var(--color-body-soft)">
            Password
          </text>
          <rect
            x={M.you + 12}
            y="66"
            width="60"
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
              <circle key={i} cx={M.you + 20 + i * 8} cy="74" r="2.4" fill="var(--color-ink-800)" />
            ))}
          </g>
        </g>

        {/* Monospace, or the whole line shifts every time a digit changes. */}
        <g opacity={showClock ? 1 : 0} style={{ transition: "opacity 400ms linear" }}>
          <text
            x={E_YOU}
            y="76"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fontFamily={MONO}
            fill="var(--color-ink-900)"
          >
            {clockLabel(mins)}
          </text>
        </g>
      </Monitor>

      {/* -------- classistant, which holds it shut and cannot open it */}
      <Monitor x={M.classistant} header={null} caption={null}>
        <text
          x={E_CLA}
          y="66"
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill="var(--color-ink-900)"
        >
          Classistant
        </text>
        <g opacity={holding ? 1 : 0} style={{ transition: "opacity 320ms linear" }}>
          {/* One word. The screen is 72 units wide and "sealed, not read" runs
              past its right edge; the tag above the monitor says the rest. */}
          <Padlock x={M.classistant + 25} y="76" />
          <text x={M.classistant + 37} y="82.5" fontSize="7" fill="var(--color-body-soft)">
            sealed
          </text>
        </g>
      </Monitor>

      {/* -------- the school, where the password is actually checked */}
      <Monitor x={M.school} header={school.emailDomain} caption="School">
        <text x={M.school + 12} y="62" fontSize="6.5" fill="var(--color-body-soft)">
          Password
        </text>
        <rect
          x={M.school + 12}
          y="66"
          width="60"
          height="14"
          rx="4"
          fill="var(--color-paper)"
          stroke="var(--color-line)"
          strokeWidth="1.4"
        />
        {Array.from({ length: run.dots }, (_, i) => (
          <circle key={i} cx={M.school + 20 + i * 8} cy="73" r="2.4" fill="var(--color-ink-800)" />
        ))}

        {run.signedIn ? (
          <g>
            <path
              d={`M${M.school + 13} 87l3.4 3.4 6.6-7`}
              fill="none"
              stroke="var(--color-ok)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text x={M.school + 27} y="90" fontSize="7.5" fontWeight="600" fill="var(--color-ok)">
              Signed in
            </text>
          </g>
        ) : (
          <g
            style={{
              transform: run.submitting ? "translateY(1.5px)" : "none",
              transition: `transform 140ms ${EASE}`,
            }}
          >
            <rect
              x={M.school + 12}
              y="83"
              width="38"
              height="9"
              rx="3"
              fill={run.submitting ? "var(--color-brand-700)" : "var(--color-brand-600)"}
            />
            <text
              x={M.school + 31}
              y="89.6"
              textAnchor="middle"
              fontSize="6"
              fontWeight="600"
              fill="#fff"
            >
              Sign in
            </text>
          </g>
        )}
      </Monitor>

      {/* The tag belongs to the middle machine, so it sits over that one. */}
      <g opacity={holding ? 1 : 0} style={{ transition: "opacity 320ms linear" }}>
        <rect
          x={M.classistant + 8}
          y="4"
          width="68"
          height="20"
          rx="10"
          fill="#fff"
          stroke="var(--color-line)"
          strokeWidth="1.6"
        />
        <g stroke="var(--color-ink-800)" strokeWidth="1.4" fill="none" strokeLinecap="round">
          <path d={`M${M.classistant + 17} 14c2-2.6 5.4-2.6 7.4 0-2 2.6-5.4 2.6-7.4 0z`} />
          <path d={`M${M.classistant + 16.4} 17.4l8.6-6.8`} />
        </g>
        <text x={M.classistant + 30} y="16.6" fontSize="7" fill="var(--color-ink-800)">
          cannot see
        </text>
      </g>

      {/* -------- the envelope, drawn last so it rides over everything */}
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

/** Small closed padlock, placed by its top-left. */
function Padlock({ x, y }: { x: number; y: string | number }) {
  const top = Number(y);
  return (
    <g>
      <rect x={x} y={top + 3.4} width="8" height="6" rx="1.4" fill="var(--color-ink-700)" />
      <path
        d={`M${x + 1.8} ${top + 3.4}v-1.8a2.2 2.2 0 014.4 0v1.8`}
        fill="none"
        stroke="var(--color-ink-700)"
        strokeWidth="1.3"
      />
    </g>
  );
}

/**
 * One machine: screen, stand, and a name under it.
 *
 * `header` is the domain strip across the top of the screen, which is what
 * makes a screen read as the school's page. Classistant's own machine passes
 * null: it is not pretending to be a web page, and a brand strip with no
 * address on it reads as chrome rather than as a site.
 *
 * `caption` is the label under the stand. Classistant's is null because its
 * screen says its name, and printing it twice under the same monitor reads as
 * a mistake.
 */
function Monitor({
  x,
  header,
  caption,
  children,
}: {
  x: number;
  header: string | null;
  caption: string | null;
  children: React.ReactNode;
}) {
  return (
    <g>
      <rect x={x} y="38" width="84" height="62" rx="6" {...inked("#fff")} />
      <path d={`M${x + MID} 100v12M${x + 26} 112h32`} {...ink} />
      <rect x={x + 6} y="44" width="72" height="50" fill="#fff" />

      {header ? (
        <>
          <path d={`M${x + 6} 44h72v8h-72z`} fill="var(--color-brand-600)" />
          <text x={x + 10} y="50.5" fontSize="5" fill="#fff" fontFamily={MONO}>
            {header}
          </text>
        </>
      ) : (
        <path d={`M${x + 6} 44h72v8h-72z`} fill="var(--color-sky-200)" />
      )}

      {children}

      {/* Redrawn over the children so the screen keeps a clean edge whatever
          they paint. */}
      <rect
        x={x + 6}
        y="44"
        width="72"
        height="50"
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="1.2"
      />

      {caption ? (
        <text
          x={x + MID}
          y="128"
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="600"
          fill="var(--color-ink-800)"
        >
          {caption}
        </text>
      ) : null}
    </g>
  );
}
