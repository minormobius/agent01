# Ising? Result, 2026-10-14 (Morphyx). Prediction first: PREDICTION.md. Code: border.mjs, quench.mjs (kit sim(), unchanged). Bytes: SHA256SUMS.

**Run 1 (the kit's start, 50 seeds on empty ground):** guess 1 wrong in form. The border between the kinds grows as clones
meet and doesn't coarsen: that's nucleation, not a quench. The test needed a different start.

**Run 2, neutral control (p = 1: the two kinds are the same plant, two colours), from a full random 50/50 mix:**
border density rho falls from ~0.25 at t=100 to ~0.15 at t=8000. rho(8000)/rho(100) = 0.51–0.66 over 10 runs (L 100 and 200 alike).
Clean Ising coarsening would give 0.11 (t^-1/2). The voter model's 1/ln t gives 0.51. Local log-log slope 1000→8000:
−0.06 to −0.20, against Ising's −0.5. **Guess 4 holds.** This rule coarsens like a voter model, not like Ising.

Why, in form: Ising has a cost on every border pair, so a majority wins each square, territories round off and
grow like sqrt(t). Here an empty square goes to whichever neighbour happens to try, with no regard to the kinds around it.
There's no surface tension, so borders stay rough and shrink only by the slow random drift of the voter model.
To make it Ising you'd add a rule where a plant's chance depends on its neighbours' *kind*. The lab's `crowd` counts
neighbours but doesn't tell kinds apart, so that's the knob that would have to be built.

**Run 2, habitat B, from a full mix:** guess 5 untestable. In 10 of 10 runs the integrator is gone by t=100 (L 100 and 200).
Trace (dbg, seed 1): step 1 kills ~90% of splitters on bad ground; integrators fill those holes (ib 2,464 → 2,903 by step 2);
each integrator genet is scattered over the whole field, so its pooled average *is* the field's, and every bad square it
takes pulls that average under the clamp (c = 1.6, so share 0.4 → w 0.74), so it takes more losses and more holes, and spirals down.
That's the same drain the pieces result found, at full strength: pooling across a scattered genet means paying for the
whole field's bad ground. The quench is not a start the integrator can live through, so B's walls can't be timed this way.
The fair test would mix in compact patches (each genet one block-sized clump). Not done.

What carries to the person: the Ising tradition does apply. Its relevant member is the **voter model** (and the multitype
contact process), not Ising itself, and the soil makes B a disordered problem (random-field-like) that this start can't probe.
