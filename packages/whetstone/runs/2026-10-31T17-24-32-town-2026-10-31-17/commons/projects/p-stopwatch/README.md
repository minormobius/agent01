# Stopwatch

Does the clinic's tablet record waits truthfully? One person with a stopwatch times some
patients over up to five mornings. For each timed patient we take **tablet wait − stopwatch
wait**. The study reports the mean of those differences, a 95% interval for it, and a verdict.

```
node test.mjs          # 18 checks; writes evidence.json, stamped by Fresh
node tools/vv/cli.mjs . # vv on this project's own requirements
node measure.mjs 2000  # coverage, bias and sample size over stand-in clinics
```

## Files

| file | what |
|---|---|
| `harness.mjs` | `record(model, {seed, until, scale, injections})` runs a des model under `runRealtime` with a fake clock and logs every `sim.decide(kind, data)`. `replay(model, log, {seed, until})` reruns it under `run()` and lists the decisions that differ. |
| `stopwatch.mjs` | `study(clinic, {seed, alpha, maxMornings})` returns the report. `studyLogged` also returns the decision log, and `model(clinic)` is the controller as a harness model. |
| `fresh.mjs` | `stamp(entry, links, readFile)` adds the SHA-256 of each file the entry's check depends on. `filter(evidence, links, readFile)` keeps only entries whose files are unchanged. |
| `clinic-sim.mjs` | Our stand-in clinic. It enforces SPEC's rules and has hidden means, and it supports difference shapes `normal`, `skew`, `lumpy`, `heavy` and `zero`. **It is not the lab's clinic.** |
| `measure.mjs` | Coverage table over the stand-in clinics. |

## How the study works

1. Each morning, ask for the patient list. Walk it in arrival order. **Time the first patient
   who arrives at or after the moment the last timed patient was seen** (greedy).
2. After the morning, read the tablet for the patients we timed and take the differences.
3. Do that for every morning the manager allows (5). Then report the mean, the t-interval
   (mean ± t₀.₉₇₅,ₙ₋₁ · s/√n), and the verdict SPEC S3 defines.

## Decisions (where SPEC was silent)

1. **Whom to time: greedy, and never by tablet reading.** Whether patient X is timed depends
   only on arrival times and stopwatch waits already measured. The clinic's promise is that
   differences are independent of waits and of each other, so being chosen tells us nothing
   about X's difference, and the plain mean is unbiased. Choosing by tablet value (say, to
   pick short waits) would select on the very error being measured. The seed drives only
   the des sim; greedy uses no randomness.
2. **When to stop: never early.** Each extra look at the data, followed by a choice to stop,
   costs coverage. With about 14 timed patients in a quiet clinic, a stop rule that looked
   at the mean, or at a lucky small spread, would push coverage under 95%. Every morning
   still logs a `continue`/`stop` decision with its reason, so a stop rule can be added
   and replayed later.
3. **Fewer than 2 timed:** the interval is (−∞, ∞) and the verdict is 'cannot tell'. With
   none timed, the estimate is `null`.
4. **Harness: when an injection lands.** An injection at time t is delivered *after* every
   calendar entry at time ≤ t (and whatever those entries spawn at t). Injections due
   together are delivered one per clock sleep. Replay does the same with
   `run({until: t})` followed by `inject`. The injection's log entry is written when it is
   delivered, at its true sim time. A tie with an event at exactly t is therefore resolved
   the same way in both runs (pinned in T-H1-SAMETIME).
5. **Harness: decision data** is copied as JSON when written, and compared with sorted
   keys. `t` is compared exactly.
6. **Fresh:** an unstamped entry is dropped. An entry stamped with no files stays. A file
   that can't be read counts as changed.
7. **Harness: injection time is exact** (Morphyx, turn 2). The injection is scheduled at sim
   time `at`, not at clock ÷ scale. The division drifts an ulp: at scale 0.37, "at 3"
   landed at 2.9999999999999996. Order was never wrong, but the logged time was.
