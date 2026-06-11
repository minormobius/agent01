# knack — an atlas of tiny machine-puzzles

Live: **fable.mino.mobi/knack** · seeded, certified-solvable, graded, no backend.

The second wing of [fable](https://mino.mobi/) (after [puzz](../puzz/)). Same
recipe as mappa and the Ludographer — generate a vast space from a seed, put an
interestingness engine on top — but with the **form loosened**: instead of one
rigid puzzle shape, a single engine takes discrete moves over a grid and resolves
them under a **composable library of mechanics**. Toggle which mechanics are live
and the same engine becomes a different game.

What survives the loosening is the thing that makes the interestingness engine
rigorous: every level has a **verifiable answer**. A breadth-first search over the
engine's state graph either reaches a winning state — proving the level
**solvable** and finding its **optimal length (par)** — or the level is discarded
at birth. So the solver does triple duty: **certify**, **grade** (difficulty from
par + search size + how the route winds), **curate** (rank seeds by an interest
battery). "Watch the engine solve it" replays the exact optimal path.

## Pipeline

```
seed n
  └─ atlas.levelForSeed(n)               deterministic: same n ⇒ same level, for ever
       ├─ bundleForSeed(n)               weighted roll over the six genres
       ├─ generate.generateLevel(rand, bundle)
       │     ├─ bundle.build(rand)       lay out a candidate level
       │     ├─ solver.solve(level)      BFS → solvable? optimal par? search size?
       │     └─ keep iff solvable, par ≥ floor, headline mechanic actually used, interest ≥ threshold
       └─ difficulty.grade(level, solve, path)   → difficulty + interest battery
```

## The engine

A level is a small grid. The player moves up/right/down/left; `engine.step()` is
the deterministic transition. Mechanics compose inside `step()`:

- **push** — shove a crate (no pull; a cornered crate is lost)
- **ice** — slide until a wall stops you
- **keys & doors** — a colored key opens its door
- **buttons & gates** — a gate is open only while a crate (or you) weighs its button
- **pits** — block the player; a crate pushed in fills it to floor
- **arrows** — one-way tiles
- **coins** — collect all before the exit counts

State = `{ player, boxes[], keysMask, coinsMask, filledMask }`; gate/door openness
is a pure function of that state, so no extra bits. The BFS solver explores only
states produced by `step()`, so solvability and par are exactly as trustworthy as
that one function — which the test suite cross-checks by **replaying the solver's
path back through `step()`** and asserting it wins.

## The six genres (bundles)

| Bundle | Mechanics | Win |
|---|---|---|
| **Depot** | push + targets | crates on markers |
| **Frost** | ice | reach exit |
| **Vault** | keys + doors | reach exit |
| **Relay** | buttons + gates + crate | reach exit |
| **Forage** | coins + one-way arrows | all coins, then exit |
| **Tangle** | two of {keys, buttons, coins, arrows} | reach exit |

Constraint kept on purpose: **ice and crates never share a bundle** (their
interaction is a rabbit hole), so every combination that *can* occur is tested.
`Relay` has the lowest generation yield (it needs the optimal path to actually
cross a crate-held gate); when no clean relay is found in budget, the generator
falls back to the best solvable candidate for that seed.

## Files

| File | Role |
|---|---|
| `js/engine.js` | State model + the composable `step()` transition + win test. |
| `js/solver.js` | BFS solver (solvable? par? search size?) + optimal-path analysis. |
| `js/bundles.js` | The six genres: mechanic sets, win conditions, layout recipes. |
| `js/generate.js` | build → solve → filter (the genre-honesty + interest gates). |
| `js/difficulty.js` | Solver stats → difficulty + interest battery. |
| `js/atlas.js` | `levelForSeed`, `rankBand`, `hunt`. |
| `js/render.js` | Canvas renderer: themed tiles, movement animation, win particles. |
| `js/play.js` | Input (keys / swipe / dpad), undo, reset, solution playback. |
| `js/app.js` | Routing, controls, verdict panel, gallery. |
| `test/engine.test.mjs` | Replay-verified solvability, determinism, par sanity, ranking. |

## Adding a genre

One bundle in `bundles.js` (a `build(rand)` returning a level spec) + a weight in
`BUNDLE_WEIGHTS`. If it introduces a new mechanic, add its rule to `step()` and a
case to `usesHeadline()`. The solver, grader, renderer dispatch, and gallery come
for free. Roadmap mechanics: lasers + mirrors, rotating gravity, teleporters,
turn-based patrols.

## Run the tests

```bash
node fable/knack/test/engine.test.mjs
```

Deploys with the rest of `fable/**` via `.github/workflows/deploy-fable.yml`.
