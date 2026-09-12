# gripper — a parallel-jaw gripper for cad.mino.mobi

A stepper turns a lead screw. The lead nut, in a bracket, carries a saddle
with two pins. Two links run from those pins to two fingers that ride on rails
across the screw axis. Nut toward the motor: the fingers close. Nut toward the
rails: they open. Sixteen parts, one assembly, every part one sweep.

This directory is the source. The published copy lives in the morphyx repo as
`cad.mino.mobi` files (`gripper/parts/<name>`, `gripper/assembly`), written by
the `cad gripper` workflow. It was designed from the live site alone, by an
agent, through the site's own doors: the docs page, `SKILL.md`, `README.md`,
the bench trees, the `/mcp` server, and the tangled mirror.

| | |
|---|---|
| `gripper.mjs` | the design: every part as a parametric tree, the pose solver, an analytic clearance audit, closed forms. `node gripper.mjs --nut 53` writes `parts/`, `gripper.json`, `expected.json` |
| `parts/*.json` | the sixteen part trees, as generated |
| `gripper.json` | the assembly at the reference pose (nut bracket at y = 53), parts inline — paste into the viewer's tree tab, or open the `#t=` link below |
| `expected.json` | closed-form volumes for the parts that have one |
| `publish.mjs` | writes parts then the assembly (parts rewritten to AT URIs) into a repo; idempotent |
| `../../.github/workflows/cad-gripper.yml` | build exact, closed forms, interference at three poses, publish on request |

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
  `drive`. Kinematics rotate about local Z only — **linear travel is not a
  mate kind**, so the nut position is baked into the placements and the
  generator re-poses the whole mechanism. `rotate: {axis:[1,0,0], deg:-90}`
  points a part built along Z down the +Y screw axis.
- **Three doors.** `/mcp` (no files: `check`, `build`, `measure`, `step`,
  `list_files`, `get_file`; no interference, no write); the 4 MB mirror
  (`git clone https://tangled.org/morphyxmino.bsky.social/cad`; node 22 only:
  `agent/build.mjs`, `check.mjs`, `render.mjs`, `drive.mjs`); the viewer.
  Files are ATProto records: a `part` head over immutable `revision`s, in
  the designer's own repo; anyone opens by AT URI and forks with lineage.
- **Report what `watertight` and χ say, not what the picture looks like.**

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y away from the motor),
Z up. The screw axis is the line x = 0, z = 0; the base top is z = −24.

```
                 y=111  ● finger pin ──── pad face at x = 0 when closed
  rails y=82,98  ═══════╪══════ sliders ride two Ø6 rails, z = 16
                        │ link L = 72
  saddle pins    ●──────┘ at x = ±20, on the nut bracket neck, z = 30..36
  nut bracket    ▮ y = yn (44 closed … 62 open), Ø10.2 bore, 4 × Ø3.5 on PCD 16
  screw          │ T8, y = 21..85, end bearing block y = 76..84
  coupler        ▮ Ø20 × 25, Ø5 / Ø8 stepped bore, y = 4..29
  motor          ▮ NEMA 17 behind a 50 × 50 × 5 bracket at y = −5..0
```

Pose from the nut bracket centre `yn`: Δy = 111 − yn, finger pin x = 20 + √(72² − Δy²).

| nut y | finger pin x | pad gap | link angle | finger travel per mm of nut |
|---|---|---|---|---|
| 44 (closed) | 46.36 | 0 | 68.5° | 2.54 |
| 53 (reference) | 62.66 | 32.6 | 53.7° | 1.36 |
| 62 (open) | 72.75 | 52.8 | 42.9° | 0.93 |

Stroke: 18 mm of nut = 9 turns of a T8×2 = 1800 full steps; ~3 s at 180 rpm.
Grip force per finger ≈ nut thrust / (2 × 2.54) at closed; a NEMA 17 on a T8×2
(≈ 0.4 N·m, ~30 % screw efficiency) gives ~370 N of thrust, so ~70 N per finger.
The links are steepest at closed, which is the low-force end of this linkage;
crossing the links (nut pins outboard, finger pins inboard) inverts that and is
the change to make if grip force matters more than opening.

## The parts

Every part builds exact on Truck, watertight, every face named (verified
through `/mcp` for all sixteen plus the mirrored finger).

