"use client";

import { useEffect, useState } from "react";
import { LogoPlate } from "@/components/brand/LogoMark";
import { cn } from "@/lib/cn";

/**
 * Hero product shot: the agent's thread, replayed live on a real-looking
 * iMessage screen and a real-looking Google Messages screen in turn.
 *
 * Each cycle runs the full escalation, texts then a phone call, because the
 * call is the thing no competitor does and describing it in prose lands far
 * softer than watching the handset ring.
 *
 * The clock runs fast (roughly a simulated day per minute) and the handset
 * flips to dark mode between 18:00 and 06:00. Sunset is fixed at 6pm rather
 * than computed from the school's latitude: it costs nothing, reads exactly the
 * same to a viewer, and avoids shipping a solar-position table for a mockup.
 */

type Sender = "agent" | "me";
const SCRIPT: { from: Sender; text: string }[] = [
  { from: "agent", text: "STAT 151 assignment 3 is due Friday at 11:59pm. You have not opened it yet." },
  { from: "me", text: "how long will it take" },
  { from: "agent", text: "Your last three took about 4 hours each. Start Wednesday and you are fine. Want me to block 7 to 9?" },
  { from: "me", text: "yeah do it" },
  { from: "agent", text: "Blocked. Also Prof. Adeyemi just posted the midterm. You got 78." },
];

const PLATFORMS = ["ios", "android"] as const;
type Platform = (typeof PLATFORMS)[number];
type Phase = "chat" | "ringing" | "incall" | "ended";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Fast clock. ~7 simulated minutes every 260ms, so a day passes in about 53s. */
function useSimulatedClock(enabled: boolean) {
  const [minutes, setMinutes] = useState(9 * 60 + 41);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setMinutes((m) => (m + 7) % 1440), 260);
    return () => clearInterval(id);
  }, [enabled]);

  const hour = Math.floor(minutes / 60);
  return {
    label: `${hour % 12 === 0 ? 12 : hour % 12}:${String(minutes % 60).padStart(2, "0")}`,
    dark: hour >= 18 || hour < 6,
  };
}

export function PhoneShowcase({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [platform, setPlatform] = useState<Platform>("ios");
  const [auto, setAuto] = useState(true);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [phase, setPhase] = useState<Phase>("chat");
  const [cycle, setCycle] = useState(0);
  const [callSecs, setCallSecs] = useState(0);

  const clock = useSimulatedClock(!reduced);

  // One pass: type the thread, ring, answer, hang up, then hand over to the
  // other platform and start again.
  useEffect(() => {
    if (reduced) {
      setShown(SCRIPT.length);
      setTyping(false);
      setPhase("chat");
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    setShown(0);
    setTyping(false);
    setPhase("chat");

    let at = 400;
    SCRIPT.forEach((msg, i) => {
      if (msg.from === "agent") {
        timers.push(setTimeout(() => setTyping(true), at));
        at += 1150;
        timers.push(
          setTimeout(() => {
            setTyping(false);
            setShown(i + 1);
          }, at),
        );
        at += 600;
      } else {
        timers.push(setTimeout(() => setShown(i + 1), at));
        at += 900;
      }
    });

    at += 1200;
    timers.push(setTimeout(() => setPhase("ringing"), at));
    at += 3000;
    timers.push(
      setTimeout(() => {
        setPhase("incall");
        setCallSecs(0);
      }, at),
    );
    at += 3000;
    timers.push(setTimeout(() => setPhase("ended"), at));
    at += 900;
    timers.push(
      setTimeout(() => {
        if (auto) setPlatform((p) => (p === "ios" ? "android" : "ios"));
        setCycle((c) => c + 1);
      }, at),
    );

    return () => timers.forEach(clearTimeout);
  }, [cycle, auto, reduced]);

  // Call duration counter, only while connected.
  useEffect(() => {
    if (phase !== "incall") return;
    const id = setInterval(() => setCallSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const choose = (next: Platform) => {
    setAuto(false);
    setPlatform(next);
    setCycle((c) => c + 1);
  };

  const screen = {
    messages: SCRIPT.slice(0, shown),
    typing,
    phase,
    callSecs,
    clock: clock.label,
    dark: clock.dark,
  };

  return (
    <div className={cn("relative", className)}>
      {/* 15.5rem wide with a ~21.5rem thread puts the body at roughly 1:2.06,
          which is the real iPhone 15 ratio (71.6 x 147.6mm). */}
      <div className="mx-auto w-full max-w-[15.5rem]">
        <div
          key={platform}
          style={{ animation: reduced ? undefined : "phone-swap .6s var(--ease-out-soft) both" }}
        >
          {platform === "ios" ? <IosPhone {...screen} /> : <AndroidPhone {...screen} />}
        </div>

        <PlatformToggle active={platform} onChoose={choose} />
      </div>
    </div>
  );
}

type ScreenProps = {
  messages: typeof SCRIPT;
  typing: boolean;
  phase: Phase;
  callSecs: number;
  clock: string;
  dark: boolean;
};

/* ------------------------------------------------------------------ toggle */

function PlatformToggle({ active, onChoose }: { active: Platform; onChoose: (p: Platform) => void }) {
  return (
    <div
      className="mx-auto mt-5 flex w-fit items-center gap-1 rounded-full bg-white/80 p-1 shadow-soft ring-1 ring-line backdrop-blur"
      role="group"
      aria-label="Preview platform"
    >
      {PLATFORMS.map((p) => {
        const on = p === active;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChoose(p)}
            aria-pressed={on}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.78rem] font-semibold transition-colors duration-300",
              on ? "bg-ink-900 text-white" : "text-body hover:bg-ink-900/6 hover:text-ink-900",
            )}
          >
            {p === "ios" ? <AppleGlyph /> : <AndroidGlyph />}
            {p === "ios" ? "iOS" : "Android"}
          </button>
        );
      })}
    </div>
  );
}

function AppleGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 17" fill="currentColor" aria-hidden="true">
      <path d="M11.6 8.9c0-2 1.6-2.9 1.7-3-.9-1.4-2.4-1.5-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2C-.1 8.7.9 12.3 2.3 14.3c.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6s1.5.6 2.6.6 1.7-1 2.4-1.9c.7-1.1 1-2.2 1-2.2s-2-.8-2-3z" />
      <path d="M9.6 3c.5-.7.9-1.6.8-2.5-.8 0-1.8.5-2.4 1.2-.5.6-1 1.6-.8 2.5.9.1 1.8-.5 2.4-1.2z" />
    </svg>
  );
}

function AndroidGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 18 11" fill="currentColor" aria-hidden="true">
      <path d="M0 10.6c.1-2.4 1.4-4.5 3.4-5.7l-1.3-2.3a.3.3 0 0 1 .5-.3l1.3 2.3A7.9 7.9 0 0 1 9 4a7.9 7.9 0 0 1 5.1.6l1.3-2.3a.3.3 0 1 1 .5.3l-1.3 2.3c2 1.2 3.3 3.3 3.4 5.7H0Z" />
      <circle cx="5.4" cy="7.6" r=".8" fill="#fff" />
      <circle cx="12.6" cy="7.6" r=".8" fill="#fff" />
    </svg>
  );
}

/* -------------------------------------------------------------- call screen */

