# Stopwatch

Does the clinic's check-in tablet record waits the way a person with a stopwatch would? This is a
study that answers that, with a mean difference, an interval and a verdict. It comes with the
harness that proves its controller is deterministic, and with Fresh, which keeps the evidence honest.

    node test.mjs        # 10 checks, one per check id in links.json; writes evidence.json (stamped by Fresh)
    node shelf/mutate.mjs stopwatch.mjs test.mjs mutants.json \
      --with harness.mjs,fresh.mjs,fakeclinic.mjs,requirements.json,links.json,README.md,LETTER.md --tree tools/des
                         # do the tests bite? 30/30 killed (set STOPWATCH_NO_EVIDENCE=1 to skip writing evidence)

Files: `harness.mjs`, `stopwatch.mjs`, `fresh.mjs`, `fakeclinic.mjs` (a strict test clinic),
`requirements.json`, `links.json`, `test.mjs`, `mutants.json`, `LETTER.md` (for the manager).

## The study

One observer, up to five mornings (the manager's limit; asking for more gets five).

**Whom to time.** In arrival order, the observer times every patient who arrives at or after the
moment the last timed patient was seen. Nothing else enters the choice. That is what makes the
estimate unbiased. Whether patient X is timed is settled before X's wait is known, and it depends
only on arrivals and on *other* patients' waits. The clinic promises that the differences
(tablet − stopwatch) are independent of each other and of waits. So the timed differences are an
honest random sample of the one true mean. A rule that preferred short waits, or that stopped once
things looked clear, would break that. The mutants `picks the shortest wait` and `one morning too
few` are there to show the tests notice.

**The number.** `estimate` is the plain mean of the timed differences.

**The interval.** Hall's (1992) skew-corrected Student t, using the exact t quantile. If the
differences are symmetric it is the ordinary t interval. If they have a long tail, it leans that way.
Why: a tablet that *sometimes* starts its clock early (someone taps in, then stands at the desk)
gives a right-skewed difference, and plain t under-covers that.

**The verdict** follows SPEC S3 exactly: within ±2 min inclusive → reads true; else wholly above 0
→ long; else wholly below 0 → short; else cannot tell.

### Measured (our fake clinic, `fakeclinic.mjs`; 2,000–3,000 clinics per row, true means −4…9)

| noise (sd 3) | patients/morning, mean wait | timed (n) | plain t cover | Hall cover |
|---|---|---|---|---|
| normal | 25, 30 min | 33 | 0.950 | 0.950 |
| exponential (skewed) | 8, 60 min | 16 | 0.912 | 0.942 |
| t, 3 df (heavy tails) | 25, 30 min | 33 | 0.951 | 0.927 |
| 90% −1 / 10% +9 | 25, 30 min | 33 | 0.873 | 0.948 |
| 90% −1 / 10% +9 | 8, 60 min | 16 | 0.810 | **0.80** |

Bias was under 0.03 min in every row. The last row is a limit no formula gets past: with n = 16,
0.9^16 = 18.5% of studies never see a single +9, so they can't know it exists. If the real clinic
is like that, the honest fix is more timed patients, not a cleverer interval. `timed` in the report
tells you how many you got.

**Why not the wider of Hall and plain t?** (Morphyx, day 2, 2,000 clinics per row.) Taking the union
lifts t3 to 0.95–0.96 and exponential to 0.95, but it pushes discrete 40/20 from 0.979 to **0.991**,
over the lab's 0.99 ceiling. It also leaves discrete 8/60 at 0.80, and widens every interval by
about 6%. Hall alone is in band on every row except the one no method reaches. Hall stays.

### Decisions (things SPEC leaves to us)

- **S-a** Fixed design: all mornings are used. Stopping early when the interval looks decided is
  optional stopping, which biases the mean and costs coverage.
- **S-b** Hall-corrected t (table above). With n < 2: (−∞, ∞) and 'cannot tell'. If every difference
  is identical, the interval is [mean, mean].
- **S-c** `seed` goes to the Sim. The controller draws nothing random, so the report doesn't depend on it.
- **S-d** `MANAGER_LIMIT = 5` caps `maxMornings`.
- **S-e** Sim time is the observer's minutes on duty. Each morning starts where the last one ended.
  The legality check uses the clinic's own numbers (arrive + wait), never accumulated sim time.
- **S-g** A timed patient whose tablet or stopwatch reading isn't usable (a walkout, a
  blank row) is left out of the interval, and the reason says how many were. The clinic promises
  independence, so dropping a pair costs precision, not bias. If the *stopwatch* wait is missing,
  we can't know when the observer is free, so nobody else is timed that morning. That costs
  patients, but it never makes an illegal call. (Morphyx, day 2) **Day 3 (Modulo):** "usable" now
  means `typeof number`, finite, and for the stopwatch ≥ 0. Probed on 50 strict clinics with every
  5th stopwatch reading replaced: `null`, `''` and `-1` made the next call illegal on 50/50
  (`arrive + null` is `arrive`), and `'12'` crashed the sim. All are now 0/50, and the test covers
  8 odd values × both readings. A **negative tablet** wait is kept on purpose: refusing it would
  select on the difference and bias the mean (a mutant checks this).
