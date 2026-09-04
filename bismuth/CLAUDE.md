# bismuth — bismuth.mino.mobi

Bismuth hopper crystals, **grown rather than drawn**. A seeded colony of
*mason* agents lays one brick at a time on a cubic lattice under three local
rules taken from real crystal growth, and the stepped, hollow, right-angled
hopper emerges — nobody plans the staircase. The iridescence is real
thin-film interference computed per pixel in the fragment shader. One integer
seed is the whole crystal, forever: `/c/<seed>` is a permanent permalink.
Sister to borges / idol / wormhole (same seeded-determinism posture, same
xmur3 + mulberry32 lineage).

## Facts

| | |
|---|---|
| Surface | `bismuth` |
| Dir | `bismuth/` |
| Endpoint | `bismuth.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/bismuth-crystal-procgen-g6t0dh` |
| Deploy | `.github/workflows/deploy-bismuth.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "bismuth"`.

Thin assets Worker (worker `bismuth`, custom_domain bismuth.mino.mobi) — no
build, no D1, no AI, no secrets. Pure ES modules, no dependencies.

## Files

| File | Is |
|---|---|
| `js/{prng,genome,crystal,prism,stack,ico,worms,render,tilings}.js` | **synced copies of [`packages/bismuth/`](../packages/bismuth/)** — the engine is a package now (hopper.mino.mobi runs the same one). Edit the package, `node scripts/sync-dataviz.mjs --write`; `--check` fails preflight and the deploy if a copy drifts |
| `js/prng.js` | xmur3 + mulberry32, and `stream(seed, label)` — named sub-streams so the genome and the growth never share state |
| `js/genome.js` | seed → every parameter (habit, masons, budget, rim, Kossel rates, anisotropy, nucleus, oxide palette). Pure. `GRID` (128) and `CHUNK` (16) live here |
| `js/crystal.js` | **the engine** — `Growth` (the colony: arrival, walk, deposit, population, cool-down) over a SUBSTRATE; `Lattice` (the cubic substrate: occupancy, bond counts, the six extent maps, the lattice-line terrace scan); `Mason` (the agent) |
| `js/worms.js` | **the worms** — a second wave of agents released *into* the crystal: they tunnel along the bond graph, bite the brick they leave with probability `bite`, and with `recycle` feed it back to the live colony. Deterministic on `stream(seed, "worms")`; substrate-agnostic. Only the playground uses them so far |
| `js/prism.js` | **the Prism substrate** — any plane tiling stacked into layers; bonds, open sky, the walk, arrival rays and the terrace verdict as geometric rays over cached per-tile ray tables |
| `js/stack.js` | **the Stack substrate** — a tiling with each layer staggered (AB / ABC) and/or twisted against the last: the close packings and moiré stacks. Extends `Prism`; vertical bonds are exact tile overlaps, the column top is a height field over the plane |
| `js/flux.js` | **magnetism** — the crystal as a magnet: dipoles per brick, a coarse field grid with multipole cells, flux lines traced and drawn; `FluxDriver` for a page |
| `js/ico.js` | **the Ico substrate** — the icosahedral quasicrystal: golden rhombohedra from a 6-grid dual, six face-bonds a brick, thirty extent maps, exact shadow columns; its own mesher in `render.js` (`meshIcoChunk`) |
| `js/tilings.js` | byte-identical copy of `packages/tilings/tilings.js` (kept honest by `scripts/sync-dataviz.mjs --check`) — **edit the package, never this** |
| `js/render.js` | WebGL1 renderer — chunked voxel mesher with baked AO, the thin-film shader, orbit camera (or first person via `renderer.fp`), mason motes, props and beacons for hopper |
| `js/app.js` | the page: URL ↔ seed, pacing, HUD, keys |
| `packages/bismuth/crystal.selftest.mjs` | ~34k checks, ~40 s. **Run before touching the engine or the genome** |
| `worker.js` | `/c/<seed>`, `/q/<seed>`, `/i/<seed>` → index.html; `/api/crystal`, `/api/genome`, `/api/health` |
| `index.html` | the page; loads `/js/app.js` as a module (root-absolute, so `/c/<seed>` works) |
| `study.html` | **generated** — `/study`, the two-agent phase-space study rendered from `packages/bismuth/phase/*.json` by `node packages/bismuth/phase-report.mjs … --full --out bismuth/study.html`. Regenerate after re-running `phase.mjs`; never edit by hand |

