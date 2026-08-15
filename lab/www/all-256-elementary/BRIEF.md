# exhaustive-gallery — handoff

## What this is

Original request: "exhaustive gallery of elementary cellular automata. let
the user set the initial condition in one place & generate the whole
gallery in parallel from that. simulate like 50 steps for each automaton."

Follow-up request (this turn): "instead of just one rule per simulation
there should be an ordered pair of 2 rules, and at each step the automaton
should alternate between its two rules. squaring the # of sims. don't try
to be clever about perf. do it straightforwardly & i'll tell u if it makes
my computer cry."

Shipped, turn 1: a single 51-cell initial-row editor (drag/click to paint,
plus Single cell / Random / All on / Invert / Clear presets), and a grid of
all 256 rules run 50 steps from that row.

Shipped, turn 2 (this one): the gallery is now every **ordered pair** of
rules, 256 × 256 = 65,536 tiles, one canvas each. Each automaton alternates
rule A on odd steps (1, 3, 5, …) and rule B on even steps (2, 4, 6, …),
computed in `computeAndDraw(pairIdx, ruleA, ruleB)` — `ruleNum = (y % 2
=== 1) ? ruleA : ruleB` inside the same row-by-row loop as before. Tile
label reads "A → B". Everything else (editor, presets, debounce, black-on-
white rendering, wraparound boundary) is unchanged. Did this literally —
same architecture as the single-rule version, just nested the rule loop —
per the explicit "don't be clever" instruction, so no virtualization, no
Web Workers, no offscreen-tile skipping, no lazy DOM.

## Decisions

- **Width fixed at 51 cells, steps fixed at 50, no sliders for either.**
  ponder's own profile shows a repeated pattern of preferring fewer knobs
  once the shape of the thing is settled (see the Newman-polynomial
  iteration: sliders got *removed*, not added, once the ask was clear).
  "50 steps for each automaton" was explicit in the request, so that one
  isn't really a choice — but width could have been a slider and I left
  it fixed to match that standing preference. If they ask for a wider
  or narrower gallery, that's a one-line change (the `WIDTH` constant).
- **"in parallel" read as "all 256 computed from one shared row and shown
  together," not literal Web Workers.** The whole computation is ~665k
  cell updates (256 rules × 51 × 51), which is sub-frame in plain JS —
  spinning up workers would add real complexity (message passing,
  transferable buffers) for zero user-visible benefit at this size. If a
  future ask pushes width/steps much higher (hundreds of cells, thousands
  of rows), *that's* when workers earn their keep — not before.
- **Periodic (wraparound) boundary**, the standard choice for elementary
  CA when you're not trying to show edge effects specifically. Said so
  explicitly in the on-page copy rather than leaving it implicit.
- **Black-on-white per-tile rendering**, not the kit's dark palette,
  inside each canvas — matches the classic Wolfram rule-plot look and
  echoes the "black points on white" preference from the Newman-polynomial
  site in ponder's profile, even though that request was about a
  different kind of plot. The page chrome around the tiles stays on the
  kit's dark theme.
- **Default initial state is a single centred cell**, not random or
  blank — that's the canonical starting point (e.g. rule 90 only reads as
  a Sierpiński triangle from a single seed), so the gallery is meaningful
  on first load before anyone touches the editor.
- **Alternation starts with rule A on step 1**, not rule B, and step
  parity is keyed off the *target* row index `y` (odd `y` = A, even `y` =
  B) rather than a separate counter — one less piece of state, and it
  falls naturally out of the existing `for (y = 1; y < HEIGHT; y++)` loop.
  No settings for "start with B instead" or "alternate every N steps" —
  wasn't asked for, and the request said not to get clever.
- **Did not build any perf mitigation** (virtualized/lazy tiles, a
  "compute only visible" mode, Web Workers, downsampled preview canvases)
  even though 65,536 canvases + 65,536 cached `ImageData` objects
  (51×51×4 bytes each ≈ 650 MB of retained image data alone, before canvas
  backing stores and ~200k DOM nodes) is a real amount of memory and a
  real multi-second synchronous block on load and on every row edit. This
  was explicit: "don't try to be clever about perf... i'll tell u if it
  makes my computer cry." Left a warning in the on-page copy instead of
  silently degrading anything.

## The plan (not built yet, roughly in order)

1. **If it made their computer cry**, the fix is virtualization: only
   build/compute canvases currently in or near the viewport
   (`IntersectionObserver`), recycling a small pool of real canvases and
   drawing placeholders for the rest — NOT reducing WIDTH/STEPS/rule
   count, since the ask was for all of it. `imgData` cache would need to
   move from "one per pairIdx forever" to "one per visible tile,
   evicted on scroll" to actually recover the memory.
2. **Keyboard access to the row editor.** Still not done — toggling a
   cell is pointer/drag only (`pointerdown`/`pointermove` on the editor
   canvas). The five preset buttons are fully keyboard-reachable. Add a
   hidden-but-focusable per-cell control, or arrow-key + space toggling
   with a visible cursor, driven off the same `row` array the pointer
   handler already writes to.
3. **A width control**, if requested — see "Decisions" above for why it
   isn't here. Would need the gallery canvases resized (`c.width =
   WIDTH`) and the editor's cell-index math already scales correctly.
4. **Optional: highlight/pin a single tile** (click to see it larger,
   with a readout of which rule is active at each step). Tiles are all
   independently addressable (`canvases[a * 256 + b]`), so this is
   additive.

## Gotchas

- The editor canvas is NOT a 1:1 bitmap of the data (i.e. not "51 real
  pixels wide"). It's a normal-resolution canvas (sized to its CSS box
  via `devicePixelRatio`) with 51 rectangles drawn on it, and pointer
  position is read as a *fraction* of `getBoundingClientRect().width` —
  this is what makes painting work correctly at any screen size without
  needing to recompute pixel math on resize. If you change WIDTH, nothing
  else about this needs to change.
- The gallery canvases, by contrast, ARE exact bitmaps: canvas backing
  store is literally `WIDTH × HEIGHT` pixels, scaled up via CSS
  (`aspect-ratio: 1/1`, `image-rendering: pixelated`). Don't add
  anti-aliasing or a display-resolution backing store to those — the
  crispness is the point.
- Regeneration is debounced through a single `requestAnimationFrame` flag
  (`scheduleRegenerate`), same pattern as `plot-all`'s `scheduleRender`.
  Necessary because pointer-drag painting fires many times per second;
  without the debounce you'd recompute all 65,536 pairs per pointermove
  event instead of once per frame — and each of those recomputes is now
  ~256× the single-rule version's cost, so a drag that felt instant before
  may visibly lag now. That's the "computer cry" risk, by design, per the
  request.
- **Pair index is `a * 256 + b`**, `a` = rule A (odd steps), `b` = rule B
  (even steps). `canvases[a * 256 + b]` and `imgData[a * 256 + b]` — if you
  change WIDTH/STEPS/anything else, this indexing doesn't need to change,
  but if you ever add a "skip symmetric pairs" optimization, remember
  `(a, b)` and `(b, a)` are genuinely different automata (different
  starting rule), not duplicates, so there's nothing to dedupe there —
  only `a === b` tiles (256 of them) match the single-rule behaviour.
- Untested in a real browser by me (no network/shell here), but the
  harness screenshots it after this build — check that screenshot before
  assuming anything above is visually right. Watch specifically for
  whether the page actually finishes rendering/computing in reasonable
  time, and whether the tab shows memory pressure — that's the thing most
  likely to have gone wrong given the scale and the "don't be clever"
  instruction.
