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
| `wp2.html` | **Working paper 2**, Unit IV. Every table and figure on it is generated. Served at `/wp2`. |
| `wp3.html` | **Working paper 3**, Unit IV. The exchange rate, with a live calculator. `/wp3` |
| `wp4.html` | **Working paper 4**, Unit IV. A theory of the gate, with a strategy chooser. `/wp4` |
| `log.html` | **The findings log.** Numbered, terse, append-only. Served at `/log`. |
| `run.html` | **The standard-run procedure.** Written to ASD-STE100. Served at `/run`. |
| `protocol.html` | **Article III**, the Stage 1 registered-report skeleton. Served at `/protocol`. |
| `shapes.html` | **the shape explorer.** Enter n, see every org chart it admits. `/shapes` |
| `register.html` | **the hypothesis register.** Wholly generated. `/register` |
| `tree.js` | the roadmap DAG: node data plus the SVG renderer |
| **`graph/`** | **served to the browser.** Pure ES modules, no node, no copies |
| `graph/plan.mjs` | a run plan as **rewrite rules**, on morph's four laws |
| `graph/roles.mjs` | **the org chart, derived**: nine roles, orbits, the ken ratio |
| `graph/shapes.mjs` | the six hand-built org charts of WP2 |
| `graph/profiles.mjs` | **any n**: layer profiles, the trade, the frontier |
| `graph/exhaustive.mjs` | **the whole space** up to 7 turns, and the coverage measurement |
| `graph/ancestry.mjs` | content-addressed state, after hoop's region digest |
| `graph/hypotheses.mjs` | **the hypotheses, as data** — eleven, each with a status |
| `graph/visibility.mjs` | isolation regimes: what the environment adds to the drawn graph |
| `graph/attenuation.mjs` | **λ**, of which those regimes are the two corners |
| `graph/equivalence.mjs` | **the exchange rate**: how many unattended turns buy one directed one |
| `graph/gate.mjs` | **the theory of the gate**: coverage, unsoundness, and the agreement floor |
| `graph/layout.mjs` | the picture, **derived** by force relaxation |
| `graph/rng.mjs` | the one deterministic generator |
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
| `lab/runshape.mjs` | the six-turn run, and what a claim costs in them |
| `lab/ste-lint.mjs` | the structural subset of ASD-STE100 |
| `lab/runshape.selftest.mjs` | 39 checks for both |
| `lab/plan.selftest.mjs` | 98 checks: the four laws, lane wiring, seeds, **skip visibility** |
| `lab/roles.selftest.mjs` | 189 checks: the basis, the group orders, the design |
| `lab/profiles.selftest.mjs` | 627 checks: the trade, the space, the digests, regimes, λ |
| `lab/probe.mjs` | **measuring λ** from incidental residue: the floor arm, the estimator, the R13 simulation |
| `lab/probe.selftest.mjs` | 66 checks: exact recovery, the floor, where the fit refuses, the price |
| `lab/seeded.mjs` | **measuring g** by seeded defects, and the R13 pass that changed H9's outcome |
| `lab/equivalence.selftest.mjs` | 81 checks: closed forms, the floor at both ends, the never region, H9 |
| `lab/gate.selftest.mjs` | 72 checks: the corners, the stopping point, the agreement floor, derived roles |
| `lab/taskbank.mjs` | **the admission gate for a task**: sound, discerning, not free. `node lab/taskbank.mjs` for the report |
| `lab/tasks/<id>/` | one task: statement, checks, reference, stub, seeded mutants |
| `lab/taskbank.selftest.mjs` | 56 checks: the three conditions in both directions, the survivors, the redundancy contrast |
| `lab/runner.mjs` | **executes a six-turn run**: fresh tree per turn, demonstrated isolation, held-out scoring. `--dry-run` needs no key |
| `lab/runner.selftest.mjs` | 64 checks, most of them faults it must catch — a leak, a silent turn, an unsound check |
| `lab/runs/` | one JSON record per executed run, committed |
| `lab/resolve-refs.mjs` | links the bibliography against CrossRef / arXiv / OpenLibrary |
| `fig/*.svg` | **generated.** Committed so figures print and diff |
| `refs.js` | **the bibliography, as data** — 96 real works, keyed |
| `cite.js` | numbers citations in document order, renders the reference list |
| `journal.css` | the shared journal typography; prints to real Letter pages |
| `worker.js` | thin assets worker; maps `/syllabus` and `/protocol` to their `.html` |
| `prose-lint.mjs` | the tic lint; importable, and runnable standalone |
| `ken.selftest.mjs` | the gate. **Run it before touching anything here** |

