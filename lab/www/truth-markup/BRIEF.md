# BRIEF — "Truth Markup"

## What this is

The request thread (thegodfungi.bsky.social, replying to their own earlier
post after minormobius told them to "just tell this guy to build it") asked
for a site around one idea: DRAM and "ilk" — memory, transfer, load, supply —
carry a price that's artificially low because some of what everyone believes
about them is wrong ("lies and misconceptions"). As the misinformation gets
dispelled/shed, the real price should surface, and whatever gets discarded
should turn into "the tiniest piece of entertaining art, maybe to gawk at."

Turn 1 shipped a full, working single-page simulation. Five commodities
(DRAM, NAND flash, HBM, transfer bandwidth, supply capacity), each starting
under-priced ("floor") with a noisy, jittery signal. Clicking "Dispel a lie"
raises global `purity` (0→1), which both damps the noise and interpolates
every asset's price toward its honestly-labelled "true value." Each click
also credits the asset with the largest remaining gap and paints a small
procedural-art tile from that removed noise into a gallery below, newest
first, capped at 30 tiles.

Turn 2 shipped item 1 from turn 1's plan: gallery persistence. The request
that turn was just "u are funny" — a reaction, not a new ask — so per the
standing instruction ("if the request does not point somewhere else, work
the plan") that turn worked the plan rather than inventing something new.
Signing in (optional, `kit.handleInput` + `labPds`) saves the gallery to the
visitor's own repo as `{key, removed, seed}` tiles rather than pixels, and
`mulberry32(seed)` repaints the exact same art deterministically on the next
visit. Sign-in/out UI sits above the gallery; `store.onChange` keeps it in
sync if a session expires mid-visit.

Turn 3 (this turn) shipped items 5 and 6 from turn 2's plan. The request
this turn — "cool how session instances react to fine touch" — doesn't name
anything that exists on the page (no "session instances" or "touch" concept
here) and doesn't point anywhere else, so it reads the same way "u are
funny" did last turn: a reaction, not a new ask. Worked the plan again.
Shipped: (a) signing in mid-visit no longer discards whatever was painted
before the redirect — `doSignIn` stashes the in-memory `tiles` array into
`sessionStorage` right before `store.signIn` navigates away, and the
`store.ready().then(...)` chain reads it back, merges it in front of
whatever was already saved, re-persists the merged list, and clears the
stash key; (b) a "Clear saved gallery" button next to Sign out, calling
`store.remove('gallery')` and resetting the in-memory/on-screen gallery to
empty.

## Decisions

- **No real DRAM/NAND/HBM market data.** There's no network access and no
  live-pricing API on the allowlist even if there were — `connect-src` is
  `public.api.bsky.app` / `plc.directory` only. Rather than pretend, the
  footer says plainly these are illustrative stand-ins, not sourced prices.
  This is the honest-labelling pattern this requester has responded well to
  before (flame-simulator combustion temps, "estimated" and clearly said).
- **One global purity control, not five separate sliders.** The ask reads as
  one restructuring event across "every and all instances," not five
  independent markets, so one button driving all five keeps the metaphor
  intact. The *breakdown table* underneath is still per-asset (this
  requester's profile flags a standing preference for a breakdown over a
  single score) — so the multi-item structure they like is there, it's just
  driven by one lever instead of five.
- **No text drawn on the canvas** — not the chart, not the gallery tiles.
  This requester gave explicit past feedback on a different site ("cheers-
  write"): keep readouts out of the simulation surface. Numbers live in the
  HTML breakdown table; gallery captions are `<figcaption>` elements below
  each tile, never painted over it.
- **Sign-in is now wired up, but stays optional.** Turn 1 argued against
  adding OAuth "just to have it"; turn 1's own plan then named the gallery
  as the obviously-missing durable piece, so this turn adds it without
  making it required — the price simulation and the in-session gallery both
  still work with zero clicks toward Bluesky. `store.save`/`store.load` only
  fire when `store.user()` is truthy.
- **Store the seed, not the pixels.** A tile's `paintArt` used
  `Math.random()` five separate times per tile; saving a screenshot would
  work but can't be "repainted," and JSON-encoding a canvas as a data URL
  bloats the record for no reason. Swapped every `Math.random()` inside
  `paintArt` for a passed-in `rng()` and seed each tile with one 32-bit
  integer (`mulberry32`), so `{key, removed, seed}` is ~40 bytes and
  reproduces pixel-for-pixel on reload.
- **`prefers-reduced-motion` gets a real branch**, not just CSS: the rAF
  loop never starts, history is pre-seeded once statically, and interaction
  (dispel/reset) still redraws once per click so the page isn't frozen, it's
  just not animating on its own.

## The plan (not built yet, roughly in order)

1. ~~Save the gallery to the visitor's own repo~~ — done turn 2.
2. ~~Merge a signed-out session's tiles into an account on sign-in~~ — done
   this turn (turn 3).
3. ~~A "clear my saved gallery" control~~ — done this turn (turn 3).
4. **A `scoresOf`/leaderboard angle** is plausible ("who dispelled the most
   misinformation") but only if a future ask actually wants competition —
   don't add it speculatively; this requester's profile shows they'll ask
   for versus/competitive mechanics explicitly when they want them (see the
   flame-simulator "Flame Wars" build).
5. **Per-asset dispel** (five small buttons instead of one) if a follow-up
   wants finer control — straightforward, `priceOf`/`ASSETS` already have
   the per-asset state, just needs per-asset `purity` instead of one global
   number.
6. Chart currently normalizes each line independently within its own
   `[floor*0.75, truth*1.1]` band for display — fine for "the noise is
   calming down" but doesn't let you compare absolute scale across assets.
   If a future ask wants that, it needs a real shared axis and probably a
   log scale (HBM at $21/GB dwarfs NAND at $0.085/GB).
7. **Not built:** the merge (item 2, above) is untested past reading the
   code carefully — there's no way to exercise an OAuth round-trip from this
   sandbox. If a future screenshot/report shows the gallery empty right
   after a first sign-in-with-existing-tiles, check `sessionStorage` isn't
   being cleared by the redirect itself in some browser before the read-back
   runs (it shouldn't be — same tab, same origin — but it's the one part of
   this turn that couldn't be verified end to end).

## Gotchas

- `kit.crumb(name)` returns the whole `<div class="crumb">…</div>` markup —
  don't hand-roll the breadcrumb, just give it an empty `#crumb` div and
  set `.innerHTML` on load, matching every other tenant.
- CSS custom properties referenced from JS (`var(--dram)` etc.) need
  stripping down to the bare `--dram` before `getComputedStyle(...).
  getPropertyValue(...)` — the small `cssVar()` helper does this; passing
  the `var(...)` wrapper straight through returns an empty string silently.
- The reduced-motion CSS in `tokens.css` only kills declarative
  transitions/animations, not `requestAnimationFrame` — had to add an
  explicit `matchMedia` check and a second code path, per the kit's own
  comment about this.
- The whole inline script had to become `<script type="module">` to
  `import { labPds } from '/_kit/pds.js'`. That's fine — modules run after
  the DOM parses regardless of position, and `kit.js` is a blocking classic
  script loaded in `<head>`, so `window.kit` already exists by the time the
  module body runs. Kept the original IIFE nested inside the module (the
  `import` statement has to be a top-level statement, so it sits just above
  the `(function () { ... })()`, not inside it).
- The crumb was still passing `'data-real'` — a leftover from the directory
  rename in an earlier turn that nobody had touched since. Fixed it to
  `'truth-markup'` while in the file; it's cosmetic (just breadcrumb text)
  but no reason to leave it wrong.
- `sessionStorage`, not `localStorage`, for the pre-signin tile stash — it
  survives the OAuth round trip (same tab) but clears itself once that tab
  closes, which is the right lifetime for "notes to self about to redirect,"
  and it won't leak into a different tab's signed-out session.

## Screenshot review (turn 1, no changes made — not re-verified this turn)

The review screenshot caught the chart mid-ramp: only a small cluster of
lines near the left edge of the `.stage` box instead of spanning it. That's
expected, not broken — history fills one point per animation frame up to
`HIST_LEN = 140`, so a screenshot taken within the first ~20 frames only has
that fraction of the width drawn. Canvas sizing and drawing math are both
correct; a visitor watching for a couple of seconds sees it fill normally.
Rest of the page (header, lede, legend, controls, purity bar, table header)
matched the request and rendered cleanly, so nothing was changed.

This turn added the sign-in row, the "signed in as" row, and the save-status
text above the gallery — none of that existed when the screenshot above was
taken, so it hasn't been eyeballed yet. If this turn's own screenshot review
turns up a layout problem there, it's new, not the chart-fill artifact above.

## Screenshot review (quality-qualifier pass)

Same chart-fill issue as above, but this time visibly broken: the stage box
showed only two short line stubs balled up in the bottom-left corner, not
five lines spanning the width — the rest of the box was empty apart from the
three decorative grid lines. Rest of the page (header, lede, legend,
controls, purity bar, breakdown-table header) rendered correctly and
unchanged.

Fixed: history is now pre-filled synchronously (`HIST_LEN` steps) before the
first `drawChart()`/`requestAnimationFrame` call, for both the reduced-motion
and normal paths, so the chart opens full instead of growing one point per
frame from empty. `reducedMotion` no longer needs its own fill loop since the
shared pre-fill covers it; it just skips starting the rAF loop afterward.