**`index.html`, `worker.js` and the selftest import the same `js/crystal.js`.**
There is no second copy and there must not be — the selftest is evidence
about the live page, and the API agrees with the page brick for brick.

```bash
node packages/bismuth/crystal.selftest.mjs   # determinism, connectivity, morphology, coverage, API
```

`scripts/preflight.mjs` picks the selftest up for changed dirs; the deploy
workflow runs it as a gate.

## How the crystal grows (`js/crystal.js`)

The nucleus is a small plate the melt froze around; everything else is laid
by masons. A mason is in the **melt** (counting down a flight time) or on the
**surface** (walking with one brick). Per tick, in id order:

1. **Arrive.** A straight lattice ray from a box just outside the crystal,
   60% of them from above, toward a jittered centroid; land on the last empty
   cell before the first brick. Rays strike protrusions first — the supply
   side of the Berg effect.
2. **Decide.** At an empty site touching `nb` bricks, with open sky above
   (nothing higher in its column — *the melt is above*), draw against the
   Kossel rate `K[nb]` (`k1` terrace ≪ `k2` ledge < `k3` kink ≤ 1). Only if
   that passes, run the terrace scan (`fedBias`): the brick is laid with the
   anisotropy weight of the strongest **fed** face it would attach to.
3. **Walk** otherwise: one of the 26 neighbours that touches the crystal,
   drawn ∝ `1 + nb²·mobility`, ×2.5 for open sky. Patience spent → back to the
   melt. **Never a forced brick** — that restraint is what keeps the faces flat.

The terrace rule (`Lattice.fed`) is the Berg effect stated geometrically, on
the six extent maps `ext[f]` (furthest brick along each face normal, per
lateral column): a site is fed via face `f` iff in some lateral direction the
outline **drops within `rim` cells**, **nothing sits at that level beyond the
drop** (the inner edge of a rim looks across the pit at the far wall — not
fed; the outer edge looks at nothing — fed), and **no overhang within `rim`
on the opposite side** shelters it. Two more gates for a terrace nucleation
(`nb == 1`): a new *layer* needs a real patch under it (≥ 5 of the 8 in-plane
neighbours), and a layer widens *outward* only at the crystal's **top lip**
(the attached brick is the top of its column, the lip runs both ways, and the
rate falls with depth² so a skirt never spreads from the foot). Together:
every layer is a ring one step further out than the last, ~45° both sides,
constant rim width, pit over the nucleus.

When the budget is reached the melt **cools**: `k1` → 0, so no new layer
starts but every ledge already running finishes (≤ 15 % more bricks) and the
crystal ends with clean edges.

Determinism: integers and IEEE basic ops only in every decision (no
transcendental function anywhere on the decision path), one PRNG stream drawn
in a fixed order, masons iterated in id order. Same seed → identical brick
sequence in every engine. The genome draws from `stream(seed,"genome")`,
growth from `stream(seed,"growth")` — so **the genome can gain fields without
re-rolling any existing crystal**, but changing any rule or rate in the engine
re-rolls them all. That is the cost of a permalink; do it knowingly.

## Substrates — the geometry is not the brain

`Growth` talks to a substrate through a small interface (`occ`, `nb`,
`kossel(s)`, `open(s)`, `inBounds(s)`, `walk(s, out)`, `fedBias(s, nb, axis,
rim, brain)`, `arrive(rng, brain)`, `place`, `brick`, `seed`, `bounds`,
`stats`). The masons never see geometry; they ask for neighbours, bonds and
the terrace verdict. So the lattice is fundamental and the shape is emergent.

- **`Lattice`** (cubic) is the fast path and is bit-identical to the engine
  before the split: the selftest pins four seeds' first 2000 bricks to golden
  hashes.