`CLAUDE.md`, `ken.selftest.mjs`, `prose-lint.mjs` and **`lab/`** are
`.assetsignore`d; everything else ships, **including `graph/`**.

That split is load-bearing. `/shapes` runs `graph/*.mjs` in the page — the same
files the selftests import, not a copy — so the widget and the gate cannot
disagree. It only works while those modules stay import-clean, so the selftest
asserts that none of them reaches for `node:` or for `lab/`, and that
`.assetsignore` still hides `lab/` and still does not hide `graph/`. Put
anything needing the filesystem in `lab/`.

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

## The hypothesis register is the only place status lives

`graph/hypotheses.mjs` holds all seven as data and `/register` renders them.
Before it, H1–H4 were prose in WP1 and H5–H6 were objects in `shapes.mjs`,
with no status anywhere — so **WP1 proposed H2, the programme measured it at
revision 9, and the paper said nothing for six revisions.** That is the failure
the register exists to prevent, and it is recorded in WP1's addendum rather
than tidied away.

Two invariants, both asserted:

- A status of `supported`, `undecided` or `refuted` **must name its evidence**;
  an `untested` or `designed` one **must not carry any**. The failure being
  guarded against is the quiet upgrade — a status moved while the evidence
  field stays empty.
- Every hypothesis's `owner` page must exist and must actually mention it. That
  check found H7 registered and unnamed in WP2 on its first run.

**Change a status here and nowhere else.** Pages render from it.

## Three prose registers, and why each was earned

The site runs **two** lints and they do not agree.

`prose-lint.mjs` removes LLM tics and includes a rule against sentence-length
monotony, because the documented failure of over-correcting is flat prose.
`ste-lint.mjs` checks the structural rules of ASD-STE100 Simplified Technical
English, which *mandates* short sentences and therefore produces exactly that
flatness.

Writing `/run` to ASD-STE100 took it to zero structural violations and made it
fail the monotony rule at 0.324 against a floor of 0.42. Both lints were
working correctly.

**The resolution is register, not compromise.** A page may declare
`<body data-register="procedure">`, and the rhythm rules (monotony, fragment
cadence) are skipped for it. A procedure should be flat, so every step reads
the same; an argument should not. Use the procedural register only for actual
procedures.

`ste-lint.mjs` does **not** implement the approved-vocabulary rule, because
Part 2 of the specification is licensed and we do not hold it. A page passing
it is not in Simplified Technical English; it satisfies a structural subset,
and `/run` says so in its own first paragraph. Two known limitations: the noun
cluster rule misses clusters containing an `-ing` noun, and the numeric limits
are the commonly cited ones rather than quotations from the spec.

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

## The plan is a graph, and the graph is the primitive

A standard run is a six-turn DAG: a setup, two parallel waves of two, a
cleanup. Small enough to draw by hand, which is exactly why it was worth not
drawing by hand. `lab/plan.mjs` builds it as rewrite rules borrowed from
`clock/morph`, and four of that project's laws carry over intact:

| Law | Here |
|---|---|
| a cell expands into sub-cells | `experiment` → `run`s → `wave`s → turns |
| widths are inferred, never declared | a wave takes its width from the conditions on the bus |
| failure is the only control flow | the budget stopping rule **is** the recursion's base case, not a check beside it |
| probe and build are one interpreter | `probe()` and `build()` differ by a flag, so the cost estimate cannot drift from the plan |

The fourth is the one that pays. A cost table maintained next to a runner
disagrees with it eventually; the same code cannot. `probeMatchesBuild()`
asserts it over six designs, two of which fail on purpose.

`lab/layout.mjs` then derives the picture: y is pinned to Kahn depth, x relaxes
under Barnes–Hut repulsion and degree-weighted springs. Adding a condition
costs no geometry. Two things this bought that a hand-drawn figure would not
have:

- **A wiring bug.** Wave A fed wave B as a complete bipartite graph, because
  the whole previous wave was passed as the predecessor. Drawn honestly it was
  obviously wrong. Each condition is a lane now, and the selftest asserts the
  crossing edges are absent.
