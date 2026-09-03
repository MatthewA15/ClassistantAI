"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { savePortalLogin } from "@/app/dashboard/actions";
import { LogoMark } from "@/components/brand/LogoMark";
import { SaveState, buttonClass } from "@/components/dashboard/ui";
import { SceneCard, SealedPasswordScene } from "@/components/onboarding/connectScenes";
import { PortalLoginFields } from "@/components/portal/PortalLoginFields";
import { CLASSY_SMS_HREF } from "@/data/classy";
import type { School } from "@/data/schools";

/**
 * The page Classy texts when it needs the school portal login.
 *
 * ## Why this is a page of its own
 *
 * This form used to be step three of onboarding, between the Google grant and
 * the access switches. It was the biggest ask in the flow and it landed at the
 * worst moment: a second password, for a site the student met four minutes
 * ago, before anything had been done for them. Issue #54 moved it out. Now the
 * student finishes signup, gets their first texts, and only meets this screen
 * when Classy actually has a reason to go into the portal and says so.
 *
 * The heading is the one the onboarding step carried, because it was already
 * the right one: it names the benefit rather than the credential.
 *
 * ## What it stores, and where
 *
 * The same thing the onboarding step stored, in the same place, through the
 * same action the dashboard's replace form uses: `savePortalLogin` seals the
 * password under `classistant-password-key` into
 * `users/{uid}/credentials/school_password` and records the username on the
 * user document. This app can lock that credential and cannot open it; the
 * browser agent is the only principal that can (docs/ENCRYPTION_CONTRACT.md
 * §1). Nothing about the storage changed when the form moved, and the
 * reasoning for not making it ephemeral is in docs/design/23.
 *
 * ## Open by default
 *
 * The dashboard's form collapses to a button, because there a password field
 * sitting open invites a browser to fill it from an unrelated site and a
 * student to retype something they did not need to change. Here the student
 * tapped a link whose entire purpose is this form. Making them press "Add your
 * portal login" first would be asking them to confirm the thing they just did.
 *
 * ## It ends, rather than staying open
 *
 * The done state replaces the form. The student came from Messages and should
 * go back there, so the filled button is the way back to Classy and the
 * dashboard is the secondary door. Reloading the page shows the form again
 * with "already sealed" noted above it, which is the honest state: there is a
 * password stored, and typing here replaces it.
 */
export function PortalLoginHandoff({
  school,
  username,
  hasPassword,
  phone,
}: {
  school: School | null;
  /** The stored portal username, prefilled so a replace is one field. */
  username: string | null;
  /** Whether a sealed credential exists. Not whether it still works: nothing
   *  on this side of the KMS boundary can know that. */
  hasPassword: boolean;
  /** The signed-in number, shown so a student can tell whose account this is
   *  before typing a password into it. */
  phone: string;
}) {
  const [state, action, saving] = useActionState(savePortalLogin, null);
  const [show, setShow] = useState(false);
  const errors = state?.errors ?? {};

  if (state?.ok) {
    return <Sealed school={school} />;
  }

  const portalName = school ? `${school.short ?? school.name} portal` : "school portal";

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="Classistant home" className="inline-flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="font-display text-[1.05rem] font-extrabold tracking-[-0.03em] text-ink-900">
            Classistant
          </span>
        </Link>
        <span
          aria-label={`Signed in as ${phone}`}
          className="font-mono text-[0.8rem] text-body-soft"
        >
          {phone}
        </span>
      </div>

      <h1 className="text-[1.6rem] font-extrabold leading-tight text-ink-900">
        Let it work while you sleep
      </h1>

      {/* Reason on the left, demonstration on the right, at the size every
          scene in onboarding renders at. The sealed envelope is literal about
          this form: typed here, sealed, replayed against the school's own
          login page overnight. It was drawn for this ask and it moved here with
          it. */}
      <div className="grid items-center gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-[1.05rem] font-semibold leading-[1.45] text-ink-900">
            Google does not get it into your {portalName}.
          </p>
          <p className="text-[0.9rem] leading-[1.6] text-body">
            That is where posted grades and course files live. Classistant checks it overnight,
            while you are asleep and cannot approve anything, so it needs to be able to sign in
            on its own.
          </p>
        </div>

        {school ? (
          <SceneCard>
            <SealedPasswordScene school={school} />
          </SceneCard>
        ) : null}
      </div>

      <PortalLoginFields
        defaultUsername={username ?? ""}
        errors={errors}
        show={show}
        onToggleShow={() => setShow((v) => !v)}
      />

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

      {hasPassword ? (
        <p className="text-[0.82rem] leading-[1.6] text-body-soft">
          There is already a sealed password on your account. Saving here replaces it, which is
          the thing to do if you changed it at school and Classy stopped getting in.
        </p>
      ) : null}

      <SaveState state={state} />

      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
        <button type="submit" disabled={saving} className={buttonClass("primary")}>
          {saving ? "Sealing..." : "Save portal login"}
        </button>
        <Link href="/dashboard/access" className={buttonClass("quiet", "sm")}>
          Not now
        </Link>
      </div>
    </form>
  );
}

/**
 * The done state. Same shape as the wizard's DoneScreen so it reads as the
 * same product finishing the same kind of thing, with one filled button: back
 * to the conversation this came from.
 */
function Sealed({ school }: { school: School | null }) {
  return (
    <div className="text-center">
      <span className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-sky-100">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-sky-300/50 motion-safe:animate-[pulse-ring_2.6s_ease-out_infinite]"
        />
        <LogoMark size={42} animated />
      </span>

      <h1 className="mt-7 text-[1.75rem] font-extrabold leading-tight text-ink-900">Sealed</h1>
      <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-[1.7] text-body">
        Classistant will use it the next time it checks {school?.name ?? "your school"}. You can
        close this and go back to your texts.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a href={CLASSY_SMS_HREF} className={buttonClass("primary")}>
          Back to Classy
        </a>
        <Link href="/dashboard/access" className={buttonClass("secondary")}>
          Open my dashboard
        </Link>
      </div>
    </div>
  );
}
