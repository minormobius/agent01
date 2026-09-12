---
name: cad
description: Design parts and assemblies headlessly with the feature-tree CAD engine behind cad.mino.mobi — write a tree, build it, measure it, check interference, export STL or STEP, render views to PNG, save it to a repo — and hand the result over as a cad.mino.mobi link. Use when asked to model, modify, measure or check a mechanical part or assembly.
---

# CAD, headlessly

The model is a **feature tree** (JSON). Geometry is a cache. You edit the
tree, the engine builds it, you read numbers and pictures back, you iterate.
Never edit meshes. The schema is `README.md` next to this file; the trees
under `bench/` are the worked examples (`gear`, `plate`, `case`, `cam`,
`clock` …); the design record is `docs/CAD.md` in the monorepo.

Everything below needs **node 22 and nothing else**: the engine is
`cad.wasm`, committed. Run every command from this directory. Used this
before? `CHANGELOG.md` (also `cad.mino.mobi/CHANGELOG.md`) lists what
changed and when, newest first.

## The loop

```
write tree.json → build → measure → (check) → render → judge → edit → …
```

| step | command | reads back |
|---|---|---|
| resolve only | `node agent/build.mjs tree.json --check` | params, sketches, ops, or the first error with its op id |
| build, exact | `node agent/build.mjs tree.json [--faces] [--json r.json] [--stl a.stl] [--step a.step]` | volume, area, bbox, centroid, χ, watertight; `--faces` lists every **named** face with its geometry (plane / cylinder); a typed error with `unsupported` when the kernel cannot. Exit 1 unless ok and watertight |
| build, preview | `node agent/build.mjs tree.json --kernel manifold` | always builds, milliseconds, polygons, no names |
| measure | `node agent/measure.mjs tree.json --list` · `… <face>` · `… <faceA> <faceB>` | a cylinder's diameter; plane-to-plane, axis-to-axis, axis-to-plane distances, from exact geometry |
| interference (assemblies) | `node agent/check.mjs asm.json [--t seconds \| --sweep N [--period s]] [--json]` | interfering pairs with shared volume, at one instant or the worst through a cycle; exit 1 if any beyond expected touches (fixed- and screw-mated) |
| clearance (assemblies) | `node agent/check.mjs asm.json --clearance 1 [--sweep N]` | every pair's nearest approach from the exact meshes — crossing, contained, touching, or the distance — with a verdict; in a sweep each minimum is chased between samples; exit 1 on a collision or a pair closer than 1 mm |
| measure across an assembly | `node agent/measure.mjs asm.json finger-r.pad finger-l.pad --t 0.5` | two parts' named faces posed at t: the kinematics measured directly |
| drawing | `node agent/drawing.mjs tree.json --out a.svg [--views front,top,iso] [--no-hidden] [--t s]` | an SVG engineering drawing: third-angle views, hidden lines dashed, the overall width, height and depth, every hole called out by count, diameter and depth when blind. On an assembly, posed at `t`, reference components left out |
| audit a repo | `node agent/audit.mjs --at handle [--kernels]` | rebuild every published part and diff it against the invariants its revision recorded; `--kernels` also checks Truck and Manifold agree on volume |
| printable | `node agent/export.mjs doc.json --out DIR [--t s]` | one STL per part (and a posed assembly STL) |
| look | `node agent/render.mjs doc.json --out DIR [--views iso,top,front] [--t s] [--hide dial,case]` | a PNG per view + `report.json` — the same viewer a human sees. Needs Chromium once: `npm install && npx playwright-core install chromium`, or `CAD_CHROME=/path/to/chrome` |
| files | `node agent/drive.mjs ls\|get\|put\|log\|fork\|push\|rm …` | a file tree over ATProto records — see *Files* below |

Any of these takes `bench:<name>` or an `at://` URI in place of a path.

Face names are stable and semantic: an extrude `plate` has `plate.start`,
`plate.end`, `plate.side[k]`, and loops with a `name` give `plate.rim[0..3]`,
`plate.pivot[2][1]`; a `gear` op `g` gives `g.tooth[i].flank.r.0`, `g.tip`,
`g.bore[k]`. Use names, never face indices.