- **Seed independence.** Positions agree across five seeds to about 1e-7, so
  the seed only breaks the initial symmetry and the picture is a function of
  the graph. The selftest asserts convergence — note the sign, it originally
  asserted the opposite, which is what a force layout invites you to assume.

`FALLBACKS` repairs a design it can repair and **rethrows the rest**. An
earlier version caught any failure, including a request for zero runs, and
answered it by building `budget / 6` runs. A fallback broader than its repair
turns a nonsense design into a large plausible one.

## The org chart, read off the graph

`lab/roles.mjs` answers two questions about a turn, both from structure and
both in one pass:

**What is this agent's job?** Degree decides. Four duties are forced —
originate (in 0), merge (in ≥2), split (out ≥2), report (out 0) — and the
first two are mutually exclusive, as are the last two. So a node's duties are
one in-duty crossed with one out-duty: **nine roles, total on every node of
every finite DAG.** That is a counting argument, which is why an arbitrary
shape is staffable. `broker` is the only role that both merges and splits, so
it is the only seat that can substitute its judgment and have it propagate —
Aghion–Tirole real authority as a degree condition.

**Is this agent's job the same as that one's?** The automorphism group
decides. Turns in one orbit are structurally indistinguishable, so pooling
them is licensed by symmetry rather than assumed. **This is H4's structural
half**: it does not make H4 true, since an agent can still drift inside an
orbit, but it says which comparisons were ever estimable before any data
exists.

The **ken ratio** — in-neighbours and self, over ancestry and self — is the
quantity the surface is named after and is one pass over the graph. 1 at a
source; 0.333 at the end of a six-turn chain; 0.833 at the assembly turn of a
six-turn star.

### λ, and why the regime dichotomy was false

`visibility.mjs` offers isolated / lineage / shared. **That dichotomy is
wrong** and `attenuation.mjs` replaces it. A parent hands over a *product*
shaped by what it received, so a grandparent reaches a grandchild attenuated
rather than absent — you know your grandfather's output because it was your
father's input.

Let **λ** be the share surviving one hop. Fidelity from *u* to *v* is
λ^(d−1) over the **shortest** path, because the best-preserved copy went
through fewest hands.

- **λ = 0 reproduces the published `kenRatio()` exactly**, on every node of all
  1,960 shapes. Asserted, not argued.
- **λ = 1 gives 1 everywhere** — that is `lineage`.
- **In between, sink ken takes 16 distinct values against λ=0's 5.** The
  attenuated model discriminates *better* than the binary one. That was not
  designed for.

So the regimes are the corners of a segment, and the isolated-versus-inherited
argument was an argument about an unmeasured number.

**Never quote a shape effect size without its λ.** The chain-against-briefed
gap runs 0.667 → 0.079 as λ goes 0 → 0.95; a two-hop skip is worth 0.80 at
λ = 0.2 and 0.10 at λ = 0.9. `contrastCurve(a, b)` gives the sweep and that is
the honest way to state an effect that depends on a parameter nobody has
measured.

**H8 measures λ. It needs no particular regime**, because λ belongs to a
handoff-and-regime pair — measuring it under sharing is the control that should
return λ ≈ 1. Run it before H5, because it prices H5. How to measure it is the
next section, and the obvious way does not work.

### The probe: what an agent still has, without telling it to keep anything

`lab/probe.mjs`. **The design that does not work, and it was the first one
written down:** plant k constraints in the setup brief, say carry these
forward, count survivors. That measures compliance with an instruction to copy.
Tell a chain to preserve π to twenty places and it will; λ comes back 1 having
measured nothing.

The quantity wanted is the one you would fail on if asked today how the
literature search for module three went. So the probe asks about **residue**,
and a residue must be all four of:

| | |
|---|---|
| **incidental** | no brief anywhere names it. The moment one does, this is a copying test |
| **doing work** | it mattered when it was produced; noise decays too and tells you nothing |
| **recoverable** | a well-posed question whose answer is a *set*, scored by overlap, no judge |
| **hard to guess** | not assumed. **Measured**, by the floor arm, and subtracted |

Three kinds are specified in `RESIDUES`: files read and not changed,
alternatives weighed and dropped, errors worked around. Each is a set, never a
token — a single memorable token is the salience trap that sank the first
design.

