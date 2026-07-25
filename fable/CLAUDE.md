# fable — fable.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The generative / interestingness-engine wing (worker `fable`, custom_domain fable.mino.mobi). Thin assets Worker, no build, no secrets. Live wings: /puzz — seeded, certified-unique logic puzzles (binairo + nonogram), a real solver certifying uniqueness, fairness, and grading from deduction techniques…

## Facts

| | |
|---|---|
| Surface | `fable` |
| Dir | `fable/` |
| Endpoint | `fable.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/artifact-website-deploy-x8aiuq` |
| Deploy | `.github/workflows/deploy-fable.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "fable"`.

## How it works

The generative / interestingness-engine wing (worker `fable`, custom_domain fable.mino.mobi). Thin assets Worker, no build, no secrets. Live wings: /puzz — seeded, certified-unique logic puzzles (binairo + nonogram), a real solver certifying uniqueness, fairness, and grading from deduction techniques; /knack — canvas minigames, one composable discrete-move engine -> six genres, each certified solvable by a BFS solver that finds optimal par; /flux — continuous-space physics puzzles (no grid): aim one launch through gravity wells/magnets/goo/bumpers, a solver sweeps the 2D launch space to map winning basins, grading by shot precision; /gyre — flux in 3D: the ball constrained to a torus surface (intrinsic-coordinate geodesic integration + tangent-projected forces, hand-rolled 3D canvas in the torus-pack style), winding numbers of the winning shot are part of the interest battery. flux JS engine is mirrored in fable/flux/engine-rs (Rust) and cross-checked in CI by build-flux-catalog.yml, which commits fable/flux/data/catalog.json. /morph — a generator of puzzle GENERATORS (one level up): samples a game GENOME (substrate/topology incl. torus/Möbius/Klein/hex × law × goal × aesthetic) and instantiates a concrete puzzle a single invariant BFS oracle certifies solvable; two knobs (new game = new genome, new puzzle = new instance). /drift — puzzles in MEANING-space (tier-4 substrate): the board is a committed kNN graph over 7k MiniLM word embeddings (built by scripts/build-drift-graph.mjs, cult-basis pattern; regenerate ONLY via manual build-drift-graph.yml — it re-rolls every permalink); Ladder = BFS-certified semantic crossings with measured par, Fold = margin-certified word families. /forge — the rung above morph: a FOUNDRY that mints new LAWS OF MOTION from a closed rule-DSL, fingerprints each by behaviour (state-space/branching/irreversibility/mutation/stride/drift), and admits only laws measurably novel vs the hand-written ones AND certifiable into playable puzzles by the one BFS oracle (novelty-search / MAP-Elites lineage). The generator-generator then runs on a law no one wrote. /deal — generated 2-player CARD GAMES certified by a TRIBUNAL of simulated opponents (the adversarial/hidden-info oracle family: seeded bot-vs-bot playouts prove terminates + rewards-skill + fair before shipping); the engine is a pure reducer (init/legalMoves/apply) so any game lifts into the games.mino.mobi DO rooms / hoop / ar transports for human-vs-human later — the certifying bot is also your opponent. Guest cabinet (NOT part of the seeded/certified thesis): /tetro — a human-authored React tetromino sandbox (a contributed Claude artifact; pre-transpiled to a global IIFE, React+Tailwind from CDN), listed under the worker health `guests[]`, not `wings[]`. Planned: /city (extends mappa), /character (sci-fi NPC systems).

## Deploying

Pushes to `claude/artifact-website-deploy-x8aiuq` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-fable.yml`](../.github/workflows/deploy-fable.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
