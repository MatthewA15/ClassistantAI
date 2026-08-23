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

## Live vs pending

```ts
status: "live" | "pending"
```

- `live` requires a `source` URL from the school's own IT documentation. These
  names appear on a public marketing page, so a wrong entry is a false factual
  claim about a real organisation, not a cosmetic bug.
- `pending` is everything unconfirmed. Searchable during onboarding so students
  get a straight answer, never rendered anywhere as supported.

`LIVE_SCHOOLS` is what marketing surfaces read from. `SCHOOLS` is what the
onboarding search reads from. Keep that split.

## Current state (August 2026)

**Live, verified:** Toronto Metropolitan, York (undergraduate only), Lakehead,
Memorial, University of Alberta, Mount Royal.

**Confirmed ineligible, keep out:** Carleton (cmail is Microsoft 365), University
of Winnipeg (self-hosted webmail).

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