**The floor arm is the design.** An agent with no lineage, given the task
statement only, is asked the same question. Its recall *f* is what the question
is worth to somebody who was never there.

    recall(d) = f + (1 − f) · λ^(d−1)

Retention is fitted above *f*, never against zero. Fitting a real floor of 0.3
against zero takes λ from 0.4 to **0.748** — the π failure by a quieter route.
`fitLambda()` returns `{lambda: null, reason}` rather than a plausible number
when the data cannot support a fit.

**What R13 cost H8: one run became 36 turns.** One six-turn chain at k=10
gives a 95% width of 0.361 and fails to identify λ in 92 of 1500 replications.
Six chains at k=40, 36 turns, reach 0.193. Two results worth carrying:

- **More residue per chain beats more chains.** 6×40 (36 turns, 0.193) beats
  8×10 (48 turns, 0.234).
- **Depth beyond six hurts.** Six to twelve turns widens 0.254 → 0.297 and
  moves bias −0.005 → +0.073. Recall has hit the floor; the extra points are
  noise on a quantity that stopped moving.

**It is a threshold test, not an estimator.** Width 0.04 and unbiased at true
λ = 0.95; median 0.446 and biased up 0.229 at true λ = 0.2, with 280 of 1500
failing. What it does reliably is exclude the top of the range, which is what
H5 needs.

### The exchange rate: six unattended turns against three directed ones

`graph/equivalence.mjs`, published as [WP3](wp3.html). A person at a handoff
supplies **two** goods and they are separately purchasable:

- **context** — they carry the thread. That is λ, and `briefed` buys λ = 1 for
  zero extra turns. Already cheap.
- **correction** — they see a defect and say so. Nothing in the wiring
  supplies this, and it is what the model is about.

Let g be the share of live defects an unattended turn removes. A defect made
*k* handoffs upstream is removed with probability g·λ^(k−1), so its chance of
surviving *m* downstream turns is a product, and defect density after n turns
is the running mean of it.

**Two things fall out of writing that down, and neither was designed for.**

- **The introduction rate r cancels.** Comparing two densities divides it out.
  Three parameters remain where four seemed to be.
- **An unattended chain has a floor and a directed one does not.** The product
  converges to a positive number for every λ < 1 and to zero at λ = 1. This is
  *not* a claim that people are sharper per turn — it holds at equal catch
  rates. Their context does not decay, so their later chances stay worth
  something; a chain's decay geometrically and the sum is finite.

| Result | Value |
|---|---|
| cells of a 19×19 (λ, g) sweep where **no** chain length suffices | **110 of 361, 30.5%** |
| where the answer is 5–7 turns | λ 0.05–0.95, but **g only 0.30–0.70** |
| where it is exactly 6 | **g 0.35–0.65**, at essentially any λ |
| g = 0.35 at λ = 0.4 / at λ = 0.8 | **never** / **8 turns** |

So **six is a claim about the catch rate**, not about attenuation: it says an
unattended turn removes roughly half what a directed one would.

**Wiring is the first lever, capability the second.** Briefing moves a design
from never to affordable at a fixed gate; a better gate at a lossy λ may not.
And this is falsifiable rather than rhetorical: better tools (a compiler, a
search) should move the measured **g** and leave the measured **λ** where it
was. If a compiler moves λ, the decomposition is wrong.

### Seeded defects, and the second time R13 changed a design

`lab/seeded.mjs`. Plant k defects in the setup artefact, run the chain, score
removals by gap; pooling gives ĝ = removals / Σ(live·λ^(gap−1)), where the
denominator is exposure discounted by how much context reached each chance.

**The seeds must not be announced** — a turn told there are twelve planted
faults hunts for twelve planted faults. Same failure as the π design in H8,
and it is a stated precondition of H9.

**What the simulation changed was the OUTCOME, not the price.** The exchange
rate is a step function of g with a discontinuity at the feasibility boundary.
At 40 seeds over 6 chains (36 turns), near that boundary:

- three-way band right (six suffices / more than six / never): **96.3%**
- the exchange rate itself, to 25%: **37.4%**

A swing of 0.05 in g moves the rate from 40 turns to 9, so no affordable study
does better. **The instability is a property of the question, not the
instrument**, and H9 reports the band. A study sized on parameter precision
would have bought a figure nobody could act on.

