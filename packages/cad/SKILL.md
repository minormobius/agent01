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
`cad.wasm`, committed. Run every command from this directory.

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
| interference (assemblies) | `node agent/check.mjs asm.json [--t seconds] [--json]` | interfering pairs with shared volume; exit 1 if any beyond fixed-mated bores |
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
`rotate`, `phase`, or a nested `assembly`), `mates` (`gear` with `za`/`zb`,
`fixed`) and a `drive` (`{component, rpm}` or an `escapement`). Gear phases
are automatic. See `bench/clock.json`. Kinematics are a chain from the
driven component, not a constraint solver — placements are yours to get
right; `check.mjs` tells you when you have not.

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
