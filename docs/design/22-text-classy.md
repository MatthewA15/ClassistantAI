# 22. Texting Classy after onboarding

What the last screen of onboarding asks a student to do, and why the number is
typeset rather than buried in a button.

## The problem with the old done screen

Onboarding ended on a promise: a text at your number, in about ten minutes, with
every deadline we found. That is the right promise, and it is entirely one-way.
Between pressing "Send welcome gift" and that text arriving there is nothing the
student can do, and nothing they have done has produced a visible result yet.
The only two links out were the dashboard and the marketing home page, neither of
which is the product.

The product is a thread in Messages. The site is where you sign up for it. So the
done screen now ends by opening that thread.

## What shipped

A card between the confirmation paragraph and the STOP instructions, carrying:

- **`+1 365 400 7007`, set at display size.** The number is the element.
- **Text Classy**, a filled button, `sms:` to the same number.
- **Save the contact**, downloading `/classy.vcf`.
- One suggested first line, *"what is due this week?"*

The two links that were there before are demoted to outline and text. One filled
brand button per screen; two is two answers to "what do I do next".

## Decisions

### The number is typeset, not hidden in a button

`sms:` does nothing useful on a laptop, and a good share of signups happen on
one. Chrome offers to pick a handler, most desktops have none registered, and the
press looks like a dead button. Putting the number on screen at display size
means a desktop student reads it and picks up their phone, which is the correct
outcome rather than a fallback. The button is the shortcut for devices where a
shortcut exists.

It is not a `tel:` link. That is a Twilio messaging number; calling it is not the
product.

### No prefilled message body

`sms:+1...?body=` is the one part of this URI scheme phones genuinely disagree
about. iOS wanted `&body=` for years, Android follows RFC 5724 and wants
`?body=`, and the `?&body=` hack that covers both is exactly the kind of thing
that works on the two handsets you tested and opens a blank Messages app on the
third. Opening the thread on the right number is the whole job. The first line to
send is suggested in the copy beside the button, where it cannot break anything.

### The contact card finally has somewhere to be

`public/classy.vcf` has existed since #41 and nothing ever linked to it, which
made fixing its photo and its missing `TEL` (708c583) an improvement to a file no
student could reach. This is the moment it is worth saving: a card imported
before the first message means every reply arrives from "Classy" with a face,
instead of from an unknown ten digit number that reads like spam.

The link is a plain `<a download>`, not a `next/link`. It is a static file rather
than a route, and without the attribute a browser that decides it can render
`text/vcard` shows the embedded base64 photo as a wall of characters. `download`
is a hint only on cross-origin URLs; this one is same origin, so it is honoured.
iOS Safari ignores it and opens the card in Contacts, which is the outcome we
wanted anyway.

## The number is hand-synced in three places

`data/classy.ts` holds it for the site. It must match:

1. `TEL` in `src/frontend/scripts/build-vcard.mts`, which bakes it into the vCard
2. `TWILIO_FROM_NUMBER` in the deployed Twilio functions

Nothing checks this. A mismatch fails silently and in the worst way available:
the site tells a student to text a number nothing answers on, immediately after
they finished handing over a school login. If the number changes, change all
three and re-run `npm run build:vcard`.
