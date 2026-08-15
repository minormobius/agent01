# foam — CLAUDE.md (first person in the voronoi foam)

You are working on **foam**, the first-person interactive space inside the
rind's voronoi foam, at `foam.mino.mobi`. The rind ([`rind/`](../rind)) models
the foam as *structure*; foam is the same idea *inhabited* — you stand inside a
chamber, the membranes seal every face around you, and the shiva tools let you
shatter and re-weave them, up close. The design brief it grew from: a
first-person view into the foam, toggleable membranes, a tight close-up on
membrane creation/destruction, heading toward a puzzle platformer — with mobile
AND desktop performance a hard requirement.

**Three pages, one kernel.** `/` (index.html) is the tight puzzle pocket.
`/macro/` (macro/index.html, `<body data-mode="macro">`) is the same
`app.js` with hall-scale generation (4×4×(3+1) chambers of 20 m × 9 m),
faster walk, longer tool reach — and the third shiva tool, **plant** (Q /
middle click / ✦): insert a voronoi node and the whole lattice reforms
around it via the kernel's `reformPocket` — open membranes carry over by
chamber pair, the new chamber's membranes weave in staggered, planted
chambers render amber-shifted (`baseSeedCount` marks them — the hook for
the coming CELL TYPES: sources, sinks, defenses). All pocket-derived render
and physics data rebuilds through `installPocket`, so more reform-driven
mechanics can reuse the same path.

