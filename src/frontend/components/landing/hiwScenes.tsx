/**
 * Four looping stick-figure scenes, one per step of How it works.
 *
 * All share a 9s cycle and one drawing language: 4.2 stroke, round caps and
 * joins, ink for structure, brand blue for the thing being acted on, and the
 * two functional colours (alert / ok) only where the story needs a pass or a
 * fail. Keyframes live in globals.css; the percentages there are storyboard
 * beats, not arbitrary numbers.
 *
 * Every scene is decorative and marked aria-hidden. The step title and body
 * carry the meaning, so nothing is lost with animation off, and the whole set
 * freezes under prefers-reduced-motion via the global reduced-motion block.
 */

const CYCLE = "9s";

const stroke = {
  stroke: "var(--color-ink-800)",
  strokeWidth: 4.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

function Scene({
  children,
  viewBox = "0 0 170 110",
}: {
  children: React.ReactNode;
  /** Per-scene crop. Tighter boxes enlarge the figure without re-plotting it. */
  viewBox?: string;
}) {
  return (
    <svg viewBox={viewBox} className="h-full w-full" aria-hidden="true" role="presentation">
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- 1. sign in */

/** Types, gets rejected, scratches his head, tries again, gets in. */
export function SceneSignIn() {
  const pose = (name: string) => ({ animation: `${name} ${CYCLE} steps(1,end) infinite` });

  return (
    // Cropped in, so the figure is not a speck in the corner of the card.
    <Scene viewBox="8 10 156 88">
      {/* desk */}
      <path d="M58 86H166" {...stroke} />
      {/* monitor */}
      <rect x="106" y="22" width="56" height="44" rx="6" {...stroke} />
      <rect
        x="111"
        y="27"
        width="46"
        height="34"
        rx="3"
        stroke="none"
        style={{ animation: `hiw-screen ${CYCLE} ease-in-out infinite` }}
      />
      <path d="M134 66v14M122 80h24" {...stroke} />
      {/* keyboard */}
      <rect x="62" y="74" width="34" height="8" rx="4" {...stroke} />

      {/* body */}
      <circle cx="32" cy="27" r="11" {...stroke} />
      <path d="M32 38v28M32 66 20 92M32 66l12 26" {...stroke} />

      {/* pose: typing (used twice) */}
      <g style={pose("hiw-pose-type-a")}>
        <g style={{ animation: `hiw-bob .45s ease-in-out infinite` }}>
          <path d="M32 46 52 60 70 74M32 46 56 56 78 72" {...stroke} />
        </g>
      </g>
      <g style={pose("hiw-pose-type-b")}>
        <g style={{ animation: `hiw-bob .45s ease-in-out infinite` }}>
          <path d="M32 46 52 60 70 74M32 46 56 56 78 72" {...stroke} />
        </g>
      </g>

      {/* pose: stuck, scratching */}
      <g style={pose("hiw-pose-scratch")}>
        <path d="M32 46 24 62 30 74" {...stroke} />
        <path d="M32 46 50 40 38 22" {...stroke} />
      </g>

      {/* pose: both hands up */}
      <g style={pose("hiw-pose-cheer")}>
        <g style={{ animation: `hiw-cheer-hop .5s ease-in-out infinite` }}>
          <path d="M32 46 16 32 12 16M32 46 48 32 52 16" {...stroke} />
        </g>
      </g>
    </Scene>
  );
}

/* ----------------------------------------------------------- 2. reads it all */

/** Cursor sweeps a line, highlights it, a copy chip pops. Three times over. */
export function SceneReads() {
  const lines = [
    { y: 34, w: 82 },
    { y: 50, w: 66 },
    { y: 66, w: 74 },
  ];

  return (
    <Scene>
      <rect x="14" y="12" width="128" height="80" rx="7" {...stroke} />

      {lines.map((line, i) => {
        const delay = `${i * 3}s`;
        return (
          <g key={line.y}>
            <rect
              x="26"
              y={line.y - 6}
              width={line.w}
              height="12"
              rx="3"
              fill="var(--color-sky-300)"
              style={{
                transformOrigin: `26px ${line.y}px`,
                animation: `hiw-sweep ${CYCLE} ease-out infinite`,
                animationDelay: delay,
              }}
            />
            <path
              d={`M26 ${line.y}h${line.w}`}
              stroke="var(--color-ink-800)"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            {/* copy chip */}
            <g
              style={{
                transformOrigin: `${26 + line.w + 14}px ${line.y}px`,
                animation: `hiw-pop ${CYCLE} var(--ease-out-soft) infinite`,
                animationDelay: delay,
              }}
            >
              <rect
                x={26 + line.w + 6}
                y={line.y - 8}
                width="16"
                height="16"
                rx="4"
                fill="var(--color-brand-600)"
              />
              <rect
                x={26 + line.w + 10}
                y={line.y - 4.5}
                width="7"
                height="8.5"
                rx="1.6"
                stroke="#fff"
                strokeWidth="2"
                fill="none"
              />
            </g>
          </g>
        );
      })}

      {/* cursor */}
      <g style={{ animation: `hiw-cursor ${CYCLE} var(--ease-out-soft) infinite` }}>
        <path
          d="M96 24l16 8-6.5 2.5L102 42z"
          fill="var(--color-ink-900)"
          stroke="var(--color-white)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>
    </Scene>
  );
}

/* ------------------------------------------------------------- 3. calendar */

/** Dates get taken: some struck out and red, some ticked and green. */
export function SceneCalendar() {
  const cols = 5;
  const cell = { w: 20, h: 17, gapX: 5, gapY: 5, x0: 24, y0: 40 };

  // index -> outcome. Everything else stays an empty day.
  const marks: Record<number, "x" | "check"> = {
    1: "x",
    4: "check",
    6: "check",
    9: "x",
    11: "check",
    13: "x",
  };

  return (
    <Scene>
      <rect x="14" y="12" width="142" height="86" rx="7" {...stroke} />
      <path d="M14 32h142M44 12v10M126 12v10" {...stroke} />

      {Array.from({ length: 15 }).map((_, i) => {
        const cx = cell.x0 + (i % cols) * (cell.w + cell.gapX);
        const cy = cell.y0 + Math.floor(i / cols) * (cell.h + cell.gapY);
        const mark = marks[i];
        const delay = `${(i % 6) * 1.4}s`;

        return (
          <g key={i}>
            <rect
              x={cx}
              y={cy}
              width={cell.w}
              height={cell.h}
              rx="3.5"
              stroke="var(--color-ink-800)"
              strokeWidth="2.6"
              fill="none"
              opacity="0.35"
            />
            {mark ? (
              <g
                style={{
                  transformOrigin: `${cx + cell.w / 2}px ${cy + cell.h / 2}px`,
                  animation: `hiw-mark ${CYCLE} var(--ease-out-soft) infinite`,
                  animationDelay: delay,
                }}
              >
                <rect
                  x={cx}
                  y={cy}
                  width={cell.w}
                  height={cell.h}
                  rx="3.5"
                  fill={mark === "x" ? "var(--color-alert)" : "var(--color-ok)"}
                />
                {mark === "x" ? (
                  <path
                    d={`M${cx + 6} ${cy + 5.5}l8 6M${cx + 14} ${cy + 5.5}l-8 6`}
                    stroke="#fff"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d={`M${cx + 5.5} ${cy + 8.5}l3.5 3.5 5.5-6.5`}
                    stroke="#fff"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
              </g>
            ) : null}
          </g>
        );
      })}
    </Scene>
  );
}

/* ------------------------------------------------------ 4. phone in a hand */

/** A hand holding a phone while the thread fills in. */
export function ScenePhone() {
  const bubbles = [
    { x: 62, y: 24, w: 34, mine: false },
    { x: 78, y: 40, w: 26, mine: true },
    { x: 62, y: 56, w: 30, mine: false },
    { x: 84, y: 72, w: 20, mine: true },
  ];

  return (
    <Scene viewBox="10 2 150 104">
      {/* phone */}
      <rect x="52" y="6" width="58" height="88" rx="11" {...stroke} />
      <path d="M72 12h18" {...stroke} />

      {bubbles.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height="11"
          rx="5.5"
          fill={b.mine ? "var(--color-brand-600)" : "var(--color-sky-300)"}
          style={{
            transformOrigin: `${b.mine ? b.x + b.w : b.x}px ${b.y + 5}px`,
            animation: `hiw-mark ${CYCLE} var(--ease-out-soft) infinite`,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}

      {/*
        Hand. Two earlier attempts failed for the same reason: matching curls on
        both edges read as brackets, and four straight lines off a spine read as
        a rake. Fingers only look like fingers when they have width and a
        rounded tip, so each is a filled capsule laid across the phone's edge,
        drawn after the bubbles so it clearly sits in front of the screen.
        The grip is asymmetric, as a real one is: fingers far side, thumb near
        side, wrist entering from one corner.
      */}
      {/* fill comes AFTER the spread; `stroke` carries fill:none and would
          otherwise overwrite it, leaving see-through fingers. */}
      {[28, 43, 58, 73].map((y) => (
        <rect key={y} x="38" y={y} width="24" height="11" rx="5.5" {...stroke} fill="#fff" />
      ))}
      {/* thumb lying along the near edge */}
      <rect
        x="98"
        y="52"
        width="26"
        height="11"
        rx="5.5"
        {...stroke}
        fill="#fff"
        transform="rotate(38 111 57)"
      />
      {/* wrist coming in from the bottom right */}
      <path d="M104 86q12 6 16 20" {...stroke} />
      <path d="M86 98q16 2 22 12" {...stroke} />
    </Scene>
  );
}
