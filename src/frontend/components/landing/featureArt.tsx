import { cn } from "@/lib/cn";

/**
 * Art for the feature wall. One small scene per tile.
 *
 * These replaced a set of line icons, which was the wrong instinct: a generic
 * outline glyph beside a feature name says nothing the name did not already
 * say, and twenty of them read as filler. Apple's tiles carry a scrap of the
 * actual product, so these do too. Every piece here shows real content, a room
 * number changing, a 35% weighting, a 3:12am timestamp, and each is specific
 * enough that you could tell what the feature does with the label covered.
 *
 * Shared vocabulary keeps twenty-six of them coherent: white cards on the tile
 * grey, brand blue for the thing being acted on, the functional hues only for
 * pass and fail, and tiny type around 0.42rem so the art reads as a miniature
 * interface rather than a diagram.
 */

const BOX = "flex items-center justify-center gap-1.5";

function Card({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("flex flex-col gap-[3px] rounded-[0.4rem] bg-white p-1.5", className)}>
      {children}
    </span>
  );
}

function Line({ w, tone = "line" }: { w: string; tone?: "line" | "brand" | "soft" }) {
  return (
    <span
      className={cn(
        "block h-[3px] rounded-full",
        tone === "brand" ? "bg-brand-500" : tone === "soft" ? "bg-line" : "bg-line",
      )}
      style={{ width: w }}
    />
  );
}

function Chip({
  children,
  tone = "brand",
}: {
  children: React.ReactNode;
  tone?: "brand" | "muted" | "alert" | "ok";
}) {
  return (
    <span
      className={cn(
        "rounded-[0.3rem] px-1.5 py-[3px] text-[0.42rem] font-bold leading-none",
        tone === "brand"
          ? "bg-brand-600 text-white"
          : tone === "alert"
            ? "bg-[var(--color-alert)] text-white"
            : tone === "ok"
              ? "bg-[var(--color-ok)] text-white"
              : "bg-white text-body-soft",
      )}
    >
      {children}
    </span>
  );
}

function Arrow() {
  return (
    <svg width="12" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M0 4h11m0 0L8 1m3 3L8 7"
        stroke="var(--color-sky-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ pieces */

export function ArtSyllabus() {
  return (
    <span className={BOX}>
      <Card className="w-[2.1rem]">
        <Line w="100%" />
        <Line w="72%" />
        <Line w="88%" />
        <Line w="55%" />
      </Card>
      <Arrow />
      <span className="flex gap-1">
        <Chip>12</Chip>
        <Chip>19</Chip>
        <Chip>26</Chip>
      </span>
    </span>
  );
}

export function ArtExam() {
  return (
    <Card className="w-[2.6rem] items-center gap-0">
      <span className="w-full rounded-t-[0.2rem] bg-[var(--color-alert)] py-[2px] text-center text-[0.36rem] font-bold text-white">
        DEC
      </span>
      <span className="font-display text-[0.95rem] font-extrabold leading-tight text-ink-900">12</span>
    </Card>
  );
}

export function ArtLab() {
  return (
    <span className="flex items-end gap-[3px]">
      {[10, 16, 10, 22, 12].map((h, i) => (
        <span
          key={i}
          className={cn("w-[7px] rounded-[2px]", i === 3 ? "bg-brand-600" : "bg-white")}
          style={{ height: `${h + 8}px` }}
        />
      ))}
    </span>
  );
}

export function ArtRoom() {
  return (
    <span className={BOX}>
      <span className="rounded-[0.3rem] bg-white px-1.5 py-[3px] text-[0.42rem] font-bold text-body-soft line-through">
        CAB 235
      </span>
      <Arrow />
      <Chip>TORY 3-15</Chip>
    </span>
  );
}

export function ArtFinalWarning() {
  return (
    <span className="max-w-[9rem] rounded-[0.55rem] rounded-bl-[0.15rem] bg-[var(--color-alert)] px-2 py-1.5 text-[0.44rem] font-semibold leading-[1.35] text-white">
      Last call. This is 20% of the course and it closes at 11:59.
    </span>
  );
}

export function ArtGradeHistory() {
  return (
    <span className="flex items-end gap-[3px]">
      {[9, 13, 11, 18, 22].map((h, i) => (
        <span
          key={i}
          className={cn("w-[7px] rounded-[2px]", i === 4 ? "bg-brand-600" : "bg-white")}
          style={{ height: `${h + 6}px` }}
        />
      ))}
    </span>
  );
}

export function ArtDraft() {
  return (
    <span className={BOX}>
      <Card className="w-[3.2rem]">
        <Line w="90%" />
        <Line w="70%" />
        <Line w="46%" />
      </Card>
      <Chip>Approve</Chip>
    </span>
  );
}

export function ArtPdf() {
  return (
    <Card className="w-[2.4rem]">
      <span className="mb-[2px] w-fit rounded-[0.15rem] bg-[var(--color-alert)] px-1 py-[1px] text-[0.32rem] font-bold text-white">
        PDF
      </span>
      <Line w="100%" tone="brand" />
      <Line w="76%" />
      <Line w="88%" tone="brand" />
      <Line w="60%" />
    </Card>
  );
}

export function ArtQuietHours() {
  return (
    <span className="flex items-center gap-1.5 rounded-[0.4rem] bg-ink-900 px-2 py-1.5">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z"
          fill="var(--color-sky-400)"
        />
      </svg>
      <span className="text-[0.44rem] font-bold text-white">22:00 to 08:00</span>
    </span>
  );
}

export function ArtDigest() {
  return (
    <Card className="w-[3.4rem]">
      <span className="text-[0.34rem] font-bold uppercase tracking-wider text-body-soft">Mon</span>
      <Line w="92%" />
      <Line w="74%" />
      <Line w="84%" />
    </Card>
  );
}

export function ArtFiles() {
  return (
    <span className="relative h-[2.1rem] w-[3rem]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute h-[1.6rem] w-[2.1rem] rounded-[0.3rem] bg-white ring-1 ring-line"
          style={{ left: i * 9, top: i * 4, zIndex: 3 - i }}
        />
      ))}
    </span>
  );
}

