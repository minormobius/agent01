# games — games.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Multiplayer party games for Bluesky, with real-time rooms orchestrated by Durable Objects.

## Facts

| | |
|---|---|
| Surface | `games` |
| Dir | `games/` |
| Endpoint | `games.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/minesweeper-voronoi-mesh-4hc4ir` |
| Deploy | `.github/workflows/deploy-games.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "games"`.

## How it works

Three things live here:

- **the Jackbox-style party platform at `/`** — phone+TV, OAuth rooms,
  `RoomCoordinator` DO. Games are markdown in `games/games/`, compiled by
  `engine/runtime.js`; the catalogue is the hand-maintained `games/index.json`
  (the ASSETS binding exposes no directory listing).
- **The Ludographer at `/gen/`** — a borges-shaped procedural board-game
  catalogue (seed n -> a complete, coherent, deterministic board game: theme,
  board, mechanics, components, rulebook, win condition, twist).
- **Hold the Line at `/horde/`** — a one-thumb horde-defence game: six arcs, a
  gun that overheats, and a timed upgrade choice after every wave. Seeded, so
  `?seed=` is a permalink to a run. See [`horde/README.md`](horde/README.md).
- **Telegraph at `/telegraph/`** — a perfect-information tactics puzzle: every
  enemy shows the tile it will hit, and you never have enough actions. Its
  companion piece to `/horde/`, built from the opposite direction — no clock, no
  hidden state, so a turn can be searched exhaustively and the game can tell you
  how many of your options were right. See
  [`telegraph/README.md`](telegraph/README.md).
- **The Ratchet at `/ratchet/`** — a road crossed once with single-use tools.
  Third in the family; its solver answers "does any future still complete this
  road" after every choice and stays silent until the run ends, then names the
  move that actually killed it. See [`ratchet/README.md`](ratchet/README.md).
- **Switchboard at `/switchboard/`** — six lines, one operator, and a shift
  visible in full before the clock starts. The family's real-time game WITH an
  exact optimum: the shift is a scheduling problem, so a bitmask DP gives the
  best possible board and the shortfall is denominated in points. See
  [`switchboard/README.md`](switchboard/README.md).
- **Outbound at `/outbound/`** — The Ratchet rebuilt around a body, set in the
  Europan ice war of the twenty-fourth century: the tools are a named crew,
  spending one is a person going outside into Jupiter's radiation belt, and two
  trips is all anyone has in them. The setting is load-bearing — it gives the
  central number a physical cause instead of an abstract one. Same solver, same perfect information —
  what changed is that the resource has a name and the run leaves a log you can
  scroll back through. Its `rest` action is the one move that could have made
  the state graph cyclic; the selftest walks ~22k reachable states to prove it
  did not. See [`outbound/README.md`](outbound/README.md).
- **Tempest at `/tempest/`** — a Tempest whose levels are *proved before they
  ship*. Sixth in the family and the first written in **Rust**: the engine,
  the exact solver and the generator live in
  [`tempest/core/`](tempest/core/) and compile to a committed 64 KB
  `tempest.wasm`. Every wave in `levels.json` carries a certificate — a play
  that holds the rim, from **every lane** the previous wave could have left you
  in — and the difficulty curve is a band on a measured quantity (ticks of
  slack), not a set of knobs. Its readout is the family's newest shape of
  correctness: a *direction*, priced in ticks. See
  [`tempest/README.md`](tempest/README.md).
- **Orb at `/orb/`**: Minesweeper on a sphere of Voronoi cells (convex hull =
  spherical Delaunay; Lloyd-relaxed, then sites nudged until no wall is under a
  quarter of the median: `evenWalls`, opt-in, so Strand's meshes are untouched). An irregular mesh is measurably *less*
  guess-free than a regular one, so every board is proved solvable by an exact
  solver from the first tap before it ships. The readout counts the moves that
  weren't certain when you made them. Also on a projective plane (antipodal
  pairs of sphere cells, `buildProjective`), and on a Voronoi torus and a Klein
  bottle (`js/torus.js`: Voronoi diagrams of the flat torus and of the flat
  Klein bottle, whose gluing flips; drawn as a donut, the Clifford torus (4D,
  stereographically projected) or the classic bottle, all with a skin that
  slides under a fixed cursor, or as the exact flat map), and on a double torus
  (`js/hyper.js`: genus 2, so hyperbolic; a Voronoi diagram of the 45° octagon,
  scrolled through the Poincaré disk, or bent onto a pretzel in 3D by
  `js/pretzel.js`, a harmonic map built on the Bolza surface's hyperelliptic
  symmetry). Canvas 2D, no build. See [`orb/README.md`](orb/README.md).
