# The closed loop — a run, not a feature

A design record for the next thing, written before the thing exists so that the
reasoning survives the conversation it came from.

**What is being proposed:** an instrumented, budget-governed, unattended agent
loop that produces artifacts *and a measurement*, on a new surface, driven from
inside the house rather than by a stranger's mention.

**What it is not:** a bigger lab factory. The factory already builds a site in
about eight minutes and has built forty-six. Volume is solved. What is not
solved is anything about *duration*.

Prior art in this repo: [`LAB-FACTORY.md`](LAB-FACTORY.md) (the inbound loop),
[`IDEAS-BOT.md`](IDEAS-BOT.md) (the outbound half), and
[`lab/www/CLAUDE.md`](../lab/www/CLAUDE.md).

---

## 1. The question this exists to answer

Not *"can we build a hundred things?"* — we can, and the marginal one costs
eight minutes. That is a volume demo and it teaches nothing.

Everything in this repo is scoped to about three turns of back-and-forth, and
the honest reason is that **nobody knows where unattended work stops paying.**
Does turn 20 improve on turn 19, or churn? Does an agent rediscover its own
findings? Does quality plateau, oscillate, or degrade?

Our own evidence says the pessimistic thing. One build spent several turns
writing an OBJ parser and a file-upload button to work around a fetch failure
the harness had already hit and not recorded, then published this to a live
page:

> Confirmed again: this build can't reach poly.pizza or opengameart, live or at
> build time.

True of that run. Wrong as a general claim. Nothing in the system could tell it
otherwise, because nothing in the system remembers.

**So the deliverable is the curve:** unattended quality against turn count,
measured, over N artifacts. That is what builds a taste for scope, and it is a
genuinely unusual public artifact — most agent-loop demonstrations show you a
terminal and ask you to be impressed.

---

## 2. The loop already exists, at a 5% duty cycle

This is not a greenfield. The producer half runs today.

| | |
|---|---|
| concepts pooled, never offered | **542** |
| offered to the timeline, each with a written plan | **62** |
| accepted by a human → built | **3** |
| published sites carrying an unbuilt plan in `BRIEF.md` | **59 of 64** |
| builds/day, six consecutive days | 25, 57, 31, 48, 12, **7** |
| capacity | 12/hour = **288/day** |

Two things fall out of that table and both are load-bearing.

**Capacity is not the constraint.** Demand is single-digit against 288. The
instinct that an autonomous loop would starve real requesters is wrong; there is
nothing to compete for. The real ceiling is the operator's own model capacity,
which `CLAUDE.md` already states correctly: *an unbounded hour does not produce a
bill, it produces an operator who cannot use their own tools for the rest of the
week.*

**There is a second backlog nobody is reading.** Every site's `BRIEF.md` ends
with a section its agent wrote *for its successor* — `## The plan (not built
yet, in order)`, `## The plan — what's not built yet`, and 57 more. Written by
the producer, addressed to the consumer, inert since the day each was written.
That is a bead in all but name: it has state, ordering and a handoff. It is
unqueryable prose on a published page.

---

## 3. ⚠ There is no evaluation function anywhere in this repo

Checked, not assumed:

- `packages/pressure-lab/` is measurement scaffolding for hand-authored games,
  and its README opens by saying **"Not a solver"** — deliberately, because each
  game in the family measures a different thing and a shared solver would be a
  lie.
- `scripts/lab-smoke.mjs` is liveness: does it load, does it throw.
- The content gate, the containment gate and the secret scan are pass/fail
  policy.

Nothing scores whether a thing is *good*.

**A closed loop without a judge is not a loop. It is a random walk with a commit
log.** Yegge's machine has a reviewing agent over all completed work; that is the
component, and here it would be built from zero.

This is the project. Everything else is plumbing that already exists.

---

## 4. What "from inside the house" removes — and what it does not

Most of the safety machinery here exists because a **stranger chose the input**.
When the operator is the requester, that half is genuinely spendable. The other
half is not, and conflating them is how "gloves off" quietly becomes "gates off"
at turn 40 of an unattended run.

| Comes off — it was about provenance | Stays on — it is about consequence |
|---|---|
| `WHITELIST` / mutual-follow admission | the containment gate (an agent writing outside its directory is a bug, not a trust question) |
| instructions / context / room banners | the secret scan (the runner holds real credentials whoever triggered it) |
| thread scoping to one requester's DID | the unbounded-stream rule and the CSP — those protect *other people's data*, not us from the requester |
| the SSRF guard on stranger-chosen URLs | licence and attribution — third-party rights do not care who asked |
| the reference character budget | URL permanence |
| the trademark refusal on asked-for names | Bluesky posting volume (§11.4 — that traffic is what gets accounts reported) |
| | the operator's model capacity |

The right column is most of the interesting engineering. None of it relaxes.

---

## 5. Why everything here has felt like three turns

