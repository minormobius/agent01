# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 3: the moment loads are designed for. An ISO 9409-1-50-4-M6 tool
flange is the rear plate of an 84 × 61 × 104 mm case. Inside: a NEMA 17
pancake stepper with an integrated Tr8×2 lead screw, a flange nut in a
carriage riding two Ø6 rods, and a tapered cam yoke with two 45° slots. The
fingers ride one MGN9 ball guide across the front wall's outer face, one
block each, with the pads bolted to a carrier on the block; each finger's
tab reaches back through the wall to its cam pin. A thrust collar behind
the front wall takes the cam thrust. Opening 0 → 40 mm in 10 turns.
Nineteen parts, one assembly, every part one sweep. Versions 1 and 2 are the
earlier revisions of the same files; their retired parts live under
`gripper/v1/` and `gripper/v2/`.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`), written by
the `cad gripper` workflow. It was designed from the live site alone, by an
agent, through the site's own doors: the docs page, `SKILL.md`, `README.md`,
the bench trees, the `/mcp` server, and the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the kinematic assembly, the moment-and-friction audit, an analytic clearance audit, closed forms. `node gripper.mjs` writes `parts/`, `gripper.json`, `expected.json` |
| `parts/*.json` | the nineteen part trees, as generated |
| `gripper.json` | the assembly, kinematic (a clock drive, everything derived), parts inline — paste into the viewer's tree tab and press spin |
| `expected.json` | closed-form volumes for the parts that have one |
| `publish.mjs` | writes parts then the assembly (parts pinned to revision URIs) into a repo; idempotent; retires superseded parts under `gripper/v1/`, `gripper/v2/` |
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

## Why v3: moments and binding

v2 drove each finger from a cam pin 17 mm below its two 12 mm bushings and
10 mm behind their centre, and put the pads 39 mm ahead of them. A plain
slider binds when the friction its own drive induces exceeds the drive:
with μ = 0.25 for a printed bushing on steel, the pin's offsets alone made
about 2 F of friction against 1 F of drive. Self-locking. The nut carriage
had no guide, so the cam thrust, 15 mm above the screw axis, pitched the
nut on its thread; and that thrust went into a pancake stepper's bearing,
rated for roughly a tenth of it.

v3, by leverage:

1. **Ball guide for the fingers.** One MGN9 rail on the front wall's outer
   face, one MGN9C block per finger. μ ≈ 0.005, so the cantilevers are
   catalogue moment ratings, not a jam. At the 60 N design grip: roll 1.7,
   pitch 1.7, yaw 2.5 N·m on each block (the yaw is a couple: the pad 20 mm
   ahead of the block, the pin 22 mm behind, forces opposed). Check those
   against the block's ratings; an MGN9H block (39.9 long) buys margin at
   the cost of 11 mm of case width.
2. **Rods for the carriage.** Two Ø6 rods along Y through 20 mm bushing
   bores in the carriage. The nut sees thrust only; the screw torque and
   the cam couple (1.8 N·m, thrust 15 mm above the rods) react into the
   rods. Friction ratio 0.375 with printed bushings; bronze bushings take
   it to 0.15.
3. **Thrust collar** behind the front wall. Gripping pulls the screw
   forward, so the collar bears on the wall's inner face. The nut flange
   sits behind the carriage, so gripping loads it in compression.
4. **Tapered yoke tongue** so the cam pin line stays 22 mm behind the
   block centre and the tongue passes through the front wall at full open,
   tip 19 mm each side of centre.

`moments()` in `gripper.mjs` prints these numbers; the v2 finger is kept
in that table for the record.

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward
the pads), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the flange
face. The tool centre line is the case centre, 3.5 above the screw axis.

```
  y=0     rear plate = ISO 9409-1-50-4-M6 flange: 4 × Ø6.6 on PCD 50, Ø6 dowel, Ø32 boss hole
  14–36   NEMA 17 pancake, Tr8×2 shaft; bulkhead 36–42 takes its pilot, 4 × M3, and the two rods
  38–102  two Ø6 rods at x = ±19, z = 0, pressed into the bulkhead and the front wall
  57–77   carriage stroke (closed → open), 20 thick; yoke keyed on its neck, z 12–18, tongue tip at +37
  82–122  finger tabs, z 19–27, pin at y 88 riding the slot; through the wall slot and the carrier window
  92–98   thrust collar Ø14 on the screw, against the front wall's inner face
  98–104  front wall, 104 wide: screw bearing Ø8.2, rod seats, one 74 × 15 slot for tongue and tabs
  104–114 MGN9 rail (z −14) and blocks on the wall's outer face; carriers 114–120; pads 120–140
```

The document is kinematic. The drive turns a hidden `clock` at 5 rpm, so one
turn is one grip cycle of 12 s, and everything else is derived:

```
spin = 360 · (open − closed)/lead · (1 − cos θ)/2     screw angle: 0 → 10 turns → 0
yn   = closed + lead · spin/360                        carriage centre, 57 → 77 → 57
xf   = xfClosed + (yn − closed)                        finger line x, 16 → 36 → 16; opening = 2(xf − 16)
xp   = xf − 6                                          cam pin x, 10 → 30
```

| nut y | finger x | pin x | opening | tongue tip y |
|---|---|---|---|---|
| 57 (closed) | 16 | 10 | 0 | 94 |
| 67 | 26 | 20 | 20 | 104 |
| 77 (open) | 36 | 30 | 40 | 114 |

Grip force per finger ≈ nut thrust / 2 at 45° before friction. A pancake
NEMA 17 (≈ 0.13 N·m) on Tr8×2 at ~30 % efficiency gives ~120 N of thrust,
so ~60 N per finger, the figure the moment audit uses.

## The parts

Every part builds exact on Truck, watertight, every face named (verified
through `/mcp` for all nineteen plus the mirrored tab, carrier and pad).

| part | sweep | key faces | holds |
|---|---|---|---|
| rear-flange | XZ extrude, 84 × 61 × 8 | `plate.bolt[k][j]` Ø6.6 PCD 50, `plate.dowel[k]`, `plate.boss[k]` | the robot |
| floor, lid | XY extrude, 84 × 90 × 4 | `lid.window[k]` | the box |
| side-wall (×2) | YZ extrude, 90 × 53 × 4, plain | — | the box |
| bulkhead | XZ extrude, 75 × 52 × 6 | `plate.pilot[k]`, `plate.bolt[k][j]`, `plate.rodR/L[k]` Ø6 | motor, rods |
| front-wall | XZ extrude, 104 × 61 × 6 | `plate.bore[k]` Ø8.2, `plate.rodR/L[k]`, `plate.slot[k]` | screw end, rods, rail; tongue and tabs pass |
| motor | XZ extrude, 42.3 square, 22 long | — | stand-in; its shaft is the screw |
| screw | extrude circle, Ø8 × 68 | `screw.od[k]` | thread not modelled |
| collar | revolve, Ø14 × 6, Ø8 bore | — | thrust into the front wall |
| rod (×2) | XZ extrude circle, Ø6 × 64 | `rod.od[k]` | x = ±19 by `params` |
| nut | revolve, Ø22 flange, Ø10 body, Ø8.4 bore | — | thread clearance 0.2 |
| carriage | XZ extrude, 52 wide, 20 thick, neck 30 × 6 | `carriage.bore[k]`, `carriage.rodR/L[k]` Ø6.2, `carriage.bolt[k][j]` | nut, rods, yoke |
| yoke | XY extrude, 72 wide tongue, 6 thick, window 30.2 × 20.2 | `yoke.slotR[k]`, `yoke.slotL[k]` 4.2 wide at 45° | the finger pins |
| pin (×2) | extrude circle Ø4 × 15 | `pin.od[k]` | press in the tab, runs in the slot |
| tab (×2) | XY extrude, 12 × 40 × 8 | `tab.pin[k]` Ø4 | `side: -1` mirrors |
| carrier (×2) | XZ extrude, 27 × 56 × 6 | `carrier.blockA–D[k]` Ø3.4 on 10 × 15, `carrier.padA/B[k]`, `carrier.window[k]` | block, tab, pad |
| block (×2) | YZ extrude, MGN9C stand-in 20 × 8 × 28.9 with a channel | — | purchased |
| rail | YZ extrude, MGN9 stand-in 9 × 6.5 × 104 | `rail.outline[k]` | purchased; mount holes not modelled |
| pad (×2) | XZ extrude, 12 × 20 × 20 | `pad.outline[k]` gripping face, `pad.tapA/B[k]` Ø2.5 | `side: -1` mirrors |

Closed forms: block, floor, rail and side-wall 0.000 %, front-wall and yoke
0.003 %, collar 0.005 %, tab 0.010 %, rear-flange 0.014 %, nut and pad
0.028 %, rod and screw 0.16 % (chord error of a plain cylinder).

## Fits and what is not modelled

- Running: rods Ø6 in Ø6.2; pins Ø4 in 4.2 slots; nut Ø10 in Ø10.2; screw Ø8
  in Ø8.4 nut and Ø8.2 front bearing; boss Ø22 in Ø22.5 pilot; block 2 mm
  above the rail's mounting surface.
- Fixed (press, keyed, or a fastener that is not drawn): rods in bulkhead
  and front wall, pins in tabs, tabs through the carrier windows (cross
  pin), carriers on blocks (4 × M3), pads on carriers (2 × M3 into heat-set
  inserts), rail on the front wall (M3 at 20 pitch), the six case plates to
  each other, motor to bulkhead, nut flange to carriage.
- The carriage slides 2 mm above the floor on its rods; bronze bushings and
  the thrust washer are not modelled.
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
all faces named (22 builds through `/mcp`); the closed forms above; the
assembly resolves through `/mcp` (27 components, 24 distinct builds,
`remaining: []`); the clearance audit in `gripper.mjs` at closed, mid, open
and the two steps before open, where the tongue tip passes the carriers.

**Run by the workflow, not from here:** the Manifold interference check
through the motion (`agent/check.mjs`) at eight instants of the cycle, and
the publish. Read its log for the `no interference` lines.

**Not verified anywhere here:** the MGN9C moment ratings against the 1.7 /
1.7 / 2.5 N·m applied; those are catalogue numbers to check.

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
