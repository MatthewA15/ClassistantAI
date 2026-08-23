"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  completeOnboarding,
  connectGoogle,
  joinWaitlist,
  type Identity,
} from "@/app/onboarding/actions";
import { SchoolPicker } from "@/components/onboarding/SchoolPicker";
import { Choice, Field, TextInput, formatPhone } from "@/components/onboarding/fields";
import { LogoMark } from "@/components/brand/LogoMark";
import { useSchoolTheme } from "@/components/theme/SchoolTheme";
import { getSchool, type School } from "@/data/schools";
import { cn } from "@/lib/cn";

/**
 * Four screens, down from six. The school is already chosen in the hero and
 * arrives as ?school=, so this starts at the sign-in hand-off.
 *
 * Order: connect, portal password, confirm details, phone number.
 *
 * Two deliberate placements:
 *
 * The **portal password comes second, right after Google**, not first. Google
 * has just demonstrated a normal consent flow at that point, which is the best
 * possible moment to ask for something less normal. It is still needed despite
 * the OAuth sign-in: OAuth authorises mail, calendar, and Drive, but it does
 * not create a session on the school's LMS, and the agent has to sign in there
 * overnight while the student is asleep and cannot approve anything.
 *
 * The **phone number is last**, behind the Finish button. It is the one field
 * with no upside for the student until everything else is agreed, and asking
 * for it early is what makes a form feel like a lead-capture page.
 */

const STEPS = [
  { title: "Connect your school account", blurb: "Sign in where you always do" },
  { title: "Let it work while you sleep", blurb: "Portal login for overnight checks" },
  { title: "Check your details", blurb: "Straight from your school account" },
  { title: "Where should it text you?", blurb: "The number the agent uses" },
];

