# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 4: pivots, doubled. An ISO 9409-1-50-4-M6 tool flange is the rear
plate of a 96 × 61 × 104 mm case. Inside: a NEMA 17 pancake stepper with an
integrated Tr8×2 lead screw, a flange nut in a carriage riding two Ø6 rods, a
crossbar on the carriage neck carrying two pivot pins, and four 27 mm links
on bronze bushings, one above and one below each finger tab. The fingers
ride one MGN9 ball guide across the front wall's outer face, a block each,
pads on a carrier bolted to the block. Nut forward closes. Opening 36 → 0 mm
in 7 turns. Twenty-one parts, one assembly, every part one sweep. Versions 1
to 3 are the earlier revisions of the same files; their retired parts live
under `gripper/v1/`, `gripper/v2/`, `gripper/v3/`.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`), written by
the `cad gripper` workflow. It was designed from the live site alone, by an
agent, through the site's own doors: the docs page, `SKILL.md`, `README.md`,
the bench trees, the `/mcp` server, and the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the kinematic assembly, the force curve, the moment-and-friction audit, the clearance audit, closed forms. `node gripper.mjs` writes `parts/`, `gripper.json`, `expected.json` |
| `parts/*.json` | the twenty-one part trees, as generated |
| `gripper.json` | the assembly, kinematic (a clock drive, everything derived), parts inline — paste into the viewer's tree tab and press spin |
| `expected.json` | closed-form volumes for the parts that have one |
| `publish.mjs` | writes parts then the assembly (parts pinned to revision URIs) into a repo; idempotent; retires superseded parts under `gripper/v<n>/` |
| `../../.github/workflows/cad-gripper.yml` | build exact, closed forms, interference through a cycle, publish on request |

## How cad.mino.mobi works, for the next agent

- **The model is a JSON feature tree**; geometry is a cache. Params are
  expressions, sketches are closed loops on a plane, regions are even-odd (a
  loop inside a loop is a hole), an extrude or revolve sweeps a region. Faces
  come out **named** (`bracket.pilot[0]`, `slider.railA[0]`) with exact
  geometry (a cylinder's axis and diameter, a plane's normal).
- **Two kernels.** Manifold previews in milliseconds, always builds, no
  names. Truck builds exact with names — and fails or leaks open edges on most
  booleans. A cut across a block came back with 40 open edges and `face[k]`
  names on the first probe. **Rule followed here: every part is exactly one
  sweep of one outer loop with holes.** Joints that need holes in two
  directions are split along real part lines and fixed-mated: the saddle keys
  over a neck on the nut bracket; the finger drops over a neck on the slider.
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

## Why v4: pivots, and load symmetry

v3's cam was a Ø4 pin sliding in a printed 45° slot: a line contact carrying
the whole grip load with sliding friction, wearing into backlash, and a
single yoke plane 15 mm above the screw axis that put a couple on the
carriage. v4:

1. **Every joint is a pivot.** Hardened Ø4 dowels in Ø6 × 6 bronze bushings
   pressed into the link eyes. Each pin carries a link above and a link
   below, so every pin is in double shear: the finger pin through the tab,
   the carriage pin through the crossbar.
2. **The links straddle the guide plane.** Upper link z 20–26, lower 6–12,
   tab 12–20, rail centre and pad centre at z 16. The linear block sees
   zero roll and zero pitch; what remains is the yaw couple between the pad
   20 mm ahead of the block and the pin 15 mm behind it, 2.1 N·m at a
   60 N grip.
3. **The carriage pivots sit outboard and ahead of the carriage body**
   (x ±36, 8 mm ahead), on a crossbar keyed to the neck, so the links never
   sweep the carriage, the rods or the nut. That forces the crossed
   geometry: finger pivots inboard, nut forward to close, thrust collar on
   the bulkhead's front face, nut flange behind the carriage in
   compression.
4. **What pivots cost: the force ratio follows the link angle.**

| object width | link angle from the screw | finger force at 120 N thrust |
|---|---|---|
| 0 (closed) | 62.7° | 116 N |
| 10 mm | 44.7° | 59 N |
| 20 mm | 31.2° | 36 N |
| 30 mm | 19.5° | 21 N |
| 36 mm (open) | 12.8° | 14 N |

   The v3 cam gave 60 N everywhere. Longer links flatten the curve and cost
   stroke and width; a full-length NEMA 17 triples the thrust for 18 mm of
   length (`motorLen`).

`forces()` and `moments()` in `gripper.mjs` print these; the v2 finger is
kept in the moments table for the record (friction ratio 2.08, self-locking).
The carriage's drive couple into the rods is unchanged at 1.7 N·m, friction
ratio 0.35 with printed bushings and 0.14 with bronze, because the drive
plane cannot reach the screw axis.

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward
the pads), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the flange
face. The tool centre line is the case centre, 3.5 above the screw axis.

```
  y=0     rear plate = ISO 9409-1-50-4-M6 flange: 4 × Ø6.6 on PCD 50, Ø6 dowel, Ø32 boss hole
  14–36   NEMA 17 pancake, Tr8×2 shaft; bulkhead 36–42 takes its pilot, 4 × M3, and the two rods
  42–46   thrust collar Ø14 on the screw, against the bulkhead's front face
  38–102  two Ø6 rods at x = ±19, z = 0, pressed into the bulkhead and the front wall
  59–73   carriage centre stroke (open → closed), 20 thick; crossbar keyed on its neck, z 12–20
  yn+8    crossbar pivot pins at x ±36, z 6–26; links 27 mm to the finger pins at (±xp, 95)
  89–122  finger tabs, z 12–20, pin at y 95; through the wall slot and the carrier window
  98–104  front wall, 104 wide: screw bearing Ø8.2, rod seats, one 74 × 8.4 slot for the tabs
  104–114 MGN9 rail (z 16) and blocks on the wall's outer face; carriers 114–120; pads 120–140
```

The document is kinematic. The drive turns a hidden `clock` at 5 rpm, so one
turn is one grip cycle of 12 s, and everything else is derived:

```
spin = 360 · (ynClosed − ynOpen)/lead · (1 − cos θ)/2    screw angle: 0 → 7 turns → 0
yn   = ynOpen + lead · spin/360                           carriage centre, 58.7 → 72.6 → 58.7
dy   = yf − py − yn                                       link reach along Y
x    = √(L² − dy²)                                        link reach along X
xp   = px − x                                             finger pivot x, 30 → 12 → 30; opening = 2(xp − 12)
phi  = atan2(dy, −x)                                      right link angle
```

| finger pivot x | block x | nut y | link angle | opening |
|---|---|---|---|---|
| 12 (closed) | 18 | 72.6 | 62.7° | 0 |
| 21 | 27 | 62.6 | 33.7° | 18 |
| 30 (open) | 36 | 58.7 | 12.8° | 36 |

## The parts

Every part builds exact on Truck, watertight, every face named (verified
through `/mcp` for all twenty-one plus the mirrored tab, carrier and pad).

| part | sweep | key faces | holds |
|---|---|---|---|
| rear-flange | XZ extrude, 96 × 61 × 8 | `plate.bolt[k][j]` Ø6.6 PCD 50, `plate.dowel[k]`, `plate.boss[k]` | the robot |
| floor, lid | XY extrude, 96 × 90 × 4 | `lid.window[k]` | the box |
| side-wall (×2) | YZ extrude, 90 × 53 × 4, plain | — | the box |
| bulkhead | XZ extrude, 87 × 52 × 6 | `plate.pilot[k]`, `plate.bolt[k][j]`, `plate.rodR/L[k]` Ø6 | motor, rods, collar |
| front-wall | XZ extrude, 104 × 61 × 6 | `plate.bore[k]` Ø8.2, `plate.rodR/L[k]`, `plate.slot[k]` | screw end, rods, rail; tabs pass |
| motor | XZ extrude, 42.3 square, 22 long | — | stand-in; its shaft is the screw |
| screw | extrude circle, Ø8 × 68 | `screw.od[k]` | thread not modelled |
| collar | revolve, Ø14 × 4, Ø8 bore | — | thrust into the bulkhead |
| rod (×2) | XZ extrude circle, Ø6 × 64 | `rod.od[k]` | x = ±19 by `params` |
| nut | revolve, Ø22 flange, Ø10 body, Ø8.4 bore | — | thread clearance 0.2 |
| carriage | XZ extrude, 52 wide, 20 thick, neck 30 × 8 | `carriage.bore[k]`, `carriage.rodR/L[k]` Ø6.2, `carriage.bolt[k][j]` | nut, rods, crossbar |
| crossbar | XY extrude, 84 × 24 × 8, window 30.2 × 20.2 | `crossbar.pivotR/L[k]` Ø4 | the carriage pins |
| link (×4) | XY extrude, 27 dog-bone, 10 wide, 6 thick, Ø6 eyes | `link.eye[k][j]` | bushings |
| bushing (×8) | revolve, Ø6 × 6, Ø4.1 bore | — | bronze; press in the eye, runs on the pin |
| pin (×4) | extrude circle Ø4 × 20 | `pin.od[k]` | press in tab or crossbar, two links each |
| tab (×2) | XY extrude, 12 × 33 × 8 | `tab.pin[k]` Ø4 | `side: -1` mirrors; the clevis tang |
| carrier (×2) | XZ extrude, 27 × 36 × 6 | `carrier.blockA–D[k]` Ø3.4 on 10 × 15, `carrier.padA/B[k]`, `carrier.window[k]` | block, tab, pad |
| block (×2) | YZ extrude, MGN9C stand-in 20 × 8 × 28.9 with a channel | — | purchased |
| rail | YZ extrude, MGN9 stand-in 9 × 6.5 × 104 | `rail.outline[k]` | purchased; mount holes not modelled |
| pad (×2) | XZ extrude, 12 × 20 × 20 | `pad.outline[k]` gripping face, `pad.tapA/B[k]` Ø2.5 | `side: -1` mirrors |

Closed forms: block, floor, rail and side-wall 0.000 %, front-wall 0.003 %,
collar 0.004 %, crossbar 0.007 %, rear-flange and tab 0.012 %, link 0.017 %,
nut and pad 0.028 %, rod and screw 0.16 %, bushing 0.29 % (chord error of
thin cylinders).

## Fits and what is not modelled

- Running: rods Ø6 in Ø6.2; pins Ø4 in Ø4.1 bushings; nut Ø10 in Ø10.2;
  screw Ø8 in Ø8.4 nut and Ø8.2 front bearing; boss Ø22 in Ø22.5 pilot;
  block 2 mm above the rail's mounting surface.
- Fixed (press, keyed, or a fastener that is not drawn): bushings in link
  eyes, pins in tabs and crossbar (retaining clips), rods in bulkhead and
  front wall, tabs through the carrier windows (cross pin), carriers on
  blocks (4 × M3), pads on carriers (2 × M3 into heat-set inserts), rail on
  the front wall (M3 at 20 pitch), the six case plates to each other, motor
  to bulkhead, nut flange to carriage.
- The carriage slides 2 mm above the floor on its rods; bronze rod bushings
  and the thrust washer are not modelled.
- Link pins carry ~260 N each at closed (both links); a Ø4 hardened dowel
  in 6 mm bushings is comfortable. Link bending is in-plane.
- No recess for the robot flange's Ø31.5 boss: it passes through the Ø32
  hole into the 6 mm behind the motor. Locate on the dowel.
- 1.15 mm of wall between the carriage bore and the flange bolt holes, the
  Tr8 flange nut's own geometry. Print the carriage in something stiff.
- The rail and blocks are stand-ins for purchased MGN9 parts; the guide is
  exposed on the front wall, so a bellows or cover is the next part.
- Threads, fasteners, cable exit, the motor's D-flat, and any fillets (Truck
  cannot; the page's OCCT button can) are not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight with
all faces named (24 builds through `/mcp`); the closed forms above; the
assembly resolves through `/mcp` (41 components, 26 distinct builds,
`remaining: []`); the clearance audit in `gripper.mjs` at closed, mid and
open.

**Run by the workflow, not from here:** the Manifold interference check
through the motion (`agent/check.mjs`) at eight instants of the cycle, and
the publish. Read its log for the `no interference` lines.

**Not verified anywhere here:** the MGN9C moment ratings against the 2.1 N·m
yaw; those are catalogue numbers to check.

## Open it

Published by the `cad gripper` workflow into the morphyx repo,
`did:plc:yivyyp54vddf7qf2lpsikhe4`; the first revisions are v1, the plate-
mounted link gripper:

- **The assembly**, kinematic, parts pinned by revision URI:
  https://cad.mino.mobi/?at=at%3A%2F%2Fdid%3Aplc%3Ayivyyp54vddf7qf2lpsikhe4%2Fcom.minomobi.cad.part%2F3mvbzwq2v2h2f
- The parts: `gripper/parts/<name>` in the same repo — the files tab lists
  them; `list_files` on `/mcp` with `repo: morphyxmino.bsky.social`; or
  `node agent/drive.mjs ls --at morphyxmino.bsky.social` from the mirror.
  Fork one with `drive.mjs fork <uri> <path>`; the lineage crosses repos.
- Parts inline: `node gripper.mjs --print`, then paste into the viewer's
  tree tab, or take the `link` an `/mcp` `build` returns. Press *spin*.
- Re-publish after a change: push to this branch with `[publish]` in the
  commit message (or dispatch the workflow with `publish` on). Unchanged
  trees are skipped; a changed one becomes one new revision.
