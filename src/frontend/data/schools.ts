/**
 * Canadian institutions whose STUDENT email runs on Google Workspace for Education.
 *
 * Classistant signs in with Google, so a school only works if its student
 * mailbox is a Google mailbox. A school being "on Google" for Drive or Meet is
 * not enough, the mail has to be Gmail.
 *
 * Rules for this file (see docs/design/05-schools-data.md):
 *  - Nothing goes in as `live` without a `source` URL from the school's own IT
 *    pages. We put institution names on a public marketing page, so a wrong
 *    entry is a factual error about a real organisation, not a cosmetic bug.
 *  - Platforms migrate. Re-verify every entry each August before term starts.
 *
 * Three statuses, and the difference between the last two matters:
 *  - `live`    We run there today. Only these appear in marketing copy.
 *  - `soon`    Student mail CONFIRMED on Google, with a source, but we have not
 *              launched there. Launch scope, not a research gap.
 *  - `pending` Not checked yet. We do not know what their mail runs on.
 *
 * `soon` and `pending` both read as unsupported to a student, so onboarding
 * treats them the same. They are kept apart here because collapsing them would
 * throw away confirmed verification work and quietly invite someone to redo it.
 *
 * Known NOT eligible (student mail is Microsoft 365), keep out of the list:
 *  - Carleton University (cmail is M365)
 *  - University of Winnipeg (self-hosted webmail)
 *
 * Note on Office 365: several schools hand out Office desktop apps while student
 * MAIL still lives on Google. Availability of Office is not disqualifying, the
 * mailbox platform is what matters.
 */

export type SchoolStatus = "live" | "soon" | "pending";

/**
 * A school's own brand colours, used to re-skin the whole site when a student
 * picks their school in the hero.
 *
 * Same rule as the rest of this file: every value is taken from the school's
 * published brand guidelines, with `source` recorded. Students know their own
 * school's colours on sight, so a guessed hex is immediately visible as wrong.
 * `accent` is only a second official colour where the school publishes one.
 */
export type SchoolBrand = {
  primary: string;
  /** Only set where the school publishes a real second colour. Otherwise the
   *  theme derives a tint of `primary`, rather than inventing one. */
  accent?: string;
  source: string;
};

export type School = {
  id: string;
  name: string;
  /** Short form used in tight UI, falls back to `name`. */
  short?: string;
  province: string;
  /** Student mail domain, shown so a student can confirm it is their address. */
  emailDomain: string;
  status: SchoolStatus;
  /** Where the platform was confirmed. Required for `live`. */
  source?: string;
  /** Caveats worth surfacing during onboarding. */
  note?: string;
  /** Required on `live` schools, which are the ones offered as themes. */
  brand?: SchoolBrand;
  /**
   * Path to the school's real logo, once we have written permission to use it.
   * University logos are trademarks: they cannot be redrawn, approximated, or
   * shipped without a licence from the institution. Until one exists, the UI
   * falls back to a brand-coloured monogram, which claims nothing.
   */
  logo?: string;
};

