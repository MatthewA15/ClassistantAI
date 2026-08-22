"use client";

import {
  Bubble,
  CounterBadge,
  Cursor,
  PhoneFrame,
  SceneFrame,
  Stage,
  Typing,
  useSceneClock,
} from "@/components/landing/sceneParts";
import { cn } from "@/lib/cn";

/**
 * "Fast and Curious": the whole round trip, on a loop.
 *
 * You ask from your phone, it signs in to the portal on a desktop, opens
 * Assignments, takes everything, and answers back on the phone. A live
 * countdown runs the entire time so the point lands: five seconds of work you
 * did not do.
 *
 * The work window is **exactly five real seconds**. It used to be eight while
 * the badge counted "5", which is fine with a whole number and a lie the moment
 * you show hundredths. If you re-cut the beats, keep WORK_END - WORK_START at
 * 5000 or change the claim.
 */

const CYCLE = 9000;
const TICK = 50; // fine enough for the hundredths to move
const WORK_START = 1500;
const WORK_END = 6500;
const WORK_SECONDS = (WORK_END - WORK_START) / 1000;

type View = "ask" | "login" | "signing" | "assignments" | "copied" | "answer";

function viewAt(t: number): View {
  if (t < WORK_START) return "ask";
  if (t < 3000) return "login";
  if (t < 3900) return "signing";
  if (t < 5300) return "assignments";
  if (t < WORK_END) return "copied";
  return "answer";
}

export function SyllabusScene() {
  const t = useSceneClock(CYCLE, 7200, TICK);
  const view = viewAt(t);
  const onDesk = view === "login" || view === "signing" || view === "assignments" || view === "copied";

  // Primed at 5.00 before the work starts, 0.00 once the answer lands.
  const remaining = Math.min(WORK_SECONDS, Math.max(0, (WORK_END - t) / 1000));

  return (
    <SceneFrame caption="You ask. It signs in, reads the portal, and answers.">
      <CounterBadge value={remaining} max={WORK_SECONDS} unit="Secs" decimals={2} />

      <Stage show={view === "ask"}>
        <PhoneFrame>
          <Bubble mine>what&rsquo;s due this week?</Bubble>
          <Typing />
        </PhoneFrame>
      </Stage>

      <Stage show={onDesk}>
        <Browser view={view} />
      </Stage>

      <Stage show={view === "answer"}>
        <PhoneFrame>
          <Bubble mine>what&rsquo;s due this week?</Bubble>
          <Bubble>
            4 things. PSYC essay Thu 11:59, STAT lab Fri, ECON quiz Sat, plus the CMPT group
            milestone Sun. All on your calendar.
          </Bubble>
        </PhoneFrame>
      </Stage>
    </SceneFrame>
  );
}

function Browser({ view }: { view: View }) {
  const signedIn = view === "assignments" || view === "copied";

  const cursor =
    view === "login"
      ? { left: "46%", top: "52%" }
      : view === "signing"
        ? { left: "50%", top: "68%" }
        : view === "assignments"
          ? { left: "24%", top: "54%" }
          : { left: "72%", top: "62%" };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1rem] bg-white shadow-lift ring-1 ring-line">
      <div className="flex items-center gap-1.5 border-b border-line-soft bg-paper px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
        <span className="ml-2 flex-1 truncate rounded bg-white px-2 py-0.5 font-mono text-[0.5rem] text-body-soft ring-1 ring-line-soft">
          portal.yourschool.ca{signedIn ? "/assignments" : "/login"}
        </span>
      </div>

      {signedIn ? <PortalDashboard copied={view === "copied"} /> : <PortalLogin busy={view === "signing"} />}

      <Cursor {...cursor} />
    </div>
  );
}

function PortalLogin({ busy }: { busy: boolean }) {
  return (
    <div className="grid h-full place-items-center p-4">
      <div className="w-[62%] rounded-xl bg-white p-4 shadow-soft ring-1 ring-line">
        <span className="block h-1.5 w-16 rounded-full bg-ink-800/70" />
        <div className="mt-3 flex flex-col gap-2">
          <span className="block rounded-md bg-sky-50 px-2 py-1.5 font-mono text-[0.5rem] text-body-soft ring-1 ring-line-soft">
            you@yourschool.ca
          </span>
          <span className="flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1.5 ring-1 ring-line-soft">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-full bg-body-soft"
                style={{ animation: "bubble-in .3s var(--ease-out-soft) both", animationDelay: `${i * 70}ms` }}
              />
            ))}
          </span>
        </div>
        <span
          className={cn(
            "mt-3 block rounded-md py-1.5 text-center text-[0.55rem] font-bold text-white transition-colors",
            busy ? "bg-brand-700" : "bg-brand-600",
          )}
        >
          {busy ? "Signing in..." : "Sign in"}
        </span>
      </div>
    </div>
  );
}

function PortalDashboard({ copied }: { copied: boolean }) {
  const nav = ["Overview", "Courses", "Assignments", "Grades"];
  const rows = ["PSYC 258 essay", "STAT 151 lab 4", "ECON 101 quiz", "CMPT 276 milestone"];

  return (
    <div className="flex h-full">
      <div className="flex w-[30%] flex-col gap-1 border-r border-line-soft bg-paper p-2">
        {nav.map((item) => (
          <span
            key={item}
            className={cn(
              "rounded px-1.5 py-1 text-[0.52rem] font-semibold transition-colors",
              item === "Assignments" ? "bg-brand-600 text-white" : "text-body-soft",
            )}
          >
            {item}
          </span>
        ))}
      </div>

      <div className="relative flex-1 p-2.5">
        <span className="block h-1.5 w-14 rounded-full bg-ink-800/60" />
        <div className="mt-2 flex flex-col gap-1.5">
          {rows.map((row, i) => (
            <span
              key={row}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-[0.52rem] transition-colors duration-300",
                copied ? "bg-sky-200 text-ink-900" : "bg-sky-50 text-body ring-1 ring-line-soft",
              )}
              style={{ animation: "bubble-in .4s var(--ease-out-soft) both", animationDelay: `${i * 130}ms` }}
            >
              {row}
              <span className={cn("font-mono", copied ? "text-ink-800" : "text-body-soft")}>
                {["Thu", "Fri", "Sat", "Sun"][i]}
              </span>
            </span>
          ))}
        </div>

        {copied ? (
          <span
            className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-ink-900 px-2.5 py-1 text-[0.52rem] font-bold text-white"
            style={{ animation: "bubble-in .3s var(--ease-out-soft) both" }}
          >
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 6.4 4.6 9 10 3.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Copied all 4
          </span>
        ) : null}
      </div>
    </div>
  );
}