And, for the second time: **more items per run beat more runs.** 40×6 is 36
turns; 10×24 is 144 for a comparable width. The λ probe found the same shape a
revision earlier.

### The theory of the gate: a check does not attenuate

`graph/gate.mjs`, published as [WP4](wp4.html). Everything a turn knows about
its ancestors arrives discounted by λ^(k−1). **An executable check does not**,
because it is *re-run rather than remembered*. Two consequences:

- **No decay.** A defect inside its coverage is detected at any gap.
- **No last turn.** WP3's floor is partly S(0) = 1 — the final turn's mistakes
  have nobody after them. A check does. It runs on the integrator too.

**Then the check turns out to be written by a turn.** A wrong assertion turns a
correct implementation into a defect *and marks it passing*, so the failure is
invisible to the mechanism that made it. Three parameters:

| | |
|---|---|
| **c** coverage | share of defects the check detects |
| **u** unsoundness | share a *complete* specification would get wrong |
| **γ** tail | how much harder the last assertions are than the first |

    D(c) = (1 − c)(1 + βc)·M + u·c^γ        M = WP3's ungated density

**There is a stopping point, not a target:** `c* = (M / γu)^(1/(γ−1))`. At
u = 0.45 and γ = 3, coverage 0.95 leaves *more* defects than 0.80.

**The bare inequality, which is the premise with arithmetic attached:**
D(1) = u and D(0) = M, so **specify everything iff u < M** — you must be
likelier to get an assertion right than the chain is to leave the defect anyway.

**The unwelcome corollary: improving λ lowers the optimal coverage.** c* runs
0.98 → 0.62 as λ goes 0.2 → 0.95. Context and verification are **substitutes**.
WP3 said wire first; this is the bill.

### Build-twice, and why its floor is not p²

Knight & Leveson had 27 versions written independently from one spec and
**rejected the independence assumption at the 99% level**. `agreementFloor()`
implements Eckhardt–Lee instead: inputs vary in difficulty, versions fail
together on the hard ones, and the surviving share is **p at ρ = 1** — a second
version buying nothing at all. One model sampled twice has less reason to differ
than two universities did, so expect ρ high.

**Neither strategy wins everywhere.** At ρ = 0.02 build-twice wins; at ρ = 0.8
specify-first does; with u = 0.55 build-twice wins throughout. That crossing is
the generalizable pattern, and all three quantities deciding it are unmeasured.

⚠️ `strategies()` **defaults `p` to the ungated density.** Its first version
took it as a free parameter set to 0.2, so two rows were densities and one was
not, and build-twice won everywhere by choosing its own units.

### Duty is not role

The verification-first six-turn shape (split → two checks → two builds →
integrate) **is `standard`**, profile [1,2,2,1], already catalogued. Nothing
about the graph is new. What is new is that a turn has a **duty** as well as a
role, and **degree cannot recover it**: all four middle turns are `relay`s
whichever duty they carry.

**One wiring decision is structural, not stylistic.** Give the builder an edge
from setup so it reads the brief beside its check, and **four of six roles
change** — specifiers become `delegate`s, builders become `funnel`s. Two runs
differing only in that answer are not two runs of one design.

The first version of that table invented `splitter`/`broker`/`reporter`, none of
which `roles.mjs` produces here. **Assert a role table against `positionTable()`,
never against itself.**

### The task bank, and why it is the blocker

`lab/taskbank.mjs`. **Every hypothesis here is priced in turns spent on "the
same task" and no task exists.** H5 wants 180 turns paired on task, H9 six
chains doing real work, H11 three arms over the same tasks. None can start.

A task is admissible on three conditions, checked in both directions by
`lab/taskbank.selftest.mjs`:

| | |
|---|---|
| **sound** | the reference passes every check. A check that fails a correct solution certifies the wrong answer — WP4's **u**, per task |
| **discerning** | each seeded defect fails some check. The share that do is the **mutation score**, WP4's **c**, per task |
| **not free** | a do-nothing `stub.mjs` must fail. Same discipline as the probe's floor arm |

```bash
node ken/lab/taskbank.mjs        # the report; exits non-zero if a task is inadmissible
```

**tb-001 scores 0.833 and the survivor is named.** `m6-large-n` is wrong only
for n > 100, which neither check exercises, and the selftest verifies it differs
materially from the reference there — an equivalent mutant would inflate nothing.
A bank admitting only perfect scores would be a bank whose mutants were chosen
to die.

