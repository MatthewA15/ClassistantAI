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
  padTop = "normal",
  padBottom = "normal",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "light" | "paper" | "ink";
  /**
   * `tight` when the section directly follows something that already ends in
   * generous space, so the two do not stack into a gap. `loose` when the
   * previous section ends flush against its own content and needs air. A prop
   * rather than a `pt-*` passed through className, because that would collide
   * with `py-*` here and let Tailwind's emission order pick the winner.
   */
  padTop?: "normal" | "tight" | "loose";
  /**
   * `tight` pairs with the next section's `padTop="tight"`. `loose` when the
   * section ends on a large visual, where normal padding lets whatever follows
   * read as part of the same block.
   */
  padBottom?: "normal" | "tight" | "loose";
}) {
  const tones = {
    light: "bg-white",
    paper: "bg-paper",
    ink: "bg-ink-900 text-sky-200",
  };
  return (
    // scroll-mt keeps a jumped-to heading clear of the floating header.
    <section
      id={id}
      className={cn(
        "scroll-mt-24",
        padTop === "tight"
          ? "pt-12 sm:pt-16"
          : padTop === "loose"
            ? "pt-28 sm:pt-40"
            : "pt-20 sm:pt-28",
        padBottom === "tight"
          ? "pb-12 sm:pb-16"
          : padBottom === "loose"
            ? "pb-28 sm:pb-40"
            : "pb-20 sm:pb-28",
        tones[tone],
        className,
      )}
    >
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
  width = "narrow",
}: {
  label?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  tone?: "light" | "ink";
  /**
   * A parameter rather than a `max-w-*` passed through className, because two
   * competing max-widths in one class list are resolved by Tailwind's emission
   * order, not by the order they were written.
   */
  width?: "narrow" | "wide";
}) {
  return (
    <div
      className={cn(
        width === "wide" ? "max-w-4xl" : "max-w-2xl",
        align === "center" && "mx-auto text-center",
      )}
    >
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
