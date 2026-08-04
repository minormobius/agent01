# Sprints — parallel agents, three surfaces, and how the work comes back together

The deployment topology and the integration model. Answers two questions the
other loop documents leave open: **where does loop output land**, and **what
happens when six agents commit conflicting work**.

| | |
|---|---|
| [`CLOSED-LOOP.md`](CLOSED-LOOP.md) | why |
| [`LOOPS.md`](LOOPS.md) | the machinery, built and disabled |
| [`LOOP-WBS.md`](LOOP-WBS.md) | phases, gates, seats, regulation |
| [`../foam/FACTORIO.md`](../foam/FACTORIO.md) | the target |
| **this file** | surfaces and integration |

---

## 1. Three surfaces, and the contamination boundary

| Surface | Holds | Written by |
|---|---|---|
| `loop.mino.mobi` | the apparatus — graph, seats, curve, run log | operator + integrator |
| `foam.mino.mobi` | the **hand-authored** foam. The loop never writes here | humans only |
| **`plant.minomobi.com`** *(new)* | loop output, seeded from foam | the loop |

The loop's tree is seeded from `foam/` as a starting point and then diverges.
Hand-authored foam stays clean, and "did a human or a machine write this?" is
answered by which directory it is in — no annotation to maintain and no
exceptions to remember.

### 1.1 Why `plant.minomobi.com` and not `plant.mino.mobi`

`plant.mino.mobi` is the obvious choice and it is wrong. `CLOSED-LOOP.md` §6.1:

> `minomobi.com` carries agent-generated content **and nothing else** — a rule
> whose whole value is that it needs no exceptions remembered.

Loop output is agent-generated. Putting it on `*.mino.mobi` would put it inside
the SSO cookie's `Domain=.mino.mobi` scope, inside the auth worker's wildcard
origin allowlist, and inside the operator's reputation — the three reasons
`LAB-FACTORY.md` §3 gives for why agent-written pages must not live there.

The apparatus is different and stays where it is: `loop.mino.mobi` is *operator
content about a research programme*, not agent output.

**But not `minomobi.com/plant/` either.** That path is served by the `lab`
worker from `lab/www/`, so a loop push under it would fire `deploy-lab.yml` and
republish forty tenant sites on every sprint. A separate worker on a separate
hostname of the quarantined registrable domain — the `labglass.minomobi.com`
and `os-api.minomobi.com` precedent — gives the quarantine without the blast
radius.

**Accepted caveat, recorded rather than solved:** sibling subdomains of a shared
registrable domain can set parent-domain cookies for one another, so a hostile
page on one `*.minomobi.com` host could set a `.minomobi.com` cookie reaching
another. `LAB-FACTORY.md` §3 already accepts this for `os-api`; severity is low
while nothing there authenticates by cookie. Noted so it is visible if that
changes.

### 1.2 The name

`plant` — foam's own third shiva tool is **plant** (insert a voronoi node and
the lattice reforms around it), and a plant is a factory. The mechanic and the
genre in one word.

---

## 2. What a worker actually experiences

Not worktrees. Not a shared filesystem. **Each turn is a separate GitHub Actions
runner doing a fresh `actions/checkout`** — its own machine, its own clone, no
visibility into any sibling.

So an agent in a seat sees:

- a clone at the **sprint base** commit, not at whatever trunk has drifted to;
- one bead, its brief, and the graph's accumulated memory;
- no Bash, no git, no network — it writes files and an outbox and stops;
- **no knowledge that five siblings exist.**

That last property is deliberate and load-bearing. Agents do not coordinate.
Coordination is the integrator's job, once, at the barrier. An agent that tried
to avoid its siblings' edits would need to see them, which means shared state,
which is the thing being avoided.

---

## 3. Conflicts, in order of preference

Avoid > make unconflictable > barrier > redo. Resolution by hand appears
nowhere in that list, and that is the point.

### 3.1 Avoid — path leases

The Definition of Ready already carries the mechanism, currently as an
aspiration:

> **R3 — Bounded paths.** Declares the files it may touch.
> **R4 — Independent, or explicitly dependent.**

Make it enforced: **the allocator refuses to co-schedule two turns whose
declared path sets intersect.** Conflicts are then not resolved, not merged, and
not detected — they are *not created*. This is the same insight the lab factory
runs on (disjoint tenant directories never conflict), applied at a finer grain
because this work is not naturally disjoint.

It does not cover everything — two turns editing different files can still break
each other semantically — but it removes the bulk, cheaply, using a field the
requirements must carry anyway.

### 3.2 Make the shared files unconflictable

Path leasing cannot help with files **every** turn touches. There are exactly
two classes, and both have a fix that removes the conflict entirely rather than
easing it.

**The ledger.** Turns must not write `beads.jsonl` at all. Each writes one file
— `.github/loop/outbox/<bead>.json` — which no sibling can touch, because a
bead is held by exactly one seat. The integrator runs
`loop-apply-outbox.mjs --all` once at the barrier and appends every outcome in
deterministic bead-id order. **Six turns, six new files, zero conflicts.**

> ⚠ **This is a bug in what is currently built.** `loop-work.yml` applies its
> own outbox to the ledger *and* regenerates `loop/data/graph.json` *and*
> commits both. At one seat that is fine. At six it is a guaranteed conflict on
> every single turn, on the two files most likely to be touched. Both steps move
> to the integrator.