## Which kernel

- **Manifold** (preview; `check.mjs`; `export.mjs` fallback): milliseconds,
  always builds, polygons, no face names.
- **Truck** (`build.mjs`, `measure.mjs`): exact B-rep with named faces and
  geometry; fast on sweeps, **fails on many booleans** (`boolean union
  failed`, `unsupported`). Prefer even-odd regions over booleans: a hole is
  a loop inside a loop, a pattern of holes is a `pattern` of a sketch, and
  the profile of an `extrude` is a list of sketches.
- **OCCT** (fillets, chamfers, shells, the booleans Truck fails): in the
  page on demand (*exact with OCCT*), and in the bake-off harness under
  node (`bakeoff/`, needs `cd bakeoff && npm install`, 66 MB). Not in
  `build.mjs`.

Sketch curves: lines, arcs (`via`), cubic Béziers (`ctrl`), and splines
through points (a `spline` segment inside a `path`, or a closed `spline`
loop — `bench/cam.json`). Splines are Catmull–Rom, one exact cubic per span,
one face per span, named `id.<loop name>[k]` (`cam.cam[7]`) or `id.span[k]`
when the loop is unnamed. There are no lofts, sweeps along a path, or
free-form surfaces yet; say so rather than approximating with polygons.

## Assemblies

A document with `components` (each a `part` from `parts` — an inline tree,
`bench:<name>`, or the **AT URI of a published part** (its head, or a
revision URI to pin a version) — optional `params` overrides, `at`,
`rotate`, `phase`, `repeat`, or a nested `assembly`), `mates` and a `drive`
(`{component, rpm}` or an `escapement`). Gear phases are automatic. See
`bench/clock.json`. Kinematics are a chain from the driven component, not a
constraint solver — placements are yours to get right; `check.mjs` tells
you when you have not.

**Mates** propagate from the driven component outward, in either direction:

| mate | fields | b does |
|---|---|---|
| `gear` | `za`, `zb` | turns −za/zb × a |
| `belt` | `ra`, `rb` (or `za`, `zb`) | turns +ra/rb × a — pulleys, chain, same sense |
| `fixed` | | turns and travels with a |
| `screw` | `lead`, `axis?` | travels `lead` per turn of a, along `axis` (b's local, default +z); does not turn |
| `rack` | `r` (or `m`, `z`), `axis?` | travels r·θ along its axis per θ of a — a pinion on a rack |
| `slider` | `ratio?` | travels ratio × a's travel |

Numbers in a mate are expressions in the document's scope. A component's
pose is its placement, then its travel, then its turn about its own z.
Travel is carried between components **in world**: a `fixed` follower
placed at 90° to the part it rides moves the same world direction, in its
own frame that is a different axis. A component placed by reference on
another (`@platform.pivot[i]`) already follows it, so a `fixed` mate
between the two adds nothing — the solver skips it rather than travelling
twice. `bench/lift.json` is a lead screw, a nut and a platform.

**Repeat.** `"repeat": 4` makes `id[0]` … `id[3]` with `i` in scope for
`at`, `rotate`, `offset`, references, `params` and the document's `derived`
— six bolts on a bolt circle are one component: `"at": ["r*cos(2*pi*i/6)",
"r*sin(2*pi*i/6)", 0]`, or `"derived": { "bx": "r*cos(2*pi*i/6)" }` and
`"at": ["bx", "by", 0]`. A derived that mentions `i` is evaluated per
instance; outside a repeat `i` is 0.

**Place by feature.** `"at": "@platform.pivot[i]"` puts the component's
origin on that named face of that component — a bore's centre on its
sketch plane, a plane's centroid — and `"rotate": { "align":
"@platform.pivot[i]" }` turns its local +z onto the bore's axis or the
plane's normal (`deg` then spins about it, `offset` moves in the aligned
frame). The op prefix may be left off (`pivot[2]` finds `plate.pivot[2]`);
bracket contents are expressions. The referenced component must be
declared earlier in the same document, and the reference follows it
through its motion, so a bolt on a plate that turns orbits — no mate
needed. `check.mjs`, `build.mjs`, the MCP tools and the viewer all resolve
references (the exact kernel names the faces); a missing face lists what
there is.

**Sweep and clearance.** `node agent/check.mjs asm.json --sweep 24` checks
24 instants over one period of the drive (a turn, two beats, or `--period`
seconds) and reports each pair's worst overlap and when. Add
`--clearance 1` for what a reviewer reads first: every pair's nearest
approach (crossing, contained, touching, or the distance in mm) with a
verdict, and in a sweep the minimum of each pair is chased between
samples by a golden-section search, so a graze between two instants is
found, not missed. The verdicts:

| verdict | means | passes |
|---|---|---|
| `collision` | crossing, one inside the other, or any depth | no |
| `contact` | touching with no depth, and no clearance was demanded | yes |
| `expected` | a touch the mates imply (fixed, screw) or a `fits` entry declares with `"contact": true` | yes |
| `fit` | a pair with a declared fit, within its `[min, max]` | yes |
| `close` | nearer than the clearance you asked for, or under a fit's `min` | no |
| `loose` | over a fit's `max` | no |
| `clear` | farther than the clearance | yes |

A running fit is not "close": declare it, and it is judged against its
own numbers rather than the clearance you demand of everything else —

```json
"fits": [ { "a": "screw", "b": "nut", "min": 0.05, "max": 0.15 },
          { "a": "platform", "b": "bolt[*]", "min": 0.05, "max": 0.15 },
          { "a": "nut", "b": "platform", "contact": true } ]
