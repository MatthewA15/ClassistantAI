"use client";

import { useSceneClock } from "@/components/landing/sceneParts";

/**
 * The looping scene for step one: verifying a mobile number.
 *
 * Step one asks for a phone number before it has given the student anything,
 * which is the weakest possible moment to ask for one. The honest answer is
 * that it takes about fifteen seconds and ends in a green tick, so the scene
 * shows exactly that rather than saying it.
 *
 * It follows the machinery in components/landing/sceneParts: one clock, views
 * derived from the current time. Beats keep getting re-cut during design, and a
 * threshold is a one-line change where a keyframe percentage is fifteen. See
 * docs/design/06-motion-and-svg.md.
 *
 * Drawn in the same 320x200 box and the same line language as the connect step
 * scenes, so the two steps read as one product.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Structure lines. Same drawing language as connectScenes. */
const ink = {
  stroke: "var(--color-ink-800)",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

const hair = { ...ink, strokeWidth: 1.8 };

/**
 * Stroke props with a fill. Fill is a parameter rather than something a caller
 * appends, because `fill="#fff" {...ink}` puts the spread last and `ink.fill`
 * silently wins, so the shape comes out unfilled. Same trap as connectScenes.
 */
const inked = (fill: string, strokeWidth = ink.strokeWidth) => ({ ...ink, fill, strokeWidth });

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** Advance width of one glyph at fontSize 9 in the stack above. The typed
 *  number needs a caret that lands on the next character, and fixing the font
 *  and size is the only way to know where that is without measuring text. */
const CH = 5.4;

/**
 * The number typed on screen.
 *
 * 555-01xx is the range reserved for fiction in the North American plan, so
 * this cannot be a real person's phone. Everything else on this site follows
 * the rule that nothing factual ships invented (see docs/design/05), and a
 * plausible working number in a demo is the same class of mistake.
 */
const NUMBER = "(647) 555-0134";

/** The code, which is also Firebase's own convention for a test number, so a
 *  configured test account and this drawing agree. */
const CODE = "123456";

const CYCLE = 17000;

/** Act one: the number. */
const A1 = { typeIn: 700, typeOut: 3700, reach: 4200, press: 4700, end: 5500 };

/**
 * Act two: the code arrives and is typed back.
 *
 * `notifIn` is deliberately after `end`: the text cannot plausibly arrive
 * before the button has been pressed, and a notification sliding in over act
 * one would say it did.
 */
const A2 = {
  notifIn: 5900,
  firstDigit: 7000,
  digitGap: 430,
  notifOut: 10200,
  reach: 10300,
  press: 10800,
  verified: 11400,
  /** Back to an empty form, so the loop reads as a reset rather than a jump. */
  reset: 15200,
};

/** Six OTP cells, laid out from x=44 so the row is centred in the 320 box. */
const CELL = { x: 44, y: 98, w: 32, h: 38, gap: 7 };

export function PhoneVerifyScene() {
  /*
   * Rests mid act two: the text has arrived, the code is visible in it, and
   * four of the six boxes are filled.
   *
   * The green tick was tried as the rest beat first and is the wrong frame.
   * Parked there, a reader with reduced motion gets a trophy for something they
   * have not done, and learns nothing: it shows the outcome and hides the
   * mechanism. The thing a student is actually unsure about at this step is what
   * happens after they hand over their number, and this frame answers it in one
   * picture -- a text turns up with a code in it, and the code goes in the
   * boxes.
   *
   * Same reasoning as docs/design/13, which parks ConnectScene on the act that
   * asks the student to do something rather than on its last frame. The cost is
   * the same too: a reader with reduced motion never sees the tick.
   */
  const t = useSceneClock(CYCLE, 8300, 80);

  const onCode = t >= A1.end && t < A2.reset;

  // Act one
  const shown = Math.round(clamp01((t - A1.typeIn) / (A1.typeOut - A1.typeIn)) * NUMBER.length);
  const typed = NUMBER.slice(0, shown);
  const reaching1 = t >= A1.reach && t < A1.end;
  const pressing1 = t >= A1.press && t < A1.press + 700;

  // Act two
  const digits = Math.max(
    0,
    Math.min(CODE.length, Math.floor((t - A2.firstDigit) / A2.digitGap) + 1),
  );
  const notifShown = t >= A2.notifIn && t < A2.notifOut;
  const reaching2 = t >= A2.reach && t < A2.verified;
  const pressing2 = t >= A2.press && t < A2.press + 700;
  const verified = t >= A2.verified && t < A2.reset;

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true" role="presentation">
      {/* The card both acts happen inside. One card, not two: the code box
          replaces the number box on the same screen, which is what the real
          step does. */}
      <rect x="14" y="14" width="292" height="172" rx="10" {...inked("#fff")} />

      {/* ------------------------------------------------ act one: the number */}
      <g opacity={onCode ? 0 : 1} style={{ transition: "opacity 380ms linear" }}>
        <text x="38" y="52" fontSize="11" fontWeight="700" fill="var(--color-ink-900)">
          What is your number?
        </text>
        <text x="38" y="68" fontSize="7.5" fill="var(--color-body-soft)">
          We text you a code to check it is you.
        </text>

        <rect
          x="38"
          y="88"
          width="244"
          height="30"
          rx="7"
          fill="#fff"
          stroke="var(--color-brand-500)"
          strokeWidth="2"
        />
        {/* The country code sits in its own cell, as it does on the real field,
            so the typed part starts where the student's typing would. */}
        <path d="M74 88v30" {...hair} />
        <text x="50" y="107" fontSize="9" fill="var(--color-body-soft)" fontFamily={MONO}>
          +1
        </text>
        <text x="86" y="107" fontSize="9" fill="var(--color-ink-900)" fontFamily={MONO}>
          {typed}
        </text>
        <rect
          x={86 + typed.length * CH}
          y="95"
          width="1.6"
          height="16"
          rx="0.8"
          fill="var(--color-brand-600)"
          style={{ animation: "blink 1.1s step-end infinite" }}
        />

        <g
          style={{
            transform: pressing1 ? "translateY(1.5px)" : "none",
            transition: `transform 140ms ${EASE}`,
          }}
        >
          <rect
            x="38"
            y="134"
            width="120"
            height="28"
            rx="7"
            fill={pressing1 ? "var(--color-brand-700)" : "var(--color-brand-600)"}
            style={{ transition: "fill 200ms linear" }}
          />
          <text x="98" y="152.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">
            Text me a code
          </text>
        </g>

        {/* Parks past the end of the label rather than on it. A pointer centred
            on a button covers the word it is pressing. */}
        <Pointer x={reaching1 ? 140 : 236} y={reaching1 ? 144 : 122} />
      </g>

      {/* -------------------------------------------------- act two: the code */}
      {/* Act two's text sits lower than act one's, which is not an oversight.
          The notification lands across the top of the card, and at act one's
          heading height it covered the words rather than overlaying the screen,
          which read as a layout bug instead of as a text arriving. */}
      <g opacity={onCode ? 1 : 0} style={{ transition: "opacity 380ms linear" }}>
        <text x="38" y="70" fontSize="11" fontWeight="700" fill="var(--color-ink-900)">
          Enter the code
        </text>
        <text x="38" y="85" fontSize="7.5" fill="var(--color-body-soft)">
          Sent to +1 {NUMBER}
        </text>

        {CODE.split("").map((digit, i) => {
          const x = CELL.x + i * (CELL.w + CELL.gap);
          const filled = i < digits;
          // The cell being typed into next, which is where a real caret would
          // be. Nothing is focused once the code is complete.
          const active = i === digits && digits < CODE.length;

          return (
            <g key={i}>
              <rect
                x={x}
                y={CELL.y}
                width={CELL.w}
                height={CELL.h}
                rx="8"
                fill="#fff"
                stroke={
                  filled || active ? "var(--color-brand-500)" : "var(--color-line)"
                }
                strokeWidth={active ? 2.4 : 1.8}
                style={{ transition: "stroke 200ms linear, stroke-width 200ms linear" }}
              />
              {filled ? (
                <text
                  x={x + CELL.w / 2}
                  y={CELL.y + 26}
                  textAnchor="middle"
                  fontSize="15"
                  fontWeight="700"
                  fill="var(--color-ink-900)"
                  fontFamily={MONO}
                  style={{ animation: `bubble-in .22s ${EASE} both` }}
                >
                  {digit}
                </text>
              ) : null}
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
            x="44"
            y="148"
            width="96"
            height="26"
            rx="7"
            fill={pressing2 ? "var(--color-brand-700)" : "var(--color-brand-600)"}
            style={{ transition: "fill 200ms linear" }}
          />
          <text x="92" y="165.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">
            Verify
          </text>
        </g>

        {/*
          Parked to the right of the cells while the code goes in, not inside
          the cell being filled.

          A pointer sitting in an empty box says the box is being clicked, and
          nobody enters a code with a mouse. Waiting beside the row is what a
          hand actually does while someone types, and it still has somewhere to
          travel from when it goes for Verify.
        */}
        <Pointer
          x={reaching2 ? 118 : 284}
          y={reaching2 ? 158 : CELL.y + 21}
        />
      </g>

      {/*
        The notification, drawn last so it sits above both acts.

        It is the one element that is not part of the card: it slides in over
        the top edge the way a real one does, which is what makes it read as
        arriving from outside rather than as another field on the form.
      */}
      <g
        style={{
          transform: `translateY(${notifShown ? 0 : -46}px)`,
          opacity: notifShown ? 1 : 0,
          transition: `transform 460ms ${EASE}, opacity 300ms linear`,
        }}
      >
        <rect x="30" y="8" width="260" height="38" rx="11" fill="var(--color-ink-900)" />
        <rect x="42" y="18" width="18" height="18" rx="5" fill="var(--color-brand-500)" />
        <path
          d="M46.5 27.5l2.6 2.6 5.4-6"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="70" y="25" fontSize="7" fill="rgba(255,255,255,0.6)">
          Classistant
        </text>
        <text x="70" y="38" fontSize="9.5" fontWeight="600" fill="#fff">
          {CODE} is your code
        </text>
      </g>

      {/*
        The green wash and the tick.

        A full-card tint rather than a badge in a corner, because the thing being
        said is that the step is finished, and a small mark beside a form still
        reads as a form. Drawn over everything, including the notification, so
        nothing shows through the celebration.
      */}
      <g
        opacity={verified ? 1 : 0}
        style={{ transition: "opacity 320ms linear" }}
        pointerEvents="none"
      >
        {/* --color-ok is the palette's functional green, and functional is
            exactly what this is: it marks a step that passed. The three brand
            colours stay blue and white (docs/design/02). */}
        <rect x="14" y="14" width="292" height="172" rx="10" fill="var(--color-ok)" />
        <circle cx="160" cy="92" r="30" fill="rgba(255,255,255,0.16)" />
        {/* Drawn rather than faded in, so the tick reads as an act. 46 is a
            little over the path length, which keeps it fully hidden at rest. */}
        <path
          d="M146 92l10 10 20-22"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="46"
          strokeDashoffset={verified ? 0 : 46}
          style={{ transition: `stroke-dashoffset 420ms ${EASE} 140ms` }}
        />
        <text
          x="160"
          y="150"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="#fff"
        >
          Number verified
        </text>
      </g>
    </svg>
  );
}

/** Pointer that glides between beats. Same trick as connectScenes. */
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
