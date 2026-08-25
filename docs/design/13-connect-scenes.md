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
| `SealedPasswordScene` | Where does my password go, and why can you not read it? |

They sit side by side in one grid row at the top of the step, above the field
they describe, and both are drawn in a 320x200 box so the two boxes align.

**Neither carries a caption.** They had one each at first, and the captions were
the same wordiness the scenes were brought in to replace. What is left in text
on this step is the heading, one intro line, and the field label. The field's
hint went too: "We add @domain for you, which is what sends you straight to your
school's login page" is a sentence explaining a suffix that is printed on the
input next to where you type.

That trade has a cost worth stating. "Classistant never sees your password" is
now made only by a drawing, and the scenes are `aria-hidden`, so a screen reader
gets no version of it at all. If it has to come back without adding visible
copy, the cheap fix is a visually hidden line beside each scene rather than
restoring the captions.

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

## Three machines, not a courier

`SealedPasswordScene` is a row of three monitors, labelled **You**,
**Classistant**, and **School**, with a dashed lane running under them. The
password is typed as dots on your screen, drops into an envelope, the flap
shuts, a wax seal stamps down, and the envelope travels the lane still shut.

The first version was a courier robot standing between two monitors. It was
friendlier and said less. A labelled row of machines is the actual path, and
naming the middle one is what turns "Classistant never sees your password" into
a statement about a specific thing rather than about a brand. The "cannot see"
tag moved onto that middle machine for the same reason: it belongs to the party
making the promise.

Two small consequences of the swap:

- **Classistant's monitor has no domain strip and no caption.** A brand strip
  with no address reads as app chrome rather than as a web page, which is
  correct, since it is not pretending to be one. Its screen says its name, so a
  caption under the stand would print the same word twice.
- **Its status line says "sealed", not "sealed, not read".** The screen is 72
  units wide and the longer string overflows the right edge. The tag above the
  monitor carries the rest.

### Three phases, because "once" is the thing worth showing

The scene does not stop at the first sign-in. It runs:

1. **The first sign-in.** Typed, sealed, passed along, green check.
2. **The overnight run.** The clock on your machine runs fast from 6:48 PM to
   3:16 AM. Classistant sends the same sealed envelope again on its own. The
   school fills, submits, green check.
3. **The next morning.** 10:26 AM, and it happens again.

Phases two and three are the point. A scene that ends at the first sign-in
implies the opposite of what is true: that a student will be asked every time.
Watching the clock skip past the middle of the night while the envelope goes out
without anyone at the keyboard is also the clearest statement of *why* a portal
password is wanted at all, which is the ask waiting on step two.

The school's screen resets to an empty box when each new envelope is sent, so
every run reads as a fresh sign-in rather than a screen that never changed.

### What it does not claim

The guarantee being dramatised is "Classistant cannot read your password". **The
path is not literal, and phases two and three make that gap wider**, because a
labelled row of machines reads as a network diagram and a reuse loop asserts a
storage story on top of it.

At step one, where this card actually sits, a student types their password into
their school's own page and the browser goes there directly. Nothing passes
through Classistant, nothing is stored, and there is no overnight anything: what
Google hands back is a refresh token, not a password.

**What is drawn here is step two's story**: the portal password, held in Secret
Manager and replayed against the school portal overnight
([12](12-onboarding-persistence.md)). On that step the drawing stops being a
simplification and becomes very close to what happens.

Two consequences worth weighing before this ships:

- The scene may simply belong on step two, where it is accurate and where it
  argues for the thing being asked for.
- "Cannot see" is the strongest wording the sealed-envelope model can carry, and
  it is doing more work in phase two than in phase one. A service that signs
  into a portal on your behalf has to be able to present the password. Sealed in
  transit and at rest is true and defensible. Never readable by anyone is not,
  and the tag should not drift toward implying it.

## Rest beats are chosen, not defaulted

`useSceneClock` parks on `restAt` under `prefers-reduced-motion`, so every scene
needs a still frame that carries its point. With the captions gone those frames
are the entire message, so a rest beat is load-bearing here rather than a
nicety. Neither scene wanted its last frame:

- **`ConnectScene` rests at the end of act one**, on the fully typed address.
  Of the two acts that is the one asking the student to do something, and it is
  the act that names the thing to type. A rest beat inside act two would park
  the card on a consent screen with no hint of what to type to reach it. The
  cost is that a reader with reduced motion never sees act two at all, which is
  the strongest argument for the hidden line described above.
- **`SealedPasswordScene` rests with the envelope on the Classistant machine**,
  not on the signed-in frame at the end. Parked on its last beat the scene is
  three idle monitors, which says nothing. Parked here it is a sealed envelope
  sitting on the named machine under a "cannot see" tag, which is the whole
  claim in one still.

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
