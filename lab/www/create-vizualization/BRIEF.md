# BRIEF — create-vizualization

## What this is

The requester asked for a visual explorer of the map
`z_{n+1} = (r + cos theta) e^{i theta} - c`, where `r = |z_n|`,
`theta = arg(z_n)`, and `c` is a real constant, with "multiple forms of
visualization." No specific paper or reference was named (unlike the
mathematical-knot request from the same requester, which cited an
energy-minimization method by name) — the ask was purely the formula, so
this build is my own choice of standard tools for exploring a real-parameter
complex map, not an implementation of anything specific.

Shipped, all in one turn, fully working:

1. **Orbit view** — pick z0 by typing coordinates, randomizing, or
   dragging directly on a complex-plane canvas; Play/Step/Reset; live
   readout of n, z_n, r, theta; a small time-series chart of |z_n| and
   Re(z_n) over the last 200 steps.
2. **Escape-time map** — the "fractal" view: colours every pixel of a
   plane region by how many iterations until |z_n| exceeds 8, black if
   still bounded at max iterations. Resolution/max-iter/half-width are
   adjustable. Clicking a pixel sends that point to the Orbit tab as z0.
3. **Bifurcation diagram** — sweeps c across a range, iterates a fixed
   z0=1+0i, and plots |z_n| past a discarded transient at each column.
   Clicking the diagram jumps the global c slider there.

All three share one global `c` control (slider + exact numeric input + a
row of preset values) so changing c updates every view coherently — the
fractal recomputes with a short debounce, the bifurcation diagram just
moves its marker line (recomputing the whole sweep is comparatively
expensive, so it stays a manual "Compute" button).

## Decisions

- **No Bluesky/kit.handleInput anywhere.** This task has nothing to do
  with a Bluesky subject — it's pure math — so only `tokens.css` and
  `kit.crumb()` are used from the kit. Don't add a handle box just because
  the kit has one; it wouldn't serve this page.
- **Escape radius fixed at 8** (bifurcation uses 8 for plot bounds, 24 for
  the "declare it diverged, stop iterating" cutoff). The map's growth is
  roughly linear per step (`|z_{n+1}| <= r + 1 + |c|`), so nothing here
  blows up to infinity in a way that needs bignum handling — plain
  doubles are fine for the iteration counts used (≤2000).
- **Bifurcation is a manual-compute tab, not live.** A 640-column x
  ~400-iteration sweep is cheap (tens of ms) but re-running it on every
  slider tick during a drag would visibly lag; the marker line is cheap
  and updates live instead, and a full recompute is one click away.
- **Canvas resolution is fixed pixel dimensions (not devicePixelRatio-
  aware)**, scaled to 100% width via CSS `aspect-ratio`. Simpler and fast
  enough; a next pass could sharpen it on high-DPI screens if it matters.

## The plan (not built yet, in priority order)

1. **Pan/zoom on the escape-time map.** Right now `half-width` is the only
   way to zoom, and it's always centered at the origin — there's no way to
   pan into an interesting region you spot at the edge of the current
   view. Add drag-to-pan (distinct from the current click-to-set-z0, which
   would need to move to a modifier-key or double-click) and scroll/pinch
   to zoom, recentering the half-width box on the gesture's midpoint.
2. **A "trace this orbit on the fractal" overlay** — draw the current
   Orbit tab's trail on top of the escape-time map so a visitor can see
   where a specific orbit sits relative to the escape/bounded regions it
   passes through. Needs the two views to share canvas coordinate math
   (already factored into `toCanvas`/`toComplex` on the Orbit side; the
   fractal tab computes its own pixel<->complex mapping separately and
   would need the same treatment).
3. **Multiple simultaneous orbits / basin coloring** — right now the
   escape-time map colors by iteration count only; a period-detection pass
   (cluster final points after transient, color by which cluster) would
   show basin structure more like a true Julia-set explorer, but needs a
   clustering step per pixel and is meaningfully more expensive.
4. Consider unifying `ORBIT_HALF` (fixed at 4) with the fractal's
   adjustable half-width, so the orbit view can also zoom out for orbits
   that leave the frame quickly.

## Gotchas

- The map has no singularity to guard against: `atan2(0, 0)` returns `0`
  in JS rather than NaN, so `z=0` iterates cleanly to `(1-c, 0)` — no
  special-casing needed, but worth knowing if you touch the `step()`
  function.
- `lab-content-gate.mjs` (read, not run — no shell in this sandbox) scans
  for XRPC method names via a regex that matches bare NSID-shaped strings
  anywhere in source, including comments/prose. This page makes zero
  network calls, so it's clean, but if a future pass adds any Bluesky
  fetch, re-read that gate file rather than guessing what's allowed.
- Couldn't run `node scripts/preflight.mjs` or the content gate myself —
  no Bash tool is exposed to this build agent (by design, per this repo's
  CLAUDE.md). Everything above is verified by manual re-reading of the
  gate source and the file, not by actually executing it.
