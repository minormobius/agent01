# BRIEF.md — for the next agent on site-2 ("No Through Line")

## What this is

A colleague's proposal (see the task's "no-through-line" concept, seeded from a
paper on general position sets in strong graph products) reached this
requester as "build that" on a factory advert. The paper's core claim: take a
graph H, stack `s` copies of it into a bundle shaped like a path (the strong
product `H ⊠ P_s`), and the largest "general position set" you can fit — a set
of vertices where no member sits on a shortest path between two other members
— is always exactly `2·gp(H)`, for every `s ≥ 2`, no matter how deep the stack
goes. That's the surprise the page is built to demonstrate, not just state.

Turn one shipped a flat SVG grid, fully working. Turn two replaced that
rendering with a real three.js 3D cylinder, per an explicit follow-up request:
*"Oh the graph is a cylinder isn't it, can you render it as a cylinder with
three js and retain the manipulation?"* — the requester spotted that
`C_5 ⊠ P_s` is literally a cylinder (a cycle stacked along a path) and wanted
the picture to say so, not just the math.

Turn three (this one) answered: *"When one path becomes illegal show a
highlighted connection route that kills it, make that judging explicit you
see"* — a red dot alone didn't say *why* it was red. `refresh()` now also
collects, for every violating vertex `m`, the pair `(a, b)` whose shortest
path it landed on (deduped by an unordered-pair-plus-`m` key, since the
triple loop finds each violation from both `(i,j,m)` and `(j,i,m)`), and draws
a straight highlighted red `a→m→b` line in 3D for each one, in a
`violateLineGroup` that lives outside `group` so it survives `build3D()`'s
full teardown on every slider move. The status line (already `aria-live`) now
also names one example route in words — "(h·,ℓ·)–(h·,ℓ·) is a shortest path,
and (h·,ℓ·) sits right on it" — so a screen-reader user gets the same judgment
a sighted one reads off the highlighted line.

What's shipped now:

- `H` fixed to `C_5` (a 5-cycle). The whole `H ⊠ P_s` bundle renders as a real
  3D cylinder in three.js: 5 columns of dots wrapped around a translucent tube,
  `s` levels stacked along its axis, `s` adjustable 2–6 via a slider.
- Real distance computation, unchanged from turn one: `d_H` via the
  cycle-distance formula, `d_path` via `|a-b|`, combined as
  `max(d_H, d_path)` — the exact theorem for strong products, not a
  geometric/pixel proxy.
- `gp(H)` is computed live, by brute force over all 32 subsets of `C_5` — same
  as turn one, untouched.
- Click a dot (via raycasting against the sphere meshes) to toggle it into
  your working set. Any dot that lands on a shortest path between two other
  selected dots turns red *live* — the mechanic is retained exactly, just
  picked in 3D instead of via an SVG hit-rect.
- **The manipulation is retained and extended**: drag the canvas to orbit the
  camera around the cylinder (hand-rolled spherical-coordinate orbit — no
  OrbitControls addon is vendored in the kit, so this is written from scratch:
  `theta`/`phi`/`camRadius`, updated from pointer deltas), mouse wheel to
  zoom (pinch-zoom on touch is NOT implemented — see plan item 0), arrow keys
  to orbit when the canvas has focus. A drag-vs-click
  threshold (4px of pointer movement) decides whether a pointer gesture
  rotates the view or raycasts a selection — otherwise every click-to-select
  would also spin the tube a few degrees.
- The slider changes `s` but the displayed ceiling `2·gp(H)` never moves —
  unchanged from turn one.
- Copy-image button now rasterizes the live WebGL canvas directly
  (`renderer` built with `preserveDrawingBuffer: true`, `canvas.toBlob` reads
  the actual last-rendered frame) rather than an SVG-to-canvas conversion,
  per this requester's standing "big shiny copy button on any diagram"
  preference (see `lab/_profiles/minormobius.bsky.social.md`).
