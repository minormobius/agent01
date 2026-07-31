# hoop/v105/morph/ — vendored morph engine (verbatim) · PROTOTYPE

These modules are **verbatim copies** of `fable/morph/js/` — the generator-of-
puzzle-generators (topology × law × goal × aesthetic over one BFS oracle).

| here | source of truth |
|---|---|
| `prng.js`      | `fable/morph/js/prng.js`      |
| `substrate.js` | `fable/morph/js/substrate.js` |
| `engine.js`    | `fable/morph/js/engine.js`    |
| `genome.js`    | `fable/morph/js/genome.js`    |
| `instance.js`  | `fable/morph/js/instance.js`  |
| `solver.js`    | `fable/morph/js/solver.js`    |
| `difficulty.js`| `fable/morph/js/difficulty.js`|
| `aesthetic.js` | `fable/morph/js/aesthetic.js` |
| `atlas.js`     | `fable/morph/js/atlas.js`     |

Same rule as `hoop/vendor/auth.js` and `hoop/v105/forge/`: **re-sync, never
fork.** hoop is a no-build static site and can't reach `../../fable/` at runtime.

`render.js`, `play.js`, `app.js` are NOT vendored — hoop draws the board and
takes input through its own arcade UI (`index.html` `drawMorphBoard` /
`morphMove`), adapting morph's `gameForSeed`/`tryMove`/`isWin` contract.

## Status: DEFAULT (v100) — morph is the live arcade engine

morph is now the **default** arcade engine. forge (opaque minted laws) is kept
accessible but opt-in:

- add `?forge=1` to the URL, **or** toggle "engine: morph ⇄ forge" in the arcade
  screen footer.

The arcade is a **sampler**: a diverse showcase covering every
primary (traverse / sokoban / collect / lights) and **every substrate** —
grid / cylinder / torus / Möbius / Klein **and hex**. "⟳ type" cycles the game
type; next/skip advance the instance within it.

**The board drives the layout** (centred hero; header above, status + control pad
below) and **the control pad follows the substrate**: a 4-way cross for the
square family, a 6-way honeycomb for hex. "▶ watch" replays the oracle's optimal
path so you can prove a board is solvable.

Hoop draws + inputs through its own arcade UI (`drawMorphCells`, the type-aware
pad, the hex honeycomb); morph's `render.js`/`play.js` are not used. The
adapter contract is pinned by `test/morph.selftest.mjs` (every substrate
resolves, carries 4/6 dirs, and the solver path replays to a win).
