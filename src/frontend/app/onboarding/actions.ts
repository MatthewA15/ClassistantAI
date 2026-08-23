"use server";

import { headers } from "next/headers";

import { consentWording } from "@/data/consent";
import { findSchoolByEmail, getSchool } from "@/data/schools";
import { FieldValue } from "@/lib/firebaseAdmin";
import { buildAuthUrl, randomState } from "@/lib/googleOAuth";
import { getSession, setPendingOAuth } from "@/lib/onboardingSession";
import {
  markOnboardingComplete,
  savePortalCredentials,
  upsertUser,
} from "@/lib/users";

/**
 * Onboarding server actions.
 *
 * These are live now. `connectGoogle` starts a real OAuth flow and
 * `completeOnboarding` writes to Firestore and Secret Manager. The pieces sit
 * in three places for a reason (docs/design/12-onboarding-persistence.md):
 *
 *   this file          validation, and the two writes onboarding owns
 *   /onboarding/callback  the return leg from Google
 *   connector on Cloud Run  the code exchange and the refresh token
 *
 * No OAuth secret is reachable from this process. See docs/design/07-backend-contract.md.
 */

export type ActionResult = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
};

export type Identity = {
  email: string;
  /** Derived from the address, not from Google. The connector requests no
   *  `profile` scope, so no real name is ever returned. */
  name: string;
};

const PHONE_RE = /^[2-9]\d{9}$/;

/**
 * Best-effort client IP for the consent record.
 *
 * App Hosting sits behind Google's load balancer, so the first entry in
 * X-Forwarded-For is the client and the rest are proxies. Spoofable by a
 * determined client, which is fine: this is corroborating evidence attached to
 * a consent, not an access control decision.
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return h.get("x-real-ip");
}

/**
 * Starts the Google sign-in.
 *
 * Returns a URL rather than calling redirect(). The wizard is a client
 * component and the student is mid-form; letting it navigate deliberately keeps
 * the "Opening your school sign-in..." state honest instead of yanking the page
 * out from under a pending action.
 *
 * The scope list, `hd` pinning and `state` all live in lib/googleOAuth.ts.
 */
export async function connectGoogle(
  _prev: (ActionResult & { redirectUrl?: string }) | null,
  formData: FormData,
): Promise<ActionResult & { redirectUrl?: string }> {
  const schoolId = String(formData.get("schoolId") ?? "");
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase()
    .replace(/@.*$/, "");

  const school = getSchool(schoolId);
  if (!school || school.status !== "live") {
    return { ok: false, message: "Pick a supported school first." };
  }

  if (!/^[a-z0-9._-]{2,}$/.test(username)) {
    return {
      ok: false,
      message: "That does not look like a school username.",
      errors: { username: `Enter the part before @${school.emailDomain}` },
    };
  }

  // The state is minted here and checked in /onboarding/callback. The school
  // rides along in the same signed cookie because the wizard's React state does
  // not survive the trip to accounts.google.com.
  const state = randomState();
  await setPendingOAuth({ state, schoolId, username });

  return {
    ok: true,
    message: "Opening your school sign-in...",
    redirectUrl: buildAuthUrl({
      emailDomain: school.emailDomain,
      username,
      state,
    }),
  };
}

/**
 * Final submit. Writes both onboarding collections.
 *
 *   users/{sub}        profile + consent evidence
 *   credentials/{sub}  portal username + a Secret Manager pointer
 *
 * Identity comes from the signed session cookie, never from the form. The form
 * is client-supplied and the whole point of the OAuth round trip is that the
 * email was proven; taking it from a hidden input would throw that away and let
 * anyone write a document under someone else's id.
 *
 * Still TODO(backend): the Twilio verification SMS and the first crawl enqueue.
 */
