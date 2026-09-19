# arm — a six-axis bench arm that pours a can, for cad.mino.mobi

A counterweighted parallelogram arm, bench mounted, built ground up to pick a
330 ml can off the bench and pour it into a glass. 250 + 250 + 60 mm of arm on
a 400 mm column; five joints, and the sixth axis is the **gripper's own roll**
rather than a wrist joint — J6 was killed once it was clear the tip is a tool
roll and the gripper already has one.

`arm/robot` is the whole machine as a real hierarchy: a **shoulder** carrying a
**wrist** carrying a **gripper**, six levels deep, 83 components, 20.05 kg. The
gripper arrives whole from [`../gripper`](../gripper) — imported, not copied,
so there is one gripper in the repo and one in the record graph.

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

It costs 6.6 kg of steel to balance a 345 g can. That is the honest price and
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

Worst margin: **20.0° at "lift away"**, folding to −99.2° against −119.2°.
It was 5.3° before the pocket — the whole gain is 54 mm off the tool, at a
measured rate of **0.27° per mm**.

Levers, if more is ever wanted:

| lever | from → to | margin |
|---|---|---|
| — | as it stands | 20.0° |
| forearm L2 | 250 → 220 | 26.1° |
| shoulder | z 400 → 430 | 21.8° |
| forearm L2 | 250 → 280 | **13.1°** — longer is *worse* |
| the glass | r 497 → 537 | free, until the *can*'s own waypoints bind |

The last row is the one a workcell designer reaches for first: the arm folds
because the work is **close in**. Reaching further out unfolds the elbow.

## The tool interface: the wrist swallows the motor

The gripper's actuator sits **behind its own mounting face** — a NEMA 17
external linear stepper, 48 mm of stack, whose shaft is the Tr8×2 screw. So a
tool flange either sits behind the motor, or the wrist swallows it.

It used to sit behind: a `tool-adapter` cup reaching back past the motor's end,
**54 mm of tool length and 360 g at the very tip**. Now the blade has a **44
square pocket, 48 deep**, running back from its own flange face, and the motor
lives in it. The adapter and the separate `tool-flange` are both gone; the
blade carries a Ø110 disc on its nose with four M3 on the gripper's own r 48.5
housing circle, which is the circle the adapter already used. **What was
deleted is the cup, not the interface.**

ISO 9409-1-50-4-M6 is a second, independent blocker — four M6 on a Ø50 circle,
r 25, against a 42.3 square motor whose half-diagonal is 29.9 — but it never
was the one that cost the 54 mm. An unbounded bolt circle saves the 6 mm base
plate. **The motor is what is in the way.**

What the pocket cost, honestly: the slot grew (blade 50 → 54, fork gap 54 → 58,
cheeks 12 → 10 so the belt plane did not have to move — it cannot, it has
0.7 mm on the drum bore), and **j5's limit is no longer a round number**. The
Ø110 disc swings back into the roll drum at a steep pitch: clean at −91°,
156 mm³ at −92°, measured. ±88°, which still leaves 13° over what the pour
asks. Unlike the elbow fold, a joint box *can* express this one, so the wrist
grid tests that corner every run.

The pocketed section carries J5's continuous 5.57 N·m at **0.25 MPa**. It costs
nothing structural.

## The wrist camera, and what it cannot see

`cam-pod` and `camera` ride the **blade**, so they pitch with the tool and the
hand-eye transform is a constant rather than a function of pose. Three measured
facts set every dimension of it:

1. **It cannot see the grip point, and no wrist mounting can.** The gripper is a
   Ø104 body 86 mm long starting 6 mm in front of any wrist-mounted lens, and
   the grip point is on its axis 33 mm past its end. For a sightline to clear
   it, the lens would have to sit at **r > 230** from the tool axis, or forward
   of the gripper's own front. Neither belongs on a wrist. **The camera that
   watches the jaws belongs on the gripper**, and that is a v11 job.
2. **Looking down it is completely clear**, because it sits *behind* the tool.
   A ray leaving the lens within **62° of straight down** is out of the Ø104
   cylinder before it reaches the tool's nose; a 102° lens is ±51°. So the
   bench under and ahead is unobstructed and the arm is in look-then-move: it
   sees the can until the last 60 mm of descent.
3. **Its size is set by the swept circle, not by the sensor.** The wrist sweeps
   Ø118 because the J5 motor lies crosswise inside the drum, and that was
   expensive. A 25 mm Pi Camera Module 3 takes it to Ø136. A 16 mm square board
   camera costs Ø5 — Ø123.4 fitted. The requirement is the envelope; the
   catalogue has several parts that meet it.

The pod is an L: an arm outboard of the fork cheeks (y > 39, so no pitch can
reach one) reaching forward to a foot that bolts to the disc's rear face. The
foot starts at x 48 because everything on the blade sweeps r = hypot(x, z)
about the pitch axis and the fork reaches r 43 — the same circle that sizes the
blade. 31 g of bracket, 12 g of camera.

## Files

| | |
|---|---|
| `arm.mjs` | the design: every part as a parametric tree, the hierarchy, the closed-form FK and IK, the pour solved in task space, the balance, the BOM and 44 analytic checks |
| `parts/*.json` | the part trees, as generated |
| `arm.json` / `arm-pour.json` | the arm with real inputs; the same arm performing the pour on one clock |
| `arm-wrist.json` | the forearm through the flange face, camera and all — j4 × j5 at their corners, and this one IS a gate |
| `arm-robot.json` / `arm-robot-pour.json` | the whole machine, gripper fitted: seven axes, or all seven on one clock |
| `fold.mjs` | **where does this arm hit itself?** A bisection against the kernel, per j2, and the pour measured against the result. Six minutes on the whole machine, so it runs in the parallel job |
| `fold-map.json` | its output — the measured boundary. The audit consumes it; CI re-measures and fails if it has moved |
| `cam-pod` / `camera` | the wrist camera, on the blade — see above for what it can and cannot see |
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
