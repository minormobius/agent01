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
