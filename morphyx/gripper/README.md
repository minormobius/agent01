# gripper — a parallel-jaw robot gripper for cad.mino.mobi

Version 8: the box shrinks to the plunger, and the side walls carry the
grip. An ISO 9409-1-50-4-M6 tool flange plate and a 92 × 44 × 84 mm frame:
two 6 mm side walls run the whole length from that plate to the front wall,
and the NEMA 17 pancake stepper hangs **outside**, bolted to the back wall of
the plunger cavity and exposed between them. The cavity itself is 36 mm
long, cut to what the plunger sweeps. The front wall is the slotted plate
from v7 with the MGN9 rail on its outer face; the four coupling links pass
out through the slots, over and under the rail and its blocks, and pin onto
32 × 22 × 8 jaw plates. The jaw pin sits 5.5 mm from each plate's inner
edge, so the arm pivots come in to x ±34 and the plates meet on the centre
line at closed. Mount centres run 32 → 62 mm. Eighteen parts, two documents.
Versions 1 to 7 are the earlier revisions of the same files; their retired
parts live under `gripper/v1/` … `gripper/v6/`.

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
| `publish.mjs` | writes parts then both assemblies into a repo; idempotent; retires superseded parts under `gripper/v<n>/` |
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

## Why v8: the air comes out, and the grip load gets a path

v7 worked but it was mostly air. The plunger swept about half the cavity,
the screw was 78 mm for 9.6 mm of nut travel, and a NEMA 17 sat inside a
box built around it. v8 takes four things out at once, and they compound:

1. **The motor leaves the box.** It bolts to the outside of the cavity's
   back wall and hangs exposed between the two side walls, which now run
   the whole length from the tool flange to the front wall. The box no
   longer has to be as tall as a 42.3 mm motor, or as long.
2. **The cavity is cut to the sweep.** 36 mm, from the thrust collar to
   3 mm behind the front wall. The screw follows it down to 48 mm.
3. **The linkage moves inboard.** The jaw pin sits 5.5 mm from its plate's
   inner edge instead of on the plate's centre line, so the arm pivots come
   in from x ±47 to ±34 and the box narrows by 24 mm. The links go from 43
   to 40 — *shorter*, because the shorter cavity brings the carriage closer
   to the pin.
4. **The covers stop pretending to be structure.** The lid and floor are
   2 mm plates inset between the side walls, over the cavity only.

What that adds up to:

| | v7 | v8 |
|---|---|---|
| box envelope | 116 × 52 × 116, 700 cm³ | 92 × 44 × 84, 340 cm³ |
| enclosed cavity | 485 cm³ | 92 cm³ |
| screw | 78 mm | 48 mm |
| flange to jaw plate face | 138 mm | 104 mm |
| force at each jaw, closed | 55 N | 61 N |

The force went **up**, which was the interesting part of the trade. Pulling
the pivots inboard shortens the link's X reach and should cost force; but
shortening the cavity shortens its Y reach by more, and the ratio is the
first over the second. Taking a bit from each came out ahead of either.

| mount centres opened from closed | link angle from the screw | force at each jaw, 120 N thrust |
|---|---|---|
| 0 (closed) | 45.4° | 61 N |
| 7.5 mm | 38.2° | 47 N |
| 15 mm | 31.7° | 37 N |
| 22.5 mm | 25.5° | 29 N |
| 30 mm (open) | 19.7° | 22 N |

## The grip load path

This is the part worth being explicit about. During grip the links are
**struts in compression**: they push the jaws inboard against the object and
forward against the rail, and they push the carriage backward. So:

- the **front wall is pushed forward**, away from the box;
- the **carriage is pushed back**, into the nut, into the screw, into the
  thrust collar, into the **back wall, which is pushed backward**;
- the box between those two walls is in **tension**, at about the screw
  thrust — 120 N nominal.

The two side walls are that tension member, and each joint is chosen so no
bolt ever sees the load in shear:

| joint | what the grip does to it | how it is made |
|---|---|---|
| front wall to side walls | pulls them apart | four Ø4.3 through the wall into tapped end faces — **bolts in tension** |
| back wall to side walls | pushes the wall into them | a tenon each side through a **mortise**, bearing on its rear face — **no bolts at all** |
| flange plate to side walls | nothing; it carries the robot load only | four Ø4.3 into their rear end faces |
| lid, floor | nothing | inset covers, four screws each |

The mortise is the piece that makes it work. The back wall is loaded
*toward* the side walls, so bolting it would put the whole grip load in
shear across four screws for no reason; letting it bear on a machined face
is both stronger and simpler. The front wall is loaded *away*, which is the
one case where a bolt is the right answer, and there the bolts are axial.

## The mechanism

World frame in mm: X is jaw travel, Y the screw axis (+Y forward, toward
the fingers), Z up. The screw axis is the line x = 0, z = 0; y = 0 is the
flange face.

