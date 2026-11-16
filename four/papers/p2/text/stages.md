# Supplement S1: how the model was built, and what each stage changed

<!-- Paper 2, supplement S1 (draft). The ledger below is rendered by build.mjs from papers/p2/provenance.json, and every
     entry marked ✓ is recomputed from the committed data at each build, which stops if the two disagree. Add a stage
     to provenance.json, never here. -->

The model in this paper was not written down once and run. It was built in stages, from
{{provFirst}} to {{provLast}}. Each stage replaced a guess, a convention or a cruder method with something computed,
then ran the cascade again. The main text gives only the final method. This supplement records the route, for two
reasons.

First, when a result survives each step up in sophistication, that is evidence in its own right: a convergence test
at the level of the whole model rather than one grid. When a result does not survive, the reader should know it was an
artefact of a cruder step. Some did not survive. A cycle on ceryllium-8 was found, withdrawn, reopened and closed for
good within two days, and only the last of those rests on something that cannot move: a variational bound.

Second, a sequence of improvements can look like tuning until the answer looks right. Against that, each stage below
states whether a decision rule was fixed before its results came in. {{provNoRule}} of the {{provStages}} stages had
none: their results were read as they came. That is said plainly rather than reconstructed after the fact.

**What enters this record.** A stage enters when it changed a stated result, when it was a check that could have
failed, or when it introduced or replaced a convention. Bugs found and fixed on the way are not stages; they are in the
code's history. Each stage lists what it replaced and by what, the runs behind it, what moved (with the earlier value
and where it was recorded), and what held. The earlier values are historical: by their nature they are no longer in the
data. Of the {{provAll}} entries, {{provChecked}} are marked ✓: the value given is recomputed from the committed data each
time the paper is built, and the build stops if they disagree. {{provPending}} marked ⧗ waits on a run in progress.

{{provenanceLedger}}
