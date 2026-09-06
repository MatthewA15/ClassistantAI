"use client";

import { useActionState, useState } from "react";

import { saveProfile } from "@/app/dashboard/actions";
import { SaveState, buttonClass } from "@/components/dashboard/ui";
import { Field, TextInput } from "@/components/onboarding/fields";

/**
 * The name, which is the only piece of a student's identity that is theirs to
 * set.
 *
 * Google never told us their name: the grant requests no `profile` scope, so
 * the address is all that comes back. Onboarding asks for it outright and
 * requires it (#36), so for anyone who signed up after that this is an edit
 * rather than a rescue.
 *
 * `name` is nullable because accounts that predate the requirement have none.
 * It is NOT defaulted to the local part of the address here or by the caller:
 * that fallback used to render `jokafor3` as a filled-in value, which a student
 * would then save as though they had chosen it.
 *
 * A read-only display that opens into a field on request, rather than a text
 * input sitting permanently on the page. Everything else in this card is a fact
 * that cannot be edited, so an always-open input beside them reads as though
 * the others should be editable too and are broken.
 */
export function ProfileForm({ name }: { name: string | null }) {
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
          {/* An account from before the name was required has none. Saying so
              is better than a blank line, and the button beside it is the fix. */}
          <p className="mt-1 break-words text-[0.95rem] font-semibold text-ink-900">
            {name ?? <span className="font-normal text-body-soft">Not set yet</span>}
          </p>
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
        htmlFor="profile-name"
        error={state?.errors?.name}
        hint="Used at the top of your texts, and when Classy greets you."
      >
        <TextInput
          autoFocus
          id="profile-name"
          name="name"
          defaultValue={name ?? ""}
          maxLength={40}
          autoComplete="given-name"
          invalid={Boolean(state?.errors?.name)}
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
