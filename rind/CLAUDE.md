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
  **ZERO-LADDER**: the last over/under stair-doors yield not to any knob (nodes/decks/width/z-profile all measured no
  help) but to LOOSENING the spirals (`breathe`=`turnScale`~0.35 — "let the tight curves breathe, it's an infinite
  world"): fewer turns spread the crossings radially so all 48 doors land at grade. At `turnScale ≤ 0.35`, 6×8 is a
  full zero-ladder world (48 doors at grade + full K(6,8) + 14/14 continuous + one door); the onedoor view defaults to
  `breathe 0.35` with a `zero-ladder ✓` readout (`certify.steepDoors`).
  **`nexus.html`/`nexus-app.js` is the FIRST-PERSON navigator (proto)**: you are the `@` on ONE thread — its own
  chambers strung along its curve into a walkable surface, walled but for its doors + the nexus; start at the white
  nexus, walk an arm, and crossing a door re-centres the whole map on the crossed thread (navigation = mapping).
  **`helix.html`/`helix-app.js` — the EMERGENT cylinder helix**: keep local hex cohesion but chain the white
  edge-handoffs across the wrapped honeycomb and the six directions resolve into three global families — azimuthal
  **rings** (E–W) + two counter-rotating **helices** (NE–SW, NW–SE) that cross = the cylinder weave, emergent;
  expansion is just more rows of hexes. Unrolled ↔ wrapped-on-cylinder, trace one strand.
  **`tessweave.html`/`tessweave-app.js` (kernel `tessweave.js`) — the tessellation SOLVED over the real threads**:
  where `tess.html` is a schematic, this honeycombs the *actual* single-hex Voronoi weave (`curveseed.js`, 14
  threads) and solves the **thread-to-thread interfaces** at every shared edge. Two halves, computed and proven
  (`test/tessweave.selftest.mjs`, 51 assertions over 7 seeds): (1) the 6 **whites** each claim one edge by their
  rim-most cell — an exact **1-white-per-edge bijection** (the warp) — and translation-tiling turns each owned
  white into a straight global strand, so the 6 collapse to **3 families** (one azimuthal ring + two
  counter-rotating helices — the same emergence as `helix.html`, now over the real weave); (2) the 8 **engines**
  don't divide the hex's 6-fold antipodal symmetry, so they can't all splice — they stay local and, where they
  graze the rim, abut the neighbour's *other-kind* thread as cross-kind **K-doors** (the K(6,8) contact reaching
  across the seam). Continuity across a seam is realised the way it is everywhere in rind — **door-adjacency**
  between abutting rim cells, not literal curve-joining (the spiral chirality biases every white to one side of
  its edge, so opposite edges don't mirror-align). The view distinguishes each thread's **true path** vs its
  **desire path**: the *desire* path is the analytic seeding curve (`threadCurve` samples `weave3d`'s
  `lineW`/`lineP`), the smooth spiral the nuclei were seeded along; the **true path** (`truePath`) is the chain of
  chambers the thread actually OWNS after the watershed, stepping hub → rim through owned-cell adjacency — jagged
  where the desire curve is smooth (the real corridor a walker follows; default view). Each white runs **hub →
  one rim edge**, so a continuous warp thread is *hub → seam → neighbour-hub*, the whites chaining the hubs across
  the web. Under plain translation the same family lands adjacent across each seam (green beside green); a
  **bridge** joins each centre exit to its nearest neighbour exit, closing the gap so the families thread
  continuously. Trace one family to isolate it. **Beyond seven chunks** (`hexPatch`, `chunkColor`, `patchSeams`,
  `patchMismatch`): the hex centres are a triangular lattice, 3-colourable (`(i−j) mod 3`); the view tiles an
  N-ring patch (7/19/37), tints the three **phases**, marks every corner where three chunks meet as a **nexus**,
  and lets you rotate a phase by 60° (`phase` cycles off / *CW60-dispersed* / *pinwheel*). Measured finding:
  phase rotation lowers the *overall* seam mismatch (it reorients the production threads) but the **white-only
  mismatch is rotation-invariant** — the 6 whites exit 60° apart (a C6-symmetric set), so rotating a chunk maps
  that set onto itself and cannot move where whites meet; only a reflection moves white exits (and that's the
  `mateTransform`/`hexSym` mirror, kept in the kernel but off the default since you preferred no flip). So pure
  rotation improves production interfaces + reshuffles which family lands at a seam, but doesn't make the three
  white families geometrically coincide — the bridges still carry that.
  **`floor.html`/`floor-app.js` — THE DEMO FLOOR (the tessellation inhabited)**: drives the vendored **hoop/v100
  foam-and-rooms engine** (`rind/ops/v100/`, six modules copied from `hoop/v100` with flattened imports — see
  `v100/VENDOR.md`; vendored because the rind worker only serves `rind/**`) over the hex lattice. Each chunk becomes
  a **district** of Voronoi rooms + a concourse (`solveChunk`, v2 rooms-first); the manager reflects neighbours
  across shared edges and stitches ONE cross-chunk **walk graph** (`buildWalk`), so a 7- or 19-hex honeycomb is one
  connected floor you walk (WASD/click, follow-camera). Districts abut at **seam doors** (edge-midpoint ports) and
  the corners where three chunks meet are the **nexus mixing points** ("greedy corners — don't care about
  single-species threads; a nexus mixes regardless"). Residents dwell in role-coloured rooms (⚒/⚕/▣…), spider-droids
  (the `sprites/` kernel) haul the concourse. Proven navigable: `test/floor.selftest.mjs` (7-flower connects, all
  districts reachable from one start, 6 nexus corners, deterministic). **BUT** the god-view is the wrong lens for
  this map — **the map is only what you can SEE from where you stand**. **`office.html`/`office-app.js` — YOUR
  THREAD IS AN OFFICE · LINE OF SIGHT** is the right engine (kernel **`officeweave.js`** — the page and the
  selftest drive the same module). Threads are PHYSICAL: each renders in its owning hue (solid, persistent,
  bending out); walls carry REAL GAPS at every door and the kernel rasterises those same trimmed walls into an
  occlusion grid (`buildSight`), so sight rays pass through doorways and the thread beyond SPILLS INTO VIEW in
  its own colour. CROSSING IS A NO-OP — one global walk graph (`buildGlobalWalk`: office walls + the 48 K-doors +
  the open plazas); walking through a door is just walking, and "which thread am I on" = who owns the chamber
  underfoot. What you leave fades behind you (visibility decays toward line-of-sight — no memory, no minimap;
  remembering the plan would tangle the levels). Sight is LEVEL-LOCAL: floor tiles are the 2D Voronoi of each
  cell against its level-mates only (|Δz| < 2.2 decks), walls only exist between same-level flanks, occlusion is
  two stratum grids, and the renderer hides cells outside your walkable z-window — the other threads pass above/
  below unseen and surface exactly where the weave lands at grade: the doors. The PLAZAS have no walls at all
  (the certified door-free concourses, walked): the six whites share one open lobby floor, the eight engines
  mirror it below. **Over SEVEN HEXAGONS**: aperture-7 (`hexScale = √7`, H3 twist ≈19.106°), ~2.4× the chambers
  per thread, FULL onedoor certificate intact (K 48/48, 14/14 continuous, at grade, one-door — pinned); the
  seven child hexes persist as **districts** (partition + overlay + HUD). The office partition **hews to
  hoop/v101** (vendored `ops/v101/rooms.js`): traffic-sized rooms, grand anchor at the nexus, MIN_ROOM
  bulldozing, a carved HALL spine with one lit threshold per room (spanning tree rooted at the hall), light
  pooled per room from self-emitting components + bollards, half-scale residents with boids separation. **Painted v101** (`officepaint.js` +
  vendored `ops/v101/{consoles.js,v5/}`): a player-scaled retile + occluded light bake per 384-unit paint-chunk,
  baked once on first sight and composited under the gap-free LOS fog — albedo = thread hue, the ROLE enters via
  the light (role-tinted wall lamps + superformula deco components) and the voronoi-grown wall fixtures; residents
  are sprite people from `sprites/core.js` commuting home→work→third place. Built on
  `curveseed` + `onedoor.certify` (48 doors, endpoint-deduped) + the vendored `v100/` room toolkit;
  `test/office.selftest.mjs` (38) pins certificate-at-×7, districts, room tiling, walled reachability, global
  no-op walk, zero-K-door concourses, door see-through, walled-room concealment, K-door spill, art genomes,
  determinism. **`tess.html`/`tess-app.js`** shows how the
  cells **tessellate** (the schematic): a hexagon has 6 neighbours and the cortex has 6 white arms, so each white arm hands off
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
node rind/ops/test/tessweave.selftest.mjs          # ★ the TESSELLATION solve: 14 threads tile; whites→3 warp families, engines→K-doors
node rind/ops/test/floor.selftest.mjs              # ★ the DEMO FLOOR (god-view): v100 foam districts tile a honeycomb, one connected walk graph, 6 nexus corners
node rind/ops/test/pocket.selftest.mjs             # ★ THE POCKET DIMENSION: 48 stations, reciprocity, arc order, one-door, CHUNKED threads, the CP ◈ nexus, FACTION AXES (six nave biomes ↔ six whites, antipodal — no same-faction adjacency)
node rind/upperrind/verbflow.selftest.mjs          # upperrind's FLAVOUR palette: the dominant-verbs colours + (world,key)→verb/floor-hue resolvers
node rind/upperrind/fluxfield.selftest.mjs         # upperrind's FLUX floor: the solenoid-with-shielded-chambers stream function + marching-squares flux lines (each floor a fingerprint of its own chamber layout)
node rind/upperrind/machinehall.selftest.mjs       # upperrind's PRODUCTION floors as MACHINE HALLS: the engine's steps→bays (flow order) + conveyor runs; the family topology (star/cycle/path/fan…) survives as the conveyor graph
node rind/ops/test/office.selftest.mjs             # ★ YOUR THREAD = an office, over SEVEN HEXAGONS; line-of-sight (walls hide, doors spill); crossing is a no-op walk
node rind/ops/test/weave.selftest.mjs              # the ops weave: K(6,8) realised+proven (not the gyroid's fiat)
node rind/ops/test/weavefloor.selftest.mjs         # the ops weave as ONE fabric across two floors (primary view)
node rind/ops/test/decks.selftest.mjs              # the region-decks comparison view
open rind/index.html                               # the tools (+ ops/ — the production weave)
```

Structural correctness lives in the Rust crate's `cargo test`; the wayfinding (spiral ramps +
azimuthal roads through the chamber graph, `wayfind.js`) is certified by its node selftest.
The pages themselves are exercised by eye (open them).

## Deploy

- **Site:** push `rind/**` on `main` or `claude/upperrind-thread-styling-p7dhwu` (the current
  owning branch — see `deploy-registry.json`) → `deploy-rind.yml` runs `wrangler deploy`. The
  sandbox **cannot** deploy; push and let the Action run. Verify the log binds
  `rind.mino.mobi (custom domain)` (the golden rule).
- **Solver wasm:** edit the Rust under `solver/cylinder-solver{,-wasm}/` → `build-cylinder-solver.yml`
  rebuilds `solver/pkg/**`, commits it, and dispatches `deploy-rind.yml`. Don't hand-edit
  `solver/pkg/` — it's generated.
- Ownership lives in `deploy-registry.json` (surface `rind`, branch
  `claude/upperrind-thread-styling-p7dhwu`). Change the branch there, then run
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
