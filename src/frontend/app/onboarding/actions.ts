"use server";

import { headers } from "next/headers";

import { ACCESS_ITEMS } from "@/data/access";
import { consentWording } from "@/data/consent";
import { findSchoolByEmail, getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { FieldValue } from "@/lib/firebaseAdmin";
import { buildAuthUrl, randomState } from "@/lib/googleOAuth";
import { setPendingOAuth } from "@/lib/onboardingSession";
import { savePortalCredentials } from "@/lib/portalCredentials";
import { listSchools } from "@/lib/schools";
import { resolveTimeZone } from "@/lib/timeZone";
import { getUser, markOnboardingComplete, upsertUser } from "@/lib/users";

/**
 * Onboarding server actions.
 *
 * These are live now. `connectGoogle` starts the scope grant and
 * `completeOnboarding` writes the profile and seals the portal password. The
 * pieces sit in four places for a reason (docs/design/12-onboarding-persistence.md
 * and docs/design/15-firebase-auth.md):
 *
 *   /api/auth/session       Firebase Auth: who the student is
 *   this file               validation, and the two writes onboarding owns
 *   /onboarding/callback    the return leg from the scope grant
 *   connector on Cloud Run  the code exchange and the refresh token
 *
 * No OAuth secret is reachable from this process. See docs/design/07-backend-contract.md.
 */

export type ActionResult = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
};

/** What the grant proved about the student. The address and nothing else: the
 *  grant requests no `profile` scope, so Google returns no name, and the one
 *  this type used to carry was the local part of the address wearing a label
 *  that said otherwise. The student is asked for their name now. */
export type Identity = {
  email: string;
};

/*
 * PHONE_RE used to live here and is gone: the number is no longer submitted to
 * this file at all, it arrives on the verified session. The wizard keeps its own
 * shape check for the field.
 *
 * It could not have been exported for the wizard to share even if it were still
 * wanted. This is a "use server" module, so a non-function export throws at
 * runtime on every request while still building cleanly. See docs/design/07.
 */

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
 * Starts the access grant: the second leg, after the phone has been verified.
 *
 * This is straight Google OAuth, not Firebase Auth. Firebase's job ended at the
 * SMS; what this asks for is the Gmail, Drive, Docs and Calendar access the
 * overnight agent needs, and that requires an authorisation-code exchange with
 * a client secret, which the connector holds and Firebase has no part in. See
 * docs/design/15-firebase-auth.md.
 *
 * Returns a URL rather than calling redirect(). The wizard is a client
 * component mid-flow, and letting it navigate deliberately keeps the
 * "Opening your school sign-in..." state honest.
 */
export async function connectGoogle(
  schoolId: string,
  schoolEmail: string,
): Promise<ActionResult & { redirectUrl?: string }> {
  // Verifying a number first is what makes this leg safe to start: without it
  // anyone could drive a consent flow and get a refresh token stored.
  const session = await getSession();
  if (!session) {
    return { ok: false, message: "Verify your mobile number first." };
  }

  const school = getSchool(await listSchools(), schoolId);
  if (!school || school.status !== "live") {
    return { ok: false, message: "Pick a supported school first." };
  }

  const email = schoolEmail.trim().toLowerCase();

  // The domain check the diagram calls for, done here so a student is told
  // before being sent to Google rather than after coming back. It is checked
  // again in the callback against the address Google proves, because this one is
  // still only a claim typed into a form.
  if (!email.endsWith(`@${school.emailDomain}`)) {
    return {
      ok: false,
      message: `Use your ${school.name} address.`,
      errors: { schoolEmail: `That is not an @${school.emailDomain} address.` },
    };
  }

  // The state is minted here and checked in /onboarding/callback. The school and
  // the claimed address ride along in the same signed cookie, because the
  // wizard's React state does not survive the trip to accounts.google.com.
  const state = randomState();
  await setPendingOAuth({ state, schoolId: school.id, email });

  return {
    ok: true,
    message: "Opening your school sign-in...",
    redirectUrl: buildAuthUrl({
      emailDomain: school.emailDomain,
      loginHint: email,
      state,
    }),
  };
}