function CallScreen({
  platform,
  phase,
  secs,
  dark,
}: {
  platform: Platform;
  phase: Phase;
  secs: number;
  dark: boolean;
}) {
  const answered = phase === "incall";
  const ended = phase === "ended";
  const ios = platform === "ios";

  return (
    <div
      // -0.5px so the overlay still covers the rounded edge when the browser
      // rounds its box down a sub-pixel.
      className="absolute -inset-[0.5px] z-30 flex flex-col items-center justify-between px-4 pb-5 pt-12 text-white"
      style={{
        animation: "bubble-in .32s var(--ease-out-soft) both",
        background: dark
          ? "linear-gradient(#0b0b0d,#17181c)"
          : "linear-gradient(#2b3442,#131820)",
      }}
    >
      <div className="flex flex-col items-center">
        {/* Caller photo. A white plate, not the brand blue one: this sits on a
            near-black call screen, where the mark's own dark-to-blue hand would
            disappear into it. */}
        <span className="relative">
          {!answered && !ended ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-0 bg-white/25 motion-safe:animate-[pulse-ring_1.6s_ease-out_infinite]",
                ios ? "rounded-full" : "rounded-[1.2rem]",
              )}
            />
          ) : null}
          <LogoPlate
            size={58}
            plate="white"
            shape={ios ? "circle" : "squircle"}
            className="relative"
          />
        </span>

        <p className="mt-3 text-[0.92rem] font-semibold">Classistant</p>
        <p className="mt-0.5 text-[0.66rem] text-white/60">
          {ended
            ? "Call ended"
            : answered
              ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
              : ios
                ? "mobile"
                : "Incoming call"}
        </p>

        {answered ? (
          <p className="mt-4 max-w-[11rem] text-center text-[0.68rem] leading-[1.45] text-white/70">
            &ldquo;The essay closes in four hours. Open the doc, I will wait.&rdquo;
          </p>
        ) : null}
      </div>

      {/* Controls */}
      {answered ? (
        <div className="w-full">
          <div className="mb-4 grid grid-cols-3 gap-2.5 px-2">
            {["Mute", "Keypad", "Speaker", "Add", "FaceTime", "Contacts"].map((label) => (
              <span key={label} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "h-8 w-8 bg-white/15",
                    ios ? "rounded-full" : "rounded-[0.85rem]",
                  )}
                />
                <span className="text-[0.5rem] text-white/50">{label}</span>
              </span>
            ))}
          </div>
          <div className="flex justify-center">
            <EndButton ios={ios} />
          </div>
        </div>
      ) : ended ? (
        <div className="flex justify-center pb-4">
          <EndButton ios={ios} dim />
        </div>
      ) : (
        <div className="flex w-full items-center justify-around pb-2">
          <span className="flex flex-col items-center gap-1.5">
            <EndButton ios={ios} />
            <span className="text-[0.5rem] text-white/50">Decline</span>
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "grid h-11 w-11 place-items-center bg-[#34C759] motion-safe:animate-[float-slow_1.4s_ease-in-out_infinite]",
                ios ? "rounded-full" : "rounded-[1.1rem]",
              )}
            >
              <PhoneGlyph />
            </span>
            <span className="text-[0.5rem] text-white/50">Accept</span>
          </span>
        </div>
      )}
    </div>
  );
}

function EndButton({ ios, dim = false }: { ios: boolean; dim?: boolean }) {
  return (
    <span
      className={cn(
        "grid h-11 w-11 place-items-center bg-[#FF3B30] transition-opacity",
        ios ? "rounded-full" : "rounded-[1.1rem]",
        dim && "opacity-45",
      )}
    >
      <span className="rotate-[134deg]">
        <PhoneGlyph />
      </span>
    </span>
  );
}

function PhoneGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.2 3.8 9.4 8 7.6 9.9a11 11 0 0 0 5 5l1.9-1.8 4.2 2.2-.5 2.6a2 2 0 0 1-2.2 1.6C9.4 18.8 5 14.4 4 6.5a2 2 0 0 1 1.6-2.2l1.6-.5Z"
        fill="#fff"
      />
    </svg>
  );
}

/* --------------------------------------------------------------- iOS phone */

const IOS_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';

