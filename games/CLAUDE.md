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
  spherical Delaunay; Lloyd-relaxed). An irregular mesh is measurably *less*
  guess-free than a regular one, so every board is proved solvable by an exact
  solver from the first tap before it ships. The readout counts the moves that
  weren't certain when you made them. Also on a Voronoi torus (`js/torus.js`:
  the flat torus's Voronoi diagram, drawn as a donut whose skin slides, or as
  its exact flat map). Canvas 2D, no build. See [`orb/README.md`](orb/README.md).
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
  milliseconds. Borrows `../onecoast/js/geo.js`. Hints are earned with words
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
`/tempest/`, `/orb/`, `/strand/`, `/onecoast/`, `/skein/`, `/twelve/` and `/pressure/` are all **pure
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