- **`Prism`** (`prism.js`) stacks a `packages/tilings` tiling into `LAYERS`
  (96) layers; a site is (tile, z), lateral neighbours share an edge. Rays for
  the terrace rule are 12 fixed integer directions sampled every half tile
  and point-located, cached per tile (`ray(t, d)`); `fedTop` is the cubic
  scan verbatim over that sequence, `fedSide` is what the cubic lateral scan
  reduces to for a lip — open sky plus no lower step within `rim` below the
  site or outward of it. Two things are substrate-specific and deliberate:
  `kossel()` counts corner-only contacts as half bonds (a rhomb outline is
  jagged, a lip row must be able to propagate as ledges) and, with nothing
  below, counts only *supported* lateral bricks (else unsupported sheets
  spread at ledge rates); and the lip's "along" count is o's other
  edge-neighbours holding bricks. A Penrose substrate grows a decagonal
  quasicrystal; hex grows a hexagonal hopper.
- Everything in the prism is integer arithmetic on the tiling's fixed-point
  coordinates (`FIX` = 1024 per edge). One `Math.sqrt` normalises an outward
  direction to pick one of the 12 rays; it is correctly rounded everywhere.
- **`Stack`** (`stack.js`, extends `Prism`) is the same tiling with each
  layer DISPLACED and/or ROTATED against the last, chosen by
  `substrate.stack` (`"ab"` / `"abc"`), `stagger` (0–1 of the natural
  hollow vector, `HOLLOW` per shape) and `twist` (degrees a layer, quarter
  steps, ±6). `Growth` picks it whenever `isStacked(spec)`. Hexagons AB is
  hexagonal close packing; hexagons ABC the rhombohedral family (face-centred
  cubic at the ideal spacing — bismuth's own A7 lattice is a distorted
  member); the square grid AB is face-centred cubic along [001]; twelve bonds
  a brick in each. Any other tiling staggered is a running bond that faults
  every second or third layer (the stagger closes only on a lattice); a twist
  makes the vertical bonds a moiré, quasiperiodic along z on any tiling.
  Mechanics: per-layer frames `world = R(θ·dz)·(p + off(dz))` with the
  rotations from a literal cos/sin table composed by multiply-adds (no trig at
  run time); **pair maps** (`pair(z)`) — the exact polygon-overlap area between
  every tile of layer z and the tiles of z + 1, computed once per distinct
  pair of frames (`period` maps for a stagger, one per layer for a twist),
  overlaps under `OVERLAP_MIN` (a tenth) are not bonds; **support** = the
  overlap-weighted occupancy of the layer beneath, and a site *stands* on it
  at `SUPPORT` (0.6) — less is a lip and the lip rules apply; the **height
  field** `H` (half-tile cells, raised on place, rescanned on remove)
  replaces `top[]` for open sky, the summit and the terrace rays, which run
  in world space. `kossel` reads below/above as standing/covered plus the
  prism's lateral rules; `fedBias` takes the +z route only when standing (a
  brick over one corner of another would start a chain of corners climbing
  away from the crystal). Cost: ~1.6× the prism per brick. Morphology: the
  hexagonal close packings grow the cleanest terraced hoppers; the square
  running bond and twisted stacks grow looser, more skeletal funnels — their
  rims flare by half-tile lips that attach with one counted bond. The
  selftest pins hex AB seed 7 to its own golden hash (`GOLD_S`), checks the
  overlaps (a quarter each on the grid, a third on hexagons), the coordination
  (12), the frames, connectivity, the height field, removal, deploy, and the
  worms on a stack. The worms walk any substrate through `sub.bonds(s, out)`
  (below, above, then the lateral edges — the prism lists its column, the
  stack its overlaps); the renderer asks `sub.vertical(t, z, dz, out)` for
  the tiles above and below and `sub.frame(z)` for the layer's transform.
