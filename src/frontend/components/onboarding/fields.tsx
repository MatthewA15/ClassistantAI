"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[0.88rem] font-semibold text-ink-900">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[0.8rem] font-medium text-ink-800">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8rem] leading-[1.55] text-body-soft">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-xl border bg-white px-4 py-3 text-[0.95rem] text-ink-900 outline-none transition-colors placeholder:text-body-soft/70",
        invalid
          ? "border-ink-700 focus:border-ink-800"
          : "border-line focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12",
        className,
      )}
    />
  );
}

export function Choice({
  checked,
  onChange,
  title,
  body,
  name,
  type = "checkbox",
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  body?: string;
  name: string;
  type?: "checkbox" | "radio";
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-all",
        checked ? "border-brand-500 bg-sky-50 ring-2 ring-brand-500/15" : "border-line bg-white hover:border-sky-400",
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center border transition-colors",
          type === "radio" ? "rounded-full" : "rounded-md",
          checked ? "border-brand-600 bg-brand-600" : "border-line bg-white",
        )}
      >
        {checked ? (
          type === "radio" ? (
            <span className="h-2 w-2 rounded-full bg-white" />
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6.2 4.7 8.4 9.5 3.5"
                stroke="white"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )
        ) : null}
      </span>
      <span>
        <span className="block text-[0.92rem] font-semibold text-ink-900">{title}</span>
        {body ? (
          <span className="mt-1 block text-[0.82rem] leading-[1.55] text-body">{body}</span>
        ) : null}
      </span>
    </label>
  );
}

/** Formats keystrokes into (604) 555-0123 as the student types. */
export function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function phoneDigits(formatted: string) {
  return formatted.replace(/\D/g, "");
}
