# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 9: two pillars, and no flange plate. A NEMA 17 linear stepper
bolted to the outside of a motor plate, an 88 × 44 × 48 mm frame ahead of
it, and the jaws outside that. The frame is two plates — the motor plate
and the rail plate — held apart by **two Ø10 pillars** on the grip plane at
x ±24, with an M8 end each. The pillars are the load member: their threads
take the grip tension, their shoulders take the compression, and each one
pierces its pivot arm so it is also the plunger's alignment rail and its
anti-rotation. Two 4 mm side walls stiffen the frame in torsion and shear.
The rail plate carries the MGN9 rail on its outer face; the links pass out
through its two slots and pin onto 32 × 22 × 8 jaw plates, which meet on
the centre line at closed. Mount centres 32 → 62 mm. Seventeen parts, two
documents. Versions 1 to 8 are the earlier revisions of the same files.

The tool interface is deliberately absent. v8's flange plate carried
nothing and cost 14 mm; the robot mount belongs on the motor plate, which
is the plane the load actually passes through, and it is not drawn yet.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`,
`gripper/stroke`), written by the `cad gripper` workflow. It was designed
from the live site alone, by an agent, through the site's own doors: the
docs page, `SKILL.md`, `README.md`, the bench trees, the `/mcp` server, and
the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the kinematic assembly, the force curve, the moment audit, the clearance audit, closed forms |
| `parts/*.json` | the nineteen part trees, as generated |
| `gripper.json` | the demo cycle: a reference clock drives a cosine, so the viewer's spin closes and opens once per turn |
| `gripper-stroke.json` | the physical stroke: the screw driven at rpm, a `screw` mate carrying the carriage and the nut by the lead |
| `expected.json` | closed-form volumes for every part |
| `publish.mjs` | writes parts then both assemblies into a repo; idempotent; retires superseded parts under `gripper/v<n>/` |
| `../../.github/workflows/cad-gripper.yml` | build exact, closed forms, a 24-instant interference sweep of both documents (the gate), the clearance table, publish on request, then audit the published corpus |

## How cad.mino.mobi works, for the next agent

- **The model is a JSON feature tree**; geometry is a cache. Params are
  expressions, sketches are closed loops on a plane, regions are even-odd (a
  loop inside a loop is a hole), an extrude or revolve sweeps a region. Faces
  come out **named** (`bracket.pilot[0]`, `slider.railA[0]`) with exact
  geometry (a cylinder's axis and diameter, a plane's normal).
- **Two kernels.** Manifold previews in milliseconds, always builds. Truck
  builds exact — and fails or leaks open edges on most booleans. Probed again
  on 2026-09-12 for v5: a Ø4 hole cut through a plain rectangular bar is
  watertight; the same hole through a polygon outline, or a bar with one
  extra loop, leaks 4 to 72 open edges. Since 2026-09-14 a boolean **keeps**
  the face names (a surviving face keeps its feature's, a face the tool made
  carries the tool's loop name), which is new and good — but see *What the
  2026-09-14 platform pass did and did not reach* below before relying on it.
  **Rule followed here: every part is
  exactly one sweep of one outer loop with holes.** Joints that need holes
  in two directions are split along real part lines and fixed-mated: the
  carriage is two plates so that neither needs a pocket (a 10 mm key plate
  notched open to each side, and a 4 mm back plate the arms bottom on); the
  rail lies flat so the block's bolts, the link pin and the tenon's
  cross pin all run along Z and the slide is one sketch.
- **Assemblies** are components with placements (`at`, `rotate`), `params`
  overrides that make distinct builds, `gear` and `fixed` mates, and one
  `drive`. Kinematics rotate about local Z only, and **placements are
  expressions**: an assembly carries `params` and `derived`, resolved at
  each instant with `t` (seconds) and `theta` (the driven component's angle,
  degrees) in scope, so the pose math for a screw, a slider or a closed
  loop lives in the document. A sub-assembly keeps its own scope.
  `rotate: {axis:[1,0,0], deg:-90}` points a part built along Z down the
  +Y screw axis. Mind `deg(x)` (degrees → radians) versus `rad2deg(x)`.
- **Three doors.** `/mcp` (no files: `check`, `build`, `measure`, `step`,
  `list_files`, `get_file`; no interference, no write); the 4 MB mirror
  (`git clone https://tangled.org/morphyxmino.bsky.social/cad`; node 22 only:
  `agent/build.mjs`, `check.mjs`, `render.mjs`, `drive.mjs`); the viewer.
  Files are ATProto records: a `part` head over immutable `revision`s, in
  the designer's own repo; anyone opens by AT URI and forks with lineage.
- **Report what `watertight` and χ say, not what the picture looks like.**

## Why v9: the frame follows the load

v8 put the grip tension in two side walls and an ISO tool flange on the
back of the whole assembly. Both were wrong. The flange plate carried no
grip load at all — it sat behind the motor and added 14 mm — and the side
walls were carrying tension in bending-prone 6 mm plate, far from the line
the load actually travels along.

v9 deletes the flange and rebuilds the frame around the load path:

1. **The cavity is exactly what the two plates imply.** Motor plate at
   y 22…28, rail plate at 64…70, 36 mm of cavity between them, all of it
   swept by the plunger. Nothing behind the motor plate but the motor.
2. **Two pillars are the structure.** Ø10 bodies on the grip plane z = 0 at
   x ±24, with an M8 end each. Each threads into the rail plate ahead and
   passes through the motor plate behind, where a nut on that plate's
   **inner** face takes the tension — grip pulls the pillar forward and the
   plate back, so that nut is exactly the load path, and nothing protrudes
   behind the plate to foul the motor's 42.3 square. The shoulder takes the
   compression. They sit on the plane the grip
   force acts in, so the frame sees no moment from carrying it.
3. **Each pillar pierces its arm.** The arm has a Ø10.2 bore at x 24 and
   slides on the pillar. That is the plunger's alignment rail and its
   anti-rotation, and it replaces two things that were doing the job badly:
   the arm tips rubbing the side walls, and (before v8) a skid on the floor.
4. **The side walls drop to 4 mm** and do what they are good at: torsion
   and shear.

| | v8 | v9 |
|---|---|---|
| frame envelope | 92 × 44 × 84 | 88 × 44 × 48 |
| frame volume | 340 cm³ | 186 cm³ |
| motor back to jaw face | 104 mm | 90 mm |
| parts | 18 | 17 |
| grip load member | two 6 mm side walls in tension | two Ø10 pillars on the load plane |
| plunger alignment | arm tips on the side walls | the pillars, through the arms |

The kinematics are untouched: 40 mm links, pivots at x ±34, jaw pins 5.5 mm
from each plate's inner edge, 15 mm of travel per jaw, 61 N at each jaw at
closed with 120 N of thrust.

## The grip load path

The links are struts in compression during grip: they push the jaws inboard
against the object and forward against the rail, and push the carriage back.
So the rail plate is pushed forward, away from the frame, and the motor
plate is pushed backward, and the frame between them is in tension at about
the screw thrust.

| member | what it carries | how |
|---|---|---|
| **carriage** (2 plates) | thrust, nut → arm | the nut flange bolts to the back plate's rear face and each arm's back face bears on its front face, so the thrust crosses one Y-normal joint in pure compression; the notched key plate ahead of it only locates the arms in X and Z |
| **pillars** (×2) | the whole grip tension, and compression on the return | M8 into the rail plate ahead, an M8 nut on the motor plate's inner face behind, Ø10 shoulder between; on the grip plane, so no moment |
| side walls (×2) | torsion and shear | 4 mm, bolted to both plates |
| motor plate | the screw's thrust, via the collar bearing on its inner face | the plane the load passes through, and where the tool interface belongs |
| rail plate | the jaws' forward push, via the rail | tapped for the pillars, bolted to the walls |
| lid, floor | nothing | 2 mm covers |

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward
the fingers), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the
back face of the motor.

```
  −26–22   NEMA 17 external linear stepper, 48 mm stack, outside; the pillars' nuts either side of it at x ±24
  22–28    motor plate: the pilot and 4 × M3 outside, the thrust collar inside, Ø8.4 for the pillars
  28–64    the cavity, 36 long — all of it swept. Two Ø10 pillars span it at x ±24, z 0
  28–32    thrust collar Ø14, bearing on the motor plate's inner face
  37–61    carriage sweep (4 mm back plate + 10 mm key plate), hanging on the nut, its arms running on the pillars
  yn+4     arm pivot pins at x ±34, z ±17; the arms are 22 thick and the links seat on their faces
  64–70    rail plate, 98 wide: a slot each side at z ±(10.6…17.4); the screw's blind bore and the pillars' taps at the centre
  70–76.5  MGN9 rail on the OUTER face, 95 long (catalogue), closing the bore and the taps
  72–82    MGN9C blocks; the links pass over and under them at z ±11…17
  82–90    jaw plates, 32 × 22 × 8
```

| jaw pin x | plate centre | nut y | link angle | mount centres |
|---|---|---|---|---|
| 5.5 (closed) | 16 | 54.0 | 45.4° | 32 |
| 13 | 23.5 | 48.6 | 31.7° | 47 |
| 20.5 (open) | 31 | 44.4 | 19.7° | 62 |

## What the 2026-09-14 platform pass did and did not reach

Seven things were asked for and seven shipped. Verified here against a fresh
mirror clone, each with the experiment that failed before:

| asked | verified |
|---|---|
| a boolean must not strip face names | the arm carries a cut and now names `arm.pivot[3]`, `borecut.pillar[1]`, `arm.outline[*]`, `arm.start/end` |
| a fixed mate must not excuse unlimited shared volume | 1344 mm³ between two fixed-mated plates now fails, naming its 2.769 mm³ budget; the v9 462 mm³ bug would have been caught |
| the MCP `build`'s `ok` must mean what the CLI's exit code means | a leaky tree is `ok: false, built: true, open_edges: 16`, with a note pointing at `through: true` |
| `fits` must pair by index | the 83 enumerated fits here became 31 with `[*]` and `over`, and the clearance table is identical (569 clear, 0 failures). A fit naming a missing component is an error |
| a sub-assembly's mates must reach the top | `drivetrain/screw × drivetrain/collar` is an expected touch with the top-level workaround fit deleted |
| `ok` must not be false merely because a window is unfinished | with nothing wrong and no warnings: `ok: true, done: false`. `cost` now gives work per instant against the budget and an estimate at each `res` |
| a cut that misses its body must say so | *"the cut tool does not meet the body — it is 155.900 clear of it along x (tool x 194.900…205.100, body x 9.100…39.000)"*, plus the XZ sign rule |

Three things this design ran into afterwards, all reported:

1. **The double-driven warning is over-broad, and it fails the build.** It
   fires on any mated component placed over `t`/`theta`, whether or not the
   mate carries motion. Posing all 37 components with every mate deleted
   gives byte-identical matrices at five instants in the cycle document — of
   36 mates, **none** moved anything; in the stroke document exactly five
   did. So all 28 warnings were false, and `warnings.length` alone forces
   `exit 1`, with no flag to downgrade it.
2. **The volume instrument still marks an expected touch from mates only.**
   A pair declared `contact: true` in `fits` is honoured by the clearance
   instrument and ignored by the volume one. With (1), that is a vice: keep
   the mates and the warning fails the run; move them to fits and the volume
   gate fails on the same touches.
3. **`through: true` is Truck-only.** With it the arm is 5486.69 mm³ and
   watertight in Truck and **6303.31 mm³ in Manifold** — the bore is simply
   not cut — and both kernels report `ok, watertight`. The interference
   sweep runs on Manifold, so it saw the arm solid and the pillar 785 mm³
   inside it. Reverted to the hand-tuned overhang; the two kernels agree
   again to 1.5 mm³ of discretisation.

Two smaller ones: face names survive a boolean but the **assembly** resolver
only knows each face's first name, so `@arm[i].pivot[3]` still fails where
`measure` on the part succeeds — which is why the pins are still placed by
expression; and the bracket index is not stable across a mirrored variant
(`side: 1` → `arm.pivot[3]`, `side: -1` → `arm.pivot[2]`, same tree), so an
`{"op": "name"}` alias written for one builds and the other does not.

**What this design changed in response.** Mates now carry motion and `fits`
declare intent — five mates in the stroke document, none in the cycle one,
and 42 fits in the compact form with `interfere` budgets on the two real
press fits. The workflow's gate reads `volume > limit` off `--json` rather
than the exit code, because of (1) and (2); `limit` is the platform's own
budget, so the gate is stricter than the old one, not looser.

## Probe: can we build a planetary? (2026-09-14)

Ahead of v10 — grip-and-rotate, with the pillars as the torque fork and a
planetary differential behind the motor plate. The question was whether the
platform can make an internal ring gear. Short answer: not with the `gear`
op, but yes if you draw it, and [`ringgear.mjs`](ringgear.mjs) does.

**What the `gear` op can and cannot do.** `{op: 'gear', id, m, z, alpha?, b,
bore?, plane?}` builds an external spur gear: exact involute flanks as
Béziers, true arcs at tip and root, and a face name per flank
(`sun.tooth[0].flank.r.1`, `sun.tooth[0].tip`). It is fast and clean — m1
z54 with a bore is 262 ms, χ 0, watertight. But `z` is a `u32`, so a negative
tooth count is refused; there is no `internal` flag; and the op has no
`mode`, so it cannot be a cut tool. **An `internal: true` key and a
`mode: "cut"` key are both accepted and silently dropped** — the same tree
builds either way, byte for byte, which is how an hour went missing.

**Drawing it instead.** An internal gear's tooth *space* is an external
gear's tooth: same base circle, same involute, same phase, same thickness at
the pitch line. Only the tip and root radii swap. So the ring is one closed
`path` — four segments a tooth, 216 for z54 — placed as the inner loop of a
disc. One sweep, no boolean: **330 ms, χ 0, watertight in Truck and in
Manifold**, volumes agreeing to 0.15%.

Two things cost the afternoon, and both are in the module's header:

- **Rounding the coordinates leaks the solid.** `toFixed(6)` — a nanometre on
  a 30 mm radius — takes the same loop from χ 0 to χ −165. The minimal
  reproduction is not a gear at all: a regular N-gon extruded 6 mm is
  watertight in Truck at full double precision for N = 50, 100 and 216, and
  leaks at every one of them rounded to six decimals. Rounded, it is also
  erratic in N and in scale: N = 40 ✓, 41 ✗, 46 ✓, 47 ✗, 48 ✓, 50 ✗ at r 30,
  and N = 50 passes at r 60 while failing at r 5, 15 and 30. Whatever Truck
  matches edges with is tighter than 1e-6 mm. The engine's own `gear_loop`
  never trips it because it never goes through JSON.
- **`spline` segments leak even at full precision** (χ −16 on the same ring),
  so the flanks are cubic Béziers interpolating the involute at t = 0, ⅓, ⅔
  and 1.

**Meshing it.** Probed on a z54 ring and a z18 planet, clean through 48
instants of a full turn:

- the centre distance is `(z_ring − z_planet) · m / 2` — the difference;
- **the `gear` mate's auto-phasing is external-only.** It offsets the
  follower by half a tooth; an internal mesh wants none. Left to itself the
  teeth overlap 41.6 mm³ at every instant. Give the planet `phase: 0`;
- **a negative tooth count reverses the mate**, which is what an internal
  mesh needs. The mate computes `−θ · za / zb`, so `zb: -18` gives `+3θ` for
  a z54 ring. It is undocumented and it works; the wrong sign clashes
  41.5 mm³, so the test has teeth.

`node ringgear.selftest.mjs` checks all of it and `--write <dir>` emits the
three trees the numbers came from.

**Still missing for v10, and not worked around:** one `drive` per document
and no revolute mate — both being fixed upstream — and the `gear` mate is
fixed-centre with no carrier term, so an epicyclic's Willis relation cannot
be written as mates. The planets will be placed by expression.

## Bill of materials: buy, cut, machine, print

Nine of the nineteen trees are stand-ins for catalogue parts. The model now
carries the catalogue's numbers, not round ones — the MGN9 rail is 95 long
because 95 = 4 × 20 + 15 is what the 20 mm hole pitch allows, and the dowels
are 36 because 34 is not a stock length.

| # | part | buy this | notes |
|---|---|---|---|
| 1 | motor + screw | **NEMA 17 external linear stepper, 48 mm stack, 1.68 A, Tr8×2** (StepperOnline 17E19S1684AF2-200RS) | see below — lead 2 is only offered on the 48 mm stack |
| 2 | nut | commodity **T8 / Tr8×2 brass flange nut**: Ø22 flange × 3.5, Ø10 body, 15 long, 4 × M3 on Ø16 PCD | exactly the modelled part; an anti-backlash version is a drop-in |
| 3 | rail | **MGN9 rail, 95 mm, special end distance E = 12.5** | P = 20 is fixed by the catalogue; E is the configurable half |
| 4 | block ×2 | **MGN9C** | L 28.9, W 20, H 10, H1 2, M3 × 3 deep on a 10 × 15 pattern — the modelled block, to the millimetre |
| 5 | bushing ×8 | **igus JSM-0406-06** (iglidur J, 4/6/6) or a sintered-bronze equivalent | 3.6 MPa against a 35 MPa limit |
| 6 | pin ×4 | **ISO 8734 Ø4 m6 × 36** hardened ground dowel | 36, not 34: a stock length |
| 7 | pillar ×2 | **precision linear shaft, both ends threaded**, Ø10 g6 hardened, M8 ends (Misumi SFJ family) | length and thread lengths are configured, not machined |
| 8 | collar | a thrust collar for Ø8 — but see the open questions | there is nowhere smooth on a Tr8 screw to clamp one |
| 9 | fasteners | M3, M4 and M8 socket screws, M8 nuts | ~40 in total, half of them holding covers on |

Everything else is made. Nothing in the mechanism needs a five-axis or a
grinder except the rail seat:

| part | qty | stock | process | why not printed |
|---|---|---|---|---|
| bulkhead (motor plate) | 1 | 6 mm 6061 | waterjet outline, drill and tap | two M8 nuts preload it; plastic creeps |
| front-wall (rail plate) | 1 | 6 mm 6061 | waterjet, then **flatten the rail seat** | the MGN9 datum; waterjet taper under a rail is what kills a miniature guide |
| carriage (key plate) | 1 | 10 mm 6061 | waterjet | the notch faces locate the arms |
| carriage-back | 1 | 4 mm 6061 | waterjet | the whole grip thrust crosses this face |
| arm | 2 | 22 mm 6061 bar | mill the profile, ream Ø10 H7 and Ø4 H7 | the only part with two reamed bores on perpendicular axes, and the only running fit we make ourselves |
| carrier (jaw plate) | 2 | 10 mm 6061 | mill, ream Ø4, tap 4 × M4, ream 2 × Ø5 H7 | the customer's interface — its tolerances are the ones that leave the building |
| link | 4 | 6 mm | waterjet, ream the Ø6 H7 eyes | a compression strut with two press fits |
| side-wall | 2 | 4 mm | waterjet — **or printed** | torsion and shear only, no bearing surface: the one structural part that can be printed |
| floor, lid | 1 each | 2 mm | **printed** | covers; they carry nothing by design |

So: two milled parts (arm, carrier), seven flat parts off a waterjet, two
printed covers, nine bought.

### Why the motor got 26 mm longer

The 34 mm stack NEMA 17 external steppers (17E13S…) are only catalogued
with a **lead of 8**. Tr8×8 is four-start: tan λ = 0.36 against µ/cos α ≈
0.26, so it back-drives — the gripper would drop its object when the power
goes. Tr8×2 is single-start, tan λ = 0.091, and **self-locking**. Lead 2
starts at the 48 mm stack, so the motor is 48 long and the whole of that
went behind the motor plate, where the user put it: the case, the cavity
and the mechanism did not move.

The torque check comes out fine: 120 N of thrust on Tr8×2 at µ = 0.25 needs
0.150 N·m, against about 0.44 N·m of holding torque for that motor, and at
5 rpm a stepper gives nearly all of it — a margin near 3.

### The two numbers that bound the design

- **The guide's moment rating, not the linkage, is the limit.** A 61 N grip
  at the assumed 145 mm fingertip is 3.2 N·m of yaw on one MGN9C, against
  its 0.75 kgf·m ≈ 7.4 N·m *static* rating. That is 43% — of a rating that
  is about permanent deformation, not life. Fingertip reach scales it
  linearly, so this is the number to hand the customer with the mount
  pattern.
- **Two pillars and two bores is the classic over-constraint.** Ø10.2 on
  Ø10 leaves 0.1 mm of radial slop, and the chain that has to fit inside it
  is: notch position on the key plate, arm width, bore position, pillar
  spacing across two plates. It will not. The fix is to make the notch the
  loose feature in X — 0.5 mm of clearance at the root rather than 0.1 —
  and let the pillars set X while the notch only drives Y. **Not done yet.**

### Assembly order

Motor to its plate → pillars through it, nuts on the inner face (a socket
reaches in from the side while the walls are off) → arms onto the pillars →
nut onto the screw → key plate slides along Y so the arms enter its notches
→ back plate → four bolts through nut flange, back plate and key plate →
rail plate on, pillars threading into it → links, bushings and arm pins,
which must go in through the wall slots before the side walls → rail, blocks,
jaw carriers, jaw pins → covers.

Two things this order depends on: the notches are open in X **and** through
in Y, so the key plate can be introduced along Y with the arms already
captive on their pillars; and the arm pins go in while both side walls are
off, because at x ±34 there is no access past a wall at ±40.

### Open questions this pass raised

1. **Delete the screw's Ø6 journal and the rail plate's blind bore?** The
   free screw is 48 mm of Ø8: Euler buckling is 172 kN against 120 N, and
   the motor carries thrust on its own bearing. The journal costs a lathe
   op on a stainless rolled screw and a blind bore in the rail plate; the
   bore is also what makes the rail's centre hole position awkward. The v5
   intent — no skew between screw and grip centre — survives without it.
2. **Delete the thrust collar?** It backs up the motor's internal thrust
   bearing, but a Tr8 screw is threaded end to end: there is nowhere to
   clamp a collar without turning a flat. Better to take the motor's rated
   thrust as the ceiling and drop the part.
3. **Line the arm bores.** Aluminium arms sliding on hardened steel pillars
   will gall. Either press an iglidur or bronze liner into each arm (bore
   goes to Ø14 for a 10/14 bush) or hard-anodise. Currently neither.

## Fits and what is not modelled

- Running: the arms Ø10.2 on the Ø10 pillars (0.1 radial, bronze bushings
  not modelled); pins Ø4 in Ø4.1 bushings; nut Ø10 in Ø10.2; screw Ø8 in
  the Ø8.4 nut and the Ø6 journal in the Ø6.2 bore; block 2 mm off the
  plate on the rail; links 0.4 mm inside the rail plate's slots.
- The pillars' threads are modelled at their minor diameter, which is how a
  screw in a tapped hole is normally drawn. The rail plate's holes are the
  tap drill and are blind in practice: the rail covers them, as it covers
  the screw's journal bore.
- The pillar nuts are not drawn. They sit inside the cavity on the motor
  plate's inner face, y 28…34.5, and the arms come no closer than 37.35 at
  the open end. The first v9 push put them behind the plate instead and the
  sweep gate found them buried 27 mm³ in the motor.
- **Two parts carry a cut**: the jaw plate's pin hole and the arm's pillar
  bore. Both drop their part's face names, so both the arm pins and the jaw
  pins are placed by expression rather than by feature.
- Threads, fasteners, cable exit, the motor's D-flat and all fillets are
  not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight
through `/mcp`, each within its closed-form tolerance, including both cut
parts; both documents resolve through the `/mcp` `check` tool (37 and 36
components); the 49 analytic checks in `gripper.mjs`; and the clearance
table on the pillar frame at both ends of the stroke — the arms run on the
pillars at 0.098 mm and nothing else in that group touches.

**Run by the workflow, not from here:** the Manifold volume sweep through
the motion on both documents, and the publish.

**From vendor data, read this session:** the MGN9C dimension table and its
load and moment ratings (L 28.9, W 20, H 10, B 15, C 10, M3 × 3; rail P 20,
E 7.5; C 190 kgf, C0 260 kgf, MY 0.75 kgf·m); the NEMA 17 external linear
stepper catalogue, including that lead 2 starts at the 48 mm stack. Several
vendor pages refused the sandbox (403) or are image-only PDFs — the T8
flange nut's dimensions and the Misumi Ø10/M8 shaft pairing are from the
commodity part and the series description, not from a datasheet I opened.

**Not verified anywhere here:** the pillars'
buckling and the frame's stiffness, both hand calculations away but not
modelled; and the tool interface, which does not exist yet.

## Open it

Published by the `cad gripper` workflow into the morphyx repo,
`did:plc:yivyyp54vddf7qf2lpsikhe4`; the first revisions are v1, the plate-
mounted link gripper:

- **The assembly**, kinematic, parts pinned by revision URI:
  https://cad.mino.mobi/?at=at%3A%2F%2Fdid%3Aplc%3Ayivyyp54vddf7qf2lpsikhe4%2Fcom.minomobi.cad.part%2F3mvbzwq2v2h2f
- **The stroke**, the physical motion under a screw mate:
  https://cad.mino.mobi/?at=at%3A%2F%2Fdid%3Aplc%3Ayivyyp54vddf7qf2lpsikhe4%2Fcom.minomobi.cad.part%2F3mvdwuvpcrt23
- The parts: `gripper/parts/<name>` in the same repo — the files tab lists
  them; `list_files` on `/mcp` with `repo: morphyxmino.bsky.social`; or
  `node agent/drive.mjs ls --at morphyxmino.bsky.social` from the mirror.
  Fork one with `drive.mjs fork <uri> <path>`; the lineage crosses repos.
- Parts inline: `node gripper.mjs --print`, then paste into the viewer's
  tree tab, or take the `link` an `/mcp` `build` returns. Press *spin*.
- Re-publish after a change: push to this branch with `[publish]` in the
  commit message (or dispatch the workflow with `publish` on). Unchanged
  trees are skipped; a changed one becomes one new revision.
