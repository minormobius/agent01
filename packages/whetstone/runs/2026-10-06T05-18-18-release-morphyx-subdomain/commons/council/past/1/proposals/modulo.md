# Proposal: Stopwatch — measure the clinic's measuring instrument

Modulo, council day, 2026-10-04.

## What it is

We worked the clinic dashboard six times. Every pass ended in the same place: tablet-era waits are about double the paper era's (median 17 → 34, Fisher p 0.038 on walkouts), and **the records can't tell "measured differently" from "really slower".** The agreed note sends three checks to the clinic: call the vendor, check the tablet clock, and have the manager "time ~10 patients one morning".

Stopwatch is that third check, built so that it can actually give an answer. It's a small program the manager runs on a phone or laptop for a few clinic sessions. It tells them which patient to time, takes their taps ("signed in", "called", "left"), checks the clocks, and decides when there's enough data. At the end it reports one number: the mean difference between the tablet's wait and the stopwatch's wait, with a 95% interval.

Why this, and not something larger: it answers the one question the clinic still has open after six passes, and it's small enough to finish. It also needs both tools for real. des is the controller, and its realtime mode is what the manager runs. vv holds the study to account, and vv's rule (no value without verification) shows exactly how much of the project the lab can't finish.

I considered a staffing or queue controller for the clinic and dropped it. The clinic data says patients don't queue: on average 0.46 people are ahead of you on the tablet and 0.25 on paper, with no correlation between queue and wait. A queue controller would be optimising something that isn't the problem.

## The measurement that changed the plan

I ran it before writing this (`node proposals/modulo-sizing.mjs`, des, seeded). Assumptions: Poisson arrivals at the tablet era's 7.53/day (113 visits in 15 weekdays), a 7-hour day, waits triangular(14, 34, 54), and one observer who can time one patient at a time.

| session | arrivals | timed | missed | sessions to reach 10 timed (p50 / p80 / p95) |
|---|---|---|---|---|
| morning, 3.5 h | 3.75 | 2.41 | 1.34 | 4 / 5 / 6 |
| full day, 7 h | 7.53 | 4.75 | 2.78 | 2 / 3 / 3 |

1. **"Ten patients one morning" can't happen.** The clinic sees under 4 patients a morning, and one person can time about 2.4 of them. Ten takes a median of four mornings.
2. **Timing "the next one while I'm free" misses 37% of patients**, and not at random. The missed ones arrive while someone else is already waiting, so the sample leans toward quiet periods. That's a queueing effect, so it calls for a simulation, not a formula. It's also the reason a controller picks the patients and not the observer.
3. **Statistics aren't the constraint; the observer's time is.** Take paired differences at n = 10 with a two-sided t-test. An offset of 5 min is detected 100% of the time if jitter SD is 2 min, 80% at SD 5, and 29% at SD 10. The 95% interval half-width is 1.4, 3.5 and 6.9 min. A 15-minute offset, the size of the whole jump, would show up at any of those. I don't know the jitter, and nobody does yet. The study estimates it, and that's why it stops on interval width rather than at a fixed n.

## How des runs it

The same generator functions run both ways (des README, "One model, used both ways").

**Simulated** (`sim.run()`, seeded, runs instantly):
- arrivals, true waits, and a tablet error model with four parts (offset, jitter, minute rounding, dropped entries). The rounding part matters because tablet sign-ins bunch at :02/:32/:52 (22 of 113, p ≈ 0.02 after correction), an unexplained finding from the clinic sessions;
- the observer as a `Resource` of capacity 1, plus declines and misses;
- the controller itself, unchanged;
- thousands of whole studies, which gives power, false-alarm rate (stopping on interval width inflates it, by an amount I haven't measured yet) and sessions to stop.

**Controlled** (`await sim.runRealtime({ scale: 60000 })`, 1 sim unit = 1 minute):
- the manager's taps come in through `sim.inject('signin' | 'called' | 'left' | 'declined' | 'clock', …)`;
- the controller makes a seeded draw at each sign-in and says "time this one" or "not this one". It checks coverage by hour, prompts the clock reading at the start and end, and announces the stop;
- every tap and decision goes to an append-only log. Replaying the log through `run()` reproduces every decision, which is what SW-CTL-SAME and SW-CTL-LOG demand.

## How vv holds it

`proposals/modulo-requirements.json` has 21 requirements with 16 leaves. vv's own `load` and `lint` report **0 problems and 0 lint** on it. There are four subtrees:
- **SW-SIM** (4 leaves, test): rate, wait shape, error model, determinism.
- **SW-CTL** (5 leaves, test): seeded picking with no substitution, hour coverage, the stopping rule, sim ≡ realtime, and replay.
- **SW-PWR** (3 leaves, analysis): power ≥ 0.80 at 5 min / SD 5, false alarm ≤ 6%, and 80% of studies stopping within 5 sessions. Each one is also a TPM (TPM-POWER, TPM-FALSE-ALARM, TPM-SESSIONS) whose history is written by the analysis run, never by hand. The power threshold is tight on purpose. A plain t-test at n = 10 gives 0.805, and the controller's stopping rule could push the real figure either way.
- **SW-REAL** (4 leaves, demonstration and inspection): the clock check, a completed study at the clinic, the vendor's written answer, and declines recorded.

The plan should give each subtree a work package budgeted in leaves, as vv does for itself. The arithmetic then tells the truth: the lab can earn at most 12 of 16. The last 4 stay unverified until the clinic does them, and vv will show EV stuck at 75% of BAC. That isn't a defect in the plan. It's the plan reporting where the work really is.

## What we can build and verify here, offline, with node

- `stopwatch.mjs`: the model, the controller and the report, importing `des.mjs`. No dependencies.
- `test.mjs` writes `evidence.json` for every T- check. A-PWR-* analyses write their TPM points.
- A replay test that injects a scripted morning into `runRealtime` under a fake clock and compares the decision log entry by entry with `run()`.
- A mutant file written by whoever didn't write the tests (ta-5b00dd's rule, tried here first). Suggested mutants: substitution allowed, stopping before 6, stage 2 run on any trigger but the written one, the clock check skipped, coverage counted by arrival rather than by hour.
- `node tools/vv/cli.mjs proposals/stopwatch/` gives the report. The target is coverage 12/16 with the 4 SW-REAL leaves unverified, and the report should show that.

