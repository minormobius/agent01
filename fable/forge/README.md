# forge — laws no one wrote

Live: **fable.mino.mobi/forge** · an engine that invents game forms · no backend.

The rung above [morph](../morph/). morph samples *grammars* — but only by
recombining laws a human wrote; it can pair push with a Möbius strip, it can
never invent a verb it wasn't given. **forge mints the verbs**, and then morph's
whole machine runs on top of them.

## Three ideas

1. **A closed rule-DSL** (`dsl.js`). A law is a short genome of typed primitives:
   a motion kind (step / slide / leap / bounce), a guard, an enter-effect, a
   leave-effect (trails!), what a mark *means* to movement, a heading rule. The
   language is **closed** — every well-formed genome `compile()`s to a total,
   deterministic transition function. That closure is what keeps the invariant
   oracle honest: whatever the foundry mints, the same BFS certifies. The DSL
   also `describe()`s itself in English, so the rules card writes itself a level
   deeper than morph.

2. **Behavioral fingerprinting** (`fingerprint.js`). Two genomes can read
   differently and *be* the same dynamics, so a law can't be deduped by text.
   Each law is **run** on a fixed probe world and reduced to a 6-vector —
   `volume, branching, irreversibility, mutation, stride, drift`. Dynamics
   become a point in space.

3. **Novelty search** (`foundry.js`). The archive is seeded with the fingerprints
   of every hand-written law (walk, ice, leap, paint). A minted law is **admitted
   only if** its fingerprint sits ≥ `NOVELTY_MIN` from *everything* known
   (knowns ∪ codex) **and** the oracle can certify a real puzzle on it. This is
   quality-diversity (the MAP-Elites lineage): not "is it good?" but "is it
   *new*, and does it work?". Three gates: **alive · novel · playable**.

## The pipeline

```
candidate genome (seeded)
  └─ compile()                 → a total deterministic step function
  └─ fingerprint()             → behavioral 6-vector
       ├─ alive?               state-space not degenerate
       ├─ novel?               far from knowns ∪ codex in fingerprint space
       └─ playable?            morph's inner loop (instantiate + BFS) certifies a puzzle
  └─ admit → the CODEX         a game form no one wrote, named for its dominant behavior
```

Then `atlas.puzzleFor(law, p)` runs the generator-generator's inner loop on the
discovered law: lay out a world, pick a goal the law can satisfy, the one BFS
oracle certifies it solvable at optimal par.

## What it discovers

Real admitted laws from the seeded codex (deterministic):

> **the Turning Rite** — *you leap two cells, vaulting whatever lies between; after
> every move your heading turns left.* (collect goal, par 11)

> **the Withering Discipline** — *you step forward, but if blocked you rebound a cell
> backward; a move is only legal when the cell ahead is clean; you ink every cell
> you leave; each cell you enter flips; inked cells are solid; after every move your
> heading turns right.* (novelty 1.08 from "paint")

## Determinism

The candidate line is seeded, so the codex is the same on every machine: the
**n-th discovered law is a permalink**, just like the n-th puzzle. The
discoveries are reproducible.

## Files

| File | Role |
|---|---|
| `js/dsl.js` | The closed rule-DSL: `sampleLaw`, `compile`, `describe`, the known laws. |
| `js/engine.js` | The micro-engine (mark layer + dynamic walls + step counter) + the one BFS oracle. |
| `js/fingerprint.js` | Behavioral fingerprinting on a fixed probe world; novelty distance. |
| `js/atlas.js` | Instantiate + grade a puzzle on a minted law (morph's inner loop). |
| `js/foundry.js` | The three gates; `buildCodex` (batch) + `makeFoundry` (streaming). |
| `js/render.js` / `js/app.js` | Canvas + the live smelting stream, the codex, the play view. |
| `test/engine.test.mjs` | DSL closure+determinism, fingerprint separation, admission + replay, codex determinism. |

## Run the tests

```bash
node fable/forge/test/engine.test.mjs
```

## Where this goes

forge mutates genomes by *resampling*; the next notch is genuine evolution —
mutate admitted laws toward unexplored regions of fingerprint space (MAP-Elites
proper), filling a behavioral map rather than walking a line. And the laws are
2D-grid verbs today; the same DSL pattern extends to graph and continuous
substrates, so the foundry could one day mint laws for drift's meaning-space.

Deploys with `fable/**` via `.github/workflows/deploy-fable.yml`.
