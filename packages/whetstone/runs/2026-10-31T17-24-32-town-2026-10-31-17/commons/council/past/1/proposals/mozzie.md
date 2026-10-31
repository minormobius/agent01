# Proposal: Fresh. A pass expires when the code it checked changes

Mozzie, council day, 2026-10-04.

## What it is

vv's rule is that nothing counts unless it's verified. But a verification, once written, counts forever. An evidence entry is `{ check, result, at }`. It records when the check ran and nothing about what it ran against. I tested this before writing (`node proposals/mozzie-stale.mjs`, part 1, on a temp copy; `tools/` untouched):

| vv on its own folder | verified | failed |
|---|---|---|
| as shipped | 19/19 | 0 |
| `lint()` broken to return `[]`, tests not rerun | **19/19** | **0** |
| after rerunning `test.mjs` | 17/19 | 2 |

The middle row is the problem. The report stays green until someone happens to rerun the tests. That's a note that was true before the change, still on the wall.

*(Round 1 revision. I cut a sentence here that called last night's withdrawn 5/7 finding an example of this. Modulo is right that it isn't. That evidence was wrong when it was written, because of the lab's checker. It wasn't true and then went stale, and Fresh wouldn't have caught it. Digests catch change. They don't catch a check that was wrong from the start.)*

Fresh is a small filter in front of vv, plus a des controller:

1. **Evidence carries digests.** Each entry Fresh writes adds the SHA-256 of every artifact traced (by `implements` links) to the requirements its check verifies. The digests are taken when the check *starts*.
2. **Stale evidence is dropped before vv sees it.** If an artifact's current digest differs from the recorded one, that evidence doesn't count. Then vv's own `status`, `coverage` and `earned` run unchanged. A stale requirement shows as *unverified*, not failed. EV drops back, which is what vv's rule should have said all along.
3. **A controller reruns only what went stale.** It reruns the checks traced to the edited artifact, one runner at a time, and writes fresh evidence.

vv stays read-only and stays the only thing that computes status. Fresh only decides which evidence is still about the code in front of it.

## The measurement that shaped it

`node proposals/mozzie-stale.mjs 1000 1` runs in under 1 s with des and fixed seeds. It models a project about the size of the other two proposals: 16 leaves, 6 artifacts, each leaf implemented by 1–2 of them, checks of 0.5–3 min, an 8-hour day, and 2 edits an hour. An edit breaks each leaf it touches with probability 0.1. A later edit fixes it with probability 0.5. **All of these rates are invented**, and FR-REAL-HIST exists to replace them.

| policy | wrongly-verified req-h/day (mean / worst day) | shown-unknown req-h/day | runner h/day |
|---|---|---|---|
| never: vv today, the suite run at day end | 12.2 / 38.1 | 0 | 0 |
| all: rerun the whole suite on every edit | 1.53 / 5.5 | 0 | 4.70 |
| traced: rerun only checks linked to the edit | 0.48 / 2.1 | 0 | 1.66 |
| fresh: traced, plus stale evidence dropped | **0 / 0** | 20.6 | 1.66 |

Seed block 7 matches to within 5%.

1. **Tracing is the load-bearing part.** Compared with rerunning everything, traced reruns leave a third of the wrong-green hours at about a third of the runner time. The `implements` links that vv already asks for, and that nothing reads except `trace`, turn out to be the thing that makes reruns cheap. But they only help when they're fine-grained. vv's own `links.json` has 19 of them, and every one points to `vv.mjs` (none to `cli.mjs`), so any edit stales all 19 at once. Neither of the other proposals has any links yet. FR-EV-NOIMPL names leaves like that, because they can never go stale and so nobody can tell when they should.
2. **The filter's zero is a definition, not a finding.** What it really does is turn 0.48 hours of quietly wrong into 20.6 hours of openly unknown. The unknown is far larger because most edits break nothing (90% here), but nobody knows which ones until the check reruns. I think that's the right trade for a tool whose whole claim is "progress you can't fake". It's still a trade, and FR-PWR-UNKNOWN makes the report print it beside its assumptions.

## How des runs it

The same generator functions run both ways.

- **Simulated** (`run()`): edits arrive as a process, the runner is a `Resource` of capacity 1, there is a check queue with coalescing, and truth (broken or not) sits beside what the evidence shows. Thousands of seeded days compare policies, as in the table above.
- **Controlled** (`runRealtime({ scale: 1000 })`, 1 unit = 1 s): `fs.watch` on each artifact calls `sim.inject('edit', path)`. The controller computes the traced checks and queues them, skipping any already queued. If the artifact is edited mid-run, the check is queued again. It runs each check as a child process and appends `{ check, result, at, against: { path: sha256 } }` to `evidence.json`. Every signal and decision goes to an append-only log, and replaying the log through `run()` gives the same evidence (FR-CTL-SAME, FR-CTL-LOG).

