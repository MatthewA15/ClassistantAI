"use server";

import { getSchool } from "@/data/schools";

/**
 * Onboarding server actions.
 *
 * FRONTEND ONLY. Nothing here persists anything, calls any provider, or writes
 * any log. Each action validates its input and returns the result shape the UI
 * expects, so the backend team can fill in the marked bodies without the client
 * changing at all.
 *
 * Deliberate rule, do not remove: the student's portal password must never be
 * logged, echoed back in a response, or included in an error message. It exists
 * inside `completeOnboarding` only long enough to be handed to the credential
 * store. See docs/design/07-backend-contract.md.
 */

export type ActionResult = {
  ok: boolean;
  message: string;
  /** Keyed by field name so the wizard can highlight the offending input. */
  errors?: Record<string, string>;
};

const PHONE_RE = /^[2-9]\d{9}$/;

/**
 * Step 2. Kicks off Google OAuth for the student's school Google account.
 *
 * TODO(backend): build the Google OAuth consent URL with the scopes the agent
 * needs (gmail.readonly, gmail.send, calendar.events, drive.readonly), pin
 * `hd` to the selected school's email domain so a personal gmail cannot be used,
 * then `redirect()` to it. The callback route exchanges the code and creates the
 * Firestore user document.
 */
export async function startGoogleSignIn(formData: FormData): Promise<ActionResult> {
  const schoolId = String(formData.get("schoolId") ?? "");
  const school = getSchool(schoolId);

  if (!school || school.status !== "live") {
    return { ok: false, message: "Pick a supported school before signing in." };
  }

  return {
    ok: true,
    message: `Google sign in is not wired up yet. When it is, this redirects to Google restricted to @${school.emailDomain} addresses.`,
  };
}

/**
 * Final step. Validates the whole onboarding payload.
 *
 * TODO(backend): on success, write the profile to Firestore, put the portal
 * credential in the encrypted credential store keyed by user id, send the Twilio
 * verification SMS, and enqueue the first portal crawl on Cloud Run.
 */
export async function completeOnboarding(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const errors: Record<string, string> = {};

  const schoolId = String(formData.get("schoolId") ?? "");
  const school = getSchool(schoolId);
  if (!school || school.status !== "live") {
    errors.schoolId = "Choose a supported school.";
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2) {
    errors.fullName = "Enter the name your school has on file.";
  }

  const schoolEmail = String(formData.get("schoolEmail") ?? "")
    .trim()
    .toLowerCase();
  if (!schoolEmail.includes("@")) {
    errors.schoolEmail = "Enter your school email address.";
  } else if (school && !schoolEmail.endsWith(`@${school.emailDomain}`)) {
    errors.schoolEmail = `Use your @${school.emailDomain} address, not a personal one.`;
  }

  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "");
  if (!PHONE_RE.test(phone)) {
    errors.phone = "Enter a 10 digit Canadian mobile number.";
  }

  const portalUser = String(formData.get("portalUser") ?? "").trim();
  if (portalUser.length < 2) {
    errors.portalUser = "Enter the username you use on the school portal.";
  }

  // Read but never inspected, never logged, never returned.
  const portalPassword = String(formData.get("portalPassword") ?? "");
  if (portalPassword.length < 6) {
    errors.portalPassword = "Enter your portal password.";
  }

  if (formData.get("consentSms") !== "on") {
    errors.consentSms = "We need your consent before we can text you.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Some details still need fixing.", errors };
  }

  return {
    ok: true,
    message:
      "Everything checks out. Once the backend is connected this is where your verification text goes out.",
  };
}

/** Records interest in a school Classistant does not support yet. */
export async function joinWaitlist(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const schoolId = String(formData.get("schoolId") ?? "");

  if (!email.includes("@") || email.length < 5) {
    return {
      ok: false,
      message: "Enter an email so we can reach you.",
      errors: { email: "That does not look like an email address." },
    };
  }

  const school = getSchool(schoolId);

  // TODO(backend): append to the waitlist collection in Firestore.
  return {
    ok: true,
    message: school
      ? `You are on the list for ${school.name}. We will email you the day it goes live.`
      : "You are on the list. We will email you when your school goes live.",
  };
}
