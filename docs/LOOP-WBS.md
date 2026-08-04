# Work breakdown — the loop, planned around manufacturing requirements

How foam-factorio and the agent loop get built, phased, with the gate that ends
each phase and the criterion that kills the programme.

Companion documents, and the division of labour between them:

| | |
|---|---|
| [`CLOSED-LOOP.md`](CLOSED-LOOP.md) | **why** — the hypothesis, the programme |
| [`LOOPS.md`](LOOPS.md) | **how** — the machinery, built and disabled |
| [`../foam/FACTORIO.md`](../foam/FACTORIO.md) | **what** — the target and its oracle stack |
| **this file** | **in what order, and what would stop us** |

---

## 1. The thesis: gates before backlog

The instinct is to plan the *features* and let requirements fall out. That is
backwards for an agent loop, and the reason is throughput.

An unattended fleet does not consume features. It consumes **requirements it can
finish and prove it finished**. The supply of those is the binding constraint —
not model capacity, not runner minutes, not ideas.

And the supply is manufactured, not found. **Every gate we build converts a
class of vague work into schedulable work.** Before the frame-budget gate
exists, "make the summon faster" is a conversation. After it exists, "raise
sustained fps at 40 summoned cells above X on the reference device" is a
requirement any agent can attempt, finish, and be *checked* on, unattended, at
three in the morning.

So the oracle stack in [`FACTORIO.md`](../foam/FACTORIO.md) §2 is not
infrastructure that precedes the real work. **It is the requirement factory, and
it is the real work.** This document sequences everything around that.

The uncomfortable corollary, stated up front because it governs expectations:
**the fleet cannot help build the thing that makes the fleet useful.** Gates are
authored by humans and crew, reviewed by humans, and they are the hardest part.
Phases 0–2 are human-heavy and the leverage arrives late. A loop that has not
paid for itself by phase 2 is *on schedule*, not failing.

---

## 2. The unit of work

### 2.1 Definition of Ready

A bead may enter the ready queue only if all six hold. This is the promotion
checklist, and it is what `status: proposed → ready` should mean.

| # | Criterion | Why it is here |
|---|---|---|
| R1 | **One turn.** Fits inside `loop-work`'s 30-minute agent budget with room. | The factory discarded 18 minutes of real work to a timeout because every later step was `success()`-gated. Oversized requirements are how that recurs. |
| R2 | **Names its gate.** States the machine check that will be run to decide done. | Without this, "done" is the agent's opinion of its own work. |
| R3 | **Bounded paths.** Declares the files it may touch, inside the loop's write set. | The containment gate is mechanical; a requirement that cannot state its paths cannot be contained. |
| R4 | **Independent, or explicitly dependent.** No hidden ordering against siblings that could run concurrently. | `maxConcurrentWork` is 2. Two turns racing on the same file is a merge conflict at 3am. |
| R5 | **Carries its memory.** Links the findings and dead-ends that bear on it. | The whole reason the graph exists. A requirement that does not point at `lp-*` dead-end beads invites turn 30 to repeat turn 4. |
| R6 | **Reversible.** A failed attempt leaves the tree as it found it. | The containment gate reverts on failure; a requirement whose partial state is meaningful defeats that. |

**R2 is the load-bearing one.** A requirement that cannot name its gate is not
ready — it is a request for a gate, which is different work of a different class
(§2.3, type B) and must not be dispatched as if it were type A.

### 2.2 Definition of Done

| # | Criterion |
|---|---|
| D1 | The gate named in R2 passes. |
| D2 | Evidence attached — path, commit, or run id. `beads done` already refuses without it. |
| D3 | Findings recorded, or an explicit "nothing learned". Silence is not evidence of a clean run. |
| D4 | Any new work is proposed, never promoted. Structurally enforced by `loop-apply-outbox.mjs`. |

### 2.3 The four requirement classes, and their economics

Planning treats these as one thing and they are not. They have different
authors, different reviewers, and wildly different throughput.

| Class | Acceptance is… | Who may author | Fleet may run unattended? | Throughput |
|---|---|---|---|---|
| **A — Certified** | an existing gate | crew or fleet | **yes** | high — this is the only class that scales |
| **B — Gate-extending** | a new gate, which the work defines | human or crew, human-reviewed | **no** | low, and deliberately so |
| **C — Taste** | the audience ladder | human | no — settles over days | batched |
| **D — Exploratory** | nothing; the output is a finding | crew | yes, **hard-capped** | capped, or it becomes a token furnace |

