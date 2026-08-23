"use server";

import { findSchoolByEmail, getSchool } from "@/data/schools";

/**
 * Onboarding server actions.
 *
 * FRONTEND ONLY. Nothing here persists anything, calls any provider, or writes
 * any log. Each action validates its input and returns the shape the UI
 * expects, so the backend team can fill in the marked bodies without the client
 * changing at all. See docs/design/07-backend-contract.md.
 */

export type ActionResult = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
};

export type Identity = {
  email: string;
  name: string;
  /** True while Google is stubbed, so the UI can say the name is placeholder. */
  simulated: boolean;
};

const PHONE_RE = /^[2-9]\d{9}$/;

/**
 * Scopes the agent needs.
 *
 * NOT exported. A "use server" module may only export async functions, and
 * exporting this array makes every request to the route throw
 * `A "use server" file can only export async functions, found object` at
 * runtime while still building cleanly. If another module needs these, move
 * them to a plain file rather than exporting from here.
 */
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;

/**
 * Builds the Google authorisation URL that lands the student on their own
 * school's sign-in page.
 *
 * How the hand-off actually works, since it drove the UI design:
 *  - `hd` pins the consent screen to the school's Workspace domain, so a
 *    personal gmail cannot be connected by accident. This is the important one.
 *  - `login_hint` carries the full address. When a school federates Google to
 *    its own IdP (which the Canadian schools we support do), supplying a full
 *    address lets Google skip its own account chooser and redirect straight to
 *    the university login page. `hd` alone still stops at Google's screen
 *    first, so the UI asks for just the username and appends the domain.
 *
 * TODO(backend): append client_id, redirect_uri, state, code_challenge, and
 * `access_type=offline` + `prompt=consent` for a refresh token, then redirect().
 */
export async function buildGoogleAuthUrl(schoolId: string, username: string) {
  const school = getSchool(schoolId);
  if (!school || school.status !== "live") return null;

  const params = new URLSearchParams({
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    hd: school.emailDomain,
    include_granted_scopes: "true",
  });
  if (username) params.set("login_hint", `${username}@${school.emailDomain}`);

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Stands in for the OAuth round trip and the userinfo call that follows it.
 *
 * TODO(backend): replace with the real redirect. The callback exchanges the
 * code, reads `email` and `name` from the ID token, and creates the Firestore
 * user document.
 */
export async function connectGoogle(
  _prev: (ActionResult & { identity?: Identity }) | null,
  formData: FormData,
): Promise<ActionResult & { identity?: Identity }> {
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

  return {
    ok: true,
    message: "Connected.",
    identity: {
      email: `${username}@${school.emailDomain}`,
      // Real Google returns the registrar's name here. Until it is wired up
      // this is placeholder text and the UI says so rather than pretending.
      name: "Alex Mercer",
      simulated: true,
    },
  };
}

/**
 * Final submit.
 *
 * TODO(backend): write the profile to Firestore, store the refresh token, send
 * the Twilio verification SMS, and enqueue the first crawl on Cloud Run.
 *
 * Store `acceptTerms` and `consentSms` with a timestamp, the IP, and the exact
 * wording shown. They are CASL consent records and A2P registration evidence,
 * not UI state, so a bare boolean is not enough.
 */
export async function completeOnboarding(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const errors: Record<string, string> = {};

  const school = getSchool(String(formData.get("schoolId") ?? ""));
  if (!school || school.status !== "live") errors.schoolId = "Choose a supported school.";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    errors.email = "We did not get an address from Google.";
  } else if (school && !email.endsWith(`@${school.emailDomain}`)) {
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

  // DELIBERATE, DO NOT REMOVE: read, length-checked, and dropped. The portal
  // password is never logged, never echoed into a response, and never included
  // in an error message. When the backend lands it should go straight from here
  // into the encrypted credential store and nowhere else.
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
