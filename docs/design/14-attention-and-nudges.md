# 14. Attention and nudges

Three things now try to get a stalled reader moving again. All three are gentle,
all three are cancellable, and none of them blocks anything except the last one,
which is dismissible three ways.

## The rule they share

**Point at the thing that works.** The hero's start button is inert until a
school is picked. Any prompt that draws the eye to an inert control is an
invitation to click something that does nothing, which is worse than no prompt.
So the cue depends on where the reader is.

| Where | Cue |
| --- | --- |
| On the hero | The existing two-beat nudge: "Pick your school" grows, then "Only supported in these schools" with the chips hopping in list order |
| Past the hero | The glow under the header's "Get set up" capsule brightens |
| At the closing band | The glow under the bottom "Get set up" brightens |

Fifteen seconds of rest, then about five brighter, then back. The header and the
band share one keyframe, `cta-attention`.

## The pulse is its own layer, not a brighter resting glow

The first version brightened the glow that is already there, by the 40% that was
asked for. It was invisible, and the arithmetic says it always would have been.

The resting glow is three blobs at 22-28% alpha inside a container held at 50%,
or 80% once scrolled. The strongest colour actually reaching the page is about
`0.28 × 0.8`. Adding 40% to the container moves that by roughly four percentage
points of a blue wash on a near-white header: a handful of RGB units. **A
multiplier cannot rescue something that is already nearly invisible.**

So the pulse is a separate blob that animates from nothing to full, with a swell
in scale so it does not read as a light being switched on and off. The resting
glow is untouched, which matters, because it was tuned to lift the capsule
without competing with the page.

On the navy band the same keyframe drives a white blob. A blue glow on navy is
invisible for the same reason.

### Verifying it

**`--virtual-time-budget` does not advance the CSS animation clock.** Two
headless screenshots at 3s and 17.5s of virtual time both render the animation
at t≈0, so a diff between them is always about zero no matter what the animation
does. That reads exactly like a broken animation and cost a full round of
chasing the wrong thing.

To see a specific frame, pin it with a negative `animation-delay` and take an
ordinary screenshot:

```
style={{ animationDelay: "-17s" }}   // renders the 17s frame immediately
```

Diffed that way, rest against peak measures 97/255 at the strongest channel.
Diffed with virtual time it measured 3/255, which was measuring nothing.

## The start nudge

After 30 seconds, a card: **"Get started like this"**, a looping scene of the two
clicks, and **Got it**.

The scene is a stand-in hero. Headline bars rather than real words, because
lettering there would get read instead of the thing being pointed at, then the
two school chips, then the composer. A pointer clicks a chip, the chip fills, the
composer lights up, the pointer clicks it. It rests on the frame where the chip
is chosen and the button is live, which is the answer to "why is that button not
doing anything".

The chips carry full legal school names, matching the real picker for the reason
in [09](09-school-theming.md): the abbreviation is unambiguous on campus and
meaningless off it.

**It is deliberately hard to trigger.** Any of these cancels it for good:

- picking a school, at any point, including while the card is already open, in
  which case it closes itself rather than making someone dismiss a card about a
  thing they just did
- clicking anything marked `data-start-cta`, which is on the header capsule, the
  hero's live button, and the closing band. The listener is capture-phase so it
  still registers on a link that navigates away
- having seen it once this session

Escape closes it, the scrim closes it, and Got it closes it. Focus moves to Got
it on open and returns where it came from on close. `sessionStorage` is wrapped
in try/catch both ways: it throws outright in some embedded contexts, and a
nudge that shows twice is better than a page that crashes.

## Things that are easy to get wrong here

**Do not put the pulse on every capsule.** The header has three, and lighting
them together is a light show rather than a signal. Only the CTA passes `pulse`.

**The hero cue must not fire off-screen.** It is gated on an
`IntersectionObserver` at 0.4, so a reader three sections down is not driving an
animation they cannot see.

**Reduced motion.** The pulse is `motion-safe:`, so under reduced motion the
class is never applied and the inline resting opacity holds: a still glow, not a
missing one. The nudge card still appears, since it is information rather than
decoration, and its scene parks on its rest frame like every other scene.
