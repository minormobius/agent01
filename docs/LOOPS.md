# Loops — chain-reaction GitHub Actions, and the graph they reason over

How an unattended agent loop is built **in this repo specifically**: what wakes
what, what stops it, and which parts are load-bearing safety rather than
plumbing.

This is the *architecture*. The *programme* it exists to serve — the hypothesis,
the phases, the open decisions that are the operator's — is
[`CLOSED-LOOP.md`](CLOSED-LOOP.md), written before any of this existed. Read
that for **why**; read this for **how**.

Status: **built, deployed, and disabled.** Every component below exists, is
selftested, and runs; the surface is live at
[`loop.mino.mobi`](https://loop.mino.mobi). `.github/loop/config.json` has
`enabled: false`, and every loop workflow checks it first and exits 0. **Nothing
has taken a turn.**

The first push exercised the trigger graph for real and it behaved as designed:
three workflows woke — `deploy-loop`, `preflight` and `loop-tick` — which is
exactly the set the firewall in §4 predicts, and nothing else. `loop-tick`
stopped at gate 1 and **skipped every subsequent step, including the commit**:
`enabled` was false, so it never read the ledger and never dispatched.

---

## 1. The shape

Two ideas, and the second only works because of the first.

**A ticket graph, not a queue.** Work is nodes with dependency edges, plus a
kind of node that is not work at all: `finding`, `dead-end`, `question`. That
last group is the memory. A flat queue can carry what to do next; it cannot
carry *what was already tried and did not work*, which is the thing a
twenty-turn run needs most.

**A push is the message bus.** Each stage of the loop finishes by committing a
file; that commit's path is what wakes the next stage. There is no queue
service, no daemon, no polling — GitHub's own path-filtered triggers are the
scheduler.

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    ▼                                             │
              ┌───────────┐   .github/loop/work/<bead>.json   ┌────┴─────┐
              │ loop-tick │ ────────────────────────────────▶ │ loop-work│
              └───────────┘                                   └────┬─────┘
                    ▲                                              │
                    │                    .github/loop/verdicts/<turn>.json
   .github/loop/runs.jsonl                                         │
                    │                                              ▼
              ┌─────┴──────┐                                 ┌───────────┐
              │            │ ◀───────────────────────────────│ loop-judge│
              └────────────┘                                 └─────┬─────┘
                                                                   │
                                          loop/data/graph.json ────┴──▶ deploy-loop
```

| Workflow | Woken by | Does | Wakes |
|---|---|---|---|
| [`loop-tick.yml`](../.github/workflows/loop-tick.yml) | `runs.jsonl`, `config.json`, dispatch | decides whether to take a turn, and on what | `loop-work` |
| [`loop-work.yml`](../.github/workflows/loop-work.yml) | `work/**` | one agent turn on one bead | `loop-judge` |
| [`loop-judge.yml`](../.github/workflows/loop-judge.yml) | `verdicts/**` | scores the turn, records it | `loop-tick`, `deploy-loop` |
| [`deploy-loop.yml`](../.github/workflows/deploy-loop.yml) | `loop/**` | publishes the view | — |

### Why a push and not `repository_dispatch`

Because **`workflow_dispatch` and `repository_dispatch` only resolve for
workflows that exist on the default branch.** A pipeline living on a feature
branch gets a 404 from a dispatch aimed at it. `lab-build.yml` hit exactly this
and documents it; the ideas bot hit the sibling version — `schedule:` *also*
only fires from the default branch — and its three "hourly" workflows fired
zero times in their entire lives, while everyone believed the cadence.

A `push` trigger has no such rule. So the loop is driven by committing files,
which works from whatever branch it is on.

**The cost of that choice is the entire risk in §4.** It is the right trade
anyway, and §4 is how it is paid.

---

## 2. The graph

Ledger: `.github/loop/beads.jsonl`. Code:
[`scripts/lib/beads.mjs`](../scripts/lib/beads.mjs), CLI
[`scripts/beads.mjs`](../scripts/beads.mjs).

```
node scripts/beads.mjs ready              # the schedulable queue, best first
node scripts/beads.mjs show lp-3143d0
node scripts/beads.mjs lint               # non-zero on a broken graph
```

Loosely beads-shaped (Yegge's), with four decisions that are ours:

**Append-only JSONL, last record per id wins.** Not for taste — for git. Two
agents on two branches both "update the tracker"; with a JSON document they
conflict on every write and a three-way merge silently loses one side. With an
append-only log a merge is a *concatenation*, the union is always right, and
ordering only decides which of two edits to the same bead wins — exactly the
case where you want the later one.

**Content-derived ids**, not counters, for the same reason: two branches each
minting `lp-0042` produce a file that merges cleanly and means something false.

**Blocked-ness is derived, never stored.** A stored flag goes stale the moment a
dependency closes, and the failure is a bead sitting blocked forever because the
run that unblocked it forgot to say so. `blocked` is therefore not a status —
it is computed, every read.

**`dead-end` is a first-class kind.** CLOSED-LOOP.md opens with a build that
spent several turns writing an OBJ parser to work around a fetch failure the
system had already hit and not recorded, then published the wrong general claim
to a live page. A dead-end bead is that finding, written down, addressed to turn
30. It is never schedulable — it exists to be *read before work starts*, and
`loop-work.yml` puts every one of them in the agent's prompt ahead of the task.

### The ready queue is ordered by what it unblocks

Priority, then fan-out, then age. The middle term is the scheduling value of
having a graph at all: a ready bead with eight dependents is worth more than a
ready leaf of the same priority, because finishing it converts eight blocked
beads into schedulable ones.

### `proposed` is not `ready`

Promotion is a decision. A loop that promotes its own backlog has no gate, and
CLOSED-LOOP.md §3's "a closed loop without a judge is a random walk with a commit
log" is exactly what that produces. The rule is enforced structurally, not by
prompt — see §3.

---

## 3. The two rings

The worker agent runs with **no Bash, no git, no network tools** — the
`lab-build.yml` doctrine, and the reasoning is worth restating because it is
counter-intuitive: *prompts leak; tool grants don't.* With Bash gone the agent
cannot reach a branch, so the containment gate cannot be bypassed, and it cannot
write the ledger, so there is exactly one door into the graph.

That door is the **outbox**. The agent writes one file —
`.github/loop/outbox/<bead>.json` — saying what it did, what it learned, and
what it proposes. [`scripts/loop-apply-outbox.mjs`](../scripts/loop-apply-outbox.mjs)
validates it and applies it.

```
  agent  ──proposes──▶  outbox  ──validated──▶  ledger
 (no git)                                      (append-only)
```

What the boundary buys:

1. **An agent cannot promote its own work.** Every bead it proposes is created
   `proposed`, whatever the file asks for. That line is not configurable. It is
   the difference between a loop and a perpetual motion machine.
2. **A malformed turn cannot corrupt the graph.** Rejection is whole: a
   half-written outbox from an agent that hit its timeout leaves the ledger
   untouched and the turn recorded as failed. An agent appending directly could
   leave the graph unreadable at the moment the next turn needs it.
3. **Bounded blast.** At most 12 proposals and 12 findings per turn, 4000
   characters per body. A turn that proposes fifty beads has lost the plot.

The containment gate is separate and mechanical: the diff must stay inside
`loop/` and `.github/loop/{work,outbox}/`, or the whole turn is discarded. Per
CLOSED-LOOP.md §4 this is in the "stays on" column — *an agent writing outside
its directory is a bug, not a trust question* — and it stays on precisely
because the requester is now us.

---

## 4. ⚠ Workflow contagion — the real risk

Not model behaviour. This:

```
workflows:                    151
triggered by a push:          140
that write back to this repo:  39
```

**A push is what wakes the next workflow, so an unattended loop that commits is
a chain reaction with 140 potential listeners.** Live detonators in range
include `publish-*`, `illustrate`, `bisk-digest`, `sync-*`, and — the one that
matters most — `post-to-bluesky.yml`, which **has no branch filter at all** and
so is armed from every branch in the repo. A loop that ever wrote under
`time/posts/**.md` would post to real Bluesky accounts.

CLOSED-LOOP.md §7 stated the requirement and did not soften it: *asserted, not
assumed*. So:

### The firewall

[`scripts/loop-blast-radius.mjs`](../scripts/loop-blast-radius.mjs) reads every
workflow's push triggers, expands the loop's declared write paths into concrete
probe paths, and asserts:

> the set of workflows a loop commit can wake **⊆** the set it declares in
> `mayWake`

```bash
node scripts/loop-blast-radius.mjs            # the table
node scripts/loop-blast-radius.mjs --explain  # why each of the 151 fires or not
node scripts/loop-blast-radius.mjs --check    # exit non-zero if breached
```

Three properties make it worth trusting:

- **It fails towards "yes".** An unparseable workflow, an absent `branches:`
  filter and an absent `paths:` filter all count as *fires*. A firewall that
  guesses "no" is worse than none, because it is believed.
- **It runs on every turn**, not once at design time — inside `loop-tick`,
  inside `deploy-loop`, and inside `preflight` for every PR and `claude/**`
  push. The thing that breaks it is usually not a change to the loop; it is
  somebody adding a `paths:` entry to an unrelated workflow that happens to
  overlap.
- **Its selftest pairs every "does not fire" with a control that must fire**,
  including a live assertion that `post-to-bluesky.yml` still has no branch
  filter and *would* fire if the loop ever wrote a post. A regression that made
  the checker always return false would turn the firewall green; it cannot pass
  the controls.

### Merge-day guards

Every loop workflow carries one. **A squash merge is not a merge commit** — it
is one ordinary single-parent commit touching every file the branch ever added.
So merging the loop's branch would present to these triggers as dozens of fresh
work orders and judged turns, and would re-run months of turns at full model
cost, weeks late, from an integration commit nobody meant as a run. Real merge
commits are safe by accident (`git diff-tree` prints nothing for them); squashes
are not. `lab-build.yml` carries the same scar for the same reason.

### The push token

Loop pushes use `OS_AGENT_GITHUB_TOKEN`, not the Actions token. **A push made
with the default `GITHUB_TOKEN` does not trigger other workflows** — the chain
would go green at every stage and stop dead. That is the most confusing failure
this design can have: everything succeeds and nothing happens. Each workflow
checks the secret is present and fails loudly rather than pushing into silence.

---

## 5. The governor

[`scripts/loop-tick.mjs`](../scripts/loop-tick.mjs). Config:
`.github/loop/config.json`.

The budget is a **controller, not a countdown** (CLOSED-LOOP.md §8). It reads
remaining capacity and decides *where the marginal turn pays*: spend on the
artifact whose judge score is still climbing, retire the one that has plateaued.
Note the deliberate inversion against the ready queue, which is priority-first —
the queue answers "what is most important", the governor answers "what is the
best use of one more turn", and an urgent bead on a plateaued artifact is a bad
marginal turn even though it is a good bead.

Stop conditions, in precedence order. The order is itself a design choice: a
human asking "why is it not running" should get the answer they are actually
looking for, not a lower-priority one that sends them debugging the wrong thing.

| # | Condition | Why it is shaped that way |
|---|---|---|
| 1 | `enabled` is not `true` | master switch, checked before anything reads a ledger |
| 2 | `hardStopTurns` reached | a controller with a bug is still a loop; this does not depend on the controller being right |
| 3 | `turnsPerDay` in a **rolling 24h** | a calendar day lets 12 turns at 23:50 and 12 more at 00:10 spend two days in twenty minutes |
| 4 | at `maxConcurrentWork` | open work orders count as well as in-progress beads — an order written but unconsumed is committed spend |
| 5 | `repeatedGateFailures` consecutive | measured from the tail: three in a row now is a loop banging on a door; three last month is history |
| 6 | ready queue empty | a stop, **not** an invitation to promote proposals |
| 7 | `noImprovementTurns` with no improvement | the measurement, wired up as a brake |

Two details in (7) that are easy to get wrong and are tested:

- **Equal is not improvement.** A judge saturating at its own ceiling would
  otherwise read as endless progress and the loop would never stop.
- **A plateau retires one artifact, not the loop.** Another may still be
  climbing. Untagged work is the programme's own infrastructure and never
  plateaus — retiring it would halt the run with the reason "plateau", which is
  both wrong and unreadable.

Halt exits **3**, not 1. A red run every time a stop condition works correctly
is how a team learns to ignore red runs.

---

## 6. The judge, and what is honestly missing

CLOSED-LOOP.md §3, checked rather than assumed: **there is no evaluation
function anywhere in this repo.** `pressure-lab`'s README opens with "not a
solver"; `lab-smoke.mjs` is liveness; the gates are pass/fail policy. Nothing
scores whether a thing is *good*.

[`loop-judge.yml`](../.github/workflows/loop-judge.yml) is therefore **a stub
that says so in its own output**, and this is the most important honest thing in
the design:

- **Signal 1, probes** — implemented, but they measure *liveness*: does the
  graph lint, did the gate pass, did the outbox validate. Phase 2 adds the real
  ones for a built artifact (loads, interactive, no console errors, frame
  budget, keyboard-operable, legible at 380px).
- **Signals 2 and 3, rubric and adversarial** — not built, and **not faked**.
  Disagreement between the three signals *is* the data — which is only true if
  all three are real. One real signal plus two invented ones is not a
  triangulation; it is one signal wearing a hat.
- **`score` is `null` while `judge.calibrated` is false.** The viewer draws no
  curve from null scores and says why; the plateau brake ignores runs with no
  score, so an uncalibrated judge cannot silently halt the loop with a number it
  made up.

An uncalibrated judge is a number, not a measurement. Publishing one as the
other would be the exact mistake this repo keeps writing down.

---

## 7. Adding a second loop

The firewall and the ledger format are generic; nothing in either is specific to
this programme.

1. Copy `.github/loop/config.json` to `.github/<yourloop>/config.json` — its own
   `branch`, its own `writes`, its own `mayWake`, `enabled: false`.
2. `node scripts/loop-blast-radius.mjs --config .github/<yourloop>/config.json --explain`
   and read every line that fires.
3. Copy the four workflows, repoint their paths, keep the merge-day guards and
   the token check.
4. Give it its own ledger: `LOOP_LEDGER=.github/<yourloop>/beads.jsonl`.

**Do not share a ledger between loops.** Two reactors reading one ready queue
will both find the same free concurrency slot and both dispatch — the classic
form of the bug the concurrency group already prevents *within* one loop.

---

## 8. What is not built, stated plainly

- **The judge** — two of three signals, and all of the calibration (§6).
- **The real probes** for a built artifact.
- **`CRON_GITHUB_PAT` has never been set**, so `workers/cron` cannot give the
  loop a cadence off `main`. Until then every run is started by hand.
- **No turn has ever run.** Every number on the surface that would come from a
  run is empty, and the page says so rather than drawing an axis with nothing on
  it.
- **The coupling shape is undecided** — CLOSED-LOOP.md §11.1, the operator's
  call, and the one that most changes what the loop should be pointed at.

Each of these is a bead in `.github/loop/beads.jsonl`, which is the point: the
ticketing system's first job was to hold its own unfinished work.