export function ArtOvernight() {
  return (
    <span className="flex w-[8rem] flex-col gap-1 rounded-[0.4rem] bg-ink-900 px-2 py-1.5">
      <span className="flex items-center justify-between">
        <span className="text-[0.4rem] font-bold text-sky-300">3:12 AM</span>
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
      </span>
      <svg viewBox="0 0 100 14" className="w-full" aria-hidden="true">
        <path
          d="M0 11 12 9 24 10 36 5 48 7 60 3 72 6 84 2 100 4"
          fill="none"
          stroke="var(--color-sky-400)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function ArtStudyBlock() {
  return (
    <Card className="w-[2.4rem] gap-[2px]">
      <Line w="100%" tone="soft" />
      <span className="rounded-[0.15rem] bg-brand-600 px-1 py-[3px] text-center text-[0.34rem] font-bold text-white">
        7 to 9
      </span>
      <Line w="100%" tone="soft" />
    </Card>
  );
}

export function ArtTimezone() {
  return (
    <span className="flex items-center gap-1.5">
      {[
        { t: "9:41", label: "YEG" },
        { t: "11:41", label: "TOR" },
      ].map((c) => (
        <Card key={c.label} className="w-[2.1rem] items-center gap-0">
          <span className="font-display text-[0.52rem] font-extrabold text-ink-900">{c.t}</span>
          <span className="text-[0.32rem] font-bold uppercase text-body-soft">{c.label}</span>
        </Card>
      ))}
    </span>
  );
}

export function ArtOfficeHours() {
  return (
    <span className="flex gap-1">
      <Chip tone="muted">Tue 2:00</Chip>
      <Chip>Tue 3:30</Chip>
      <Chip tone="muted">Thu 11:00</Chip>
    </span>
  );
}

export function ArtGroup() {
  return (
    <span className="flex items-center">
      {["A", "M", "K"].map((n, i) => (
        <span
          key={n}
          className="-ml-1.5 grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full bg-brand-600 text-[0.44rem] font-bold text-white ring-2 ring-line-soft first:ml-0"
          style={{ zIndex: 3 - i }}
        >
          {n}
        </span>
      ))}
      <span className="ml-1.5">
        <Chip tone="ok">Nudged</Chip>
      </span>
    </span>
  );
}

export function ArtCancelled() {
  return (
    <Card className="w-[3.6rem] gap-[3px]">
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-alert)]" />
        <span className="text-[0.4rem] font-bold text-body-soft line-through">ECON 101</span>
      </span>
      <Line w="70%" />
    </Card>
  );
}