```

`[*]` matches every instance of a repeat; either order of `a` and `b`
matches; numbers may be expressions. Only the pairs within four times the
clearance (and at least 1 mm) are refined — a pair 10 mm away cannot graze.

Clearance needs no kernel, so the MCP `interference` tool runs it on the
server (`clearance`, `sweep`, `period`); shared volumes still need Manifold,
which is local. **A big assembly does not fit in one server request.** The
call has a CPU budget: part meshes are cached between calls, and a sweep
that runs out of time answers `done: false` with `next` — call again with
`from: next` until `done`, then take the smallest distance per pair across
the windows. If the budget goes on building parts instead, the answer says
so (`incomplete: "parts"`, with what is left) and the next call gets
further. Locally there is no budget: `agent/check.mjs` sweeps the whole
cycle in one go, and for a 45-component assembly that is the faster path. Distances
come from the exact meshes at a fine tessellation (chord tolerance
0.0025 mm), so a designed 0.1 mm reads 0.098; set a fit's `min` with that
in mind.

**Reference geometry.** `"reference": true` on a component draws it
translucent and keeps it out of the interference check, the clearance
table and the export — a placeholder pin, the mating part you are
designing against. `hidden` is display only; every tool still counts a
hidden component.

**Measure across an assembly.** `node agent/measure.mjs asm.json
finger-r.pad finger-l.pad --t 0.5` (and the MCP `measure` tool with `t`)
poses the assembly and measures two parts' named faces against each other
— plane to plane, axis to axis — which tests the kinematics directly
instead of your own pose arithmetic.

**Audit a corpus.** Every published revision carries the invariants it
was judged by. `node agent/audit.mjs --at <handle> --kernels` rebuilds
every head in a repo and diffs volume, χ, watertightness and face count
against the record, and checks Truck and Manifold still agree on volume
within `--tol` (1 % by default; chord error on small round parts is
~0.3 %). The publish workflow runs it on the bench repo after every
publish.

**Placements are expressions**, so the pose math for anything the mates
cannot express (a lead screw and its nut, a crank and its slider, a link
that closes a loop) lives in the document. An assembly may carry `params`
(numbers or expressions over each other, any order) and `derived`, a
second map resolved the same way at each instant — any order, since a
record's keys come back from a PDS sorted — with two reserved variables: `t` (seconds) and `theta` (the driven component's angle in
degrees; the escape wheel's for an escapement). Every `at` element,
`rotate.deg`, `rotate.axis` element and the drive's numbers take a number
or an expression over params + derived + t + theta. Component `params`
overrides are bound in the assembly scope at t = 0 when they can be
(`"length": "L"`), else handed to the part. `bench/crank.json`:

```json
{ "params": { "r": 10, "L": 30 },
  "derived": { "th": "deg(theta)", "px": "r * cos(th)", "py": "r * sin(th)",
               "reach": "sqrt(L^2 - py^2)", "xs": "px + reach",
               "phi": "rad2deg(atan2(-py, reach))" },
  "components": [
    { "id": "crank", "part": "crank", "params": { "length": "r" } },
    { "id": "rod",   "part": "rod",   "at": ["px", "py", 1], "rotate": { "axis": [0, 0, 1], "deg": "phi" } },
    { "id": "block", "part": "block", "at": ["xs", 0, 2] } ],
  "drive": { "component": "crank", "rpm": 30 } }