- Leaderboard via the visitor's own repo (`labPds`): unchanged from turn one.
- **New accessibility fallback**: a collapsed `<details>` below the canvas
  ("keyboard / screen-reader alternative") holds one 44px button per vertex,
  wired to the same `toggle()` function, so a visitor who can't drag/raycast
  (keyboard-only, screen reader, no pointer) can still play the actual game.
  The 3D canvas itself is not independently screen-reader-operable — raycasting
  has no accessible-name-per-hit-target the way the old SVG's `role="button"`
  vertices did.

## Decisions

- **The killed-route line is a straight guide between the two endpoints and
  the offending dot's world position — not a walk along drawn graph edges.**
  It can't be: the strong product's diagonal edges aren't drawn (see below),
  and even the two edge types that are drawn don't generally form a straight
  chain through a violating point in 3D space. Drawing the true edge-path
  would need real BFS reconstruction (parent pointers, not just the distance
  formula) and would still zig along drawn edges rather than reading as one
  clean "route." A straight line answers the actual question — *which three
  points, and which one is between the other two* — honestly, and the page
  copy says explicitly that it's a guide between points, not a literal edge
  path.
- **Only the first violation route is spelled out in the status text; all of
  them get a 3D line.** With several violations at once, naming every route
  in one `aria-live` sentence would be unreadable. The text says "(+N more
  routes)" rather than pretending there was only one.
- **`H` is fixed to `C_5`, not selectable, this turn.** The pitch's own "turn
  one" scope was explicitly "a small fixed case (P_3 boxed with C_5)" — I
  read "P_3 boxed with C_5" as `C_5 ⊠ P_s` with `s` starting at 3 (the
  slider default), not literally locking `s=3` forever, since the whole point
  is showing the ceiling doesn't move as `s` varies.
- **Diagonal strong-product edges are still not drawn.** `H ⊠ P` has edges for
  `(a=b, i~j)`, `(a~b, i=j)`, AND `(a~b, i~j)` (the diagonal case). Drawing
  all three would still be a tangle in 3D, arguably worse than in 2D. The
  distance function does NOT skip them — `max(d_H, d_path)` is the correct
  closed-form distance for the *whole* strong product regardless of which
  edges get drawn, so the violation-checker is exact even though the picture
  only shows two of the three edge types. Said explicitly in the page copy so
  nobody mistakes the drawing for the whole graph.
- **The cylinder is drawn as a true pentagon prism (straight chords), not a
  smooth circular tube with curved cycle-edges.** `C_5` only has 5 vertices, so
  the "cycle edge" between consecutive `h` really is a straight segment on the
  actual graph; a smooth arc would be decoration, not the graph. A separate
  translucent `CylinderGeometry` (48 radial segments, `openEnded`, low-opacity,
  `depthWrite: false`) sits behind the pentagon purely as a visual guide so the
  "this is a cylinder" reading lands immediately, without pretending it's part
  of the drawn graph.
- **Wraparound is now free, and that's the actual payoff of this turn's
  request.** Turn one had to draw the `h=4 → h=0` cycle edge as a dashed bowed
  arc on the flat grid to signal "this wraps." On the cylinder it's just the
  pentagon closing on itself — same code path as every other cycle edge, no
  special case, no dashed styling. The page copy calls this out explicitly
  since it's the concrete thing "demos the effect better" than the flat
  version did.
- **No OrbitControls addon — camera orbit is hand-rolled.** The kit's three.js
  vendoring is core-only (r169, no examples/addons), so dragging the canvas
  updates `theta`/`phi` in spherical coordinates directly and calls
  `camera.lookAt(0,0,0)` on every move, rather than importing a controls class
  that doesn't exist here. A drag-vs-click threshold (4px) on pointerdown/up
  is what keeps this from fighting the raycasting click-to-select.
