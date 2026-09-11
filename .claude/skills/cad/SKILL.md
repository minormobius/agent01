---
name: cad
description: Design parts and assemblies headlessly with the feature-tree CAD engine in packages/cad — write a tree, build it, measure it, check interference, export STL, render views to PNG — and hand the result over as a cad.mino.mobi link. Use when asked to model, modify, measure or check a mechanical part or assembly.
---

# CAD, headlessly

The model is a **feature tree** (JSON). Geometry is a cache. You edit the
tree, the engine builds it, you read numbers and pictures back, you iterate.
Never edit meshes. The design record is `docs/CAD.md`; the schema is in
`packages/cad/README.md`; the bench trees under `packages/cad/bench/` are
the worked examples (`gear`, `plate`, `case`, `clock` …).

## The loop

```
write tree.json → build → measure → (check) → render → judge → edit → …
```

All commands run from `packages/cad/`. The engine is `cad.wasm` (committed)
and the native CLI is `engine/target/release/cad` (build once with
`cd engine && cargo build --release --features stepin`).

| step | command | reads back |
|---|---|---|
| check the tree resolves | `engine/target/release/cad check tree.json` | params, sketches, ops, or the first error with its op id |
| build, exact | `engine/target/release/cad build tree.json --json report.json [--stl out.stl] [--step out.step]` | `report.json`: `ok`, `timings`, `invariants` (volume, area, bbox, centroid, χ, watertight), `faces[]` with **names** and **geometry** (plane / cylinder), typed `error` with `unsupported` |
| measure | `node agent/measure.mjs tree.json --list` · `… tree.json <face>` · `… tree.json <faceA> <faceB>` | a cylinder's diameter; plane-to-plane, axis-to-axis, axis-to-plane distances, from exact geometry |
| interference (assemblies) | `node agent/check.mjs asm.json [--t seconds] [--json]` | interfering pairs with shared volume; exit 1 if any beyond fixed-mated bores |
| printable | `node agent/export.mjs doc.json --out DIR [--t s]` | one STL per part (and a posed assembly STL) |
| look | `node agent/render.mjs doc.json --out DIR [--views iso,top,front] [--t s] [--hide dial,case]` | PNG per view + `report.json`; needs `cd bakeoff && npm install` once |
| diff two trees | `engine/target/release/cad diff a.json b.json` | params and features added / removed / changed |

Face names are stable and semantic: an extrude `plate` has `plate.start`,
`plate.end`, `plate.side[k]`, and loops with a `name` give `plate.rim[0..3]`,
`plate.pivot[2][1]`; a `gear` op `g` gives `g.tooth[i].flank.r.0`, `g.tip`,
`g.bore[k]`. Use names, never face indices.

## Which kernel

- **Manifold** (preview, `agent/check.mjs`, `agent/export.mjs` fallback):
  milliseconds, always builds, polygons.
- **Truck** (the CLI's `build`, `agent/measure.mjs`): exact B-rep with named
  faces and geometry; fast on sweeps, **fails on many booleans** (it says
  `boolean union failed` or `unsupported`). Prefer even-odd regions over
  booleans: a hole is a loop inside a loop, a pattern of holes is a
  `pattern` of a sketch, and the profile of an `extrude` is a list of
  sketches.
- **OCCT** (fillets, chamfers, shells, the booleans Truck fails): in the
  bake-off harness under node (`bakeoff/kernels/occt.mjs`) and in the page
  on demand. Not wired into the CLI yet.

## Assemblies

A document with `components` (each a `part` from `parts` or `bench:<name>`,
optional `params` overrides, `at`, `rotate`, `phase`, or a nested
`assembly`), `mates` (`gear` with `za`/`zb`, `fixed`) and a `drive`
(`{component, rpm}` or an `escapement`). Gear phases are automatic. See
`bench/clock.json`. Kinematics are a chain from the driven component, not a
constraint solver — placements are yours to get right; `agent/check.mjs`
tells you when you have not.

## Handing over

Any tree or assembly opens in the viewer as a link: base64url the JSON into
`https://cad.mino.mobi/#t=<…>` (the page's *link* button does the same), or
push a bench file and use `?part=<name>`. The human sees the part, the
report, the named faces, the measure tool and the interference check; give
them the link and the numbers you judged by.

## Honesty

Report what `invariants.watertight` and `χ` say, not what the picture
looks like. A Truck failure is not a modelling failure — try the region
form, then OCCT. Volumes are in mm³ when `units` is `mm`.
