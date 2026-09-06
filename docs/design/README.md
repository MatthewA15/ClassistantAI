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
| [13 Connect step scenes](13-connect-scenes.md) | The two loops that replaced the scope list, and what the sealed envelope does not claim |
| [14 Attention and nudges](14-attention-and-nudges.md) | The CTA pulse, why the hero gets a different cue, and the 30 second start card |
| [15 Firebase Auth](15-firebase-auth.md) | Why the login is a phone number, the two ids and the seam between them, the access switches |
| [16 Onboarding entry cost](16-onboarding-entry-cost.md) | The pause on the first press of Start, why the route could not be prefetched, and the rules that keep it fixed |
| [17 Scope narrowing](17-scope-narrowing.md) | Taking deletion out of the Google grant, the one exception Google forces on calendar, and why nobody has to re-consent |
| [18 Emulator env](18-emulator-env.md) | Why the emulator calls Secret Manager, the override file that works and the one that throws, and which three variables belong in it |
| [19 Portal password envelope](19-portal-password-envelope.md) | Why the password left Secret Manager, which key seals it, where the username went, and what nothing can read yet |
| [20 The signed-in area](20-dashboard.md) | The four dashboard pages, the second front door at /signin, the two kinds of promise a control can make, and why the task history is empty |
| [21 User properties and schools](21-user-properties-and-schools.md) | The three fields the agent reads, why the name is asked for rather than taken from Google, and the schools collection |

## Ground rules that apply everywhere

1. **No purple, anywhere.** The palette is dark blue, light blue, and white.
2. **No em dashes in copy.** Commas, periods, or parentheses instead.
3. **No badge chips above headings.** The small pill with a dot is the single
   most recognisable AI-generated-landing-page tell, so it is banned outright.
4. **Nothing factual ships unverified.** Especially school names, which are
   claims about real organisations.
