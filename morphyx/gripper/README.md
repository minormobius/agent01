# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 6: the guide comes inside. An ISO 9409-1-50-4-M6 tool flange is the
rear plate of a 112 × 54 × 116 mm case. Inside: a NEMA 17 pancake stepper
with an integrated Tr8×2 lead screw, a flange nut in a carriage riding on
the floor, two pivot arms keyed into it, and four 27 mm links on bronze
bushings, one above and one below the mid-plane. The front wall is a
slotted plate: the strip across its middle carries two MGN9 rail segments
on its **inner** face, and a long slot runs above and below that strip.
Each jaw carrier is one part — it wraps the rail and its block, passes two
feet out through the slots, runs back behind the block as a tongue that
takes the link pin, and ends outside in a tenon with four M4 cross holes.
Fingers are the customer's and are not modelled. Nut forward closes; the
mount centres run 44 → 72 mm apart in 5 turns. Nineteen parts, two
documents. Versions 1 to 5 are the earlier revisions of the same files;
their retired parts live under `gripper/v1/` … `gripper/v5/`.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`,
`gripper/stroke`), written by the `cad gripper` workflow. It was designed
from the live site alone, by an agent, through the site's own doors: the
docs page, `SKILL.md`, `README.md`, the bench trees, the `/mcp` server, and
the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the kinematic assembly, the force curve, the moment audit, the clearance audit, closed forms. `node gripper.mjs` writes `parts/`, `gripper.json`, `gripper-stroke.json`, `expected.json` |
| `parts/*.json` | the nineteen part trees, as generated |
| `gripper.json` | the demo cycle: a reference clock drives a cosine, so the viewer's spin closes and opens once per turn; parts inline — paste into the tree tab and press spin |
| `gripper-stroke.json` | the physical stroke: the screw is driven at rpm, a `screw` mate carries the carriage and the nut by the lead, the links follow the screw angle; one stroke open → closed in 60.8 s at 5 rpm |
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

## Why v6: the guide inside, and a finger mount that can take a moment

v5 put the rail on a bed outside the front wall. It worked and it was
coaxial, but the guide was exposed, the carriers had to reach back through
the wall to find the linkage, and the finger mount was a tenon with one
cross pin — a single fastener under the largest moment in the machine. v6:

1. **The front wall is the slotted plate.** Two long slots, one above and
   one below a central strip; the strip carries the rail on its inner face
   and the screw's journal bearing between the two rail segments. The
   guide, the blocks and the whole linkage are inside the case. The only
   openings are the two slots a carrier's feet sweep along.
2. **Each jaw carrier is one part, and it is the whole moment path.** Its
   section wraps the rail, the block and the strip; two feet pass out
   through the slots; outside it closes into a web and a tenon. Nothing in
   the path from the finger to the ball guide is a joint.
3. **The carrier points back up the case to the motor.** Behind the block
   the same section runs on as a tongue on the mid-plane, carrying the Ø4
   link pin between a link above and a link below. The linkage never leaves
   the case and never leaves the plane of the screw.
4. **Four holes at the finger mount, not one.** A 16 × 16 tenon stands
   16 mm proud of the web with four M4 cross holes on an 8 × 10 rectangle.
   The tenon locates the finger and takes the shear; the four bolts take
   the couple, 8 mm apart in a pattern, in double shear. At a 60 N grip on
   a jaw 67 mm ahead of the block that couple is 4 N·m and each bolt sees
   about 250 N — a working number for M4, where one cross pin was not.
5. **No fingers in the assembly.** They are the customer's part. Both
   documents end at the tenon.

What it costs: the case is 16 mm wider, because the carriers and their
rails now live inside it and have to clear the screw's bearing at the
centre. The jaws start 44 mm apart rather than touching, so a finger
reaches inward — which is what a finger is for. And the link angle at
closed is shallower than v5's, so the grip force at the mount is lower:

| mount travel from closed | link angle from the screw | force at the mount, 120 N thrust |
|---|---|---|
| 0 (closed) | 55.6° | 87 N |
| 7 mm | 42.5° | 55 N |
| 14 mm (open) | 16.5° | 18 N |

`forces()` and `moments()` in `gripper.mjs` print these.

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward
the fingers), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the
flange face. The tool centre line is the screw axis.

```
  y=0      rear plate = ISO 9409-1-50-4-M6 flange: 4 × Ø6.6 on PCD 50, Ø6 dowel, Ø32 boss hole, on the axis
  14–36    NEMA 17 pancake, Tr8×2 shaft; bulkhead 36–42 takes its pilot and 4 × M3
  42–46    thrust collar Ø14 on the screw, against the bulkhead's front face
  60–72    carriage centre stroke (open → closed), 18 long, skid on the floor at z −22.8, arms' tips at x ±51.8
  yn+4     arm pivot pins at x ±38, z ±12; links 27 mm to the carrier pins at (±xp, 90)
  83–96    carrier tongue, z ±4, Ø4 pin at y 90 — the links straddle it, z ±(5…11)
  96–98    carrier flange: the block's backstop, bolted to it
  98–108   MGN9C block, wrapping the rail, inside the carrier's channel
  103.5–110 MGN9 rail segments on the strip's inner face, x 6.5…52 each side of the Ø6.2 journal bearing
  110–116  front wall, 112 wide: the strip at z ±10.1, a slot each side at z ±(10.1…19.9), x 5.5…52.5
  116.5–124.5 carrier web, outside; 124.5–140.5 the tenon, 16 × 16, four M4 at 8 × 10
```

Two documents, one set of parts. **`gripper.json`** is the demo cycle: the
drive turns a `reference` clock at 5 rpm (drawn translucent, left out of
every check), one turn is one grip cycle of 12 s, and everything else is
derived:

```
spin = 360 · (ynClosed − ynOpen)/lead · (1 − cos θ)/2    screw angle: 0 → 5.07 turns → 0
yn   = ynOpen + lead · spin/360                           carriage centre, 63.0 → 73.1 → 63.0
dy   = yf − py − yn                                       link reach along Y
x    = √(L² − dy²)                                        link reach along X
xp   = px − x                                             carrier pin x, 30 → 16 → 30
xf   = xp + inset                                         carrier centre, 6 mm outboard of its pin
phi  = atan2(dy, −x)                                      right link angle
```

**`gripper-stroke.json`** is the physical stroke: the screw is the driven
component at 5 rpm, a `screw` mate (`lead`, axis +Y) carries the carriage
2 mm per turn, a second one along the nut's own +z carries the nut, `fixed`
mates carry the arms, and `yn = ynOpen + lead · θ/360` puts the links and
carriers where the mate puts the carriage. One stroke is 5.07 turns,
60.8 s; sweep with that period.

Placement is by feature where the faces are named: the eight bushings sit
on `@link[floor(i/2)].eye[i − 2·floor(i/2)][0]` and the arm pins on
`@arm[i].pivot[0]` with an `offset`, and each follows its host through the
motion. The carrier is the exception — its pin hole is a cut, which drops
its face names — so the jaw pins are placed by expression. The left
carrier is the right one turned 180° about Y; its section is symmetric
about z = 0, so that is a pure mirror in x.

| carrier pin x | carrier centre | nut y | link angle | mount centres |
|---|---|---|---|---|
| 16 (closed) | 22 | 73.1 | 55.6° | 44 |
| 23 | 29 | 68.5 | 42.5° | 58 |
| 30 (open) | 36 | 63.0 | 16.5° | 72 |

## The parts

Every part builds exact on Truck and watertight; every part but the
carrier has named faces.

| part | sweep | key faces | holds |
|---|---|---|---|
| rear-flange | XZ extrude, 112 × 54 × 8 | `plate.bolt[k][j]` Ø6.6 PCD 50, `plate.dowel[k]`, `plate.boss[k]` | the robot |
| floor | XY extrude, 112 × 108 × 4 | `floor.outline[k]` | the box; its top is the carriage's way |
| lid | XY extrude, 112 × 102 × 4 | `lid.window[k]` | the box |
| side-wall (×2) | YZ extrude, 102 × 46 × 4, plain | — | the box |
| bulkhead | XZ extrude, 103 × 45 × 6 | `plate.pilot[k]`, `plate.bolt[k][j]` | motor, collar |
| front-wall | XZ extrude, 112 × 50 × 6 | `plate.bore[k]` Ø6.2, `plate.slotRlo/Rhi/Llo/Lhi[k]` 47 × 9.8, `plate.tapA–F[k]` | the rail, the journal; the carriers pass |
| motor | XZ extrude, 42.3 square, 22 long | — | stand-in; its shaft is the screw |
| screw | revolve, Ø8 × 63 with a Ø6 × 8 journal | — | thread not modelled |
| collar | revolve, Ø14 × 4, Ø8 bore | — | thrust into the bulkhead |
| nut | revolve, Ø22 flange, Ø10 body, Ø8.4 bore | — | thread clearance 0.2 |
| carriage | XZ extrude, 18 long: skid 26, waist 29, bosses 18 | `carriage.bore[k]` Ø10.2, `carriage.bolt[k][j]`, `carriage.slotR/L[k]` | nut, arms |
| arm (×2) | XY extrude, 42.7 × 18 × 8 | `arm.pivot[k]` Ø4 | `side: -1` mirrors; the arm pins |
| link (×4) | XY extrude, 27 dog-bone, 10 wide, 6 thick | `link.eye[k][j]` | bushings |
| bushing (×8) | revolve, Ø6 × 6, Ø4.1 bore | — | bronze; press in the eye, runs on the pin |
| spacer (×8) | revolve, Ø6 × 1, Ø4.1 bore | — | between each pin's host and its link |
| pin (×4) | extrude circle Ø4 × 24 | `pin.od[k]` | press in an arm or a tongue; two links each |
| **carrier (×2)** | **YZ extrude along X, 30 wide, + one Ø4 cut along Z** | unnamed — the cut drops them | the block, the links, the finger |
| block (×2) | YZ extrude, MGN9C stand-in 20 × 10 × 28.9 with a channel | — | purchased |
| rail (×2) | YZ extrude, MGN9 stand-in 9 × 6.5 × 45.5 | `rail.outline[k]` | purchased; one segment each side |

Closed forms: block, floor, lid, motor, rail and side-wall 0.000 %,
collar 0.004 %, arm and front-wall 0.006 %, bulkhead 0.009 %, rear-flange
0.012 %, carrier 0.016 %, link 0.017 %, nut 0.028 %, carriage 0.067 %,
screw 0.23 %, bushing and spacer 0.29 %, pin 0.38 % (chord error of thin
cylinders).

## Fits and what is not modelled

- Running: pins Ø4 in Ø4.1 bushings; nut Ø10 in Ø10.2; screw Ø8 in the
  Ø8.4 nut and the Ø6 journal in the Ø6.2 bearing; boss Ø22 in the Ø22.5
  pilot; block 2 mm off the wall on the rail; block 0.5 mm inside the
  carrier's channel; carrier feet 0.4 mm inside the wall slots; arms 0.1
  in their carriage slots, 0.2 from the walls; carriage skid 0.2 above the
  floor; links 1 mm from the arms and the tongue, on spacers.
- Fixed (press, keyed, or a fastener that is not drawn): bushings in link
  eyes, pins in tongues and arms (retaining clips), arms in the carriage
  slots (set screw), rail segments on the strip (M3 at 20 pitch, tapped
  holes drawn), the case plates to each other, motor to bulkhead, nut
  flange to carriage.
- **The carrier-to-block bolts are the one joint not drawn**: four M3 along
  Y through the carrier's flange into the block's own tapped face. The
  carrier's section is swept along X, so holes along Y cannot be part of
  that sweep, and a second cut for them costs the part its watertightness.
  The flange backstops the block and the channel captures it in z, so the
  bolts clamp rather than locate.
- Link pins carry ~210 N each at closed (both links); a Ø4 hardened dowel
  in 6 mm bushings, supported at both ends, is comfortable.
- No recess for the robot flange's Ø31.5 boss: it passes through the Ø32
  hole into the 6 mm behind the motor. Locate on the dowel.
- The rail and blocks are stand-ins for purchased MGN9 parts. The guide is
  now enclosed; the slots want wipers if the gripper works in swarf.
- Threads, fasteners, cable exit, the motor's D-flat and all fillets are
  not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight
through `/mcp`, each within its closed-form tolerance; both documents
resolve through the `/mcp` `check` tool (45 and 44 components, every
repeat, rotation and reference expanded); assembly-wide `measure` on the
server: the two jaw pins 32.000 mm apart at closed and 60.000 at open, and
each pin 27.000 from its arm pivot at both ends, on both sides; the
clearance table on the mechanism at both ends of the stroke; and the 54
analytic checks in `gripper.mjs` at closed, mid and open.

**Run by the workflow, not from here:** the Manifold volume sweep through
the motion (`agent/check.mjs --sweep 24`) on both documents, and the
publish. Read its log for the `no interference` lines.

**Not verified anywhere here:** the MGN9C moment ratings against the 4 N·m
yaw with a 67 mm jaw; those are catalogue numbers to check against the
finger actually fitted.

## What the harness said back

From the 2026-09-12 tools, across v4, v5 and v6:

- **A boolean's clearance planes matter.** The carrier's Ø4 pin hole is
  the one cut in this design. Cutting with the tool 1 mm proud of the
  tongue's faces left the part open — 4 open edges, χ −11. The identical
  cut 3 mm proud is watertight, χ −10, and the volume matches the closed
  form to 0.016 %. Nothing in the error surface said so: `build` reported
  `ok: true` and only `watertight` gave it away. A cut that grazes a face
  plane is worth a warning.
- **A boolean still drops every face name.** The carrier's faces come back
  as `face[k]`, so it can be neither a `@component.face` placement target
  nor measured by name. That is what forces the one-sweep rule, and it is
  why the jaw pins here are placed by expression.
- **Overlapping loops in one sketch fail as "disjoint outer loops."** Two
  Ø4.3 bolt circles 3 mm apart read as two outer loops the kernel could
  not union. The message names the loops, which is what made it findable.
- **The server clearance table has a work budget.** At 44 components and
  406 k triangles it returns `incomplete: "too-big"` with `work` 17.5 M
  against a 6 M budget, after building every part across several calls.
  Trimming to the mechanism did not help — 37 components and 291 k
  triangles is still 10.5 M of work — so the table was read in subsets: the
  guide (wall, rails, blocks, carriers, pins) and the linkage. A sweep of
  that size hits the Worker's CPU ceiling outright (Cloudflare 1102 after
  2.5 minutes). Both run locally, and the workflow does. Being able to ask
  for a named subset of components would make this tool usable on a whole
  machine.
- **The table's verdicts still read designed fits as faults:** coplanar
  contacts with penetration under 1e-12 read as collisions, running fits
  of 0.045 to 0.5 read as close, and a 1.000 mm gap reports as 0.997 by
  chord error. A verdict tolerance on penetration, a `running` fit the
  document can declare, and the sagitta applied before the verdict would
  make it a gate rather than a table to read.
- **Fixed-mated pairs are not all counted as expected touches.** The rail
  bolted flat to the wall, and the case plates to each other, come back as
  collisions at 1e-15 even though a `fixed` mate joins them; in v5 only 36
  of the fixed pairs were marked `expected`. Indexed ids from `repeat`
  (`rail[0]`) may be the reason.
- **Assembly-wide `measure` found a real error in one call** (v4): the
  pads were 4 mm apart at closed, a stray constant, and the audit line was
  checking the intention rather than the geometry.
- **A component placed by reference and also fixed-mated moves twice**, and
  **a fixed mate copies travel in the follower's own frame** — so the nut,
  placed tilted, needs its own `screw` mate along its local +z.

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
