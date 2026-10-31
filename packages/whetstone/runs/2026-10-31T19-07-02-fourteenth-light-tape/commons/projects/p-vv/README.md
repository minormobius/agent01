# vv: requirements, verification, and progress you can't fake

vv tells you how far along a project is from what has been **verified**, not from what anyone says.
Each requirement traces to the checks that verify it. A requirement counts only when those checks
pass, and earned value comes only from verified requirements. If a check that passed later fails,
the value it earned goes away again.

Files: `vv.mjs` (the library, no dependencies), `cli.mjs` (the report), `test.mjs` (the tests;
writes `evidence.json`), `requirements.json` + `links.json` (vv's own requirements, M7),
`mutants.json` (mutants the tests must kill: `node shelf/mutate.mjs vv.mjs test.mjs mutants.json
--with cli.mjs,requirements.json,links.json`).

## How a project uses it

Keep six JSON files in the project folder. Any of them may be missing.

| file | holds | who writes it |
|---|---|---|
| `requirements.json` | `[{ id, text, parent, strength, method, acceptance, rationale }]` | people, by hand |
| `links.json` | `[{ from, to, kind }]`: check `verifies` req, artifact `implements` req | people, by hand |
| `evidence.json` | `[{ check, result: 'pass'\|'fail', at }]` | **the test runner, never a person** |
| `measures.json` | TPMs: `[{ id, req, direction, threshold, objective, riskBand, history }]` | a script that measures |
| `plan.json` | `{ workPackages: [{ id, budget, start, finish, reqs }] }` | people, once, then rarely |
| `actuals.json` | `[{ wp, hours, at }]` | people, as they spend time |

The rule that makes the numbers honest: **evidence is written by the thing that ran the check.**
Have your test runner name each check (a stable id, e.g. `C-LOAD-DUP`), and write one
`{ check, result, at }` per check it ran. vv's own `test.mjs` shows how: a `check(id, fn)` wrapper
records pass/fail and the file is written at the end. Nobody types "pass".

```
node test.mjs              # runs the checks, writes evidence.json
node cli.mjs .             # one JSON object: asOf, problems, lint, coverage, orphans, status, tpms, evm
node cli.mjs . --as-of 2026-01-07   # the same, as it stood on that day
node cli.mjs . --check --min-coverage 0.8   # same JSON; exit 3 if the project fails the gate
```

`--check` turns the report into a gate for CI. It exits 3 if there is any load problem, any
failed leaf, any breached TPM, or coverage below `--min-coverage` (default 0). The reasons go to
stderr. Exit 1 means a file isn't valid JSON, and exit 2 means bad arguments.

How to read the report. `problems` and `lint` say whether the requirements are well formed.
`orphans` are leaves that nothing checks: those can never earn value. `coverage.ratio` is the share
of leaves that are verified. In `evm`, `EV` is value earned only by verification, against `PV` (the
plan) and `AC` (hours spent). `SPIt` = earned schedule ÷ actual time: 0.5 means you have earned
the value the plan expected halfway to today.

vv measures itself: `node test.mjs && node cli.mjs .` reports no problems and coverage 1.0 today
(23 leaves under 7 parents, 25 checks). `node cli.mjs . --check --min-coverage 0.8` exits 0.

## API (vv.mjs)

`load(list)`, `lint(req)`, `trace(reqs, links)`, `status(reqs, links, evidence, { asOf })`,
`coverage(reqs, statusMap)`, `tpm(measure, { asOf })`, `earned(reqs, links, evidence, plan, actuals,
{ asOf })`, as SPEC.md defines them. Also exported: `report(data, { asOf })` (what the CLI prints),
`leaves`, `latestResults`, `latestDate`, `dayIndex`, `dateOf`.

## Decisions (where SPEC.md left it open)

- **D1 Dates.** `YYYY-MM-DD` is parsed to a UTC day index (`Date.UTC / 86400000`). Comparison is by
  day. A malformed date throws.
- **D2 No asOf.** At library level, an absent `asOf` means no cutoff. The CLI always supplies one.
  In `tpm`, the projection then starts from the latest point's date. In `earned`, PV is the full
  budget, and `AT`/`SPIt` are null.
- **D3 Leaves.** A leaf is a requirement whose id no requirement names as `parent`. An unknown
  parent doesn't make anything a non-leaf.
- **D4 Empty acceptance.** Missing, null, non-string, `''` or whitespace-only all count as no
  acceptance.
- **D5 Duplicates in load.** The per-requirement checks (`bad-id`, `unknown-parent`, `bad-method`,
  `missing-acceptance`) run on every entry, duplicates included. Problems are deduplicated by
  (id, code), so a duplicate with the same fault reports it once. Cycle detection follows the
  *first* entry of each id.
- **D6 "As words".** A word is bounded by anything that isn't `[A-Za-z0-9_]` (JS `\b` semantics),
  case-insensitive. So `TBDs`, `breakfast` and `easily` don't match, while `etc.`,
  `User-Friendly` and `fast-moving` do. `as needed` allows any whitespace between the words.
  `and/or` is a substring match, case-insensitive. `no-shall` looks for the whole word `shall` in any
  case (`shallow` doesn't count).
- **D7 Odd results.** Evidence with a result other than `pass`/`fail` still counts as that check's
  latest result, but it makes the leaf neither failed nor verified, so the leaf is `partial` (or
  `unverified` if none of its checks has a result).
- **D8 Latest TPM point.** "Latest" means the latest by date, and the later list entry wins a tie,
  the same rule as evidence. The history doesn't need to be in order.
- **D9 Trend with every point on one day.** The slope is undefined, so `trend` is null and so is
  `projectedBreach`.
- **D10 A work package with no reqs** earns 0. Nothing else earns value.
- **D11 Actuals booked to an unknown work package** count in project `AC` (the hours were spent).
  They appear in no `byWP` entry.
- **D12 Earned schedule** compares `PVd(n) ≤ EV` with a tolerance of 1e-9 × max(1, BAC), so EV that
  equals a day's PV isn't lost to float rounding. On a PV plateau, C is the *last* day of the
  plateau, as the spec's "largest n" says. Days beyond the latest `finish` aren't plan days.
- **D13 CLI files.** A missing or empty file counts as empty (`[]`; `plan` → null, so `evm` is null).
  Invalid JSON is an error (exit 1), not silently empty. The default `asOf` is the latest date in
  evidence, actuals and measure histories, otherwise today (UTC). Unknown flags are ignored.
- **D14 Empty plan** (`{ workPackages: [] }`): `evm` is not null. BAC/PV/EV are 0, AC is summed,
  and ES is 0 with AT and SPIt null.
- **D15 `trace` deduplicates** the `from` ids that verify or implement a requirement, and ignores
  link kinds other than the two.
- **D16 "Past" the threshold is strict** (Morphyx). A fitted line within 1e-9 × max(1, |threshold|)
  of the threshold is *on* it, not past it, so float noise can't move `projectedBreach` a day early.
- **D17 Far crossings** (Morphyx). The crossing is found in closed form and then settled by unit
  steps, so a tiny slope can't hang the loop. A crossing after 9999-12-31 can't be written as
  `YYYY-MM-DD`, so `projectedBreach` is null.
- **D18 Cycles reaching status** (Modulo). The spec never gives `status` a cycle, but a real
  project's CLI can. Cycle members get `unverified`, and the roll-up stops at them. Before this,
  `node cli.mjs` overflowed the stack on a 2-cycle instead of reporting it in `problems`.
- **D19 `--as-of D` and `--as-of=D`** are both accepted, in any position. `--as-of` without a
  date exits 2.
- **D20 `--check`** (not in SPEC) is the CI gate described above. Without the flag, the exit code
  and output are exactly the M6 behaviour.
- **D21 A self-parent is still a leaf** (Morphyx, turn 4). SPEC: a leaf is a requirement "no
  *other* requirement names as its parent". `{id:'A', parent:'A'}` is a one-member cycle, and it
  is also a leaf, so `load` reports `bad-method` / `missing-acceptance` on it along with `cycle`.
  "Other" means another entry. If a duplicate `A` names `A`, the first `A` is not a leaf, but the
  duplicate is. This only changes `load`, because M2–M6 never see cycles. Before this, vv and
  the oracle shared the wrong reading, so the oracle couldn't catch it.
- **D22 A missing instrument gives no evidence** (Morphyx, turn 4). C-ORACLE needs
  `shelf/vv-oracle.mjs`. If vv is copied somewhere without it, `node test.mjs` prints `SKIP` and
  records nothing for C-ORACLE, so VV-M7-ORACLE shows `unverified` (coverage 22/23 in a bare
  copy). It isn't a pass, because nothing was checked. It isn't a fail, because nothing was found
  wrong.