export function OnboardingWizard() {
  const params = useSearchParams();
  const { school: themedSchool, setSchool } = useSchoolTheme();

  const preselected = params.get("school");
  const [school, setLocalSchool] = useState<School | null>(
    preselected ? (getSchool(preselected) ?? null) : null,
  );
  const [unsupported, setUnsupported] = useState<School | null>(null);

  // Carry the hero's theme through, or set it if someone deep-links here.
  useEffect(() => {
    if (school && themedSchool?.id !== school.id) setSchool(school.id);
  }, [school, themedSchool, setSchool]);

  const [step, setStep] = useState(0);
  const [identity, setIdentity] = useState<Identity | null>(null);

  const [nickname, setNickname] = useState("");
  const [editingNickname, setEditingNickname] = useState(false);
  const [serviceEmail, setServiceEmail] = useState("");
  const [editingServiceEmail, setEditingServiceEmail] = useState(false);

  const [portalUser, setPortalUser] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [phone, setPhone] = useState("");
  const [consentSms, setConsentSms] = useState(false);

  const [connectState, connectAction, connecting] = useActionState(
    async (prev: Awaited<ReturnType<typeof connectGoogle>> | null, formData: FormData) => {
      const result = await connectGoogle(prev, formData);
      if (result.ok && result.identity) {
        setIdentity(result.identity);
        setStep(1);
      }
      return result;
    },
    null,
  );

  const [submitState, submitAction, submitting] = useActionState(completeOnboarding, null);
  const errors = submitState?.errors ?? {};

  if (submitState?.ok) {
    return <DoneScreen name={nickname || identity?.name || ""} phone={phone} school={school} />;
  }

  if (unsupported) {
    return <UnsupportedScreen school={unsupported} onBack={() => setUnsupported(null)} />;
  }

  if (!school) {
    return (
      <Shell step={0}>
        <h1 className="text-[1.6rem] font-extrabold leading-tight text-ink-900">
          Which school are you at?
        </h1>
        <p className="mt-2 text-[0.95rem] text-body">
          Classistant works where student email runs on Google.
        </p>
        <div className="mt-6">
          <SchoolPicker value={null} onSelect={setLocalSchool} onUnsupported={setUnsupported} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell step={step} school={school}>
      <form action={submitAction}>
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-brand-600">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-2 text-[1.6rem] font-extrabold leading-tight text-ink-900">
          {STEPS[step].title}
        </h1>

        {/* -------------------------------------------------- 1. connect */}
        {step === 0 ? (
          <div className="mt-7 flex flex-col gap-5">
            <p className="text-[0.95rem] leading-[1.6] text-body">
              This takes you to {school.name}&rsquo;s own sign-in page, the same one you use for
              your email. Classistant never sees your password.
            </p>

            <Field
              label="Your school username"
              htmlFor="username"
              error={connectState?.errors?.username}
              hint={`We add @${school.emailDomain} for you, which is what sends you straight to your school's login page instead of a Google account chooser.`}
            >
              <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/12">
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="yourname"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[0.95rem] text-ink-900 outline-none placeholder:text-body-soft/70"
                />
                <span className="grid shrink-0 place-items-center border-l border-line bg-paper px-3 font-mono text-[0.85rem] text-body-soft">
                  @{school.emailDomain}
                </span>
              </div>
            </Field>

            <input type="hidden" name="schoolId" value={school.id} />

            <button
              type="submit"
              formAction={connectAction}
              disabled={connecting}
              className="flex items-center justify-center gap-3 rounded-xl border border-line bg-white px-5 py-3.5 text-[0.95rem] font-semibold text-ink-900 transition-colors hover:bg-sky-50 disabled:opacity-60"
            >
              <GoogleGlyph />
              {connecting ? "Opening your school sign-in..." : "Continue with Google"}
            </button>

            {connectState && !connectState.ok ? (
              <p role="alert" className="text-[0.85rem] text-ink-800">
                {connectState.message}
              </p>
            ) : null}

            <ScopeList />
          </div>
        ) : null}

        {/* ------------------------------------------ 2. portal password */}
        {step === 1 ? (
          <div className="mt-7 flex flex-col gap-5">
            <div className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
              <p className="text-[0.88rem] leading-[1.65] text-ink-800">
                Signing in with Google let it read your mail and calendar. It does not give it a
                session on {school.name}&rsquo;s portal, and that is where posted grades and
                course files live. Classistant checks the portal overnight, while you are asleep
                and cannot approve anything, so it needs to be able to sign in on its own.
              </p>
            </div>

            <Field label="Portal username or student number" htmlFor="portalUser" error={errors.portalUser}>
              <TextInput
                id="portalUser"
                name="portalUser"
                value={portalUser}
                onChange={(e) => setPortalUser(e.target.value)}
                placeholder={identity?.email.split("@")[0] ?? "yourname"}
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
                  // new-password, so browsers do not offer a saved credential
                  // from an unrelated site.
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

            <ul className="flex flex-col gap-2 rounded-xl bg-paper p-4 ring-1 ring-line">
              {[
                "Encrypted at rest, with keys held separately.",
                "Only ever sent to your school's own login page.",
                "Never shown back to you, and no staff member can read it.",
                "Destroyed the moment you delete your account.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[0.84rem] text-ink-800">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* -------------------------------------------------- 3. details */}
        {step === 2 && identity ? (
          <div className="mt-7 flex flex-col gap-5">
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-body-soft">
                From your school account
              </p>

              <dl className="mt-4 flex flex-col gap-4">
                <div>
                  <dt className="text-[0.8rem] text-body-soft">Name</dt>
                  {editingNickname ? (
                    <TextInput
                      autoFocus
                      name="nickname"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      onBlur={() => setEditingNickname(false)}
                      placeholder="What should it call you?"
                      className="mt-1"
                      invalid={Boolean(errors.nickname)}
                    />
                  ) : (
                    <dd className="mt-0.5 flex flex-wrap items-center gap-3">
                      <span className="text-[1.02rem] font-semibold text-ink-900">
                        {nickname || identity.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingNickname(true)}
                        className="text-[0.82rem] font-semibold text-brand-600 hover:underline"
                      >
                        Change nickname
                      </button>
                    </dd>
                  )}
                  {identity.simulated && !nickname ? (
                    <p className="mt-1.5 text-[0.76rem] text-body-soft">
                      Google is not connected yet, so this name is placeholder data.
                    </p>
                  ) : null}
                </div>

                <div>
                  <dt className="text-[0.8rem] text-body-soft">School email</dt>
                  <dd className="mt-0.5 font-mono text-[0.92rem] text-ink-900">{identity.email}</dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-line pt-4">
                {editingServiceEmail ? (
                  <Field
                    label="Account for Drive, Calendar, and email"
                    htmlFor="serviceEmail"
                    error={errors.serviceEmail}
                    hint="Only if your coursework lives in a different Google account."
                  >
                    <TextInput
                      autoFocus
                      id="serviceEmail"
                      name="serviceEmail"
                      type="email"
                      value={serviceEmail}
                      onChange={(e) => setServiceEmail(e.target.value)}
                      placeholder="you@example.com"
                      invalid={Boolean(errors.serviceEmail)}
                    />
                  </Field>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingServiceEmail(true)}
                    className="text-left text-[0.85rem] font-semibold text-brand-600 hover:underline"
                  >
                    Different email for Google Drive, Calendar, and email?
                  </button>
                )}
              </div>
            </div>

            <Choice
              name="acceptTerms"
              checked={acceptTerms}
              onChange={() => setAcceptTerms((v) => !v)}
              title="I accept the terms and privacy policy"
              body="Including that Classistant can read course mail and write to your calendar."
            />
            {errors.acceptTerms ? (
              <p role="alert" className="-mt-3 text-[0.8rem] font-medium text-ink-800">
                {errors.acceptTerms}
              </p>
            ) : null}

            <Choice
              name="acceptMarketing"
              checked={acceptMarketing}
              onChange={() => setAcceptMarketing((v) => !v)}
              title="Send me product emails"
              body="Occasional updates about new features. Nothing to do with your coursework, and you can opt out any time."
            />

            <p className="text-[0.82rem] leading-[1.6] text-body-soft">
              Read the{" "}
              <Link href="/terms" className="font-semibold text-brand-600 hover:underline">
                terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
                privacy policy
              </Link>
              .
            </p>
          </div>
        ) : null}

        {/* ---------------------------------------------------- 4. phone */}
        {step === 3 ? (
          <div className="mt-7 flex flex-col gap-5">
            <p className="text-[0.95rem] leading-[1.6] text-body">
              This is the only place Classistant lives day to day. Everything else is set.
            </p>

            <Field
              label="Mobile number"
              htmlFor="phone"
              error={errors.phone}
              hint="Canadian mobile numbers only."
            >
              <TextInput
                autoFocus
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
              title="Text me about my coursework"
              body="Automated texts from Classistant about your schoolwork. Message and data rates may apply. Reply STOP to end at any time."
            />
            {errors.consentSms ? (
              <p role="alert" className="-mt-3 text-[0.8rem] font-medium text-ink-800">
                {errors.consentSms}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Everything travels with the final submit. */}
        <HiddenState
          step={step}
          values={{
            schoolId: school.id,
            email: identity?.email ?? "",
            name: identity?.name ?? "",
            nickname,
            serviceEmail,
            portalUser,
            portalPassword,
            phone,
            acceptTerms: acceptTerms ? "on" : "",
            acceptMarketing: acceptMarketing ? "on" : "",
            consentSms: consentSms ? "on" : "",
          }}
        />

        {submitState && !submitState.ok ? (
          <p role="alert" className="mt-6 rounded-xl bg-paper p-4 text-[0.86rem] text-ink-800 ring-1 ring-line">
            {submitState.message}
          </p>
        ) : null}

        <div className="mt-9 flex items-center justify-between gap-4 border-t border-line-soft pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg px-3 py-2 text-[0.9rem] font-semibold text-body transition-colors hover:bg-sky-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-0"
          >
            Back
          </button>

          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={portalUser.trim().length < 2 || portalPassword.length < 6}
              className="rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft"
            >
              Continue
            </button>
          ) : null}

          {step === 2 ? (
            // The big one. It asks for the number, rather than submitting.
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!acceptTerms}
              className="rounded-xl bg-brand-600 px-8 py-4 text-[1rem] font-bold text-white shadow-[0_12px_28px_-12px_var(--color-brand-600)] transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft disabled:shadow-none"
            >
              Finish
            </button>
          ) : null}

          {step === 3 ? (
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-8 py-4 text-[1rem] font-bold text-white shadow-[0_12px_28px_-12px_var(--color-brand-600)] transition-colors hover:bg-brand-700 disabled:opacity-70"
            >
              {submitting ? "Setting up..." : "Start texting me"}
            </button>
          ) : null}
        </div>
      </form>
    </Shell>
  );
}

/**
 * Mirrors state into the form, skipping anything the current step renders as a
 * real input so a name is never submitted twice.
 */
function HiddenState({ step, values }: { step: number; values: Record<string, string> }) {
  const rendered: Record<number, string[]> = {
    0: ["schoolId"],
    1: ["portalUser", "portalPassword"],
    2: ["nickname", "serviceEmail", "acceptTerms", "acceptMarketing"],
    3: ["phone", "consentSms"],
  };
  const skip = new Set(rendered[step] ?? []);
  return (
    <>
      {Object.entries(values)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
    </>
  );
}

function ScopeList() {
  return (
    <ul className="flex flex-col gap-2 rounded-xl bg-paper p-4 ring-1 ring-line">
      <li className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-body-soft">
        Google will ask you to allow
      </li>
      {[
        "Read course email and announcements",
        "Create and update calendar events",
        "Send email you have approved, from your address",
        "Read syllabi and course files in Drive",
      ].map((scope) => (
        <li key={scope} className="flex items-start gap-2.5 text-[0.85rem] text-ink-800">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
          {scope}
        </li>
      ))}
    </ul>
  );
}

function Shell({
  step,
  school,
  children,
}: {
  step: number;
  school?: School;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[17rem_1fr] lg:gap-14">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="font-display text-[1.1rem] font-extrabold tracking-[-0.03em] text-ink-900">
            Classistant
          </span>
        </Link>

        {school ? (
          <p className="mt-5 text-[0.88rem] font-semibold text-ink-900">{school.name}</p>
        ) : null}

        <ol className="mt-6 hidden flex-col gap-4 lg:flex">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.68rem] font-bold transition-colors",
                  i < step
                    ? "bg-brand-600 text-white"
                    : i === step
                      ? "bg-brand-600 text-white ring-4 ring-brand-500/20"
                      : "bg-white text-body-soft ring-1 ring-line",
                )}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span>
                <span
                  className={cn(
                    "block text-[0.88rem] font-semibold",
                    i <= step ? "text-ink-900" : "text-body-soft",
                  )}
                >
                  {s.title}
                </span>
                <span className="mt-0.5 block text-[0.76rem] text-body-soft">{s.blurb}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex items-center gap-2 lg:hidden">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-brand-600" : "bg-line")}
            />
          ))}
        </div>
      </aside>

      <div className="min-w-0 rounded-[1.4rem] bg-white p-6 shadow-soft ring-1 ring-line sm:p-9">
        {children}
      </div>
    </div>
  );
}

