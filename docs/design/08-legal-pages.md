# 08. Legal pages

Sources: [`app/privacy/`](../../src/frontend/app/privacy/),
[`app/terms/`](../../src/frontend/app/terms/),
[`app/delete-my-data/`](../../src/frontend/app/delete-my-data/),
[`data/legal.ts`](../../src/frontend/data/legal.ts)

## ⚠️ Not reviewed by a lawyer

These are complete, specific documents written against how Classistant actually
works, rather than a generic template with the product name swapped in. They are
**not** legal advice and **have not been reviewed by counsel.**

Before launch:

0. **Substantiate the "84 hours a year" headline, or soften it.** The closing
   CTA makes a numeric performance claim with an asterisk pointing at a footer
   estimate. Under s.74.01(1)(b) of the Competition Act a performance claim must
   rest on **adequate and proper testing carried out before the claim is
   published**, and a disclaimer does not cure an untested one. Either run the
   survey the footnote describes and keep the methodology on file, or reword the
   headline so it is not a measurable claim.
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

## Deleting your data

`/delete-my-data` is the third page in this group and the only one that is a
task rather than a document. The footer link under Legal used to be a bare
`mailto:privacy@classistant.ca`, which is the wrong end of the work: an empty
compose window makes the student guess what we need, and what comes back is
"please delete my stuff" from a personal Gmail we cannot match to any account.
That turns a thirty second job into a thread. The page composes the email
instead.

**Why an email and not a button.** Nothing on this page calls our backend. The
site has no logged-in state, so a delete button here would authenticate nothing,
and the action it fires destroys a stored school credential and a semester of
coursework. The student's own mail client sends from an address we can check
against the account, which is the cheapest identity proof available to a page
with no session. Step 2 exists for the same reason: we reply to the school
address on file before acting, so knowing someone's name is not enough to erase
their term.

**Three scopes, not one.** Deleting everything, destroying just the stored
portal password, and wiping just the message history are genuinely different
asks, and a student who only wants the assistant out of their portal should not
have to lose their semester to get it. The scope picker writes a different
subject line for each so the request is triaged before it is opened.

**The message is shown in full.** A button that silently hands text to a mail
client is a black box on the one page whose subject is trust. It also gives the
copy fallback something to fall back to when `navigator.clipboard` is blocked or
no mail handler is registered, which is common on shared lab machines.

Deliberately not built on `LegalLayout`: the sticky contents rail would push the
one control that matters below the fold, and numbered sections would frame a
task as a document.

Before launch:

- **Make the backend honour what this page promises.** Same gap as the retention
  periods above. The page commits to immediate credential destruction, a
  same-week run, a thirty day outside limit, a confirmation email listing what
  was removed, and a fourteen day backup rollover. Right now those are a policy,
  not an enforced pipeline. Confirm the backup cycle is actually fourteen days
  before the sentence ships, because it is a checkable factual claim.
- Make sure `privacy@classistant.ca` is monitored on a one business day cycle,
  which is what step 2 promises.
- The `DELETE` keyword in the SMS handler should reach the same pipeline, and
  its reply should point back at this page.

## Tone

Same voice as the rest of the site: short sentences, second person, no
capitalised block paragraphs. The warranty and liability sections are formal
because they have to be to work, everything else is readable. The terms open with
a two-sentence plain summary before the numbered sections.
