import type { School } from "@/data/schools";

/**
 * The verified school catalogue, and the input to `npm run seed:schools`.
 *
 * ## This file is not read at runtime
 *
 * Firestore's `schools` collection is the source of truth the app reads from
 * (lib/schools.ts). This array is what that collection is *seeded* from, which
 * is why it lives under scripts/ rather than data/: importing it from a page
 * would recreate the second, silently disagreeing copy that moving to Firestore
 * was meant to remove. Nothing outside the seeder may import it.
 *
 * Editing a school in the Firestore console is therefore a legitimate way to
 * change what students see, and issue #36 asked for exactly that. What it costs
 * is the review gate below, so an edit made in the console should be brought
 * back here in the same week, or the next seed run will quietly revert it.
 *
 * ## Rules for this list (see docs/design/05-schools-data.md)
 *
 * Classistant signs in with Google, so a school only works if its student
 * mailbox is a Google mailbox. A school being "on Google" for Drive or Meet is
 * not enough, the mail has to be Gmail.
 *
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
 *
 * ## `city` and `timeZone`
 *
 * Both were added for the agent (issue #36), which knew a `school_id` and
 * nothing else about where the student actually is. `timeZone` is the campus
 * zone, and it is the fallback a reminder is scheduled in when a student's own
 * `time_zone` is missing -- a wrong guess here wakes somebody up, so it is the
 * main campus and not a guess from the province where the two disagree.
 */
export const SEED_SCHOOLS: School[] = [
  // ---------------------------------------------------------------- live
  {
    id: "ualberta",
    name: "University of Alberta",
    short: "U of A",
    province: "AB",
    city: "Edmonton",
    timeZone: "America/Edmonton",
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
    city: "Oshawa",
    timeZone: "America/Toronto",
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
    city: "Toronto",
    timeZone: "America/Toronto",
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
    city: "Toronto",
    timeZone: "America/Toronto",
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
    city: "Thunder Bay",
    timeZone: "America/Toronto",
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
    city: "St. John's",
    // The half-hour zone, and the reason this field is not derived from
    // `province`. Newfoundland is UTC-3:30, so anything that rounded it to
    // Atlantic time would schedule every Memorial reminder half an hour out.
    timeZone: "America/St_Johns",
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
    city: "Calgary",
    timeZone: "America/Edmonton",
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
  { id: "kpu", name: "Kwantlen Polytechnic University", short: "KPU", province: "BC", city: "Surrey", timeZone: "America/Vancouver", emailDomain: "student.kpu.ca", status: "pending" },
  { id: "seneca", name: "Seneca Polytechnic", short: "Seneca", province: "ON", city: "Toronto", timeZone: "America/Toronto", emailDomain: "myseneca.ca", status: "pending" },
  { id: "sheridan", name: "Sheridan College", short: "Sheridan", province: "ON", city: "Oakville", timeZone: "America/Toronto", emailDomain: "sheridancollege.ca", status: "pending" },
  { id: "brock", name: "Brock University", short: "Brock", province: "ON", city: "St. Catharines", timeZone: "America/Toronto", emailDomain: "brocku.ca", status: "pending" },
  { id: "trent", name: "Trent University", short: "Trent", province: "ON", city: "Peterborough", timeZone: "America/Toronto", emailDomain: "trentu.ca", status: "pending" },
  { id: "nipissing", name: "Nipissing University", short: "Nipissing", province: "ON", city: "North Bay", timeZone: "America/Toronto", emailDomain: "nipissingu.ca", status: "pending" },
  { id: "viu", name: "Vancouver Island University", short: "VIU", province: "BC", city: "Nanaimo", timeZone: "America/Vancouver", emailDomain: "viu.ca", status: "pending" },
  { id: "tru", name: "Thompson Rivers University", short: "TRU", province: "BC", city: "Kamloops", timeZone: "America/Vancouver", emailDomain: "mytru.ca", status: "pending" },
  { id: "smu", name: "Saint Mary's University", short: "Saint Mary's", province: "NS", city: "Halifax", timeZone: "America/Halifax", emailDomain: "smu.ca", status: "pending" },
  { id: "cbu", name: "Cape Breton University", short: "CBU", province: "NS", city: "Sydney", timeZone: "America/Halifax", emailDomain: "cbu.ca", status: "pending" },
];
