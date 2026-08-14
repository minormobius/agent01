# exhaustive-gallery — handoff

## What this is

Requested: "exhaustive gallery of elementary cellular automata. let the
user set the initial condition in one place & generate the whole gallery
in parallel from that. simulate like 50 steps for each automaton."

Shipped: a single 51-cell initial-row editor (drag/click to paint, plus
Single cell / Random / All on / Invert / Clear presets), and a grid of
all 256 rules (Wolfram's numbering, rule 0 through rule 255), each run
50 steps from that exact same row and redrawn instantly whenever the row
changes. One file, no dependencies, links `../_kit/tokens.css` and
`../_kit/kit.js` (used for `kit.crumb` only — no Bluesky calls, no
handle input, nothing this page needs a network for).

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

## The plan (not built yet, roughly in order)

1. **Keyboard access to the row editor.** Right now toggling a cell is
   pointer/drag only (`pointerdown`/`pointermove` on the editor canvas).
   The five preset buttons are fully keyboard-reachable, so the page
   isn't unusable without a mouse/touch, but painting an arbitrary custom
   pattern is. Add a hidden-but-focusable per-cell control, or arrow-key
   + space toggling with a visible cursor, driven off the same `row`
   array the pointer handler already writes to — `drawEditor()` and
   `scheduleRegenerate()` are already the right entry points to call
   after any change, whatever the input method.
2. **A width control**, if requested — see "Decisions" above for why it
   isn't here now. Would need the gallery canvases resized
   (`c.width = WIDTH`) and the editor's cell-index math already scales
   correctly since it works in fractions of the canvas's bounding rect.
3. **Optional: highlight/pin a single rule** (click a tile to see it
   larger, maybe with a per-row readout of the active neighbourhood
   rule). Gallery tiles are all independently addressable
   (`canvases[ruleNum]`), so this is additive, not a rewrite.

## Gotchas

- The editor canvas is NOT a 1:1 bitmap of the data (i.e. not "51 real
  pixels wide"). It's a normal-resolution canvas (sized to its CSS box
  via `devicePixelRatio`) with 51 rectangles drawn on it, and pointer
  position is read as a *fraction* of `getBoundingClientRect().width` —
  this is what makes painting work correctly at any screen size without
  needing to recompute pixel math on resize. If you change WIDTH, nothing
  else about this needs to change.
- The 256 gallery canvases, by contrast, ARE exact bitmaps: canvas
  backing store is literally `WIDTH × HEIGHT` pixels, scaled up via CSS
  (`aspect-ratio: 1/1`, `image-rendering: pixelated`). Don't add
  anti-aliasing or a display-resolution backing store to those — the
  crispness is the point and cheap `putImageData` calls are what keeps
  256-at-once fast.
- Regeneration is debounced through a single `requestAnimationFrame` flag
  (`scheduleRegenerate`), same pattern as `plot-all`'s `scheduleRender`.
  Necessary because pointer-drag painting fires many times per second;
  without the debounce you'd recompute all 256 rules per pointermove
  event instead of once per frame.
- Untested in a real browser by me (no network/shell here), but the
  harness screenshots it after this build — check that screenshot before
  assuming anything above is visually right, especially the editor's tap
  responsiveness on a narrow viewport.
