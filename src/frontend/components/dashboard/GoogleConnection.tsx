"use client";

import { useState } from "react";

import { connectGoogle } from "@/app/onboarding/actions";
import { buttonClass } from "@/components/dashboard/ui";

/**
 * Reconnecting the Google grant.
 *
 * The action is `connectGoogle` from the onboarding actions, imported rather
 * than reimplemented. It mints the OAuth state, stores it in the signed pending
 * cookie alongside the school and the claimed address, and hands back the URL
 * to send the tab to. Every one of those steps has to happen identically here
 * or the callback route rejects the return leg, so there is exactly one place
 * that does them.
 *
 * ## When a student needs this
 *
 * Three cases, and the copy has to cover all three without pretending to know
 * which one applies:
 *
 *  - They removed Classistant at myaccount.google.com and want it back.
 *  - The refresh token stopped working, which Google does on password changes
 *    and on some admin policy changes at the school.
 *  - A new scope was added and the old grant does not cover it.
 *
 * None of them are visible from this process: the refresh token lives sealed in
 * Firestore under a key only the connector can open, so the frontend cannot
 * test whether it still works. The honest version is to offer the reconnect
 * without claiming anything about the current state, which is what this does.
 */
export function ReconnectGoogle({
  schoolId,
  email,
  label = "Reconnect Google",
}: {
  schoolId: string | null;
  email: string | null;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!schoolId || !email) {
      setError("We do not have a school address on your account to reconnect.");
      return;
    }

    setBusy(true);
    setError(null);

    // Set once the tab is being handed over. Clearing `busy` on the way out
    // would flip the button back to its resting label for however long the
    // navigation takes, which on a slow connection is seconds of looking like
    // the press did nothing.
    let leaving = false;

    try {
      const grant = await connectGoogle(schoolId, email);
      if (!grant.ok || !grant.redirectUrl) {
        setError(grant.errors?.schoolEmail ?? grant.message);
        return;
      }
      // A full navigation, not a router push: we are leaving the app for
      // accounts.google.com and will come back as a fresh page load.
      leaving = true;
      window.location.assign(grant.redirectUrl);
    } catch {
      setError("We could not reach Google. Try again in a moment.");
    } finally {
      if (!leaving) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2.5">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={buttonClass("secondary", "sm")}
      >
        <GoogleGlyph />
        {busy ? "Opening Google..." : label}
      </button>
      {error ? (
        <p role="alert" className="text-[0.82rem] font-medium text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
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
