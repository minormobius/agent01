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
| `js/run.js` | **a run**: the world on its clock (`Run.tick`), the event log (`deploy`, `remove` with their clocks), the weather (`WEATHER`: a wave of grazers with every pack, recycling on), replay (`advanceTo`), continuation (`Run.continueFrom`), the record and its codec (`encodeRecord` / `decodeRecord`: JSON → deflate-raw → base64url), the ghost (`ghostAt`), the published-run read (`fetchRun` from the public appview) |
| `js/oracle.js` | a module Worker that runs the survey off the main thread |
| `js/auth.js` | a **synced copy** of `packages/oauth-client/auth.js` — publishing a run to the player's own PDS |
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
- **The clock.** The game never steps the growth directly: `Run.tick(n)`
  advances the world's clock, stepping the growth while it is live and the
  worms always. Pacing is still bricks per second (60, ×6 holding F) with a
  7 ms/frame budget; once nothing grows, the worms get `IDLE_TICKS` (240) a
  second. Every deploy and break is logged with the clock it happened at.
- **Weather** (`?w=1`, the chip on the level card, kept in `localStorage`):
  with worms on, `Run.deploy` releases a wave on the plate the pack landed
  as (`Worms.releaseAt`; `WEATHER`: 4 grazers, speed 0.06, bite 0.06,
  `exposed 4` so edges and treads are edible, `depth −1`, recycling on).
  That is far above the study's defaults on purpose: a run is tens of
  thousands of ticks, not hundreds, and the wave should be seen — about
  5–9 bricks a second eaten while a pack grows (a seventh of the laying,
  refunded to the colony) and 1.6 a second from frozen terrain at the idle
  clock. They eat exposed bricks — the treads — and feed the live colony
  with what they eat, so a growth under weather lasts longer while the
  frozen terrain loses its edges. A worm's head in the body (within 0.9 laterally, 1.4
  vertically) costs a heart, shoves the player, and grants 1.4 s of grace;
  three hearts and you respawn. The study (`packages/bismuth/PHASE.md`) is
  where those numbers come from; on the skeletal tilings (Penrose, kagome,
  Ammann) the same worms find half the crystal edible and bloom — the
  threshold should become a fraction of coordination before weather is
  turned on there by default.
- **Records.** A world is a seed plus an event log, so a finished run is a
  record: `{v, n, shape, worms, clock, t, parent, events, path, result}`,
  with the path sampled every 0.2 s as `[tenths, clock, x·100, y·100, z·100,
  yaw·100, pitch·100]`. `encodeRecord` deflates it into a few kilobytes of
  base64url; "share this run" puts it in the link as `#r=…`; the best run
  per level/substrate/weather is kept in `localStorage` (`hopper:run:<key>`).
  `validateRecord` checks anything that arrives from a URL or a PDS.
- **Replay** (`#r=` → the record overlay → watch): real time drives the
  recorded clock through the path samples, so the crystal grows at the pace
  it grew and the ghost walks at the pace it walked; `advanceTo` applies the
  events at their clocks; the camera is the ghost's eyes (V for a free
  spectator body, drawn as three pale motes when detached). The selftest
  pins that a replay reproduces the run brick for brick and worm for worm.
- **Continue** (`Run.continueFrom`): the record replayed to its end, every
  colony frozen, the events kept as the new run's prefix (`parent`), a fresh
  pocket. A continuation's record replays the whole lineage.
- **Publishing** (`?pds=1` or `localStorage hopper:pds=1` to try it): the
  record goes to the player's own repo as `com.minomobi.hopper.run` through
  the shared OAuth worker (`packages/oauth-client`); `?run=at://…` fetches a
  published run from the public appview (`fetchRun`). The origin is covered
  by the worker's `*.mino.mobi` wildcard; the collection is added to
  `WRITE_COLLECTIONS` in `workers/auth/src/oauth/scope.ts` on this branch
  and lands only when the auth worker deploys from its own owning branch —
  until then a login with that scope is refused, so the button stays gated.
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
