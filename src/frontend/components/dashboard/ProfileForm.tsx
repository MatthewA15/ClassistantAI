"use client";

import { useActionState, useState } from "react";

import { saveProfile } from "@/app/dashboard/actions";
import { SaveState, buttonClass } from "@/components/dashboard/ui";
import { Field, TextInput } from "@/components/onboarding/fields";

/**
 * The nickname, which is the only piece of a student's identity that is theirs
 * to set.
 *
 * Google never told us their name. The connector requests no `profile` scope,
 * so the address is all that comes back from the grant, and onboarding falls
 * back to the part before the @ when a student skips the field. That fallback
 * is why this control matters more than it looks: a good number of accounts are
 * addressed as `jokafor3` until somebody changes it here.
 *
 * A read-only display that opens into a field on request, rather than a text
 * input sitting permanently on the page. Everything else in this card is a fact
 * that cannot be edited, so an always-open input beside them reads as though
 * the others should be editable too and are broken.
 */
export function ProfileForm({ name }: { name: string }) {
  const [state, action, saving] = useActionState(saveProfile, null);
  const [editing, setEditing] = useState(false);

  // Close on a successful save. `state.ok` survives until the next submit, so
  // this is derived rather than pushed into state by an effect.
  const open = editing && state?.ok !== true;

  if (!open) {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-[0.8rem] text-body-soft">What it calls you</p>
          <p className="mt-1 break-words text-[0.95rem] font-semibold text-ink-900">{name}</p>
          <SaveState state={state?.ok ? state : null} />
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={buttonClass("secondary", "sm")}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label="What it calls you"
        htmlFor="profile-nickname"
        error={state?.errors?.nickname}
        hint="Used at the top of your texts. Nothing else reads it."
      >
        <TextInput
          autoFocus
          id="profile-nickname"
          name="nickname"
          defaultValue={name}
          maxLength={40}
          autoComplete="given-name"
          invalid={Boolean(state?.errors?.nickname)}
        />
      </Field>

      {state && !state.ok && !state.errors ? <SaveState state={state} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={buttonClass("primary", "sm")}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className={buttonClass("quiet", "sm")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
