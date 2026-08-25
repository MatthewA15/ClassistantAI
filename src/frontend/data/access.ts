/**
 * What Classistant may touch, as the student's own switches.
 *
 * This is the list behind the final onboarding step. It exists because the
 * Google consent screen is all-or-nothing: a student either grants the whole
 * scope set or cannot use the product. That is a fair trade only if they get to
 * narrow it afterwards, which is what these are for.
 *
 * ## The rule, inherited from `PERMISSIONS` in connectScenes.tsx
 *
 * Every label must describe something `lib/googleOAuth.ts` actually requests,
 * and must not suggest anything it does not. **The word "send" must never
 * appear**: `gmail.compose` writes drafts and is incapable of sending, and the
 * product decision behind that is that the agent proposes mail and a human
 * sends it. Copy that overstates a scope is what a Google app review fails on,
 * and it is untrue to the student besides.
 *
 * `scopes` on each row is not read by any code. It is here so that the next
 * person to change `GOOGLE_SCOPES` can see which switch they have just made a
 * liar, which a label alone does not tell them.
 *
 * ## What a switch actually does, and does not do
 *
 * Turning one off stores `false` and Classistant does not use that access. It
 * does **not** revoke anything at Google: the grant is one token covering the
 * whole set, and narrowing it for real would mean sending the student back
 * through consent with a smaller scope list. So this is enforcement on our
 * side, and the copy has to stay honest about that rather than implying Google
 * has been told. The switches are stored on the user document and every reader
 * of that document is expected to respect them.
 */

export type AccessKey =
  | "gmailRead"
  | "gmailDrafts"
  | "calendar"
  | "driveRead"
  | "docs";

export type AccessItem = {
  key: AccessKey;
  label: string;
  /** One line on what it is for. The student is deciding, so the reason it
   *  exists matters more than the mechanism. */
  detail: string;
  /** Firestore field name. Snake case, matching every other field on the
   *  document rather than the camel case this file uses in TypeScript. */
  field: string;
  /** Cross-reference only. See the note above. */
  scopes: string[];
};

export const ACCESS_ITEMS: AccessItem[] = [
  {
    key: "gmailRead",
    label: "Read your school email",
    detail: "How it finds deadlines, room changes, and anything a professor sends late.",
    field: "gmail_read",
    scopes: ["gmail.readonly"],
  },
  {
    key: "gmailDrafts",
    // Drafts, never sending. See the rule above before touching this line.
    label: "Draft replies for you",
    detail: "It writes the reply and leaves it in your drafts. You send it, or you do not.",
    field: "gmail_drafts",
    scopes: ["gmail.compose"],
  },
  {
    key: "calendar",
    label: "Put due dates in your calendar",
    detail: "Deadlines it finds become events, so they show up where you already look.",
    field: "calendar",
    scopes: ["calendar"],
  },
  {
    key: "driveRead",
    label: "Read your course files",
    detail: "Syllabi and posted PDFs, so it knows what the term actually requires.",
    field: "drive_read",
    scopes: ["drive.readonly", "drive.metadata.readonly"],
  },
  {
    key: "docs",
    label: "Start outlines in Docs",
    detail: "A skeleton document for an assignment, for you to take over.",
    field: "docs",
    scopes: ["documents", "drive.file"],
  },
];

/** Everything on, which is what the student just granted at Google. The
 *  switches start where the grant is, so an untouched form stores the truth. */
export function defaultAccess(): Record<AccessKey, boolean> {
  return ACCESS_ITEMS.reduce(
    (acc, item) => ({ ...acc, [item.key]: true }),
    {} as Record<AccessKey, boolean>,
  );
}