function DoneScreen({ name, phone, school }: { name: string; phone: string; school: School | null }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <span className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-sky-100">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-sky-300/50 motion-safe:animate-[pulse-ring_2.6s_ease-out_infinite]"
        />
        <LogoMark size={42} animated />
      </span>

      <h1 className="mt-7 text-[2rem] font-extrabold leading-tight text-ink-900">
        You are set up{name ? `, ${name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-4 text-[1rem] leading-[1.7] text-body">
        Classistant is reading {school?.name ?? "your school"} now. Within about ten minutes you
        will get a text at <span className="font-semibold text-ink-900">{phone}</span> with every
        deadline it found.
      </p>

      <div className="mt-8 rounded-2xl bg-paper p-6 text-left ring-1 ring-line">
        <ul className="flex flex-col gap-3">
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

function UnsupportedScreen({ school, onBack }: { school: School; onBack: () => void }) {
  const [state, action, pending] = useActionState(joinWaitlist, null);

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/" className="inline-flex items-center gap-2.5">
        <LogoMark size={32} />
        <span className="font-display text-[1.15rem] font-extrabold tracking-[-0.03em] text-ink-900">
          Classistant
        </span>
      </Link>
      <h1 className="mt-8 text-[1.75rem] font-extrabold leading-tight text-ink-900">
        {school.name} is not supported yet
      </h1>
      {/* Two different facts, and saying the wrong one is a real error. A
          `soon` school HAS been confirmed on Google and is simply not open yet;
          telling that student we have not checked is both false and a worse
          answer than the truth, which is that they are next. */}
      <p className="mt-4 text-[0.98rem] leading-[1.7] text-body">
        {school.status === "soon" ? (
          <>
            Student email at {school.name} does run on Google, so Classistant will work there. We
            have not opened the campus yet. Leave your address and we will email you the day it is
            ready.
          </>
        ) : (
          <>
            Classistant reads your courses through Google, and we have not confirmed that student
            email at {school.name} runs on Google Workspace. Leave your address and we will tell
            you the day that changes.
          </>
        )}
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
      <path fill="#FBBC05" d="M4.4 11.9a6 6 0 0 1 0-3.82V5.5H1.06a10 10 0 0 0 0 9l3.34-2.6Z" />
      <path
        fill="#EA4335"
        d="M10 3.96c1.47 0 2.78.5 3.82 1.5l2.86-2.86C14.96.98 12.7 0 10 0A10 10 0 0 0 1.06 5.5L4.4 8.08C5.2 5.72 7.4 3.96 10 3.96Z"
      />
    </svg>
  );
}
