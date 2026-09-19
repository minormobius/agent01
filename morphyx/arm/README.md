# arm — a six-axis bench arm that pours a can, for cad.mino.mobi

A counterweighted parallelogram arm, bench mounted, built ground up to pick a
330 ml can off the bench and pour it into a glass. 250 + 250 + 60 mm of arm on
a 400 mm column; five joints, and the sixth axis is the **gripper's own roll**
rather than a wrist joint — J6 was killed once it was clear the tip is a tool
roll and the gripper already has one.

`arm/robot` is the whole machine as a real hierarchy: a **shoulder** carrying a
**wrist** carrying a **gripper**, six levels deep, 85 components, 50 distinct
parts. The gripper arrives whole from [`../gripper`](../gripper) — imported,
not copied, so there is one gripper in the repo and one in the record graph.

Designed from the live site alone, by an agent, through the site's own doors:
the docs page, `SKILL.md`, the bench trees, the `/mcp` server and the tangled
mirror.

## What the architecture buys

**The parallelogram makes gravity two independent 1-DOF problems.** The J3
crank is coaxial with J2, so the push rod delivers the forearm's whole moment
to it 1:1. Load and counterweight then both go as the cosine of the *same*
angle, so the residual is the same fraction at every pose — 20% by choice,
under-balanced so a power cut settles the arm downward. That is a property a
spring cannot give, and it is checked across the range rather than at a point.

It costs 7.3 kg of steel to balance a 345 g can. That is the honest price and
the BOM shows it as the largest line on the machine.

## Where it hits itself, and how we know

The forearm folding back onto the upper arm is inherent to an articulated arm.
The real constraint is on the **included elbow angle** j3 − j2, and a box of
independent inputs cannot express that: any box that contains the pour also
contains the collision. So the joint-box grid is **a report, not the gate** —
the trajectory is the gate, which is the position every real articulated arm is
in, its controller carrying a self-collision map.

For six commits the audit carried a single guessed number for that boundary,
`FOLD_LIMIT = -118`, bracketed at two points. **It is not a number — it is a
curve**, and with the gripper fitted the thing the tool reaches below j2 = 10 is
not the upper arm at all but the **base plate**, 190 000 mm³ deep rather than a
2 500 mm³ corner graze. `fold.mjs` bisects the real boundary against the exact
kernel, per j2, and writes `fold-map.json`; the audit reads that map and checks
the pour waypoint by waypoint, against the boundary at *that waypoint's own* j2.

Worst margin: **5.3° at "lift away"**, folding to −113.9° against −119.2°.

Levers on that margin, measured rather than guessed — the rate is about
**0.27° per mm of tool**:

| lever | from → to | margin |
|---|---|---|
| — | as it stands | 5.3° |
| tool length | 181 → 127 mm (the adapter deleted) | 20.0° |
| forearm L2 | 250 → 220 mm | 9.9° |
| forearm L2 | 250 → 280 mm | **0.9°** — longer is *worse* |
| shoulder | z 400 → 430 | 8.6° |
| both | tool 127 and L2 220 | 26.1° |
| the glass | r 497 → 537 mm | 15.5°, and free — then the *can*'s own waypoints bind |

The last row is the cheapest of all and the one a workcell designer reaches for
first: the arm folds because the work is **close in** — r 497 of an 801 mm
reach, 62% extension. Reaching further out unfolds the elbow.

## The tool interface, and what it really costs

The gripper's actuator sits **behind its own mounting face** — a NEMA 17
external linear stepper, 48 mm of stack, whose shaft is the Tr8×2 screw. So any
tool flange must either sit behind the motor (today's `tool-adapter` cup: 48 mm
of motor plus a 6 mm base = **54 mm of tool length and 360 g at the very tip**)
or the wrist must carry a Ø60 × 48 pocket to swallow it.

ISO 9409-1-50-4-M6 is a *second*, independent blocker — four M6 on a Ø50
circle, r 25, against a 42.3 square motor whose half-diagonal is 29.9, so the
standard's bolts land inside the motor — but it is not the one that costs the
54 mm. Even an unbounded bolt circle saves only the 6 mm base plate. **The
motor is what is in the way.**

It also cost 0.7 kg of counterweight that nobody was carrying: the adapter is
an **arm** part and the balance's tip mass was a list of **gripper** parts, so
360 g at the end of the longest lever on the machine fell through the gap
between two sets of honest numbers. It is in `mTip` now, and the counterweights
went 6.62 → 7.31 kg.

**Swallowing the motor in the wrist looks credible and wants a pass.** A 44
square pocket, 48 deep, running from the blade face at 60 to 12 mm short of the
pitch axis; the blade grows 50 → ~56 thick and the fork gap 54 → 60, which puts
the fork's outer width at 84 against the drum's Ø110 bore — it fits. The catch
is the bolt circle: the pocket's half-diagonal is 31, so the flange bolts must
move out past it onto a ~Ø72 circle, and the blade's tip face has to grow to
about 85 across to hold them. That is a non-standard flange, which this machine
is forced into anyway. It buys the whole 54 mm and the whole 360 g.

## Files

| | |
|---|---|
| `arm.mjs` | the design: every part as a parametric tree, the hierarchy, the closed-form FK and IK, the pour solved in task space, the balance, the BOM and 29 analytic checks |
| `parts/*.json` | the part trees, as generated |
| `arm.json` / `arm-pour.json` | the arm with real inputs; the same arm performing the pour on one clock |
| `arm-wrist.json` | the forearm through the tool flange, on its own — j4 × j5 at their corners |
| `arm-robot.json` / `arm-robot-pour.json` | the whole machine, gripper fitted: seven axes, or all seven on one clock |
| `fold.mjs` | **where does this arm hit itself?** A bisection against the kernel, per j2, and the pour measured against the result. Six minutes on the whole machine, so it runs in the parallel job |
| `fold-map.json` | its output — the measured boundary. The audit consumes it; CI re-measures and fails if it has moved |
| `verify.mjs` | the document posed against `fk()`; the gripper standalone against the same gripper four levels deep; and frame independence — displace a sub-assembly and assert every descendant moves rigidly |
| `anchor-bug.mjs` | the minimal repro for the platform's nested-anchor bug (fixed 2026-09-19), kept as a gate |
| `publish.mjs` | writes the parts and the documents into the morphyx repo; resolves the gripper's parts off `gripper/parts/` rather than republishing copies |
| `../../.github/workflows/cad-arm.yml` | build exact, the trees match the generator, the trajectory sweeps (the gates), the BOM, publish, then audit the published corpus |

## Reading the gates

- **The trajectory sweeps are the gates.** `arm-pour` at 32 instants and
  `arm-robot-pour` at 24 are what has to be clean.
- **The joint-box grids are reports.** They contain the fold region by
  construction; a warning there is expected and named as such.
- **`verify.mjs` and `anchor-bug.mjs` are gates.** They are what stands between
  a document that resolves and a document that is *right* — the 85-component
  "no interference" pass that turned out to be false is why they exist.
