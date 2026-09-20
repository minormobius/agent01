# Pre-registered prediction — the swarm experiment

Written and committed **before any call was made**. Git is the proof; the
commit that adds this file contains no results and no eval runner output.

The habit is this surface's own: the polarity forward test was registered the
same way, and the reason is the same. Everything else here was written after
the numbers were seen.

## The question

*"If Jev is in the decider seat for evolving the system, does the same system
emerge? Does Jev rebel?"*

Concretely: replace fluoddity's per-particle steering brain with one typed
question per particle, keep everything else byte-identical, and compare.

## What I predict, in order of confidence

1. **It will not rebel, and it will not match. It will converge.**
   Fluoddity's brain is a sum of ten Gaussian centres at an arbitrary seed —
   it is not trying to be sensible, it is an arbitrary point in rule space
   that happened to look alive. Jev *will* try to be sensible. So I expect a
   **coherent but different** system: trail-following aggregation, the
   Physarum attractor, rather than whatever the genome happens to do.
   "Rebellion" is the wrong frame; **consensus** is the risk.

2. **Agreement with the deterministic rule will be near chance.**
   Five rungs, so chance is 20% exact-rung and ~50% on sign. I predict
   **sign agreement in the 45–60% band** — i.e. uninformative. If it came out
   high I would suspect the state was leaking the rule.

3. **Jev will score WORSE on fluoddity's own `fitness2` than the rule does.**
   This is the prediction I care about most and the one most likely to be
   wrong. `fitness` rewards structure AND motion AND mid-range fill.
   Sensible steering tends toward agreement, agreement tends toward
   clumping, and a clump is high-struct, low-motion — which `verdict` calls
   **frozen**. My specific call: **the Jev arm reads `alive` or `frozen`, and
   its `fitness2` is below the deterministic arm's.**

4. **Both will beat random and frozen-steering.** If Jev does not beat the
   random control there is no result at all, only a field doing what a
   stigmergic field does on its own.

5. **The two framings will differ measurably.** `goal` states an objective;
   `mimic` states none. I expect `goal` to clump harder — higher
   polarization or lower nearest-neighbour distance — because it names
   cohesion as the aim.

## What would falsify the interesting reading

- If the Jev arm's descriptor vector lands **closer to the rule's** than to
  random's, prediction 1 is wrong and "the same system emerges" is the
  answer.
- If agreement runs above ~70%, the state is leaking the rule and the run
  must be thrown out rather than reported.
- If Jev cannot beat the random control, nothing here is about the model.

## What this experiment cannot answer

- **It is one genome.** Fluoddity's evolvable box has 13 knobs; this fixes
  all of them at `defaultConfig()`. A different seed is a different brain and
  could give a different answer.
- **It is a CPU port, not the WebGL engine**, and the port has never been
  compared against the live site because there is no GPU here. Every arm runs
  the same port, so the comparison is fair; the absolute numbers are not
  fluoddity's.
- **One constant was calibrated, not ported** — the deposit amplitude, fitted
  once on the deterministic arm so the field sits in fluoddity's healthy band
  rather than saturated white, then frozen before any model call.
- **256 particles, not 55,000.** Field energy is density-matched, which is
  fluoddity's own correction for exactly this, but a swarm two orders of
  magnitude smaller is a smaller swarm.
- **Only steering is under test.** Axial thrust comes from the deterministic
  rule in every arm.


---

# RESULTS — scored against the above, 2026-09-20

Added after the run. **Nothing above this line was edited.** Two predictions
were wrong, one was untestable, and the wrongness is the interesting part.

Controls (100 ticks, 256 particles, dim 480). These never read the document,
so the handedness bug did not touch them:

| arm | polarization | milling | nn distance |
|---|---|---|---|
| **rule** (fluoddity's own brain) | **0.767** | 0.042 | 0.0632 |
| **frozen** (no steering at all) | **0.317** | 0.037 | 0.0595 |
| **jev-mimic** | **0.226** | 0.054 | 0.0619 |
| **jev-goal** | **0.196** | 0.032 | 0.0621 |
| **random** | **0.026** | 0.044 | 0.0639 |

Nearest neighbour in order-parameter space: **both Jev arms are nearest
`frozen`** (0.096 and 0.124), then random, and far from the rule (0.541,
0.571).

And the policy diagnostic, 1024 particle-decisions:

| | steers toward the stronger trail | corr with sensor asymmetry |
|---|---|---|
| **jev** | **92.5%** | **−0.583** |
| **the rule** | 34.8% | 0.120 |

## Scoring

**1. "Coherent but different — trail-following aggregation." HALF RIGHT, and
the halves are the finding.** The *policy* is exactly as predicted: Jev
follows the trail, 92.5% consistent across 1024 heterogeneous states. The
*outcome* is not: it produces no aggregation and no coherent structure, and
lands **below `frozen`** — a consistent, sensible per-particle policy produced
*less* collective order than no steering at all.

**2. "Agreement near chance, 45–60%." Essentially right**, marginally below
the band I named: **44.1% and 44.2%**. Uninformative, and no sign the state
leaked the rule.

**3. "Worse `fitness2`, reading alive or frozen." UNTESTABLE, not merely
unmeasured.** Every arm reads `dead` at the resolution the sensors require.
This was known before the run and is the substrate limit, not a result.

**4. "Both will beat random and frozen." WRONG.** Both beat random
(0.226/0.196 against 0.026) and both **lose to frozen** (0.317).

**5. "The goal framing will clump harder." WRONG.** The two framings are
nearly indistinguishable — polarization 0.226 vs 0.196, agreement 44.1% vs
44.2%, mean |turn| 0.328 vs 0.297. Stating the swarm's objective in the state
barely moved the behaviour, which is what "there is no instruction channel"
looks like when you try to use one.

## What this says, stated once

**It does not rebel. It legislates.** The model adopted one consistent,
stateable policy and applied it everywhere. The fluoddity genome has no such
policy — its correlation with the same input is 0.120, because it is an
arbitrary point in rule space, not a rule anyone would write down.

And the alignment the rule produces comes *from* that arbitrariness. A uniform
"everyone follow the trail" is a consensus rule, and consensus rules smooth
rather than break symmetry. **The flock needs someone to turn the wrong way.**

So the failure mode of a decision model in the decider seat is not rebellion.
It is conformity — and on this substrate conformity is the thing that
prevents the interesting behaviour from emerging at all.
