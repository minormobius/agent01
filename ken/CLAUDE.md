# ken — ken.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs, now HAND-OWNED — edit directly.
     Repo-wide rules live in ../CLAUDE.md; the surface index is
     ../docs/SURFACES.md. -->

The study programme behind `loop` and `plant`, given its own surface: **the
measurement of unattended work, treated as a field.** Two standing documents —
a curriculum and a protocol — in journal dress.

## Facts

| | |
|---|---|
| Surface | `ken` |
| Dir | `ken/` |
| Endpoint | `ken.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/repo-study-fields-0ftd34` |
| Deploy | `.github/workflows/deploy-ken.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "ken"`.

## The domain is attached — verified

`ken.mino.mobi` is **live and bound to worker `ken`**, confirmed 2026-08-22 on
the first deploy (run #1): `/`, `/syllabus` and `/protocol` all return 200 with
the expected content.

Worth recording precisely, because the surface was built expecting otherwise.
[`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7 lists attaching a custom domain as
dashboard-only, and `curl -sI https://ken.mino.mobi` returned 502 before the
first deploy. In fact **wrangler created the custom domain itself** from the
`routes` block — the zone is already in the account, so the API token had
enough authority. §7's rule is about account topology it genuinely cannot
change; a new hostname on an existing zone is not that.

The golden rule still applies to every future change here: if you rename the
worker or move the domain, **verify the deploy log binds
`ken.mino.mobi (custom domain)`**. Green is not proof.

## Layout

| Path | What |
|---|---|
| `index.html` | masthead, aims and scope, and the editorial on the pilot run |
| `syllabus.html` | **Article I**, the seven-unit curriculum. Served at `/syllabus`. |
| `methods.html` | **Article II**, the house standard for model experiments. Served at `/methods`. |
| `lab.html` | **Instrument note** for the harness. Served at `/lab`. |
| `wp1.html` | **Working paper 1**, Unit II worked end to end. Served at `/wp1`. |
| `log.html` | **The findings log.** Numbered, terse, append-only. Served at `/log`. |
| `protocol.html` | **Article III**, the Stage 1 registered-report skeleton. Served at `/protocol`. |
| `tree.js` | the roadmap DAG: node data plus the SVG renderer |
| `lab/design.mjs` | **the harness.** Node-only, not served |
| `lab/design.selftest.mjs` | 92 known-answer checks for it |
| `lab/simulate.mjs` | simulate a design before running it. Node-only |
| `lab/simulate.selftest.mjs` | 32 known-answer checks for it |
| `lab/figures.mjs` | renders `fig/*.svg` from packages/dataviz. `--write` to regenerate |
| `lab/h4.mjs` | the exchangeability analysis over the loop ledger |
| `lab/h4.selftest.mjs` | 37 checks, pinned to the committed ledger |
| `lab/factorial.mjs` | the bake-off as a replicated 2×3 factorial |
| `lab/bt.mjs` | Bradley–Terry over pairwise verdicts |
| `lab/blind.mjs` | prepares a blinded judging pass |
| `lab/judging/` | blinded material, verdicts, and the key |
| `lab/factorial.selftest.mjs` | 36 checks for both |
| `lab/resolve-refs.mjs` | links the bibliography against CrossRef / arXiv / OpenLibrary |
| `fig/*.svg` | **generated.** Committed so figures print and diff |
| `refs.js` | **the bibliography, as data** — 54 real works, keyed |
| `cite.js` | numbers citations in document order, renders the reference list |
| `journal.css` | the shared journal typography; prints to real Letter pages |
| `worker.js` | thin assets worker; maps `/syllabus` and `/protocol` to their `.html` |
| `prose-lint.mjs` | the tic lint; importable, and runnable standalone |
| `ken.selftest.mjs` | the gate. **Run it before touching anything here** |

`CLAUDE.md`, `ken.selftest.mjs` and `prose-lint.mjs` are `.assetsignore`d; everything else ships.

## The harness

`ken/lab/design.mjs` is the design calculator. Node-only, `.assetsignore`d, and
it takes its statistics from `packages/dataviz` rather than reimplementing
them.

```bash
node ken/lab/design.selftest.mjs   # 92 known-answer checks
```

Every assertion in that selftest is a value derivable by hand or from a table,
never a snapshot of what the code returned. When one fails, check your
arithmetic before the code: three of the first failures were wrong test
expectations, including an n₀ where the sum of squared group sizes was
miscounted.

The module's practical finding, which is worth knowing before designing any
run: **for a fixed run budget, repeats do not buy precision.** With
`R = tasks · repeats` held constant the within-task term of the variance is
`σ²_within / R` regardless of the split, so every repeat is a task forgone and
one repeat is optimal at every ICC. What repeats buy is the variance estimate,
which is a different and necessary thing: at one repeat `dfWithin = 0` and
`σ²_within` is not estimable at all. Hence `variancePilot()`, and hence
`allocate()` returning a `finding` string rather than just an argmin.

The other lever is pairing. Running conditions on shared tasks cuts required
observations by `(1 − ρ)`, which at a plausible ρ = 0.7 turns a 126-run
comparison into a 38-run one. Nothing else in the library saves as much.

## Simulate before you run

`lab/simulate.mjs` is deterministic throughout: a seeded mulberry32, never
`Math.random`. That is what lets a published sampling distribution be
reproduced exactly, and it is why `ken.selftest.mjs` can assert WP1's tables
digit for digit rather than within a tolerance. **If you add a simulation whose
result gets published, record its seed and trial count in the call, and add the
assertion.**

The module earned its place immediately. The 24-run variance pilot recommended
in the first version of `lab.html` turned out, on simulation, to return a 95%
interval on ICC of about `[0.00, 0.80]` at a true 0.5, and to return exactly
zero a quarter of the time at a true 0.2. Reallocating the same runs did not
help; reaching ±0.16 takes 144. The pilot was re-scoped to a model check, which
it does well, and `variancePilot()`'s doc comment and `note` field now say so.

Two things follow for anyone editing here:

- **A published recommendation that turns out wrong gets corrected in place,
  visibly.** `lab.html` §5 carries a "Revised after simulation" note rather than
  a quiet edit, and links to the paper that overturned it. The programme is
  about honest measurement; silently fixing its own record would be the one
  unrecoverable move.
- **The simulation assumes the model the run is partly there to test.** Say so
  wherever its numbers appear. WP1 does, in its limits box.

## The findings log

`/log` is the running record: numbered entries, shortest form, each naming the
code or record that produced it. **Append-only.** A corrected entry is struck
and restated in a new entry, never edited away — the site is about honest
measurement and quietly rewriting its own history is the one unrecoverable
move.

Its ledger at the foot counts entries by provenance, and the selftest asserts
the "new inference" row still reads zero. When that changes, change it because
a run happened.

## Analysing the ledger (H4)

`lab/h4.mjs` joins `runs.jsonl` to `turns.jsonl`, derives a duration per turn,
and tests exchangeability. Three things to know before touching it:

- **The outcome is duration, not quality.** The loop recorded no quality scores,
  so there is nothing else continuous to regress. Exchangeability is a claim
  about the process, which duration measures.
- **`infra: true` runs must be excluded and the flag is incomplete.** 45 of 89
  records predate it. `INFRA_SECONDS = 120` is the fallback rule; it catches 11
  of 12 known cases and misclassifies 2 of 32 known-real, and every threshold
  from 90s to 200s gives the same split, so nothing hinges on the number.
- **Sensitivity is not optional at this n.** Seven beads carry the whole
  within-task test, and the headline slope turned out to be one of them. Always
  run leave-one-out before believing a slope here.

`globalDrift()` drops a zero-variance predictor. Without that guard, filtering
to passing runs only left a constant column duplicating the intercept and OLS
returned slope exactly 0 with SE exactly 0 — a singular fit that reads as a
clean null. Found by sensitivity, not by the maths.

## Judging passes

`lab/blind.mjs` writes two files: `<race>.blinded.md`, which the judge reads,
and `<race>.mapping.json`, which must not be opened until verdicts are on disk.
Entries are relabelled by a seeded shuffle **and** scrubbed of harness, model
and provider names, because an agent's own notes routinely name what produced
them.

**Commit the verdicts before opening the key.** The race-02 pass did, so the
order is checkable in git history rather than asserted. That is the only part
of a self-judged pass that can be made verifiable, and it is worth the extra
commit.

Two things `bt.mjs` will refuse, both of which happened here:

- **A disconnected comparison graph.** No unique fit exists.
- **Separation in either direction.** An item that never wins has θ → −∞; one
  that never loses has θ → +∞. The first version checked wins only, let two
  undefeated items through, and returned strengths spanning 17 log-odds with
  standard errors of 12 — numbers that were not numbers. Pass `prior: 0.5` for
  the conventional regularised fit; the default of 0 exists so the failure is
  visible rather than papered over.

A winless item can sometimes be fixed by adding the pair that was missing from
the design. An undefeated one cannot, and needs the prior.

## Figures and the bibliography

**Figures are server-rendered and committed.** `lab/figures.mjs` builds them
from `packages/dataviz` (whose Okabe–Ito palette is already validated, so
nothing here picks a colour) and writes `fig/*.svg`. The selftest regenerates
and byte-compares, so a figure cannot drift from its data. Regenerate with
`node ken/lab/figures.mjs --write`. Pages inline the SVG, so figures print and
need no JavaScript.

**The bibliography links to registry records, not to nothing.**
`lab/resolve-refs.mjs` queries CrossRef for articles, arXiv for preprints and
conference papers, and OpenLibrary for books, accepting a candidate only on an
exact year match plus a close title match. 74 of 82 resolve; the other 8 render
as "unlinked" rather than pointing somewhere approximate.

The matcher is deliberately fussy, and it earned that. Title similarity alone
matched a PsycEXTRA *dataset* stub to False-Positive Psychology and an
*American Historical Review review* to Chandler's book, both scoring 1.0 —
because the title is the same. The fix was filtering CrossRef record types and
sending books to OpenLibrary only. Re-run it after adding references:

```bash
node ken/lab/resolve-refs.mjs           # report
node ken/lab/resolve-refs.mjs --write   # patch accepted hits into refs.js
```

Network-only. **Never call it from the selftest** — CI has no business
reaching out, and the selftest checks URL shape and coverage instead.

## The roadmap figure

`tree.js` holds the graph as data and renders it to `#roadmap` on the front
page. Nodes carry `state` (`done` / `active` / `ready` / `blocked`), a `href`
and a `needs` list; edges are drawn as orthogonal elbows with arrowheads,
lower-to-upper.

The selftest asserts the graph is acyclic, that every `needs` id exists, that
every prerequisite sits on a **lower row** than the node needing it (so no edge
ever points down), that no two boxes overlap, and that every `href` resolves to
a page that exists and an anchor that is present on it. Adding a node with a
bad link fails the build.

Geometry lives in `COLS` and `ROW_Y`. To add a row, extend `ROW_Y` and bump the
`viewBox` height on the `<svg>` in `index.html`; the two are not linked and a
mismatch silently clips the figure.

## Three gates, and why each exists

```bash
node ken/ken.selftest.mjs     # ~1s, 558 checks
node ken/prose-lint.mjs       # the tic lint alone, with --verbose for hits
```

### 1. Every work cited here is real, and the citation is machine-checked

Pages never hand-number citations. They write `<a class="cite"
data-ref="holmstrom1991"></a>` and leave an empty `<ol id="reflist">`; `cite.js`
numbers in document order and renders the list. Add a work to `refs.js`, cite it
by key, and the numbering takes care of itself.

The selftest asserts across every page that each `data-ref` resolves, that every
entry in `refs.js` is cited at least once (an uncited entry is usually a sign a
section was cut), that every entry carries author, year, title and venue, and
that no key is declared twice.

### 2. The figures in the prose still match the record

The site makes numerical claims about three prior runs. All of them are
recomputed on every build:

| Source | Claims checked |
|---|---|
| `ken/lab/design.mjs` | every number in the instrument note's Tables 1–3, recomputed and compared |
| `ken/lab/simulate.mjs` | every interval, width and detection rate in WP1's Tables 2–6, regenerated from the recorded seed and compared digit for digit |
| `.github/loop/{turns,runs}.jsonl` | 99 orders, 89 turns, 17 gate failures, 59 of 89 at the probe ceiling, 0 quality scores, 1 of 3 signals fired |
| `bakeoff/results/race-01/results.json` | 11 runs, 11/11 gate, 11/11 primitives, judges `null`, 2 entries with a zero patch beside a real entry directory |
| `bakeoff/results/race-02/results.json` | 12 runs, 12/12 gate, 12/12 primitives, judges `null` |

`deploy-ken.yml` triggers on those paths as well as on `ken/**`, so re-enabling
the loop or running another bake-off **turns this surface red until the prose is
rewritten**. That is the designed behaviour and the reason the check exists.

### 3. The prose passes the tic lint

`prose-lint.mjs` is a density lint for the constructions catalogued in the
declauding register: em-dash density, negation-first reveal ("It is not X. It is
Y."), significance designation ("load-bearing", "what actually matters"),
abstraction agency ("the table shows", "the number lies"), aphoristic closers,
coy or thesis-shaped headers, fragment cadence, unearned intensifiers, one-line
paragraph share, and sentence-length monotony.

Two things about it are deliberate:

- **It is a density check, not a ban.** Every construction is legitimate once.
  The documented failure of over-correcting is prose with uniform sentence
  length, no first-person judgement and no digression, which is worse than the
  tics. If a rule fires and the sentence is right, widen the budget in
  `prose-lint.mjs` and say why in the commit.
- **Lexical rules read `<p>`, `<li>` and `<td>`; structural rules read `<p>`
  only.** An em-dash in a table cell is the same tic as one in a paragraph, and
  an earlier version reading only `<p>` let twelve of them hide in one page's
  tables. But a table cell is *supposed* to be short, so flagging it for
  paragraph length is noise.

Headers are the rule worth internalising, because it is absolute rather than a
density: a header names its section, it does not tease or argue it. "Known gaps
in this standard", not "What this standard does not yet cover".

## Why it looks like a journal, and why that is not a joke

The register is borrowed from [`wormhole`](../wormhole/), which generates entire
fabricated literatures — plausible papers, plausible citations, plausible fields,
all invented, all deterministic from a seed. The two surfaces are a **matched
pair and should stay legible as one**: same paper-sheet-on-viewer-ground idiom,
same print-to-Letter behaviour, same booktabs tables.

The difference is the point. `wormhole` demonstrates how cheaply the apparatus
of scholarship can be counterfeited. `ken` therefore has to be able to *prove*
it is not counterfeit, and a machine-checked bibliography is the only form of
that proof worth anything. If you ever find yourself wanting to add a citation
you have not read, add it to `wormhole` instead — that is what it is for.

## What is deliberately unfinished

`protocol.html` publishes **six named blanks** (§4, B1–B6) rather than filling
them: a defined construct, an estimated reliability, a calibrated judge, a
powered sample size, a stopping rule, and an outside signal. Each is the
deliverable of a curriculum unit, and the protocol is not registrable until all
six close.

**Do not fill a blank with a plausible number.** Closing one means the unit was
done and the quantity was measured; anything else re-creates the exact failure
this surface exists to document. When a blank does close, update §4's table,
add the figure, and note the date.

## Things worth knowing before editing

- **The unit order in the syllabus is load-bearing.** Unit IV's shrinkage factor
  *is* Unit I's reliability — the same algebra from two ends — and Unit VI's
  results are anecdotes without Unit V's Bradley–Terry machinery. Reordering
  breaks the argument, not just the pacing.
- **The editorial's caveat paragraph is not padding.** The faint downward drift
  in `probes` and the near-doubling of gate failures are *not* evidence quality
  declined; the first is not significant and the second is confounded with task
  difficulty. Any rewrite that quietly upgrades those into findings is exactly
  the error the surface is about.
- **`worker.js` exists only for the two clean URLs.** If you add a third
  article, add it to the `clean` map or it will 404 without its `.html`.
- The stylesheet commits to a light paper sheet on a dark viewer ground, like
  its sibling. That is deliberate — a journal is paper — so don't bolt on a dark
  mode without deciding the pair should diverge.

## Deploying

Pushes to `claude/repo-study-fields-0ftd34` that touch `ken/**` trigger
[`.github/workflows/deploy-ken.yml`](../.github/workflows/deploy-ken.yml), which
runs the selftest as a gate and then `wrangler deploy`. The sandbox cannot reach
Cloudflare — **push to the trigger branch, don't `wrangler deploy` locally.**
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, and see the domain warning at
the top of this file.
