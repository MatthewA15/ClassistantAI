"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { completeOnboarding, joinWaitlist, startGoogleSignIn } from "@/app/onboarding/actions";
import { SchoolPicker } from "@/components/onboarding/SchoolPicker";
import { Choice, Field, TextInput, formatPhone, phoneDigits } from "@/components/onboarding/fields";
import { LogoMark } from "@/components/brand/LogoMark";
import type { School } from "@/data/schools";
import { cn } from "@/lib/cn";

const STEPS = [
  { title: "Your school", blurb: "So we know which portal to sign in to" },
  { title: "Google sign in", blurb: "Mail, calendar, and Drive access" },
  { title: "You", blurb: "Name and the number it texts" },
  { title: "Portal login", blurb: "For course pages Google cannot reach" },
  { title: "How it texts you", blurb: "Tone, quiet hours, and calls" },
  { title: "Confirm", blurb: "Check it over and finish" },
];

type Intensity = "gentle" | "standard" | "relentless";

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [school, setSchool] = useState<School | null>(null);
  const [unsupported, setUnsupported] = useState<School | null>(null);

  const [googleLinked, setGoogleLinked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consentSms, setConsentSms] = useState(false);

  const [portalUser, setPortalUser] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [intensity, setIntensity] = useState<Intensity>("standard");
  const [callsEnabled, setCallsEnabled] = useState(true);
  const [callsForEmail, setCallsForEmail] = useState(false);
  const [quietFrom, setQuietFrom] = useState("22:00");
  const [quietTo, setQuietTo] = useState("08:00");

  const [submitState, submitAction, submitting] = useActionState(completeOnboarding, null);
  const [googleState, googleAction, googlePending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof startGoogleSignIn>> | null, formData: FormData) => {
      const result = await startGoogleSignIn(formData);
      if (result.ok) setGoogleLinked(true);
      return result;
    },
    null,
  );
  const [waitlistState, waitlistAction, waitlistPending] = useActionState(joinWaitlist, null);

  const errors = submitState?.errors ?? {};

  const canAdvance = [
    school !== null,
    googleLinked,
    fullName.trim().length >= 2 && phoneDigits(phone).length === 10 && consentSms,
    portalUser.trim().length >= 2 && portalPassword.length >= 6,
    true,
    true,
  ][step];

  if (submitState?.ok) {
    return <DoneScreen name={fullName} phone={phone} school={school} />;
  }

  if (unsupported) {
    return (
      <WaitlistScreen
        school={unsupported}
        state={waitlistState}
        action={waitlistAction}
        pending={waitlistPending}
        onBack={() => setUnsupported(null)}
      />
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[19rem_1fr] lg:gap-16">
      <StepRail step={step} />

      <div className="min-w-0">
        <form action={submitAction} className="rounded-[1.4rem] bg-white p-6 shadow-soft ring-1 ring-line sm:p-9">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-brand-600">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="mt-2 text-[1.6rem] font-extrabold leading-tight text-ink-900">
            {STEPS[step].title}
          </h1>

          <div className="mt-7">
            {step === 0 ? (
              <div className="flex flex-col gap-5">
                <p className="text-[0.95rem] leading-[1.65] text-body">
                  Classistant reads your mail and calendar through Google, so it only works
                  where your school runs student email on Google Workspace.
                </p>
                <SchoolPicker value={school} onSelect={setSchool} onUnsupported={setUnsupported} />
                {school?.note ? (
                  <p className="rounded-xl bg-sky-50 p-4 text-[0.85rem] leading-[1.6] text-ink-800 ring-1 ring-sky-200">
                    {school.note}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="flex flex-col gap-5">
                <p className="text-[0.95rem] leading-[1.65] text-body">
                  Sign in with your{" "}
                  <span className="font-semibold text-ink-900">@{school?.emailDomain}</span>{" "}
                  account. Google shows you exactly what you are granting, and you can take it
                  back from your Google account settings at any time.
                </p>

                <ul className="flex flex-col gap-2.5">
                  {[
                    "Read your course email and announcements",
                    "Create and update events on your calendar",
                    "Send email you have approved, from your address",
                    "Read syllabi and course files in your Drive",
                  ].map((scope) => (
                    <li key={scope} className="flex items-start gap-3 text-[0.9rem] text-ink-800">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                      {scope}
                    </li>
                  ))}
                </ul>

                <button
                  type="submit"
                  formAction={googleAction}
                  disabled={googlePending}
                  className="flex items-center justify-center gap-3 rounded-xl border border-line bg-white px-5 py-3.5 text-[0.95rem] font-semibold text-ink-900 transition-colors hover:bg-sky-50 disabled:opacity-60"
                >
                  <GoogleGlyph />
                  {googlePending ? "Opening Google..." : "Continue with Google"}
                </button>
                <input type="hidden" name="schoolId" value={school?.id ?? ""} />

                {googleState ? (
                  <p
                    className={cn(
                      "rounded-xl p-4 text-[0.85rem] leading-[1.6] ring-1",
                      googleState.ok
                        ? "bg-sky-50 text-ink-800 ring-sky-200"
                        : "bg-paper text-ink-800 ring-line",
                    )}
                  >
                    {googleState.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="flex flex-col gap-5">
                <Field label="Full name" htmlFor="fullName" error={errors.fullName} hint="As your school has it on file.">
                  <TextInput
                    id="fullName"
                    name="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Amara Okonkwo"
                    autoComplete="name"
                    invalid={Boolean(errors.fullName)}
                  />
                </Field>

                <Field
                  label="School email"
                  htmlFor="schoolEmail"
                  error={errors.schoolEmail}
                  hint={school ? `Must end in @${school.emailDomain}` : undefined}
                >
                  <TextInput
                    id="schoolEmail"
                    name="schoolEmail"
                    type="email"
                    value={schoolEmail}
                    onChange={(e) => setSchoolEmail(e.target.value)}
                    placeholder={school ? `you@${school.emailDomain}` : "you@school.ca"}
                    autoComplete="email"
                    invalid={Boolean(errors.schoolEmail)}
                  />
                </Field>

                <Field
                  label="Mobile number"
                  htmlFor="phone"
                  error={errors.phone}
                  hint="Canadian mobile numbers only. This is where every text and call comes from."
                >
                  <TextInput
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(604) 555-0123"
                    autoComplete="tel-national"
                    invalid={Boolean(errors.phone)}
                  />
                </Field>

                <Choice
                  name="consentSms"
                  checked={consentSms}
                  onChange={() => setConsentSms((v) => !v)}
                  title="Text me about my courses"
                  body="You agree to receive automated texts from Classistant about your schoolwork. Message and data rates may apply. Reply STOP to end at any time."
                />
                {errors.consentSms ? (
                  <p role="alert" className="-mt-3 text-[0.8rem] font-medium text-ink-800">
                    {errors.consentSms}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="flex flex-col gap-5">
                <div className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
                  <p className="text-[0.85rem] leading-[1.65] text-ink-800">
                    Posted grades, course files, and most syllabi sit behind your portal login
                    with no API in front of them. Classistant signs in as you, in an isolated
                    browser, to read those pages. Your password is encrypted at rest and is only
                    ever sent to {school?.name ?? "your school"}.
                  </p>
                </div>

                <Field
                  label="Portal username or student number"
                  htmlFor="portalUser"
                  error={errors.portalUser}
                >
                  <TextInput
                    id="portalUser"
                    name="portalUser"
                    value={portalUser}
                    onChange={(e) => setPortalUser(e.target.value)}
                    placeholder="aokonkwo"
                    autoComplete="off"
                    invalid={Boolean(errors.portalUser)}
                  />
                </Field>

                <Field label="Portal password" htmlFor="portalPassword" error={errors.portalPassword}>
                  <div className="relative">
                    <TextInput
                      id="portalPassword"
                      name="portalPassword"
                      type={showPassword ? "text" : "password"}
                      value={portalPassword}
                      onChange={(e) => setPortalPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pr-20"
                      invalid={Boolean(errors.portalPassword)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[0.78rem] font-semibold text-brand-600 hover:bg-sky-100"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </Field>

                <p className="text-[0.82rem] leading-[1.6] text-body-soft">
                  If your school requires two factor sign in, you will get a text asking you to
                  approve the first crawl. After that it runs on its own.
                </p>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="flex flex-col gap-6">
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[0.88rem] font-semibold text-ink-900">
                    How hard should it push?
                  </legend>
                  {(
                    [
                      { id: "gentle", title: "Gentle", body: "One heads up per deadline, and that is it." },
                      { id: "standard", title: "Standard", body: "Escalates as the deadline gets closer. Ends with a final warning." },
                      { id: "relentless", title: "Relentless", body: "Everything in standard, plus a daily check in on anything unstarted." },
                    ] as const
                  ).map((option) => (
                    <Choice
                      key={option.id}
                      type="radio"
                      name="intensity"
                      checked={intensity === option.id}
                      onChange={() => setIntensity(option.id)}
                      title={option.title}
                      body={option.body}
                    />
                  ))}
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[0.88rem] font-semibold text-ink-900">Calls</legend>
                  <Choice
                    name="callsEnabled"
                    checked={callsEnabled}
                    onChange={() => setCallsEnabled((v) => !v)}
                    title="Call me if I ignore the final warning"
                    body="A voice call for the deadlines you are about to miss. Reply STOP CALLS any time to turn this off."
                  />
                  <Choice
                    name="callsForEmail"
                    checked={callsForEmail}
                    onChange={() => setCallsForEmail((v) => !v)}
                    title="Also call me for urgent email"
                    body="Exam room changes, cancelled finals, anything from a prof marked urgent."
                  />
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Quiet hours start" htmlFor="quietFrom">
                    <TimeSelect id="quietFrom" name="quietFrom" value={quietFrom} onChange={setQuietFrom} />
                  </Field>
                  <Field label="Quiet hours end" htmlFor="quietTo">
                    <TimeSelect id="quietTo" name="quietTo" value={quietTo} onChange={setQuietTo} />
                  </Field>
                </div>
                <p className="-mt-2 text-[0.82rem] leading-[1.6] text-body-soft">
                  Nothing reaches you inside these hours unless a deadline lands during them and
                  you asked to be told.
                </p>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="flex flex-col gap-5">
                <dl className="divide-y divide-line-soft rounded-xl bg-paper p-1 ring-1 ring-line">
                  <Row label="School" value={school?.name ?? "Not set"} />
                  <Row label="Name" value={fullName || "Not set"} />
                  <Row label="School email" value={schoolEmail || "Not set"} />
                  <Row label="Texts to" value={phone || "Not set"} />
                  <Row label="Portal user" value={portalUser || "Not set"} />
                  <Row label="Password" value="Stored encrypted, never shown again" />
                  <Row label="Pushiness" value={intensity} />
                  <Row label="Calls" value={callsEnabled ? "On for final warnings" : "Off"} />
                  <Row label="Quiet hours" value={`${quietFrom} to ${quietTo}`} />
                </dl>

                <p className="text-[0.85rem] leading-[1.65] text-body">
                  By finishing you agree to the{" "}
                  <Link href="/terms" className="font-semibold text-brand-600 hover:underline">
                    terms of service
                  </Link>{" "}
                  and the{" "}
                  <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
                    privacy policy
                  </Link>
                  .
                </p>

                {submitState && !submitState.ok ? (
                  <p role="alert" className="rounded-xl bg-paper p-4 text-[0.86rem] text-ink-800 ring-1 ring-line">
                    {submitState.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Everything collected travels with the final submit. */}
          <HiddenState
            values={{
              schoolId: school?.id ?? "",
              fullName,
              schoolEmail,
              phone,
              portalUser,
              portalPassword,
              intensity,
              quietFrom,
              quietTo,
              callsEnabled: callsEnabled ? "on" : "",
              callsForEmail: callsForEmail ? "on" : "",
              consentSms: consentSms ? "on" : "",
            }}
            skip={step}
          />

          <div className="mt-9 flex items-center justify-between gap-4 border-t border-line-soft pt-6">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="rounded-lg px-3 py-2 text-[0.9rem] font-semibold text-body transition-colors hover:bg-sky-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-0"
            >
              Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
                className="rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-70"
              >
                {submitting ? "Setting up..." : "Finish setup"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Mirrors wizard state into the form as hidden inputs, skipping any field the
 * current step already renders as a real input so a name is never submitted twice.
 */
function HiddenState({ values, skip }: { values: Record<string, string>; skip: number }) {
  const renderedByStep: Record<number, string[]> = {
    1: ["schoolId"],
    2: ["fullName", "schoolEmail", "phone", "consentSms"],
    3: ["portalUser", "portalPassword"],
    4: ["intensity", "callsEnabled", "callsForEmail", "quietFrom", "quietTo"],
  };
  const skipped = new Set(renderedByStep[skip] ?? []);

  return (
    <>
      {Object.entries(values)
        .filter(([key]) => !skipped.has(key))
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 px-4 py-3">
      <dt className="text-[0.85rem] text-body-soft">{label}</dt>
      <dd className="truncate text-right text-[0.88rem] font-semibold capitalize text-ink-900">
        {value}
      </dd>
    </div>
  );
}

function TimeSelect({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const times = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[0.95rem] text-ink-900 outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12"
    >
      {times.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Left rail. The connecting line fills as steps complete. */
function StepRail({ step }: { step: number }) {
  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <Link href="/" className="inline-flex items-center gap-2.5">
        <LogoMark size={34} />
        <span className="font-display text-[1.2rem] font-extrabold tracking-[-0.03em] text-ink-900">
          Classistant
        </span>
      </Link>

      <ol className="relative mt-8 hidden flex-col gap-6 lg:flex">
        <span aria-hidden="true" className="absolute left-[0.68rem] top-3 h-[calc(100%-1.5rem)] w-0.5 rounded bg-line" />
        <span
          aria-hidden="true"
          className="absolute left-[0.68rem] top-3 w-0.5 rounded bg-brand-500 transition-[height] duration-500 ease-out"
          style={{ height: `calc((100% - 1.5rem) * ${step / (STEPS.length - 1)})` }}
        />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex items-start gap-4">
            <span
              className={cn(
                "z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.68rem] font-bold transition-colors duration-300",
                i < step
                  ? "bg-brand-600 text-white"
                  : i === step
                    ? "bg-brand-600 text-white ring-4 ring-brand-500/20"
                    : "bg-white text-body-soft ring-1 ring-line",
              )}
            >
              {i < step ? (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2.5 6.2 4.7 8.4 9.5 3.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span>
              <span className={cn("block text-[0.9rem] font-semibold", i <= step ? "text-ink-900" : "text-body-soft")}>
                {s.title}
              </span>
              <span className="mt-0.5 block text-[0.78rem] leading-[1.5] text-body-soft">{s.blurb}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* Compact progress for small screens */}
      <div className="mt-6 flex items-center gap-2 lg:hidden">
        {STEPS.map((s, i) => (
          <span
            key={s.title}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              i <= step ? "bg-brand-600" : "bg-line",
            )}
          />
        ))}
      </div>
    </aside>
  );
}

function DoneScreen({ name, phone, school }: { name: string; phone: string; school: School | null }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <span className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-sky-100">
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-sky-300/50 motion-safe:animate-[pulse-ring_2.6s_ease-out_infinite]" />
        <LogoMark size={42} animated />
      </span>

      <h1 className="mt-7 text-[2rem] font-extrabold leading-tight text-ink-900">
        You are set up{name ? `, ${name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-4 text-[1rem] leading-[1.7] text-body">
        Classistant is reading {school?.name ?? "your school"} now. Within about ten minutes you
        will get a text at <span className="font-semibold text-ink-900">{phone}</span> with every
        deadline it found. Reply to that text to talk to it.
      </p>

      <div className="mt-8 rounded-2xl bg-paper p-6 text-left ring-1 ring-line">
        <p className="text-[0.85rem] font-semibold uppercase tracking-[0.14em] text-brand-600">
          Worth knowing
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {[
            "Reply STOP at any time to end everything.",
            "Reply STOP CALLS to keep texts but drop the phone calls.",
            "Reply DELETE to wipe your account and all term data.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3 text-[0.9rem] text-ink-800">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/"
        className="mt-8 inline-block rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Back to home
      </Link>
    </div>
  );
}

function WaitlistScreen({
  school,
  state,
  action,
  pending,
  onBack,
}: {
  school: School;
  state: { ok: boolean; message: string; errors?: Record<string, string> } | null;
  action: (formData: FormData) => void;
  pending: boolean;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/" className="inline-flex items-center gap-2.5">
        <LogoMark size={34} />
        <span className="font-display text-[1.2rem] font-extrabold tracking-[-0.03em] text-ink-900">
          Classistant
        </span>
      </Link>

      <h1 className="mt-8 text-[1.75rem] font-extrabold leading-tight text-ink-900">
        {school.name} is not supported yet
      </h1>
      <p className="mt-4 text-[0.98rem] leading-[1.7] text-body">
        We have not confirmed that student email at {school.name} runs on Google Workspace, and
        Classistant cannot read your courses without it. Leave your email and we will tell you
        the day that changes.
      </p>

      {state?.ok ? (
        <p className="mt-7 rounded-xl bg-sky-50 p-5 text-[0.92rem] leading-[1.6] text-ink-800 ring-1 ring-sky-200">
          {state.message}
        </p>
      ) : (
        <form action={action} className="mt-7 flex flex-col gap-3">
          <input type="hidden" name="schoolId" value={school.id} />
          <Field label="Email" htmlFor="waitlist-email" error={state?.errors?.email}>
            <TextInput
              id="waitlist-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              invalid={Boolean(state?.errors?.email)}
            />
          </Field>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-70"
          >
            {pending ? "Adding you..." : "Tell me when it is ready"}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-6 text-[0.9rem] font-semibold text-brand-600 hover:underline"
      >
        Pick a different school
      </button>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.34-.18-1.96H10v3.72h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.74 2.98-4.3 2.98-7.28Z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H1.06v2.58A10 10 0 0 0 10 20Z"
      />
      <path
        fill="#FBBC05"
        d="M4.4 11.9a6 6 0 0 1 0-3.82V5.5H1.06a10 10 0 0 0 0 9l3.34-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M10 3.96c1.47 0 2.78.5 3.82 1.5l2.86-2.86C14.96.98 12.7 0 10 0A10 10 0 0 0 1.06 5.5L4.4 8.08C5.2 5.72 7.4 3.96 10 3.96Z"
      />
    </svg>
  );
}