**Scale is not size.** Eighty surfaces, forty-six sites and two hundred scripts
is *volume*. Volume is additive — surface 81 costs what surface 3 cost. Scale is
when the *n*th unit costs more than the first, and that only happens for
specific reasons.

The characteristics, in rough order of how much they produce the sensation:

1. **Irreducible coupling** — how far you must reason to make one correct
   change. This is the axis; the rest are downstream.
2. **State that outlives the code** — you cannot rewrite, only migrate.
3. **A spec no single head holds** — not "long" but *branchy*; it does not
   linearise into a reading order. This is the thing beads exists for.
4. **Concurrency and partial failure** — many actors, no global clock.
5. **An adversarial environment** — the world pushes back and does not care.
6. **Asymmetric, delayed cost of error** — wrong is not "redo", it is "live with
   it".
7. **Handoff** — decomposed by people who will not implement it.

**This repo already has five of the seven.** (2) permanent URLs, live Durable
Object rows, posts on real accounts — `PRIOR_DIDS` exists precisely because you
cannot rewrite an identity. (4) two pollers contradicting each other 368ms
apart; the publish race that went green with nothing published. (5) Cloudflare
403ing the runner while serving a laptop. (6) `tube-tetris` is the scar. (7)
`BRIEF.md` is literally a handoff artifact, 59 of them outstanding.

It is missing exactly the two that produce the *feeling* — **(1) coupling and
(3) an unholdable spec** — and it is missing them on purpose:

```
surfaces: 80
surfaces with NO shared dependency: 60
```

Three quarters of the estate depends on nothing. The house style says so
everywhere: *sites live in disjoint directories, so those merges never
conflict*; *each surface has exactly one owning branch*; *no build step, no
dependencies*.

**So "everything here is three turns" is a construction, not a ceiling.** The
reward for it is that nothing can break anything — a surface deploys alone, a
bad tenant cannot take out `auth.mino.mobi`. The cost is that the experience of
scale was engineered out along with its cause.

A project that wants to build taste for scale must therefore **reintroduce
coupling deliberately** — not as sloppiness, but as parts that genuinely need
each other. That is a real loss of a property currently enjoyed, and it should
be spent knowingly rather than conceded.

---

## 6. The shape

### 6.1 Two surfaces, and the split is the quarantine rule

`minomobi.com` carries agent-generated content **and nothing else** — a rule
whose whole value is that it needs no exceptions remembered. That rule decides
this cleanly:

| | Where | Why |
|---|---|---|
| **the apparatus** — run page, bead graph, the curve, dashboards | `loop.mino.mobi` | operator content about a research programme |
| **the artifacts** — whatever the loop builds | `minomobi.com`, own marked path, **not tenant names** | agent-generated, so the quarantine is where it belongs |

Nobody asked for the artifacts, so they must not occupy the namespace where
*"someone asked and this is theirs"* is the promise.

Adding either surface follows the existing checklist in `CLAUDE.md` §*Adding a
surface* — `wrangler.jsonc`, a deploy workflow copied from the closest
neighbour, a `surfaces[]` registry entry with **one** owning branch, an
`index.html` catalogue entry, a spec family, and a real `<dir>/CLAUDE.md`.

### 6.2 The loop

**Seed** from the pool — 542 concepts, and *we* pick, which is the one place
"inside the house" genuinely helps.

**Turn**: build → judge → write beads → decide → next turn.

**Judge**, multi-signal and deliberately not a single model call:

- automated probes — loads, interactive, no console errors, frame budget,
  keyboard-operable, legible at 380px
- a model-as-judge against a written rubric
- adversarial agents told to break the stated mechanic

Disagreement between the three is itself data, and calibration against human
scores from the pilot is what makes the judge trustworthy rather than merely
present.

