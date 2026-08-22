import { LogoMark } from "@/components/brand/LogoMark";
import { cn } from "@/lib/cn";

type Msg = { from: "agent" | "student"; text: string };

const THREAD: Msg[] = [
  { from: "agent", text: "STAT 151 assignment 3 is due Friday at 11:59pm. You have not opened it yet." },
  { from: "student", text: "how long will it take" },
  {
    from: "agent",
    text: "Your last three took about 4 hours each. Start Wednesday evening and you are fine. Want me to block 7 to 9?",
  },
  { from: "student", text: "yeah do it" },
  { from: "agent", text: "Blocked. Also Prof. Adeyemi just posted the midterm. You got 78." },
];

/**
 * The hero visual. Classistant lives in the Messages app, so the product shot is
 * a text thread rather than a dashboard. Bubbles stagger in on load and the
 * typing indicator keeps pulsing, which makes the thread read as live without
 * needing a JS animation loop.
 */
export function PhoneThread({ className }: { className?: string }) {
  let delay = 380;

  return (
    <div className={cn("relative", className)}>
      <div className="relative mx-auto w-full max-w-[19.5rem] rounded-[2.4rem] bg-ink-900 p-2.5 shadow-[0_40px_80px_-30px_rgb(6_32_58_/_0.55)] ring-1 ring-ink-800">
        <div className="relative overflow-hidden rounded-[1.95rem] bg-white">
          {/* Speaker pill */}
          <div className="absolute left-1/2 top-2.5 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-ink-900/15" />

          {/* Conversation header */}
          <div className="flex items-center gap-2.5 border-b border-line-soft bg-sky-50/80 px-4 pb-3 pt-7 backdrop-blur">
            <LogoMark size={26} />
            <div className="leading-tight">
              <p className="font-display text-[0.85rem] font-bold text-ink-900">Classistant</p>
              <p className="text-[0.65rem] text-body-soft">Today, 4:12 PM</p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 px-3.5 py-4">
            {THREAD.map((msg, i) => {
              delay += 620;
              const mine = msg.from === "student";
              return (
                <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.78rem] leading-[1.45]",
                      mine
                        ? "rounded-br-md bg-brand-600 text-white"
                        : "rounded-bl-md bg-sky-100 text-ink-900",
                    )}
                    style={{
                      animation: "bubble-in .55s var(--ease-out-soft) both",
                      animationDelay: `${delay}ms`,
                    }}
                  >
                    {msg.text}
                  </p>
                </div>
              );
            })}

            {/* Persistent typing indicator, so the thread never looks finished */}
            <div
              className="flex justify-start"
              style={{ animation: "bubble-in .5s var(--ease-out-soft) both", animationDelay: `${delay + 700}ms` }}
            >
              <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-sky-100 px-3.5 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-ink-700/45 motion-safe:animate-blink"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cards that fly alongside the phone, showing what the agent just did.
          Each is pinned to a row where the thread's own bubble is on the OTHER
          side, so the card overlaps empty phone, never a message. Move one and
          you have to re-check it against THREAD above. */}
      <FloatingCard
        className="absolute -left-8 top-[32%] hidden lg:flex"
        delay="0s"
        icon={<CalendarGlyph />}
        title="Study block added"
        sub="Wed 7:00 to 9:00 PM"
      />
      <FloatingCard
        className="absolute -right-8 bottom-[6%] hidden lg:flex"
        delay="1.8s"
        icon={<GradeGlyph />}
        title="New grade posted"
        sub="STAT 151 midterm, 78%"
      />
    </div>
  );
}

function FloatingCard({
  className,
  delay,
  icon,
  title,
  sub,
}: {
  className?: string;
  delay: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div
      className={cn(
        "items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-soft ring-1 ring-line backdrop-blur motion-safe:animate-float-slow",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100">{icon}</span>
      <span className="leading-tight">
        <span className="block text-[0.78rem] font-semibold text-ink-900">{title}</span>
        <span className="block text-[0.7rem] text-body-soft">{sub}</span>
      </span>
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="13.5" rx="3" stroke="var(--color-brand-600)" strokeWidth="1.6" />
      <path d="M2.5 8h15" stroke="var(--color-brand-600)" strokeWidth="1.6" />
      <path d="M6.5 2.5v3M13.5 2.5v3" stroke="var(--color-brand-600)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6" y="10.5" width="5" height="2.6" rx="1.3" fill="var(--color-sky-500)" />
    </svg>
  );
}

function GradeGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 12.5 L7.5 15.5 L16 5.5"
        stroke="var(--color-brand-600)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="8.5" stroke="var(--color-sky-400)" strokeWidth="1.4" />
    </svg>
  );
}