- **S-h** (Modulo, day 3) The discrete 8/60 hole, in words. When 0.9^n > alpha (n ≤ 28 at
  0.05), the reason adds the chance that a 1-in-10 bad reading never showed up among the n timed.
  The estimate and interval don't change. A manager should hear that "13 patients" has a 25% blind
  spot, not infer it.
- **S-f** Only timed patients count. Tablet readings for untimed patients carry no information about
  the *difference* unless we model waits, and modelling waits would put an assumption the clinic
  didn't give us into the result.
- **S-i** (Morphyx, day 4) Greedy stays: time the next patient who walks in once the observer is free.
  Modulo asked whether *skipping* a patient who arrives into a crowd (likely a long wait, blocking
  the observer) would time more people. It would be legal and unbiased, since it is decided from
  arrivals only. Measured (`node shelf/controllers.mjs`, 400 clinics per row, mean n timed over
  five mornings):

  | clinic (pm/wait) | waits | greedy | skip if ≥1 arrived in last 10 min | skip if ≥2 in last 20 |
  |---|---|---|---|---|
  | 8/60  | i.i.d.    | 15.9 | 15.6 | 15.6 |
  | 8/60  | congested | 30.5 | 28.6 | 29.6 |
  | 25/30 | i.i.d.    | 32.9 | 27.7 | 25.2 |
  | 25/30 | congested | 42.0 | 35.9 | 36.2 |
  | 40/20 | i.i.d.    | 48.8 | 31.2 | 22.6 |
  | 40/20 | congested | 35.8 | 28.9 | 25.6 |

  "Congested" makes the wait 5 + 12 min per patient who arrived in the 20 min before, so it is the
  case built to favour skipping, and skipping still loses. A skip leaves the observer idle until the
  next walk-in, and in a crowd that next walk-in is often in the crowd too. With i.i.d. waits no rule
  that uses only arrivals can beat greedy on average. The dashboard's `queue.mjs` also found this
  clinic's waits flat across queue length, so the congested case is the less likely one. The 8/60 hole
  needs more mornings, not a cleverer observer.

## The harness

`record(model, { seed, until, scale, injections })` runs `model(sim)` under des `runRealtime` with
a fake clock that moves only when slept. `replay(model, log, { seed, until })` runs it under `run()`
and compares decisions in order (t, kind, data). Decisions:

- **H-a** Data is compared as canonical JSON: key order ignored, −0 = 0.
- **H-b** `Math.random` is a tripwire. While a model runs, every call is counted, and replay reports
  `{ index, expected: 'no Math.random', got: 'Math.random called' }`. Divergence alone would miss
  `Math.random() < 2`.
- **H-c** Injections at ≤ 0 go in before the run starts. Injections the run never reached aren't
  delivered and aren't logged.
- **H-d** Replay feeds each injection at its logged t *and in the queue position record gave it*.
  It runs every step strictly before t, sets now = t, then calls `sim.inject`. Record injects the
  moment the fake clock reaches t, before any step at t runs, so the injection queues behind
  everything already waiting at t and ahead of whatever steps at t create. Replay now does the same.
  Day 1 pre-scheduled a step at t instead, and that broke whenever the model queued an entry for
  t during setup (`sim.schedule(5, …)` or a bare `sim.timeout(5)` in `model(sim)`). Test
  `h1-tie-order` runs 300 random models with integer-time ties and three scales. Both old orderings
  are mutants. (Morphyx, day 2)

## Fresh

`stamp(entry, links, readFile)` adds `digests`: the SHA-256 of every artifact that `implements` a
requirement the entry's `check` `verifies`. `filter` keeps the entries whose digests all still match.
Decisions: an unstamped entry is dropped (F-a). An unreadable file stamps as null, and null never
matches (F-b). **F-d** (day 2): filter judges each entry against the links *as they are now*. If a
requirement gains an implementing file after the stamp, its old evidence drops, because that file
was never hashed. If a file stops implementing a requirement, it stops counting against that
requirement's evidence. Evidence is about an arrangement, and when links.json changes, the
arrangement has changed.

**vv is not here.** On day 1, tools/vv/ and council/ were missing from the folder. `requirements.json`
and `links.json` are drafted from SPEC.md, in a shape we guessed. `fresh.mjs`'s `linksOf()` is the
one place to adapt once vv's format is known.