**Redundancy is 1.00: both checks killed every mutant either killed.** The
two-effort split bought no diversity of detection on this task, which is WP4 §5's
correlated failure with checks in place of implementations. First measured result
about the verification-first pattern, and not the flattering one.

### Picking a target: the layer, not the project

`foam/` is the loop's declared target ([`FACTORIO.md`](../foam/FACTORIO.md)) and
it is three things of very different size:

| | lines | oracle |
|---|---|---|
| `app.js` | 1113 | none — WebGL2, not checkable headlessly. **This is the part that burns you.** |
| `foamworld.js` | 798 | constructive solvability certificate, 184 checks over 8 seeds, **10s** |
| `solids.mjs` | 197 | `verify()` exact to floating point, **0.055s**, no imports |

**A target is not one size. Pick the layer whose oracle is cheap.** tb-002 is
`solids.mjs`, and its reference is pinned **byte-identical** to the real module
so the task cannot measure a stale snapshot.

### The beads are a mutant source, not a target set

656 beads: 196 findings, 177 decisions, 34 questions, 18 dead-ends, **10 tasks**.
It was never a graded curriculum. What it holds is better — **a catalogue of
real defects with known shapes**, and two of tb-002's seeded mutants are those
defects re-injected rather than invented:

- **`lp-01d08f`** → `m1-naive-constellation`. Naive seed constellations are 22°
  wrong and **the cube still looks perfect**, so the first thing anyone tries
  passes. A naturally occurring coverage hole.
- **`lp-273253`** → `m2-rotate-not-returned`. A verifier grading against the
  wrong reference failed correct geometry by exactly the yaw angle. Its own note:
  *"a checker that FAILS CORRECT WORK is worse than no checker: it retires a
  mechanic that was fine, and the retirement looks like evidence."* That is WP4's
  **u**, found in the wild before the model for it existed.

**A mutant I write is one I chose, and choosing them is how a coverage score
gets flattered.** Harvest from the ledger where you can.

### Split the efforts by KIND, not by subject

| task | split | redundancy |
|---|---|---|
| tb-001 | one problem, two halves (estimator / coverage property) | **1.00** — both checks killed everything either killed |
| tb-002 | the placement against **the checker that grades it** | **0.429** |

Three of tb-002's seven killed mutants fall to exactly one lane: argument
validation to A alone; the unreturned yaw, the ill-conditioned error measure and
the widened tolerance to B alone, because A never looks at `verify()`.

**The checker deserves its own lane because it has two ways to be useless** —
too lax passes the 22° bug, too strict retires a mechanic that was fine — and
only an acceptance test that feeds it *known-bad* input catches a tolerance
widened until it stops complaining.

⚠️ **Do not grade against a remembered reference.** tb-002's first `check-a.mjs`
carried its own table of face normals, used (0, 1/φ, φ) for the dodecahedron
where the answer is (0, 1, φ), and silently dropped twelve of the icosahedron's
twenty. It failed correct geometry by 10.8° — the exact failure the task is
about, committed while writing the check for it. The rewrite carries **no
coordinates**: face count, unit normals summing to zero, equal inradius, and
**face-transitivity** (every Platonic solid is isohedral, so the sorted angle
multiset from one face normal is the same for all — and a metric that rotates
off-axis normals destroys exactly that).

⚠️ **THE BANK MUST NOT BE IN THE RUN'S TREE.** A turn with Read can open
`reference.mjs` and the mutants. Brief from `statement.md` copied into a fresh
tree and run the checks in the harness afterwards, exactly as `loop-work.yml`
already runs a ticket's gate outside the turn. Nothing in the bank can enforce
this — it is a property of the runner.

**Writing a check against a remembered table is how u happens.** The first
`check-a.mjs` asserted 0.2027 for the upper limit of 3/40 where the answer is
0.2039, so it would have failed a correct implementation. Checks here rest on
the **defining equations**, evaluated by the check's own independent binomial,
with the table only as a cross-check.

### What the loop's executor can and cannot do

`loop-work.yml` runs `claude -p`, opus, 60 turns, $5, `acceptEdits`, and grants
**Read, Write, Edit, Glob, Grep** while disallowing **Bash, WebFetch, WebSearch,
Task**. Two consequences worth knowing before designing any run:

