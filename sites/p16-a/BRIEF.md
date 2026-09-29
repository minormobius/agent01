# exhaustive-gallery — handoff

## What this is

Requester asked for "exhaustive gallery of elementary cellular automata. let
the user set the initial condition in one place & generate the whole gallery
in parallel from that. simulate like 50 steps for each automaton."

Read literally, in order:

1. Exhaustive — all 256 elementary CA rules (Wolfram's rule numbering, 3-cell
   neighbourhood, 2 states), not a curated subset.
2. One shared initial-condition control, not 256 separate ones.
3. The whole gallery regenerates together from that one control ("in
   parallel" — read as "all 256 update together from one source", not
   literal multithreading; see DECISIONS).
4. ~50 simulation steps per automaton, by default.

Shipped: a paintable initial-row strip (click, drag-paint, and arrow+space
keyboard) plus width/steps/wrap-edges controls; all 256 rules rendered as a
canvas grid below, recomputed on every change to the shared row; click any
thumbnail for an enlarged view with its 8-pattern rule table. All 256 are
real, live-computed simulations — nothing precomputed or sampled.

## Decisions

- **"In parallel" is one shared source fanning out to 256 renders in one
  pass, not Web Workers.** The actual compute is tiny — worst case (width
  151, steps 200) is ~30M cell updates across all 256 rules, plain bitwise
  ops, well under a frame budget in practice. Workers would add message-passing
  overhead for no visible benefit and complicate the single-file constraint.
  If a future ask wants width/steps far larger, that's where to revisit —
  split the 256 rules across `navigator.hardwareConcurrency` workers, each
  owning a canvas-sized `Uint8Array` and posting back an `ImageBitmap`.
- **Canvas + ImageData, not 256 individual `fillRect` calls.** Each rule
  paints its grid as one `putImageData` call; visual scaling is done with
  CSS (`width:100%`, `image-rendering:pixelated`) rather than recomputing
  pixel sizes on resize, so the grid is responsive for free.
- **Wrap-edges defaults on** (toroidal boundary) because a fixed-width strip
  with hard edges makes several rules (e.g. 90) look asymmetric/broken near
  the border in a way that has nothing to do with the rule itself. Toggle is
  exposed rather than hidden, since it changes the picture non-trivially.
- **Width forced odd.** The "single cell" preset needs a true centre; an even
  width has no centre pixel. The number input snaps to odd on change.
- **A handful of well-known rules (30, 90, 110, 184, 54, 60, 150, 250) get a
  one-line caption** (chaotic / Sierpinski / Turing-complete / traffic-flow /
  etc.) so the gallery reads as informative rather than 256 identical grey
  boxes. This is decoration, not a subset — all 256 still render and are
  equally clickable.
- **No kit.handleInput / no Bluesky calls at all.** This site has no
  handle-shaped input and nothing about a specific account; pulling in the
  typeahead or `bskyGet` would be dead weight. Kit is used only for
  `tokens.css`, `kit.crumb`, and `kit.showError` on bad numeric input.

## What was verified (in a real headless browser, production CSP)

- Full page loads at 1280×800, no console errors, gallery renders all 256
  distinct rule thumbnails on load with the default single-centre-cell row.
- Rule 90 from a single seed cell renders a clean Sierpinski triangle; rule
  110 and rule 30 look correct against their known shapes — the simulation
  itself is right, not just "a picture appears."
- Clicking a thumbnail opens the modal with the correct rule number, an
  enlarged render, and an 8-cell rule table that matches that rule's binary
  expansion (checked rule 30 and rule 4 by hand against the table shown).
  Escape closes it and returns focus to the card that opened it; the visible
  close button (44px) also closes it, including on a 390px mobile viewport.
- Dragging across the initial-condition strip paints a run of cells and the
  whole gallery regenerates from the new row.
- Changing width (including an even number, e.g. 40) snaps to the nearest
  odd value and resizes the row from its centre; changing steps and
  re-checking wrap-edges both regenerate the gallery correctly.
- 390×844 mobile viewport: two-column grid, no horizontal scroll, controls
  wrap onto their own lines, tap targets are full-size buttons.
- Keyboard editing: focusing the strip shows a visible focus ring, arrow keys
  move the cursor and space toggles a new live cell at the right position.

Not verified: behaviour at the very top of the width/steps range (151 / 200),
which should just be slower per-frame but wasn't timed.

## The plan (not done yet, in order)

1. Consider adding a "random rule of the day" / permalink (`?rule=30&w=63`)
   so a specific configuration is shareable — nobody asked for it, but it's
   the natural next feature for a gallery like this.
2. Consider a play/pause on the *initial-condition* step count so a visitor
   can watch one rule animate rather than only seeing the full static
   history — currently every rule shows its whole history at once (rows =
   generations), which is the standard way to present an elementary CA and
   was chosen over an animated single-row view because it makes all 256
   comparable at a glance, at the cost of not showing motion.
3. The rule-table in the modal shows the 8 input→output patterns but not the
   rule's Wolfram class (I/II/III/IV) — that classification is fuzzy/manual
   for many rules and was deliberately left out rather than asserting a
   classification that would need a citation to be honest about.

## Gotchas

- `putImageData` needs a real `Uint8ClampedArray`-backed `ImageData`; building
  the RGBA buffer by hand and indexing `idx*4` off-by-one is the easy way to
  get a shifted/garbled image — worth double-checking against a known rule
  (90 from a single centre cell should look like a clean Sierpinski triangle)
  after any change to the paint path.
- Colours are read from the CSS custom properties (`--accent`, `--bg`) at
  load time via `getComputedStyle`, not hardcoded, so the canvas stays in
  sync if the kit's palette ever changes — but that also means they're read
  *once*; a page that changed `--accent` live (it doesn't, today) would need
  a re-read.
- Canvas resolution is set to exactly `width` × `steps+1` logical pixels and
  stretched with CSS `image-rendering:pixelated` — do not add per-cell
  `fillRect` scaling, it was tried mentally and discarded as far slower and
  unnecessary for a responsive grid.