**Beads** — the durable graph, and where Yegge's structure earns its keep:
findings, dependencies, and *tried-and-failed*, so turn 30 does not redo turn 4.
Seed it from the 59 existing plan sections and from the build's refusal reports,
which already exist (`/tmp/lab-assets-problems.txt` and the gates' output).

**Stop conditions**, all three required: budget exhausted, K turns with no judge
improvement, or a repeated gate failure. *A loop that cannot stop is the failure
mode*, not a feature.

### 6.3 The coupling shape — a recommendation, not a decision

The operator has not called this. The recommendation, to be overruled freely:

**Make the forty-six sites participants rather than neighbours** — a shared
world, protocol, economy or physics that they all sit inside. A change to the
shared layer then breaks things far away, which is the entire point, and it is
the only candidate that uses the estate that already exists and is watchable
while it happens.

Alternatives considered, in descending order of how hard they force (1) and (3):

- **A protocol several independent implementations must satisfy.** Coupling
  without a shared codebase — the honest kind. Versioning and back-compat come
  free.
- **A compiler or interpreter.** The canonical coupling: you cannot touch the
  parser without the codegen knowing. Brings (3) for free.
- **Migrations over live data.** `atpolls-db` already has 8 dependents and is
  the one place in this repo with real blast radius today.

### 6.4 Depth over breadth

3–5 artifacts × 20–40 turns, not 100 × 1. **The curve is the deliverable and it
only exists along the turn axis.** Breadth is the thing we already know.

---

## 7. ⚠ Workflow contagion is the real risk

Not model behaviour. This:

```
workflows:                    146
triggered by a push:          135
that write back to this repo:  39
```

A push is what wakes the next workflow, and **an unattended loop that commits is
a chain reaction with 135 potential listeners.** Live detonators in range
include `publish-*`, `illustrate`, `bisk-digest`, `sync-*`, and — the one that
matters most — `time/posts/**.md`, where a push to `main` **posts to real
Bluesky accounts**.

The lab factory has already been bitten by a milder version of this: its push
trigger carries an explicit merge-day guard because a squash merge is a single
commit touching every request file the branch ever added, which would have
rebuilt forty strangers' sites weeks later, at full agent cost, from an
integration commit nobody meant as a deploy.

**Requirement, to be written and tested before the first autonomous commit:** the
loop runs on its own branch, writes only under its own paths, and there is a
check asserting its diff cannot match any other workflow's triggers. Asserted,
not assumed — the cost of being wrong here is a self-sustaining reaction that
spends the operator's model budget in a circle, or posts.

**Second rule:** the loop publishes freely to its own surface and **posts
nothing** without a human promoting it. The factory's entire social risk is
automated posting volume.

---

## 8. The budget is the controller, not a limit

The interesting version is not "run N turns then stop". It is the loop reading
its own remaining capacity and **deciding where the marginal turn pays** — spend
on the artifact whose judge score is still climbing, retire the one that has
plateaued, bank the rest. That is the difference between a batch job and a
cybernetic loop, and it is the part that would actually be new here.

It requires the loop to see the gauge honestly, **including the case where the
gauge says stop and the correct response is to stop** — not to find a more
permissive gauge, not to split work across accounts, not to route around the
limit. That sentence is in this document rather than in a code comment because
it is the one place an autonomous loop's local incentives and the operator's
interests come apart, and it should be settled before anything runs unattended.

This is also where this design **declines** part of its inspiration. Yegge's
loop is load-bearing on rotating multiple subscription accounts to stay ahead of
rate limits. Running smaller inside one limit is the trade taken here.

---

## 9. Phases

| | | Stop-if |
|---|---|---|
| **1. Pilot** | one artifact, 10 turns, judge stubbed as a rubric a human scores | turns 5–10 are not visibly better than 1–4 — **stop the programme, that is the result** |
| **2. The judge** | probes + rubric + adversarial pass, calibrated against the pilot's human scores | the judge disagrees with people |
| **3. Beads** | the graph, seeded from the 59 plans and the refusal reports | — |
| **4. The run** | budgeted, instrumented, own surface | any stop condition in §6.2 |
| **5. The page** | publish the curve | — |

The pilot exists to be cheap enough that a negative result is affordable. **A
programme that cannot report "this does not work" is not an experiment.**

---

## 10. Cost, stated honestly

At the observed ~8 minutes and roughly 100–200k tokens per build turn, 5
artifacts × 30 turns is ~150 turns: 20+ hours of runner time (parallelisable)
and a serious fraction of a subscription month.

That estimate is the weakest number in this document. Replacing it with a
measurement is phase 1's second job.

---

## 11. Decisions still open, and they are the operator's

1. **The coupling shape** — §6.3 recommends the shared world; the alternatives
   are real.
2. **Whether the loop may re-publish an existing site nobody asked it to
   touch.** Instinct: yes where the plan was written in the requester's own
   thread and they saw it, no where an agent invented it unilaterally. That is a
   judgement about users, not about code.
3. **The account.** A separate identity is right — `minomobi.com` is a service
   account whose job is being mentioned by strangers, and interleaving "here is
   your site" with "night 14 of the run" degrades both. **Do not create it yet:**
   the routing rule must exist and the destination must be verified *before*
   registration, because Cloudflare rejects mail to an address with no matching
   rule and an address on file is the only route to changing the address. That
   ordering already cost this project one account.
4. **What community steering means** — "we read it" and "it changes what runs"
   are different products, and an account that asks for direction without
   visibly acting on it is worse than no account.

---

## 12. What this borrows, and what it declines

**Borrowed:** the producer/consumer split with a reviewer over completed work;
a durable issue graph as the memory that survives context compaction, carrying
findings and dependencies rather than a flat queue; the observation that
long-horizon agent work needs abundant backlog, which this repo has 542 of.

**Declined:** multi-account rotation to defeat rate limits; the premise that the
loop should be unbounded; and the implicit claim that duration alone produces
quality. That last one is not rejected, it is **the hypothesis under test** —
which is why the deliverable is a measurement and not a demo.
