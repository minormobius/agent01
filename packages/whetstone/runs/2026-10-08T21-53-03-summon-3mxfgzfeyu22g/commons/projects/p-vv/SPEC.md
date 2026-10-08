# vv — requirements, verification, and progress you can't fake

Most projects measure progress by asking people how done they are. This tool measures it by what
has been **verified**: every requirement traces to the checks that verify it, a requirement counts
only when its checks pass, and earned value is earned only by verified requirements. Technical
performance measures watch the numbers that matter as they move. It is meant to run real projects,
starting with the ones you build next.

Build it as `vv.mjs` (ES module, no dependencies) and `cli.mjs`, with `node test.mjs` running your
tests and `README.md` explaining it. Seven milestones, each tested on data you haven't seen. More
than a day's work; the folder carries over.

Anything this spec doesn't settle is yours to decide: decide it, and write the decision down (in the
README, or the ledger) so the other can build on it instead of re-deciding it.

Dates are `YYYY-MM-DD` strings, UTC, compared as days. Where an output is a list of ids, sort it,
always by plain string comparison (code-unit order, as `[...].sort()` does), never by locale.
M2–M6 are only ever given requirement lists that `load` finds no `duplicate-id` or `cycle` in.

## M1 — requirements

A requirement: `{ id, text, parent = null, strength: 'shall' | 'should' | 'may', method:
'test' | 'analysis' | 'inspection' | 'demonstration', acceptance, rationale }`. A **leaf** is a
requirement no other requirement names as its parent.

`load(list)` → `{ reqs, problems }`. `reqs` is the list as given; `problems` is
`[{ id, code }]`, sorted by id then code, with these codes:

- `bad-id`: the id doesn't match `^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$`
- `duplicate-id`: a second (or later) requirement with an id already seen (reported once per id)
- `unknown-parent`: the parent isn't an id in the list
- `cycle`: the requirement is on a parent cycle (report every member)
- `bad-method`: a leaf whose method isn't one of the four
- `missing-acceptance`: a leaf with strength `shall` and no non-empty `acceptance`

`lint(req)` → the sorted, distinct codes that apply to that requirement's text:

- `tbd`: contains TBD, TBC or TBR (as words, any case)
- `vague`: contains any of these words or phrases, any case, as whole words: fast, quickly,
  user-friendly, easy, robust, efficient, flexible, adequate, appropriate, as needed,
  state-of-the-art, etc
- `and-or`: contains "and/or"
- `no-shall`: strength is `shall` but the text doesn't contain the word "shall"

## M2 — traceability

Links: `{ from, to, kind: 'verifies' | 'implements' }`: a check verifies a requirement, an
artifact implements one. `trace(reqs, links)` → `{ verifiedBy, implementedBy, orphans, dangling }`:

- `verifiedBy` / `implementedBy`: requirement id → sorted ids of what verifies / implements it
  (every requirement present, `[]` if none)
- `orphans`: leaves with nothing verifying them
- `dangling`: the indices (in `links`) of links whose `to` isn't a requirement

## M3 — verification status

Evidence: `{ check, result: 'pass' | 'fail', at }`. `status(reqs, links, evidence, { asOf })` →
requirement id → status. Only evidence with `at` ≤ `asOf` counts, and a check's result is its
latest (a later entry in the list wins a tie).

- a leaf: `unverified` if nothing verifies it or none of its checks has a result; `failed` if
  any of its checks' latest result is a fail; `verified` if every check's latest result is a pass;
  otherwise `partial`.
- a parent: over its children with strength `shall` (or all its children, if none is `shall`):
  `verified` if all are verified; `failed` if any is failed; `unverified` if all are unverified;
  otherwise `partial`.

`coverage(reqs, statusMap)` → `{ verified, failed, partial, unverified, total, ratio }` over leaves,
`ratio` = verified ÷ total (0 if no leaves).

## M4 — technical performance measures

A measure: `{ id, req, direction: 'max' | 'min', threshold, objective, riskBand, history: [{ at,
value }] }`. `max` means the value must stay at or under the threshold; `min`, at or over.
`riskBand` defaults to 10% of |threshold|. `tpm(measure, { asOf })` → `{ current, margin, status,
objectiveMet, trend, projectedBreach }`, using only history with `at` ≤ `asOf`:

- `current`: the latest value (null if none, and then status `unknown`, the rest null)
- `margin`: threshold − current for `max`, current − threshold for `min`
- `status`: `breached` if margin < 0, `at-risk` if margin < riskBand, else `met`
- `objectiveMet`: current is on the right side of `objective` (or equal); null with no `objective`
- `trend`: least-squares slope of value against day number (days since the first point counted),
  per day; null with fewer than two points
- `projectedBreach`: if not breached and the trend runs toward the threshold (rising for `max`,
  falling for `min`), the first date on or after `asOf` on which the fitted line is past the
  threshold (over it for `max`, under it for `min`); otherwise null

## M5 — earned value, earned by verification

A plan: `{ workPackages: [{ id, budget, start, finish, reqs: [ids] }] }`; actuals: `[{ wp, hours,
at }]`. `earned(reqs, links, evidence, plan, actuals, { asOf })` → `{ BAC, PV, EV, AC, SV, CV, SPI,
CPI, ES, AT, SPIt, byWP }`:

- day numbers count from the plan's earliest `start`, which is day 1
- PV of a work package on day d = budget × clamp((d − start + 1) ÷ (finish − start + 1), 0, 1),
  with start and finish as day numbers; project PV is the sum
- EV of a work package = budget × (its requirements whose status at `asOf` is `verified`) ÷ (its
  requirements). Nothing else earns value.
- AC = the sum of actual hours with `at` ≤ `asOf`. SV = EV − PV, CV = EV − AC, SPI = EV ÷ PV,
  CPI = EV ÷ AC (null when dividing by zero)
- earned schedule: let PVd(n) be project PV on day n, PVd(0) = 0. C = the largest n ≥ 0 with
  PVd(n) ≤ EV; ES = C + (EV − PVd(C)) ÷ (PVd(C+1) − PVd(C)), or C if there is no day C+1 in the plan
  or PVd(C+1) = PVd(C). AT = asOf's day number. SPIt = ES ÷ AT.
- `byWP`: work package id → `{ PV, EV, AC }`

## M6 — the report

`node cli.mjs <dir> [--as-of YYYY-MM-DD]` reads `requirements.json`, `links.json`,
`evidence.json`, `measures.json`, `plan.json` and `actuals.json` from `<dir>` (a missing file is
empty) and prints one JSON object: `{ asOf, problems, lint, coverage, orphans, status, tpms, evm }`.
`lint` maps id → codes for requirements with any; `tpms` maps measure id → its `tpm`; `evm` is
`earned(...)`, or null without a plan. `asOf` defaults to the latest date in evidence, actuals and
measure histories (today's date if there are none).

## M7 — it measures itself

This folder holds vv's own `requirements.json` (at least 12 leaves) and `links.json`, tracing
them to your tests. `node test.mjs` exits 0 **and writes `evidence.json`**, a pass or fail for each
check it ran. After it runs, `node cli.mjs .` must report no problems and coverage ratio ≥ 0.8.
`README.md` explains the tool and how a project would use it.
