"use client";

import {
  Bubble,
  CounterBadge,
  Cursor,
  PhoneFrame,
  SceneFrame,
  Stage,
  useSceneClock,
} from "@/components/landing/sceneParts";
import { cn } from "@/lib/cn";

/**
 * "It reads the inbox you stopped opening", on a loop.
 *
 * Compose and send, then tear through a stack of unread mail, then the one
 * sentence that actually mattered arrives as a text. The unread counter falling
 * to zero is the whole argument: it is not that the agent reads your mail, it
 * is that it reads all of it and only forwards the part that changes your week.
 *
 * Rows are read on a derived index rather than per-row timers, so "really fast"
 * is one number (READ_EVERY) instead of eight staggered animations.
 */

const CYCLE = 9000;
const TICK = 60;

const COMPOSE_END = 2600;
const READING_START = COMPOSE_END;
const READ_EVERY = 260; // ms per email. Deliberately faster than a human could.
// 8 emails x READ_EVERY is ~2.1s, plus a short beat to register "done".
// Any longer and the counter sits at 0 with nothing happening.
const READING_END = 5400;

const EMAILS = [
  { from: "Prof. Chim", subject: "Assignment 4 deadline change" },
  { from: "PSYC 258", subject: "Reading week schedule" },
  { from: "Registrar", subject: "Winter enrolment opens" },
  { from: "STAT 151", subject: "Lab 4 posted" },
  { from: "Group project", subject: "Re: meeting Thursday?" },
  { from: "Library", subject: "Item due soon" },
  { from: "ECON 101", subject: "Quiz 3 marks released" },
  { from: "Campus Rec", subject: "Drop-in hours" },
];

type View = "compose" | "reading" | "text";

function viewAt(t: number): View {
  if (t < COMPOSE_END) return "compose";
  if (t < READING_END) return "reading";
  return "text";
}

export function InboxScene() {
  const t = useSceneClock(CYCLE, 7000, TICK);
  const view = viewAt(t);

  const read =
    view === "compose"
      ? 0
      : Math.min(EMAILS.length, Math.floor((t - READING_START) / READ_EVERY));
  const unread = EMAILS.length - read;

  return (
    <SceneFrame caption="It opens every one, and forwards the sentence that matters.">
      {view === "reading" ? (
        <CounterBadge value={unread} max={EMAILS.length} unit="Unread" />
      ) : null}

      <Stage show={view === "compose"}>
        <Compose t={t} />
      </Stage>

      <Stage show={view === "reading"}>
        <Inbox read={read} />
      </Stage>

      <Stage show={view === "text"}>
        <PhoneFrame>
          <Bubble>
            Professor Chim extended Assignment 4&rsquo;s deadline from Friday to Sunday. Moved on
            your calendar.
          </Bubble>
        </PhoneFrame>
      </Stage>
    </SceneFrame>
  );
}

/* --------------------------------------------------------------- compose */

function Compose({ t }: { t: number }) {
  // Body types itself in, then the send button fires at the end of the beat.
  const typed = Math.min(3, Math.floor(t / 500));
  const sending = t > COMPOSE_END - 700;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1rem] bg-white shadow-lift ring-1 ring-line">
      <div className="flex items-center gap-1.5 border-b border-line-soft bg-paper px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
        <span className="ml-2 flex-1 truncate rounded bg-white px-2 py-0.5 font-mono text-[0.5rem] text-body-soft ring-1 ring-line-soft">
          mail.google.com/compose
        </span>
      </div>

      <div className="grid h-[calc(100%-2.1rem)] place-items-center p-3">
        <div className="w-full rounded-lg bg-paper p-3 ring-1 ring-line-soft">
          <p className="text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-body-soft">
            New message
          </p>
          <p className="mt-1.5 font-mono text-[0.52rem] text-ink-800">
            To: chim@yourschool.ca
          </p>
          <p className="mt-1 text-[0.55rem] font-semibold text-ink-900">
            Re: Assignment 4 extension
          </p>

          <div className="mt-2 flex flex-col gap-1">
            {[86, 74, 52].map((w, i) => (
              <span
                key={w}
                className={cn(
                  "block h-1.5 rounded-full bg-sky-200 transition-opacity duration-200",
                  i < typed ? "opacity-100" : "opacity-0",
                )}
                style={{ width: `${w}%` }}
              />
            ))}
          </div>

          <span
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.55rem] font-bold text-white transition-colors",
              sending ? "bg-brand-700" : "bg-brand-600",
            )}
          >
            {sending ? "Sent" : "Send"}
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              {sending ? (
                <path d="M2 6.4 4.6 9 10 3.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M1.5 6h8m0 0L6.5 3m3 3-3 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </span>
        </div>
      </div>

      <Cursor left={sending ? "22%" : "62%"} top={sending ? "74%" : "52%"} />
    </div>
  );
}

/* ----------------------------------------------------------------- inbox */

function Inbox({ read }: { read: number }) {
  // The pointer rides the row currently being opened.
  const row = Math.min(EMAILS.length - 1, read);
  const rowTop = 26 + row * 8.6;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1rem] bg-white shadow-lift ring-1 ring-line">
      <div className="flex items-center gap-1.5 border-b border-line-soft bg-paper px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
        <span className="ml-2 flex-1 truncate rounded bg-white px-2 py-0.5 font-mono text-[0.5rem] text-body-soft ring-1 ring-line-soft">
          mail.google.com/inbox
        </span>
      </div>

      <div className="flex flex-col gap-[3px] p-2">
        {EMAILS.map((mail, i) => {
          const isRead = i < read;
          const isOpen = i === read;
          return (
            <span
              key={mail.subject}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-[0.5rem] transition-all duration-150",
                isRead ? "bg-white text-body-soft" : "bg-sky-50 text-ink-900",
                isOpen && "ring-1 ring-brand-500",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150",
                  isRead ? "bg-transparent" : "bg-brand-600",
                )}
              />
              <span className={cn("w-[28%] shrink-0 truncate", !isRead && "font-bold")}>
                {mail.from}
              </span>
              <span className={cn("flex-1 truncate", !isRead && "font-semibold")}>
                {mail.subject}
              </span>
            </span>
          );
        })}
      </div>

      <Cursor left="46%" top={`${rowTop}%`} />
    </div>
  );
}
