## What this is

The ask was terse and purely mathematical, matching this requester's standing
pattern (see `lab/_profiles/ponder.ooo.md`): "conways game of life in 5
dimensions." No reference link, no spec beyond that. Shipped a real 5D
cellular automaton, not a themed 3D demo or a lookup-table shortcut:

- Grid is a genuine 5D torus, flat `Uint8Array` of length `N^5` (N = 4/5/6,
  selectable — default 5, so 3,125 cells).
- Neighbourhood is the actual 5D Moore neighbourhood: every offset in
  `{-1,0,1}^5` except zero, i.e. `3^5 - 1 = 242` neighbours per cell,
  precomputed once into `OFFSETS` and reused every generation. No dimension
  was faked or dropped to make the compute cheaper.
- Rule is birth/survival stated as a **density band** (fraction of the 242
  neighbours alive) rather than a fixed count, because a fixed count (like
  B3/S23) has no meaning once the neighbour total changes with dimension.
  Four sliders (birth min/max, survive min/max), each paired with a numeric
  input per this requester's established preference for slider+number pairs.
- Visualization: nested grid-of-grids. `(x,y)` is the cell grid inside one
  tile; `(z,w)` tile those grids into a meta-grid (so 4 of the 5 axes are
  visible simultaneously, all at once, no toggling); the 5th axis `v` is a
  slider that picks which hyperplane is *drawn* — the simulation still runs
  on the full 5D volume regardless of what's on screen. Click/tap a cell in
  the current slice to toggle it by hand before playing.
- Play/pause/step/randomize/clear, adjustable step interval, adjustable
  random-fill density, live generation/population/density readout.

## Decisions

- **Named it "Pentacell," not "Conway's Game of Life" or "The Game of Life,"**
  in the title/h1/og tags. "The Game of Life" is Milton Bradley/Hasbro's
  board-game trademark (separate from Conway's cellular automaton, which
  isn't trademarked) — same caution as the tube-tetris lesson in the root
  CLAUDE.md. Body copy freely says "Conway's rule" and describes the
  mechanism, since the gate only checks title/headings/share card, not
  description/body.
- **Density-band rule instead of a fixed neighbour-count rule.** This is the
  one real design call with no canonical answer, and it's flagged explicitly
  on-page (not just here) per the standing "flag the shortcut" pattern from
  this requester's profile — domino-upright and cyclotomic-Littlewood are
  the precedents. Defaults are centred on 2D Life's own density (birth
  ~3/8, survival 2/8–3/8) but are **not** claimed to be special in 5D the
  way B3/S23 provably is in 2D — said so on the page itself.
- **No CARD.json** — this is an interactive tool where the working page is
  the best advertisement, matching the "screenshot IS the advert" rule from
  the twenty-second request note in the profile. Default screenshot/link
  card ships instead.
- Plain 2D canvas, not three.js. A 5D structure rendered as nested 2D tiles
  is more legible and more literally honest about what's being shown (a
  slice, not a fake 3D/4D projection) than trying to force it into a 3D
  scene.
- Did not add a second visualization mode (e.g. a population-over-time
  graph) despite the "multiple forms of visualization" pattern noted for
  this requester on other math asks — ran low on turn time and the nested
  slice view is the one honest way to actually see all 5 axes; a time-series
  chart would be a nice-to-have, not a second angle on the same object the
  way the knot/complex-map sites needed one.

## This turn (2026-09-27)

Request was narrower than the standing plan: "identify some preset rule
parametrizations that produce interesting behaviors." Per the turn rules, a
specific request beats the inherited plan, so this turn didn't touch the
sparkline/save-load/perf items below — it added a **"why presets, and why
they're a prediction" panel** with five preset buttons (Life echo / Stable
plateau / Population pulse / Takeover / Extinction) that set the four rule
sliders in one click.

