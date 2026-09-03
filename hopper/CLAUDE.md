# hopper — climb the crystal, drop in the bucket

`hopper.mino.mobi`. A first-person puzzle platformer built on the bismuth
growth engine (`packages/bismuth/`). You wake on a slab in the void; above
you hangs a bucket. In your pocket, a few packs of mason agents. Lay a pack
on a plane and it grows a hopper crystal from there, brick by brick; climb
it as it grows; deploy again from higher up; get above the bucket's rim and
drop in.

Thin assets Worker (worker `hopper`, custom domain `hopper.mino.mobi`) — no
build, no D1, no AI, no secrets. Deploys from
`.github/workflows/deploy-hopper.yml` on the owning branch in
`deploy-registry.json`.

## Files

| File | What |
|---|---|
| `index.html` | the page: HUD, pocket, height meter, overlays, touch controls, help |
| `js/game.js` | the loop: input (pointer lock, keys, touch), the growth's real-time pacing, the camera, the HUD, deploy and break |
| `js/level.js` | `level(n, shape)` → slab, packs, bucket offset; `world(lv)` → the Growth (cubic, or a Prism over the tiling); `survey(lv)` → how high a naive stack reaches; `bucketOf`, `bucketCells`, `inBucket` |
| `js/physics.js` | the body: nine footprint points asked of a continuous `solidAt(x, y, z)` at every body layer, so the same body walks cubes and prisms; jump, `pushOut` (ride a brick laid underfoot), `raycast` (the crosshair's first solid point) |
| `js/oracle.js` | a module Worker that runs the survey off the main thread |
| `js/{prng,genome,crystal,prism,render,tilings}.js` | **synced copies** of `packages/bismuth/` — never edit here; `scripts/sync-dataviz.mjs --check` fails the deploy if they drift |
| `worker.js` | `/l/<n>` and `/l/<n>/<tiling>` → index.html; `/api/level?n=…[&t=penrose][&bucket=1]`; `/api/health` |
| `hopper.selftest.mjs` | levels are permalinks, the world is a frozen slab, the survey reaches, the bucket lands, the body jumps one layer and not two; golden reaches for levels 1–3 |

## How a level works

- **The world** is a `Growth` whose colony 0 is the slab, frozen at birth:
  `growth.done` is true and nothing grows until the player deploys. On the
  cubic lattice the slab is an explicit voxel list at `SLAB_Z`; on a tiling
  it is a disk of tiles of the same width (`substrate.ic.disk`) over a
  `Prism` of radius 44. The level's own genome gives the slab its oxide.
- **The tiling selector.** `/l/<n>/<shape>` is the same level (same slab
  width, same pocket, same offset — the level stream is drawn identically)
  on prisms over that tiling: any of the ten in `packages/tilings`. Only
  two things differ: prism packs always land two rings wide (`size` 5 —
  one ring of rhombs or triangles can nucleate nothing), and the survey is
  re-run on that substrate, so the bucket hangs where *that* stack reaches.
  World coordinates on a tiling are edge lengths centred on the origin;
  the slab is at (0, 0) and the bucket is clamped inside radius 32. The
  chips on the level card switch substrate; the choice is remembered in
  `localStorage` (`hopper:tiling`) and kept by "next level".
- **A pack** is a specimen's laws (`genome(packSeed)`: habit, kinetics, rim,
  axis, oxide) with a crew of 8–16 and a budget of 900–1500 bricks, landing as
  a 3×3 or 5×5 plate one thick. It is passed straight to `growth.deploy`, so
  its colony draws from `stream(packSeed, "growth:<idx>:<tick>")`.
- **Deploy** lands the plate on the *top plane of the column* under the
  crosshair (or underfoot, aiming at the void) — a lattice column's extent
  map on cubes, a tile's `top[]` on prisms (`columnTop`). `Growth.deploy` freezes every
  colony still growing and makes that plane the new colony's floor: nothing
  is laid beneath it, arrivals aim at the pack's own plate, and its masons
  are coplanar with the player. That is the "reseed from this plane"
  primitive, and the whole game: each deploy is choosing which plane becomes
  the platform for the next growth.
