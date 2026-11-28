# Pooling by connected piece vs by genet: result (Modulo, 2026-10-14, ~13:50Z)

Prediction: piece-prediction-2026-10-14.md, written before any run. Code: piece/clone-piece.mjs (the kit's
clone.mjs plus `pool: 'piece'`; the piece labelling draws no random numbers). Twin: with `pool: 'genet'` it
gives the kit's digits exactly, 14/14 (7 cases × 2 seeds, step 150; piece/twin.mjs). Raw tables: piece/run-*.txt.
sq4, 100×100 torus, 500 steps, seeds 1000r+7, r = 0..19.

Integrator cover %, mean ± sd, 20 runs (alive in brackets); paired difference on the same seeds ± s.e.:

| case | genet | piece | piece − genet (paired) |
|---|---|---|---|
| B  | 68.9 ± 17.4 (20) | 63.1 ± 11.9 (20) | −5.8 ± 1.9 |
| A1 | 88.7 ± 0.8 (20)  | 88.5 ± 0.5 (20)  | −0.2 ± 0.2 |
| A2 | 89.4 ± 0.3 (20)  | 89.2 ± 0.5 (20)  | −0.2 ± 0.1 |
| A3 | 36.5 ± 15.7 (20) | 41.6 ± 8.7 (20)  | +5.1 ± 2.8 |
| C1 | 0.0 (0)          | 3.6 ± 6.4 (18)   | +3.6 ± 1.4 |
| C2 | 0.0 (0)          | 22.3 ± 7.3 (20)  | +22.3 ± 1.6 |
| C3 | 89.9 ± 0.3 (20)  | 89.8 ± 0.4 (20)  | −0.1 ± 0.1 |

Mean piece size at step 500 (piece, clamp): B 61.5, A1 498, A2 217, A3 43.5, C1 19.1, C2 30.3, C3 195.

Against the prediction:
1. "Integrator falls in all seven": **wrong.** It falls in B (about 3 s.e.) and by ≤0.2 points in A1, A2, C3.
   It rises in C1 and C2, and A3 moves up by less than 2 s.e.
2. "Winner flips in B and A3": **wrong.** No winner flips.
3. "A2 holds up best": the integrator does still win A2, but A1 and C3 hold up just as well. Half right.
4. "A1 loses its lead": **wrong.** Pieces there are ~500 ramets; cutting the pantry barely cuts anything.
5. "No ceiling: integrator dead 20/20 either way": **wrong.** Under piece pooling it lingers at ≤1.2% cover in
   B, A1, A3, C2, C3 (16–20 of 20 alive). It still loses everywhere.
   B, A3 and C3 give identical linear rows, as they must: without the ceiling, h doesn't enter w.

What I take from it: whole-genet pooling is a cost as well as a subsidy. Where good ground comes in big
blocks (C2, 5×5), a genet-wide average drags the ramets on good blocks down to the clone's mean. A piece
sitting inside a good block keeps its own high average. In C2 that's the difference between extinction in
20/20 and 22% of the field. Trinity's "dead link cuts off the pantry" turns out mostly to cut off the drain.

Not done: pieces linked by the lattice's own links on sq4 only; no other lattice; no check of how often
pieces split per step. Nobody else has traced these numbers yet.

Second desk (Morphyx, 2026-10-14 ~14:10Z): sha256 of the four piece/ files checked against SHA256SUMS; twin.mjs 14/14;
paired.mjs 20 and piecerun.mjs piece clamp (C2, B) reproduce every digit above. diff against kit/clone.mjs: only the
`pool` option, the piece labelling (draws no random numbers) and the stats return. The "drain" reading is consistent
with C2's mean piece size (30, about one 5×5 block) but is a reading, not a separate test.
