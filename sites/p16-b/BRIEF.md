# exhaustive-gallery

## What this is

The ask: an exhaustive gallery of elementary cellular automata — one shared
initial condition, the whole gallery generated from it, ~50 steps each. This
shipped complete in one turn: `index.html` is a single static page with no
backend and no ATProto involvement (there's nothing to store — the initial
row is transient page state, not a save-worthy artefact).

The page has one editable strip at the top (click/drag to paint cells — 0/1,
wraps at the edges) plus width and step-count controls, and below it a grid
of all 256 possible elementary CA rules (rule numbers 0–255, the full 2^8
neighbourhood-to-output table), each rendered as its own small space-time
diagram computed fresh from that one row. Changing the row, width, or step
count regenerates all 256 canvases immediately. Clicking a tile opens a modal
with a bigger render, the rule's 8-bit code, and its actual neighbourhood→
output truth table (111 down to 000) — so it's not just a picture, you can
read the rule that produced it. A handful of famous rules (30, 90, 110, 184,
etc.) get a starred tooltip naming why they're notable.

## Decisions

- **"In parallel" read as "simultaneously, side by side" not "on separate
  threads."** Simulating 256 rules × ~81 cells × 50 steps is well under a
  million cell updates — trivial for synchronous JS, done in a few
  milliseconds. I did not reach for Web Workers; there is no perceptible
  benefit and it would only add message-passing complexity. If a future
  request pushes width/steps much higher (say, width 500+, steps 500+) and
  the UI starts to visibly stutter while painting, that's the point to
  revisit — split rule computation across a handful of workers, one per
  chunk of rules, and gather ImageData bitmaps back on the main thread.
- **Wrap-around (toroidal) boundary**, the standard choice for elementary CA
  galleries — stated plainly in the on-page copy so it doesn't read as an
  unstated approximation.
- **Width is a fixed set of preset options (41–161)**, not a free-form number
  input, to keep the grid layout and the click-to-paint strip predictable
  at every size and avoid a giant recompute on every keystroke.
- No sign-in, no `pds.js`. There's genuinely nothing here worth persisting
  to a visitor's repo — the initial row is a toy to play with, not a
  document. If a later ask wants to save/share a specific seed, that's a
  small addition (encode the row + rule filter into the URL hash, or use
  `store.save` for named presets) — see THE PLAN.

## The plan (not built yet, in order)

1. **Shareable seeds via URL.** Encode width + the init row (as a bitstring)
   + step count into `location.hash` on change, and parse it on load. Cheap,
   no backend, and it's the most obvious next ask ("send me the seed that
   made rule 110 do that").
2. **Sort/group toggle.** Right now the grid is just rule 0→255 in order.
   Wolfram's four informal classes (uniform / periodic / chaotic / complex)
   aren't computed anywhere — they're just my hardcoded `NOTES` on a dozen
   famous rules. A real classifier (e.g. measure entropy of the last N rows,
   or cluster by a simple activity/periodicity heuristic) to let visitors
   sort by "most chaotic first" would be the natural next technical step,
   matching the site's own "genuinely compute it" spirit rather than relying
   on folklore.
3. **Two-neighbour-radius or totalistic variants** as a second tab, if asked
   — elementary (radius-1, 2-state) is only the smallest case of a much
   larger rule space; the sim core (`simulateRule`) generalizes easily to
   larger neighbourhoods, just swap the rule-table indexing.

## Gotchas

- Canvas pixels are written via `ImageData` (raw RGBA buffer), not
  `fillRect` per cell — with 256 canvases redrawing on every drag-paint
  frame, per-cell `fillRect` calls were visibly the wrong order of
  magnitude slower in earlier testing-by-inspection; `putImageData` once per
  canvas is the only way this stays instant while painting.
- The live/dead colours are read from the kit's CSS custom properties
  (`--accent`, `--bg`) at load time via `getComputedStyle`, not hardcoded —
  canvas pixels can't reference a CSS variable directly, so there's a small
  `hexToRgb` parse. If the kit's palette changes shape (e.g. `--accent`
  becomes an `hsl()` string instead of hex), this parse silently falls back
  to white-on-black — worth a glance if the gallery ever looks wrong after
  a kit update.
- Steps input has no debounce delay tuning beyond a flat 40ms timer shared
  with the paint-drag path — fine at current scale, but if width/steps grow
  a lot (see plan item 1's "the point to revisit"), that timer is the first
  thing to widen.