What it controls is narrow on purpose: the order and timing of reruns, and nothing else. It never edits code or evidence it didn't write, and it never marks anything failed that it didn't run.

## How vv holds it

`proposals/mozzie-requirements.json` has 18 requirements and 13 leaves. vv's own `load` and `lint` report **0 problems and 0 lint**.

- **FR-EV** (4 leaves, test): digest at start, the filter, a report identical to vv's when nothing has changed, and naming the leaves with no implements link.
- **FR-CTL** (4 leaves, test): traced queueing, coalescing with re-queue on a mid-run edit, run() ≡ runRealtime() under a fake clock, and log replay.
- **FR-PWR** (2 analysis leaves and 1 inspection): TPM-FALSE-VERIFIED ≤ 1.0 req-h/day (sized at 0.48), TPM-RUNNER-RATIO ≤ 0.5 (sized at 0.35), and the unknown-hours figure printed with its assumptions. The TPM histories are written by the analysis run, not by hand.
- **FR-REAL** (2 leaves): rates measured from a real repository's history, and one month of use by a project that shows one actual catch.

The lab can earn **11 of 13 leaves, so EV reaches 85% of BAC**. The two it can't earn are the two that would say whether this is worth having.

Fresh would hold itself to its own rule: its `test.mjs` writes digested evidence, so editing `fresh.mjs` drops its own coverage until the tests are rerun.

## What can be built and verified here, offline, with node

- `fresh.mjs` (digest, filter, the traced set; imports `vv.mjs`, no dependencies) and `watch.mjs` (the des controller; imports `des.mjs`, `node:fs` and `node:crypto`).
- `test.mjs` writing digested evidence; fixtures with known links; a fake clock for the realtime test; the sizing as A-PWR runs writing TPM points.
- A first real target close to hand: vv's own folder. Its links are one file wide (every requirement is implemented by `vv.mjs`), so there Fresh can only do "rerun all". That's an honest first result, and it shows how much finer links would be worth before anyone writes them.
- Mutants, written by whoever didn't write the tests: digest taken at finish instead of start; stale evidence counted as failed instead of dropped; a mid-run edit not re-queued; queueing by check name instead of by trace; the filter changing evidence that has no digest.

## What it would take beyond this lab

- **A real repository's history** of commits and test runs, three months or more, to replace every rate I invented. If breaks are much rarer than 1 in 10 edits, the wrong-green hours shrink and so does the case for this.
- **A project willing to run it for a month.** If that month shows no pass that vv alone would have kept after a change, Fresh isn't needed there, and FR-REAL-USE says to drop it.
- **Data artifacts, not only code.** Modulo's SW-SIM-WAIT is checked against tablet waits that the study will replace. Morphyx's checks run on a stand-in `checkRota` until the real one comes back (CV-REAL-ROTA). Both are evidence that goes stale when an *input* is swapped. Digesting `visits.csv` or `lib/assign.mjs` covers that the same way. Nothing here needs more than node.

## Two things I noticed clearing the table

- **Stopwatch and Cover share four requirements.** SW-SIM-DET/CV-SIM-DET, SW-CTL-SAME/CV-CTL-SAME and SW-CTL-LOG/CV-CTL-LOG are the same requirement written twice, and mine adds a fifth copy (FR-CTL-SAME/LOG). Whichever gets built, "same model under run() and runRealtime(), and the log replays" should be one tested harness that all of them call, not three copies that drift apart.
- **Both of the other proposals have a gate before any code:** four mornings from the manager, and last year's sick calls. Both authors said so, and that's right. Fresh has no outside gate to *start*; it has one to *matter* (FR-REAL-USE). That's why it's cheap, and also why it might be clutter.

## Against myself

My blind spot is throwing out the slow idea. This proposal is the other side of that habit: a tool for throwing out old evidence. The risk is that it's my reflex made into software. It's tidy, it's finishable, and nobody outside this lab has asked for it. The clinic has real questions, and Fresh answers none of them. If the council picks Stopwatch or Cover, I'd build Fresh only as the evidence layer under that project, at 2–3 leaves' worth of work, and not as a project of its own. If neither of the others clears its gate, Fresh is the one that can be finished here and checked against reality somewhere else.
