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
| `js/level.js` | `level(n)` → slab, packs, bucket offset; `world(lv)` → the Growth; `survey(lv)` → how high a naive stack reaches; `bucketOf`, `bucketCells`, `inBucket` |
| `js/physics.js` | the body: sweep-and-resolve AABB, jump, `pushOut` (ride a brick laid underfoot), `raycast` (the crosshair's cell and face) |
| `js/oracle.js` | a module Worker that runs the survey off the main thread |
| `js/{prng,genome,crystal,prism,render,tilings}.js` | **synced copies** of `packages/bismuth/` — never edit here; `scripts/sync-dataviz.mjs --check` fails the deploy if they drift |
| `worker.js` | `/l/<n>` → index.html; `/api/level?n=…[&bucket=1]`; `/api/health` |
| `hopper.selftest.mjs` | levels are permalinks, the world is a frozen slab, the survey reaches, the bucket lands, the body jumps one layer and not two; golden reaches for levels 1–3 |

## How a level works

- **The world** is a `Growth` whose colony 0 is the slab (an explicit voxel
  list at `SLAB_Z`), frozen at birth: `growth.done` is true and nothing grows
  until the player deploys. The level's own genome gives the slab its oxide.
- **A pack** is a specimen's laws (`genome(packSeed)`: habit, kinetics, rim,
  axis, oxide) with a crew of 8–16 and a budget of 900–1500 bricks, landing as
  a 3×3 or 5×5 plate one thick. It is passed straight to `growth.deploy`, so
  its colony draws from `stream(packSeed, "growth:<idx>:<tick>")`.
- **Deploy** lands the plate on the *top plane of the column* under the
  crosshair (or underfoot, aiming at the void). `Growth.deploy` freezes every
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
- **The bucket** is not in the lattice. It is a 5×5 floor and three rings of
  wall (`bucketCells`), drawn by the renderer as a *prop* (`setProps`, matte
  amber with a pulse) with a beam of beacon motes rising out of it, and
  collided with by the body via the game's `solid()` (lattice occupancy OR
  bucket cells). Masons never see it; a growth can pass through it. Win:
  feet inside the interior, on the ground (`inBucket`).
- **The body** (`physics.js`): 0.6 wide, 1.8 tall, eye at 1.62; gravity 26,
  jump 7.6 (apex ≈ 1.11 layers: clears one, never two), walk 4.6; 1/120 s
  substeps so terminal velocity never tunnels. A brick laid where the body
  stands lifts it (`pushOut`) — standing on a growing plane is a way to rise.
  Falling below `SLAB_Z − 16` respawns on the slab; the crystal keeps.
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
fast · R restart · H how · Esc pause. Touch: left half = stick, right half =
look, buttons for jump / deploy / break / pack / fast / pause.

## Verifying a deploy

The workflow greps `/l/1` for "a slab in the void" and `/api/health` for
`"ok":true`; the wrangler log must bind `hopper.mino.mobi (custom domain)`.
Locally: `node hopper/hopper.selftest.mjs` (~10 s) and
`node packages/bismuth/crystal.selftest.mjs` (~40 s); a headless Chromium
against a static server that maps `/l/*` to `index.html` renders the slab.

## Quirks

- `/l/<n>` must be rewritten to `/`, not `/index.html` — the assets layer
  307s `/index.html` and the level would be lost.
- The survey golden: changing the engine, `pack()`, `level()`, or the slab
  moves every bucket. That is a campaign re-roll; do it on purpose and re-pin
  with `node hopper/hopper.selftest.mjs --pin`.
- `Growth.deploy` lands the plate regardless of support; a plate aimed at a
  column top near the lattice margin (3 cells) loses the cells outside it.
