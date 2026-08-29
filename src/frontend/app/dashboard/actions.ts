"use server";

import { revalidatePath } from "next/cache";

import { ACCESS_ITEMS } from "@/data/access";
import {
  defaultNotifications,
  writeNotifications,
  type NotificationPrefs,
} from "@/data/notifications";
import { getSession } from "@/lib/authSession";
import { savePortalCredentials } from "@/lib/portalCredentials";
import {
  getAccount,
  updateAccessSwitches,
  updateDisplayName,
  updateMarketingPreference,
  updateNotificationPrefs,
} from "@/lib/users";

/**
 * Everything the signed-in area can change about an account.
 *
 * ## The rule every action in this file follows
 *
 * The uid comes from the session cookie and from nowhere else. Not from a
 * hidden input, not from a query parameter, not from a field the form was
 * rendered with. A server action is a public HTTP endpoint with a generated
 * name: anything the browser sends is a claim, and a uid read from a claim is
 * an invitation to write to somebody else's document by editing one field in
 * devtools. `getSession()` returns a uid that Firebase verified, on a cookie
 * this process set and can revoke, and that is the only id any of these use.
 *
 * The same reasoning is why `saveProfile` writes a nickname and nothing else.
 * The address was proven by the Google exchange and the number by an SMS round
 * trip; a text input that overwrote either would hand a student an identity
 * nobody checked, which is the whole thing those two round trips exist to
 * prevent. Changing an address means reconnecting at Google. Changing a number
 * means verifying a new one.
 *
 * ## Why these do not return the new state
 *
 * Each one ends in `revalidatePath`, so the server component that owns the data
 * re-renders and the form receives fresh props. An action that returned the
 * saved values would leave two copies of the truth on the page, and the stale
 * one always wins an argument with a student who reloads.
 */

export type SaveResult = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
};

/** What every action does first. Returns the uid or the refusal to show. */
async function requireUid(): Promise<
  { uid: string; error?: undefined } | { uid?: undefined; error: SaveResult }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: {
        ok: false,
        message: "Your session expired. Sign in again to save this.",
      },
    };
  }
  return { uid: session.uid };
}

/** The three pages that read this data. Revalidated together because the
 *  overview summarises what the other two own, so a change on either has to
 *  reach it or the summary quietly lies. */
function revalidateAccount(): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/access");
  revalidatePath("/dashboard/settings");
}

/**
 * The access switches.
 *
 * Absence means off, exactly as it does in onboarding: an unchecked checkbox
 * submits nothing at all, so a key missing from the form is one the student
 * turned off. Reading it the other way round would silently re-enable whatever
 * they had just switched off, which is the worst possible direction for this
 * particular bug to run in.
 *
 * The form is built from ACCESS_ITEMS, so the set written is always the
 * complete one and `updateAccessSwitches` can safely replace the whole map.
 */