**Generated artifacts.** `loop/data/graph.json` is derived. If every turn
regenerates and commits it, every turn conflicts on it — and worse, the conflict
is *meaningless*, since the file is a pure function of the ledger. **Turns
commit sources; the integrator regenerates derived files once, after the merge.**
That is already how `preflight --fix` thinks about generated files; it just has
to be enforced against the loop.

**Belt and braces:** `.gitattributes` with `*.jsonl merge=union` for any JSONL
that does end up touched concurrently. Git's built-in union driver takes lines
from both sides, which is the correct resolution for an append-only log. The
caveat worth knowing: union merge is only safe when the two sides append
*different* records — two turns patching the same bead would have their order
decided arbitrarily. Path leasing plus one-bead-per-seat is what makes that not
arise; the union driver is the net, not the plan.

### 3.3 The barrier — why a sprint rather than a merge queue

A continuous merge queue (each turn rebases onto trunk and lands) is the obvious
alternative and it has a specific failure here: **starvation.** A 25-minute turn
racing a queue that lands something every four minutes gets rebased out
repeatedly and may never land. Worse, every landing invalidates the base every
in-flight agent is working from — with six seats, contention rises with the
square of the fleet.

A **sprint** is a barrier: every turn in it branches from the same base, and
nothing lands until the sprint closes. In-flight agents are never invalidated,
because trunk does not move under them.

It also answers the cost objection directly. Merging per turn means one
integrator run per turn — double the instances, as you say. **A sprint means one
integrator run per sprint, amortised over N turns.** At six seats, integration
overhead falls from 100% to about 17%.

### 3.4 Redo, don't resolve

Whatever survives leasing and lands conflicting: **the losing turn is discarded
and its bead returns to `ready`.** No hand resolution, ever.

This is affordable *because of* the Definition of Ready. R1 says a requirement
is one turn; R6 says a failed attempt leaves the tree as it found it. Re-running
a 20-minute requirement against the new base is cheaper than a human resolving a
semantic conflict — and it is exactly what having cheap labour is for. Hand
resolution is the expensive resource being conserved.

**And a rejection is information, not just a loss.** If two requirements
conflict repeatedly across sprints they are not independent, which means R4 was
wrong about them. That is a finding, and the planner should respond by merging
them into one bead or adding a dependency edge. Conflict frequency is a quality
metric for the requirement factory.

---

## 4. The sprint is not just a merge convenience

The strongest argument for sprints has nothing to do with git.

**A human cannot perceive one turn's improvement.** The audience ladder
(`FACTORIO.md` §5) compares versions and asks which is better — and turn *N*
against turn *N−1* is far below the resolution of that judgement. Strangers
would be voting on noise, and the ladder would measure nothing.

A sprint is a coherent increment: several turns of work, integrated, gated,
deployed. That *is* perceptible. So:

> **sprint = merge epoch = deploy unit = judge unit**

One concept doing four jobs, and the curve becomes quality against *sprint*
number rather than turn number. Turn count remains an observable — how much was
spent to move one sprint — which is exactly the cost-per-improvement figure the
programme wants and would not otherwise get.

---

## 5. The integrator

One `merge` seat, serialized by construction — exactly one integrator runs, and
only at a barrier.

| Step | |
|---|---|
| 1 | Collect the sprint's branches. Turns still running at the deadline are **abandoned**, not waited for — their beads return to `ready`. One slow turn must not hold six. |
| 2 | Merge in deterministic order: conflict-free first (free), then the rest by bead priority, then reject. |
| 3 | Apply every outbox in bead-id order — one ledger write for the whole sprint. |
| 4 | Regenerate derived artifacts **once**. |
| 5 | `preflight` and `loop-blast-radius --check`. A red sprint does not deploy. |
| 6 | Push to the plant surface's owning branch → `deploy-plant` fires → strangers see sprint *N*. |
| 7 | Record the sprint: turns landed, rejected, conflicts, spend. Hand it to the judge. |

Step 1 is the one that will be got wrong first. A barrier with no deadline is a
barrier that hangs on its slowest member, and the fleet idles at full seat cost
while it waits.

---

## 6. What this changes in the current build

| Now | Should be |
|---|---|
| `loop-work.yml` applies its own outbox to the ledger | integrator only, `--all`, at the barrier |
| `loop-work.yml` regenerates and commits `graph.json` | integrator only, once per sprint |
| each turn pushes to the loop branch directly | each turn pushes **its own branch**; the integrator merges |
| `loop-judge.yml` scores a turn | scores a **sprint** |
| the loop's `writes` include `foam/**` | `plant/**` — `foam/**` comes **out**, that is the contamination boundary |
| no sprint concept anywhere | sprint id on every work order, run record and branch name |

---

## 7. Open

1. **Sprint size.** Bounded by seats × turn length and by the lease. Small
   sprints lose less to rework; large sprints amortise integration better. This
   is a measurement, not a decision — phase 0 should produce it.
2. **Does `plant/` track upstream `foam/`?** A one-time seed is simplest and
   honest; periodic rebase makes the fork a maintenance burden forever. The
   recommendation is a one-time seed plus explicit *port* beads when
   hand-authored foam moves — but that means the two diverge, permanently, and
   that should be a decision rather than a drift.
3. **Does the plant surface auto-deploy, or does a human promote each sprint?**
   Auto-deploy is what makes it watchable and is defensible on a quarantined
   domain nobody asked for. A human gate is slower and safer. This is the same
   question `foam` already answered the other way, and the answers can
   legitimately differ because the domains carry different promises.