The presets aren't guesses — they come from an actual mean-field argument,
because it's the mathematically honest way to pick them with no browser to
run the sim in: with 242 neighbours, the fraction any single cell sees is
tightly concentrated around the *global* density (std &approx;
&radic;(p(1&minus;p)/242), only ~2.7 points at p=0.22 — versus tens of points
for 2D Life's 8 neighbours). So to first approximation the whole grid's
density evolves as **one scalar map** p&prime; = p&middot;S(p) + (1&minus;p)&middot;B(p),
where S/B are the survive/birth band indicators — not as a field of locally
varying shapes the way 2D Life is. That collapses the achievable outputs from
a given p to just {0, p, 1&minus;p, 1}, which is what let me *design* an exact
predicted 2-cycle (0.22 &harr; 0.78) for "Population pulse" rather than just
guess at something that oscillates: solve B(p)=1,S(p)=0 at both 0.22 and 0.78
simultaneously (birth band 15&ndash;85, survive band 90&ndash;100 does it), and
verify by hand-iterating the map twice.

Same reasoning explains a real, previously-unflagged risk in the **existing
shipped default**: birth 33&ndash;45 / survive 24&ndash;45 with the default 22%
random fill. 22% is *below* the survive floor of 24% — mean field predicts
the default configuration nearly dies on the first Randomize+Play, which
matches the prior agent's hedge in this file ("if dead, nudge sliders") but
now with an actual cause rather than a shrug. Deliberately did NOT change the
shipped default numbers this turn (minimal-change principle — that pairing
was a considered design choice tied to 2D Life's own density ratios, not
mine to override for a hunch) — flagged it in the "Life echo" preset's own
description instead, which is the fix a visitor can apply in one click if the
board looks dead.

**Caveat to flag if a follow-up asks to verify this empirically**: the
mean-field argument assumes each cell's local neighbourhood is close to an
independent random sample at the *current* global density, which is only
exactly true at t=0 from a uniform random fill. As the system evolves,
correlations build up (blocks of same-state cells cluster spatially even in
5D), so the real trajectory can and will drift from the 4-outcome
{0,p,1&minus;p,1} idealization over many generations — the presets are a
starting hypothesis to test against the real engine, not a proof about it.

## The plan (not built yet, in order)

1. **A population-over-time sparkline** next to the stat line — cheap, and
   would satisfy the "multiple views" pattern properly if the requester asks
   for it. Reuse the existing generation loop; just push `pop/total` into a
   ring buffer each step.
2. **Save/load a pattern via labPds** (`/_kit/pds.js`, `com.minomobi.lab.doc`,
   kind `"pentacell-pattern"`). Not built this turn — sign-in is optional per
   house rule and the tool is fully usable without it, so this is a genuine
   "next feature," not a missing requirement. Store the flat grid + N as the
   doc value.
3. **Performance headroom at N=6+**: `step()` is O(N^5 * 242) with a plain
   nested loop and per-neighbour modulo-free wraparound (branch instead of
   `%`, already done for speed). N=6 is ~1.9M neighbour-checks/generation,
   fine for a 220ms step interval; N=7 was deliberately left out of the
   `<select>` because it's ~4x that and the JS starts feeling laggy on a
   slow phone. If asked for bigger grids, move `step()` into a Web Worker
   (allowed same-origin per CLAUDE.md) so the UI thread doesn't stall during
   a slow generation — don't just raise the cap in the `<select>` and hope.
4. **A curated starting pattern or two** (a 5D analogue of a glider, if one
   is easy to hand-verify) instead of only "random fill" and "blank." Wasn't
   attempted this turn because verifying a pattern actually moves in 5D by
   hand, with no way to run the browser, felt likelier to ship something
   wrong than to ship nothing.

## Gotchas

- **242, not 80.** Early mental math error while planning: 3^5-1=242, easy to
  mis-estimate as "3^4*2" or similar — always compute `OFFSETS.length` from
  the actual generated array rather than hardcoding the neighbour count
  anywhere (the page does this via `els.neighTotal.textContent =
  OFFSETS.length`).
- **Wraparound must be per-dimension, not a single flat delta.** With 5
  independent toroidal axes you cannot precompute one flat index offset per
  neighbour and add it — the wrap has to happen per-coordinate (`nx = x+dx;
  if (nx<0) nx+=N; else if(nx>=N) nx-=N;` etc., done in `step()`) or corner
  cells alias into the wrong slice.
- **Rendering a slice does not require recomputing the simulation.** The
  full N^5 grid always exists in memory; `render()` only reads the plane at
  the current `viewV`. Don't be tempted to "optimize" by only simulating the
  visible slice — that would silently turn this into a 4D (or worse) CA
  wearing a 5D label, which is exactly the kind of shortcut this requester
  has called out before when found unannounced.
- Preset buttons use `data-b-min`/`data-b-max`/`data-s-min`/`data-s-max`
  attributes read via `.dataset.bMin` etc (browser auto-camelCases hyphenated
  data attributes) — keep that naming if you add more presets, and read them
  from `.closest('.presetBtn')` on a delegated click listener on
  `#presetList`, not per-button listeners, so a future preset just needs a new
  `<button>` in the markup and nothing in the JS.
- Untested in an actual browser by me (no network/shell in this sandbox);
  the harness screenshot pass is the first real look at layout and whether
  the default rule bands produce anything visually interesting rather than
  dying out or filling solid — if the screenshot shows a dead or saturated
  board, the first thing to try is nudging `birthMax`/`surviveMax` up or
  down a few points before assuming the engine is wrong.
