# 05. Schools data

Source: [`data/schools.ts`](../../src/frontend/data/schools.ts)

## The eligibility rule

Classistant onboards through Sign in with Google and its agent reads mail,
calendar, and Drive through Google connectors. So the rule is narrow:

> A school qualifies only if its **student mailbox is a Google mailbox.**

Google for Drive, Meet, or single sign-on is not enough. If student mail lands in
Outlook, the email features have nothing to read.

## The trap that caught us

Searching "does X university use Office 365" is close to useless. Nearly every
Canadian school hands out free Office desktop apps, and those software-discount
pages rank above the actual mail platform pages. We nearly excluded the
University of Alberta on that basis, when in fact its CCID accounts include Gmail
and Google apps for current students.

**Check the school's own IT mail page. Nothing else counts.**

## The three statuses

```ts
status: "live" | "soon" | "pending"
```

- `live` requires a `source` URL from the school's own IT documentation. These
  names appear on a public marketing page, so a wrong entry is a false factual
  claim about a real organisation, not a cosmetic bug.
- `soon` is confirmed on Google, with a source, but not open yet. **Launch
  scope, not a research gap.**
- `pending` is unchecked. We do not know what their mail runs on.

`soon` and `pending` both read as unsupported to a student, and onboarding
treats them identically. They are separate here because collapsing them throws
away confirmed verification work and invites the next person to redo it. It also
lets the UI tell the truth: a `soon` school gets a "Soon" chip in the picker and
is told plainly that its mail does run on Google and we simply have not opened
the campus, while a `pending` school gets "Not yet" and the weaker claim. "Soon"
is a promise, so only a school we have actually confirmed may make it.

`LIVE_SCHOOLS` is what marketing surfaces read from. `SCHOOLS` is what the
onboarding search reads from. Keep that split.

## Current state (August 2026)

**Live:** University of Alberta, Ontario Tech.

**Confirmed on Google, not launched (`soon`):** Toronto Metropolitan, York
(undergraduate only), Lakehead, Memorial, Mount Royal.

**Confirmed ineligible, keep out:** Carleton (cmail is Microsoft 365), University
of Winnipeg (self-hosted webmail).

Ontario Tech is worth its own note, because it looks like a counterexample to the
eligibility rule and is not. Its student Google Workspace is branded
**OntarioTechU.Net**, so searching the university plus "Microsoft 365" surfaces a
real ITS page saying mail is on Microsoft. That page is about **faculty and
staff**. Undergraduates, graduates, and alumni are on Gmail. Same shape as the
Office trap above: the page that ranks is not the page that answers.

Two entries carry a `note` that surfaces in both the schools list and onboarding:
York's Google mail is undergraduate only, and Memorial's access requires
registration within the last three semesters. Those caveats would otherwise
produce a student who onboards successfully and then gets nothing.

## Maintenance

**Re-verify every entry each August, before term starts.** Universities migrate
mail platforms between academic years and they do it quietly. An entry that was
correct last September is not evidence about this September.

Adding a school is three things: confirm on the school's IT pages, add the entry
with its `source`, flip `status` to `live`. The landing page count and the
marquee update themselves.

## The waitlist

With two schools live, "mine is not here" is the common case, not the edge case,
so the hero answers it instead of dead-ending. The button swaps the CTA composer
for the same bar asking for a **school** address, and `joinWaitlist` reads the
school out of the domain rather than making the student pick from a list that by
definition does not contain them.

Why a school address specifically: the domain is the only thing in the form that
identifies a campus, and it is what makes demand countable per school. Personal
mailboxes are rejected for that reason, not out of formality, and the error says
so. `findSchoolByEmail` matches across a subdomain in both directions, because
York's student mail is `my.yorku.ca` but a York student writing their address
from memory types `@yorku.ca` about as often.

Three outcomes, and the third is the one worth keeping: a `live` domain does not
join the waitlist at all. It is told the school is already open and to pick it
above. Making a student who can start today wait for an email would be the worst
possible result of this form.
