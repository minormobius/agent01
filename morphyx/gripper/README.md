# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 2: packaged for a robot arm. An ISO 9409-1-50-4-M6 tool flange is
the rear plate of an 88 × 71 × 104 mm case. Inside: a NEMA 17 pancake
stepper with an integrated Tr8×2 lead screw, a flange nut in a carriage, a
cam yoke with two 45° slots, and two fingers under sliders on two Ø6 rails.
The fingers reach out through a slot in the front wall to replaceable pads.
Opening 0 → 40 mm in 10 turns. Sixteen parts, one assembly, every part one
sweep. Version 1 (the plate-mounted link gripper) is the first revisions in
the same files, and its parts live on under `gripper/v1/`.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`), written by
the `cad gripper` workflow. It was designed from the live site alone, by an
agent, through the site's own doors: the docs page, `SKILL.md`, `README.md`,
the bench trees, the `/mcp` server, and the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the kinematic assembly, an analytic clearance audit, closed forms. `node gripper.mjs` writes `parts/`, `gripper.json`, `expected.json` |
| `parts/*.json` | the sixteen part trees, as generated |
| `gripper.json` | the assembly, kinematic (a clock drive, everything derived), parts inline — paste into the viewer's tree tab and press spin |
| `expected.json` | closed-form volumes for the parts that have one |
| `publish.mjs` | writes parts then the assembly (parts pinned to revision URIs) into a repo; idempotent; retires v1-only parts under `gripper/v1/` |
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

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward the
pads), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the flange face.
The tool centre line is the case centre, 8.5 above the screw axis.

```
  y=0    rear plate = ISO 9409-1-50-4-M6 flange: 4 × Ø6.6 on PCD 50, Ø6 dowel, Ø32 boss hole
  14–36  NEMA 17 pancake, Tr8×2 shaft; bulkhead 36–42 takes its pilot and 4 × M3
  54–74  nut carriage stroke (closed → open); yoke keyed on its neck, z 12–18, slots at 45°
  62–88  finger tabs, z 18–26, pin at y 68 riding the slot; sliders above on rails y 72, 84 at z 32
  98–104 front wall: screw end bearing Ø8.2 and a 66 × 10 slot for the arms
  108–126 pads, 20 tall, bolted to the arms; they meet at x = 0 when closed
```

Why not the links: a link pair needs width ≈ pin span + link length, which is
what made v1 150 mm across. A 45° cam slot needs only the opening, and its
force is highest at closed. Finger travel equals nut travel.

The document is kinematic. The drive turns a hidden `clock` at 5 rpm, so one
turn is one grip cycle of 12 s, and everything else is derived:

```
spin = 360 · (open − closed)/lead · (1 − cos θ)/2     screw angle: 0 → 10 turns → 0
yn   = closed + lead · spin/360                        carriage centre, 54 → 74 → 54
xf   = xfClosed + (yn − closed)                        finger pin x, 10 → 30 → 10; opening = 2(xf − 10)
```

The screw sits in a `drivetrain` sub-assembly tilted onto +Y and rotated about
its own Z by `spin`, so it visibly reverses when the gripper does. A stepper
reverses; a constant-rpm drive cannot, which is why the driven component is a
clock rather than the motor.

| nut y | finger pin x | opening |
|---|---|---|
| 54 (closed) | 10 | 0 |
| 64 | 20 | 20 |
| 74 (open) | 30 | 40 |

Grip force per finger ≈ nut thrust / 2 at 45° before friction. A pancake
NEMA 17 (≈ 0.13 N·m) on Tr8×2 at ~30 % efficiency gives ~120 N of thrust,
so ~60 N per finger; a full-length NEMA 17 (0.4 N·m) triples that at the
cost of 18 mm of length (`motorLen`).

## The parts

Every part builds exact on Truck, watertight, every face named (verified
through `/mcp` for all sixteen plus the mirrored finger and pad).

| part | sweep | key faces | holds |
|---|---|---|---|
| rear-flange | XZ extrude, 88 × 71 × 8 | `plate.bolt[k][j]` Ø6.6 PCD 50, `plate.dowel[k]`, `plate.boss[k]` Ø32 | the robot |
| floor, lid | XY extrude, 88 × 90 × 4 | `lid.window[k]` | the box; the lid has an access window |
| side-wall (×2) | YZ extrude, 90 × 63 × 4 | `wall.railA[k]`, `wall.railB[k]` Ø6 | the rails, press fit |
| bulkhead | XZ extrude, 79 × 62 × 6 | `plate.pilot[k]` Ø22.5, `plate.bolt[k][j]` Ø3.4 on 31 | the motor |
| front-wall | XZ extrude, 88 × 71 × 6 | `plate.bore[k]` Ø8.2, `plate.slot[k]` | the screw end; the arms pass through |
| motor | XZ extrude, 42.3 square, 22 long | — | stand-in; its shaft is the screw |
| screw | extrude circle, Ø8 × 67 | `screw.od[k]` | thread not modelled |
| nut | revolve, Ø22 flange, Ø10 body, Ø8.4 bore | — | thread clearance 0.2 |
| carriage | XZ extrude, 40 wide, neck 30 × 6 on top | `carriage.bore[k]` Ø10.2, `carriage.bolt[k][j]` Ø3.5 PCD 16 | the nut, the yoke |
| yoke | XY extrude, 72 × 30 × 6, window 30.2 × 8.2 | `yoke.slotR[k]`, `yoke.slotL[k]` 4.2 wide at 45° | the finger pins |
| pin (×2) | extrude circle Ø4 × 14 | `pin.od[k]` | press in the finger, runs in the slot |
| finger (×2) | XY extrude, 8 thick: tab + arm, window 12.2 × 8.2 | `finger.pin[k]` Ø4, `finger.boltA/B[k]` Ø3.4 | `side: -1` mirrors |
| slider (×2) | YZ extrude, 24 × 12 with a 8 × 6 neck hanging down | `slider.railA[k]`, `slider.railB[k]` Ø6.2 | running fit |
| pad (×2) | XY extrude, 12 × 18 × 20 | `pad.outline[k]` gripping face, `pad.tapA/B[k]` Ø2.5 | `side: -1` mirrors |
| rail (×2) | YZ extrude, Ø6 × 88 | `rail.od[k]` | y = 72, 84 by `params` |

Closed forms: floor 0.000 %, front-wall 0.002 %, side-wall 0.002 %, yoke
0.004 %, rear-flange 0.011 %, nut 0.028 %, rail and screw 0.16 % (chord error
of a plain cylinder).

## Fits and what is not modelled

- Running: rails Ø6 in Ø6.2; pins Ø4 in 4.2 slots; nut Ø10 in Ø10.2; screw Ø8
  in Ø8.4 nut and Ø8.2 front bearing; boss Ø22 in Ø22.5 pilot.
- Fixed (press, keyed, or a fastener that is not drawn): rails in walls,
  pins in fingers, pads on arms (M3 × 2 each into heat-set inserts), fingers
  on slider necks, the six case plates to each other, motor to bulkhead,
  nut flange to carriage. A fixed mate in the assembly says which touches
  are intended.
- The carriage slides 2 mm above the floor; the yoke's pins react its torque.
- No recess for the robot flange's Ø31.5 boss: it passes through the Ø32
  hole into the 6 mm behind the motor. Locate on the dowel.
- 1.15 mm of wall between the carriage bore and the flange bolt holes, the
  Tr8 flange nut's own geometry. Print the carriage in something stiff.
- Threads, fasteners, cable exit, the motor's D-flat, and any fillets (Truck
  cannot; the page's OCCT button can) are not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight with
all faces named (18 builds through `/mcp`); the closed forms above; the
assembly resolves through `/mcp` (23 components, 20 distinct builds,
`remaining: []`); the analytic clearance audit in `gripper.mjs` at closed,
mid and open.

**Run by the workflow, not from here:** the Manifold interference check
through the motion (`agent/check.mjs`) at eight instants of the cycle, and
the publish. Read its log for the `no interference` lines.

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