export function ArtRank() {
  return (
    <span className="flex w-[7.5rem] flex-col gap-[3px]">
      {[
        { w: "94%", n: "35%" },
        { w: "62%", n: "20%" },
        { w: "34%", n: "5%" },
      ].map((r) => (
        <span key={r.n} className="flex items-center gap-1.5">
          <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-white">
            <span className="block h-full rounded-full bg-brand-600" style={{ width: r.w }} />
          </span>
          <span className="w-[1.4rem] text-right text-[0.38rem] font-bold text-body-soft">{r.n}</span>
        </span>
      ))}
    </span>
  );
}

export function ArtPlatforms() {
  return (
    <span className="flex items-end gap-1.5">
      <span className="h-[2.2rem] w-[1.3rem] rounded-[0.28rem] bg-ink-900 p-[2px]">
        <span className="block h-full w-full rounded-[0.2rem] bg-white" />
      </span>
      <span className="h-[1.9rem] w-[1.2rem] rounded-[0.22rem] bg-ink-800 p-[2px]">
        <span className="block h-full w-full rounded-[0.16rem] bg-sky-200" />
      </span>
    </span>
  );
}

export function ArtStop() {
  return (
    <span className="rounded-[0.55rem] rounded-br-[0.15rem] bg-brand-600 px-2.5 py-1.5 font-display text-[0.6rem] font-extrabold tracking-wide text-white">
      STOP
    </span>
  );
}

export function ArtWeighting() {
  const c = 2 * Math.PI * 13;
  return (
    <span className="relative grid h-[2.4rem] w-[2.4rem] place-items-center">
      <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="16" cy="16" r="13" fill="none" stroke="#fff" strokeWidth="5" />
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="5"
          strokeDasharray={`${c * 0.35} ${c}`}
        />
      </svg>
      <span className="font-display text-[0.5rem] font-extrabold text-ink-900">35%</span>
    </span>
  );
}

export function ArtRecheck() {
  return (
    <span className={BOX}>
      <span className="rounded-[0.3rem] bg-white px-1.5 py-[3px] text-[0.42rem] font-bold text-body-soft line-through">
        Fri 14
      </span>
      <Arrow />
      <Chip tone="ok">Sun 16</Chip>
    </span>
  );
}

export function ArtThreads() {
  return (
    <span className={BOX}>
      <Card className="w-[2rem] gap-[2px]">
        {[100, 82, 94, 70, 88].map((w, i) => (
          <Line key={i} w={`${w}%`} />
        ))}
      </Card>
      <Arrow />
      <Card className="w-[2rem]">
        <Line w="100%" tone="brand" />
        <Line w="64%" tone="brand" />
      </Card>
    </span>
  );
}

export function ArtAnnounce() {
  return (
    <Card className="w-[3.6rem]">
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
        <span className="text-[0.38rem] font-bold text-ink-900">PSYC 258</span>
      </span>
      <Line w="88%" />
      <Line w="62%" />
    </Card>
  );
}

export function ArtCountdown() {
  return (
    <span className="flex items-center gap-1">
      {[
        { v: "02", l: "D" },
        { v: "14", l: "H" },
        { v: "09", l: "M" },
      ].map((u) => (
        <span key={u.l} className="rounded-[0.28rem] bg-ink-900 px-1.5 py-1 text-center">
          <span className="block font-display text-[0.5rem] font-extrabold leading-none text-white">
            {u.v}
          </span>
          <span className="block text-[0.3rem] font-bold text-sky-300">{u.l}</span>
        </span>
      ))}
    </span>
  );
}

export function ArtProtect() {
  return (
    <Card className="w-[2.6rem] items-center">
      <span className="rounded-[0.15rem] bg-ink-900 px-1.5 py-[3px] text-[0.34rem] font-bold text-white">
        Off limits
      </span>
      <Line w="100%" tone="soft" />
      <Line w="100%" tone="soft" />
    </Card>
  );
}