function IosPhone({ messages, typing, phase, callSecs, clock, dark }: ScreenProps) {
  const inCall = phase !== "chat";
  return (
    <div className="rounded-[2.65rem] bg-ink-950 p-[0.7rem] shadow-[0_40px_80px_-30px_rgb(6_32_58_/_0.55)] ring-1 ring-ink-800">
      <div
        // While a call is up the screen itself goes dark, not just the overlay.
        // Leaving it white let a hairline of it show along the overlay's edge,
        // which read as light bleeding down the right side of the handset.
        className={cn(
          "relative overflow-hidden rounded-[2.05rem]",
          inCall ? "bg-ink-950" : dark ? "bg-black" : "bg-white",
        )}
        style={{ fontFamily: IOS_FONT }}
      >
        <div className="absolute left-1/2 top-[0.4rem] z-40 h-[1.05rem] w-[4.3rem] -translate-x-1/2 rounded-full bg-black" />

        {inCall ? <CallScreen platform="ios" phase={phase} secs={callSecs} dark={dark} /> : null}

        <div
          className={cn(
            "relative z-10 flex items-center justify-between px-4 pb-1 pt-[0.55rem] text-[0.58rem] font-semibold",
            dark || inCall ? "text-white" : "text-black",
          )}
        >
          <span>{clock}</span>
          <span className="flex items-center gap-1">
            <IosSignal />
            <IosWifi />
            <IosBattery />
          </span>
        </div>

        <div
          className={cn(
            "flex flex-col items-center border-b px-3 pb-1.5 pt-0.5 backdrop-blur",
            dark ? "border-white/10 bg-[#1C1C1E]/95" : "border-black/10 bg-[#F6F6F6]/95",
          )}
        >
          <div className="flex w-full items-center">
            <span className="flex items-center text-[#007AFF]">
              <svg width="8" height="14" viewBox="0 0 11 18" fill="none" aria-hidden="true">
                <path d="M9.5 1.5 2 9l7.5 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="ml-0.5 text-[0.58rem] font-medium">2</span>
            </span>
            <span className="flex flex-1 flex-col items-center">
              <Avatar />
              <span
                className={cn(
                  "mt-[0.1rem] flex items-center gap-0.5 text-[0.55rem] font-medium",
                  dark ? "text-white" : "text-black",
                )}
              >
                Classistant
                <svg width="6" height="6" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                  <path d="M1.5 2.5 4 5.2l2.5-2.7" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
            <span className="w-[1.2rem]" />
          </div>
        </div>

        <div className="flex min-h-[21.5rem] flex-col justify-end gap-0.5 px-2 pb-1.5 pt-2">
          {messages.map((msg, i) => {
            const mine = msg.from === "me";
            const last = i === messages.length - 1 || messages[i + 1].from !== msg.from;
            return (
              <div
                key={i}
                className={cn("flex", mine ? "justify-end" : "justify-start", last ? "mb-1.5" : "mb-[2px]")}
                style={{ animation: "bubble-in .42s var(--ease-out-soft) both" }}
              >
                <div className="relative max-w-[76%]">
                  <p
                    className={cn(
                      "rounded-[0.95rem] px-2.5 py-[0.35rem] text-[0.66rem] leading-[1.3]",
                      mine ? "text-white" : dark ? "bg-[#26262A] text-white" : "bg-[#E9E9EB] text-black",
                    )}
                    style={mine ? { background: "linear-gradient(#1FA2FF,#0A7CFF)" } : undefined}
                  >
                    {msg.text}
                  </p>
                  {last ? <IosTail mine={mine} dark={dark} /> : null}
                </div>
              </div>
            );
          })}

          {typing ? (
            <div className="mb-1.5 flex justify-start" style={{ animation: "bubble-in .3s var(--ease-out-soft) both" }}>
              <span
                className={cn(
                  "relative flex items-center gap-[0.2rem] rounded-[0.95rem] px-2.5 py-[0.5rem]",
                  dark ? "bg-[#26262A]" : "bg-[#E9E9EB]",
                )}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-[0.34rem] w-[0.34rem] rounded-full bg-[#8E8E93]"
                    style={{ animation: "typing-dot 1.3s ease-in-out infinite", animationDelay: `${d * 0.18}s` }}
                  />
                ))}
                <IosTail mine={false} dark={dark} />
              </span>
            </div>
          ) : null}

          {!typing && messages.length === SCRIPT.length ? (
            <p className="pr-1 text-right text-[0.5rem] font-medium text-[#8E8E93]">Delivered</p>
          ) : null}
        </div>

        <div
          className={cn(
            "flex items-center gap-1.5 border-t px-2 py-1.5",
            dark ? "border-white/10 bg-[#1C1C1E]" : "border-black/8 bg-[#F6F6F6]",
          )}
        >
          <span
            className={cn(
              "grid h-[1.15rem] w-[1.15rem] place-items-center rounded-full text-[#8E8E93]",
              dark ? "bg-[#2C2C2E]" : "bg-[#E4E4E6]",
            )}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 1.6v8.8M1.6 6h8.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </span>
          <span
            className={cn(
              "flex flex-1 items-center justify-between rounded-full border px-2 py-[0.15rem]",
              dark ? "border-white/15" : "border-black/12",
            )}
          >
            <span className="text-[0.6rem] text-[#8E8E93]">iMessage</span>
            <span className="grid h-[0.85rem] w-[0.85rem] place-items-center rounded-full bg-[#007AFF]">
              <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M5 8.4V2.2M2.2 5 5 2.1 7.8 5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </div>

        <div className={cn("flex justify-center pb-1.5", dark ? "bg-[#1C1C1E]" : "bg-[#F6F6F6]")}>
          <span className={cn("h-[0.2rem] w-[7rem] rounded-full", dark ? "bg-white/70" : "bg-black/80")} />
        </div>
      </div>
    </div>
  );
}