`/dungeon/` (dungeon/index.html) is the **dungeon generator** — the same foam
read as a dungeon instead of a puzzle. The entrance is the pocket's certified
top-layer target chamber; n ENDPOINTS are rolled deep in the foam
(deepest-lying reachable basins, greedily spread in plan, seeded rng); one
path per endpoint is wayfound over the certified crossing graph — shortest by
door count, and among equally short continuations always the **maximal
gradient down** (the puzzle's oracle climbs; the dungeon descends). Each
room's floor is then discretized into square-grid or hex tiles on a single
global lattice at a chosen scale relative to the chamber scale, every tile
carrying the exact floor-plane height under its centre. The page renders a
three.js CAD view (foam ghost wireframe, tiled rooms shaded by depth, door
membranes, one tube per path, endpoint beacons) plus a room-by-room explorer
(2D tile map, lettered doors, walk along a path). three.js is **vendored** at
`vendor/three.module.min.js` + `vendor/OrbitControls.js` (pinned 0.160.1,
loaded via importmap) — no build step, no CDN. URL hash carries
seed/n/shape/scale for shareable dungeons; `window.__dungeon` is the headless
harness hook (the `__foam` pattern) — keep it.

The dungeon **exports** (page EXPORT panel; `dungeon/FORMAT.md` is the public
contract): canonical `foam-dungeon` JSON (rooms, tiles with floor heights,
doors, paths, wall outlines), Universal VTT `.dd2vtt` (walls as
line_of_sight, doors as portals, baked PNG — imported by Foundry/Arkenforge/
Fantasy Grounds), and a plain map `.png`. One top-down renderer serves the
page's ⊞ plan overlay AND the baked exports, so what you preview is what
ships. `dungeon-export.mjs` computes wall outlines on an exact integer corner
lattice (grid i,j; hex doubled-coordinate corners) so shared edges cancel
without float tolerance. The worker serves `.mjs/.js/.json` with
`access-control-allow-origin: *` so other services can import the generator
modules directly. A flat export of a 3D dungeon overlaps rooms that stack
vertically — the canonical JSON keeps full 3D; slice by depth if you need
clean per-level maps.

`/dungeon/crawl/` is the **room's-eye crawler**: three.js view of the current
room only (tiles at true floor heights, walls extruded from the canonical
outlines, doors as glowing columns at their certified stations), token
stepped by click/WASD over the crawl layer's graph, fog-of-war minimap,
win state when every endpoint is found. Movement is budgeted VTT-style
(`reachableWithin` in the crawl module): the movement slider sets
tiles-per-turn, legal squares light shaded by cost, in-reach doors glow,
clicking a lit tile walks the shortest path (each step visibly consumed),
end turn refreshes the budget. Dungeon `SIZES` (s/m/l/xl, dungeon.mjs) set
the pocket dims and ride the permalink `size` param; absent = m = the
original geometry, so old permalinks are unaffected. Golden pins hash only
the geometry-bearing export subset, so metadata additions don't shift them.
The crawl page plays the content roll: hp/gold, bump combat (enemies
retaliate and chase within the current room on end turn, never onto door
tiles — a camped door would soft-lock), traps trigger on step, obstacles
block movement, death and cleared overlays. `⚄ roll` rerolls content only. It shares the generator's permalink
hash and loads exported .json files. **Permalinks are a contract**:
`DUNGEON_VERSION` (dungeon.mjs) is stamped into the URL hash and every
export, and the selftest pins golden signatures of seeds 1/2/5 — a change
that moves any layout must bump the version and re-pin, never re-pin alone.
`window.__crawl` is the crawl page's harness hook (an automated bot BFSes
the page's own graph and replays it to an endpoint) — keep it.

## The files

| File | What it is |
|---|---|
| `foamworld.js` | **the kernel** — seeded pocket generation + the walk certificate. Layered, anisotropic 3D Voronoi (convex cells by half-space clipping, global epsilon-weld so the complex is watertight), every shared face extracted as a MEMBRANE, and a nav graph under the movement rules (below). `generatePocket({seed})` retries salts until the certificate proves start → target solvable, so **every published seed carries a constructive proof**. Factored as `buildComplex` (geometry from ANY seed list) + `buildNav` (pocket or fixed start/target modes), which is what powers `reformPocket(pocket, point)` — deterministic node insertion with the same closure gate and a re-derived oracle. Runs in node and the browser — the selftest and the game consume the same module. |
| `app.js` | **the game** — WebGL2 renderer (one sorted-alpha membrane draw, no depth buffer, per-face state in an RGBA32F texture, x-ray edge pass, adaptive-resolution governor), walker physics (support probe + plane clamps driven by the same face classification the certificate uses), the shiva tools (raycast → per-face dissolve/growth animations in the fragment shader), touch + pointer-lock input, HUD. |
| `dungeon.mjs` | **the dungeon layer** — a pure consumer of the kernel (no kernel change): `generateDungeon({seed, endpoints, tileShape, tileScale})` rolls endpoints, wayfinds descending paths over `pocket.nodes`/`pocket.edges`, and discretizes room floors (`discretizeRoom` is exported separately so the page can retile without regenerating — pass `pocket` in opts for that). Deterministic under the same contract as the kernel. |
| `dungeon-crawl.mjs` | **the crawl layer** — tile-by-tile movement over a canonical `foam-dungeon` document (deliberately the export format, not the live object, so downloaded .json files crawl identically): lattice adjacency (grid 4-n / hex 6-n) with a height gate of `1.05·tileSize + 0.35` (what the certificate's maxGrade permits per tile), deterministic bridging of sampling gaps, door transits via matched far-side tiles. `crawlReport` is what the selftest asserts: every generated dungeon fully crawlable entrance → every endpoint. |
| `dungeon-content.mjs` | **the content layer** — `rollContent(json, {roll})` furnishes a finished map as a SEPARATE seeded pass bound by `layoutSignature`: tile effects (loot / endpoint treasure / hidden traps / impassable obstacles) + agents (enemies typed by depth, `ENEMY_TYPES`). Markers reserved, entrance safe, endpoints guarded + treasured, one thing per tile, and obstacles are safety-repaired so the crawl graph stays complete — all CI-pinned. Rerolling content never touches the map or its permalink (`roll` hash param on the crawler). |
| `dungeon-export.mjs` | **the export layer** — `dungeonToJSON` (canonical `foam-dungeon` v1), `dungeonToUVTT` (`.dd2vtt`; caller supplies the baked base64 PNG — the page renders it, node passes `''`), `roomOutlines` (tile-union wall loops on an exact integer corner lattice), `uniqueDoors`, `planBounds`. Pure geometry, node + browser. |
| `test/dungeon.selftest.mjs` | pins the dungeon contract: determinism, endpoints distinct/reachable/below the entrance, every door on a path is a certified crossing between its recorded rooms, paths shortest with the descent tie-break honoured, tile centres inside their room's own floor with exact plane heights, doors snapped to tiles at every scale, tile DENSITY (no big room starved to the fallback tile — the hex q-band regression), grid + hex, and the export layer (outlines closed + enclosing, canonical JSON deterministic, UVTT geometry inside the map window, one portal per door). Run: `node foam/test/dungeon.selftest.mjs` (~2s, 3 seeds). |
| `test/foamworld.selftest.mjs` | pins determinism, watertightness (per-cell Euler V−E+F=2, volumes sum to the box), membrane pairing/orientation/planarity, and the certificate: route crossings are wall-class with standing clearance, all support faces within grade, par in the puzzle band. Run: `node foam/test/foamworld.selftest.mjs` (~4s, 8 seeds). |

## The movement rules (the honesty contract)

These are enforced **twice from one source**: the kernel's classification
builds the certificate, and the app's physics reads the same fields.

1. **No jumps.** There is no jump input. A crossing through a floor-class
   plane (slope ≤ maxGrade) is never a nav edge — you can fall through a
   shattered floor, never rise through one. A knee-high (≤0.3 m) discrete
   step onto a *different* floor face is a walk, not a jump (dais edges and
   weld seams sit proud); continuous slopes stay grade-limited, and blocked
   diagonals slide along the grade line instead of stopping dead.
2. **Max grade 1.05 (≈46°).** Only faces within grade are support. The
   `aniso` metric (vertical distance weighted 2.2×) keeps grade a meaningful
   discriminator; the climb texture comes from `rampFrac` seeds thrown
   off-layer.
3. **Membranes are the only thing that opens.** Edges are structure and never
   break (the rind rule); the pocket hull (boundary faces) is indestructible.
4. **A crossing must fit a standing body.** Basins are floor faces connected
   through shared EDGES (vertex-only contact is a pinch a body cannot pass).
   Each crossing edge carries a certified STATION `at` on the rim stretch
   where both floors touch the membrane, with local vertical clearance
   (cross-section ≥ clearance+0.2 at the station, not just global top−sill)
   and lateral room (no wall/scarp plane of either chamber within 0.42 of
   the standing column). No station fits ⇒ not a crossing. Every one of
   these body checks exists because an autonomous playthrough bot got stuck
   on a "certified" route without it.

The world: `subLayers` of foam UNDER the start — the ground state is foam,
not a plane; the only flat place is the start **dais** (a finite disk on the
start basin's floor). The player physics deliberately has NO door-frame
clamping against neighbour chambers' planes: it acted as an invisible wall
across certified crossings (see the note in `collide()`). Sealed floors
carry a fall-gated safety net: the ground snap's polygon probe can miss for
a frame at a seam between floor faces and the body used to drop through a
SEALED membrane — the net clamps every solid floor plane of the chamber
while genuinely falling (vy < −2) AND no open membrane is within 1.2 m.
Both gates are load-bearing: an always-on clamp blocked legitimate downhill
doorway crossings, and even the fall-gated one bounced bodies out of
certified drops beside a shattered doorway (both found by the oracle
playthrough bot). The containment stress invariant: with every membrane
sealed, a walker can never change chambers, whatever they do.

Change any of these in one place only: `foamworld.js` option defaults. If you
touch the classification, the selftest must still pass — it is the proof the
game leans on when it prints "par".

## The oracle

`nav` carries the full solvability oracle: `oracle` (the ordered shiva
sequence from the start, length = par), `next[node]` (per-basin next step:
membrane, far node, station `at`, near/far rim floor faces — roomiest door
preferred among equally short continuations) and `distT` (distance to
target). In-game, the **oracle chip / G** marks the next membrane on the
certified route from whatever basin the player is in (basin identity is read
from the support face with 0.6 s hysteresis — an instant read flaps at
chamber rims). Verified end-to-end by an autonomous playthrough bot
(headless Chromium, real physics, no teleports) that follows the oracle to
the win screen — seeds 2, 3, 5 complete fully; the bot's own navigation
still fumbles the odd doorway (e.g. seed 1 leg 12), which is bot steering,
not certificate failure.

## Performance discipline (this matters — more features are coming)

- ONE membrane draw call (sorted back-to-front indices, rebuilt every other
  frame), ONE edge line draw, no depth buffer at all, premultiplied alpha.
- All per-face dynamic state lives in one RGBA32F texture (2 texel rows per
  face: mode/tStart/flags/boundary + hitPoint/radius); animations are
  entirely in-shader — a shatter costs one `texSubImage2D`, not a rebuffer.
- The adaptive-resolution governor (the hoop/v109 pattern) steps the
  drawing-buffer scale down to 0.6× on sustained slow frames and back up.
- Physics is cell-local: support/collision only probe the current chamber and
  its adjacent cells (`adjacent[]`), raycast only chambers ≤2 open hops away.
  Keep it that way — nothing in the hot loop may scan all faces.

## Verifying changes from the sandbox

Headless Chromium drives the real page (SwiftShader): serve `foam/` with any
static server, then walk/shatter/screenshot via playwright — see the session
pattern: assert containment against closed membranes, chamber handoff after a
shatter, `window.__foam` probes (fps, breaches, player). The `__foam` debug
hook is load-bearing for that harness; keep it.

## Deploy

- Push `foam/**` on `claude/foam-dungeon-generator-aoaz0j` (the owning
  branch — see `deploy-registry.json`) → `deploy-foam.yml` runs both
  selftests (kernel + dungeon), then `wrangler deploy`. The sandbox cannot
  deploy; push and let the Action run. **First deploy also creates the custom domain** — verify the log binds
  `foam.mino.mobi (custom domain)` (the golden rule), then that `/` serves
  the game and `/health` answers.

## Where this is heading (agreed direction, not yet built)

**[`FACTORIO.md`](FACTORIO.md) is the design record for the big one** —
summonable sources, processors, defenses and sinks placed into the foam as
Platonic cells, and the certificate work that makes them shippable. It is also
the target for the agent loop ([`../docs/LOOPS.md`](../docs/LOOPS.md)). The
summon primitive is built and pinned: [`solids.mjs`](solids.mjs) +
[`test/solids.selftest.mjs`](test/solids.selftest.mjs). Read FACTORIO.md §1
before touching it — the anisotropic metric rotates a naive constellation by
22°, and a cube looks perfect anyway.

Puzzle-platformer campaign over the pocket family: pocket N links to N+1;
creation puzzles (weave a membrane to seal a hole and walk over it — the
kernel already treats a re-woven floor as support); chunked/streamed pockets
for bigger worlds; par leaderboards. Design against the kernel's certificate:
a mechanic that can't be certified solvable doesn't ship.

## Invariants — do not break

1. **Determinism.** `(seed) → identical pocket` everywhere — no unseeded
   randomness anywhere in `foamworld.js`.
2. **Every published seed is certified.** `generatePocket` must keep refusing
   to return an unproven pocket.
3. **Edges are structure, plates are not.** Shattering never removes frame
   geometry; the hull never opens.
4. **Pure static.** No build step, no dependencies, no D1/DO/secrets.
5. **The kernel is the single source of the movement rules** — the app reads
   its classification; it never re-derives its own.
