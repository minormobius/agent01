# foam-factorio — production inside the lattice

A design record for the next thing, written before the thing exists so that the
reasoning survives the conversation it came from. Same posture as
[`docs/CLOSED-LOOP.md`](../docs/CLOSED-LOOP.md), and for the same reason.

**What is proposed:** summonable objects — sources, processors, defenses, sinks
— placed into the voronoi foam as Platonic cells, turning the puzzle platformer
into a production puzzle without turning it into an open world.

**What it is not:** a sandbox. The campaign stays a puzzle platformer. A
mechanic that cannot be *certified solvable* does not ship — that rule already
governs foam and it governs this.

**Why it exists at all:** this is the target for the agent loop
([`docs/LOOPS.md`](../docs/LOOPS.md)). It was chosen over a compiler, a solver
family and a research graph because it is the only candidate that is
simultaneously **testable** (foam already carries a constructive solvability
proof), **attractive** (strangers will click a first-person 3D puzzle; nobody
visits a compiler), and **deep and interconnected enough that the agents will
genuinely struggle** — which is the point of the experiment, not a side effect.

---

## 1. The summon primitive — solved, and it had a trap

A voronoi cell is the intersection of half-spaces, one per neighbour. So **a
cell's faces are its bisectors, and its face normals are its neighbour
directions.** To summon a regular solid: put a seed at the centre and one
neighbour along each of the solid's face normals — which are the vertices of
its dual.

| solid | faces | neighbours needed | dual |
|---|---|---|---|
| tetrahedron | 4 | 4 | itself |
| cube | 6 | 6 | octahedron |
| octahedron | 8 | 8 | cube |
| dodecahedron | 12 | 12 | icosahedron |
| icosahedron | 20 | 20 | dodecahedron |

**The trap, measured rather than guessed.** foam's metric is anisotropic —
`foamworld.js` weights vertical distance by `aniso` (2.2) so grade stays a
meaningful discriminator. Under `M = diag(1, aniso, 1)` the bisector between
the centre and a neighbour `n` is still a plane, but its normal is **M·n, not
n**. Place the constellation the obvious way — unit directions × a common
radius — and every off-axis face comes out **22° wrong**.

A cube survives, because axis-aligned normals are the only ones `M` cannot
rotate. That is the worst possible outcome: the first solid anyone tries is the
cube, it looks perfect, and the bug waits in the second one — where it presents
as "voronoi cells just aren't regular", which is false and is exactly the kind
of wrong general conclusion the loop exists to stop being drawn twice.

The fix is one line of algebra. For face normal `û` at inradius `r`:

```
    n = 2r · M⁻¹û / (ûᵀM⁻¹û)        ûᵀM⁻¹û = ux² + uy²/aniso + uz²
```

Implemented in [`solids.mjs`](solids.mjs), exact to floating point for all five
solids at every `aniso` tested. [`test/solids.selftest.mjs`](test/solids.selftest.mjs)
pins it — **and requires the naive placement to still fail**, because a check
that only proves the cube is a check that proves nothing.

Two bugs were found writing that selftest and both are worth keeping in mind
for anything that verifies geometry here: `Math.acos(a·b)` is ill-conditioned
near 1 and reports ~1.2e-6° of pure noise for exact vectors (use
`atan2(|a×b|, |a·b|)`), and a verifier that grades against the wrong reference
reports a 36° error for a 36° yaw — **a checker that fails correct work is
worse than no checker, because it retires a mechanic that was fine.**

---

## 2. The oracle stack

This is why foam is the loop's target: **most of the judge already exists**, and
none of it is a model's opinion.

| # | Gate | Status |
|---|---|---|
| 1 | determinism — `(seed) → identical pocket` | **built** (`foamworld.selftest.mjs`) |
| 2 | watertightness — per-cell Euler V−E+F=2, volumes sum | **built** |
| 3 | macro solvability — the walk certificate, par in band | **built** (`generatePocket` refuses unproven pockets) |
| 4 | **solid fidelity** — a summon produced the solid it claimed | **built** (`solids.mjs` `verify()`) |
| 5 | **production feasibility** — the recipe system is satisfiable | to build (§3) |
| 6 | **the build certificate** — a legal order exists (§4) | to build — *the hard one* |
| 7 | frame budget on mobile | discipline exists; needs a per-turn number |

Layers 1–4 already run in seconds with no model and no human. That is the floor
the loop cannot fake its way past.

---

## 3. Production is algebra, and that makes it decidable

Sources emit at a rate. Processors consume inputs and emit outputs at a rate.
Sinks demand. A factory is a flow network, and **"is this puzzle satisfiable?"
is a feasibility question over a small non-negative linear system** — solvable
exactly, cheaply, with no search and no heuristics.

That gives layer 5 for nearly free, and it gives the designer a dial: the
*margin* by which a recipe set is satisfiable is a difficulty measure, the same
way `parMin`/`parTarget` band the walk today.