- **Fathom at `/fathom/`**: Minesweeper in 3D. Sea mines in nested shells of
  Voronoi cells (each shell Orb's `buildMesh`); a number counts its ring and
  every cell it overlaps on the shells just above and below (bricks, ~10
  neighbours), so information crosses the layers. Zeros flood within their
  own shell, the water is denser with depth, and the goal is to dive to the
  core (or clear it all). Drawn as a perspective cutaway: pinch through the
  shells, look down through opened cells. Plays with Orb's rules, solver and
  no-guess generator unchanged (`mesh.flood` and `mesh.weight` are opt-in
  hooks there). See [`fathom/README.md`](fathom/README.md).
- **One Side at `/oneside/`**: a maze chase on a Möbius strip. The maze is
  painted on the strip's double cover (both faces of the paper: a band twice
  as long, `back(x, y) = (x + L, H − 1 − y)`). The ghosts walk the maze on the
  other side of the paper: bound by the maze half a strip away, targeting
  through the twist, catching you through the paper; you see them glide
  through your walls along its faint rails. And there's only one side: walk
  half a strip and you're on their maze. Arcade ghost minds; a 3D band view.
  See [`oneside/README.md`](oneside/README.md).
- **Bucky at `/bucky/`**: logic gates on C60. Every atom has three bonds,
  which is exactly a two-in, one-out gate or a one-in, two-out splitter.
  Arrows that meet join, and a join is an OR (so no OR part); the rules are
  the ball's and the same on every level, never there to block one answer.
  Synchronous, one tick per atom, so loops are delay lines and a NOT in a
  pentagon is a clock. Twelve levels from a wire to an SR latch and a
  three-sensor boot; every edit re-runs the level's truth table. Par is the
  fewest parts a randomized router found (`tools/bake.mjs` → `js/par.js`),
  re-checked by the selftest. See [`bucky/README.md`](bucky/README.md).
- **Ecumene at `/ecumene/`**: a transit game on a small planet from mappa's
  engine (`js/mappa-engine.js`, a byte-identical copy; the selftest fails on
  drift). Towns grow where the water is; each year a Dijkstra per settled
  zone over roads and the player's lines gives gravity demand, logit mode
  share, and transit trips assigned to ride segments, so every line knows
  its load and strands what it can't carry. A zone's ceiling scales with
  its reach (access to jobs) and its water, so a line grows the city along
  it, which the selftest measures with a counterfactual on three worlds (+21% on average). Dense
  zones split and the spherical Voronoi is rebuilt (`ORB.voronoi`, now
  exposed by `orb/js/sphere.js`). The sim runs in a module worker; it names
  its towns and keeps a log of events. Commodities (`js/freight.js`): food grown
  on open country and ore mined at geology-placed deposits, traded between
  towns through a market: a price per town, found by successive averages,
  goods flowing by road, ship or the player's freight wagons to where they
  net the most, and a toll on a full line that is its margin; dear food
  draws farmers, a hungry city stops growing, dear food pays for better farms
  (know-how per town, faster with ore, spread by trade and faster by rail), and the selftest measures a
  freight line feeding one and the prices' no-arbitrage condition. The economy is ramped (a charter round your home
  city, widened by riders and a fee; prices that follow the world's wealth;
  dearer building in dense cities; a levy on fares; ships for coastal
  freight) and measured by `test/economy.mjs`. Farmers live on the land (their numbers set by
  what it yields, falling as farms mechanize) and the countryside empties into
  the cities. The ground is WebGL (`js/gl.js`: biomes blended across tiles,
  lit relief, a shaded sea; `?gl=0` falls back to 2D), rivers follow district
  boundaries and end at the coast, and deep zoom shows a city's blocks and
  buildings. Lines are shaped as you go: build from either end, stops put in
  on the track, loops (no turnbacks), and interchanges where two lines share a
  stop (a quick change, and jobs gather there). A run is a century
  (1900–2000) scored by the hours its trains give back against the road,
  with a report against the same planet run without a railway in a second
  worker; track grades cap how closely trains follow (single, double,
  electric, rapid), and from 1912 the car speeds up the roads. See
  [`ecumene/README.md`](ecumene/README.md).
