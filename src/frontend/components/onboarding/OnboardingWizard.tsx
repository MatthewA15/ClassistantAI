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
import {
  ConnectScene,
  SceneCard,
  SealedPasswordScene,
} from "@/components/onboarding/connectScenes";
import { Choice, Field, TextInput, formatPhone } from "@/components/onboarding/fields";
import { PhoneVerifyScene } from "@/components/onboarding/phoneScenes";
import { LogoMark } from "@/components/brand/LogoMark";
import { useSchoolTheme } from "@/components/theme/SchoolTheme";
import { ACCESS_ITEMS, defaultAccess, type AccessKey } from "@/data/access";
import { CONSENT_COPY } from "@/data/consent";
import { getSchool, type School } from "@/data/schools";
import { cn } from "@/lib/cn";
import {
  confirmCode,
  phoneErrorMessage,
  sendVerificationCode,
  signOutClient,
  type PendingVerification,
} from "@/lib/firebaseClient";

/**
 * Four screens. The school is already chosen in the hero and arrives as
 * ?school=, so this starts at the number.
 *
 * Order: verify your number, connect Google, portal password, choose what it
 * may touch.
 *
 * Three deliberate placements:
 *
 * The **phone number is first**, which is the reverse of where it used to be.
 * It used to sit last, behind the Finish button, on the reasoning that a field
 * with no upside for the student should not be what a form opens with. That
 * reasoning was right about a marketing form and wrong about this one: the
 * number is now the login (Firebase phone auth, docs/design/15), so it is not
 * a detail being collected, it is the thing that identifies them. Everything
 * after it is attached to a verified person rather than to a session that could
 * be anyone.
 *
 * The **portal password comes after Google**, not before. Google has just
 * demonstrated a normal consent flow at that point, which is the best possible
 * moment to ask for something less normal. It is still needed despite the OAuth
 * grant: OAuth authorises mail, calendar, and Drive, but it does not create a
 * session on the school's LMS, and the agent has to sign in there overnight
 * while the student is asleep and cannot approve anything.
 *
 * The **access switches come last**, after the grant rather than before it.
 * Google's consent screen is all or nothing, so a student cannot narrow it
 * there; the only place a real choice can be offered is afterwards, and the
 * Google step says so in as many words before sending them.
 */

/** The heading on each screen. Four screens, but see PHASES below. */
const STEP_TITLES = [
  "What is your number?",
  "Connect your school account",
  "Let it work while you sleep",
  "Choose what it can touch",
];

/**
 * What the student is told they are doing, which is not the same as the number
 * of screens.
 *
 * Four screens were shown as four numbered steps in a rail down the side, plus
 * the school picker before them, so the flow announced itself as five things to
 * get through before anything happened. It is three: pick a school, sign in,
 * confirm your details. The two sign-in screens are one job with a technical
 * seam in the middle, and the same is true of the last two.
 *
 * Counting this way also means the school picker is worth something. It was
 * unnumbered, so a student arriving at screen two had done a third of the work
 * and was told they were at step one of four.
 */
/**
 * The last one is called "Welcome gift" rather than "Your details" because the
 * screen it labels is where a student finds out Classistant is free for the
 * whole beta. Naming the reward instead of the paperwork is the difference
 * between a third step and a reason to finish.
 */
const PHASES = ["Pick your school", "Log in", "Welcome gift"];

/** Screens 0 to 2 are all logging in; the last one is the reward. */
const phaseForStep = (step: number) => (step <= 2 ? 1 : 2);

/**
 * Shape check for the number, so the button can gate on it.
 *
 * Firebase does the real validation and the SMS arriving is the only proof that
 * matters; this exists so a student is not charged a round trip to find out they
 * typed nine digits. It cannot be shared with the server action that used to
 * hold it: actions.ts is a "use server" module, and a non-function export from
 * one throws at runtime on every request while still building cleanly.
 */
const PHONE_OK = /^[2-9]\d{9}$/;

/** Where the invisible reCAPTCHA mounts. Firebase resolves it by id, so it has
 *  to be stable and it has to exist in the DOM before a code can be sent. */
const RECAPTCHA_ID = "classistant-recaptcha";

