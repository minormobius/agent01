# puzz — an atlas of deduction

Live: **fable.mino.mobi/puzz** · seeded, certified, graded, no backend.

An endless, deterministic atlas of logic puzzles. Every page number `n` is a
puzzle a single solver has **certified to have exactly one solution**, **proven
fair** (solvable by pure deduction, no guessing), and **graded** by the
reasoning it forces. The solver is the interestingness engine.

This is the puzzle sibling of [mappa](https://mino.mobi/mappa/) (worlds) and
[the Ludographer](https://games.mino.mobi/gen/) (board games): a vast
combinatorial space, generated from a seed, with an interestingness oracle on
top. What's special here is that the oracle is a *real solver* — for a logic
puzzle, "good" is checkable, not just a matter of taste.

## How it works

```
seed n
  └─ atlas.puzzleForSeed(n)            deterministic: same n ⇒ same puzzle, for ever
       ├─ genusForSeed(n)             weighted roll over the genus registry
       ├─ genus.pickParams(rand)      size / density / …
       ├─ genus.generate(rand, …)     full solution → carve fair clues
       │     using solver.findSolution + logicSolve  (fairness + uniqueness in one pass)
       └─ difficulty.grade(inst)      read the solver's technique trace → scores
```

The generator only ships a puzzle the solver vouches for:

- **Unique** — `solver.countSolutions(givens, …, {max:2}).count === 1`, proved by
  exhaustive bounded backtracking. A fully-assigned grid is accepted only if
  every constraint's `valid()` passes, so correctness rests on the validity
  checks, not on the (possibly incomplete) propagators.
- **Fair** — clues are carved only while `solver.logicSolve` (propagation, no
  guessing) can still finish the grid. logicSolve completing ⇒ unique, so this
  buys fairness and uniqueness together, cheaply.
- **Graded** — `logicSolve` records *which* named technique forces each cell and
  how long the chain runs. `difficulty.grade` reads that trace into a difficulty
  score + tier and a small battery of interest signals (depth, variety, texture,
  economy, pace, fairness) → a composite interest score the atlas ranks by.

## Files

| File | Role |
|---|---|
| `js/prng.js` | Seeded `xmur3 → mulberry32` PRNG (the repo's standard pair), forkable. |
| `js/solver.js` | Generic boolean-cell CSP engine: `propagateToFix`, `logicSolve`, `countSolutions`, `findSolution`. The oracle. |
| `js/difficulty.js` | Genus-agnostic grader: technique trace → difficulty + interest battery + descriptor. |
| `js/genera/binairo.js` | Genus: Binairo. Three techniques (no-triple, balance, unique-lines). Carve-from-full generation. |
| `js/genera/nonogram.js` | Genus: Nonogram. Real line-solver propagator; overlap vs cross-chaining. |
| `js/genera/index.js` | Genus registry + roll weights. |
| `js/atlas.js` | `puzzleForSeed`, `rankBand`, `hunt` — the seed→puzzle pipeline and interest ranking. |
| `js/render.js` | Board + thumbnail rendering (per-genus dispatch). |
| `js/play.js` | The interactive player (input, check, reveal, solve detection). |
| `js/app.js` | Routing, controls, verdict panel, gallery. |
| `test/engine.test.mjs` | Reproducible node tests (uniqueness, fairness, determinism, consistency, ranking). |

## Adding a genus

One module implementing the contract, plus one line in `genera/index.js`:

```js
export const mygenus = {
  id, name, family, blurb,
  techniqueInfo: { techName: { tier: 1..5, label, hint }, … },  // drives grading
  pickParams(rand) -> params,
  generate(rand, params) -> {
    genus, genusDef: mygenus, label, size:{rows,cols}, V,
    givens: Int8Array, solution: Int8Array, constraints, meta, grade,
  },
  rebuildConstraints(inst) -> constraints,   // so callers can re-verify cheaply
};
```

A `constraint` is `{ technique, propagate(cells) -> {contradiction?, changed, technique}, valid(cells) -> bool }`.
`propagate` mutates `cells` via `assign()` and reports the technique it used;
`valid` is a **complete** check of a fully-assigned grid (this is the safety net
the uniqueness certificate rests on). Cells are `UNKNOWN | TRUE | FALSE`.

Harder genera (Star Battle, Slitherlink, Akari) will populate the upper
difficulty tiers the two gentle launch genera leave open.

## Run the tests

```bash
node fable/puzz/test/engine.test.mjs
```

## Deploy

`fable.mino.mobi` is a thin assets Worker (`fable/worker.js`, `fable/wrangler.jsonc`).
Pushing `fable/**` on the owning branch fires `.github/workflows/deploy-fable.yml`
(`wrangler deploy`). No build, no secrets beyond the shared Cloudflare credentials.
