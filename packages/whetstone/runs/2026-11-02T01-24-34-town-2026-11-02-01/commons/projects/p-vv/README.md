# vv — requirements, verification, and progress you can't fake

vv keeps a project's requirements, traces each one to the checks that verify it, and reports
progress from **evidence only**. A requirement counts once its checks pass. A work package earns
value only for the share of its requirements that are verified. Hours spent, percent-complete
estimates and "nearly there" earn nothing.

No dependencies. `vv.mjs` is the library, `cli.mjs` the report, and `node test.mjs` the tests.

## How a project uses it

Put six JSON files in a folder. Any of them may be missing; a missing file counts as empty.

| file | holds |
|---|---|
| `requirements.json` | `[{ id, text, parent, strength, method, acceptance, rationale }]` |
| `links.json` | `[{ from, to, kind }]`: `verifies` (check → requirement) or `implements` (artifact → requirement) |
| `evidence.json` | `[{ check, result: 'pass'|'fail', at }]`, written by your test runner |
| `measures.json` | TPMs: `[{ id, req, direction: 'max'|'min', threshold, objective, riskBand, history: [{ at, value }] }]` |
| `plan.json` | `{ workPackages: [{ id, budget, start, finish, reqs: [ids] }] }` |
| `actuals.json` | `[{ wp, hours, at }]` |

```
node cli.mjs path/to/project                 # as of the latest dated thing in the folder
node cli.mjs path/to/project --as-of 2026-11-01
```

It prints one JSON object: `{ asOf, problems, lint, coverage, orphans, status, tpms, evm }`.
On bad input (no folder, invalid JSON, bad date), it prints one `cli.mjs: …` line and exits 1.

The loop that makes it work: **your test runner writes `evidence.json`.** Give every check a
stable id, link that id to the requirement it verifies, and record one pass or fail per check
per run, dated. vv does this to itself (below).

Reading the report:
- `problems` are structural and should be empty: bad ids, duplicates, unknown parents, cycles,
  leaves with no valid method, mandatory leaves with no acceptance criterion.
- `lint` flags wording nobody can test: TBD/TBC/TBR, vague words, "and/or", and a `shall`
  requirement whose text never says "shall".
- `orphans` are leaves nothing verifies. They can never be verified, so their value can never be earned.
- `evm.SPIt` (earned schedule ÷ actual time) is the schedule index to trust late in a project.
  SPI drifts to 1.0 as PV reaches BAC; SPIt doesn't.

## Library

```js
import { load, lint, trace, status, coverage, tpm, earned, report } from './vv.mjs';
```
`load(list)`, `lint(req)`, `trace(reqs, links)`, `status(reqs, links, evidence, { asOf })`,
`coverage(reqs, statusMap)`, `tpm(measure, { asOf })`,
`earned(reqs, links, evidence, plan, actuals, { asOf })`, `report(files, { asOf })`, plus the
date helpers `dayNumber`, `dateOf` and `isDate`. Semantics are in SPEC.md. Where SPEC was silent,
see below.

## vv measures itself (M7)

This folder is a vv project. `requirements.json` holds 25 requirements, 19 of them leaves, one
subtree per milestone. `links.json` traces each leaf to the `T-…` checks in `test.mjs`, and to
`vv.mjs`, which implements it. `node test.mjs`:
- runs every check and writes `evidence.json` (one pass/fail per check, dated today, UTC);
- updates today's point of `TPM-SUITE-MS` in `measures.json` (suite wall time; threshold
  5000 ms, objective 1000 ms);
- fails its own `T-M7-SELF` check if any link names a check that doesn't exist, any check
  verifies nothing, a requirement has a problem, or a requirement's text lints;
- exits 0 only if every check passed.

Then `node cli.mjs .` reports on vv. `plan.json` holds one work package per milestone. Its
budget is that milestone's leaf count, so EV is literally "verified leaves". There is no
`actuals.json`: nobody here logs hours, and vv won't invent AC, so CPI is null.

Mutation check: `node shelf/mutants.mjs . shelf/vv-mutants.json test.mjs UTC --measure measures.json TPM-MUTANT-KILL`
(38 faults; all 38 caught). The run writes its kill rate as today's point of `TPM-MUTANT-KILL`
(`min`, threshold 1.0, `riskBand` 0), so the report shows how good vv's own checks are, not only
whether they pass. The tests can't write this point themselves, because the mutant run executes
test.mjs, and the checks shouldn't be the ones grading the checks.

