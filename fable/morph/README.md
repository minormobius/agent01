# morph — a generator of puzzle generators

Live: **fable.mino.mobi/morph** · one oracle, endless game grammars, no backend.

The fifth wing of [fable](https://mino.mobi/), and a level up the ladder. The
first four wings each generate *puzzles* — but within a wing every roll is the
same game with rearranged furniture (knack is always knack). They feel like four
games, not infinite games. morph asks the next question: **what does a generator
of puzzle generators look like?**

## Sample the grammar, not the furniture

A game is a point in a space of **grammars**, and the axes are orthogonal. A roll
is a **genome**:

- **Substrate** (topology) — `grid`, `cylinder`, `torus`, `mobius`, `klein`,
  `hex`. The deepest knob: a Möbius seam flips your frame mid-slide and the
  solver never notices, because every substrate exposes the same
  `step(cell,dir) → {cell, dir}` interface.
- **Law** — walk or slide; push, collect, lights, portals.
- **Goal** — reach the gate, fill every marker, gather it all, light every tile.
- **Aesthetic** — sampled independently (8 motif packs), so two games with the
  same grammar still look alien to each other.

Instantiating a genome with an instance seed lays out a concrete level. The
product — 6 topologies × 4 goals × layered rules × 8 motifs — yields combinations
no one designed: Lights-Out on a Klein bottle, Sokoban across a torus seam, a
slick collect-a-thon on a Möbius strip.

## The invariant that makes it work: one oracle

What lets the grammar vary without limit is that the thing underneath does not.
Every genome compiles to a discrete state graph, and a **single breadth-first
search** (`solver.js`) certifies any of them solvable, finds the optimal length
(par), and grades it. The games are generated; the oracle is fixed. That is the
whole trick — and it's why morph can:

- **reject a genome as a dud** (no good instance exists within budget), and
- **grade a genome's richness** (how far from a plain grid it lands) before you
  ever play it.

The node tests prove the contract by replaying each game's solver path back
through `tryMove()` to a win — across grid, cylinder, torus, Möbius, Klein, and
hex.

## Two knobs, named

- **New game** rolls a new genome — a different planet.
- **New puzzle** keeps the genome and rolls a new instance — the same game, a
  fresh level.

`/morph/?n=<game>&p=<puzzle>` is a permalink to exactly one level of exactly one
game. Both knobs are deterministic (`xmur3 → mulberry32`).

## Files

| File | Role |
|---|---|
| `js/substrate.js` | The topology axis: 6 substrates behind one `step` interface (incl. Möbius/Klein frame-flip). |
| `js/engine.js` | The generic `tryMove()` composing substrate + sampled micro-rules; goal predicates. |
| `js/solver.js` | The one invariant BFS oracle (solvable? par? path) + path analysis. |
| `js/genome.js` | The grammar sampler + compatibility + static richness. |
| `js/instance.js` | Lay out a concrete level from a genome (the genome's `build`). |
| `js/aesthetic.js` | 8 motif packs (renames roles, sets hue + glyphs). |
| `js/difficulty.js` | Instance interest battery + headline-rule gate. |
| `js/atlas.js` | `gameForSeed` (roll genome → find good instance), `huntGame`, `rankGames`. |
| `js/render.js` | Generic renderer: any substrate, themed, with wrap-seam markers. |
| `js/play.js` | Generic player over the substrate's direction count (4 or 6). |
| `js/app.js` | Two-knob nav, genome panel, verdict, atlas of *games*. |
| `test/engine.test.mjs` | Topology laws, oracle replay, diversity, determinism. |

## Where this goes next

This wing's oracle is BFS over a discrete state graph — it covers every game that
is discrete, deterministic, and turn-based. Other oracle *families* already live
next door: constraint-uniqueness (puzz), action-space sweep (flux/gyre). The
genome's true outermost axis is **which family**. Number games, node-graph games,
painting/symmetry, word-embedding games each enter as a new substrate or a new
oracle family bolted under the same meta-generator.

## Run the tests

```bash
node fable/morph/test/engine.test.mjs
```

Deploys with the rest of `fable/**` via `.github/workflows/deploy-fable.yml`.