- **No BFS over an explicit adjacency list.** Since H is a cycle and the
  stacking factor is a path, both have closed-form distances
  (`min(|a-b|, n-|a-b|)` and `|a-b|`), and the strong-product distance
  theorem (`max` of the two) is exact for any two connected graphs — so this
  isn't a shortcut/approximation, it *is* the real shortest-path computation,
  just via the closed forms instead of a generic BFS. If `H` ever becomes
  visitor-selectable (see below) and isn't a cycle or path, swap in real BFS
  over `H`'s adjacency list; the `max(...)` combination step doesn't change.
- **Slider capped at s=2–6**, not "up to a thousand" as the pitch's prose
  imagines. Each vertex needs a genuine ~44px tap target on a 360px-wide
  phone screen; 5 rows × 6 columns of 44px cells is about as far as that goes
  without triggering horizontal scroll. Said in the page copy rather than
  silently shipping a smaller range than the paper's claim.
- **Selection is never blocked.** Clicking a vertex that would violate general
  position still selects it (and turns it red) rather than refusing the
  click — matches the pitch's "highlight live any triple," and lets a visitor
  see *why* something breaks instead of being told no.
- **"Best clean set so far" is session-local (a JS variable), not persisted
  to localStorage.** It resets on reload. Saving to the repo (via the save
  button) is the durable path, and that's the one that's meant to survive.

## The plan — what's not built yet, in the order I'd do it

0a. **A busy selection can draw many overlapping red lines at once** — with,
   say, 15 selected dots and several triples violating, `violateLineGroup`
   fills with segments that can visually clutter the tube. Not tested against
   a real dense case (reasoned through, not screenshotted at that density).
   If the harness report shows a tangle, the fix is probably: only draw the
   route(s) for the *most recently toggled* vertex rather than every
   violation in the current selection, so the highlight tracks "what did my
   last click break" instead of accumulating everything at once.
0. **Pinch-to-zoom on touch is not implemented.** Zoom currently only responds
   to `wheel` (mouse/trackpad) and the single-pointer drag rotates but never
   zooms. A phone visitor can rotate fine but cannot zoom at all right now —
   this is a real gap for "opened on a phone," not a nice-to-have. Fix: track
   two active pointers by id in the existing `pointerdown`/`pointermove` map,
   and when a second pointer is down, use the change in inter-pointer distance
   to drive `camRadius` instead of the single-pointer rotate path. Should be a
   short addition to the existing pointer handlers, not a rewrite.
1. **The keyboard/screen-reader fallback (`<details>` grid of buttons) works
   but is plain** — no visual echo of which one your focus is on relative to
   the 3D view, and it's a flat list rather than reflecting the cylinder's
   shape. Good enough to actually play the game non-visually; a nicer version
   would sync a highlight ring on the 3D dot when its matching button has
   focus.
2. **Let the visitor choose H.** Right now it's hardcoded to `C_5`. The
   natural next step: a small picker (C_4, C_5, C_6, maybe a path P_4 or a
   small tree) that swaps in a real adjacency-list BFS for `d_H` instead of
   the cycle closed-form, and recomputes `gp(H)` and the target live. This is
   the single highest-value addition — it's what turns "one fixed demo" into
   "the general mechanic the paper is actually about."