- **Strand at `/strand/`**: Flow on a sphere, on C60's atoms and panels and
  on Voronoi spheres, and on the torus (a carbon nanotorus, honeycomb and
  Voronoi tori, drawn with Orb's `torus.js`). Panel levels are carved with walls and bridges by a
  solver until exactly one answer is left; levels are baked
  (`tools/bake.mjs`) into a committed `js/levels.js`, and the selftest
  re-proves each one unique. Borrows `../orb/js/sphere.js` and `torus.js`, so a
  change there is checked by Strand's selftest too. See [`strand/README.md`](strand/README.md).
- **One Coast at `/onecoast/`**: a tile-laying world builder on the icosahedral
  Goldberg spheres (C60–C240). Land/sea sides, free placement with cliffs,
  scored by coastlines (one continent + one ocean = exactly one coast). The bag
  is a generated perfect world, which the selftest proves reachable through the
  rules. The atelier paints worlds freely and exports a token that mappa grows
  into a planet (`mappa/lib/coast-mask.js`; `mappa/lib/onecoast/` holds
  byte-identical copies of `geo.js` and `world.js`, which our selftest checks).
  See [`onecoast/README.md`](onecoast/README.md).
- **Skein at `/skein/`**: a word search wound round a Goldberg sphere (C80,
  C180, C240), in the manner of NYT Strands. Every tile is a letter of exactly one
  theme word, and the theme itself (the span) runs between two antipodal pentagons.
  Boards are generated in the page from a seed, so the daily ball is the date.
  Each board is proved by an exact-cover solver to have exactly one answer, in
  milliseconds. Also on honeycomb tori (32, 72, 128 tiles), where the span runs
  between two tiles half way round both ways; drawn as the flat map or the
  donut with Orb's `torus.js`. Borrows `../onecoast/js/geo.js` and
  `../orb/js/torus.js`. Hints are earned with words
  from `dict/words.txt`, which is derived from `words/dict/enable1.txt` by
  `tools/dict.mjs`; the selftest checks it is current. See
  [`skein/README.md`](skein/README.md).
- **Twelve at `/twelve/`**: 2048 on the buckyballs (C60–C240). A sphere has no
  global "that way" (the hairy ball theorem), so drains replace walls: a move
  picks one and every tile pours toward it. There are two flows. **Gravity**, the
  default, takes the steepest way down; contested cells go to the nearer tile,
  and an aiming preview shows every landing. **Vortex** (C60/C80) turns each
  pentagon into five spiral arms that partition the cells, so each arm is a row
  of 2048. Bigger spheres add drains on the icosahedron's 3-fold axes (C180) or
  2-fold axes (C240), plus rain (one more new tile a move every 100 moves);
  otherwise they're too roomy to ever end. `test/analysis.mjs` measures every
  board and flow against classic 2048 using the same simulator. Borrows
  `../onecoast/js/geo.js`. See [`twelve/README.md`](twelve/README.md).
- **Pressure at `/pressure/`** — the hub for the whole family: the thesis behind
  them, what each one can measure about a decision, and briefs for the two still
  unbuilt. A single hand-written page. Start here before adding another game
  to this family: [`pressure/README.md`](pressure/README.md).

`/gen/`, `/horde/`, `/telegraph/`, `/ratchet/`, `/switchboard/`, `/outbound/`,
`/tempest/`, `/orb/`, `/fathom/`, `/oneside/`, `/bucky/`, `/ecumene/`, `/strand/`, `/onecoast/`, `/skein/`, `/twelve/` and `/pressure/` are all **pure
static** (no worker or DO changes) and serve through the existing assets
fallback in `games/worker.js`. That is the pattern to copy for anything new that doesn't need a room: a
directory, its own script tags, no build step.

`/tempest/` is static in the same sense, with one wrinkle worth knowing before
you touch it: its engine is **Rust compiled to wasm and committed**, not built
at deploy time. That keeps `deploy-games.yml` free of a Rust toolchain — the
deploy stays a `wrangler deploy` and nothing else — at the cost of the artefact
being able to drift from its source. `tempest/test/golden.json` closes that:
`cargo test` asserts the Rust reproduces it and the node selftest asserts the
committed wasm does. Rebuild instructions are in
[`tempest/README.md`](tempest/README.md#why-the-wasm-is-committed); the Rust
side also has its own CI at `.github/workflows/tempest-core.yml`, which
deploys nothing.

### Testing the static sub-games

They all carry node tests that need no browser, because their engines are plain
IIFEs attaching to `globalThis` — importing them for side effects is enough:

```bash
node games/horde/test/horde.selftest.mjs         # invariants; preflight runs this
node games/horde/test/balance.mjs 400            # difficulty-curve report
node games/telegraph/test/telegraph.selftest.mjs # invariants; preflight runs this
node games/telegraph/test/analysis.mjs 40        # choice-tightness report
node games/ratchet/test/ratchet.selftest.mjs     # invariants; preflight runs this
node games/ratchet/test/analysis.mjs 40         # difficulty + foresight report
node games/switchboard/test/switchboard.selftest.mjs  # invariants; preflight runs this
node games/switchboard/test/analysis.mjs 40      # shortfall-from-perfect report
node games/outbound/test/outbound.selftest.mjs   # invariants; preflight runs this
node games/outbound/test/analysis.mjs 25         # difficulty + foresight report
node games/outbound/test/sweep.mjs 12            # parameter sweep — slow (~15 min)
node games/tempest/test/tempest.selftest.mjs      # invariants + the wasm drift gate; preflight runs this
node games/orb/test/orb.selftest.mjs             # mesh, solver vs brute force, generator; preflight runs this
node games/orb/test/analysis.mjs 300             # guess-free rate: Voronoi orb vs square/hex grids (~3 s)
node games/fathom/test/fathom.selftest.mjs       # the onion's layers, flood and depth rules, every size proved guess-free
node games/oneside/test/oneside.selftest.mjs     # the surface and its back, the maze, the through-the-paper rules
node games/bucky/test/bucky.selftest.mjs         # C60, the clock's claims, every level's par design passes
node games/bucky/tools/bake.mjs                  # re-bake Bucky's pars (minutes)
node games/ecumene/test/ecumene.selftest.mjs     # mappa copy current, mesh and splits, determinism, crowding, no runaway, the log, a line's reach, the economy's rules, fares, loops and interchanges, track grades, the car, the century's score
node games/ecumene/test/loop.selftest.mjs        # the claim: a line grows the city along it, on three worlds
node games/ecumene/test/market.selftest.mjs      # freight feeding a hungry city, the market's prices and tolls, farms answering the price
node games/ecumene/test/farms.selftest.mjs       # farm know-how: a century on the planet still eats; know-how travels by rail
node games/ecumene/test/economy.mjs 60            # the economy oracle: bots play headless, the money curve per world (~2 min)
node games/strand/test/strand.selftest.mjs       # boards, solver vs brute force, every shipped level unique; preflight runs this
node games/strand/tools/bake.mjs                 # re-bake Strand's levels (minutes)
node games/onecoast/test/onecoast.selftest.mjs   # maps, the perfect world is reachable, coast continuity, mappa copies
node games/skein/test/skein.selftest.mjs         # every theme on every sphere: a board, proved one answer; rules; word list current
node games/twelve/test/twelve.selftest.mjs       # drains per board, both flows' invariants, 2048 row cases, rain, the balance claim
node games/twelve/test/analysis.mjs 40           # random/greedy reach, every board and flow, vs classic 2048 (~30 s)
node games/gen/test/smoke.mjs                    # Ludographer coherence sweep
```

Tempest's analysis lives in its Rust crate rather than in a `.mjs`, because the
solver it reports on is the same code the game runs:

```bash
cd games/tempest/core
cargo test                                    # ~90 invariants, ~20s
cargo test -- --ignored                       # the whole curve, every lane — minutes
cargo run --release --bin tempest -- sweep 12 4   # THE BALANCE REPORT (~12 min)
cargo run --release --bin tempest -- audit        # re-derive every promise in the pack
cargo run --release --bin tempest -- level 42 7   # one level and its certificates
```

The analysis reports are built on
[`packages/pressure-lab/`](../packages/pressure-lab/), which owns the parts every
game in this family needs — policy spreads, tightness bands, the
generate-check-repair loop — and encodes as warnings the traps these games fell
into. It is **not** a solver: what "correct" means differs per game, which is the
whole point of the family. Read its README before adding another.

`/outbound/` also carries a **parameter sweep** (`test/sweep.mjs`). Reach for it
rather than tuning by feel: four consecutive changes to that game's numbers each
looked like an improvement and each made the decisions emptier, which only the
sweep showed.

`preflight` picks up `*.selftest.mjs` under any directory this branch touched,
so a change under `games/` runs every one of these selftests automatically. The reports
are *measurements*, not pass/fail — read each after moving any number in that
game's config or generator. They take a minute or so.

The reports do not run in CI. The **selftests** do, via preflight — and
Tempest's is the one that matters most there, because it is the only thing
standing between a stale `tempest.wasm` and a site that silently plays a
different game from the one its certificates describe.

## Deploying

Pushes to `claude/minesweeper-voronoi-mesh-4hc4ir` that touch this surface's paths trigger [`.github/workflows/deploy-games.yml`](../.github/workflows/deploy-games.yml).

Ownership moved here from `claude/procedural-board-games-iFAiZ` when /horde/ was
added, again to `claude/tempest-procgen-game-vwj0f1` when /tempest/ was, and
to `claude/minesweeper-voronoi-mesh-4hc4ir` when /orb/ was (checked with
`scripts/take-ownership.mjs`: every file the old owner shipped had landed) — a
surface has exactly one owning branch (`main` deploys nothing), so whichever branch is
actively shipping this surface holds it. Change it in
[`deploy-registry.json`](../deploy-registry.json), never in the YAML, then
`node scripts/preflight.mjs --fix` to rewrite the trigger.
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
