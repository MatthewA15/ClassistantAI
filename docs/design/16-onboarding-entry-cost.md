# 16. The pause on the way into onboarding

A student picks their school on the landing page, presses *i'm ready to start*,
and nothing happens for a moment. Then the setup card appears. It only ever
happens on the first press; going back and forth afterwards is instant.

That "only the first time" is the tell. Everything the second press reuses, the
first press had to fetch, and it fetched all of it before drawing anything.

## What the first press was actually paying for

Two costs, stacked, with nothing on screen while they ran.

**The route could not be prefetched.** `/onboarding` is `force-dynamic`, and
Next prefetches a dynamic route only as far as its nearest loading boundary.
There was no `loading.tsx`, so there was no boundary, so there was nothing to
prefetch. Measured against a production build, the prefetch the hero's `<Link>`
fires when it scrolls into view returned **186 bytes** and named **zero** chunks
to preload. The router learned nothing and cached nothing.

**So the click paid for everything at once.** A cold RSC round trip to the
server, plus every byte of JavaScript the route needed and the browser had never
seen: **185 kB raw, about 57 kB gzipped**. Roughly 40 kB gzipped of that was the
Firebase Auth SDK, statically imported by the wizard and therefore sitting in
the chunk that has to be parsed before the page can hydrate — despite doing
nothing at all until the student presses *Text me a code*.

And on the server, the page awaited `getSession()` and `getUserByAuthUid()` in
its own function body, above the `<Suspense>` boundary. A boundary with nothing
suspending beneath it streams nothing, so the response could not begin until
Firebase Admin had verified the session cookie (a network call: `checkRevoked`
is on, see [15](15-firebase-auth.md)) and Firestore had answered a query. Two
round trips before the first byte.

Locally none of this shows up: the RSC render is about 4 ms and the chunks come
off localhost. It is real on a phone on campus wifi, which is where it was seen.

## The three changes

**`app/onboarding/loading.tsx`.** The load-bearing one. Its purpose is not
politeness, it is giving the prefetcher a boundary to stop at. With it in place
the same prefetch returns **10.3 kB** of real card markup and names **five**
chunks to preload, so the route's JavaScript is already in the browser by the
time the student clicks — fetched while they were still choosing a school.

**The session reads moved below the boundary.** `page.tsx` is synchronous again;
an async child does the two reads. The frame and the card flush immediately and
the wizard arrives when Firebase and Firestore answer.

**The Firebase Auth SDK is imported on demand.** `lib/firebaseClient.ts` now
pulls `firebase/app` and `firebase/auth` through a dynamic `import()` instead of
a static one. `warmPhoneAuth()` starts that fetch from an effect once the wizard
has mounted, so it is off the hydration path but has landed long before anyone
has finished typing ten digits.

Measured on a production build:

| | before | after |
| --- | --- | --- |
| Prefetch payload | 186 B, 0 chunks | 10.3 kB, 5 chunks |
| New JS on the `/` → `/onboarding` hop | 185 kB raw / 57 kB gz | 69 kB raw / 21 kB gz |
| `/onboarding` route JS | 56.5 kB | 16.6 kB |
| `/onboarding` first load JS | 167 kB | 132 kB |

## The rules this leaves behind

**`components/onboarding/shell.tsx` must not become a client component.** The
card, the progress bar and the page frame live there precisely so `loading.tsx`
can render them on the server. A hook or a browser API anywhere in that file
forces a `"use client"` onto it, which drags the entire wizard bundle into the
loading boundary and silently undoes the fix. There is nothing in the build
output that would flag it.

**Nothing dynamic in the `loading.tsx` subtree.** Reading cookies or headers
there makes the boundary unprefetchable again, which is the same failure in a
different disguise.

**The skeleton is not a placeholder for the header.** The card, the back arrow,
the line of encouragement and the progress bar in the fallback are the real
components with real content, because none of them depend on the session. Only
the body below is greyed. That is what makes the swap invisible: nothing moves
when the wizard lands, it just fills in.

The bar opens on phase 0 in the fallback, because a student arriving with no
`?school=` still has a school to pick. One who arrives with a school is moved to
phase 1 by the wizard, which is the bar animating forwards — the direction it
should move anyway, rather than a correction.

## One thing checked and deliberately not changed

`useSearchParams()` inside a Suspense boundary is documented to fall back to
client rendering on a *statically* rendered route, which would have meant the
server drawing the school picker and hydration immediately replacing it with the
number screen — a visible swap on every hard load, including the return leg from
Google's consent screen.

It does not happen here. `force-dynamic` takes the route out of that case, and
a production build serving `/onboarding?school=tmu` renders `What is your
number?` and the school's name in the HTML. The hook stays. (The check that
first suggested otherwise used `?school=uwo`, which is not a school in
`data/schools.ts`; `getSchool` returned undefined and the picker was the correct
response. Worth knowing when testing this route by hand: an unknown id fails
silently and looks exactly like the bug.)