```
  y=0      tool flange plate, 92 × 48 × 8: the ISO pattern, and four Ø4.3 into the side walls' rear end faces
  14–36    NEMA 17 pancake, OUTSIDE, hanging between the side walls
  36–42    back wall: the motor's pilot and 4 × M3 outside, the thrust collar inside, tenons through the side walls
  42–78    the plunger cavity, 36 long — all of it swept
  42–46    thrust collar Ø14, bearing on the back wall's inner face
  51–75    carriage sweep (14 long), hanging on the nut; arm tips 1 mm off the side walls
  yn+4     arm pivot pins at x ±34, z ±17; the arms are 22 thick and the links seat on their faces
  78–84    front wall, 98 wide: a slot each side at z ±(10.6…17.4); the screw's blind bore at the centre
  84–90.5  MGN9 rail on the OUTER face, 93 long, closing the bore
  86–96    MGN9C blocks; the links pass over and under them at z ±11…17
  96–104   jaw plates, 32 × 22 × 8: the pin 5.5 from the inner edge, the finger pattern outboard of it
```

Two documents, one set of parts. **`gripper.json`** is the demo cycle: a
`reference` clock at 5 rpm, one turn per grip cycle, everything else
derived. **`gripper-stroke.json`** is the physical stroke: the screw driven
at 5 rpm, a `screw` mate carrying the carriage 2 mm per turn and a second
one along the nut's own +z, `fixed` mates carrying the arms. One stroke is
4.8 turns, 57.5 s.

| jaw pin x | plate centre | nut y | link angle | mount centres |
|---|---|---|---|---|
| 5.5 (closed) | 16 | 68.0 | 45.4° | 32 |
| 13 | 23.5 | 62.6 | 31.7° | 47 |
| 20.5 (open) | 31 | 58.4 | 19.7° | 62 |

## The parts

Every part builds exact on Truck and watertight; every part but the jaw
plate has named faces.

| part | sweep | holds |
|---|---|---|
| rear-flange | XZ extrude, 92 × 48 × 8 | the robot; the side walls' rear bolts |
| side-wall (×2) | YZ extrude, 78 × 44 × 6, with a mortise | **the grip tension** |
| bulkhead | XZ extrude, 92 × 36 × 6 with two tenons | the motor outside, the collar inside |
| front-wall | XZ extrude, 98 × 44 × 6 | the rail, the journal; the links pass; the side walls' front bolts |
| floor, lid | XY extrude, 80 × 36 × 4, inset | covers |
| motor | XZ extrude, 42.3 square, 22 long | stand-in; its shaft is the screw |
| screw | revolve, Ø8 × 48 with a Ø6 × 6 journal | thread not modelled |
| collar | revolve, Ø14 × 4 | thrust into the back wall |
| nut | revolve, Ø22 flange, Ø10 body | thread clearance 0.2 |
| carriage | XZ extrude, 29 × 28 × 14 | nut, arms; hangs on the screw |
| arm (×2) | XY extrude, 29.9 × 14 × 22 | the links seat on its faces |
| link (×4) | XY extrude, 40 dog-bone, 10 × 6 | struts in compression |
| bushing (×8), pin (×4) | revolve, extrude | Ø6 × 6 bronze; Ø4 × 34 dowels |
| **carrier (×2)** | **XZ extrude along Y, 32 × 22 × 8, + one Ø4 cut along Z** | the block, the links, the finger |
| block (×2), rail | YZ extrude | purchased MGN9 stand-ins |

## Fits and what is not modelled

- Running: pins Ø4 in Ø4.1 bushings; nut Ø10 in Ø10.2; screw Ø8 in the
  Ø8.4 nut and the Ø6 journal in the Ø6.2 bore; block 2 mm off the wall on
  the rail; links 0.4 mm inside the wall slots; arms 0.1 in their carriage
  slots, 1 mm off the side walls; the back wall's tenons 0.1 in their
  mortises.
- **The carriage has no way to run on.** It hangs on the nut — the screw
  takes its weight, the arm tips at the side walls take the screw's friction
  torque. There is no floor under it any more.
- The finger pattern is tapped through and closed off by the block behind
  it, so a finger bolt is 8 mm at most.
- The jaw pin is gripped over the plate's 22 mm and a link seats on each
  face outside it, so the pin sees bending over a 6 mm overhang.
- Tapped holes are not drawn: the clearance holes in the flange plate and
  the front wall are, and they land on the side walls' end faces.
- Threads, fasteners, cable exit, the motor's D-flat and all fillets are
  not modelled.

## Verified, and not

**Verified from this sandbox:** every part builds exact and watertight
through `/mcp`, each within its closed-form tolerance; both documents
resolve through the `/mcp` `check` tool (36 and 35 components); the 40
analytic checks in `gripper.mjs` at closed, mid and open, including the
link's passage through its slot at every pose; and the clearance table on
the slot passage and the jaw joint, read in small subsets.

**Run by the workflow, not from here:** the Manifold volume sweep through
the motion on both documents, and the publish.

**Not verified anywhere here:** the MGN9C moment ratings; the side walls'
stiffness in tension, which is a hand calculation away but not modelled;
and whether the exposed motor wants a guard.

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