function IosTail({ mine, dark }: { mine: boolean; dark: boolean }) {
  return (
    <svg
      width="11"
      height="15"
      viewBox="0 0 11 15"
      aria-hidden="true"
      className={cn("absolute bottom-0", mine ? "-right-[4px]" : "-left-[4px] -scale-x-100")}
    >
      <path
        d="M0 0v8.5C0 12 2.6 14.6 6.2 15H11c-3.6-1.4-5.6-5.2-5.6-9.6V0H0z"
        fill={mine ? "#0A7CFF" : dark ? "#26262A" : "#E9E9EB"}
      />
    </svg>
  );
}

/**
 * Contact photo at the top of the thread, which on this phone is the app icon.
 *
 * 1.75rem rather than the 1.25rem it used to be: the mark has a counter inside
 * the hand's ring that closes below 20px, and 20px of plate left only 15px of
 * mark. This is also closer to what iOS actually draws there.
 */
function Avatar() {
  return <LogoPlate size={28} plate="ink" />;
}

function IosSignal() {
  return (
    <svg width="13" height="8" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
      <rect x="0" y="7.5" width="2.8" height="3.5" rx="0.9" />
      <rect x="4.3" y="5.4" width="2.8" height="5.6" rx="0.9" />
      <rect x="8.6" y="3" width="2.8" height="8" rx="0.9" />
      <rect x="12.9" y="0" width="2.8" height="11" rx="0.9" />
    </svg>
  );
}

function IosWifi() {
  return (
    <svg width="12" height="9" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
      <path d="M8 11.2 6 8.9a3 3 0 0 1 4 0l-2 2.3Z" />
      <path d="M8 5.6c1.5 0 2.9.6 3.9 1.5l1.3-1.5A7.7 7.7 0 0 0 8 3.6a7.7 7.7 0 0 0-5.2 2l1.3 1.5A5.8 5.8 0 0 1 8 5.6Z" />
      <path d="M8 1.4c2.3 0 4.4.9 6 2.3l1.3-1.5A10.3 10.3 0 0 0 8 -.6 10.3 10.3 0 0 0 .7 2.2L2 3.7A8.7 8.7 0 0 1 8 1.4Z" />
    </svg>
  );
}

function IosBattery() {
  return (
    <svg width="19" height="9" viewBox="0 0 25 12" fill="none" aria-hidden="true">
      <rect x="0.6" y="0.6" width="20" height="10.8" rx="3" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.1" />
      <rect x="2.2" y="2.2" width="15" height="7.6" rx="1.9" fill="currentColor" />
      <path d="M22.4 4.2v3.6c1-.3 1.5-.9 1.5-1.8s-.5-1.5-1.5-1.8Z" fill="currentColor" fillOpacity="0.4" />
    </svg>
  );
}

/* ----------------------------------------------------------- Android phone */

const ANDROID_FONT = 'Roboto, "Helvetica Neue", system-ui, sans-serif';

