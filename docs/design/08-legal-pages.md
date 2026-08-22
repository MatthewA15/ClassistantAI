# 08. Legal pages

Sources: [`app/privacy/`](../../src/frontend/app/privacy/),
[`app/terms/`](../../src/frontend/app/terms/),
[`data/legal.ts`](../../src/frontend/data/legal.ts)

## ⚠️ Not reviewed by a lawyer

These are complete, specific documents written against how Classistant actually
works, rather than a generic template with the product name swapped in. They are
**not** legal advice and **have not been reviewed by counsel.**

Before launch:

1. Have a Canadian privacy lawyer review both, particularly the credential
   handling, the CASL consent language, and the liability cap.
2. Replace the placeholders in `data/legal.ts`: legal entity name, registered
   address, and confirm the governing-law province matches where you incorporate.
3. Confirm the retention periods against what the backend actually does. Right
   now the documents state a policy the code does not yet enforce.

## Why they are real documents

Classistant asks for a university password and read access to a student's email.
A boilerplate policy would be both a legal risk and a trust failure at exactly
the moment the reader is most sceptical. The privacy policy is linked from the
step in onboarding where the password is requested, so it gets read.

## Structure

Both use the shared [`LegalLayout`](../../src/frontend/components/site/LegalLayout.tsx),
which takes sections as data. That gives both documents identical anchor links, a
sticky contents rail, and automatic numbering, and stops the two drifting apart.

Sub-processors render from a single `SUBPROCESSORS` array, so adding a provider
means editing one array, not hunting through prose.

## What the privacy policy commits to

Written against the real architecture, so each claim is checkable:

- **PIPEDA, Quebec Law 25, CASL.** The applicable Canadian regime.
- **Google API Services User Data Policy, including Limited Use.** Required for
  the OAuth verification review, and the review will check the wording is present.
- **Credential handling**, spelled out mechanically: envelope encryption, keys in
  a separate KMS, decrypted only inside the isolated browser session, never
  logged, no staff access, destroyed on delete.
- **Named sub-processors with regions**, including the honest statement that
  Twilio and Call-E put data in the United States under US law.
- **Specific retention periods** per data type, not "as long as necessary".
- **Thirty-day response** to access requests, which is PIPEDA's deadline.
- **A named privacy officer**, which PIPEDA requires.

It also states plainly that we do not sell data, do not advertise, and do not
train general models on student email. Those are the three things a student
actually worries about.

## What the terms protect against

The section that matters most is **Accuracy**. Classistant parses syllabi written
by humans, which are routinely wrong or changed silently. It will miss things.
The terms say so directly and place responsibility for deadlines back on the
student. Burying that would be both a legal exposure and dishonest.

**Academic integrity** is its own section for the same reason. The product could
be misused to draft submitted work, so the terms forbid it explicitly and state
that school penalties are between the student and their school.

Also load-bearing: we are not affiliated with any school or Google (repeated in
the footer), the school's own systems always take priority, and the service
breaks when a school changes its login system, which is not our breach.

## Tone

Same voice as the rest of the site: short sentences, second person, no
capitalised block paragraphs. The warranty and liability sections are formal
because they have to be to work, everything else is readable. The terms open with
a two-sentence plain summary before the numbered sections.