3. **Small-cycle stacking (the paper's other result).** The brief mentions
   "exact values when the stacking graph is a small cycle instead of a
   path" — i.e. `H ⊠ C_k` instead of `H ⊠ P_s`. That changes `d_path` to
   `d_cycle` for the stacking dimension too. Geometrically this turns the
   open-ended cylinder into a torus (the top level wraps back to level 0), so
   the vertical struts closing that loop would want the same
   no-special-casing treatment the pentagon rings already get — one more
   `LineSegments` connecting level `s-1` back to level `0`, same shape as the
   `h`-wraparound. The ceiling is no longer flat `2·gp(H)` in this case — the
   brief says the paper gives exact values, not a single constant, so this
   needs the actual formula from the paper (not fetched — no network here —
   so this needs the paper's text pulled in a future turn) or another
   brute-force verification pass for small cases.
4. **The counterexample to gp multiplying across `C_m □ C_n`** (Cartesian,
   not strong, product) is mentioned in the pitch as a paper finding but is a
   genuinely different product operation from what this page builds — it
   would be a separate small demo, not a mode of this one. Lowest priority;
   flag to the requester rather than silently building it into the same page.
5. **Persist "best clean set" across reloads** in localStorage per-`H`
   (keyed by `H`'s identity once #2 lands), so switching `s` and reloading
   doesn't lose progress before someone decides to sign in and save.
6. **Pinch-zoom** — see item 0 above; listed last only because it was
   discovered/written up last, not because it matters least. Do this early in
   the next turn if the requester is testing on a phone, which this requester
   does (see profile).

## Gotchas

- **`violateLineGroup` is a child of `scene`, not of `group`.** `build3D()`
  does `while (group.children.length) group.remove(...)` on every slider
  move, and if the route-highlight group were nested inside `group` it would
  get torn down and never rebuilt (nothing re-adds it after that loop).
  Keeping it a sibling means `refresh()` — which runs after every `build3D()`
  and every `toggle()` — is the only thing that ever touches it, so its
  lifecycle is one function, not two racing ones.
- **`build3D()` must run after `const store = labPds()` is declared, not
  before** — same shape of bug turn one hit with the SVG `build()`.
  `build3D()` calls `refresh()` synchronously, which calls `updateSaveBtn()`,
  which reads `store.user()`. Kept the fix from turn one: `store` and the
  DOM lookups `updateSaveBtn` touches are declared above the `build3D()` call,
  not below it.
- **`CylinderGeometry` is oriented along Y by default** — no rotation needed,
  which is convenient since the stacking axis (`l`, the path direction) is
  mapped to world-Y here. If a future turn changes which axis stacks (e.g. to
  free up Y for something else), remember the guide mesh needs an explicit
  rotation then; right now it doesn't because the mapping happens to line up.
- **`canvas.toBlob` on a WebGL canvas needs `preserveDrawingBuffer: true`** on
  the `WebGLRenderer`, or the copy button can silently grab a blank/garbage
  frame depending on when the browser's implicit buffer-clear-on-composite
  happens relative to the click handler. Set once at renderer construction;
  cheap for a diagram this small, don't skip it if the renderer ever gets
  rebuilt.
- **Reading `--accent`/`--bg`/etc. via `getComputedStyle(document.documentElement)`
  at module-script-run time is a pre-existing pattern from turn one** (the old
  copy button read `--bg` the same way), not something new this turn
  introduced — but it's still technically a race against the `tokens.css`
  `<link>` finishing its fetch. Hasn't caused a visible bug across two turns;
  if colors ever come out wrong/default-looking, this is the first place to
  check. Hard-coded fallback hexes (matching `tokens.css`'s literal values) are
  in place as a backstop either way.
- **Drag-vs-click threshold is 4px of pointer movement.** Too low and a
  slightly shaky click on mobile gets read as a drag (nothing gets selected,
  confusing); too high and small deliberate drags fail to rotate. 4px was
  chosen but not tuned against a real touchscreen — this is a first place to
  adjust if the harness screenshot or a future report says clicking feels
  unreliable.
- Did not test in an actual browser (no network/shell in this sandbox) — the
  harness screenshot pass is the first real look at whether the raycasting
  hit targets (0.26-unit sphere radius) are actually easy to tap on a rendered
  cylinder at the default zoom, and whether the WebGL context initializes
  under the production CSP (`'wasm-unsafe-eval'` is on for wasm, but this is
  plain WebGL2 via `<canvas>`, which needs no CSP allowance beyond the script
  itself running — should be fine, reasoned through rather than observed).