- **`Ico`** (`ico.js`) is the icosahedral quasicrystal — space tiled by the
  prolate and oblate golden rhombohedra (Ammann–Kramer, the 3D Penrose
  tiling), `substrate: {shape: "ico", R, ic, z0}`. Generation: the dual of a
  6-grid with the icosahedral star as normals (six of the icosahedron's
  vertices, one per antipodal pair, in the frame where x, y, z are two-fold
  axes; radicals only). Every vertex is an integer 6-tuple, so faces weld and
  adjacency are exact; the selftest checks the tiles fill their cylinder to
  within rounding, every face is shared both ways, and the prolate:oblate
  census converges on φ. A tile is a site; its six faces are its bonds
  (coordination 6, the cubic Kossel classes 1–6), read as below / above /
  beside by the face normal's z (`UNDER`, 0.4) with the layer beneath
  collapsed to one bond (a rhombohedron can rest on three faces at once).
  **The melt is above along a two-fold axis**, deliberately: no face of the
  tiling is perpendicular to a five-fold axis, so a five-fold "terrace" is a
  ramp to every attachment direction and the terrace rule starves; the flat
  planes are the two-fold planes (the faces of the rhombic triacontahedron,
  the habit real icosahedral grains show), along which every tile's top and
  bottom sit on the rungs of a Fibonacci ladder (0.526 / 0.851 apart). So
  the terrace rule keeps THIRTY extent maps (`E[d]`, `Ec[d]`: highest top
  and highest centroid along each oriented face normal, over that normal's
  plane at half-edge cells, centred on the cylinder) and reads the one for
  the direction the site would extend the crystal in — a wall is a centroid
  past the site's bottom plane (`LEVEL`), a drop a top below it (`RUNG`) —
  the cubic `fed` verbatim otherwise, with the patch rule for steep-up
  directions and the lip rule for the rest (`STEEP`). Open sky is exact:
  each tile's column of tiles above and below (`above[]`, `below[]`, the
  vertical line through its centroid) is precomputed and `shadow[]` counts
  the occupied ones. Removal rescans a cell's column along d exactly
  (`column(d, c)`, lazily built by an exact line–polyhedron walk plus the
  tiles registered on the cell by centroid). A pack's floor is its plate's
  underside (`floorOf`), and `Growth.deploy` asks for it. Arrival marches a
  3D bucket grid. Size: R 8–20, a cylinder of radius R standing 2.5R (the
  crystal grows as tall as it is wide), 16.6k tiles and ~1.2 s to build at
  R = 12, cached per R; ~16 µs a tick. Habit: a hollow tower-hopper, a
  goblet, terraced in rhombic two-fold facets; `lipDepth` 0 flattens it.
  Golden hash `GOLD_I` pins seed 7 at R 10. A stall against the domain is reported: `stats.stalled` (any colony done without cooling, short of its budget) and `stats.reach` (the fraction of the wall or ceiling the crystal has used), which the lab turns into a message; the lab also caps the budget at about 0.9·R³ when the chip is picked, since the crystal grows as tall as it is wide.

**`/i/<seed>`** is the icosahedral namespace: `icoSubstrate(seed)` (its own
stream, `stream(seed, "ico")`) puts the genome on the `Ico` substrate at
`ICO_SITE_R` = 20 — 95k rhombohedra, about six seconds to build, ~20 MB —
and `icoBudget()` caps the budget at what that cylinder holds (0.9·R³ =
7,200), since the crystal grows as tall as it is wide. The page says
"building the icosahedral tiling" and builds on the next frame; `App.build`
is where `start` used to end. The cousin button cycles `/c` → `/q` → `/i`.
The API refuses `i=1` (a tiling that size is not a request's to build); the
worker routes `/[cqi]/<seed>`. Growth is slower than a prism's (~4–5 ms a
brick), so a full crystal is a minute or two on the page.

**`/q/<seed>`** is the quasicrystal namespace: `quasiSubstrate(seed)` draws a
shape from `stream(seed, "substrate")` (its own stream — no cubic specimen
moved) and a disk nucleus; R = 44, z0 = 6. `?shape=` overrides it. The
selftest pins the Penrose cousin of seed 7 to a golden hash and grows every
shape. Prism growth is slower than cubic (~100–300 ticks per brick; a full
crystal is 5–20 s of CPU), which is why the API caps quasi requests lower.

