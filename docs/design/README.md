# Classistant design docs

Why things are the way they are. Written as the frontend was built, so decisions
here reflect what actually shipped rather than what was planned.

Read these before changing something that looks arbitrary. Most of it is not.

| Doc | What it settles |
| --- | --- |
| [01 Brand and logo](01-brand-and-logo.md) | The mark, why a hand holding a cap, wordmark, usage rules |
| [02 Design system](02-design-system.md) | Palette constraint, type, spacing, the "no AI tells" rules |
| [03 Landing page](03-landing-page.md) | Section order and what each one has to accomplish |
| [04 Onboarding](04-onboarding.md) | Step order, why credentials come late, validation split |
| [05 Schools data](05-schools-data.md) | Eligibility rule, verification requirement, live vs pending |
| [06 Motion and SVG](06-motion-and-svg.md) | Where animation is used, the reduced-motion contract |
| [07 Backend contract](07-backend-contract.md) | What the frontend hands over, and what it deliberately does not do |
| [08 Legal pages](08-legal-pages.md) | Why they exist, what still needs a lawyer |
| [09 School theming](09-school-theming.md) | Per-school colours, why no logos, the locked CTA |
| [10 How-it-works scenes](10-how-it-works-scenes.md) | The four stick-figure loops and the bugs they taught |
| [11 Phone mockups](11-phone-mockups.md) | The fake phones, their status bars, and keeping their clocks honest |
| [12 Onboarding persistence](12-onboarding-persistence.md) | The real Google login, the two Firestore collections, where the portal password lives |

## Ground rules that apply everywhere

1. **No purple, anywhere.** The palette is dark blue, light blue, and white.
2. **No em dashes in copy.** Commas, periods, or parentheses instead.
3. **No badge chips above headings.** The small pill with a dot is the single
   most recognisable AI-generated-landing-page tell, so it is banned outright.
4. **Nothing factual ships unverified.** Especially school names, which are
   claims about real organisations.
