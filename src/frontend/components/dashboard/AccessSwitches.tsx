"use client";

import { useActionState, useState } from "react";

import { saveAccess } from "@/app/dashboard/actions";
import { SaveState, Switch, buttonClass } from "@/components/dashboard/ui";
import { ACCESS_ITEMS, type AccessKey } from "@/data/access";

/**
 * The access switches, after onboarding.
 *
 * Onboarding asks this question once, on the screen right after the Google
 * consent page, because Google's grant is all or nothing and the only place a
 * real choice can be offered is afterwards. This is the same list, and it is
 * the reason that promise is worth anything: a choice a student can make once
 * and never revisit is a checkbox, not a control.
 *
 * ## Real checkboxes with names, not mirrored hidden inputs
 *
 * The wizard writes its switches into hidden fields because several of them are
 * rendered on a step the final submit does not include, so it has to mirror
 * state that is not on screen. Nothing here is off screen: the form is the
 * list. So the checkboxes carry the names directly, and an unchecked one
 * submits nothing at all, which `saveAccess` reads as off. That is the same
 * absence-means-off contract, arrived at with one fewer moving part.
 */
export function AccessSwitches({ access }: { access: Record<AccessKey, boolean> }) {
  const [state, action, saving] = useActionState(saveAccess, null);
  const [local, setLocal] = useState(access);

  /*
   * Compared against the prop on every render, not against a snapshot taken at
   * mount.
   *
   * The action calls revalidatePath, so a successful save re-renders the server
   * component above and this receives new props matching what was just written.
   * Comparing to the prop makes the button switch itself back off at exactly
   * that moment, with no effect to write and no second copy of the truth. A
   * snapshot in state would have to be resynchronised by hand, and the failure
   * of forgetting is a Save button that stays lit over saved work.
   */
  const dirty = ACCESS_ITEMS.some((item) => local[item.key] !== access[item.key]);
  const onCount = ACCESS_ITEMS.filter((item) => local[item.key]).length;

  return (
    <form action={action} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2.5">
        {ACCESS_ITEMS.map((item) => (
          <li key={item.key}>
            <Switch
              name={`access.${item.key}`}
              checked={local[item.key]}
              onChange={() => setLocal((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
              title={item.label}
              detail={item.detail}
            />
          </li>
        ))}
      </ul>

      {/*
        The honest footnote, carried over from onboarding, and it has to stay.

        A switch that looked like it revoked something at Google would be a
        claim this product cannot keep: the grant is one token covering the
        whole scope set, and narrowing it for real means sending a student back
        through consent with a shorter list. What these do is bind Classistant,
        which is worth something and is not the same thing.
      */}
      <p className="text-[0.82rem] leading-[1.6] text-body-soft">
        These tell Classistant what to leave alone. To take the permissions back from Google
        itself, remove Classistant in your{" "}
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

      {/* All five off is not an error, so it is not styled as one. It is a
          state a student may genuinely want, and the only thing wrong with it
          is that nothing will happen, which is worth saying plainly once rather
          than blocking the save over. */}
      {onCount === 0 ? (
        <p className="rounded-xl bg-paper p-4 text-[0.84rem] leading-[1.6] text-ink-800 ring-1 ring-line">
          With all five off, Classistant will not read anything in your Google account. It will
          still check your school portal, which uses the password you gave it rather than
          Google.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
        <button type="submit" disabled={!dirty || saving} className={buttonClass("primary")}>
          {saving ? "Saving..." : "Save changes"}
        </button>
        <SaveState state={dirty ? null : state} />
      </div>
    </form>
  );
}
