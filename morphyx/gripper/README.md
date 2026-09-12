# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 5: coaxial. An ISO 9409-1-50-4-M6 tool flange is the rear plate of
a 96 × 54 × 104 mm case. Inside: a NEMA 17 pancake stepper with an integrated
Tr8×2 lead screw, a flange nut in a carriage that the housing itself aligns,
two pivot arms keyed into the carriage, and four 27 mm links on bronze
bushings, one above and one below the mid-plane. Outside: one MGN9 rail
lying flat on a bed just beyond the screw's far bearing, a block each side,
and on each block a one-piece finger slide that runs back through the front
wall to the links and forward to a 16 × 12 tenon the customer's finger
mounts on. The screw axis, the flange centre, the rail's centre line, the
links' plane of symmetry and the tenons share one line. Nut forward closes.
Opening 36 → 0 mm in 7 turns. Twenty-one parts, two documents, every part
one sweep. Versions 1 to 4 are the earlier revisions of the same files;
their retired parts live under `gripper/v1/` … `gripper/v4/`.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`,
`gripper/stroke`), written by the `cad gripper` workflow. It was designed
from the live site alone, by an agent, through the site's own doors: the
docs page, `SKILL.md`, `README.md`, the bench trees, the `/mcp` server, and
the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the kinematic assembly, the force curve, the moment audit, the clearance audit, closed forms. `node gripper.mjs` writes `parts/`, `gripper.json`, `gripper-stroke.json`, `expected.json` |
| `parts/*.json` | the twenty-one part trees, as generated |
| `gripper.json` | the demo cycle: a reference clock drives a cosine, so the viewer's spin closes and opens once per turn; parts inline — paste into the tree tab and press spin |
| `gripper-stroke.json` | the physical stroke: the screw is driven at rpm, a `screw` mate carries the carriage and the nut by the lead, the links follow the screw angle; one stroke open → closed in 83.7 s at 5 rpm |
| `expected.json` | closed-form volumes for every part |
| `publish.mjs` | writes parts then both assemblies (`gripper/assembly`, `gripper/stroke`; parts pinned to revision URIs) into a repo; idempotent; retires superseded parts under `gripper/v<n>/` |
| `../../.github/workflows/cad-gripper.yml` | build exact, closed forms, a 24-instant interference sweep of both documents (the gate), the clearance table (for the record), publish on request, then audit the published corpus |

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
  arms key into through-slots in the carriage (bore along Y, pivots along
  Z); the rail lies flat so the block's bolts, the link pin and the tenon's
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

## Why v5: coaxial, and one part where the load goes

v4 put the linear guide 16 mm above the screw axis and the carriage rods
8 mm below it. Every grip force then made a couple between the guide plane
and the drive plane — 1.9 N·m into the rods at 120 N of thrust — and the
finger was three parts (two tabs and a carrier) meeting at square corners.
v5:

1. **No skew between the screw and the centre of grip.** The rail lies
   flat on a bed just beyond the screw's far bearing, its centre line on
   z = 0. The finger slides are 12 mm plates in that same plane; the links
   sit one above and one below it; the arms' pivots and the slides' pins are
   on it; the flange is centred on it. Roll and pitch on the block are zero
   by construction, the carriage sees thrust and the screw's friction
   torque and nothing else, and the yaw couple on the block is the one the
   customer's finger length sets (4.0 N·m at a 60 N grip with the tip 73 mm
   ahead of the pin).
2. **The internal rods are gone; the housing aligns the carriage.** The bed
   is one machined plate: inside the case its top guides the carriage's
   26 mm skid, outside it seats the rail (five M3 at 20 pitch). The
   carriage's arms reach to 0.2 mm from the side walls. Screw, carriage and
   rail are referenced to one surface. The screw's friction torque, 0.16 N·m,
   is reacted at the arm tips as 1.8 N.
3. **The part that joins the linkage to the rail is one part.** The slide's
   tang (14 × 12) carries the link pin 6 mm inboard of the block centre and
   runs through the front wall; over the block it widens to 24 and takes the
   block's four M3 from above; the tang-to-plate corner is a 3 mm fillet
   and the plate over the block is the cross member the corner needed. The
   fillet lives outside the wall: the first build put it 3 mm inside and the
   server's clearance table found it at the open end of the stroke.
4. **Fingers are the customer's; the slide offers a male mount.** A 16 × 12
   tenon, 10 mm proud of the slide's front face, with a Ø4.1 cross-pin hole
   and 1.5 mm root fillets. A finger carries the female pocket and the cross
   pin; the plate's front face is its datum. An example finger (a C over the
   tenon, jaw 18 mm inboard of the block centre so the jaws meet at x = 0) is
   in both documents as a `reference` component: drawn translucent, left out
   of every check, there to show the grip line.
5. **What pivots cost is unchanged:** the force ratio follows the link angle.

| object width | link angle from the screw | finger force at 120 N thrust |
|---|---|---|
| 0 (closed) | 62.7° | 116 N |
| 10 mm | 44.7° | 59 N |
| 20 mm | 31.2° | 36 N |
| 30 mm | 19.5° | 21 N |
| 36 mm (open) | 12.8° | 14 N |

`forces()` and `moments()` in `gripper.mjs` print these; the v4 rod couple
is kept in the moments table for the record.

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward
the fingers), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the
flange face. The tool centre line is the screw axis.

```
  y=0     rear plate = ISO 9409-1-50-4-M6 flange: 4 × Ø6.6 on PCD 50, Ø6 dowel, Ø32 boss hole, centred on the axis
  14–36   NEMA 17 pancake, Tr8×2 shaft; bulkhead 36–42 takes its pilot and 4 × M3
  42–46   thrust collar Ø14 on the screw, against the bulkhead's front face
  43–129  the bed, z −23–−16, on the floor (4 × M3): carriage skid inside, rail seat outside
  62–76   carriage centre stroke (open → closed), 18 long: skid z −15.8–−14, waist ±14.5 at z ±6 with a 4 × 8.2 slot each side, bosses ±9 to z ±11
  yn+4    arm pivot pins at x ±36, z ±13, through the arms (z ±4, keyed in the slots, tips at x ±43.8) and a 3 mm spacer each side
  ±7–13   links, 27 mm, from the arm pins to the slide pins at (±xp, 92)
  86–133  finger slides, z ±6: tang 14 wide from y 86 through the wall slot, plate 24 wide over the block, tenon 16 × 12 from 133 to 143
  95–103  screw journal Ø6; front wall 98–104, 104 wide, standing on the bed: bearing Ø6.2, a slot each side (z ±6.2, x 5.5–38.5)
  108–128 MGN9 blocks on the rail (y 113.5–122.5, z −16–−9.5), block tops at z −6 under the slides
```

Two documents, one set of parts. **`gripper.json`** is the demo cycle: the
drive turns a `reference` clock at 5 rpm (drawn translucent, left out of
every check), one turn is one grip cycle of 12 s, and everything else is
derived:

```
spin = 360 · (ynClosed − ynOpen)/lead · (1 − cos θ)/2    screw angle: 0 → 7 turns → 0
yn   = ynOpen + lead · spin/360                           carriage centre, 61.7 → 75.6 → 61.7
dy   = yf − py − yn                                       link reach along Y
x    = √(L² − dy²)                                        link reach along X
xp   = px − x                                             finger pivot x, 30 → 12 → 30; opening = 2(xp − 12)
phi  = atan2(dy, −x)                                      right link angle
```

**`gripper-stroke.json`** is the physical stroke: the screw is the driven
component at 5 rpm, a `screw` mate (`lead`, axis +Y) carries the carriage
2 mm per turn, a second one along the nut's own +z carries the nut, `fixed`
mates carry the arms, and `yn = ynOpen + lead · θ/360` puts the links and
slides where the mate puts the carriage. One stroke is 7 turns, 83.7 s;
sweep with that period. Beyond it the nut runs on, as it would.

Both use `repeat` and placement by feature: `link` is one component
repeated four times with `i` choosing side and level, the eight bushings
sit on `@link[floor(i/2)].eye[i − 2·floor(i/2)][0]`, the arm pins and the
four spacers on `@arm[i].pivot[0]` with an `offset`, the slide pins on
`@slide[i].pin[0]`, and each follows its host through the motion. The left
slide and the left example finger are the right-hand parts turned 180°
about Y (`rotate.deg = 90 · (1 − side)`): both are symmetric about z = 0,
and a pin placed on the turned slide's hole aligns to its axis, which now
points −Z, and comes out in the same place.

| finger pivot x | block x | nut y | link angle | opening |
|---|---|---|---|---|
| 12 (closed) | 18 | 75.6 | 62.7° | 0 |
| 21 | 27 | 65.6 | 33.7° | 18 |
| 30 (open) | 36 | 61.7 | 12.8° | 36 |

## The parts

Every part builds exact on Truck, watertight, every face named (verified
through `/mcp` for all twenty-one, and again for the slide, bed and finger
after the fillet moved).

| part | sweep | key faces | holds |
|---|---|---|---|
| rear-flange | XZ extrude, 96 × 54 × 8 | `plate.bolt[k][j]` Ø6.6 PCD 50, `plate.dowel[k]`, `plate.boss[k]` | the robot |
| floor | XY extrude, 96 × 96 × 4 | `floor.tapA–D[k]` Ø2.5 | the box, the bed |
| lid | XY extrude, 96 × 90 × 4 | `lid.window[k]` | the box |
| side-wall (×2) | YZ extrude, 90 × 46 × 4, plain | — | the box |
| bulkhead | XZ extrude, 87 × 45 × 6 | `plate.pilot[k]`, `plate.bolt[k][j]` | motor, collar |
| front-wall | XZ extrude, 104 × 43 × 6, on the bed | `plate.bore[k]` Ø6.2, `plate.slotR/L[k]` 33 × 12.4 | screw journal; the slides pass |
| bed | XY extrude, 7 thick, 87.6 wide inside, 104 outside, y 43–129 | `bed.tap[k][j]` Ø2.5 × 5, `bed.boltA–D[k]` Ø3.4, `bed.windowR/L[k]` | the rail; guides the carriage |
| motor | XZ extrude, 42.3 square, 22 long | — | stand-in; its shaft is the screw |
| screw | revolve, Ø8 × 59 with a Ø6 × 8 journal | — | thread not modelled |
| collar | revolve, Ø14 × 4, Ø8 bore | — | thrust into the bulkhead |
| nut | revolve, Ø22 flange, Ø10 body, Ø8.4 bore | — | thread clearance 0.2 |
| carriage | XZ extrude, 18 long: skid 26, waist 29, bosses 18 | `carriage.bore[k]` Ø10.2, `carriage.bolt[k][j]`, `carriage.slotR/L[k]` 4 × 8.2 | nut, arms |
| arm (×2) | XY extrude, 34.7 × 18 × 8 | `arm.pivot[k]` Ø4 | `side: -1` mirrors; the arm pins |
| link (×4) | XY extrude, 27 dog-bone, 10 wide, 6 thick, Ø6 eyes | `link.eye[k][j]` | bushings |
| bushing (×8) | revolve, Ø6 × 6, Ø4.1 bore | — | bronze; press in the eye, runs on the pin |
| spacer (×4) | revolve, Ø6 × 3, Ø4.1 bore | — | between each arm face and its link |
| pin (×4) | extrude circle Ø4 × 26 | `pin.od[k]` | press in arm or slide, two links each |
| slide (×2) | XY extrude, 12 thick, one sketch: tang 14 wide, plate 24 wide, tenon 16 wide | `slide.pin[0]` Ø4, `slide.boltA–D[0]` Ø3.4 on 10 × 15, `slide.cross[0]` Ø4.1, `slide.outline[k]` | block, links, the finger |
| block (×2) | YZ extrude, MGN9C stand-in 20 × 8 × 28.9 with a channel | — | purchased |
| rail | YZ extrude, MGN9 stand-in 9 × 6.5 × 104 | `rail.outline[k]` | purchased; its holes not modelled, the bed's are |
| finger (×2, reference) | XY extrude, 28 × 34 × 22, a C 16.2 × 10.2 | `finger.jaw[7]` the jaw face | the customer's part, stood in for |

Closed forms: block, finger, floor, lid, motor, rail and side-wall 0.000 %,
front-wall 0.001 %, collar 0.004 %, bed 0.006 %, arm 0.008 %, bulkhead
0.011 %, rear-flange 0.014 %, link 0.017 %, nut 0.028 %, slide 0.036 %,
carriage 0.086 %, screw 0.24 %, bushing and spacer 0.29 %, pin 0.38 %
(chord error of thin cylinders; the pin's tolerance is 0.4 %).

## Fits and what is not modelled

- Running: pins Ø4 in Ø4.1 bushings; nut Ø10 in Ø10.2; screw Ø8 in the
  Ø8.4 nut and the Ø6 journal in the Ø6.2 bearing; boss Ø22 in the Ø22.5
  pilot; block 2 mm above the rail's mounting surface; arms 0.1 in their
  slots, 0.2 from the walls; carriage skid 0.2 above the bed; slides 0.2
  in the wall slots; links 1 mm from the slides and the carriage waist.
- Fixed (press, keyed, or a fastener that is not drawn): bushings in link
  eyes, pins in slides and arms (retaining clips), arms in the carriage
  slots (set screw), slides on blocks (4 × M3 from above), rail on the bed
  (5 × M3), bed on the floor (4 × M3), the front wall on the bed, the six
  case plates to each other, motor to bulkhead, nut flange to carriage,
  the example fingers on the tenons (cross pin).
- Bronze or PTFE on the bed under the skid and the thrust washer are not
  modelled. The carriage is 3.9 mm thick beside the bore at the waist.
- Link pins carry ~260 N each at closed (both links); a Ø4 hardened dowel
  in 6 mm bushings, supported at both ends, is comfortable. Link bending is
  in-plane.
- No recess for the robot flange's Ø31.5 boss: it passes through the Ø32
  hole into the 6 mm behind the motor. Locate on the dowel.
- The rail and blocks are stand-ins for purchased MGN9 parts; the guide is
  exposed on the bed, so a bellows or cover is the next part.
- Threads, fasteners, cable exit, the motor's D-flat, and any fillets other
  than the four drawn into the slide's sketch are not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight with
all faces named (24 builds through `/mcp`); the closed forms above; both
documents resolve through the `/mcp` `check` tool (43 and 42 components,
every repeat, rotation and reference expanded); assembly-wide `measure` on
the server: example jaw faces 36.000 apart at open and 0.00002 at closed,
each slide pin 27.000 from its arm pivot at open and at closed on both
sides, the turned left slide's pin axis reading −Z at z +6 as expected; the
server clearance table at the open and closed instants: no pair
intersecting, every close pair a designed fit or a 1 mm gap; the clearance
audit in `gripper.mjs` at closed, mid and open (63 checks).

**Run by the workflow, not from here:** the Manifold volume sweep through
the motion (`agent/check.mjs --sweep 24`) on both documents, and the
publish. Read its log for the `no interference` lines.

**Not verified anywhere here:** the MGN9C moment ratings against the 4 N·m
yaw with a 73 mm finger; those are catalogue numbers to check against the
finger actually fitted.

## What the harness said back

From the 2026-09-12 tools, on v4 and then v5:

- **Assembly-wide `measure` found a real error in one call** (v4). The pads
  were 4 mm apart at closed: a stray +2 in the pad centre from v3, and an
  audit line that checked the intended number rather than the geometry.
- **The server clearance table found the v5 fillet inside the front wall**
  at the open instant (front-wall / slide, 0.38 mm penetration) and nothing
  else real in 780 pairs at either end of the stroke. The rest of its
  verdicts are as before: coplanar contacts with penetration under 1e-12
  read as collisions, designed running fits (0.045, 0.1, 0.2) and 1.000 mm
  gaps reported as 0.997 read as close. A verdict tolerance on penetration,
  a `running` fit the table can expect, and the sagitta applied before the
  verdict would make it a gate; today it is a table to read.
- **Booleans on Truck** (v5 probe): a hole through a plain bar is
  watertight; through a polygon or a bar with a second loop it is not (4 to
  72 open edges, χ off by one or more); every boolean drops the face names.
  A cut part is a dead end for `@component.face` placement and for
  `measure`. This is what forced the flat rail and the one-sketch slide.
- **A 24-instant server sweep of 45 components** hit the Worker's CPU
  ceiling (Cloudflare 1102) after 2.5 minutes. The descriptor warns about
  big gears; component count is the other axis. Sweeps of this size run
  locally, and the workflow does.
- **A component placed by reference and also fixed-mated to its host moves
  twice**: the reference already follows; the mate adds the travel again.
  The stroke document leaves those mates out.
- **A fixed mate copies travel in the follower's own frame**, so the nut,
  placed tilted so its +z is the screw axis, went sideways instead of along
  the screw. It has its own `screw` mate along its local +z.
- **`check` on an assembly** lists the faces a component does have when a
  reference names one it does not. That is the error message the loop needs.
- **A turned component's features place correctly**: the left slide is the
  right one rotated 180° about Y, its pin hole's axis comes back as −Z, and
  the pin aligned to it with a negative offset lands in the same z range as
  the right one. The clearance table agrees (both slide pins 0.045 from
  their bushings, 0.997 from their links).

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
