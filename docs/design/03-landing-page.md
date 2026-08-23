# 03. Landing page

Source: [`app/page.tsx`](../../src/frontend/app/page.tsx)

## The argument the page has to make

A student arrives sceptical of two things: that another reminder app will help,
and that handing over their school password is sane. The section order is built
to answer those in that order, and to earn the password ask before making it.

| Section | Job |
| --- | --- |
| `Hero` | Show the product in its actual medium, a text thread. Not a dashboard. |
| `SchoolStrip` | Immediate "is this for me" filter, using real supported schools. |
| `HowItWorks` | Collapse the setup fear. Four steps, one of which is yours. |
| `Showcase` | Prove the three hardest claims with screen-level detail. |
| `Features` | The complete list, for the reader who wants to check for their thing. |
| `Escalation` | The differentiator. This is the section people will remember. |
| `Schools` | The eligibility answer, with the honest reason the list is short. |
| `Safety` | Now that they want it, address the password. Not before. |
| `Faq` | Objections we cannot fit elsewhere. |
| `CtaBand` | Ask, with the seasonal urgency that is actually real. |

## Decisions worth defending

**The hero shows a phone, not a dashboard.** Classistant is Messages-native. A
dashboard hero would misrepresent the product and set up the wrong expectation.
The web dashboard appears once, later, framed as "where you check its work".

**`Safety` comes after `Escalation`, not before.** Putting security up front
sounds defensive and plants a doubt the reader did not have yet. Placed after the
reader wants the product, the same content reads as candour.

**The escalation section is the only dark section in the body.** It is the
emotional peak of the page and the thing no competitor does. The tone shift is
the point. `CtaBand` reuses navy so the page closes where its peak was.

**Twelve feature cards, one flat grid, no grouping.** Grouping into three
labelled clusters was tried and dropped: it added three headings of chrome to
help with scanning that a 3-column grid already does. The order still runs setup
to calendar to watching to escalation, so the arc survives without the labels.

**Screenshot placeholders are drawn, not grey.** Each `PlaceholderShot` variant
sketches the real screen's structure so crop, aspect ratio, and page rhythm are
already correct when real captures arrive. Each carries a visible "Screenshot
placeholder" tag so one cannot ship unnoticed. Replace the skeleton with
`<Image>`, keep the wrapper.

## Copy notes

The hero subhead ends on "There is no new app to remember to open." That sentence
is doing the heaviest lifting on the page: it is the entire reason a student
would pick this over a to-do app, and it is stated as a fact rather than a
benefit.

Numbers in copy come from `LIVE_SCHOOLS.length`, never typed. When a school is
verified and added, the page updates itself.
