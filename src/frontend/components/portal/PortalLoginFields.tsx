"use client";

import { Field, TextInput } from "@/components/onboarding/fields";

/**
 * The two portal fields, shared by the dashboard's replace form and the
 * /portal-login hand-off.
 *
 * Extracted rather than written twice because they are genuinely one thing:
 * the same two names (`portalUser`, `portalPassword`) read by the same server
 * action, the same error keys, and the same show/hide toggle. What differs
 * between the two callers is everything around them (one collapses to a button
 * by default, the other opens ready to type, and they end differently), and
 * none of that is in here. Compare PhoneSignIn, which argues the opposite way
 * about its two fields: there the fields were the only thing in common and the
 * flows around them were the point.
 *
 * Uncontrolled inputs. The password never needs to be in React state: it goes
 * from the field to the form submit to `savePortalCredentials` and is sealed,
 * and holding it in state would only make a second copy to worry about.
 */
export function PortalLoginFields({
  defaultUsername,
  errors,
  show,
  onToggleShow,
  passwordLabel = "Portal password",
}: {
  defaultUsername: string;
  errors: Record<string, string>;
  show: boolean;
  onToggleShow: () => void;
  /** "New portal password" on the replace form, where there is an old one. */
  passwordLabel?: string;
}) {
  return (
    <>
      <Field
        label="Portal username or student number"
        htmlFor="portal-user"
        error={errors.portalUser}
        hint="Some schools use a username here, others your student number."
      >
        <TextInput
          id="portal-user"
          name="portalUser"
          defaultValue={defaultUsername}
          autoComplete="off"
          invalid={Boolean(errors.portalUser)}
        />
      </Field>

      <Field label={passwordLabel} htmlFor="portal-password" error={errors.portalPassword}>
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
            onClick={onToggleShow}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[0.78rem] font-semibold text-brand-600 hover:bg-sky-100"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </Field>
    </>
  );
}