| part | sweep | key faces | holds |
|---|---|---|---|
| base | XY extrude, 220 × 173 × 6 | `base.mount[k][j]` Ø4.5 | everything |
| bracket | XZ extrude, 50 × 50 × 5 | `bracket.pilot[k]` Ø22.5, `bracket.bolt[k][j]` Ø3.4 on 31 | the motor |
| motor | XZ extrude, 42.3 square, 5 chamfers, 40 long | — | stand-in |
| motor-shaft | revolve, Ø5 × 24 with Ø22 × 2 boss | — | fixed to coupler |
| coupler | revolve, Ø20 × 25, Ø5 then Ø8 bore | — | fixed to shaft and screw |
| screw | extrude circle, Ø8 × 64 | `screw.od[k]` | thread not modelled |
| end-block | XZ extrude, 30 × 36 × 8 | `block.bore[k]` Ø8.2 | far screw end |
| nut | revolve, Ø22 flange, Ø10 body, Ø8.4 bore | — | thread clearance 0.2 |
| nut-bracket | XZ extrude, 40 wide, neck 30 × 6 on top | `bracket.bore[k]` Ø10.2, `bracket.bolt[k][j]` Ø3.5 PCD 16 | the nut, the saddle |
| saddle | XY extrude, 52 × 16 × 6, window 30.2 × 8.2 | `saddle.pin[k][j]` Ø4, 40 apart | the link pins |
| link | XY extrude, 72 dog-bone, Ø4.2 eyes | `link.eye[k][j]` | running fit on Ø4 pins |
| pin | extrude circle Ø4 × h | `pin.od[k]` | h = 14 (saddle), 22 (finger) |
| rail | YZ extrude, Ø6 × 190 | `rail.od[k]` | y = 82, 98 by `params` |
| rail-block | YZ extrude, 36 × 48 × 8 | `block.railA[k]`, `block.railB[k]` Ø6 | press fit |
| slider | YZ extrude, 28 × 12 with a 12 × 6 neck | `slider.railA[k]`, `slider.railB[k]` Ø6.2 | running fit |
| finger | XY extrude, L in plan, 12 thick, window 24.2 × 12.2 | `finger.outline[3]` pad face, `finger.pin[k]` Ø4 | `side: -1` mirrors |

Measured from exact geometry through `/mcp`: link eye centres 72.00; saddle
pins 40.00; pad face to pin axis 46.36; rail pitch 16.00 in both slider and
block; bracket bolts 31.00; bracket pilot Ø22.50. Closed forms: base 0.000 %,
bracket 0.019 %, saddle 0.017 %, link 0.005 %, nut 0.028 %, rail and screw
0.16 % (chord error of a plain cylinder).

## Fits and what is not modelled

- Running: rails Ø6 in Ø6.2; pins Ø4 in Ø4.2 eyes; nut Ø10 in Ø10.2; screw Ø8
  in Ø8.4 nut and Ø8.2 end bearing; boss Ø22 in Ø22.5 pilot.
- Fixed (press, clamp, or a fastener that is not drawn): rails in blocks,
  pins in saddle and fingers, shaft in coupler, screw in coupler; saddle on
  the bracket neck; finger on the slider neck; bracket, blocks and motor on
  the base. A fixed mate in the assembly says which touches are intended.
- The nut bracket slides 1 mm above the base and takes its torque through
  the links; a guide strip is the obvious next part.
- 1.15 mm of wall between the nut-bracket bore and the flange bolt holes —
  that is the T8 flange nut's own geometry; print the bracket in something
  stiff or counterbore from the back.
- Threads, fasteners, the coupler's clamp screws, the motor's D-flat, and
  any fillets (Truck cannot; the page's OCCT button can) are not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight with
all faces named (17 builds through `/mcp`); the closed forms above; the
measures above; the assembly resolves through `/mcp` (24 components, 19
distinct builds, `remaining: []`); the analytic clearance audit in
`gripper.mjs` at closed, reference and open poses.

**Run by the workflow, not from here:** the Manifold interference check
through the motion (`agent/check.mjs`) at all three poses, and the publish.
The sandbox could not execute the mirror's node scripts, so the workflow is
where that loop closes; read its log for the `no interference` lines.

## Open it

- The reference pose, parts inline, straight from the build:
  the `link` field of an `/mcp` `build` of `gripper.json`, or
  `https://cad.mino.mobi/#t=<base64url of gripper.json>`.
- Once published: `https://cad.mino.mobi/?at=<AT URI of gripper/assembly>`
  in the morphyx repo — the files tab lists it, and anyone can fork a part.
- Another pose: `node gripper.mjs --nut 48 --print | …` and paste into the
  tree tab.
