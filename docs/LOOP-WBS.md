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
| R4 | **Independent, or explicitly dependent.** No hidden ordering against siblings that could run concurrently. | Any two occupied `implement` seats may run simultaneously. Two turns racing on the same file is a merge conflict at 3am. |
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
| D4 | Any new work is proposed, not promoted by its author. Structurally enforced by `loop-apply-outbox.mjs`; promotion costs a `review` seat (§3.4). |

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

None of which forbids *deliberately* spending the whole window. Redlining under
a short lease is a legitimate mode and §3.6 describes it. The argument here is
against making the ceiling the **steady-state** regulator — a sprint you chose
is not the same object as a system whose only brake is exhaustion.

### 3.3 Branching is the point. Bound the population, not the gain.

An earlier draft of this section argued for holding the loop's *gain* — expected
successor turns per turn — below one, and treated the promotion rule as the
mechanism. **That was the wrong target, and the error is worth keeping visible
because it is an easy one to make twice: it conflated backlog growth with
runaway spend.**

Those are separable, and separating them is the design.

| What grows | Costs | Should it be bounded? |
|---|---|---|
| the **ready queue** — beads proposed, promoted, waiting | bytes of JSONL | **no.** A deep backlog is an asset. Long-horizon agent work is starved by too little of it, not endangered by too much |
| **work in flight** — turns actually executing | model capacity, the operator's window | **yes, hard** |

Gain above one grows the *queue*, which is free. What must be capped is the
**worker population**. Bound that and the branching factor can be whatever the
work demands, because throughput is set by headcount rather than by backlog
depth — which is how every organisation that has ever had a ticket tracker
works. Nobody panics at ten thousand open tickets; they staff to a number.

So: **seats, not gain.**

### 3.4 The seat model — supply-constrained, demand-driven

A **seat** is a licence to occupy one concurrent turn. A turn cannot start
without holding one and releases it on completion. Total seats **S** is the
supply constraint and the single most meaningful throttle in the system: it
sets peak burn directly, it is one integer, and it is legible at a glance.

**Seats are typed, and the types are the org chart.**

| Seat class | Does | Consumes | Produces |
|---|---|---|---|
| `plan` | decomposes specs into requirements | queue capacity | ready work |
| `implement` | one class-A requirement | ready work | artifacts, findings, proposals |
| `review` | validates, and **promotes** | proposals | ready work |
| `judge` | scores completed turns | turns | the curve |

Fungible seats would look simpler and would fail in a specific way: with all
seats available and demand reading "implement", the planner never runs and the
queue starves; with the allocation the other way, the backlog inflates and
nothing gets built. **The ratio between `plan` and `implement` seats is the
producer/consumer ratio** — Yegge's observation that too many of one blocks on
the other, expressed as headcount rather than as hope.

**And this is where the promotion problem dissolves.** §3.3's earlier draft
wanted promotion prohibited because an agent that promotes its own work has no
gate. The seat model gives a better answer: **promotion costs a `review` seat**,
and `review` seats are deliberately scarcer than `implement` seats. Gain is then
regulated by a *price* rather than by a *prohibition* — which is
demand-driven, tunable at runtime, and does not require deciding once and
forever whether agents may promote. The invariant that survives is narrower and
sufficient: **no agent reviews a bead it authored.**

**The allocator is where "demand-driven" lives.** Seats are not statically
assigned — they are allocated each tick against observed pressure:

| Signal | Reallocates toward |
|---|---|
| ready queue shallow / empty | `plan` — the loop is starved, make work |
| ready queue deep | `implement` — stop planning, start building |
| proposals piling up unpromoted | `review` — the gate is the bottleneck |
| turns completing unscored | `judge` — the curve is going stale |
| repeated gate failures | **nothing** — that is a stop condition, not a staffing problem |

That last row matters. An allocator that responds to failure by staffing harder
is a system that spends fastest exactly when it is working worst.

Backpressure is the property that makes this self-correcting: a deep queue
withdraws `plan` seats, so the planner cannot inflate a backlog nobody is
consuming — the classic pathology of this shape, and the reason an unbounded
queue is safe *only* when coupled to an allocator that watches its depth.

### 3.5 The lease bounds time; seats bound rate

Two different questions and they need two mechanisms.

**Seats** answer *how hard*. **The lease** answers *until when* — `until:
<timestamp>` in the config, past which the reactor refuses to dispatch
regardless of seats or queue.

Counters are the wrong shape for the second question. They miscount across
restarts, they are ambiguous under parallelism, and — the fatal property —
**neglect lets them continue**. The failure mode of a counter is that nobody
notices for a week. A lease fails closed, and it expresses the actual posture
directly: not "how many turns do I want" but "let it run tonight."

Together they give the exploration mode without ceremony: **a short lease with
many seats is a redline sprint; a long lease with few seats is a sustained
run.** Same two knobs, opposite settings, and neither requires guessing a turn
count in advance.

The master switch is unchanged. Three mechanisms, three questions: `enabled` —
may it run at all; **seats** — how hard; **lease** — until when.

### 3.6 Redlining, and the throttle as a first-class state

Spending the whole five-hour window during exploration is a legitimate mode,
and the seat model is how it is expressed: raise `S` for the duration of a short
lease.

What must not happen is treating the rate limit as an *error*. A 429 arriving
mid-turn, handled as a failure, produces retry storms and a run of failed turns
that trips `repeatedGateFailures` — the loop concluding it is broken when it is
merely throttled, and stopping for the wrong reason with a misleading record.

