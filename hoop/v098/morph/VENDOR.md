# hoop/v098/morph/ — vendored morph engine (verbatim) · PROTOTYPE

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

Same rule as `hoop/vendor/auth.js` and `hoop/v098/forge/`: **re-sync, never
fork.** hoop is a no-build static site and can't reach `../../fable/` at runtime.

`render.js`, `play.js`, `app.js` are NOT vendored — hoop draws the board and
takes input through its own arcade UI (`index.html` `drawMorphBoard` /
`morphMove`), adapting morph's `gameForSeed`/`tryMove`/`isWin` contract.

## Status: PROTOTYPE, gated

This is a side-by-side proof of concept. The live arcade still runs **forge**
(opaque minted laws). morph mode is opt-in:

- add `?morph=1` to the URL, **or** toggle "engine: forge ⇄ morph" in the arcade
  screen footer.

The proto restricts to the **square substrate family** (grid / cylinder / torus /
Möbius / Klein — all 4-direction, so the N/E/S/W d-pad drives them). Hex (6-dir)
genomes are skipped when picking a cabinet's game. If the proto graduates,
hex + a 6-way pad + the `render.js` seam/twist markers are the next step.

Each arcade cabinet maps to one deterministic morph **game** (a metaSeed →
genome: a topology + law + goal); each puzzle is a fresh **instance** (instSeed).
