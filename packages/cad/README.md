# packages/cad — the feature-tree CAD engine

Tree in, geometry out. The design record is [`docs/CAD.md`](../../docs/CAD.md);
this is the code for its phases 0 and 1: a Rust engine that turns a parametric
feature tree into solids, the five clock benchmark parts, and the kernel
bake-off that measures every candidate kernel against them.

Not a surface. Nothing deploys from here yet; the viewer (`cad.mino.mobi`) is
phase 3.

## Layout

| | |
|---|---|
| `engine/` | the Rust crate `cad-engine`: tree schema, expression language, 2D sketches and the involute gear, topological naming, invariants, the kernel seam and two kernels (Truck, implicit), the `cad` CLI, and a raw C ABI for WASM |
| `cad.wasm` | the committed WASM build (1.7 MB). Rebuild with `engine/build.sh`, never by hand |
| `cad.selftest.mjs` | drives `cad.wasm` from bytes under node and asserts invariants. **Run before touching `engine/` or the ABI** |
| `bench/` | the clock parts as trees: gear, arbor, plate, escape wheel, case, case-fillet; `expected.json` carries the closed forms |
| `bakeoff/` | the harness: `run.mjs` builds every part with every kernel and writes `RESULTS.md`. Foreign kernels (Manifold, OCCT) are npm deps |

## The tree

```json
{ "units": "mm",
  "params": { "R": 20, "t": 1.5 },
  "features": [
    { "op": "sketch",  "id": "outline", "loops": [ { "name": "rim", "circle": { "c": [0, 0], "r": "R" } } ] },
    { "op": "extrude", "id": "plate", "profile": "outline", "depth": "t" } ] }
```

- Any numeric field takes a number or an **expression** over `params`
  (`"r": "pcd/2 + 8"`, `sin`, `cos`, `deg()`, `sqrt`, `min`, `max`, `pi`).
- **Sketches** live on a plane (`XY`/`XZ`/`YZ`, `{ "base": "XY", "offset": 5 }`,
  or `<extrude>.end`) and hold closed loops: `circle`, `rect`, `polygon`, or a
  `path` of lines, arcs (`via`) and cubic Béziers (`ctrl`). The region is
  even-odd, so a loop inside a loop is a hole — that is how through-holes are
  made, not with booleans.
- **Ops**: `extrude` (`profile` is one sketch id or a list; `mode` new/add/cut/
  intersect), `revolve` (`axis` in sketch coordinates; profiles may touch the
  axis), `pattern` (circular or linear, of a sketch, giving a sketch), `gear`
  (`m`, `z`, `alpha`, `b`, `bore` — the exact involute), `boolean`, and
  `fillet`/`chamfer`/`shell`, which the current kernels report as
  *unsupported* rather than failing.
- **Names, never indices.** An extrude yields `id.start`, `id.end`,
  `id.side[k]`; loops with a `name` add `id.rim[0..3]`; a gear names
  `id.tooth[i].flank.r.0`, `id.tooth[i].tip`, `id.root[i]`, `id.bore[k]`. The
  build report lists every face with its names, area, normal and centroid.

## The CLI

```bash
cd packages/cad/engine && cargo build --release --features stepin
E=target/release/cad
$E check   ../bench/plate.json                       # resolve; list params, sketches, ops
$E build   ../bench/gear.json --stl g.stl --step g.step --json report.json
$E measure ../bench/case.json --kernel implicit --res 128
$E resolve ../bench/arbor.json                       # the op list + sampled polylines, for foreign kernels
$E diff    a.json b.json                             # semantic diff of two trees
$E stepmeasure g.step                                # read a STEP back, mesh it, print invariants
```

`build` prints a report: `ok`, timings, invariants (volume, area, bbox,
centroid, Euler characteristic, watertight, open/flipped edges), the named
faces, gear metadata, and a typed error with an `unsupported` flag when a
kernel cannot do an op.

## The bake-off

```bash
cd packages/cad/bakeoff && npm install
node run.mjs                              # all kernels, all parts, 3 repeats → RESULTS.md, results.json
node run.mjs --kernels truck,manifold --parts plate,case --repeat 1
```

Kernels: `truck` (native binary), `wasm` (the same engine as WASM under node —
the browser's number), `implicit` (SDF + surface nets), `manifold` (mesh
booleans, npm), `occt` (OCCT 7.4 as 66 MB of WASM, npm). Each builds from the
engine's *resolved* tree so all kernels see identical inputs; STEP output is
read back by the engine's own STEP reader as the fidelity check.

## Rules

- **Edit `engine/`, run `engine/build.sh`.** It runs the unit tests, builds
  the native CLI and the WASM, copies the artefact, and runs the selftest.
- **No wasm-bindgen.** The ABI is `cad_alloc / cad_build / cad_out_ptr /
  cad_out_len / cad_free_all` and one host import, `env.cad_host_now_ms`.
  Two transitive deps link wasm-bindgen shims that are never called; the
  selftest and the harness stub them.
- Tests are invariants with tolerances, never mesh bits.
