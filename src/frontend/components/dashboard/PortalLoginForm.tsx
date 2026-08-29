"use client";

import { useActionState, useState } from "react";

import { savePortalLogin } from "@/app/dashboard/actions";
import { SaveState, buttonClass } from "@/components/dashboard/ui";
import { Field, TextInput } from "@/components/onboarding/fields";

/**
 * Replacing the school portal login.
 *
 * ## Why this asks for the password instead of showing it
 *
 * Because it cannot show it. This app holds encrypt on
 * `classistant-password-key` and decrypt on nothing at all, so there is no
 * version of this component that could pre-fill the current value, and there is
 * no server action that could be written to help it. That is the security
 * property, not a gap in the feature: the agent is the only principal in the
 * project that can open a school password, and the frontend deliberately
 * cannot. See lib/portalCredentials.ts and docs/design/19.
 *
 * So the screen has to earn its keep by explaining rather than displaying, and
 * the reason a student is here is almost always the same one: they changed
 * their password at the school and the overnight run started failing.
 *
 * The form collapses to a button by default. A password field sitting open on
 * a settings page invites a browser to offer to fill it with a credential from
 * an unrelated site, and invites a student to retype something they did not
 * need to change.
 */
export function PortalLoginForm({
  username,
  hasPassword,
}: {
  username: string | null;
  /** Whether a sealed credential exists. Not whether it still works: nothing on
   *  this side of the KMS boundary can know that, and only the agent's next run
   *  finds out. */
  hasPassword: boolean;
}) {
  const [state, action, saving] = useActionState(savePortalLogin, null);
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const errors = state?.errors ?? {};

  // Closes itself once the save lands, so the fields are not left sitting open
  // with a password in them after the work is done.
  const settled = state?.ok === true;

  if (!open || settled) {
    return (
      <div className="flex flex-col gap-4">
        <dl>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 py-3.5 pt-0">
            <div className="min-w-0">
              <dt className="text-[0.8rem] text-body-soft">Portal username</dt>
              <dd className="mt-1 break-words font-mono text-[0.9rem] text-ink-900">
                {username ?? "Not set"}
              </dd>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-t border-line-soft py-3.5 pb-0">
            <div className="min-w-0">
              <dt className="text-[0.8rem] text-body-soft">Portal password</dt>
              <dd className="mt-1 text-[0.95rem] font-semibold text-ink-900">
                {hasPassword ? "Stored and sealed" : "Not set"}
              </dd>
              <p className="mt-1.5 text-[0.78rem] leading-[1.55] text-body-soft">
                {hasPassword
                  ? "Encrypted under a key Classistant can lock and cannot open. Nobody here can read it back, which is also why it cannot be shown to you."
                  : "Without it, Classistant cannot sign in to your portal overnight."}
              </p>
            </div>
          </div>
        </dl>

        {settled ? <SaveState state={state} /> : null}

        <div>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setShow(false);
            }}
            className={buttonClass("secondary", "sm")}
          >
            {hasPassword ? "Replace it" : "Add your portal login"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <p className="rounded-xl bg-sky-50 p-4 text-[0.85rem] leading-[1.6] text-ink-800 ring-1 ring-sky-200">
        Both fields together. The password is sealed the moment it reaches us and replaces
        whatever is there now, so a username with no password behind it is not a state we can
        leave you in.
      </p>

      <Field
        label="Portal username or student number"
        htmlFor="portal-user"
        error={errors.portalUser}
        hint="Some schools use a username here, others your student number."
      >
        <TextInput
          id="portal-user"
          name="portalUser"
          defaultValue={username ?? ""}
          autoComplete="off"
          invalid={Boolean(errors.portalUser)}
        />
      </Field>

      <Field label="New portal password" htmlFor="portal-password" error={errors.portalPassword}>
        <div className="relative">
          <TextInput
            id="portal-password"
            name="portalPassword"
            type={show ? "text" : "password"}
            // new-password, so a browser does not offer a saved credential from
            // an unrelated site into a field that gets sealed and never read
            // back.
            autoComplete="new-password"
            className="pr-20"
            invalid={Boolean(errors.portalPassword)}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[0.78rem] font-semibold text-brand-600 hover:bg-sky-100"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <SaveState state={state} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={buttonClass("primary")}>
          {saving ? "Sealing..." : "Save portal login"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClass("quiet", "sm")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