Two rules fall out and both are load-bearing:

- **The unattended loop runs on class A, plus a capped ration of D.** Everything
  else needs a human in the path. That is not a limitation to engineer away — B
  changes what "done" means, and an agent that can redefine done has no gate.
- **Programme progress is measured in class-A supply,** not in features shipped.
  "How many schedulable requirements does the graph hold?" is the health metric.
  A rich feature list with an empty ready queue is a stalled programme.

---

## 3. Regulation

`turnsPerDay: 12` in the shipped config is denominated in the wrong unit and
should be treated as a placeholder. This section replaces it.

### 3.1 A turn is not a unit of cost

Turns may be Opus, may run in parallel, and vary by an order of magnitude in
size. Counting them regulates a proxy that does not track the scarce thing.
**Regulate spend.** `claude -p --max-budget-usd` already bounds a single turn;
the missing piece is accumulating it. Turn count then becomes an *output* of
the system — something to observe — rather than an input to set.

This also disposes of the "do we need twelve a day?" question. You do not set a
number of turns. You set a rate of spend and read off however many turns that
buys.

### 3.2 A rate limit is a saturation, not a regulator

Letting the account's own usage limit be the governor is tempting and it does
not regulate. A limit clips output; it provides no feedback. Two consequences,
and the first is the one that matters to this programme:

- **You lose the measurement.** Pinned at the ceiling, utilisation reads 100%
  whether the loop is producing or spinning. The programme exists to find out
  whether unattended work keeps paying — and running at saturation destroys
  exactly that signal, because throughput becomes a property of the limit
  rather than of the work.
- **The limit is shared with the operator.** A regulator whose set-point is
  "all of it" does not regulate, it collides. `CLAUDE.md` already states the
  currency: *an unbounded hour does not produce a bill, it produces an operator
  who cannot use their own tools for the rest of the week.*
  `CLOSED-LOOP.md` §8 took the same position and declined multi-account
  rotation on the same grounds.

**The honest version of "usage as the limiter" is a headroom reserve**: target a
fraction of capacity, observe consumption, and back off when the operator is
active. That is usage-driven regulation with the operator's headroom as the
set-point rather than the remainder.

### 3.3 Why the chain tends to grow — precisely

The instinct that it grows unbounded is right, and it is worth being exact
about the mechanism, because it is **not speed. It is branching factor.**

Each completed turn causes the next to start, so the loop has a *gain*: the
expected number of successor turns per turn.

| gain | behaviour |
|---|---|
| < 1 | dies out |
| = 1 | self-sustaining indefinitely, never growing |
| > 1 | exponential |

**Today the gain is structurally zero for anything the fleet produces**, and
not by accident: `loop-apply-outbox.mjs` creates every agent proposal as
`proposed`, never `ready`, so the loop cannot refill its own queue. It drains
what a human put there and halts on `empty ready queue`.

So the strongest regulator already in the system is a rule I built for a
different reason. **The promotion rule is the gain control.** Phase 3.2 — the
relaxation from "not its own work" to "not a bead it authored" — is *precisely*
the change that lifts gain off zero, and it must not ship unless something else
holds gain below one. Candidates: a per-turn cap on promotions, a reviewer
budget scarcer than the fleet's, or requiring that a promotion consumes a token
from the same bucket the turns do.

Parallelism does not itself cause growth: `maxConcurrentWork` bounds
simultaneous work, and it is enforced against *both* in-progress beads and
uncommitted work orders. The GitHub `concurrency: group: loop-tick` with
`cancel-in-progress: false` is load-bearing rather than cosmetic here — it
serialises ticks so two of them cannot each observe a free slot and both fill
it.

### 3.4 The regulator stack

Each failure mode wants a different mechanism at a different timescale. One
knob cannot cover them, which is why the current single `turnsPerDay` felt
unsatisfying.

| Failure | Regulator | Timescale | Status |
|---|---|---|---|
| one turn costs far more than expected | `--max-budget-usd` per turn | seconds | **built** |
| too many turns at once | concurrency cap + GH concurrency group | minutes | **built** |
| sustained drain faster than intended | **token bucket denominated in spend**, refilled on a clock | hours | to build |
| operator throttled by their own loop | **headroom reserve** + published consumption | continuous | to build |
| runs on while nobody is watching | **lease with an expiry — fails closed** | days | to build |
| loop feeds itself and grows | **promotion rule (gain)** | structural | **built** (as gain = 0) |
| runs but stops improving | plateau brake + judge | over turns | partly built, uncalibrated |
| graph becomes incoherent | lint + blast-radius gates | per turn | **built** |

