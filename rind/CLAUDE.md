# rind — CLAUDE.md (the STRUCTURE wing)

You are working on **rind**, the structure wing of the O'Neill cylinder modelling package.
Read `rind/README.md` first — this file is the operational quick-reference.

## What rind is

The foam **space-frame shell** of an infinite O'Neill cylinder, plus the Rust/WASM **frame
solver** that scores it. Three browser tools over one structural pipeline (generate foam in
JS → emit a frame model → solve for stress):

- `cylinder.html` — structural + radiative scratchpad; sizes the shell, live stress play-slice.
- `foamview.html` — 3D read of the layered foam (orbit, radial probe, solved member forces),
  plus wayfinding: a drivable spiral ramp → azimuthal road → ramp route through the chamber
  graph (`wayfind.js`, certified by `test/wayfind.selftest.mjs`).
- `walk.html` — first-person walk through a planar cut of the foam.
- `ops/` — **the production weave** at `rind.mino.mobi/ops/`. **`ops/index.html` is the LANDING HUB** — a card
  index of every ops view (link here first; it's what `/ops/` serves). **The primary 3D view is `orbit.html`**
  (`3d-app.js`, kernel `foam3d.js`) — moved off `index.html` when the hub was added: the weave resolved in a
  **volumetric voronoi foam PANCAKE** — a wide, thin,
  **two-layer** disc, woven from **counter-rotating spirals**. 6 white arms spiral from the **upper-centre** hub,
  8 production from the **lower-centre** hub (the six starts sit ABOVE the eight); upper/lower layer = over/under;
  the hubs are joined only by threading the woven body. Counter-rotation ⇒ K(6,8). Two reads: **orbit** (the
  woven pancake) and **inhabit thread** — *the mapping tech*: pick a white arm and the disc UNROLLS around it
  (your arm = a straight spine centre→rim, the 8 production arms slant across and cross it at numbered stations;
  the other whites are parallel verticals; reselect → the map re-organises) · and **museum map** — the
  **wayfinding** toy: the two layers explode apart, click two chambers and a route threads doors and climbs
  **stairs** (each stair = crossing the weave), pinch/scroll to zoom. The 6 white roles are **two per faction**
  (Rindwalker · Continuant · Drift — the nave's three lobes + verbs) for **representation**. **Wayfinding is the
  validation endpoint**: `wayfind.js` `certify()` proves the whole construction navigable AND that the white hub
  → production hub route is *forced through the weave* (≥1 stair, never a direct shaft) — pinned over 30 seeds by
  `wayfind.selftest.mjs`. **Click any chamber → its generated ROOM** (`chamber.js`): the voronoi cell becomes walls (structural edges) with **doors as mid-wall gaps that
  never cut a corner column** (the rind rule: doors open plates, not edges), a fixture (ops console / process
  machine / hub), and a **stair to the other-layer partner = the white×production facility** (the K(6,8) contact
  made architectural) — except the two hubs, which get no stair so they stay disconnected. A weave-cell is a
  **hexagon of chunks** — `foam3d`'s `rings` param (the `⬡ chunks` button) cuts it into a **centered-hexagonal
  number** (1·7·19·37, `3n²+3n+1`); a bigger cell gets more windings. **`onedoor.html`/`onedoor-app.js`** (kernel `onedoor.js`) is the **one-door endpoint**: it re-poses the *same* prism
  weave as **two door-free concourses** (6 white arms + nave hub · 8 production arms + bottom hub) joined only by the
  48 zero-grade K(6,8) doors — so **any room → any room is ≤1 door, including the hubs**, proven by
  `onedoor.selftest.mjs` (the per-thread graph in `cells3d` only reaches "≈1 door", max up to 4, because same-colour
  arms never cross; the concourse layer fixes it by construction). It runs over **two substrates** (the `▦ HCP / ✳
  on-curve` toggle): the HCP lattice claimed by the watershed, and **on-curve** (`curveseed.js`) — nuclei seeded
  ALONG the analytic thread curves, then polyhedra grown to fill; on-curve lands the full K(6,8)=48 with every door
  zero-grade. **Per-spiral Voronoi continuity is an OWNERSHIP property** (`◐ watershed / ◑ nearest`): nearest-nucleus
  gives 0/14 continuous (sliced at every crossing; more hexes makes it WORSE), so the default re-owns curve nuclei by
  the geodesic **watershed** (`layWeave`) ⇒ 14/14 spirals continuous + K≈45–48 + at-grade + one-door together
  (`certify.spiralsContinuous`). Concourses connected by hard-bind+matrix-flood when continuous, else the hub-flood.
  **`nexus.html`/`nexus-app.js` is the FIRST-PERSON navigator (proto)**: you are the `@` on ONE thread — its own
  chambers strung along its curve into a walkable surface, walled but for its doors + the nexus; start at the white
  nexus, walk an arm, and crossing a door re-centres the whole map on the crossed thread (navigation = mapping).
  **`tess.html`/`tess-app.js`** shows how the
  cells **tessellate**: a hexagon has 6 neighbours and the cortex has 6 white arms, so each white arm hands off
  to one neighbour (the white weave is the connective tissue) while the 8 engines stay local — self-similar
  aperture-7 (H3-style), wrapping the cylinder. Seedable family
  (`foam3d.selftest.mjs`, 44 + `chamber.selftest.mjs`, 31; K(6,8) over 80 seeds). The 2D versions are preserved: `flat.html`/`flat-app.js`
  (the polar rosette, kernel `weavefloor.js`), `decks.html` (stacked-decks comparison), `weave.html` (loom/tube
  proof). The original surface concept: the upper rind's industrial deck: **8
  production engines** (foundry · chemworks · mill · fab · weave · assembly · fluid · reclaim) placed as
  graph-Voronoi facilities with **live material flow** (each engine's activity graph + the closed
  inter-engine supply chain reclaim→refiners→mill→assembly→fulfillment→reclaim), and **6 white-collar ops
  surfaces** woven over all eight. The contact requirement — every ops surface touches every engine — is the
  complete bipartite graph **K(6,8)**, realised as a **plain weave** (warp × weft, not the abandoned `/forge/micro`
  gyroid: a gyroid merges the 6 and the 8 into single sheets and asserts contact by fiat; the weave keeps all
  14 as distinct followable threads and *derives* completeness). **The primary view (`index.html` + `ops-app.js`,
  kernel `weavefloor.js`) is a POLAR / spiral weave — a woven rosette over a 19-CHUNK hex region (centre + 6 + 12,
  the forge tiling) on TWO floors**, fine sub-chunk voronoi. The constraint set it solves: all 6 white-collar
  meet at the **top-floor centre tile**, all 8 production at the **bottom-floor centre tile**, and those two hubs
  are **disconnected except through the weave**. Structure: **two counter-rotating spiral families** (the {N/k}
  Shukhov motif on the floor) — 6 white arms spiral out one way (converge at the top hub), 8 production the other
  (converge at the bottom hub); counter-rotation ⇒ every white crosses every production (**K(6,8)**), over/under
  parity ⇒ **100% of both floors**, and the hubs couple only through the field. It's a **seedable FAMILY** (spiral
  turns + phases per seed; turns-sum ≥ 1 guarantees K(6,8), checked over 80 seeds). (Earlier renders kept for
  contrast: `decks.html`/`decks-app.js` — stacked decks + a link-star, the wrong metaphor; cartesian/ribbon
  versions in git history.) `weave.html` is the loom/tube proof. Kernels: `weave.js` (K(6,8) plaid + tours),
  `foam.js` (voronoi + adjacency), `engines.js` (the 8 + supply chain), `weavefloor.js` (the polar rosette),
  `layout.js` (region-decks comparison). Theory in `ops/WEAVE.md`. Pure static, deterministic, node-tested
  (`weave` 41, `weavefloor` 24, `decks` 77).

## The package it belongs to

Four surfaces, one cylinder. **game → [hoop](../hoop)** · **structure → rind (you)** ·
**thermodynamics → [tide](../tide)** · **ecosystem → [biome](../biome)**. rind was split out
of hoop; it is the shell, tide/biome are the air/life inside it. Keep the cross-links in
`index.html`'s "four wings" block and the footer working when you touch the landing page.

## Run / test (everything works from the sandbox except deploy)

```bash
( cd rind/solver/cylinder-solver && cargo test )   # the solver math, offline
node rind/solver/foam-preview.mjs                  # headless foam → frame model preview
node rind/test/wayfind.selftest.mjs                # wayfinding certificates (no deps)
node rind/ops/test/onedoor.selftest.mjs            # ★ the ONE-DOOR proof: any→any ≤1 door incl. hubs (two concourses)
node rind/ops/test/weave.selftest.mjs              # the ops weave: K(6,8) realised+proven (not the gyroid's fiat)
node rind/ops/test/weavefloor.selftest.mjs         # the ops weave as ONE fabric across two floors (primary view)
node rind/ops/test/decks.selftest.mjs              # the region-decks comparison view
open rind/index.html                               # the tools (+ ops/ — the production weave)
```

Structural correctness lives in the Rust crate's `cargo test`; the wayfinding (spiral ramps +
azimuthal roads through the chamber graph, `wayfind.js`) is certified by its node selftest.
The pages themselves are exercised by eye (open them).