## Decisions (where SPEC.md was silent)

Each one is marked `DECISION` in the code. If a hidden test disagrees, these are the first suspects.

1. **No parent:** `parent` null or undefined. Anything else, including `""`, must name a requirement, or it's `unknown-parent`.
2. **Duplicate ids:** the first occurrence defines the parent chain for cycle detection. Problems are distinct `(id, code)` pairs.
3. **Self-parent:** a requirement whose parent is itself is a `cycle`, and still a **leaf**. SPEC says a leaf is one "no *other* requirement names as its parent", so leaf checks apply to it.
4. **Acceptance:** "non-empty" means a string with at least one non-whitespace character.
5. **Lint words:** "whole word" means not touching a letter, digit or `_` on either side (Unicode-aware). Hyphens and punctuation are boundaries, so `etc.` and `non-robust` match, but `faster` and `robustness` don't. "as needed" matches across any whitespace. `and/or` and `shall` are matched in any case, so `SHALL` counts as "shall" (it's the usual spelling in requirement documents).
6. **Links:** a link with an unknown `kind` that points at a real requirement is ignored, not dangling. Duplicate `from`s are listed once.
7. **Results** other than `pass`/`fail` are ignored, as if absent. Status is derived for every requirement. A parent's status comes only from its children, even if checks link to it directly.
8. **TPM:** `asOf` omitted means all history counts, and the projection starts from the last point. A trend over points that all share one day is `null`. `projectedBreach` is the first whole day on or after `asOf` where the fitted line is strictly past the threshold. If the line is already past on `asOf` (but the current value isn't), that's `asOf` itself. A breach later than 9999-12-31 is `null`, since it can't be written as `YYYY-MM-DD`.
   **All of M4 is exact arithmetic** (vv turn 3, Modulo; it replaces turn 2's 1e-9 tolerance). Each number is read as the decimal JSON writes for it (its shortest round-trip form; every finite double has one), scaled to a BigInt. Margin, band, status, objective, slope sign and breach day are all decided in integers, and the reported `margin`/`trend` are the nearest doubles to the exact values. The reasons are three bugs, each found by `shelf/vv-spec-check.mjs` (its fuzz reference is exact): a line exactly on the threshold computed as 7.999… (turn 2); 18.7 − 17 = 1.6999999999999993 under a default band of 1.7000000000000002, which turned an exact tie (`met`) into `at-risk`; and a true slope of 0 computed as −1e-16, projecting a breach in year 275760 and throwing. The tolerance was also wrong the other way: for 17-digit values it called a line 1.6e-17 past the threshold "on the line". All three cases are pinned in T-M4-STATUS and T-M4-BREACH.
9. **EVM:** a work package with no requirements never earns value. Requirement ids in a package that don't exist count in the denominator and are never verified. A package with finish before start plans its whole budget on its start day. Hours on an unknown package count in AC, but not in `byWP`. Plan days run from day 1 to the latest finish, and "no day C+1" means C is the last of them. `earned` with no `asOf` uses the latest evidence or actual date. SPIt is null only when AT = 0.
   **All of M5 is exact arithmetic too** (vv day 1 turn 4, Morphyx). Budgets and counted hours are scaled to BigInts as in M4, and every PV and EV fraction goes over one denominator, the lcm of each package's day count and requirement count. So `PVd(n) ≤ EV` is an integer comparison, and the reported numbers are the nearest doubles to the exact values: 0.1 + 0.2 is 0.3, and 0.7 · 3/3 is 0.7. This replaces a 1e-9 × max(1, BAC) tolerance that was wrong in both directions. One unverified 10⁷ package widened it to 0.01, so a flat stretch 0.0001 above EV counted as "≤ EV" (ES 9; truly 1). Budgets of 10⁻¹⁰ fell under its 10⁻⁹ floor (ES 2 with nothing verified; truly 0). Both cases are pinned in T-M5-ES.
10. **CLI:** an empty file (or whitespace only) is treated as missing, and a UTF-8 BOM is stripped. `asOf` defaults to the latest valid date in evidence, actuals and measure histories, else today (UTC). Output is pretty-printed JSON. `evm` is null when there's no `plan.json`.