export async function completeOnboarding(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const errors: Record<string, string> = {};

  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      message: "Your sign-in expired. Connect with Google again to finish.",
    };
  }

  const school = getSchool(session.schoolId);
  if (!school || school.status !== "live") errors.schoolId = "Choose a supported school.";

  const email = session.email;
  if (school && !email.endsWith(`@${school.emailDomain}`)) {
    errors.email = `That is not an @${school.emailDomain} address.`;
  }

  // Optional: a different Google account for Drive, Calendar, and mail.
  const serviceEmail = String(formData.get("serviceEmail") ?? "").trim().toLowerCase();
  if (serviceEmail && !serviceEmail.includes("@")) {
    errors.serviceEmail = "Enter a full email address.";
  }

  const nickname = String(formData.get("nickname") ?? "").trim();
  if (nickname.length > 40) errors.nickname = "Keep it under 40 characters.";

  // Portal credentials. Google OAuth authorises mail, calendar, and Drive, but
  // it does not create a session on the school's LMS, and the agent has to sign
  // in there overnight while the student is asleep. That is what this is for.
  const portalUser = String(formData.get("portalUser") ?? "").trim();
  if (portalUser.length < 2) {
    errors.portalUser = "Enter the username you use on the school portal.";
  }

  // DELIBERATE, DO NOT REMOVE: the portal password is never logged, never
  // echoed into a response, and never included in an error message. It now goes
  // straight into Secret Manager via savePortalCredentials() below and nowhere
  // else -- in particular it is never written to Firestore, because a document
  // is readable by anything with datastore.user and a secret is not.
  //
  // It is stored reversibly, not hashed. The agent has to replay it into the
  // school portal overnight, so hashing is not an option here.
  const portalPassword = String(formData.get("portalPassword") ?? "");
  if (portalPassword.length < 6) {
    errors.portalPassword = "Enter your portal password.";
  }

  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "");
  if (!PHONE_RE.test(phone)) errors.phone = "Enter a 10 digit Canadian mobile number.";

  if (formData.get("acceptTerms") !== "on") {
    errors.acceptTerms = "You need to accept the terms to continue.";
  }
  if (formData.get("consentSms") !== "on") {
    errors.consentSms = "We cannot text you without your consent.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Some details still need fixing.", errors };
  }

  const now = FieldValue.serverTimestamp();
  const ip = await clientIp();
  const record = (key: Parameters<typeof consentWording>[0], granted: boolean) => ({
    granted,
    at: now,
    ip,
    wording: consentWording(key),
  });

  try {
    await upsertUser({
      id: session.userId,
      email,
      // Google never told us their name: the connector requests neither the
      // `profile` scope nor returns a name from /auth/callback. The nickname
      // they chose is the honest answer, and the address is the fallback rather
      // than inventing something. See docs/design/12 for what a real registrar
      // name would cost.
      name: nickname || email.split("@")[0],
      phoneNumber: `+1${phone}`,
      schoolId: school!.id,
      serviceEmail: serviceEmail || undefined,
      consent: {
        terms: record("terms", true),
        sms: record("sms", true),
        marketing: record("marketing", formData.get("acceptMarketing") === "on"),
      },
    });

    await savePortalCredentials({
      userId: session.userId,
      username: portalUser,
      password: portalPassword,
    });

    await markOnboardingComplete(session.userId);
  } catch (err) {
    // Never let the error text reach the student: a Firestore or Secret Manager
    // failure can echo back argument values, and one of the arguments here is a
    // portal password.
    console.error("completeOnboarding failed", {
      userId: session.userId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      message: "We could not save your setup. Try again in a moment.",
    };
  }

  return { ok: true, message: "You are set up." };
}

/**
 * Personal mailboxes. The waitlist asks for a SCHOOL address because the domain
 * is how we identify the campus and how we size demand for it; a personal
 * address tells us a person is interested in nothing in particular.
 */
const PERSONAL_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.ca",
  "outlook.com",
  "live.com",
  "live.ca",
  "yahoo.com",
  "yahoo.ca",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

/**
 * Records interest in a school Classistant does not support yet.
 *
 * Serves two callers, which is why the school is optional. Onboarding already
 * knows which school was picked and passes `schoolId`. The hero's "my school is
 * not here" button does not: nothing was picked, so the school is read out of
 * the address the student types.
 */
export async function joinWaitlist(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // A rough shape check, not RFC validation. The address is confirmed by us
  // actually reaching it, and over-strict client-side rules reject real ones.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return {
      ok: false,
      message: "Enter an email so we can reach you.",
      errors: { email: "That does not look like an email address." },
    };
  }

  const domain = email.split("@")[1];
  if (PERSONAL_MAIL.has(domain)) {
    return {
      ok: false,
      message: "Use your school address.",
      errors: { email: "Your school address, not a personal one. It tells us which campus." },
    };
  }

  const school = getSchool(String(formData.get("schoolId") ?? "")) ?? findSchoolByEmail(email);

  // Already supported. Sending them away to wait for something they can use
  // right now would be the worst possible outcome of this form.
  if (school?.status === "live") {
    return {
      ok: true,
      message: `${school.name} is already live. Pick it above and you can start now.`,
    };
  }

  // TODO(backend): append to the waitlist collection in Firestore, keyed by
  // domain so demand per campus is countable. Send the confirmation, then the
  // "it is ready" mail on launch. Both are transactional, not marketing.
  return {
    ok: true,
    message: school
      ? `You are on the list for ${school.name}. We will email you at ${email} the day it is ready.`
      : `You are on the list. We will email you at ${email} once we support ${domain}.`,
  };
}
