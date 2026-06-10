# drift — puzzles in meaning-space

Live: **fable.mino.mobi/drift** · the board is an embedding · no backend, no model in the browser.

The sixth wing of [fable](https://mino.mobi/) and the **tier-4 substrate**: the
earlier wings vary topology, law, and physics; drift swaps the substrate for
**meaning**. The board is a k-nearest-neighbour graph over 7,000 MiniLM word
embeddings. Cells are words. Adjacency is semantic proximity. The 2D map you
play on is the embedding flattened by PCA — geography no one drew.

## The genera

- **Ladder** — cross from one word to a semantically distant one, stepping only
  along a word's twelve nearest neighbours. This is literally
  [morph](../morph/)'s BFS oracle running on a semantic substrate (the
  graph-substrate proof, made playable): the oracle certifies a crossing exists
  and finds the optimal one, so **par is measured, not asserted**. Interest
  rewards the *gulf* — endpoint dissimilarity per hop.
  (`seeking → looking → looked → seemed → apparently → clearly`, par 5.)
- **Fold** — sort 12 words into 3 hidden families of 4. A grouping ships only
  with a **margin certificate**: every word strictly closer (avg cosine) to its
  own family than to any other, by a measured gap. The margin *is* the
  difficulty dial, and it is a number, not a vibe.

## The substrate is committed, not computed

`scripts/build-drift-graph.mjs` (cult-basis pattern: `Xenova/all-MiniLM-L6-v2`
via transformers.js in node) builds:

- `data/graph.json` — 7,000 words (google-10000 frequency-filtered), top-12
  cosine neighbours each (with quantised sims), PCA-2D map coords. ~0.8 MB.
- `data/vec64.bin` — PCA-64 int8 vectors (renormalised) for in-browser cosine:
  the margin oracle's data. ~438 KB.

Frozen data ⇒ `/drift/?n=42` is a permalink: the same puzzle, par, and margin on
every machine, for ever. **Regenerating the substrate re-rolls every permalink**,
so `.github/workflows/build-drift-graph.yml` is `workflow_dispatch` only — run it
only as a deliberate substrate version bump.

## Files

| File | Role |
|---|---|
| `js/engine.js` | The `Semantic` substrate: kNN access, int8 cosine, BFS oracle, map coords. |
| `js/genera.js` | Ladder (BFS-certified crossings) + Fold (margin-certified families) + graders. |
| `js/atlas.js` | Seed → puzzle, `rankBand`, `hunt`. Deterministic over the frozen substrate. |
| `js/app.js` | Shell: meaning-map canvas (dust + trajectory), both genus UIs, verdict, gallery. |
| `data/` | The committed substrate (see above). |
| `test/engine.test.mjs` | Substrate sanity, ladders re-BFS'd optimal, margins re-derived, determinism. |

## Run the tests

```bash
node fable/drift/test/engine.test.mjs
```

## Where this goes

Analogy walks (a − b + c, verified by nearest neighbour), taboo crossings (reach
the target while avoiding a forbidden region of the map), embedding charades —
all the same substrate, same oracle discipline. And per the morph thesis: fold
this substrate into morph's genome, so "new game" can land on a board made of
meaning as easily as on a Klein bottle.

Deploys with `fable/**` via `.github/workflows/deploy-fable.yml`.
