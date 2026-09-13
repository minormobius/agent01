# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 9: two pillars, and no flange plate. A NEMA 17 pancake stepper
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
- **Two kernels.** Manifold previews in milliseconds, always builds, no
  names. Truck builds exact with names — and fails or leaks open edges on most
  booleans. Probed again on 2026-09-12 for v5: a Ø4 hole cut through a plain
  rectangular bar is watertight; the same hole through a polygon outline, or
  a bar with one extra loop, leaks 4 to 72 open edges; and any boolean
  strips every face name to `face[k]`, so a cut part can be neither a
  placement target nor measured by name. **Rule followed here: every part is
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
  0–22     NEMA 17 pancake, outside, with the pillars' nuts either side of it at x ±24
  22–28    motor plate: the pilot and 4 × M3 outside, the thrust collar inside, Ø8.4 for the pillars
  28–64    the cavity, 36 long — all of it swept. Two Ø10 pillars span it at x ±24, z 0
  28–32    thrust collar Ø14, bearing on the motor plate's inner face
  37–61    carriage sweep (4 mm back plate + 10 mm key plate), hanging on the nut, its arms running on the pillars
  yn+4     arm pivot pins at x ±34, z ±17; the arms are 22 thick and the links seat on their faces
  64–70    rail plate, 98 wide: a slot each side at z ±(10.6…17.4); the screw's blind bore and the pillars' taps at the centre
  70–76.5  MGN9 rail on the OUTER face, 93 long, closing the bore and the taps
  72–82    MGN9C blocks; the links pass over and under them at z ±11…17
  82–90    jaw plates, 32 × 22 × 8
```

| jaw pin x | plate centre | nut y | link angle | mount centres |
|---|---|---|---|---|
| 5.5 (closed) | 16 | 54.0 | 45.4° | 32 |
| 13 | 23.5 | 48.6 | 31.7° | 47 |
| 20.5 (open) | 31 | 44.4 | 19.7° | 62 |

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

**Not verified anywhere here:** the MGN9C moment ratings; the pillars'
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
