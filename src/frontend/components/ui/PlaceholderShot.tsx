import { cn } from "@/lib/cn";

/**
 * Large stand-in for a product screenshot.
 *
 * These are placeholders on purpose. Rather than grey boxes, each variant draws
 * a rough skeleton of the real screen so page rhythm, crop, and aspect ratio are
 * already correct when a screenshot drops in. Swap the whole component for a
 * <Image> at that point and keep the same wrapper classes.
 *
 * The corner tag is intentionally visible so nobody ships a placeholder by
 * accident. Delete it with the skeleton.
 */
export function PlaceholderShot({
  variant,
  title,
  caption,
  className,
}: {
  variant: "dashboard" | "calendar" | "inbox" | "syllabus";
  title: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={cn("group relative", className)}>
      <div className="overflow-hidden rounded-[1.4rem] bg-white shadow-lift ring-1 ring-line">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line-soft bg-sky-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-sky-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-sky-200" />
          <div className="ml-3 flex h-6 flex-1 items-center rounded-md bg-white px-3 text-[0.7rem] font-medium text-body-soft ring-1 ring-line-soft">
            {title}
          </div>
        </div>

        <div className="relative aspect-[16/10] w-full bg-white">
          {variant === "dashboard" ? <DashboardSkeleton /> : null}
          {variant === "calendar" ? <CalendarSkeleton /> : null}
          {variant === "inbox" ? <InboxSkeleton /> : null}
          {variant === "syllabus" ? <SyllabusSkeleton /> : null}

          <span className="absolute bottom-3 right-3 rounded-md bg-ink-900/85 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wider text-sky-200">
            Screenshot placeholder
          </span>
        </div>
      </div>
      {caption ? (
        <figcaption className="mt-4 text-center text-[0.9rem] text-body-soft">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

function Bar({ w, tone = "soft" }: { w: string; tone?: "soft" | "mid" | "ink" }) {
  const tones = { soft: "bg-line-soft", mid: "bg-sky-200", ink: "bg-ink-800/15" };
  return <span className={cn("block h-2.5 rounded-full", tones[tone])} style={{ width: w }} />;
}

function DashboardSkeleton() {
  return (
    <div className="flex h-full">
      <div className="hidden w-[22%] flex-col gap-3 border-r border-line-soft bg-sky-50/70 p-4 sm:flex">
        <Bar w="70%" tone="mid" />
        <div className="mt-3 flex flex-col gap-3">
          <Bar w="85%" />
          <Bar w="65%" />
          <Bar w="78%" />
          <Bar w="55%" />
        </div>
      </div>
      {/* Column height is fixed by the figure's aspect ratio, so the chart and
          the row list share what is left via flex rather than each guessing. */}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="flex flex-col gap-2">
          <Bar w="34%" tone="ink" />
          <Bar w="22%" />
        </div>
        <div className="mt-5 grid shrink-0 grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-line-soft p-3"
              style={{ animation: `bubble-in .6s var(--ease-out-soft) both`, animationDelay: `${i * 90}ms` }}
            >
              <Bar w="55%" />
              <div className="mt-3">
                <Bar w="40%" tone="mid" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 min-h-0 flex-[3] rounded-xl border border-line-soft p-4">
          <svg viewBox="0 0 320 90" className="h-full w-full" fill="none" preserveAspectRatio="none">
            <path
              d="M0 70 L45 58 L90 62 L135 40 L180 46 L225 24 L270 30 L320 12"
              stroke="var(--color-brand-500)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="draw-line"
              style={{ ["--dash" as string]: "420" }}
              data-shown="true"
            />
            {[45, 135, 225, 320].map((x, i) => (
              <circle key={x} cx={x} cy={[58, 40, 24, 12][i]} r="3.5" fill="var(--color-brand-600)" />
            ))}
          </svg>
        </div>

        {/* Upcoming-work list, so the lower half is not one empty chart box */}
        <div className="mt-3 flex min-h-0 flex-[2] flex-col justify-start gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2"
              style={{ animation: "bubble-in .5s var(--ease-out-soft) both", animationDelay: `${350 + i * 110}ms` }}
            >
              <span className="h-5 w-5 shrink-0 rounded-md bg-sky-200" />
              <Bar w={`${52 - i * 7}%`} />
              <span className="ml-auto">
                <Bar w="2.6rem" tone="mid" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  const events: Record<number, { w: string; tone: "mid" | "ink" }[]> = {
    2: [{ w: "80%", tone: "mid" }],
    5: [{ w: "70%", tone: "ink" }],
    9: [{ w: "85%", tone: "mid" }],
    12: [{ w: "60%", tone: "mid" }, { w: "75%", tone: "ink" }],
    17: [{ w: "78%", tone: "ink" }],
    20: [{ w: "66%", tone: "mid" }],
    26: [{ w: "82%", tone: "ink" }],
  };
  return (
    <div className="h-full p-4">
      <div className="mb-3 grid grid-cols-7 gap-1.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[0.62rem] font-semibold text-body-soft">
            {d}
          </div>
        ))}
      </div>
      <div className="grid h-[85%] grid-cols-7 grid-rows-5 gap-1.5">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="rounded-md border border-line-soft p-1">
            <span className="block text-[0.55rem] font-medium text-body-soft">{i + 1}</span>
            <div className="mt-1 flex flex-col gap-1">
              {(events[i] ?? []).map((e, j) => (
                <span
                  key={j}
                  className={cn("block h-1.5 rounded-sm", e.tone === "ink" ? "bg-ink-700" : "bg-sky-400")}
                  style={{
                    width: e.w,
                    animation: "bubble-in .5s var(--ease-out-soft) both",
                    animationDelay: `${i * 22}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="h-full p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bar w="28%" tone="ink" />
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2.5",
              i === 1 && "bg-sky-50 ring-1 ring-sky-300",
            )}
            style={{ animation: "bubble-in .5s var(--ease-out-soft) both", animationDelay: `${i * 70}ms` }}
          >
            <span className="h-6 w-6 shrink-0 rounded-full bg-sky-200" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Bar w={`${58 - i * 4}%`} tone={i === 1 ? "ink" : "soft"} />
              <Bar w={`${78 - i * 3}%`} />
            </div>
            {i === 1 ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SyllabusSkeleton() {
  return (
    <div className="flex h-full gap-3 p-4">
      <div className="flex w-1/2 flex-col gap-2 rounded-lg border border-line-soft p-3">
        <Bar w="52%" tone="ink" />
        <Bar w="88%" />
        <Bar w="80%" />
        <Bar w="84%" />
        <div className="mt-1 h-px bg-line-soft" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            <Bar w={`${72 - i * 6}%`} />
          </div>
        ))}
      </div>
      <div className="flex w-1/2 flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg border border-line-soft bg-sky-50/60 px-3 py-2.5"
            style={{ animation: "bubble-in .6s var(--ease-out-soft) both", animationDelay: `${300 + i * 140}ms` }}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-[0.55rem] font-bold text-ink-800 ring-1 ring-line">
              {["12", "19", "26", "03"][i]}
            </span>
            <div className="flex flex-1 flex-col gap-1.5">
              <Bar w={`${64 - i * 5}%`} tone="mid" />
              <Bar w={`${44 - i * 4}%`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
