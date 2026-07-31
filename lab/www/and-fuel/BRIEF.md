# BRIEF — and-fuel

## What this is
norvid-studies asked for a site about @gracekind.net being "the fuel system"
— riffing on gracekind's own Bluesky post ("they turned me into a fuel
system Morty"). The ask: an undeletable-popup gauge showing how much fuel
"your driver" has. Shipped as a single page: a live driver card (fetches
gracekind.net's real profile via resolveHandle → getProfile, shows avatar +
name), a car-style SVG fuel gauge whose needle drifts to a new random low
value every ~4s and never settles, and a fixed pool of 4 "alert" toasts
whose × button never removes them — it just shakes, re-rolls the message,
and bumps a per-toast and a page-wide "dismiss attempts" counter. This is
the whole build; it's small and I finished it in one turn.

## Decisions
- **No literal quote of the "fuel system Morty" line.** It's the whole
  premise, but the task banner says don't quote other people's posts
  without reason, and paraphrasing ("got turned into a fuel system
  somewhere between dimensions") carries the joke without reproducing
  someone else's post text verbatim.
- **Avoided the show's name and any character names in title/heading/og
  tags**, per the trademark rule in CLAUDE.md — the bit reads fine without
  saying "Rick and Morty" anywhere load-bearing; visitors coming from the
  thread already have the context.
- **Fixed pool of 4 toast DOM nodes, recycled forever, instead of spawning
  a new element per alert.** "Undeletable" could have meant literally never
  removing nodes from the DOM, but that's an unbounded leak on a page
  someone might leave open. Recycling in place keeps the joke (nothing
  ever goes away) without the leak.
- **Gauge level is fully client-side random, not tied to any real Bluesky
  signal** — there's no real "fuel" data to read, so I didn't fake a data
  source; the copy says "estimated, not measured" so it doesn't overclaim.
- **Ignored the fake-DoorDash request from fromthewestmeadow.com** that
  appears in this thread's context — that's a different person's request
  (already has its own branch/commit per git log), not something
  norvid-studies asked for, and this directory (`and-fuel/`) isn't the
  right place for it anyway.

## The plan (not built yet)
Nothing is broken or half-finished — this was small enough to finish in
one turn. If norvid-studies wants more:
1. A fake "refuel" button that's satisfying to press but makes the reading
   *worse* — the obvious next joke, easy to add (just call setLevel with a
   lower value and show a fake "topped off!" toast first).
2. Sound/haptic on alert (a soft buzz via the Vibration API on the shake) —
   skipped this turn for scope, not difficulty.
3. If they want the gauge to look "more real," swap the plain SVG needle
   for a subtle CSS drop-shadow/glow — purely cosmetic, low priority.

## Gotchas
- **`<img>` must never carry a literal `src=""`.** The avatar `<img>` was
  written `<img id="driver-avatar" src="" alt="" hidden>` so it would be a
  no-op until JS filled it in. It isn't a no-op: an empty `src` resolves per
  spec to the *document's own URL*, so the browser requests the page itself
  as an image the instant it parses the tag — `hidden` doesn't stop the
  request, only the rendering. That's what the smoke harness caught (`failed
  to load http://127.0.0.1:33151/`). Fixed by dropping the attribute
  entirely and letting the `.src = ...` assignment in JS add it only when a
  real avatar URL exists.
- The needle's `transform-origin` is in SVG user units on the `<g>`, set to
  the arc's center (100,100) in the viewBox — if the arc geometry ever
  changes, that origin has to move with it or the needle sweeps from the
  wrong pivot.
- `kit.bskyGet` only allows resolveHandle/getProfile/etc — confirmed
  against `lab/_kit/kit.js`'s `BSKY_OK` list before writing the fetch chain;
  no surprises there.
- Untested in a real browser (no Bash/WebFetch in this sandbox) — I read
  the fixtures (`resolveHandle.json`, `getProfile.json`,
  `resolveHandle.error.json`) for field names rather than guessing, but the
  smoke harness is the first real render.