export async function saveAccess(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const { uid, error } = await requireUid();
  if (error) return error;

  const access = Object.fromEntries(
    ACCESS_ITEMS.map((item) => [item.field, formData.get(`access.${item.key}`) === "on"]),
  );

  try {
    await updateAccessSwitches(uid, access);
  } catch (err) {
    console.error("saveAccess failed", {
      uid,
      error: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, message: "We could not save that. Try again in a moment." };
  }

  revalidateAccount();
  return { ok: true, message: "Saved." };
}

/** `"off"` -> null, `"22"` -> 22, anything else -> the fallback. The select
 *  offers exactly these, so a value outside them is not a student mistake and
 *  there is nothing useful to tell them about it. */
function readHour(raw: FormDataEntryValue | null, fallback: number | null): number | null {
  if (raw === null) return fallback;
  const value = String(raw);
  if (value === "off") return null;
  const hour = Number.parseInt(value, 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

/**
 * Quiet hours, calls, the digest, and the marketing opt-out.
 *
 * Marketing rides along with the rest rather than sitting in its own form,
 * because to a student it is one question ("how much do you contact me") asked
 * four ways. It is stored separately from `consent.marketing`, which is dated
 * evidence of what was agreed at signup and must not be editable: a CASL record
 * that can be rewritten afterwards is not a record. See
 * updateMarketingPreference.
 */
export async function saveNotifications(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const { uid, error } = await requireUid();
  if (error) return error;

  const base = defaultNotifications();
  const prefs: NotificationPrefs = {
    quietStart: readHour(formData.get("quietStart"), base.quietStart),
    quietEnd: readHour(formData.get("quietEnd"), base.quietEnd),
    calls: formData.get("calls") === "on",
    digestHour: readHour(formData.get("digestHour"), null),
    // Read from the browser rather than picked from a list. See the note on
    // `timezone` in data/notifications.ts for why it is not inferred from the
    // phone number.
    timezone: String(formData.get("timezone") ?? "").trim() || base.timezone,
  };

  /*
   * Quiet hours are switched off by one control and stored as two fields, so
   * the pair has to be normalised here. A student who sets a start and clears
   * the end has expressed "no window", and storing a half-window would leave
   * `inQuietHours` reading one null and returning false anyway -- true by
   * accident rather than by decision, and the kind of thing that stops being
   * true when somebody rewrites that function.
   */
  if (prefs.quietStart === null || prefs.quietEnd === null) {
    prefs.quietStart = null;
    prefs.quietEnd = null;
  }

  try {
    await updateNotificationPrefs(uid, writeNotifications(prefs));
    await updateMarketingPreference(uid, formData.get("marketing") === "on");
  } catch (err) {
    console.error("saveNotifications failed", {
      uid,
      error: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, message: "We could not save that. Try again in a moment." };
  }

  revalidateAccount();
  return { ok: true, message: "Saved." };
}

/** The nickname, and only the nickname. See the rule at the top of this file
 *  for why the address and the number are not here. */
export async function saveProfile(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const { uid, error } = await requireUid();
  if (error) return error;

  const name = String(formData.get("nickname") ?? "").trim();
  if (name.length < 1) {
    return {
      ok: false,
      message: "Give it something to call you.",
      errors: { nickname: "This cannot be empty." },
    };
  }
  if (name.length > 40) {
    return {
      ok: false,
      message: "That name is too long.",
      errors: { nickname: "Keep it under 40 characters." },
    };
  }

  try {
    await updateDisplayName(uid, name);
  } catch (err) {
    console.error("saveProfile failed", {
      uid,
      error: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, message: "We could not save that. Try again in a moment." };
  }

  revalidateAccount();
  return { ok: true, message: "Saved." };
}

/**
 * Replaces the school portal login.
 *
 * DELIBERATE, DO NOT REMOVE: the password is never logged, never echoed into a
 * response, and never included in an error message. It goes straight into
 * savePortalCredentials() and nowhere else, and it exists in this process only
 * long enough to be encrypted.
 *
 * There is no read path and there cannot be one, which is why this form asks
 * for the password again rather than showing the current one for editing. This
 * app holds `cryptoKeyEncrypter` on `classistant-password-key` and decrypt on
 * nothing, so a "change your password" screen that pre-filled the existing
 * value is not a feature that was left out. See lib/portalCredentials.ts.
 *
 * Both halves are required together on purpose. `savePortalCredentials` writes
 * the sealed password first and the username second, so submitting a password
 * without a username would leave the two describing different logins with
 * nothing on the document saying so.
 */
export async function savePortalLogin(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const { uid, error } = await requireUid();
  if (error) return error;

  const errors: Record<string, string> = {};

  const username = String(formData.get("portalUser") ?? "").trim();
  if (username.length < 2) {
    errors.portalUser = "Enter the username you use on the school portal.";
  }

  const password = String(formData.get("portalPassword") ?? "");
  if (password.length < 6) {
    errors.portalPassword = "Enter your portal password.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Some details still need fixing.", errors };
  }

  try {
    await savePortalCredentials({ userId: uid, username, password });
  } catch (err) {
    // The error text never reaches the student: a Firestore or KMS failure can
    // echo back argument values, and one of the arguments here is a password.
    console.error("savePortalLogin failed", {
      uid,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      message: "We could not save that. Try again in a moment.",
    };
  }

  revalidateAccount();
  return { ok: true, message: "Saved. The next overnight run will use it." };
}

/**
 * The address and school a reconnect should use.
 *
 * The Google grant is started by `connectGoogle` in the onboarding actions,
 * which is imported directly by the access page's client component rather than
 * re-wrapped here. It takes a school and an address, and the dashboard has both
 * on the account document, so this hands them over.
 *
 * It exists because those two values are on a server-read record and the button
 * that needs them is in a client component. Passing them down as props would
 * work equally well and is what the page does for everything else; this is here
 * for the reconnect flow specifically, where the address may have been changed
 * at Google since the page rendered and the freshest read is the one worth
 * sending.
 */
export async function grantContext(): Promise<{
  schoolId: string | null;
  email: string | null;
}> {
  const { uid, error } = await requireUid();
  if (error) return { schoolId: null, email: null };

  const account = await getAccount(uid);
  return { schoolId: account?.schoolId ?? null, email: account?.email ?? null };
}