---

## 4. The hard part — the build certificate

This is where the turns will actually go, and it is genuinely hard rather than
laboriously long.

`generatePocket` today proves: *a walk exists from start to target.* The
factorio version must prove:

> there exists an **ordered sequence** of walks and summons such that every
> summon is legal at the moment it is attempted, the walker can reach each site
> **given the lattice as it stands at that point**, and the finished production
> graph meets demand.

The difficulty is that **the actions mutate the state space they are searched
over.** Summoning reforms the lattice — `reformPocket` re-derives the whole nav
graph — so placing an object can open a route, or close one, or strand the
walker. That is a planning problem over a self-modifying graph, and it is a real
computer-science problem rather than a content problem.

Consequences that fall straight out and should be designed for, not discovered:

- **Generation must search build plans, not just salts.** `generatePocket`
  retries `maxSalt: 24` seeds until a walk certificate exists. The factorio
  generator must retry until a *plan* exists, and that search is orders of
  magnitude larger.
- **Legality is a predicate, not a try-and-see.** `reformPocket` already refuses
  a seed within 1.5 (anisotropic) of an existing one, so a constellation needs
  clear space — `clearanceNeeded()` makes "can I build here?" decidable in
  advance. Needing clear ground to place a factory is the oldest rule in the
  genre; the constraint is the mechanic.
- **A whole constellation must land atomically.** `reformPocket(pocket, point)`
  inserts *one* seed. A half-inserted dodecahedron is not a dodecahedron, so
  the multi-insert must be all-or-nothing with a single closure-and-nav gate at
  the end — not `n` sequential calls.
- **Par generalises.** Today par counts breaches. It becomes a cost over
  breaches + summons + distance, and the puzzle band moves with it.
- **Cost grows with every object.** A dodecahedron is 13 seeds. Ten of them is
  +130 against a base pocket of ~294, and `buildComplex` runs on every summon
  while the mobile frame budget is a hard requirement. Rich factories and
  performance pull against each other, and that tension is real work.

---

## 5. What the audience is for

The machine judges **valid**. Strangers judge **good**. Neither is asked to do
the other's job — which is exactly where model-as-judge goes wrong, and why
this target dissolves the tension between "needs an oracle" and "needs an
audience".

The measurement is **pairwise preference between consecutive turns' output**:
serve turn *N*'s pocket and turn *N−1*'s, randomised order, ask which was
better. That builds a ladder over turns, and **the ladder is the curve** — the
programme's question ("does turn 20 improve on turn 19?") asked literally,
with no rubric anywhere.

Seeded generation is what makes this possible: two generator versions produce
genuinely comparable artifacts from the same seed.

Risks that are about distribution, not engineering, and must be measured before
anything is built on them:

- **Traffic.** A ladder needs N. If foam draws five visitors a week it never
  resolves, and the programme stalls on an audience problem wearing an
  engineering costume. Phase 0 is: ship the comparison against two *hand-made*
  variants and count whether strangers vote. A negative result there ends the
  programme for no model spend, which is the best kind of phase.
- **Order effects.** Randomise, record the order, and check the control: if
  position predicts preference better than version does, the signal is noise.
  `packages/pressure-lab` already encodes this discipline — `spread()` *requires*
  a control policy and warns when nothing beats it.
- **Latency.** Automatic gates settle per turn; the ladder settles over days.
  The append-only ledger makes retroactive scoring free, but note the live
  consequence: `loop-tick`'s `trend()` skips non-numeric scores, so **the
  plateau brake is inert until the ladder has data**, and the hard stop plus the
  daily budget are the only live brakes early on.

---

## 6. The publication constraint

`deploy-foam.yml` is branch-locked to `claude/voronoi-foam-interactive-keo0uy`.
The loop runs on its own branch, so **a loop commit under `foam/**` deploys
nothing** — verified with `scripts/loop-blast-radius.mjs`, which reports no new
listener when `foam/**` is added to the loop's writes.

This is the right shape and should stay: **a human merge is the publication
step, so a human decides what strangers see.** It is also a real constraint on
feedback latency, and it is the reason the audience ladder cannot be part of the
per-turn gate.

---

## 7. Open, and the operator's call

1. **How strangers vote, and where it is stored.** `atpolls-db` exists with 8
   dependents; `poll` already does anonymous voting properly. Reusing it buys
   infrastructure and buys blast radius — deliberate coupling is wanted
   (CLOSED-LOOP §11.1), accidental coupling is not.
2. **Whether defenses imply an adversary**, and therefore whether this acquires
   a real-time combat loop. That changes the certificate from a plan to a
   strategy, and it is a much larger commitment than the other three object
   kinds.
3. **How far the campaign structure bends.** Pocket *N* links to *N+1* today; a
   factory that persists across pockets is a different game from one that does
   not.