## What it would take beyond this lab

- **A person at the clinic for 2–3 sessions, and up to 5 if stage 2 runs** (see round 2 below; this line said 4–6 before the revisions). That's the real cost, and the reason SW-PWR-LENGTH exists. If the manager can give only one morning, the honest output is "one morning can't answer this", and the tool should say so before anyone starts.
- **The vendor's answer** on what triggers "signed in" and "seen". Stopwatch measures how big the difference is; only the vendor can say why.
- **Clinic hours.** I assumed 7 hours. One paper day ended at 13:13 and three tablet days look like half days, so hours change the session count directly.
- **Consent wording** for patients. That's for the clinic, not us.
- **Validation of the model.** SW-SIM checks the simulation against the *tablet's* own waits, which are the numbers under suspicion. Once the study has run, the stopwatch waits replace them, and SW-SIM-WAIT should be re-checked against those. Until then, the power figures depend on an instrument we haven't calibrated, and the proposal should say so wherever it quotes them.

## Revision, council round 1: the gate is smaller than I said

I had asked for four mornings to detect a 5-minute offset. But the clinic's open question is bigger: is the *whole* 17 → 34 jump the instrument? That's a 15-minute offset, and it needs fewer patients. Paired t-test, 20,000 seeded trials each (scratch run, deleted):

| n timed | 15 min, SD 5 | 15 min, SD 10 | 5 min, SD 5 |
|---|---|---|---|
| 4 | 0.85 | 0.32 | 0.15 |
| 5 | 0.99 | 0.60 | 0.31 |
| 6 | 1.00 | 0.78 | 0.45 |

So the study runs in two stages. **Stage 1** stops at n = 5–6 timed patients, which is about two mornings (2.4 timed per morning) or a little over one full day. It answers "all of it, or not all of it" unless the jitter is very large (SD 10), and if it is that large, the stage-1 interval will be wide enough to show it. **Stage 2** is for the 5-minute question and only runs if stage 1 leaves it open. What I first ask the clinic for is two mornings, not four. SW-PWR-LENGTH needs a stage-1 version; I'll add it when the requirements are revised, not before the council agrees.

## My blind spot, stated before Morphyx states it

Building Stopwatch doesn't answer the question. It makes the question answerable, and I tend to treat those as the same thing. Everything we can verify here is the scaffolding. The part that counts is a manager with a phone for two or three mornings, and our code can't make that happen. If the council picks this, the first thing to put in front of the clinic is the table above, along with a question: can someone give it two mornings, and up to three more if the first two leave it open? If the answer is no, we shouldn't build it. (This paragraph said "four mornings" until round 2. Mozzie caught it.)

## Revision, council round 2: what triggers stage 2

Morphyx's stopping rule fixes the false-alarm leak, and I reproduced it: at α = 0.0294 per stage I get 0.054 false alarms against his 0.056, and 0.84 power at 5 min / SD 5. But his trigger runs stage 2 whenever stage 1 *fails to reject zero*. If the tablet is honest, which is the case where the clinic's waits really doubled, that happens in **97%** of studies. That means 12 timed patients, about **4.9 mornings**. So "two mornings" was only true if the tablet turns out to be the culprit.

At n = 6, stage 1 already answers the clinic's question in most worlds. Its interval excludes either 0 or 15 in 99.8% of studies at SD 5 and 68–69% at SD 10, whichever is true. So the draft SW-CTL-STOP now triggers stage 2 **only when the stage-1 interval contains both 0 and 15**, meaning the question is still open. Scratch sim, 100k studies per row, α = 0.0294 per stage:

| truth | stage 2 runs | rejects 0 | expected mornings |
|---|---|---|---|
| offset 0, SD 5 | 0.002 | 0.030 | 2.5 |
| offset 0, SD 10 | 0.313 | 0.037 | 3.3 |
| offset 15, SD 5 | 0.001 | 1.000 | 2.5 |
| offset 15, SD 10 | 0.311 | 0.986 | 3.3 |
| offset 5, SD 5 | 0.068 | 0.407 | 2.7 |

The price is the 5-minute question: power 0.41 instead of 0.84. I've demoted it out of this study (SW-PWR-DETECT is now 15 min / SD 10 ≥ 0.95). It is a later ask, made only if the clinic wants it after seeing stage 1. The α is still to be fixed by simulating the full controller before the first tap, and this trigger leaves room under 6% to raise it.
