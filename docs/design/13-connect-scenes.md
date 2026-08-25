# 13. The connect step scenes

## The problem

Step one asks a student to hand a website their school login. Written down that
is an alarming request, and the page answered it the weakest way available: a
sentence saying "Classistant never sees your password", and a bulleted list of
five scopes under a heading reading "Google will ask you to allow".

Both were true and neither was convincing. A claim about what software does not
do is exactly the claim a reader has no reason to take on trust, and a list of
permissions is a wall of text arriving at the moment a student is deciding
whether to trust you at all.

Two looping scenes replace them, in
[`connectScenes.tsx`](../../src/frontend/components/onboarding/connectScenes.tsx).

## What each one is for

| Scene | Answers |
| --- | --- |
| `ConnectScene` | What do I type, and then what am I agreeing to? |
| `SealedPasswordScene` | Why can you not read my password? |

They sit side by side in one grid row at the top of the step, above the field
they describe. Both are drawn in a 320x200 box: two figures of different aspect
in one row leave one caption hanging below the other.

## ConnectScene is one scene in two acts, not two scenes

The first version had the sign-in page and the permission checklist as separate
cards. That was wrong. They are not two things, they are one thing that happens:
pressing the button in act one is what produces act two. Two boxes read as two
separate demands rather than as a flow with an end, and an end is the reassuring
part.

So act one types `example@theirdomain` into a mock of the school's own sign-in
page, presses **Continue with Google**, and cross-fades into act two, which ticks
the five permissions and presses Allow.

Three details that are deliberate:

- **The button says "Continue with Google", not "Next".** It is the button the
  student is about to press for real, twenty pixels further down the page.
  Foreshadowing it costs nothing, and a generic "Next" is a mock of a screen
  that does not exist.
- **That button is drawn white and bordered, with Google's own four-colour
  mark**, matching the real one rather than the school theme. Google's branding
  requires their mark not be placed on a coloured plate. It is the one element
  in these scenes that does not follow the school's colours.
- **The address bar shows the school's real mail domain and nothing else.**
  Inventing a plausible-looking `login.` subdomain would be a factual claim
  about someone else's infrastructure, which is the rule in [05](05-schools-data.md).

Everything else themes for free. `SchoolThemeProvider` overwrites
`--color-brand-*` on the document root, so `var(--color-brand-600)` in these
files is already the school's green or navy without the scene knowing which
school is on screen. The crest is a monogram, never a logo, for the trademark
reason in [09](09-school-theming.md).

## The written scope list is gone, and took a rule with it

`ScopeList` used to sit under this step. It carried a comment that mattered more
than the markup did: every line must describe something `lib/googleOAuth.ts`
actually requests, and the word "send" must never appear, because
`gmail.compose` writes drafts and is incapable of sending. Consent copy that
overstates a scope is what a Google app review fails on, and it is also just
untrue to the student.

Deleting the component would have deleted the rule, so the rule moved to
`PERMISSIONS` in `connectScenes.tsx`, which is now the only description of the
scopes on the page. Google's own consent screen remains the authoritative list,
and the student sees it before anything is granted.

## What the sealed envelope does and does not claim

The password is typed as dots, drops into an envelope, the flap shuts, a wax
seal stamps down, and the courier carries it to the school's machine without
ever opening it.

The guarantee being dramatised is "Classistant cannot read your password", which
is true. **The courier is a metaphor for handling, not a diagram of the
network.** At this step the student types their password into their school's own
page and the browser goes there directly, so nothing is carried at all.

This is worth knowing before reusing the scene. On step two, where a portal
password really does travel through Classistant into Secret Manager
([12](12-onboarding-persistence.md)), the same drawing stops being a
simplification and becomes literally what happens.

## Rest beats are chosen, not defaulted

`useSceneClock` parks on `restAt` under `prefers-reduced-motion`, so every scene
needs a still frame that carries its point. Neither of these wanted its last
frame:

- **`ConnectScene` rests at the end of act one**, on the fully typed address.
  Of the two acts that is the one asking the student to do something. A rest
  beat inside act two would park the card on a consent screen with no hint of
  what to type to reach it, so the caption carries what act two says instead.
- **`SealedPasswordScene` rests mid-carry**, not on the signed-in frame at the
  end. Parked on its last beat the scene is a robot standing between two
  computers, which says nothing. Parked mid-carry it is a sealed envelope in the
  courier's hands under a "cannot see" tag, which is the whole claim in one
  still.

## Two traps this cost

**`fill="#fff" {...ink}` renders unfilled.** The shared stroke object carries
`fill: "none"`, and a spread that lands after an attribute wins, so the fill is
silently discarded. This is the same ordering trap as the Tailwind class lists
in [02](02-design-system.md), and it is invisible in review because the JSX
reads exactly like it works. Fill is a parameter of the `inked()` helper now,
which is the same fix `PhoneFrame` used for its variants. TypeScript does flag
it (TS2783) if you happen to be running `tsc`.

**Do not verify these with Chrome's `--virtual-time-budget`.** It fast-forwards
timers and CSS transitions independently, which renders checkboxes ticking in a
scrambled order and other states that cannot occur. It looks exactly like a
sequencing bug. To see true state, park the clock on a known beat and screenshot
with `--force-prefers-reduced-motion`, which stops the clock and zeroes every
transition.