/**
 * What the server already knows, read from the session cookie by the page,
 * because the cookie is httpOnly and this is a client component.
 *
 * Three fields for three distinct states, and keeping them apart is the whole
 * shape of the flow:
 *
 *   phone      set once Firebase has verified a number. Identity.
 *   granted    set once Google has been connected. Authorisation.
 *   email      only known after the grant, because it is only proven there.
 *
 * A student can hold the first without the second, which is the normal state in
 * the middle of onboarding rather than an error.
 */
export type ConnectedAccount = {
  phone: string;
  email: string | null;
  schoolId: string | null;
  granted: boolean;
};

export function OnboardingWizard({ connected }: { connected: ConnectedAccount | null }) {
  const params = useSearchParams();
  const { school: themedSchool, setSchool } = useSchoolTheme();

  const preselected = params.get("school") ?? connected?.schoolId;
  const [school, setLocalSchool] = useState<School | null>(
    preselected ? (getSchool(preselected) ?? null) : null,
  );
  const [unsupported, setUnsupported] = useState<School | null>(null);

  // Carry the hero's theme through, or set it if someone deep-links here.
  useEffect(() => {
    if (school && themedSchool?.id !== school.id) setSchool(school.id);
  }, [school, themedSchool, setSchool]);

  /*
   * Where to open, from what the server already proved.
   *
   *   nothing            step 0, the number
   *   number verified    step 1, connect Google
   *   grant complete     step 2, the portal password
   *
   * Coming back from the consent screen is the third case, which is why a
   * student never re-does a step they finished before leaving the page.
   */
  const [step, setStep] = useState(connected ? (connected.granted ? 2 : 1) : 0);

  /*
   * Derived, not state. The address is only ever known because the server
   * proved it during the access grant, and the return from Google is a full
   * page load, so there is no moment where this component learns it on its own.
   * Holding it in state would only create somewhere for a stale value to live.
   */
  const identity: Identity | null = connected?.email
    ? { email: connected.email, name: connected.email.split("@")[0] }
    : null;

  const [nickname, setNickname] = useState("");
  const [editingNickname, setEditingNickname] = useState(false);

  /*
   * Step 0. `pending` is Firebase's handle on the code it just texted; holding
   * it is what tells the two halves of this step apart, so it doubles as the
   * "code has been sent" flag rather than carrying a second boolean that could
   * disagree with it.
   */
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(
    connected?.phone ?? null,
  );

  /** Step 1. The address they say they will sign in with, checked against the
   *  school's domain here and against Google's answer in the callback. */
  const [schoolEmail, setSchoolEmail] = useState(connected?.email ?? "");

  /** Step 3. Starts fully on, which is where the grant actually is. */
  const [access, setAccess] = useState<Record<AccessKey, boolean>>(defaultAccess);

  /** The part before the @, which is all the field lets them edit. */
  const localPart = schoolEmail.replace(/@.*$/, "");

  const [portalUser, setPortalUser] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [consentSms, setConsentSms] = useState(false);

  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  /**
   * Step 0a. Texts the code.
   *
   * The reCAPTCHA lives in the hidden div rendered near the bottom of this
   * component. Firebase will not send an SMS without one: it is what stands
   * between this form and someone burning the project's messaging budget in a
   * loop. Invisible, so an ordinary student never sees a challenge.
   */
  const sendCode = async () => {
    setBusy(true);
    setPhoneError(null);
    try {
      setPending(await sendVerificationCode(phone, RECAPTCHA_ID));
      setCode("");
    } catch (err) {
      setPhoneError(phoneErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Step 0b. Spends the code, then trades the ID token for the session cookie.
   *
   * The number on the session after this is one Google delivered a message to
   * and saw typed back, which is why nothing later in the wizard asks for a
   * phone number again.
   */
  const verifyCode = async () => {
    if (!pending) return;
    setBusy(true);
    setPhoneError(null);
    try {
      const idToken = await confirmCode(pending, code);

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        phone?: string;
        connected?: boolean;
        error?: string;
      };

      if (!res.ok) {
        await signOutClient();
        setPhoneError(data.error ?? "We could not verify that number.");
        return;
      }

      setVerifiedPhone(data.phone ?? null);
      setPending(null);
      // Already granted on an earlier visit, so the consent screen has nothing
      // left to ask. Otherwise on to the school step.
      setStep(data.connected ? 2 : 1);
    } catch (err) {
      setPhoneError(phoneErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Step 1. Hands the tab to Google for the access grant.
   *
   * This is plain Google OAuth, not Firebase. Firebase's job ended with the
   * SMS; the refresh token the overnight agent needs can only come from an
   * authorisation-code exchange, which the connector performs with a client
   * secret this app never holds. See docs/design/15-firebase-auth.md.
   */
  const startGrant = async () => {
    if (!school) return;
    setBusy(true);
    setConnectError(null);

    // Set once we are handing the tab over. Clearing the pending state on the
    // way out would flip the button back to its resting label for as long as
    // the navigation takes, which on a slow connection is seconds of looking
    // like the press did nothing.
    let leaving = false;

    try {
      const grant = await connectGoogle(school.id, schoolEmail);
      if (!grant.ok || !grant.redirectUrl) {
        setConnectError(grant.errors?.schoolEmail ?? grant.message);
        return;
      }

      // A full navigation, not a router push: we are leaving the app for
      // accounts.google.com and will come back as a fresh page load.
      leaving = true;
      window.location.assign(grant.redirectUrl);
    } catch {
      setConnectError("We could not reach Google. Try again in a moment.");
    } finally {
      if (!leaving) setBusy(false);
    }
  };

  /** Lets a student on the wrong number or the wrong account start over. */
  const signOut = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    await signOutClient();
    // A full reload rather than local state: the session cookie is httpOnly and
    // the page decides which step to open on, so the server has to re-render.
    window.location.assign("/onboarding?school=" + encodeURIComponent(school?.id ?? ""));
  };

  // Errors the callback route reports back on the query string. Each is
  // something the student can act on; the underlying detail is in the logs.
  const OAUTH_ERRORS: Record<string, string> = {
    cancelled: "You cancelled the Google sign-in. Try again when you are ready.",
    domain: school
      ? `That Google account is not an @${school.emailDomain} address. Sign in with your school account.`
      : "That is not a school account.",
    state: "That sign-in link expired. Start again.",
    incomplete: "Google did not send us back everything we needed. Try again.",
    exchange: "We could not finish the sign-in with Google. Try again.",
    unreachable: "We could not reach our servers. Try again in a moment.",
    google: "Google turned down the sign-in. Try again.",
    school: "Pick a supported school first.",
    // The session expired while they were on Google's consent screen. Rare, and
    // recoverable by verifying the number again.
    signin: "Your session expired while you were with Google. Start again.",
    // They signed in at Google with a different address than the one they typed
    // on the school step. Nothing was stored: see the check in the callback.
    mismatch:
      "You signed in with a different address than the one you entered. Use the same one for both.",
  };
  const oauthError = OAUTH_ERRORS[params.get("error") ?? ""];

  const [submitState, submitAction, submitting] = useActionState(completeOnboarding, null);
  const errors = submitState?.errors ?? {};

  if (submitState?.ok) {
    return (
      <DoneScreen
        name={nickname || identity?.name || ""}
        phone={verifiedPhone ?? phone}
        school={school}
      />
    );
  }

  if (unsupported) {
    return <UnsupportedScreen school={unsupported} onBack={() => setUnsupported(null)} />;
  }

  if (!school) {
    return (
      <Shell phase={0}>
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
    <Shell phase={phaseForStep(step)} school={school}>
      <form action={submitAction}>
        <h1 className="text-[1.6rem] font-extrabold leading-tight text-ink-900">
          {STEP_TITLES[step]}
        </h1>

        {/* ---------------------------------------------- 1. your number */}
        {step === 0 ? (
          <div className="mt-7 flex flex-col gap-5">
            {/*
              Reason on the left, demonstration on the right.

              The scene ran full bleed first and was wrong at that size: it took
              up more of the step than the step's actual ask, which is one field.
              Half the width puts it at the same size the connect scenes render
              at in their own two-up row, which is what the rest of onboarding is
              calibrated to.

              Pairing them also fixes what the copy was doing. Above the scene it
              was a paragraph to read before getting to the picture; beside it,
              the reason for handing over a number sits next to the proof that it
              takes fifteen seconds. The gift line leads because it is the answer
              to "why do you want this", and it is the same promise the phase
              rail and the final button already make.
            */}
            <div className="grid items-center gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <p className="text-[1.05rem] font-semibold leading-[1.45] text-ink-900">
                  You will receive your welcome gift via text.
                </p>
                <p className="text-[0.9rem] leading-[1.6] text-body">
                  It is also how Classistant reaches you, and how you sign back in, so we
                  send a six digit code to check the number is really yours.
                </p>
              </div>

              {/* Labels itself, so there is no caption. */}
              <SceneCard>
                <PhoneVerifyScene />
              </SceneCard>
            </div>

            {/* Already verified, either earlier in this session or on a previous
                visit. The number is the login, so it is worth showing rather
                than leaving them guessing which one it went to. */}
            {verifiedPhone ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper p-4 ring-1 ring-line">
                <p className="text-[0.86rem] text-ink-800">
                  Verified <span className="font-semibold text-ink-900">{verifiedPhone}</span>
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg px-2.5 py-1 text-[0.82rem] font-semibold text-brand-600 transition-colors hover:bg-sky-100"
                >
                  Not your number?
                </button>
              </div>
            ) : pending ? (
              <>
                <Field
                  label="Six digit code"
                  htmlFor="code"
                  hint={`Sent to ${formatPhone(phone)}. It expires in a few minutes.`}
                >
                  <TextInput
                    autoFocus
                    id="code"
                    // Not `name`: this must never travel with the final submit.
                    // The code is spent here and is worthless afterwards.
                    type="text"
                    inputMode="numeric"
                    // The one autocomplete token phones actually act on: iOS and
                    // Android offer the code straight from the notification.
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => {
                      // The form's action is completeOnboarding. Enter here has
                      // to mean "verify", not "submit the whole wizard".
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (code.length === 6 && !busy) void verifyCode();
                      }
                    }}
                    placeholder="123456"
                    className="font-mono tracking-[0.4em]"
                    invalid={Boolean(phoneError)}
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={verifyCode}
                    disabled={busy || code.length !== 6}
                    className="rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft"
                  >
                    {busy ? "Checking..." : "Verify my number"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null);
                      setCode("");
                      setPhoneError(null);
                    }}
                    className="rounded-lg px-2.5 py-2 text-[0.85rem] font-semibold text-brand-600 transition-colors hover:bg-sky-100"
                  >
                    Use a different number
                  </button>
                </div>
              </>
            ) : (
              <>
                <Field
                  label="Mobile number"
                  htmlFor="phone"
                  error={phoneError ?? undefined}
                  hint="Canadian mobile numbers only."
                >
                  <TextInput
                    autoFocus
                    id="phone"
                    // Deliberately no `name`. The number reaches the server by
                    // being verified, not by being submitted, and a field named
                    // `phone` in this form would offer a second, unproven path.
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (PHONE_OK.test(phone.replace(/\D/g, "")) && !busy) void sendCode();
                      }
                    }}
                    placeholder="(604) 555-0123"
                    autoComplete="tel-national"
                    invalid={Boolean(phoneError)}
                  />
                </Field>

                <button
                  type="button"
                  onClick={sendCode}
                  disabled={busy || !PHONE_OK.test(phone.replace(/\D/g, ""))}
                  className="self-start rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft"
                >
                  {busy ? "Sending..." : "Text me a code"}
                </button>

                {/*
                  The ongoing-texts consent is NOT here, deliberately.

                  It used to be, and that was a trap: it only rendered in this
                  half of the step, so a student who left it unticked lost sight
                  of it the moment the code was sent and then failed the final
                  submit with the one control that could fix it three screens
                  behind them. It lives with the other consents on the last step
                  now, which is also where its error message appears.

                  Texting a verification code without it is fine. It is a
                  one-time message sent because they pressed the button asking
                  for it, which is transactional rather than the automated
                  coursework texts CONSENT_COPY.sms covers.
                */}
                <p className="text-[0.82rem] leading-[1.6] text-body-soft">
                  One text, right now, with a six digit code. Message and data rates may
                  apply.
                </p>
              </>
            )}
          </div>
        ) : null}

        {/* --------------------------------------- 2. school account */}
        {step === 1 ? (
          <div className="mt-7 flex flex-col gap-5">
            {/* Reason left, demonstration right, at the same half width as
                every other scene in the wizard. These two used to share a row
                with SealedPasswordScene, which is where that size comes from;
                giving each its own step is not a reason to double it. */}
            <div className="grid items-center gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <p className="text-[1.05rem] font-semibold leading-[1.45] text-ink-900">
                  You sign in on {school.name}&rsquo;s own page.
                </p>
                {/* "Nothing is typed here" was tried and is not true: the
                    address field is on this step. The claim worth making is
                    about the password, and the scene makes it. */}
                <p className="text-[0.9rem] leading-[1.6] text-body">
                  The same one you use for your email.
                </p>
              </div>

              {/* What happens when you press the button, in two acts, because
                  pressing it is what produces the consent screen. It labels
                  itself, so there is no caption. */}
              <SceneCard>
                <ConnectScene school={school} />
              </SceneCard>
            </div>

            <Field
              label="Student email"
              htmlFor="schoolEmail"
              error={errors.schoolEmail}
            >
              <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/12">
                <input
                  id="schoolEmail"
                  autoComplete="username"
                  placeholder="yourname"
                  value={localPart}
                  onChange={(e) =>
                    setSchoolEmail(
                      // Stored whole, edited as the part before the @. A student
                      // who pastes a full address should not end up with it
                      // twice over.
                      `${e.target.value.trim().toLowerCase().replace(/@.*$/, "")}@${school.emailDomain}`,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (localPart && !busy) void startGrant();
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[0.95rem] text-ink-900 outline-none placeholder:text-body-soft/70"
                />
                <span className="grid shrink-0 place-items-center border-l border-line bg-paper px-3 font-mono text-[0.85rem] text-body-soft">
                  @{school.emailDomain}
                </span>
              </div>
            </Field>

            {/* The promise that makes the all-or-nothing consent screen fair.
                Google cannot offer a partial grant, so the student is told
                before they go that the choosing happens on this side, and the
                last step is where it happens. */}
            <p className="rounded-xl bg-sky-50 p-4 text-[0.86rem] leading-[1.6] text-ink-800 ring-1 ring-sky-200">
              Google asks for everything at once. You will be able to switch off anything you
              do not want Classistant to touch in the last step.
            </p>

            {/* The button and the school's own joining note are one unit, so
                they sit in their own tighter stack rather than taking the
                column's gap-5. The note is not gated on the button: it is this
                school's instructions for what to type, which is most useful
                before there is anything in the field. */}
            {localPart || school.note ? (
              <div className="flex flex-col gap-2.5">
                {localPart ? (
                  <button
                    // type="button", not submit. The form's action is
                    // completeOnboarding, and this runs its own handler.
                    type="button"
                    onClick={startGrant}
                    disabled={busy}
                    style={{ animation: "bubble-in .35s var(--ease-out-soft) both" }}
                    className="flex items-center justify-center gap-3 rounded-xl border border-line bg-white px-5 py-3.5 text-[0.95rem] font-semibold text-ink-900 transition-colors hover:bg-sky-50 disabled:opacity-60"
                  >
                    <GoogleGlyph />
                    {busy ? "Opening your school sign-in..." : "Continue with Google"}
                  </button>
                ) : null}

                {school.note ? (
                  <p className="text-[0.82rem] leading-[1.55] text-body-soft">{school.note}</p>
                ) : null}
              </div>
            ) : null}

            {connectError ? (
              <p role="alert" className="text-[0.85rem] text-ink-800">
                {connectError}
              </p>
            ) : oauthError ? (
              <p
                role="alert"
                className="rounded-xl bg-paper p-4 text-[0.85rem] leading-[1.6] text-ink-800 ring-1 ring-line"
              >
                {oauthError}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------------------ 3. portal password */}
        {step === 2 ? (
          <div className="mt-7 flex flex-col gap-5">
            {/* Same pairing as the other two steps. The explanation lost its
                sky-50 callout box in the move: beside a SceneCard, which carries
                its own ring, two ringed boxes side by side read as competing
                panels, and the four-point list further down this step is already
                doing the work a callout would. */}
            <div className="grid items-center gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <p className="text-[1.05rem] font-semibold leading-[1.45] text-ink-900">
                  Google does not get it into your portal.
                </p>
                <p className="text-[0.9rem] leading-[1.6] text-body">
                  That is where posted grades and course files live. Classistant checks it
                  overnight, while you are asleep and cannot approve anything, so it needs to
                  be able to sign in on its own.
                </p>
              </div>

              {/* Moved here from the connect step, which resolves the concern
                  docs/design/13 raises about itself: the sealed envelope is a
                  simplification of the Google grant and very nearly literal
                  about the portal password. This is the step it is accurate on,
                  and the step it argues for. */}
              <SceneCard>
                <SealedPasswordScene school={school} />
              </SceneCard>
            </div>

            <Field label="Portal username or student number" htmlFor="portalUser" error={errors.portalUser}>
              <TextInput
                id="portalUser"
                name="portalUser"
                value={portalUser}
                onChange={(e) => setPortalUser(e.target.value)}
                placeholder={localPart || "yourname"}
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

        {/* ------------------------------------ 4. what it can touch */}
        {step === 3 ? (
          <div className="mt-7 flex flex-col gap-5">
            <p className="text-[0.95rem] leading-[1.6] text-body">
              Google asked for everything at once, because that is the only way it asks. Here
              is the whole list. Switch off anything you would rather Classistant left alone.
            </p>

            <ul className="flex flex-col gap-2.5">
              {ACCESS_ITEMS.map((item) => (
                <li key={item.key}>
                  <AccessToggle
                    item={item}
                    on={access[item.key]}
                    onChange={() =>
                      setAccess((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                    }
                  />
                </li>
              ))}
            </ul>

            {/*
              The honest footnote, and it has to stay.

              A switch that looks like it revokes something at Google would be a
              claim this product cannot keep: the grant is one token covering the
              whole set, and narrowing it for real means sending a student back
              through consent with a shorter list. What these do is bind
              Classistant, which is worth something and is not the same thing.
            */}
            <p className="text-[0.82rem] leading-[1.6] text-body-soft">
              These tell Classistant what to leave alone. To take the permissions back from
              Google itself, remove Classistant in your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-brand-600 hover:underline"
              >
                Google account
              </a>
              , which ends its access entirely.
            </p>

            <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-body-soft">
                Your account
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
                        {nickname || identity?.name || localPart}
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
                  {!nickname ? (
                    <p className="mt-1.5 text-[0.76rem] text-body-soft">
                      Taken from your address. Change it to whatever you want to be called.
                    </p>
                  ) : null}
                </div>

                <div>
                  <dt className="text-[0.8rem] text-body-soft">School email</dt>
                  <dd className="mt-0.5 font-mono text-[0.92rem] text-ink-900">
                    {identity?.email ?? schoolEmail}
                  </dd>
                </div>

                <div>
                  <dt className="text-[0.8rem] text-body-soft">Texts go to</dt>
                  <dd className="mt-0.5 font-mono text-[0.92rem] text-ink-900">
                    {verifiedPhone ?? formatPhone(phone)}
                  </dd>
                </div>
              </dl>
            </div>

            <Choice
              name="acceptTerms"
              checked={acceptTerms}
              onChange={() => setAcceptTerms((v) => !v)}
              title={CONSENT_COPY.terms.title}
              body={CONSENT_COPY.terms.body}
            />
            {errors.acceptTerms ? (
              <p role="alert" className="-mt-3 text-[0.8rem] font-medium text-ink-800">
                {errors.acceptTerms}
              </p>
            ) : null}

            {/* The consent for ongoing texts, sitting with the other two rather
                than back on the number step. This is the screen its error
                message appears on, and a required control a student cannot
                reach from the error is worse than no control at all. */}
            <Choice
              name="consentSms"
              checked={consentSms}
              onChange={() => setConsentSms((v) => !v)}
              title={CONSENT_COPY.sms.title}
              body={CONSENT_COPY.sms.body}
            />
            {errors.consentSms ? (
              <p role="alert" className="-mt-3 text-[0.8rem] font-medium text-ink-800">
                {errors.consentSms}
              </p>
            ) : null}

            <Choice
              name="acceptMarketing"
              checked={acceptMarketing}
              onChange={() => setAcceptMarketing((v) => !v)}
              title={CONSENT_COPY.marketing.title}
              body={CONSENT_COPY.marketing.body}
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

        {/* Everything travels with the final submit. */}
        <HiddenState
          step={step}
          values={{
            nickname,
            portalUser,
            portalPassword,
            acceptTerms: acceptTerms ? "on" : "",
            acceptMarketing: acceptMarketing ? "on" : "",
            consentSms: consentSms ? "on" : "",
            // The access switches. Written out here rather than as checkbox
            // inputs on the step, because an unchecked checkbox submits nothing
            // and the server reads absence as off; mirroring them means the
            // value sent always matches the switch on screen.
            ...Object.fromEntries(
              ACCESS_ITEMS.map((item) => [
                `access.${item.key}`,
                access[item.key] ? "on" : "",
              ]),
            ),
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
            // Nothing to go back to on step 0, and nothing worth going back to
            // on step 1: the number is already verified and the account already
            // connected, so Back would only offer to redo settled work.
            disabled={step <= 1}
            className="rounded-lg px-3 py-2 text-[0.9rem] font-semibold text-body transition-colors hover:bg-sky-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-0"
          >
            Back
          </button>

          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={portalUser.trim().length < 2 || portalPassword.length < 6}
              className="rounded-xl bg-brand-600 px-6 py-3 text-[0.93rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft"
            >
              Continue
            </button>
          ) : null}

          {step === 3 ? (
            // Named for what it produces rather than for what it does. The
            // screen above it is the one where a student finds out the beta is
            // free, and "Send welcome gift" is the reward rather than the
            // paperwork. Same reasoning as the PHASES label.
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-8 py-4 text-[1rem] font-bold text-white shadow-[0_12px_28px_-12px_var(--color-brand-600)] transition-colors hover:bg-brand-700 disabled:opacity-70"
            >
              {submitting ? "Sending..." : "Send welcome gift"}
            </button>
          ) : null}
        </div>
      </form>

      {/*
        The invisible reCAPTCHA, mounted for the whole wizard rather than inside
        step 0.

        Firebase resolves this container by id when a code is sent, so it has to
        be in the DOM before the press. Rendering it only on step 0 would work
        until a student went back to it, at which point the element would be a
        new node and the verifier would still be holding the old one.

        Outside the <form> on purpose: it injects an iframe and a hidden input,
        and neither belongs in a form whose action writes a student's account.
      */}
      <div id={RECAPTCHA_ID} className="hidden" />
    </Shell>
  );
}

/**
 * One access switch.
 *
 * A real checkbox under a styled surface rather than a div with a click
 * handler: it has to be reachable by keyboard and announced as a checkbox, and
 * the cheapest way to get both is to use the element that already is one.
 */
function AccessToggle({
  item,
  on,
  onChange,
}: {
  item: (typeof ACCESS_ITEMS)[number];
  on: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-4 rounded-xl p-4 ring-1 transition-colors",
        on ? "bg-sky-50 ring-sky-200" : "bg-paper ring-line",
      )}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={onChange}
        // The value is mirrored by HiddenState, so this input is the control
        // and not the thing submitted. Naming it would send it twice.
        className="peer sr-only"
      />

      <span className="min-w-0 flex-1">
        <span className="block text-[0.92rem] font-semibold text-ink-900">{item.label}</span>
        <span className="mt-1 block text-[0.82rem] leading-[1.5] text-body-soft">
          {item.detail}
        </span>
      </span>

      {/* The switch. Focus ring is driven off the peer, because the input it
          belongs to is visually hidden and would otherwise show nothing. */}
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          "peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/30",
          on ? "bg-brand-600" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            on ? "left-[1.4rem]" : "left-0.5",
          )}
        />
      </span>
    </label>
  );
}

/**
 * Mirrors state into the form, skipping anything the current step renders as a
 * real input so a name is never submitted twice.
 */
function HiddenState({ step, values }: { step: number; values: Record<string, string> }) {
  const rendered: Record<number, string[]> = {
    // Steps 0 and 1 render nothing that travels with the final submit. The
    // number and the code are deliberately absent from the form entirely:
    // neither is submitted, they reach the server by being verified.
    2: ["portalUser", "portalPassword"],
    3: ["nickname", "acceptTerms", "consentSms", "acceptMarketing"],
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

function Shell({
  phase,
  school,
  children,
}: {
  /** Index into PHASES. Also the count of phases already finished. */
  phase: number;
  school?: School;
  children: React.ReactNode;
}) {
  return (
    // One column. The 17rem rail that used to sit on the left held a logo and a
    // school name, and once the numbered steps came out of it there was not
    // enough left to justify a quarter of the viewport. Both survivors moved
    // into the card's own top row, so the form gets the full width.
    <div className="mx-auto w-full max-w-[58rem] rounded-[1.4rem] bg-white p-6 shadow-soft ring-1 ring-line sm:p-9">
      {/* The wordmark used to sit here. It said where you were, which the
          student already knows, and said nothing about whether to keep going.
          Only the arrow navigates: making the whole row a link would mean the
          line of encouragement is also the way out of the flow. */}
      <div className="mb-7 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            aria-label="Back to the home page"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-body-soft ring-1 ring-line transition-colors hover:bg-sky-50 hover:text-ink-900"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M9.75 3.5 5.25 8l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <span className="truncate font-display text-[1.05rem] font-extrabold tracking-[-0.01em] text-ink-900">
            You&rsquo;re almost done!
          </span>
        </div>

        {school ? (
          <span className="hidden truncate text-[0.85rem] font-semibold text-body-soft sm:block">
            {school.name}
          </span>
        ) : null}
      </div>

      <Progress phase={phase} />
      {children}
    </div>
  );
}

/**
 * Three milestones and a bar, in place of the numbered rail.
 *
 * The fill is phases *finished*, so picking a school is worth a third before
 * the sign-in screen is even drawn. That is the honest reading and it is also
 * the encouraging one: nobody arrives at the second screen having earned zero.
 *
 * It follows that the last phase shows two thirds while you are working through
 * it, and only the finished screen would be full.
 */
function Progress({ phase }: { phase: number }) {
  // Fill to the middle of the phase you are in, not to the start of it. The
  // labels are spread across the full width, so a bar that stopped at the start
  // of "Log in" landed short of the word and read as not having got there yet.
  // Half a phase in puts the end of the bar under the label it belongs to, and
  // the flow feels quicker for it. It also never claims 100% before the last
  // screen is done, which fill-the-whole-current-phase would.
  const pct = ((phase + 0.5) / PHASES.length) * 100;

  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between gap-3">
        {PHASES.map((label, i) => (
          <span
            key={label}
            className={cn(
              "text-[0.68rem] uppercase tracking-[0.12em] transition-colors",
              // The current phase has to be the loudest thing here. Finished
              // phases were brand green, and green beat black: on the sign-in
              // screen the eye landed on "Pick your school" and the page read
              // as if that were where you still were. Done recedes to grey now
              // and the bar carries the progress; only the current label is
              // dark, and it is the only bold one.
              //
              // Competing utilities live in the branches only, never split
              // between a base string and a branch: Tailwind resolves those by
              // emission order, not by writing order.
              i < phase
                ? "font-semibold text-body-soft"
                : i === phase
                  ? "font-bold text-ink-900"
                  : "font-semibold text-body-soft/55",
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={phase}
        aria-valuemin={0}
        aria-valuemax={PHASES.length}
        aria-label={`Step ${phase + 1} of ${PHASES.length}: ${PHASES[phase]}`}
      >
        {/* max() keeps a visible nub at the start rather than an empty track,
            without overstating how far along a fresh arrival actually is. */}
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `max(${pct}%, 0.4rem)` }}
        />
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
