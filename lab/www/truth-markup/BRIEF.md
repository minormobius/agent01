# BRIEF — data-real / "Truth Markup"

## What this is

The request thread (thegodfungi.bsky.social, replying to their own earlier
post after minormobius told them to "just tell this guy to build it") asked
for a site around one idea: DRAM and "ilk" — memory, transfer, load, supply —
carry a price that's artificially low because some of what everyone believes
about them is wrong ("lies and misconceptions"). As the misinformation gets
dispelled/shed, the real price should surface, and whatever gets discarded
should turn into "the tiniest piece of entertaining art, maybe to gawk at."

Shipped in this turn: a full, working single-page simulation. Five
commodities (DRAM, NAND flash, HBM, transfer bandwidth, supply capacity),
each starting under-priced ("floor") with a noisy, jittery signal. Clicking
"Dispel a lie" raises global `purity` (0→1), which both damps the noise and
interpolates every asset's price toward its honestly-labelled "true value."
Each click also credits the asset with the largest remaining gap and paints
a small procedural-art tile from that removed noise into a gallery below,
newest first, capped at 30 tiles (oldest just fall off, not archived).

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
- **No sign-in, no labPds.** The page works without a repo — the concept
  didn't call for anything durable per-visitor, and "sign-in optional unless
  the site is meaningless without it" argued against adding OAuth just to
  have it.
- **`prefers-reduced-motion` gets a real branch**, not just CSS: the rAF
  loop never starts, history is pre-seeded once statically, and interaction
  (dispel/reset) still redraws once per click so the page isn't frozen, it's
  just not animating on its own.

## The plan (not built yet, roughly in order)

1. **Save the gallery to the visitor's own repo**, via `labPds` /
   `com.minomobi.lab.doc` — `store.save('gallery', tiles)` where each tile
   is `{asset, removed, seed}` so it can be *repainted* deterministically on
   load rather than storing pixels. This is the most obviously-missing
   piece and was cut only for time, not because it's hard.
2. **A `scoresOf`/leaderboard angle** is plausible ("who dispelled the most
   misinformation") but only if a future ask actually wants competition —
   don't add it speculatively; this requester's profile shows they'll ask
   for versus/competitive mechanics explicitly when they want them (see the
   flame-simulator "Flame Wars" build).
3. **Per-asset dispel** (five small buttons instead of one) if a follow-up
   wants finer control — straightforward, `priceOf`/`ASSETS` already have
   the per-asset state, just needs per-asset `purity` instead of one global
   number.
4. Chart currently normalizes each line independently within its own
   `[floor*0.75, truth*1.1]` band for display — fine for "the noise is
   calming down" but doesn't let you compare absolute scale across assets.
   If a future ask wants that, it needs a real shared axis and probably a
   log scale (HBM at $21/GB dwarfs NAND at $0.085/GB).

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

## Screenshot review (no changes made)

The review screenshot caught the chart mid-ramp: only a small cluster of
lines near the left edge of the `.stage` box instead of spanning it. That's
expected, not broken — history fills one point per animation frame up to
`HIST_LEN = 140`, so a screenshot taken within the first ~20 frames only has
that fraction of the width drawn. Canvas sizing and drawing math are both
correct; a visitor watching for a couple of seconds sees it fill normally.
Rest of the page (header, lede, legend, controls, purity bar, table header)
matched the request and rendered cleanly, so nothing was changed.