8. **The diagnostic** (ta-a63ca2, proposed by Morphyx, built by Modulo, turn 3). After the last
   morning, two read-only checks on the one SPEC promise the study leans on (differences don't
   depend on waits). *Drift*: the OLS slope of difference on stopwatch wait among the timed, with
   its 1 − alpha t interval (n − 2 df). *Lean*: mean tablet wait of the timed minus everyone else's.
   If the slope interval excludes 0, `reason` gets a clause saying the error grew or shrank with
   the wait. Otherwise, if the timed waited 5 min or more less (inclusive), it says the figure
   understates any error that grows with wait. Both numbers are logged as a `diagnostic`
   decision. The interval, the verdict, the controller and the report's keys are unchanged.
   `reason` stays one sentence.

   Measured (500 stand-in clinics per cell; `slope` in clinic-sim breaks SPEC on purpose).
   With SPEC's promise kept, drift fires 2.4–7.4% of the time (alpha 5%). Lean fires in nearly
   every busy clinic, because it is true there (fi-85326e). With the error growing 0.2 min per
   minute of wait, busy clinics' coverage collapses to 0.06–0.23, and drift fires in 88–93% of
   them. At 0.5 min per minute, coverage is 0.00–0.06 and drift fires in 99–100%. In quiet
   clinics, drift fires 41–49% (0.2) and 71–78% (0.5), but coverage there stays 0.96–1.00,
   because the timed patients are typical. So it fires most where the interval is wrong.

## Measured (stand-in clinic, `node measure.mjs 2000`, 2026-10-04)

Hidden means −20…20 and spreads 1/3/5/10 min. Coverage at alpha 0.05:

| shape | busy 1/12 | 1/40 | 2 rooms 1/5 | quiet, waits 14–54 (n≈14) |
|---|---|---|---|---|
| normal | 0.948 | 0.953 | 0.952 | 0.938 |
| skew | 0.935 | 0.918 | 0.941 | 0.908 |
| heavy (t₃) | 0.955 | 0.956 | 0.950 | 0.949 |
| lumpy (15% jump) | 0.942 | 0.925 | 0.944 | **0.870** |

Bias is under 0.1 min everywhere. **The weak cell is a lumpy difference in a quiet clinic.**
If the tablet is off by a large amount for 1 patient in 7 and we time only 14, then
0.85¹⁴ ≈ 10% of studies never see that patient. No interval fixes that; only more timed
patients do. Measured (fi-8cff80): the 256 of 2000 quiet-clinic studies that saw no lump all
miss (zero-width interval), and those that saw one or more cover 0.99–1.00. So the whole miss is
the unseen lump, not the t-interval's shape. A bootstrap or skew-corrected interval won't help.

**No controller can buy those patients** (`node shelf/stopwatch-ceiling.mjs`). An oracle that
knew every wait in advance and picked the most patients possible (earliest finish first)
times exactly as many as greedy-by-arrival in every queue load: 60.6, 28.7 and 111.3 per five
mornings. On the quiet clinic with order-free waits it gains 0.1 (13.8 vs 13.7). When the
clinic sees people first come, first served, the moment a patient is seen rises with arrival
order, so the first arrival after the observer is free is also the earliest finish. What
limits n is the five mornings the manager gives. A clinic that isn't FIFO (appointments,
triage) could leave room. The stand-in clinic can't tell us whether the lab's is FIFO.

## Checks and mutants

`node test.mjs` runs 19 checks. Nine of them (T-S5-DIAG, T-S2-EXACT, T-S1-RULES, T-S3-ORDER,
T-H1-SCALE, T-H1-SPAWN, T-H1-COPY, T-H2-TIME, T-F1-HAND) are hand-worked against a scripted
clinic or printed t tables. Each exists because a mutant survived without it.
`node shelf/mutants.mjs . shelf/stopwatch-mutants.json test.mjs` → 27/27 caught (~15 s).
The S2 coverage band (0.90–0.99) can't tell n from n−1, or t from z, at n≈14, so the
interval is pinned to the digit instead.