- **The survey** places the bucket. `survey(lv)` stacks the level's packs on
  the summit of each other and runs each to the end; the bucket floor sits at
  `slabTop + rise × climb` (climb 0.66 → 0.9 with the level), offset to one
  side by `off` (4 → 28 cells with the level). The page runs it in
  `js/oracle.js` (a module Worker; inline fallback) — a few seconds on high
  levels — and shows "surveying the void…" until the bucket appears. The
  engine is deterministic, so the bucket is the level's forever; the selftest
  pins the reach for levels 1–3.
- **The bucket** is not in the substrate. It is a 5×5 floor and three rings
  of wall (`bucketCells`) at integer world coordinates on any substrate,
  drawn by the renderer as a *prop* (`setProps`, matte amber with a pulse)
  with a beam of beacon motes rising out of it, and collided with by the
  body via the game's `solidAt()` (the substrate's `siteAtWorld` occupancy
  OR a bucket cell). Masons never see it; a growth can pass through it. Win:
  feet inside the interior, on the ground (`inBucket`).
- **The body** (`physics.js`): 0.6 wide, 1.8 tall, eye at 1.62; gravity 26,
  jump 7.6 (apex ≈ 1.11 layers: clears one, never two), walk 4.6; 1/120 s
  substeps so terminal velocity never tunnels. Collision is point sampling:
  nine points on the footprint at every layer the body spans, asked of a
  continuous `solidAt(x, y, z)`; a move that lands one in a brick is undone,
  a fall lands on the layer below. On cubes that is exact (a cell is wider
  than the sample spacing); on thin rhombs a corner can clip by a few
  hundredths, which is invisible. A brick laid where the body stands lifts
  it (`pushOut`) — standing on a growing plane is a way to rise. Falling
  below `SLAB_Z − 16` respawns on the slab; the crystal keeps.
- **Pacing**: 60 bricks/s real time (×6 holding F), stepped with a 7 ms/frame
  budget like the specimen page; the renderer syncs every frame.
- **Progress**: `localStorage` only — `hopper:reached` (the landing page
  opens the highest level reached) and `hopper:best:<n>`.

## Renderer additions (in `packages/bismuth/render.js`)

`renderer.fp = {eye, yaw, pitch, fov}` switches the camera to first person
(orbit input is ignored while set); `setProps(cells, color)` meshes
non-crystal solids with the cubic mesher and draws them flat; `beacons` is a
list of `[x, y, z, fade]` drawn with the mote shader; `thickness(i)` reads a
deployed colony's own oxide, so each pack wears its own palette.

## Controls

WASD walk · space jump · mouse look (pointer lock; middle-drag without it) ·
E / right-click deploy · click break · 1–6 / scroll choose a pack · F hold
fast · R restart · H how · Esc pause.

**Touch** (a coarse pointer, or the first finger on the canvas, turns it on):
an on-screen controller over the canvas. The left 45% of the screen is a
floating stick — the ring appears where the finger lands, the thumb follows
it with a small dead zone and full speed at the rim; the rest of the screen
looks by dragging; the right-hand buttons are jump (big), deploy, break, and
a small row for pack / fast (toggle) / pause. In touch mode the pocket and
growth bar move up under the title so the controller has the bottom of the
screen. The stick is `pointer-events: none` so the canvas takes the touches;
the buttons take their own.

## Verifying a deploy

The workflow greps `/l/1` for "a slab in the void" and `/api/health` for
`"ok":true`; the wrangler log must bind `hopper.mino.mobi (custom domain)`.
Locally: `node hopper/hopper.selftest.mjs` (~25 s) and
`node packages/bismuth/crystal.selftest.mjs` (~40 s); a headless Chromium
against a static server that maps `/l/*` to `index.html` renders the slab.

## Quirks

- `/l/<n>` must be rewritten to `/`, not `/index.html` — the assets layer
  307s `/index.html` and the level would be lost.
- The survey goldens (levels 1–3 cubic; level 1 on hex and Penrose):
  changing the engine, `pack()`, `level()`, or the slab moves every bucket.
  That is a campaign re-roll; do it on purpose and re-pin with
  `node hopper/hopper.selftest.mjs --pin`.
- A prism survey costs about a second per pack in the Worker (a level-6
  pocket is six or so seconds); the HUD says "surveying the void…" until the
  bucket appears. Prism layers are 96 deep (`PRISM_LAYERS`), so `zMax` is 88
  there against 118 on the lattice.
- `Growth.deploy` lands the plate regardless of support; a plate aimed at a
  column top near the lattice margin (3 cells) loses the cells outside it.
