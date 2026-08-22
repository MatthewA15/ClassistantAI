import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mx-auto w-full max-w-[76rem] px-5 sm:px-8", className)}>{children}</div>;
}

export function Section({
  id,
  children,
  className,
  tone = "light",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "light" | "paper" | "ink";
}) {
  const tones = {
    light: "bg-white",
    paper: "bg-paper",
    ink: "bg-ink-900 text-sky-200",
  };
  return (
    // scroll-mt keeps a jumped-to heading clear of the floating header.
    <section id={id} className={cn("scroll-mt-24 py-20 sm:py-28", tones[tone], className)}>
      {children}
    </section>
  );
}

/**
 * Section heading. Deliberately plain: a short label line, a headline, a lead
 * paragraph. No badge chips above the title.
 */
export function SectionHeading({
  label,
  title,
  lead,
  align = "left",
  tone = "light",
}: {
  label?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  tone?: "light" | "ink";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {label ? (
        <p
          className={cn(
            "mb-3 text-[0.8rem] font-semibold uppercase tracking-[0.16em]",
            tone === "ink" ? "text-sky-400" : "text-brand-600",
          )}
        >
          {label}
        </p>
      ) : null}
      {/* Headings carry the argument, so they run large and leads stay short.
          See docs/design/02-design-system.md on the copy diet. */}
      <h2
        className={cn(
          "text-[2.3rem] font-extrabold leading-[1.06] sm:text-[3.1rem]",
          tone === "ink" && "text-white",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={cn(
            "mt-5 max-w-lg text-[1.08rem] leading-[1.6]",
            tone === "ink" ? "text-sky-200/85" : "text-body",
          )}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "onInk";
  className?: string;
};

export function Button({ href, children, variant = "primary", className }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[0.95rem] font-semibold transition-all duration-200 active:translate-y-px";
  const variants = {
    primary:
      "bg-brand-600 text-white shadow-[0_10px_24px_-10px_rgb(11_99_229_/_0.75)] hover:bg-brand-700 hover:shadow-[0_14px_30px_-10px_rgb(11_99_229_/_0.85)]",
    secondary:
      "bg-white text-ink-900 ring-1 ring-line hover:ring-sky-400 hover:bg-sky-50",
    ghost: "text-ink-800 hover:bg-sky-100",
    onInk: "bg-white text-ink-900 hover:bg-sky-100",
  };
  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn("transition-transform duration-200 group-hover:translate-x-0.5", className)}
    >
      <path
        d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