function AndroidPhone({ messages, typing, phase, callSecs, clock, dark }: ScreenProps) {
  const inCall = phase !== "chat";
  return (
    <div className="rounded-[2.1rem] bg-ink-950 p-[0.55rem] shadow-[0_40px_80px_-30px_rgb(6_32_58_/_0.55)] ring-1 ring-ink-800">
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.75rem]",
          inCall ? "bg-ink-950" : dark ? "bg-[#131314]" : "bg-white",
        )}
        style={{ fontFamily: ANDROID_FONT }}
      >
        <div className="absolute left-1/2 top-[0.45rem] z-40 h-[0.48rem] w-[0.48rem] -translate-x-1/2 rounded-full bg-black" />

        {inCall ? <CallScreen platform="android" phase={phase} secs={callSecs} dark={dark} /> : null}

        <div
          className={cn(
            "relative z-10 flex items-center justify-between px-3 pb-1 pt-[0.5rem] text-[0.56rem] font-medium",
            dark || inCall ? "text-white" : "text-black",
          )}
        >
          <span>{clock}</span>
          <span className="flex items-center gap-1">
            <IosSignal />
            <IosWifi />
            <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="3" y="0.6" width="6" height="10.8" rx="1.6" />
              <rect x="4.6" y="0" width="2.8" height="1.4" rx="0.7" />
            </svg>
          </span>
        </div>

        <div className="flex items-center gap-2 px-2.5 pb-2 pt-1">
          <svg
            width="13"
            height="13"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={dark ? "text-[#C4C7C5]" : "text-[#444746]"}
          >
            <path d="M16 10H4m0 0 5-5m-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <Avatar />
          <span className={cn("flex-1 text-[0.68rem] font-medium", dark ? "text-[#E3E3E3]" : "text-[#1F1F1F]")}>
            Classistant
          </span>
          <svg
            width="13"
            height="13"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={dark ? "text-[#C4C7C5]" : "text-[#444746]"}
          >
            <path
              d="M6.5 3.5h-2A1.5 1.5 0 0 0 3 5c0 6.6 5.4 12 12 12a1.5 1.5 0 0 0 1.5-1.5v-2l-3.2-1.2-1.6 1.6a11 11 0 0 1-4.6-4.6l1.6-1.6L6.5 3.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex min-h-[21.5rem] flex-col justify-end gap-0.5 px-2.5 pb-1.5 pt-1.5">
          {messages.map((msg, i) => {
            const mine = msg.from === "me";
            const firstOfRun = i === 0 || messages[i - 1].from !== msg.from;
            const lastOfRun = i === messages.length - 1 || messages[i + 1].from !== msg.from;
            return (
              <div
                key={i}
                className={cn("flex", mine ? "justify-end" : "justify-start", lastOfRun ? "mb-1.5" : "mb-[3px]")}
                style={{ animation: "bubble-in .42s var(--ease-out-soft) both" }}
              >
                <p
                  className={cn(
                    "max-w-[76%] px-2.5 py-[0.4rem] text-[0.66rem] leading-[1.32]",
                    mine
                      ? "bg-[#0B57D0] text-white"
                      : dark
                        ? "bg-[#2E2F31] text-[#E3E3E3]"
                        : "bg-[#E8EAED] text-[#1F1F1F]",
                    mine
                      ? cn("rounded-[1.05rem]", !firstOfRun && "rounded-tr-[0.3rem]", !lastOfRun && "rounded-br-[0.3rem]")
                      : cn("rounded-[1.05rem]", !firstOfRun && "rounded-tl-[0.3rem]", !lastOfRun && "rounded-bl-[0.3rem]"),
                  )}
                >
                  {msg.text}
                </p>
              </div>
            );
          })}

          {typing ? (
            <div className="mb-1.5 flex justify-start" style={{ animation: "bubble-in .3s var(--ease-out-soft) both" }}>
              <span
                className={cn(
                  "flex items-center gap-[0.2rem] rounded-[1.05rem] px-2.5 py-[0.55rem]",
                  dark ? "bg-[#2E2F31]" : "bg-[#E8EAED]",
                )}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-[0.34rem] w-[0.34rem] rounded-full bg-[#8A8F94]"
                    style={{ animation: "typing-dot 1.3s ease-in-out infinite", animationDelay: `${d * 0.18}s` }}
                  />
                ))}
              </span>
            </div>
          ) : null}

          {!typing && messages.length === SCRIPT.length ? (
            <p className="pr-1 text-right text-[0.5rem] text-[#8A8F94]">Delivered by RCS</p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1">
          <span
            className={cn(
              "flex flex-1 items-center gap-1.5 rounded-full px-2.5 py-1",
              dark ? "bg-[#1E1F20]" : "bg-[#F1F3F4]",
            )}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-[#8A8F94]">
              <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="5.9" cy="6.4" r="0.9" fill="currentColor" />
              <circle cx="10.1" cy="6.4" r="0.9" fill="currentColor" />
              <path d="M5.4 9.6a3 3 0 0 0 5.2 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="flex-1 text-[0.6rem] text-[#8A8F94]">Text message</span>
          </span>
          <span className="grid h-[1.35rem] w-[1.35rem] place-items-center rounded-full bg-[#0B57D0]">
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h9m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <div className="flex justify-center pb-1.5">
          <span className={cn("h-[0.16rem] w-[6rem] rounded-full", dark ? "bg-white/60" : "bg-black/70")} />
        </div>
      </div>
    </div>
  );
}