- **A turn cannot execute its own gate.** The loop found this on turn one: a
  ticket whose gate was a shell command was unverifiable by the only party in a
  position to satisfy it, and the turn marked the bead done on an honest belief.
  Gates now run in the workflow, from human-authored beads only.
- **H10 cannot be tested on this harness.** It requires the check to be *re-run*
  at each later turn; a turn that cannot execute can only read it, and a read
  check is a remembered one that attenuates like everything else. Granting Bash
  is the precondition, and it widens the blast radius, which is why it is off.

**Measured gate coverage of the live ticket graph: 5 of 656 beads, 0.8%.** That
is WP4's c on the real system, and it puts the programme at the far left of
Figure 1 where the first assertions are always worth writing.

### The runner, and why its grant differs from the loop's

`lab/runner.mjs`, driven by `.github/workflows/ken-run.yml`.
**Dispatch only** — no push trigger, no schedule, nothing in `mayWake`.

**THE TOOL GRANT FOLLOWS THE PROVENANCE OF THE PROMPT, NOT THE MODEL.**
`loop-work.yml` denies Bash and subagents because it assembles its brief from a
ticket graph outside parties can push into; its grant must survive a brief
nobody here wrote. A bank run's brief is `statement.md`, a committed file with
an author and a diff, started by hand. Same model, different threat model.

The full-power invocation already existed — `bakeoff/run-cell.sh` has used
`claude -p --dangerously-skip-permissions` for both bake-offs. The work was
pointing it at a six-turn plan, not building an executor.

**The grant is required, not convenient.** H10 needs a turn that can *re-run* a
check. A turn that cannot execute can only read one, and a read check is a
remembered check.

| | |
|---|---|
| **isolation** | each turn gets a fresh dir holding exactly its in-edges. No repo, no history, no other lane |
| **the bank is not in the tree** | reference, mutants and bank checks stay in the checkout; scoring happens after, in the workflow |
| **demonstrated, not claimed** | a marker is planted in one turn; `blindTo()` computes which turns have no path from it; any of them carrying the token **voids the run** |

⚠️ **A LEAKED RUN STILL PRODUCES A PASSING ARTEFACT.** The selftest smuggles the
marker into a blind turn and the solution passes every held-out check anyway.
Passing is not evidence the plan held, so isolation gates separately and a leak
is recorded as *measuring nothing* rather than as a failure.

**What a run measures.** The integrated artefact goes against the bank's
held-out checks. More usefully, the run's **own** checks are graded by the bank:
against the reference for **soundness (u)**, against the mutants for
**coverage (c)**. WP4's two unmeasured parameters, out of any run that writes a
check.

A check that passes everything is *sound* and has coverage 0 — the stub arm is
what separates a strong check from an empty one.

```bash
node ken/lab/runner.mjs --task tb-001-binomial-interval --dry-run   # no key needed
```

The dry run executes the whole plan with a scripted agent: trees, isolation,
leak audit, scoring and ledger all run for real, only the model call is
replaced. **It copies the bank's answers in, so its scores are the harness
working and never a result about agents.**

⚠️ **Do not name a workflow job `run`.** `scripts/preflight.mjs` extracts shell
line-wise by matching `run:`, so a job with that name has its entire body parsed
as bash. The job is `bank-run`.

### The drawn graph is not the graph

**An edge is a permission. The absence of one is a prohibition, and nothing
in the plan enforces it.** A turn learns things by three channels and the plan
controls one: the brief it is handed, the files an earlier turn left in its
worktree, and the history it can read.

| regime | effective shapes of 1,960 | distinct sink ken |
|---|---|---|
| `isolated` — in-edges and nothing else | **1960** | **5** |
| `lineage` — worktree inherited upstream | 16 | 1 |
| `shared` — one worktree throughout | 8 | 1 |

**Under either sharing regime the ken ratio is 1.000 for every turn of every
shape**, and `chain` and `briefed` become the same fifteen-edge graph — so the
contrast H5 prices at 180 turns is exactly zero. The reason is definitional and
sat unnoticed in the definition for five revisions: ken is the in-neighbourhood
over the ancestry, and a turn that *inherits* its ancestry has an
in-neighbourhood equal to it.

`lineage` is the trap. A worktree per lane merged at joins is what most people
mean by isolated, and it leaves 16 of 1,960. Only fresh context, fresh tree and
handoff by explicit artefact preserves the question.

