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
| `js/prng.js` | xmur3 + mulberry32, and `stream(seed, label)` — named sub-streams so the genome and the growth never share state |
| `js/genome.js` | seed → every parameter (habit, masons, budget, rim, Kossel rates, anisotropy, nucleus, oxide palette). Pure. `GRID` (128) and `CHUNK` (16) live here |
| `js/crystal.js` | **the engine** — `Lattice` (occupancy, bond counts, the six extent maps), `Mason` (the agent), `Growth` (the colony: arrival, walk, deposit, cool-down, `stats()`) |
| `js/render.js` | WebGL1 renderer — chunked voxel mesher with baked AO, the thin-film shader, orbit camera, mason motes |
| `js/app.js` | the page: URL ↔ seed, pacing, HUD, keys |
| `js/crystal.selftest.mjs` | ~34k checks, ~12 s. **Run before touching the engine or the genome** |
| `worker.js` | `/c/<seed>` → index.html; `/api/crystal`, `/api/genome`, `/api/health` |
| `index.html` | the page; loads `/js/app.js` as a module (root-absolute, so `/c/<seed>` works) |

**`index.html`, `worker.js` and the selftest import the same `js/crystal.js`.**
There is no second copy and there must not be — the selftest is evidence
about the live page, and the API agrees with the page brick for brick.

```bash
node bismuth/js/crystal.selftest.mjs     # determinism, connectivity, morphology, coverage, API
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

The mesher rebuilds ≤ 12 dirty 16³ chunks per frame; laying a brick dirties
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

## The playground (`lab.html` + `js/lab.js`) — `/lab`

The same engine and renderer with every knob on the outside. Three panels:

- **initial condition** — a painted height map (`ic: {n, z, h}`; heights
  0–15, packed two per byte in the URL). It becomes `genome.voxels`, offsets
  from the lattice centre at the melt floor, and replaces the seeded nucleus.
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
