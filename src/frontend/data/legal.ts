/**
 * Single source of truth for the details that appear in both legal documents.
 *
 * TODO(founders): replace the placeholders before launch and have a Canadian
 * privacy lawyer review both documents. The text in app/privacy and app/terms is
 * a complete, specific draft written against how the product actually works, but
 * it has not been reviewed by counsel.
 */
export const LEGAL = {
  /** Registered legal entity. Placeholder until incorporation is done. */
  entity: "Classistant Technologies Inc.",
  operatingName: "Classistant",
  /** TODO(founders): registered office address. */
  address: "Toronto, Ontario, Canada",
  jurisdiction: "the Province of Ontario",
  contactEmail: "hello@classistant.ca",
  privacyEmail: "privacy@classistant.ca",
  /** Under PIPEDA an organisation must name someone accountable. */
  privacyOfficer: "privacy@classistant.ca",
  lastUpdated: "22 August 2026",
} as const;

export const SUBPROCESSORS = [
  {
    name: "Google Cloud Platform and Firestore",
    purpose: "Hosting, the agent runtime, and the encrypted credential store",
    data: "Account details, course data, encrypted portal credentials",
    region: "Canada (northamerica-northeast1)",
  },
  {
    name: "Google Workspace APIs",
    purpose: "Reading your school mail, calendar, and Drive under the access you granted",
    data: "Course email, calendar events, syllabus files",
    region: "Determined by your school's Google tenancy",
  },
  {
    name: "Twilio",
    purpose: "Sending and receiving your text messages",
    data: "Your mobile number and the contents of messages exchanged with the agent",
    region: "United States",
  },
  {
    name: "Call-E",
    purpose: "Placing the voice calls you opted into",
    data: "Your mobile number and the deadline being called about",
    region: "United States",
  },
  {
    name: "Cloudflare",
    purpose: "Running the isolated browser that signs in to your school portal",
    data: "Portal session traffic, transiently",
    region: "Global edge network",
  },
] as const;
