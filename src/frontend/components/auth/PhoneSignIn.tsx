"use client";

import { useEffect, useState } from "react";
import { Field, TextInput, formatPhone } from "@/components/onboarding/fields";
import {
  confirmCode,
  phoneErrorMessage,
  sendVerificationCode,
  signOutClient,
  warmPhoneAuth,
  type PendingVerification,
} from "@/lib/firebaseClient";

/**
 * Signing back in: a number, a six digit code, a session cookie.
 *
 * The same two screens the onboarding wizard opens with, and deliberately a
 * separate component rather than a piece lifted out of it.
 *
 * The parts worth sharing already are. `sendVerificationCode`, `confirmCode`,
 * `phoneErrorMessage` and the `/api/auth/session` exchange all live outside
 * both callers, so nothing about how a number is proven is written twice. What
 * is written twice is two form fields and a button, and pulling those out would
 * mean threading the wizard's step index, its verified-number banner, its
 * school state and its "not your number?" affordance through a shared
 * component's props. That component would be a switch statement over which of
 * its two callers is rendering it, which is the shape a bad abstraction takes.
 *
 * The difference in the flows is also real rather than cosmetic. The wizard is
 * establishing an identity for the first time and everything after it is a
 * step; this is a returning student who already has an account and wants to be
 * somewhere else within two taps. It ends in a redirect, and the wizard's
 * version cannot, because for it the number is step one of three.
 *
 * Two callers now: /signin, and /portal-login, which Classy texts to a student
 * when it needs their school login. The second one arrives with the number
 * already known (it is the number the text went to) and wants the student back
 * on its own page afterwards, so both of those are props. Neither is trusted
 * for anything: the prefill is convenience and the code still has to arrive,
 * and the destination is a path the caller wrote, not one from the URL.
 */

/** Where the invisible reCAPTCHA mounts. A different id from the wizard's, so
 *  that if the two were ever on one page the module-level verifier in
 *  lib/firebaseClient.ts could not be handed a container belonging to the other
 *  one. They are never on one page today; this costs nothing and removes the
 *  question. */
const RECAPTCHA_ID = "classistant-signin-recaptcha";

/** Shape check, so the button can gate before spending a round trip. Firebase
 *  does the real validation. Same expression as the wizard's, and it stays a
 *  copy for the reason in lib/firebaseClient.ts: sharing it would mean a
 *  non-function export from a "use server" module. */
const PHONE_OK = /^[2-9]\d{9}$/;

type SessionResponse = {
  phone?: string;
  connected?: boolean;
  schoolId?: string | null;
  email?: string | null;
  onboardingComplete?: boolean;
  error?: string;
};

export function PhoneSignIn({
  initialPhone = "",
  next,
}: {
  /** A number to start the field with, run through `formatPhone` on the way in
   *  so anything from a raw E.164 to garbage becomes at most ten digits. A
   *  prefill only: it proves nothing, and the code still has to be delivered to
   *  it and typed back. */
  initialPhone?: string;
  /** Where a finished account lands once signed in. Defaults to the dashboard.
   *  An account that never finished onboarding goes back to onboarding whatever
   *  this says, because there is nothing for it to do anywhere else yet. Must
   *  be a path this code wrote, never one read from the request. */
  next?: string;
} = {}) {
  const [phone, setPhone] = useState(() => formatPhone(initialPhone));
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Starts the 40 kB Auth SDK fetch while the student is still reading the
  // screen, and starts reCAPTCHA Enterprise watching the visit, which is part
  // of how Google scores the send. Same reasoning as the wizard's.
  useEffect(warmPhoneAuth, []);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      setPending(await sendVerificationCode(phone, RECAPTCHA_ID));
      setCode("");
    } catch (err) {
      setError(phoneErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await confirmCode(pending, code);

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = (await res.json().catch(() => ({}))) as SessionResponse;

      if (!res.ok) {
        // The client-side Firebase user has to go too. Leaving it signed in
        // while the server refused to mint a cookie produces a browser that
        // believes it is authenticated and a server that does not.
        await signOutClient();
        setError(data.error ?? "We could not verify that number.");
        return;
      }

      /*
       * A full navigation rather than router.push, and the busy state is never
       * cleared on this path.
       *
       * The session cookie was just set by the response to that POST. The app
       * router will happily serve /dashboard out of its client-side cache from
       * before the cookie existed, which renders the signed-out redirect. A
       * document load is the only thing that guarantees the server sees the new
       * cookie, and holding "Signing you in..." until the page changes is
       * honest about the fact that something is still happening.
       */
      window.location.assign(
        data.onboardingComplete
          ? (next ?? "/dashboard")
          : `/onboarding${data.schoolId ? `?school=${encodeURIComponent(data.schoolId)}` : ""}`,
      );
    } catch (err) {
      setError(phoneErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {pending ? (
        <>
          <Field
            label="Six digit code"
            htmlFor="signin-code"
            hint={`Sent to ${formatPhone(phone)}. It expires in a few minutes.`}
          >
            <TextInput
              autoFocus
              id="signin-code"
              type="text"
              inputMode="numeric"
              // The one autocomplete token phones act on: iOS and Android offer
              // the code straight from the notification.
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (code.length === 6 && !busy) void verify();
                }
              }}
              placeholder="123456"
              className="font-mono tracking-[0.4em]"
              invalid={Boolean(error)}
            />
          </Field>

          {error ? (
            <p role="alert" className="-mt-2 text-[0.82rem] font-medium text-ink-800">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={verify}
            disabled={busy || code.length !== 6}
            className="rounded-xl bg-brand-600 px-6 py-3.5 text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft"
          >
            {busy ? "Signing you in..." : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setPending(null);
              setCode("");
              setError(null);
            }}
            className="self-center rounded-lg px-2.5 py-1.5 text-[0.85rem] font-semibold text-brand-600 transition-colors hover:bg-sky-100"
          >
            Use a different number
          </button>
        </>
      ) : (
        <>
          <Field
            label="Mobile number"
            htmlFor="signin-phone"
            error={error ?? undefined}
            hint="The number you set up with. Canadian mobile numbers only."
          >
            <TextInput
              autoFocus
              id="signin-phone"
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
              invalid={Boolean(error)}
            />
          </Field>

          <button
            type="button"
            onClick={sendCode}
            disabled={busy || !PHONE_OK.test(phone.replace(/\D/g, ""))}
            className="rounded-xl bg-brand-600 px-6 py-3.5 text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-body-soft"
          >
            {busy ? "Sending..." : "Text me a code"}
          </button>

          <p className="text-[0.8rem] leading-[1.6] text-body-soft">
            One text, right now, with a six digit code. Message and data rates may apply.
          </p>
        </>
      )}

      {/*
        The invisible reCAPTCHA container.

        Mounted for the whole component rather than inside the number branch:
        Firebase resolves it by id at send time, and a student who backs out of
        the code screen and returns would otherwise leave the verifier holding a
        node that is no longer in the document.

        Deliberately unstyled, and that is load-bearing in both directions.
        `hidden` stops grecaptcha minting a token at all, and it surfaces as
        `auth/invalid-app-credential`, which reads exactly like a project
        misconfiguration. Clipping it to zero size makes it read positions off a
        node with no box and throw from inside recaptcha__en.js. At
        `size: "invisible"` an empty div already collapses to nothing.
      */}
      <div id={RECAPTCHA_ID} />
    </div>
  );
}