## Colonies, deploy, remove — the platformer primitives

`Growth` holds `colonies[]`. Colony 0 is the seeded crystal and is bit-identical
to the single-colony engine (colony 0 draws from `stream(seed, "growth")`
and steps first). The primitives a level needs:

- **`growth.deploy(pack, at, {freeze})`** — *reseed from this plane.* Lays a
  plate (`pack.size` cells wide, `pack.thick` layers, default 3×1) at `at` — a
  site index, `{x, y, z}` (cubic), `{tile, z}` or `{x, y, z}` in world units
  (prism), or `null` for the **summit** (the site above the highest brick) —
  and starts a new colony on it with `pack` merged over the base genome:
  masons, budget, rates, rim, axis, brain, population, oxide, anything. The
  colony draws from `stream(seed, "growth:<idx>:<tick>")`, so a level is
  reproducible from its seed and its event log. Returns the colony index.
  **By default every colony that was growing freezes** (`done`, `frozen`,
  masons gone): what has grown is terrain now. `{freeze: false}` keeps them.
  **The plane is the pack's floor** (`col.floor`, override with
  `pack.floor`): beneath it the world is void to that colony — `kossel`,
  `fedBias`/`fed`, the patch and lip gates all ignore bricks below the floor,
  and a mason that wanders below it returns to the melt. Without this a plate
  on a wide plateau is starved by the Berg rule (the plateau never "drops");
  with it the pack grows a fresh hopper out of the plane it was seeded on.
  Arrivals aim at the pack's own bricks (`col.region`), not the whole
  structure. Colony 0 has floor 0 and the global region, so nothing about a
  seeded specimen changed (golden hashes).
- **`growth.remove(at)`** — destructible terrain. `Lattice.remove` rescans
  the six affected extent-map columns; `Prism.remove` rescans the column top.
  Bonds stay exact (the selftest compares against a rebuild). Masons whose
  ground vanished desorb on their next move. Removed sites queue in
  `growth.removed` for the renderer (`drainRemoved`).
- **`growth.events`** — `{kind: "deploy"|"remove", tick, at, pack, colony}`
  in order. Seed + events = level.
- `growth.done` is true only when every colony is done; `growth.masons`
  spans all colonies (mason ids stay unique); `growth.brain/K/axis/rim/pop`
  are colony 0's (what the playground edits live).
- `renderer.pick(px, py)` marches the camera ray through the substrate and
  returns the brick under a pixel — what a click means.

The playground exposes them under **packs**: reseed by clicking a brick
(the pack lands on the plane above it and everything else freezes), reseed
on the summit, and a demolish mode (click bricks). Both are live edits — the
link replays the base crystal, not the interventions; a game would persist
the event log.

## The colour (`js/render.js`)

Real bismuth is grey; the rainbow is a Bi₂O₃ skin a few hundred nm thick. The
fragment shader samples the reflectance of an air / film (n ≈ 2.4) / metal
stack at 9 wavelengths, folds them through approximate colour-matching lobes,
and boosts saturation — so hue shifts with thickness *and* viewing angle.
Thickness per brick = `oxide.base + oxide.ramp × (1 − i/budget)` (older bricks
were hot longer → thicker → further along gold → magenta → blue → green) plus
a slow spatial drift and a small per-brick grain. A brick is born glowing,
cools silver, and takes its colour over `cool` (1.6 s). Everything else is
plain: wrapped Lambert key, hemisphere ambient, Blinn-Phong specular, Fresnel
rim, baked voxel AO (the stair-wells go dark on their own), a filmic curve.

For the prism substrate `meshPrismChunk` extrudes each tile's polygon (a fan
per cap, a quad per open edge), with occlusion from the tiles around each
corner at the relevant layer; chunks are (16 layers × 128 tiles). The cubic
mesher rebuilds ≥ 12 dirty 16³ chunks per frame and then as many as fit in
8 ms; laying a brick dirties
its chunk (and a neighbour when it sits on a chunk face). Mason motes are
`gl.POINTS` with a short trail, drawn additively over the depth buffer.

## The page (`js/app.js`)