```

Mind the two angle helpers: `deg(x)` turns degrees *into* radians (for
`sin`/`cos`), `rad2deg(x)` turns radians into degrees (for `rotate.deg`).
`check.mjs --t` and the viewer's *spin* sweep the real motion; a sub-
assembly keeps its own params and derived.

## Files

Parts live in repos as records: a `com.minomobi.cad.part` head names a
path and points at an immutable `com.minomobi.cad.revision` (the tree, its
parents, the kernel and invariants it was judged by). History is the
parents chain and crosses repos, so a fork keeps its lineage.

```bash
node agent/drive.mjs ls --at minomobi.com                      # the published bench: parts/<name>, train, clock
node agent/drive.mjs get clock --at minomobi.com > clock.json  # a tree to build / check / render / export
node agent/drive.mjs put clock/wheel tree.json -m "72 teeth"   # your local drive (~/.cad-drive.json)
node agent/drive.mjs log clock/wheel                           # its history
node agent/drive.mjs fork at://did:…/com.minomobi.cad.part/… parts/gear   # theirs → yours, lineage kept
CAD_HANDLE=you.bsky.social CAD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
  node agent/drive.mjs push clock/wheel --login                # local → your own repo, public
```

`--login` takes an **app password** (Bluesky settings → app passwords),
never the account password. What you push is public and yours; the files
tab on cad.mino.mobi lists it, anyone can open it by AT URI and fork it.
Fork a bench part rather than editing the bench when the change is yours.

## Handing over

Any tree or assembly opens in the viewer as a link: base64url the JSON into
`https://cad.mino.mobi/#t=<…>`, or `?part=<bench name>`, or — best — save
it to a repo and hand over `https://cad.mino.mobi/?at=<AT URI>`: a file the
human can open, fork, and read the history of. The human sees the part,
the report, the named faces, the measure tool and the interference check;
give them the link and the numbers you judged by.

## A worked task

"Add a 72-tooth wheel to the train on a new arbor and prove it meshes."

1. `node agent/drive.mjs get train --at minomobi.com > train.json`; read it.
   Components are `arbor1`, `wheel1` and a sub-assembly `stage2` (its own
   `arbor` and `wheel`, addressed as `stage2/arbor`, `stage2/wheel`); the
   parts are the published arbor and gear by AT URI with `params`
   overrides; mates are `gear` with tooth counts; the drive turns `arbor1`.
2. Add a component `{ "id": "wheel3", "part": "wheel", "params": { "z": 72 },
   "at": [x, y, z] }` at the centre distance `m·(za+zb)/2` from its mate,
   and a `gear` mate `{ "a": "stage2/wheel", "b": "wheel3", "za": …, "zb": 72 }`.
3. `node agent/build.mjs train.json` — every distinct part builds
   watertight. `node agent/check.mjs train.json --t 0.5` — no clash through
   the motion. `node agent/render.mjs train.json --out shots` — look.
4. `node agent/drive.mjs put train/three-stage train.json -m "third wheel"`,
   then push with `--login` and hand over the `?at=` link.

## Honesty

Report what `watertight` and `χ` say, not what the picture looks like. A
Truck failure is not a modelling failure — try the region form, then OCCT
in the page. Volumes are in mm³ when `units` is `mm`. If the renderer is
not installed, say so rather than describing a picture you did not see.