### 3.5 The lease is the one that matters for unattended running

Counters are the wrong shape for "runs while nobody is watching". They
miscount across restarts, they are ambiguous under parallelism, and — the
fatal property — **neglect lets them continue**. The failure mode of a counter
is that nobody notices for a week.

A **lease** inverts that: `until: <timestamp>` in the config, and the reactor
refuses to dispatch past it. Renewal is a signed commit, the same shape as the
`enabled` switch. Neglect *stops* it.

It also fits the stated posture exactly. You do not know how many turns you
want; you do know you are willing to let it run tonight. A lease expresses
"until tomorrow morning" directly, and it is robust to every counter failure
because it depends on the wall clock rather than on the loop's own bookkeeping.

**Recommendation: the lease is the primary unattended regulator, the spend
bucket is the rate regulator, and `enabled` remains the master switch.** Three
mechanisms, three questions: *may it run at all*, *how fast*, *until when*.

### 3.6 Push chain versus clock pull

A genuine architectural fork, and the current design has only picked one half.

- **Push chain** (built): completion triggers the next start. Low latency,
  self-sustaining, and needs explicit brakes — it is the shape that grows.
- **Clock pull**: `workers/cron` fires the reactor at a fixed rate; turns are
  drawn from the queue when the bucket allows. Cannot run away, because the
  clock is external to the loop's own behaviour.

The hybrid is better than either and is what the bucket buys: **the chain may
continue while tokens remain, and when the bucket empties the chain stops and
waits for the clock to refill it.** Burst latency when there is budget,
externally-bounded rate when there is not. `CRON_GITHUB_PAT` — still unset —
is the dependency for the clock half.

### 3.7 Supply still binds

Regulation caps the rate; it does not create work. Class-A requirement supply
remains the ceiling on unattended operation (§2.3), and the metric survives the
change of units — it just becomes **requirements per unit spend** rather than
per day.

Two consequences stand unchanged:

1. **The planner is what makes unattended operation exist at all.** Everything
   before it is a supervised experiment and should be described that way.
2. **Requirement supply belongs on `loop.mino.mobi` beside the curve.** A loop
   halting on `empty ready queue` is not idle, it is *starved*, and from outside
   those are indistinguishable.

---

## 4. Phases

Each phase states its deliverables, the gate that ends it, and the **kill
criterion** — the observation that should stop the programme rather than
trigger another attempt. A programme that cannot report "this does not work" is
not an experiment.

### Phase 0 — Prove the premises. No loop turns, no model budget.

Everything here is cheap and every item can invalidate the programme.

| WBS | Deliverable |
|---|---|
| 0.1 | **Audience probe.** The A/B comparison page, two *hand-made* foam variants, votes counted. Randomised order, order recorded. |
| 0.2 | **Order-effect control.** Does position predict preference better than variant does? |
| 0.3 | **Turn cost, measured.** Run 3–5 turns by hand, attended. Replaces the estimate `CLOSED-LOOP.md` §10 flags as its weakest number. |
| 0.4 | **DoR dry run.** Hand-author five class-A requirements against the *existing* gates (1–4). Do agents complete them unattended? |

**Exit gate:** votes clear a stated threshold; position does not dominate
variant; measured turn cost within 3× of estimate; ≥3 of 5 dry-run requirements
complete unattended and pass their named gate.

**Kill criteria** — any one of these ends or reshapes the programme:
- **Nobody votes.** The taste signal does not exist. The programme is then a
  solo engineering exercise with no external judge, which may still be worth
  doing but is *not this experiment* and should be renamed before continuing.
- **Position beats variant.** The instrument measures layout, not quality.
  Fix the instrument or abandon the ladder.
- **Agents fail well-formed requirements.** If 0.4 fails, no planner and no
  judge will save it — the problem is upstream of everything in this document.

### Phase 1 — Build the requirement factory (gates 5–7)

Human and crew authored, human reviewed. Class B throughout: **the fleet does
not run this phase.**

| WBS | Deliverable | Unlocks |
|---|---|---|
| 1.1 | Atomic multi-insert — a constellation lands all-or-nothing | every summon requirement |
| 1.2 | Summon legality as a decidable predicate against a real pocket | placement and UI work |
| 1.3 | Object kinds and recipe schema | the production family |
| 1.4 | **Gate 5** — production feasibility (the linear system) | recipe-balance requirements |
| 1.5 | **Gate 7** — frame budget as a per-turn number on a reference device | every performance requirement |
| 1.6 | **Gate 6** — the build certificate over a self-modifying lattice | level generation, par, difficulty — *the largest unlock and the hardest item in the programme* |