Seed from `/c/<seed>` (the worker) or `?seed=` (any static server); a bare
`/` picks a random seed and `replaceState`s to its permalink. Pacing targets
20–55 s per crystal: each frame runs engine ticks until this frame's share of
bricks is laid or ~7 ms elapse. `?instant=1` skips to the finished crystal
(what the deploy verify and screenshots use; `window.__done` flips when
finished). Keys: space pause · s skip · r again · n new · ←/→ neighbouring
seeds · a about.

## The worms (`js/worms.js`)

"Ghosts of the masonry": a second wave, deployed in the substrate rather than
from the melt. `new Worms(growth, opts, seed)`; `release(n)` puts `n` worms
at random bricks; `step(ticks)` moves each `speed` sites per tick along the
substrate's bond graph (six face-neighbours on the lattice; edge-neighbours
and the layers above and below on a prism), preferring occupied sites, never
turning straight back, drifting along the crystal's skin when it finds
itself in void, and heading for the centroid from open void. On leaving a
brick it takes it with probability `bite`, through `growth.remove` — so the
extent maps, the events log and the renderer's removed list all see it, and
masons standing on it desorb. `positions()` gives `[x, y, z, fade]` segments
for `renderer.worms`, drawn as a chain of cold motes.

The brain behind the dials: `depth` (−1 grazes the skin, +1 mines the
interior; the choice among occupied neighbours is weighted 1 + depth·(bonds −
3)/3), `reverse` (chance to turn back along its own trail), `spawnAfter` and
`starve` (a worm splits after eating that many bricks; fades after that many
unfed moves — reproduction and death, which make it a consumer with a
population rather than a dial), `lostAfter` (moves in open void before a
ghost sinks into the masonry elsewhere), `exposed` (only bricks with at most
that many bonds are edible; 0 = any — the grazer's functional response). All
in `DEFAULT_WORMS`, all live in the lab, all in the URL state.

`packages/bismuth/phase.mjs` runs the two-agent phase space (the sink,
the Allee threshold, breeding worms, the chemostat, one mason vs sixteen)
and `phase-report.mjs` renders it; the findings are in
`packages/bismuth/PHASE.md`. In one line: without recycling every drain wins
eventually (life = budget ÷ pressure); with recycling the crystal is a
living steady state; the crystal heals bites at its rims and not at face
centres (the Berg effect is the immune system's blind spot); breeding worms
starve out or bloom (overshoot on a stock, never a cycle: a worm inside a
crystal always has a brick under it); grazers limited to exposed bricks
(`exposed`) coexist for hundreds of thousands of ticks and then starve on
the crystal they smoothed, or eat a small one.

`recycle` answers the "eats its own tail" question honestly: a bitten brick
refunds one brick of budget to the youngest colony still growing and not yet
cooling (`col.laid--`). It is not perpetual growth — a colony past its
cool-down is past feeding — but while a colony is live the crystal is a
steady state of laying and erosion. The masons themselves never run out of
fuel; a colony ends when it has laid its budget (plus the cool-down) or
stalls. Defaults (3 worms, speed 0.05, bite 0.15) eat an order of magnitude
less than a colony lays; the selftest pins that ratio below 15%.

Not in the specimens (`/c/`, `/q/`): a permalink is still the bricks the
masons laid. In hopper they are the weather (`hopper/js/run.js`, `WEATHER`):
a wave of grazers with every pack, recycling on, hearts for the player —
the settings the study picked.

## Magnetism (`js/flux.js`)

The crystal as a magnet, drawn. Every brick is a dipole; the field is the
applied field plus all of them (first order — the dipoles do not feel each
other), evaluated on a 30³ grid over the crystal's box with bricks near a
sample summed one by one and far cells as one dipole each, a few slices a
frame (`FluxDriver.tick`) so the page never stalls; flux lines are
streamlines through the grid by midpoint steps, seeded on a lattice across
the planes upstream and downstream of the crystal, and stopped where they
enter a brick. Materials: `dia` (what bismuth is — the strongest diamagnet
among the metals, χ = −1.7 × 10⁻⁴, so the strength here is exaggerated by
four orders: the crystal expels flux and the lines crowd into the hollow),
`para` (drawn in), `ferro` (every colony magnetizes to saturation along an
easy axis of the substrate — the cubic axes, a prism's six in-plane
directions and its axis, the quasicrystal's fifteen two-fold axes — chosen
by the colony's own growth anisotropy where the applied field points, so
deployed packs are domains and the lines read them out).

**Remanence.** The applied field is a switch (`applied`). Off, a diamagnet
or paramagnet has nothing left; a ferromagnet keeps the magnetization the
field gave it — the domains hold their easy axes, the applied term is zero,
and what is drawn is the crystal's own field, a dipole's at a distance. Its
lines are seeded on the crystal itself (`traceSurface`): every surface brick
gets an outward normal from fourteen probes, the seeds are the bricks with
the strongest outward flux, spread so no two crowd, and each line is traced
with the field until it re-enters the crystal — the first steps off the
surface read the dipoles directly, the rest the grid. Intensities are drawn
against a reference (`ref`): the applied field, or for a remanent magnet a
quarter of the equatorial field of a uniformly magnetized sphere of that
strength, so the poles glow and the field a few bricks out still reads.

**The section** (`Section`; `view` = `flux` | `field` | `both`). A plane
through the crystal's centre — facing the camera, or on an axis, or locked
where it was (`plane`; `offset` slides it along its normal) — with the near
half of the crystal cut away: the renderer's crystal program takes a
view-space clip plane (`uClip`) and discards fragments on the eye's side,
always the nearer half whichever way you orbit. On the plane the field's
strength is colour on a log scale about the reference (cold below, warm
above; a factor of 2.8 spans the range, so a diamagnet's shadow and a
paramagnet's core both read), its direction is line integral convolution of
white noise along the in-plane field (faded where the field runs through
the plane), and where the plane cuts a brick the cut takes the domain's
colour (a hue per colony for a ferromagnet, the metal's grey otherwise).
The plane is opaque where the field matters and lets the far half show
through elsewhere. A coarse plane (64²) is read off the grid whenever the
camera moves; once it rests the full plane (128²) is read off the grid and
then sharpened from the dipoles directly, a few rows a frame. The driver
stops the idle spin while a section is up, since the section would chase
it. The renderer draws the section as a textured quad (`sprog`) under the
lines; the lines are drawn additively with a line program (`lprog`),
depth-tested against the crystal.

On the specimen page `m` (or the flux button) cycles off → diamagnet →
ferromagnet → remanent (the field switched off, the magnetization kept) →
off, and `v` (or the section button) cycles the lines → the section → both;
in the lab the **magnetism** section has the material chips, the applied
field switch, the view and section chips, the section offset, strength,
the applied field's azimuth and elevation, and the line count, all in the
permalink (a locked section carries its normal, `pn`). Rendering, not
physics: nothing here touches the engine or a brick hash.
`flux.selftest.mjs` pins the signs, the far-field agreement of the cells,
the lines' finiteness and stopping, the domains, remanence (the moments
kept, the r⁻³ far field, seeds on the surface where the field leaves it),
the section (its basis, its cut, the sharp plane against the dipoles), and
determinism of all of it.

## The playground (`lab.html` + `js/lab.js`) — `/lab`

The same engine and renderer with every knob on the outside. Three panels:

- **substrate** — the cubic grid or any of the ten tilings (`sub: {shape,
  R, stack, stagger, twist}`); on a tiling the painter draws the real
  polygons and paints per tile (`tic: {z, cells}`, three bytes per painted
  tile in the URL) and the genome gets `substrate: {shape, R, ic: {cells},
  z0, stack, stagger, twist}`. **Stacking**: straight (a prism), AB or ABC
  with a `stagger` slider (1 = the close-packed position), and a `twist` in
  quarter degrees; the note names the lattice (hexagonal close packing, the
  rhombohedral family, face-centred cubic). The square grid stacked is no
  longer the cubic fast path but the `grid` tiling in a `Stack`, so its
  painter switches to the tile painter (the footprint carries over by
  position). The stats line reports the coordination. **Icosahedral** is a
  chip of its own (`sub.shape: "ico"`, radius `sub.icoR` 8–20): it keeps the
  cubic painter, whose columns become unit cubes on the melt floor
  (`ic.voxels`) filled with the rhombohedra whose centroids they contain;
  the stacking rows hide; the stats line counts prolate and oblate.
- **initial condition** — on the grid, a painted height map (`ic: {n, z, h}`;
  heights 0–15, packed two per byte in the URL). It becomes `genome.voxels`,
  offsets from the lattice centre at the melt floor, and replaces the seeded
  nucleus. Presets paint the same footprint on either substrate.
  Presets: plate (what specimens use), wide plate, ring, cross, bar, twins,
  pillar, walled yard. The substrate is fundamental — masons only ever choose
  which lattice site to fill; the shape that emerges is theirs, the geometry
  is not.
- **brain** — the Kossel rates, rim, the five anisotropy weights (−z is always
  0: the melt is above), the walk (patience, mobility, flight), and the laws
  that used to be constants, now `DEFAULT_BRAIN` in `genome.js` and read via
  `genome.brain`: arrive-from-above fraction, sky pull, bond-pull exponent,
  the patch gate (min/full/part), the lip gate (along weight, depth exponent),
  the sky rule and lip rule toggles, the cool-down allowance. "Load specimen
  №" imports any seed's laws onto the painted substrate.
- **colony** — starting size plus `DEFAULT_POPULATION` overrides via
  `genome.population`: `birthEvery` (a mason born per N bricks, up to `max`),
  `retireAfter` (a mason leaves after N bricks, down to `min`).
  `Growth.population()` runs after any tick that laid bricks; retirements
  wait until the mason is in the melt. Born masons get fresh ids.

Edits apply **live** (`Lab.applyLive` rewrites `brain`, `pop`, `axis`, `rim`,
`K`, and the genome's budget/walk/oxide on the running `Growth`) except the
initial condition, colony size and seed, which reset. The URL hash `#s=…` is
the full state (base64url JSON); **reset replays it from scratch, and that
replay is what the link reproduces** — the HUD says "edited live" until you do.

**Permalink safety.** All of this merges over defaults that equal the old
hard-coded constants, and the selftest pins four seeds' first 2000 bricks to
**golden hashes**. If those fail, you have re-rolled every specimen.

## API (`worker.js`)

CORS-open, pure compute, the same engine module the page runs:

- `GET /api/crystal?seed=N[&n=M|&full=1]` — `{ seed, genome, complete, ticks, bricks: [[x,y,z,tick,mason]…], stats }`. Default 3000 bricks (a full crystal is a few seconds of CPU); the first *n* bricks of a crystal are a prefix of the full one.
- `GET /api/genome?seed=N` · `GET /api/health`

## Things worth knowing before editing

- **Any change to `crystal.js` decision code or a `genome.js` range re-rolls
  every permalink.** The selftest will still pass (it checks properties, not
  a golden sequence). If you must, say so in the commit.
- The stall cutoff (20 000 idle ticks, 1 500 while cooling) is what ends a
  crystal that cannot grow further; the selftest's "reached 2500 bricks" line
  is the canary for a genome corner that stalls.
- `fed` is the hot path. It only runs after the cheap Kossel draw passes, so
  most mason-ticks never call it; keep that order.
- Tuning was done by rendering, not by ASCII: serve `bismuth/` with any static
  server that maps `/c/<n>` to `index.html` and screenshot
  `/c/<seed>?instant=1` with headless Chromium
  (`--use-gl=angle --use-angle=swiftshader`).

## Deploying

Pushes to `claude/bismuth-crystal-procgen-g6t0dh` that touch this surface's
paths trigger [`.github/workflows/deploy-bismuth.yml`](../.github/workflows/deploy-bismuth.yml).
The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**. Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md)
first, especially the golden rule: the `wrangler.jsonc` `name` must be the
worker that owns the live custom domain, or the deploy goes green while the
site never changes. First deploy binds `bismuth.mino.mobi (custom domain)` —
confirm that line in the run log.
