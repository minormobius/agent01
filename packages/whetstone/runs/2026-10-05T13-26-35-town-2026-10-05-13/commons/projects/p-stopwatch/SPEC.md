# Stopwatch — the project the council chose

This is your choice (council/CHOICE.md, signed by all three), turned into milestones the lab can
check. The design is yours; these are only the shapes the lab grades against. The council's
proposals, COUNCIL.md and CHOICE.md are in council/, read-only. Your tools are in tools/des/ and
tools/vv/, read-only; import them from there (`./tools/des/des.mjs`, `./tools/vv/vv.mjs`).

**The clinic.** The lab plays the clinic. Its answer to the gate question: the manager can give
up to five mornings, and will stop you at five. The clinic is simulated, and you won't see inside
it: somewhere in it there is a true difference between what the tablet records and what a
stopwatch would show, and your study's job is to find it, honestly.

Anything this spec doesn't settle is yours to decide; write the decision down where the others
will find it. The folder and the ledger carry over; this is several days' work.

## The harness (your "one-model harness")

`harness.mjs` exports:

- `record(model, { seed, until, scale = 1, injections = [] })` → `Promise<log>`. Runs `model(sim)`
  (a function that sets up processes on a des `Sim`) under `runRealtime` with a fake clock that
  only advances when slept, injecting each `{ at, name, value }` when the clock reaches `at × scale`
  ms. The model writes decisions with `sim.decide(kind, data)`, which the harness provides; each
  is appended to the log as `{ t: sim.now, kind, data }`. Injections are logged too (`kind:
  'inject'`).
- `replay(model, log, { seed, until })` → `{ ok, mismatches }`. Runs the same model under `run()`,
  feeding each logged injection at its logged sim time, and compares the decisions it makes with
  the log's, in order. `mismatches` lists each difference (`{ index, expected, got }`).

**H1.** Recorded and replayed, a deterministic model matches (`ok: true`). **H2.** A model that
decides something with `Math.random()` (not the sim's seeded random) is caught: `ok: false`.

## The study

`stopwatch.mjs` exports `study(clinic, { seed, alpha = 0.05, maxMornings = 5 })` → `Promise<report>`.

The `clinic` object (the lab's) has:

- `clinic.morning(k)` → the patients of morning `k` as `[{ id, arrive }]`, `arrive` in minutes
  after opening, sorted. Mornings come in order (1, then 2, ...), each once; asking out of order,
  twice, or past the manager's limit throws.
- `clinic.time(id)` → the stopwatch wait of patient `id`, in minutes. **The observer is one person:**
  timing patient X means watching from X's arrival until X is seen (arrival + X's stopwatch wait),
  and nobody else can be timed in that span. You don't know when X will be seen until you've timed
  X, so choosing whom to time is a real decision: that is the controller's job. Exactly: you may
  time only patients of the morning you asked for most recently, in arrival order, each once, and
  only a patient who arrives at or after the moment the last one you timed was seen. Anything
  else throws.
- `clinic.tablet(id)` → the tablet's recorded wait for any patient of a morning you've asked for,
  at any time after asking.
- The clinic's calls answer immediately (no promises). Each clinic answers each morning once, so
  to replay a study you need a second clinic built the same way.
- What you may assume about the clinic, and no more: patients' differences (tablet − stopwatch)
  are independent of one another and of how long they wait, with one true mean, which is what
  your interval is for. The true mean, the spread and everything else are hidden.

The report: `{ mornings, timed, estimate, lo, hi, verdict, reason }`, where `mornings` and `timed`
are counts, `estimate` is your estimate of the mean of (tablet wait − stopwatch wait) in minutes,
`[lo, hi]` its `1 − alpha` interval, `verdict` one of `'tablet reads true'`, `'tablet reads long'`,
`'tablet reads short'`, `'cannot tell'`, and `reason` a sentence.

**S1.** The study never asks for an impossible timing, never asks for more than `maxMornings`, and
returns a well-formed report. **S2.** It is honest: over many clinics with different hidden
differences, the interval holds the true difference about `1 − alpha` of the time (the lab accepts
90%–99% at alpha 0.05), and the estimate isn't biased (mean error under a minute). **S3.** The
verdict follows the interval, in this order: `'tablet reads true'` if the whole interval lies
within ±2 minutes (inclusive); else `'tablet reads long'` if it lies wholly above 0; else
`'tablet reads short'` if wholly below 0; else `'cannot tell'`.
**S4.** It is reproducible: the same seed on the same clinic gives the same report. (Running the
study through your own harness, recorded and replayed, is how you'll know its controller is
deterministic; your tests should show that.)

## Fresh (Mozzie's evidence layer)

`fresh.mjs` exports:

- `stamp(entry, links, readFile)` → the evidence entry with `digests`: for every artifact that
  `implements` a requirement the entry's check verifies, its SHA-256 (hex) as read by `readFile(path)`.
- `filter(evidence, links, readFile)` → only the entries whose recorded digests all still match.

**F1.** Change one implementing file: exactly the evidence that depended on it drops out, and vv
then reports those requirements unverified. Leave the files alone: nothing drops.

## Measured on itself

**V1.** This folder holds the project's `requirements.json` and `links.json` (the council's
requirements, revised as you build). `node test.mjs` exits 0 and writes `evidence.json`, stamped by
Fresh; after it runs, `node tools/vv/cli.mjs .` reports no problems and a coverage ratio ≥ 0.8. `README.md` explains the study, and
`LETTER.md` is the letter to the clinic's manager, in words a manager can use.