**Exit gate:** each gate, once built, yields ≥10 class-A requirements that meet
§2.1 — demonstrated by writing them, not asserted. A gate that unlocks no
schedulable work was the wrong gate.

**Kill criterion:** 1.6 resists. The build certificate is a planning problem
over a state space its own actions mutate; if it will not yield after honest
effort, the *campaign* form of foam-factorio is not certifiable, and the
fallback is a sandbox — which forfeits gate 3 and most of the oracle stack.
That is a different, weaker programme and should be chosen deliberately, not
drifted into.

### Phase 2 — The judge, and resolve the signal question

| WBS | Deliverable |
|---|---|
| 2.1 | Decide: does human pairwise replace the `rubric` signal? (open bead — `config.json` and `FACTORIO.md` currently disagree, deliberately) |
| 2.2 | The ladder — pairwise preference between consecutive turns, with the 0.2 control running continuously |
| 2.3 | Artifact probes (loads, interactive, no console errors, keyboard, legible at 380px) |
| 2.4 | Calibration against phase-0 human scores; flip `judge.calibrated` only when they agree |

**Exit gate:** the judge's ordering agrees with human ordering on the phase-0
sample. **Kill criterion:** it does not, and cannot be made to. An uncalibrated
judge is a number, not a measurement; shipping one as the other is the mistake
this repo keeps writing down.

### Phase 3 — The planner: automated requirement supply

Only now, and only because phases 0.4 and 1 established what a good requirement
looks like by making them by hand.

| WBS | Deliverable |
|---|---|
| 3.1 | The decomposer — spec in, epic tree out, every leaf meeting §2.1 |
| 3.2 | The promotion rule change: from "not its own work" to "not a bead it authored" |
| 3.3 | A reviewing role distinct from author and implementer |
| 3.4 | Requirement-supply metric published beside the curve |

**Exit gate:** the planner sustains ≥ `turnsPerDay` class-A requirements for a
week, at a DoR pass rate a human reviewer accepts.

**Kill criterion:** planner output needs more human review time than hand-authoring
would have. Then unattended operation is a fiction and the honest answer is a
supervised loop at lower cadence — still useful, differently described.

### Phase 4 — The run

Budgeted, instrumented, `enabled: true`. 3–5 artifacts × 20–40 turns. Depth
over breadth: the curve exists only along the turn axis.

**Exit gate:** any stop condition in `LOOPS.md` §5 fires as designed.

### Phase 5 — Publish the curve

The deliverable, negative results included. If the answer is "duration stops
paying at turn 7", that is the finding and it publishes.

---

## 5. Roles and who may promote

Promotion is the only privileged act in the system, and it tightens or loosens
by phase rather than being decided once.

| Phase | Who may move a bead to `ready` |
|---|---|
| 0–1 | **Human only.** |
| 2–3 | Human, plus a reviewing agent for class A **whose author was a different agent** |
| 4 | As above, with the reviewer's promotions sampled and audited |

Class B never becomes agent-promotable. An agent that can author the gate that
judges it has no gate.

---

## 6. What this plan does not decide

Left open deliberately; each is the operator's, and each is a bead:

1. **Whether defenses imply an adversary** — that turns the build certificate
   from a plan into a strategy, and is a far larger commitment than the other
   three object kinds.
2. **Where votes are stored** — reusing `atpolls-db` buys infrastructure and
   buys blast radius.
3. **Whether the rubric signal survives** (2.1).
4. **How far campaign structure bends** — a factory persisting across pockets is
   a different game.

---

## 7. Why no requirements are attached to this document

Deliberately none, beyond the beads already in the ledger.

Writing the phase-1 and phase-2 requirement sets now would violate R2 for nearly
all of them: **their gates do not exist yet**, so their acceptance criteria would
be prose, and prose acceptance is how an agent's self-report becomes the
measurement. Manufacturing those requirements is phase 1's *output*, gate by
gate, as each one makes a new class of work checkable.

The ledger currently holds the phase-0 and phase-1 items as beads, most of them
`proposed` rather than `ready` — which is the correct state for work whose
acceptance criteria have not been built yet, and is exactly what the ready queue
being short is telling us.