/** "Memorial University of Newfoundland" -> "MUN". Used for the crest fallback. */
export function schoolInitials(name: string): string {
  const skip = new Set(["of", "the", "and"]);
  return name
    .split(/\s+/)
    .filter((w) => !skip.has(w.toLowerCase()))
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

export const SCHOOLS: School[] = [
  // ---------------------------------------------------------------- live
  {
    id: "ualberta",
    name: "University of Alberta",
    short: "U of A",
    province: "AB",
    emailDomain: "ualberta.ca",
    status: "live",
    source:
      "https://www.ualberta.ca/en/information-services-and-technology/initiatives/google-workspace-changes/index.html",
    // "Sign in with your CCID" was the first sentence here. The field it sits
    // under now says "Student email" and prints @ualberta.ca beside the input,
    // which answers what to type without the jargon. What is left is the part
    // the form cannot show you.
    note: "Google access ends when your account moves to alumni status.",
    brand: {
      primary: "#007C41",
      accent: "#FFDB05",
      source: "https://www.ualberta.ca/toolkit/visual-identity/our-colours",
    },
  },
  {
    id: "ontariotech",
    name: "Ontario Tech University",
    short: "Ontario Tech",
    province: "ON",
    emailDomain: "ontariotechu.net",
    status: "live",
    // Student Google Workspace is branded "OntarioTechU.Net" on their own IT
    // pages, which is why searching for "Ontario Tech Microsoft 365" is
    // misleading: that page is real, but it covers faculty and staff mail.
    // Students are on Gmail.
    source:
      "https://itsc.ontariotechu.ca/ontariotechunet-google-apps-for-education/google-email-gmail.php",
    note: "Undergraduates, graduates, and alumni all get an OntarioTechU.Net account.",
    brand: {
      primary: "#003C71",
      accent: "#E75D2A",
      source:
        "https://brand.ontariotechu.ca/guidelines/brand-standards/colours-design-graphics-and-fonts/colours.php",
    },
  },

  // ------------------------------------------------- confirmed, not launched
  // Student mail verified on Google against the sources below. These are out of
  // launch scope, not unverified. Flip to `live` when we open the campus.
  {
    id: "tmu",
    name: "Toronto Metropolitan University",
    short: "TMU",
    province: "ON",
    emailDomain: "torontomu.ca",
    status: "soon",
    source: "https://www.torontomu.ca/google/",
    brand: { primary: "#004C9B", source: "https://www.torontomu.ca/brand/brand-toolkit/colours/" },
  },
  {
    id: "yorku",
    name: "York University",
    short: "York",
    province: "ON",
    emailDomain: "my.yorku.ca",
    status: "soon",
    source: "https://google.info.yorku.ca/",
    note: "Undergraduate accounts only. Graduate mail at yorku.ca is on a different platform.",
    brand: { primary: "#E31837", source: "https://www.yorku.ca/brand/using-the-brand/colours/" },
  },
  {
    id: "lakehead",
    name: "Lakehead University",
    short: "Lakehead",
    province: "ON",
    emailDomain: "lakeheadu.ca",
    status: "soon",
    source:
      "https://www.lakeheadu.ca/faculty-and-staff/departments/services/helpdesk/email",
    brand: {
      primary: "#004271",
      accent: "#FFC20E",
      source:
        "https://www.lakeheadu.ca/faculty-and-staff/departments/services/marketing-communications/marketing/brand-guidelines",
    },
  },
  {
    id: "mun",
    name: "Memorial University of Newfoundland",
    short: "Memorial",
    province: "NL",
    emailDomain: "mun.ca",
    status: "soon",
    source:
      "https://www.mun.ca/cio/it-services/communication-and-collaboration/google-workspace/",
    note: "Access requires registration within the last three semesters.",
    brand: {
      primary: "#862633",
      source:
        "https://www.mun.ca/marcomm/media/production/memorial/administrative/marcomm/files/BrandStandards_August_2017_FA.pdf",
    },
  },
  {
    id: "mtroyal",
    name: "Mount Royal University",
    short: "Mount Royal",
    province: "AB",
    emailDomain: "mtroyal.ca",
    status: "soon",
    source:
      "https://www.mtroyal.ca/CampusServices/CampusResources/InformationTechnology/EmailCalendaring/index.htm",
    brand: {
      primary: "#003352",
      accent: "#007FB5",
      source: "https://www.mtroyal.ca/AboutMountRoyal/Brand/index.htm",
    },
  },

  // ------------------------------------------------------------- not checked
  // Mail platform unknown. Searchable during onboarding so a student gets a real
  // answer, never shown as supported. Confirm against the school's own IT mail
  // page before promoting, and add the `source` in the same commit.
  { id: "kpu", name: "Kwantlen Polytechnic University", short: "KPU", province: "BC", emailDomain: "student.kpu.ca", status: "pending" },
  { id: "seneca", name: "Seneca Polytechnic", short: "Seneca", province: "ON", emailDomain: "myseneca.ca", status: "pending" },
  { id: "sheridan", name: "Sheridan College", short: "Sheridan", province: "ON", emailDomain: "sheridancollege.ca", status: "pending" },
  { id: "brock", name: "Brock University", short: "Brock", province: "ON", emailDomain: "brocku.ca", status: "pending" },
  { id: "trent", name: "Trent University", short: "Trent", province: "ON", emailDomain: "trentu.ca", status: "pending" },
  { id: "nipissing", name: "Nipissing University", short: "Nipissing", province: "ON", emailDomain: "nipissingu.ca", status: "pending" },
  { id: "viu", name: "Vancouver Island University", short: "VIU", province: "BC", emailDomain: "viu.ca", status: "pending" },
  { id: "tru", name: "Thompson Rivers University", short: "TRU", province: "BC", emailDomain: "mytru.ca", status: "pending" },
  { id: "smu", name: "Saint Mary's University", short: "Saint Mary's", province: "NS", emailDomain: "smu.ca", status: "pending" },
  { id: "cbu", name: "Cape Breton University", short: "CBU", province: "NS", emailDomain: "cbu.ca", status: "pending" },
];

export const LIVE_SCHOOLS = SCHOOLS.filter((s) => s.status === "live");

export function searchSchools(query: string): School[] {
  const q = query.trim().toLowerCase();
  if (!q) return SCHOOLS;
  return SCHOOLS.filter((s) =>
    [s.name, s.short ?? "", s.emailDomain, s.province].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}

export function getSchool(id: string): School | undefined {
  return SCHOOLS.find((s) => s.id === id);
}

/**
 * Matches a typed address to a school by its mail domain, so the waitlist can
 * answer with the school's name instead of echoing a raw domain back.
 *
 * Matches across a subdomain in both directions on purpose. York's student mail
 * is `my.yorku.ca`, but a York student typing their address from memory writes
 * `@yorku.ca` about as often. A `pending` school matches too: we do not know
 * what their mail runs on, but we do know what the school is called.
 */
export function findSchoolByEmail(email: string): School | undefined {
  const domain = email.trim().toLowerCase().split("@")[1]?.replace(/[>\s]+$/, "");
  // A bare TLD would `endsWith`-match half the list, so require a real domain.
  if (!domain || !domain.includes(".")) return undefined;

  return SCHOOLS.find(
    (s) =>
      domain === s.emailDomain ||
      domain.endsWith(`.${s.emailDomain}`) ||
      s.emailDomain.endsWith(`.${domain}`),
  );
}