**Before quoting any shape number, check the regime.** `auditRegime(g, regime)`
gives the leak count — edges the environment supplies that the plan never
declared. R16 requires a run to state and *demonstrate* its regime, and
demonstration cannot be asserted: plant a marker in a turn a later one has no
edge from, and check the later turn cannot produce it.

### The layered family is 2% of the space

**There are 1,960 distinct shapes on six turns with one source and one sink.
The layered family reaches 33.** Only ten of the 1,960 are strictly layered at
all; in every other one some turn feeds something more than one stage later.
`briefed` was the first such shape we wanted and it was special-cased into the
generator rather than expressed by it, which was the signal that skip edges
belonged inside the family. They are inside it now, and it is still 2%.

Two consequences for anyone reading a number off `profiles.mjs`:

- **A frontier or a distribution from the layered family is a statement about
  the generator**, not about the space. The 2n−4 frontier published in WP2 was
  exactly that, and it dissolved when the family widened. `coverage(n, built)`
  gives the honest fraction for n ≤ 6.
- **The counts in `KNOWN_COUNTS` are ground truth and were computed twice.**
  Brute force over every relabelling, and a refinement-restricted canonical
  form. The second was wrong the first time — 122 and 3,274 against the true 98
  and 1,960 — because it ordered colour classes by discovery rather than by an
  invariant. Neither method is trusted alone. **If you optimise the
  canonicaliser, check it against `KNOWN_COUNTS` before trusting one digit.**

Exact enumeration stops at seven turns because the search is 2^(n(n−1)/2):
32,768 masks at six, 2 million at seven, 268 million at eight. Above that
`sampleShapes()` draws random plans, and it is **not** a uniform sample of
anything — say so wherever its numbers appear.

### The catalogue, and the trap in it

`lab/shapes.mjs` holds six shapes that all cost six turns, so shape is a
factor that costs nothing in a programme where sample size binds.

**Depth and ken are orthogonal across shapes (r = 0.05) and collinear within
one (r = −0.966 in a chain).** The first version of the design had this
backwards and priced the within-run slope as though it tested the shape
hypothesis. It does not. Only `briefed` separates the two inside a single run,
at VIF 1.171 against the chain's 14.758. **Check `collinearity()` before
claiming a within-run position effect.**

Two results worth knowing before designing anything here:

- **The largest orbit is free replication.** A star run holds four turns that
  are replicates by symmetry; a chain holds none, and no care in running one
  will produce a second. At ρ = 0.413 that is 1.79× the effective replication
  for the same six turns.
- **`chain` against `briefed` is four edges and no turns**, and they match at
  every turn but the last. It is the cheapest manipulation the programme has.

## Skip edges must bow, or they cannot be seen

`renderPlan` drew every edge as a bezier with control points directly below
the source and above the target. On a graph one turn wide that is a **straight
vertical line**: an edge from depth 0 to depth 2 ran through the node it skips,
under the nodes, exactly on top of the two adjacent edges covering the same
span.

A six-turn chain with 5, 9, 9 and 15 edges rendered as **four identical
pictures**. WP2's Figure 1 showed `briefed` and `chain` as the same drawing,
so the paper's own central contrast — four added edges, the cheapest
manipulation in the programme — was invisible in the figure arguing for it.

An edge spanning more than one depth now arcs sideways by an amount growing
with the span, away from the drawing's centre where the nodes are, and carries
a `pl-skip` class so it reads as a different kind of edge.

**Nothing caught this because every layout check was about nodes** — seed
independence, no overlapping boxes, positions to one part in ten million. Not
one asked whether an edge could be seen. The regression test renders all four
skip policies and requires four distinct drawings, every multi-depth edge
marked, no skip drawn on its endpoints' column, and no two edges tracing the
same path. **Run it against the old renderer and it fails seven checks** — that
was verified, not assumed.

One of those new assertions was itself weaker than its label: "four distinct
pictures" compares SVG *source*, which differed even on the broken renderer.
It is relabelled necessary-not-sufficient, and the real visual check is that a
drawing with skips must leave the single column a width-one chain occupies.

## The roadmap figure

Not to be confused with either of the above. This one hand-places every box;
the plan and shape figures place none.


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
node ken/ken.selftest.mjs     # ~2s, 1089 checks
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