/**
 * Final submit. Writes the profile and the portal credential.
 *
 *   users/{uid}                              profile, consent evidence, username
 *   users/{uid}/credentials/school_password  the sealed password
 *
 * Identity comes from the session cookie and the user document, never from the
 * form. The form is client-supplied, and the whole point of the SMS round trip
 * and the Google exchange is that the number and the address were proven;
 * reading either from a hidden input would throw that away and let anyone write
 * a document under someone else's id.
 *
 * Still TODO(backend): the welcome gift itself, and the first crawl enqueue.
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
      message: "Your sign-in expired. Verify your number again to finish.",
    };
  }

  /*
   * Everything identifying comes off the document. It exists from the moment
   * the number was verified, but the school address on it only arrives with the
   * grant, so a student who never got through Google still has nothing to
   * finish with -- `googleConnected` is the check that says so, not the
   * presence of the document.
   */
  const profile = await getUser(session.uid);
  if (!profile || !profile.googleConnected || !profile.email) {
    return {
      ok: false,
      message: "Connect your school Google account before finishing.",
    };
  }

  const school = getSchool(await listSchools(), profile.schoolId ?? "");
  if (!school || school.status !== "live") errors.schoolId = "Choose a supported school.";

  const email = profile.email;
  if (school && !email.endsWith(`@${school.emailDomain}`)) {
    errors.email = `That is not an @${school.emailDomain} address.`;
  }

  /*
   * The name, and it is required now.
   *
   * It used to be an optional nickname that fell back to the local part of the
   * school address. That was the right call while nothing read it, and issue
   * #36 is the point at which something does: the agent greets the student by
   * this field, and the fallback produced "Hey jokafor3", which is worse than
   * no greeting at all. Google cannot supply it either -- the grant requests no
   * `profile` scope (docs/design/12) -- so the student is asked, once, on a
   * screen they are already on.
   */
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1) errors.name = "Tell us what to call you.";
  else if (name.length > 40) errors.name = "Keep it under 40 characters.";

  /*
   * The browser's IANA zone, submitted as a hidden field.
   *
   * The server cannot derive it: the request carries no timezone, and the two
   * things that correlate with one -- the IP and the phone number -- are wrong
   * for exactly the students most likely to care. See data/notifications.ts.
   *
   * Validated rather than trusted. This is a hidden input on a public endpoint,
   * so it is a claim like any other, and it is the field every future reminder
   * gets scheduled against. The school's own zone is the fallback, which is a
   * far better guess than a fixed default for a student at Memorial.
   */
  const timeZone = resolveTimeZone(formData.get("timeZone"), school?.timeZone);

  // Portal credentials. Google OAuth authorises mail, calendar, and Drive, but
  // it does not create a session on the school's LMS, and the agent has to sign
  // in there overnight while the student is asleep. That is what this is for.
  const portalUser = String(formData.get("portalUser") ?? "").trim();
  if (portalUser.length < 2) {
    errors.portalUser = "Enter the username you use on the school portal.";
  }

  // DELIBERATE, DO NOT REMOVE: the portal password is never logged, never
  // echoed into a response, and never included in an error message. It goes
  // straight into savePortalCredentials() below and nowhere else, and it exists
  // in this process only long enough to be encrypted.
  //
  // It does reach Firestore now, which the previous version of this comment
  // said it never would. What reaches Firestore is AES-256-GCM ciphertext under
  // a data key wrapped by `classistant-password-key`, which this app can lock
  // and cannot open -- so `datastore.user` on the document buys an attacker
  // nothing. See lib/portalCredentials.ts and docs/design/19.
  //
  // It is stored reversibly, not hashed. The agent has to replay it into the
  // school portal overnight, so hashing is not an option here.
  const portalPassword = String(formData.get("portalPassword") ?? "");
  if (portalPassword.length < 6) {
    errors.portalPassword = "Enter your portal password.";
  }

  /*
   * The number is NOT read from the form any more.
   *
   * It is on the session because Firebase delivered a code to it and the
   * student typed that code back. A form field would be a claim; this is the
   * one that was demonstrated, and the whole reason phone verification moved to
   * the front of the wizard was so that this field could stop being a claim.
   */
  const phone = session.phone;

  /*
   * The access switches. Absent means off: an unchecked checkbox sends nothing
   * at all, so anything not present in the form was switched off by the
   * student. Reading it the other way round would silently re-enable whatever
   * they had just turned off.
   */
  const access = Object.fromEntries(
    ACCESS_ITEMS.map((item) => [item.field, formData.get(`access.${item.key}`) === "on"]),
  );

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
      id: profile.userId,
      email,
      // What the student typed, with no fallback behind it. Google never told
      // us their name -- the grant requests no `profile` scope -- so this field
      // is only ever as good as the question that produced it, which is why the
      // question is now a required one. See the note at the validation above.
      name,
      // Already E.164, straight off the verified session. Do not prefix it
      // again; the old form field was ten bare digits and this is not.
      phoneNumber: phone,
      schoolId: school!.id,
      timeZone,
      consent: {
        terms: record("terms", true),
        sms: record("sms", true),
        marketing: record("marketing", formData.get("acceptMarketing") === "on"),
      },
      access,
    });

    await savePortalCredentials({
      userId: profile.userId,
      username: portalUser,
      password: portalPassword,
    });

    await markOnboardingComplete(profile.userId);
  } catch (err) {
    // Never let the error text reach the student: a Firestore or KMS failure
    // can echo back argument values, and one of the arguments here is a portal
    // password.
    console.error("completeOnboarding failed", {
      userId: profile.userId,
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

  const schools = await listSchools();
  const school =
    getSchool(schools, String(formData.get("schoolId") ?? "")) ?? findSchoolByEmail(schools, email);

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
