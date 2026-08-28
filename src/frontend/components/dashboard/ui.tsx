import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The signed-in area's furniture: a card, a labelled row, a status chip, a
 * switch, an empty state.
 *
 * No "use client" here, deliberately. Every one of these is markup and a
 * className, so they render on the server for the pages that are server
 * components and get pulled into the bundle by the ones that are not. Adding a
 * hook to any of them would force the directive on and drag the whole set into
 * every client bundle that touches one of them, which is the same trap
 * components/onboarding/shell.tsx documents.
 *
 * ## Why the dashboard looks different from the landing page
 *
 * The marketing pages argue: headings run to 3.1rem, sections breathe, and the
 * copy is the product. This is a tool someone opens to change one setting, so
 * the type comes down, the density goes up, and the cards do the separating
 * that whitespace does out front. The palette, the radii, the shadows and the
 * ring on every surface are unchanged, which is what keeps it the same product.
 * See docs/design/20-dashboard.md.
 */

export function Card({
  children,
  className,
  tone = "white",
}: {
  children: ReactNode;
  className?: string;
  /**
   * `alert` is for the danger zone and nothing else. It is a ring and a wash,
   * never a red fill: --color-alert is functional in this system, and a card
   * painted in it announces that something has gone wrong rather than that
   * something here is irreversible.
   */
  tone?: "white" | "sky" | "alert";
}) {
  // Competing utilities live inside the branches, never split between a base
  // string and a branch. Tailwind resolves those by emission order rather than
  // by the order they were written, which is how a `bg-white` in a base string
  // silently beats a `bg-paper` passed in beside it.
  const tones = {
    white: "bg-white ring-line",
    sky: "bg-sky-50 ring-sky-200",
    alert: "bg-white ring-alert/25",
  };

  return (
    <section
      className={cn(
        "rounded-[1.4rem] p-5 shadow-soft ring-1 sm:p-6",
        tones[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A card's heading row. `action` sits on the right and is usually a link to
 *  the page that owns the thing being summarised. */
export function CardHead({
  title,
  lead,
  action,
}: {
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[1.05rem] font-extrabold leading-tight text-ink-900">{title}</h2>
        {lead ? (
          <p className="mt-1.5 text-[0.86rem] leading-[1.6] text-body">{lead}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * One fact about the account: a label, a value, and sometimes a way to change
 * it.
 *
 * `mono` for anything that is an identifier rather than prose. An email address
 * or a phone number is something a student has to compare character by
 * character against what they think it should be, and a proportional face makes
 * that harder than it needs to be.
 */
export function DataRow({
  label,
  value,
  hint,
  action,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-b border-line-soft py-3.5 last:border-b-0 last:pb-0 first:pt-0">
      <div className="min-w-0">
        <dt className="text-[0.8rem] text-body-soft">{label}</dt>
        <dd
          className={cn(
            "mt-1 break-words text-ink-900",
            mono ? "font-mono text-[0.9rem]" : "text-[0.95rem] font-semibold",
          )}
        >
          {value}
        </dd>
        {hint ? (
          <p className="mt-1.5 text-[0.78rem] leading-[1.55] text-body-soft">{hint}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A short state chip.
 *
 * `ok` and `alert` are the two functional non-blues in the palette and they are
 * used here for exactly what globals.css reserves them for: a step that passed
 * and a step that did not. Everything else is a blue, because everything else
 * is information rather than a verdict.
 */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "ok" | "warn" | "alert" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    ok: "bg-ok/10 text-ok ring-ok/20",
    warn: "bg-warn/12 text-ink-900 ring-warn/35",
    alert: "bg-alert/10 text-alert ring-alert/20",
    neutral: "bg-sky-100 text-ink-800 ring-sky-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] ring-1",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * The switch, exactly as onboarding draws it.
 *
 * A real checkbox under a styled surface rather than a div with a click
 * handler: it has to be reachable by keyboard and announced as a checkbox, and
 * the cheapest way to get both is to use the element that already is one.
 *
 * `name` is optional because this serves two kinds of caller. Inside a form
 * that posts to a server action it is the submitted field; inside a form that
 * mirrors its state into hidden inputs it is omitted, so the value is not sent
 * twice under one name.
 */
export function Switch({
  checked,
  onChange,
  title,
  detail,
  name,
  disabled = false,
  note,
}: {
  checked: boolean;
  onChange: () => void;
  title: ReactNode;
  detail?: ReactNode;
  name?: string;
  disabled?: boolean;
  /** Rendered under the detail line in the alert colour. For saying why a
   *  switch is off in a way the switch itself cannot. */
  note?: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-4 rounded-xl p-4 ring-1 transition-colors",
        disabled
          ? "cursor-not-allowed bg-paper ring-line opacity-60"
          : checked
            ? "cursor-pointer bg-sky-50 ring-sky-200"
            : "cursor-pointer bg-paper ring-line",
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="peer sr-only"
      />

      <span className="min-w-0 flex-1">
        <span className="block text-[0.92rem] font-semibold text-ink-900">{title}</span>
        {detail ? (
          <span className="mt-1 block text-[0.82rem] leading-[1.5] text-body-soft">{detail}</span>
        ) : null}
        {note ? (
          <span className="mt-1.5 block text-[0.78rem] leading-[1.5] text-alert">{note}</span>
        ) : null}
      </span>

      {/* Focus ring is driven off the peer, because the input it belongs to is
          visually hidden and would otherwise show nothing at all to a keyboard
          user. */}
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          "peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/30",
          checked ? "bg-brand-600" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            checked ? "left-[1.4rem]" : "left-0.5",
          )}
        />
      </span>
    </label>
  );
}

/**
 * What a card says when it has nothing to show.
 *
 * Every empty state in here has to answer two questions: is this broken, and
 * what would put something in it. A card that says only "No activity yet" fails
 * the first, and a student whose account has been quiet for a week cannot tell
 * a working product from a stalled one.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-paper px-5 py-8 text-center ring-1 ring-line">
      <p className="text-[0.98rem] font-semibold text-ink-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[0.86rem] leading-[1.65] text-body">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** The one button style the signed-in area uses, in three weights. A function
 *  rather than a component so it can dress a `<button>`, an `<a>`, and a
 *  next/link alike without three wrappers. */
export function buttonClass(
  variant: "primary" | "secondary" | "quiet" | "danger" = "primary",
  size: "md" | "sm" = "md",
): string {
  const variants = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-line disabled:text-body-soft",
    secondary:
      "bg-white text-ink-900 ring-1 ring-line hover:bg-sky-50 hover:ring-sky-400 disabled:text-body-soft",
    quiet: "text-brand-600 hover:bg-sky-100 disabled:text-body-soft",
    danger:
      "bg-white text-alert ring-1 ring-alert/30 hover:bg-alert/5 disabled:text-body-soft",
  };

  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed",
    size === "sm" ? "px-3.5 py-2 text-[0.84rem]" : "px-5 py-3 text-[0.92rem]",
    variants[variant],
  );
}

/**
 * The line under a form that says whether the last save worked.
 *
 * `role="status"` rather than `role="alert"` on success, so a screen reader
 * announces it without interrupting. Failures use alert, because a save that
 * did not happen is worth interrupting for.
 */
export function SaveState({
  state,
}: {
  state: { ok: boolean; message: string } | null;
}) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "text-[0.84rem] font-medium",
        state.ok ? "text-ok" : "text-alert",
      )}
    >
      {state.message}
    </p>
  );
}
