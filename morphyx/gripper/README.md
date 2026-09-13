# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 7: the links go through the wall. An ISO 9409-1-50-4-M6 tool flange
is the rear plate of a 116 × 52 × 116 mm case. Inside: a NEMA 17 pancake
stepper with an integrated Tr8×2 lead screw, a flange nut in a carriage
riding on the floor, and two 22 mm pivot arms keyed into it. The front wall
is a slotted plate, and this version turns it around: the MGN9 rail is on
its **outer** face, one piece across the whole width, over the screw's blind
journal bore. The four coupling links pass out through the two slots, over
and under the rail and its blocks, and pin straight onto the outside of each
block. Each jaw carrier is then just a plate — 36 × 22 × 10 — holding the
link pin through its middle and presenting four M4 and two Ø6 dowels for the
customer's finger. The stroke closes until the two plates meet on the centre
line. Mount centres run 36 → 66 mm. Eighteen parts, two documents. Versions
1 to 6 are the earlier revisions of the same files; their retired parts live
under `gripper/v1/` … `gripper/v6/`.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`,
`gripper/stroke`), written by the `cad gripper` workflow. It was designed
from the live site alone, by an agent, through the site's own doors: the
docs page, `SKILL.md`, `README.md`, the bench trees, the `/mcp` server, and
the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the kinematic assembly, the force curve, the moment audit, the clearance audit, closed forms. `node gripper.mjs` writes `parts/`, `gripper.json`, `gripper-stroke.json`, `expected.json` |
| `parts/*.json` | the eighteen part trees, as generated |
| `gripper.json` | the demo cycle: a reference clock drives a cosine, so the viewer's spin closes and opens once per turn; parts inline — paste into the tree tab and press spin |
| `gripper-stroke.json` | the physical stroke: the screw is driven at rpm, a `screw` mate carries the carriage and the nut by the lead, the links follow the screw angle |
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

## Why v7: the links through the wall, and what height actually costs

v6 mounted the rail on the inner face of the slotted plate, so each jaw
carrier had to wrap the rail and its block from behind and reach back out
through the slots: a 57 mm long C-section, 39 mm tall, with a boolean in it.
v7 turns the plate around and sends the links out instead of the carrier:

1. **The rail is on the outer face**, one piece 104 long across the whole
   width, sitting over the screw's blind journal bore and closing it. The
   two blocks ride it outside the case.
2. **The links pass through the slots.** They run at z ±11…17, clear of the
   Ø20 blocks, over and under the rail, and pin straight onto the outside
   of each block. Nothing wraps anything and nothing reaches back.
3. **The jaw carrier is a plate**, 36 × 22 × 10, bolted to its block's outer
   face. The Ø4 link pin passes through its middle with 22 mm of bearing and
   a link seats on each face outside it.
4. **No spacers anywhere.** The pivot arms are 22 thick and the carrier
   plates are 22 tall, so a link seats directly on each face. v6 needed
   eight washers; v7 needs none, and the spacer part is retired.
5. **The stop is the plates meeting.** At closed the two carrier plates
   touch on the centre line with their blocks 7 mm apart, and that is what
   sets the closed position.

**The height it actually took out.** The mechanism outside the wall went
from 39 mm tall to 34: the links at ±17 replace the carrier's feet at
±19.5. The case went from 54 to 52. That is not the halving we were after,
and the reason is worth writing down:

| what | sets its height | v6 | v7 |
|---|---|---|---|
| case | the NEMA 17 pancake, 42.3 square, plus two 4 mm walls | 54 | 52 |
| mechanism outside the wall | the block is 20 tall and the links must clear it | 39 | 34 |

Neither number is set by the linkage any more. The case is motor-bound: at
42.3 mm square a NEMA 17 cannot fit in less than about 50. The mechanism is
block-bound: the links have to pass over and under a 20 mm block, so they
sit at ±11 at best, and 6 mm of link puts the outside at ±17. Halving
either means changing a purchased part, not the geometry — a NEMA 14
pancake takes the case to 44, and an MGN7 block takes the mechanism to 30,
at about half the thrust and half the moment rating.

**What it cost in force.** The link pin now sits 17 mm beyond the front
wall, so the linkage is longer (43 mm links) and flatter, and the case is
4 mm wider to keep the arms' reach at x ±47:

| mount centres opened from closed | link angle from the screw | force at each jaw, 120 N thrust |
|---|---|---|
| 0 (closed) | 42.4° | 55 N |
| 7.5 mm | 36.0° | 44 N |
| 15 mm | 30.0° | 35 N |
| 22.5 mm | 24.4° | 27 N |
| 30 mm (open) | 19.0° | 21 N |

v6 gave 84 N at closed with the pin inside the case. Reaching outside for
the pin is what costs it: the carriage cannot come closer than 2.8 mm to
the wall, so the link's Y reach can never fall below about 31 mm, and the
ratio follows from that.

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward
the fingers), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the
flange face.

```
  y=0      rear plate = ISO 9409-1-50-4-M6 flange: 4 × Ø6.6 on PCD 50, Ø6 dowel, Ø32 boss hole, on the axis
  14–36    NEMA 17 pancake, Tr8×2 shaft; bulkhead 36–42 takes its pilot and 4 × M3
  42–46    thrust collar Ø14 on the screw, against the bulkhead's front face
  88–97    carriage centre stroke (open → closed), 18 long, skid on the floor at z −21.8
  yn+4     arm pivot pins at x ±47, z ±17; the arms are 22 thick and the links seat on their faces
  110–116  front wall, 116 wide: a slot each side at z ±(10.6…17.4), x 5…52; the screw's blind bore at the centre
  116–122.5 MGN9 rail on the OUTER face, 104 long, closing the bore
  118–128  MGN9C blocks on the rail, z ±10; the links pass over and under them at z ±11…17
  128–138  jaw carrier plates, 36 × 22 × 10: the link pin through the middle, the finger pattern on the front
```

Two documents, one set of parts. **`gripper.json`** is the demo cycle: the
drive turns a `reference` clock at 5 rpm, one turn is one grip cycle of
12 s, and everything else is derived:

```
spin = 360 · (ynClosed − ynOpen)/lead · (1 − cos θ)/2    screw angle: 0 → 4.5 turns → 0
yn   = ynOpen + lead · spin/360                           carriage centre, 88.3 → 97.2 → 88.3
dy   = yf − py − yn                                       link reach along Y
x    = √(L² − dy²)                                        link reach along X
xp   = px − x                                             jaw pin x, 33 → 18 → 33
xf   = xp + inset                                         the block and its plate, inset 0
phi  = atan2(dy, −x)                                      right link angle
```

**`gripper-stroke.json`** is the physical stroke: the screw is the driven
component at 5 rpm, a `screw` mate carries the carriage 2 mm per turn, a
second one along the nut's own +z carries the nut, `fixed` mates carry the
arms. One stroke is 4.5 turns, 53.5 s; sweep with that period.

| jaw pin x | block centre | nut y | link angle | mount centres |
|---|---|---|---|---|
| 18 (closed) | 18 | 97.2 | 42.4° | 36 |
| 25.5 | 25.5 | 92.3 | 30.0° | 51 |
| 33 (open) | 33 | 88.3 | 19.0° | 66 |

## The parts

Every part builds exact on Truck and watertight; every part but the carrier
has named faces.

| part | sweep | key faces | holds |
|---|---|---|---|
| rear-flange | XZ extrude, 116 × 52 × 8 | `plate.bolt[k][j]` Ø6.6 PCD 50, `plate.dowel[k]`, `plate.boss[k]` | the robot |
| floor | XY extrude, 116 × 108 × 4 | `floor.outline[k]` | the box; its top is the carriage's way |
| lid | XY extrude, 116 × 102 × 4 | `lid.window[k]` | the box |
| side-wall (×2) | YZ extrude, 102 × 44 × 4, plain | — | the box |
| bulkhead | XZ extrude, 107 × 43 × 6 | `plate.pilot[k]`, `plate.bolt[k][j]` | motor, collar |
| front-wall | XZ extrude, 116 × 48 × 6 | `plate.bore[k]` Ø6.2, `plate.slotRlo/Rhi/Llo/Lhi[k]` 47 × 6.8, `plate.tapA–F[k]` | the rail; the links pass |
| motor | XZ extrude, 42.3 square, 22 long | — | stand-in; its shaft is the screw |
| screw | revolve, Ø8 × 70 with a Ø6 × 8 journal | — | thread not modelled |
| collar | revolve, Ø14 × 4, Ø8 bore | — | thrust into the bulkhead |
| nut | revolve, Ø22 flange, Ø10 body, Ø8.4 bore | — | thread clearance 0.2 |
| carriage | XZ extrude, 18 long: skid 26, body 29 × 35 | `carriage.bore[k]` Ø10.2, `carriage.bolt[k][j]`, `carriage.slotR/L[k]` 4 × 22.2 | nut, arms |
| arm (×2) | XY extrude, 44.7 × 18 × 22 | `arm.pivot[k]` Ø4 | `side: -1` mirrors; the links seat on its faces |
| link (×4) | XY extrude, 43 dog-bone, 10 wide, 6 thick | `link.eye[k][j]` | bushings |
| bushing (×8) | revolve, Ø6 × 6, Ø4.1 bore | — | bronze; press in the eye, runs on the pin |
| pin (×4) | extrude circle Ø4 × 34 | `pin.od[k]` | press through an arm or a plate; two links each |
| **carrier (×2)** | **XZ extrude along Y, 36 × 22 × 10, + one Ø4 cut along Z** | unnamed — the cut drops them | the block, the links, the finger |
| block (×2) | YZ extrude, MGN9C stand-in 20 × 10 × 28.9 with a channel | — | purchased |
| rail | YZ extrude, MGN9 stand-in 9 × 6.5 × 104, one piece | `rail.outline[k]` | purchased; its counterbores not modelled |

## Fits and what is not modelled

- Running: pins Ø4 in Ø4.1 bushings; nut Ø10 in Ø10.2; screw Ø8 in the
  Ø8.4 nut and the Ø6 journal in the Ø6.2 bore; boss Ø22 in the Ø22.5
  pilot; block 2 mm off the wall on the rail; links 0.4 mm inside the wall
  slots; arms 0.1 in their carriage slots, 0.2 from the walls; carriage
  skid 0.2 above the floor.
- Fixed (press, keyed, or a fastener that is not drawn): bushings in link
  eyes, pins through the arms and the carrier plates (retaining clips),
  arms in the carriage slots (set screw), carriers on their blocks
  (4 × M3, drawn), the rail on the wall (M3 at 20 pitch, tapped holes
  drawn), the case plates to each other, motor to bulkhead, nut flange to
  carriage.
- **The finger pattern is tapped through and closed off by the block's face
  behind it**, so a finger bolt is 10 mm at most. The carrier's section is
  swept along Y, so a blind hole is not available in one sweep, and the
  four M4 and two Ø6 dowels sit over the block rather than outside it.
- The jaw pin is gripped over the plate's 22 mm and each link seats on a
  face outside that, so the pin sees bending over a 6 mm overhang rather
  than shear across a gap: 320 N per link at closed on a Ø4 hardened dowel
  is about 95 MPa, comfortable.
- No recess for the robot flange's Ø31.5 boss: it passes through the Ø32
  hole into the 6 mm behind the motor. Locate on the dowel.
- The rail and blocks are stand-ins for purchased MGN9 parts. The guide is
  outside again, so it wants a cover or a wiper if the gripper works in
  swarf; the slots want the same.
- Threads, fasteners, cable exit, the motor's D-flat and all fillets are
  not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight
through `/mcp`, each within its closed-form tolerance; both documents
resolve through the `/mcp` `check` tool (36 and 35 components, every repeat
and reference expanded); assembly-wide `measure` on the server: the two jaw
pins 36.000 mm apart at closed and 66.000 at open, and each pin 43.000 from
its arm pivot at both ends, on both sides; the clearance table on the guide
and the links at both ends of the stroke, read in subsets; and the 48
analytic checks in `gripper.mjs` at closed, mid and open.

**Run by the workflow, not from here:** the Manifold volume sweep through
the motion (`agent/check.mjs --sweep 24`) on both documents, and the
publish. Read its log for the `no interference` lines.

**Not verified anywhere here:** the MGN9C moment ratings against the yaw a
long finger would apply; those are catalogue numbers to check against the
finger actually fitted.

## What the harness said back

From the 2026-09-12 tools, across v4 to v7:

- **An XZ sketch's `offset` is the FRONT of the extrude, not its back.**
  `{base: 'XZ', offset: '-y0'}` with a positive depth puts the part at
  y0 − t … y0. Getting that backwards buried the jaw plate inside its own
  block, and the symptom was not a placement error: the following Ø4 cut
  returned `unreachable` from the kernel, and then, once moved, a part of
  volume zero. A cut that lands outside its body is worth its own message.
- **A boolean's clearance planes matter.** The same cut 1 mm proud of the
  part's faces leaves it open — 4 open edges, χ odd — where 3 mm proud is
  watertight. `build` reports `ok: true` either way; only `watertight`
  tells you.
- **A boolean still drops every face name**, so a cut part can be neither
  a `@component.face` placement target nor measured by name. That is why
  the jaw pins here are placed by expression.
- **Overlapping loops in one sketch fail as "disjoint outer loops"** — two
  bolt circles closer together than their diameters. The message names the
  loops, which is what made it findable.
- **The server clearance table has a work budget**, and 36 components with
  a cut part in them still exceeds it (`incomplete: "too-big"`). It was
  read in subsets. A sweep of that size hits the Worker's CPU ceiling
  outright. Both run locally, and the workflow does.
- **The table's verdicts read designed fits as faults:** coplanar contacts
  with penetration under 1e-12 read as collisions, running fits read as
  close, and a 1.000 mm gap reports as 0.997 by chord error.
- **Fixed-mated pairs are not all counted as expected touches**, including
  the rail bolted flat to the wall.
- **Assembly-wide `measure` found a real error in one call** (v4).
- **A component placed by reference and also fixed-mated moves twice**, and
  **a fixed mate copies travel in the follower's own frame**.

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