**Throttled is a state, not a failure.** On hitting it: release seats, stop
dispatching, hold the queue, and resume when the window resets. The degradation
ladder, in preference order:

1. **Fewer seats** — the graceful default; the loop slows rather than stops.
2. **Cheaper seats for mechanical work.** Gate-running, lint, regeneration and
   probe execution do not need the strongest model. Seat *class* and model tier
   should be separable, so `implement` can be Opus while `judge` and routine
   verification are not.
3. **Wait for the window.** The queue is durable; nothing is lost by pausing.
4. **Meter to the API** rather than the subscription — an explicit spend
   decision, not a routing-around.

`CLOSED-LOOP.md` §8 declines exactly one option here — running multiple
subscription accounts to stay ahead of the limit — and that remains the one
thing the loop should not do to keep itself fed. Everything above is fair game
and none of it is evasion.

### 3.7 Making it watchable

The seat model is not only a regulator, it is the thing that makes the run worth
looking at. A static graph is a snapshot; **an org chart with occupied seats is
a system visibly at work.**

`loop.mino.mobi` should show: the seats and who holds them, what each is working
on, what closed in the last hour, what was spawned, and how the allocator is
currently split. A bead retiring and three appearing behind it is the programme's
own heartbeat, and it is currently invisible — the page renders a graph, not
motion.

### 3.8 The regulator stack

Each failure mode wants a different mechanism at a different timescale. One
knob cannot cover them, which is why the single `turnsPerDay` felt
unsatisfying.

| Failure | Regulator | Timescale | Status |
|---|---|---|---|
| one turn costs far more than expected | `--max-budget-usd` per turn | seconds | **built** |
| too many turns at once | **seats** (`S`), enforced against in-flight work *and* uncommitted work orders | minutes | partly — a fixed `maxConcurrentWork` exists; typing and allocation do not |
| two ticks each claiming the same free seat | GH `concurrency: loop-tick`, `cancel-in-progress: false` | seconds | **built** — load-bearing, not cosmetic |
| sustained drain faster than intended | seat count, tuned against the lease | hours | to build |
| operator throttled by their own loop | headroom reserve + published consumption | continuous | to build |
| **rate limit hit** | **throttled-as-a-state**: release seats, hold the queue, resume | minutes | to build — today it would look like gate failures |
| runs on while nobody is watching | **lease — fails closed** | days | to build |
| planner inflates a backlog nobody consumes | **backpressure**: deep queue withdraws `plan` seats | per tick | to build |
| an agent promotes work it authored | `review` seat + *no agent reviews its own bead* | structural | **built** (currently as a total prohibition) |
| runs but stops improving | plateau brake + judge | over turns | partly built, uncalibrated |
| graph becomes incoherent | lint + blast-radius gates | per turn | **built** |

### 3.9 Push chain versus clock pull

A genuine architectural fork, and the current design has only picked one half.

- **Push chain** (built): completion triggers the next start. Low latency,
  self-sustaining, and needs explicit brakes — it is the shape that grows.
- **Clock pull**: `workers/cron` fires the reactor at a fixed rate; turns are
  drawn from the queue when the bucket allows. Cannot run away, because the
  clock is external to the loop's own behaviour.

The hybrid is better than either, and seats are what make it safe: **the chain
may continue while a seat is free, and when every seat is occupied the chain
stops and waits for one to be released.** Burst latency when there is capacity,
externally-bounded rate when there is not. The clock then exists as the
*recovery* path — it restarts a chain that died mid-flight, which a pure push
system cannot do for itself. `CRON_GITHUB_PAT` — still unset — is the
dependency, and without it a crashed chain stays dead until a human notices.

### 3.10 Supply still binds — but the planner now has a seat

Seats cap the rate; they do not create work. Class-A requirement supply remains
the ceiling on unattended operation (§2.3).

What the seat model changes is that **supply is now something the loop staffs
for rather than something it waits on.** The `plan` seat is the fix for the
two-hours-a-day-of-operator-time problem: when the queue runs shallow, the
allocator turns capacity toward making requirements instead of halting on
`empty ready queue`.

Two consequences stand unchanged:

1. **The planner is what makes unattended operation exist at all.** Everything
   before it is a supervised experiment and should be described that way.
2. **Requirement supply belongs on `loop.mino.mobi` beside the curve.** A loop
   halting on `empty ready queue` is not idle, it is *starved*, and from
   outside those are indistinguishable.

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
| 3.2 | Seats: typed pools, the allocator, and promotion priced at a `review` seat |
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

## 5. Roles, seats, and who may promote

Promotion is the only privileged act in the system. It is priced rather than
prohibited (§3.4): it costs a `review` seat, and `review` seats are deliberately
scarcer than `implement` seats — so the rate at which the loop can feed itself
is a dial rather than a cliff.

| Phase | Who may move a bead to `ready` | Seats live? |
|---|---|---|
| 0–1 | **Human only.** | no — turns are hand-started |
| 2 | Human only; `judge` seats may run | partial |
| 3 | Human, plus a `review` seat for class A **on a bead it did not author** | yes, allocator active |
| 4 | As above, with the reviewer's promotions sampled and audited | yes |

Two invariants hold at every phase:

- **No agent reviews a bead it authored.** This is the narrow form of the
  original prohibition and it is the part that must survive — an agent that
  can promote its own proposal has no gate at all.
- **Class B never becomes agent-promotable.** An agent that can author the gate
  that judges it has no gate either, and no seat price fixes that.

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
