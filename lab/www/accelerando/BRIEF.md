# this-use — Accelerando

## What this is

The request (a Bluesky thread, terse, one line): "an extension that keeps zoom
yoyoing the pfp in and out but with a steady acceleration so the steps
gradually happen faster and faster," with the requester specifying
@timfduffy.com's avatar as the sample/demo image. The rest of the thread was
unrelated riffing about Animorphs/Goosebumps and is not part of the brief.

Shipped as a complete single-page demo, not a skeleton: resolves
@timfduffy.com's profile and avatar on load, runs the accelerating zoom
continuously, and lets a visitor type any Bluesky handle (via `kit.handleInput`)
to swap the avatar being zoomed. Play/pause and a manual reset are provided.
This is done — no obvious next slice was left half-built.

## Decisions

- **A real browser extension is out of scope.** Lab sites are static pages
  under a fixed CSP with no ability to package/ship a `manifest.json`
  extension. Built the effect as a page instead and said so plainly in the
  copy, rather than pretending otherwise or shipping something that mimics an
  extension UI it isn't.
- **"Steady acceleration" = constant angular acceleration**, not a list of
  discrete steps whose delay shrinks by some fixed factor each time. The motion
  is `theta(t) = w0*t + 0.5*a*t^2`, `scale = mid + amp*sin(theta)`, so angular
  velocity `w = w0 + a*t` increases at an exactly constant rate. This reads as
  literally what "steady acceleration" means (constant rate of change of
  speed), stays smooth (no timer drift/jitter from chained `setTimeout`s), and
  is trivial to reset cleanly. Rejected: re-triggering a CSS transition on an
  interval that shortens — it drifts out of sync with wall-clock time and
  compounds rounding error over many iterations.
- **Caps the max speed and resets.** Above ~4.5 swings/sec (period < ~220ms)
  a scale oscillation stops reading as "zooming" and starts reading as
  flicker/strobe, which is both unpleasant and pointlessly fast to watch. At
  that point it resets to the slow starting speed and bumps a visible "cycle"
  counter, rather than accelerating forever into nonsense.
- **Avatars are set directly from `p.avatar`/`actor.avatar` (the raw
  `cdn.bsky.app` URL), not through `/_img/`.** Turn 1 routed them through a
  `/_img/` proxy path on the theory that it was the safe default — but that
  path is not a real worker route (there is no `/_img/` handler in
  `lab/www/worker.js`), so every avatar 404'd. Fixed the same way
  `probably-have/BRIEF.md` documents for the identical bug: this page only
  ever displays the avatar in an `<img>`, it never draws it to a canvas for
  export, so there's no tainting to guard against, and the CSP's `img-src`
  already allowlists `https://cdn.bsky.app` outright (see `lab/www/worker.js`).
  A proxy would only be justified by a save/share-as-image feature, which this
  doesn't have.
- **No labPds usage.** There's no score or saved state worth persisting here —
  it's a live toy, not a game with an outcome. Sign-in would add friction for
  no payoff.
- Named the page/site "Accelerando" (the musical term for gradually speeding
  up) rather than anything referencing a real product — no trademark risk, and
  it's a precise, evocative one-word fit for the concept.

## The plan (nothing left undone that I know of)

If a future turn wants to extend this:
- Could add a second image "duel" (two avatars zooming out of phase) if
  requested — not asked for, so not built.
- Could let the visitor tune the acceleration constant or starting speed via a
  slider — kept fixed for simplicity since nobody asked for tunability.
- Could persist "fastest cycle reached" as a `labPds` score if this ever grows
  a competitive angle — deliberately skipped for now (see Decisions).

## Gotchas

- `kit.handleInput`'s `onPick(handle, actor)` already hands you the picked
  actor's `avatar` field directly (from `searchActorsTypeahead`) — no need for
  a second `getProfile` round-trip when swapping subjects, only for the
  hardcoded default handle on page load.
- Fixed 2026-08-03: a real-browser screenshot under the production CSP showed
  both avatars failing to load — `/_img/` is not a route this worker serves.
  Removed the `toProxied()` helper entirely and set `img.src` straight to the
  CDN URL, matching how `kit.handleInput`'s own dropdown already renders
  avatars (also unproxied) and how `probably-have` fixed the same bug earlier.