## Deploy

- **Site:** push `rind/**` on `main` or `claude/oneill-cylinder-refactor-xjknww` →
  `deploy-rind.yml` runs `wrangler deploy`. The sandbox **cannot** deploy; push and let the
  Action run. Verify the log binds `rind.mino.mobi (custom domain)` (the golden rule).
- **Solver wasm:** edit the Rust under `solver/cylinder-solver{,-wasm}/` → `build-cylinder-solver.yml`
  rebuilds `solver/pkg/**`, commits it, and dispatches `deploy-rind.yml`. Don't hand-edit
  `solver/pkg/` — it's generated.
- Ownership lives in `deploy-registry.json` (surface `rind`, branch
  `claude/oneill-cylinder-refactor-xjknww`). Change the branch there, then run
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## Invariants — do not break

1. **The solver is optional.** The JS fallback must keep every page working when `solver/pkg`
   is absent or fails to load. Verify the `solver: …` pill degrades to "offline — geometry only".
2. **"hoop" here is structural physics** (hoop tension / hoop BC / annular hoop solve), not the
   game site. Never rename those identifiers.
3. **Edges are structure, plates are not.** Doors/stairs are openings in plates and must never
   cut a structural edge — that's what keeps the foam navigable *and* load-bearing at once.
4. **Pure static.** No build step for the site, no D1/DO/secrets. Geometry in JS, scoring in
   optional WASM.
