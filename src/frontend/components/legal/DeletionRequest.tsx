"use client";

import { useMemo, useState } from "react";
import { Choice, Field, TextInput, formatPhone } from "@/components/onboarding/fields";
import { LEGAL } from "@/data/legal";
import { cn } from "@/lib/cn";

/**
 * The deletion request builder.
 *
 * There is deliberately no "delete" button that fires at our backend. A request
 * that erases a semester of coursework and a stored school credential should
 * not be one mis-click on a public page with no session behind it, and this
 * site has no logged-in state to authenticate that click against. So the flow
 * is: the student writes the request, their own mail client sends it from an
 * address we can check against the account, and we act on it.
 *
 * The form's only job is to make that email complete on the first try. A blank
 * mailto: gets us "delete my stuff" from a personal Gmail we cannot match to
 * anyone, which turns a thirty second job into a week of back and forth.
 */

type Scope = {
  id: string;
  title: string;
  body: string;
  /** Goes into the subject line so the request is triaged before it is opened. */
  subject: string;
  /** The plain sentence that states the ask inside the message. */
  sentence: string;
};

const SCOPES: Scope[] = [
  {
    id: "all",
    title: "Everything. Close my account.",
    body: "The account, the stored portal password, courses, deadlines, grades, and every text and call.",
    subject: "close my account and erase everything",
    sentence: "Please close my account and erase everything you hold about me.",
  },
  {
    id: "credentials",
    title: "Just my school portal password.",
    body: "The assistant stops reading your portal. Your account, calendar, and reminders stay.",
    subject: "erase my stored portal credentials",
    sentence:
      "Please destroy the school portal credentials you hold for me and stop signing in to my portal. I want to keep the rest of my account.",
  },
  {
    id: "history",
    title: "Just my message and call history.",
    body: "Wipes the conversation. The assistant keeps working, with no memory of what was said.",
    subject: "erase my message and call history",
    sentence:
      "Please erase my message and call history. I want to keep my account and my current semester.",
  },
];

function buildMessage(scope: Scope, name: string, email: string, phone: string, note: string) {
  const lines = [
    "Hello,",
    "",
    `${scope.sentence} I am making this request under PIPEDA as the person the information is about.`,
    "",
    `Full name: ${name || "[your name]"}`,
    `School email: ${email || "[your school email]"}`,
    `Mobile number: ${phone || "[not provided]"}`,
  ];

  if (note.trim()) lines.push("", note.trim());

  lines.push(
    "",
    "Please confirm in writing once it is done.",
    "",
    name || "[your name]",
  );

  return lines.join("\n");
}

export function DeletionRequest() {
  const [scopeId, setScopeId] = useState(SCOPES[0].id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const scope = SCOPES.find((s) => s.id === scopeId) ?? SCOPES[0];

  // Enough to act on without writing back: a name and an address to reply to.
  const ready = name.trim().length > 1 && /.+@.+\..+/.test(email.trim());

  const subject = `Deletion request: ${scope.subject}`;
  const message = useMemo(
    () => buildMessage(scope, name.trim(), email.trim(), phone.trim(), note),
    [scope, name, email, phone, note],
  );

  const mailto = `mailto:${LEGAL.privacyEmail}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(message)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${LEGAL.privacyEmail}\nSubject: ${subject}\n\n${message}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      // Clipboard blocked. The full message is on screen below, so the student
      // can still select it by hand; a thrown error here would help nobody.
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[0.88rem] font-semibold text-ink-900">
          What should we delete?
        </legend>
        {SCOPES.map((s) => (
          <Choice
            key={s.id}
            name="scope"
            type="radio"
            checked={s.id === scopeId}
            onChange={() => setScopeId(s.id)}
            title={s.title}
            body={s.body}
          />
        ))}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="del-name" hint="As you gave it during setup.">
          <TextInput
            id="del-name"
            name="name"
            autoComplete="name"
            placeholder="Jordan Okafor"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="School email"
          htmlFor="del-email"
          hint="The address on the account, so we can match the request to it."
        >
          <TextInput
            id="del-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@uwaterloo.ca"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="del-phone"
          hint="Optional, and the fastest way for us to find you."
        >
          <TextInput
            id="del-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(604) 555-0123"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
          />
        </Field>

        <Field label="Anything to add" htmlFor="del-note" hint="Optional. You do not owe us a reason.">
          <TextInput
            id="del-note"
            name="note"
            placeholder="I graduated in April."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      {/* The composed message, shown in full. A button that silently drops
          text into a mail client is a black box on a page about trust. */}
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line-soft pb-4 text-[0.86rem]">
          <span className="font-semibold text-ink-900">To</span>
          <span className="text-body">{LEGAL.privacyEmail}</span>
          <span aria-hidden="true" className="text-line">
            |
          </span>
          <span className="font-semibold text-ink-900">Subject</span>
          <span className="min-w-0 text-body">{subject}</span>
        </div>
        <pre className="mt-4 whitespace-pre-wrap font-sans text-[0.9rem] leading-[1.7] text-body">
          {message}
        </pre>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* A plain anchor, not the site Button: next/link prefetches its href,
            and mailto: is not a route. */}
        <a
          href={ready ? mailto : undefined}
          aria-disabled={!ready}
          onClick={(e) => {
            if (!ready) e.preventDefault();
          }}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[0.95rem] font-semibold transition-all duration-200",
            ready
              ? "bg-brand-600 text-white shadow-[0_10px_24px_-10px_rgb(11_99_229_/_0.75)] hover:bg-brand-700 active:translate-y-px"
              : "cursor-not-allowed bg-sky-100 text-body-soft",
          )}
        >
          Open this in my email app
        </a>

        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-[0.95rem] font-semibold text-ink-900 ring-1 ring-line transition-all duration-200 hover:bg-sky-50 hover:ring-sky-400 active:translate-y-px"
        >
          {copied ? "Copied" : "Copy it instead"}
        </button>
      </div>

      <p className="text-[0.86rem] leading-[1.6] text-body-soft" aria-live="polite">
        {ready
          ? "Send it from your school address if you can. That is how we know the request is yours. From any other address we will reply to your school address to confirm before we delete anything."
          : "Add your name and school email to fill the message in."}
      </p>
    </div>
  );
}
