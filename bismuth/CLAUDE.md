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
| `js/{prng,genome,crystal,prism,render,tilings}.js` | **synced copies of [`packages/bismuth/`](../packages/bismuth/)** — the engine is a package now (hopper.mino.mobi runs the same one). Edit the package, `node scripts/sync-dataviz.mjs --write`; `--check` fails preflight and the deploy if a copy drifts |
| `js/prng.js` | xmur3 + mulberry32, and `stream(seed, label)` — named sub-streams so the genome and the growth never share state |
| `js/genome.js` | seed → every parameter (habit, masons, budget, rim, Kossel rates, anisotropy, nucleus, oxide palette). Pure. `GRID` (128) and `CHUNK` (16) live here |
| `js/crystal.js` | **the engine** — `Growth` (the colony: arrival, walk, deposit, population, cool-down) over a SUBSTRATE; `Lattice` (the cubic substrate: occupancy, bond counts, the six extent maps, the lattice-line terrace scan); `Mason` (the agent) |
| `js/worms.js` | **the worms** — a second wave of agents released *into* the crystal: they tunnel along the bond graph, bite the brick they leave with probability `bite`, and with `recycle` feed it back to the live colony. Deterministic on `stream(seed, "worms")`; substrate-agnostic. Only the playground uses them so far |
| `js/prism.js` | **the Prism substrate** — any plane tiling stacked into layers; bonds, open sky, the walk, arrival rays and the terrace verdict as geometric rays over cached per-tile ray tables |
| `js/tilings.js` | byte-identical copy of `packages/tilings/tilings.js` (kept honest by `scripts/sync-dataviz.mjs --check`) — **edit the package, never this** |
| `js/render.js` | WebGL1 renderer — chunked voxel mesher with baked AO, the thin-film shader, orbit camera (or first person via `renderer.fp`), mason motes, props and beacons for hopper |
| `js/app.js` | the page: URL ↔ seed, pacing, HUD, keys |
| `packages/bismuth/crystal.selftest.mjs` | ~34k checks, ~40 s. **Run before touching the engine or the genome** |
| `worker.js` | `/c/<seed>` → index.html; `/api/crystal`, `/api/genome`, `/api/health` |
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

## The playground (`lab.html` + `js/lab.js`) — `/lab`

The same engine and renderer with every knob on the outside. Three panels:

- **substrate** — the cubic grid or any of the ten tilings (`sub: {shape,
  R}`); on a tiling the painter draws the real polygons and paints per tile
  (`tic: {z, cells}`, three bytes per painted tile in the URL) and the genome
  gets `substrate: {shape, R, ic: {cells}, z0}`.
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
