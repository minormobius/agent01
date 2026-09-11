# Browser CAD — a design record

One pass of ideation, written before anything exists, so the reasoning survives
the conversation it came from. Same genre as [`CLOSED-LOOP.md`](CLOSED-LOOP.md):
the **why** and the shape, not a backlog.

> **Update, 2026-09-11 — the viewer exists.** `cad.mino.mobi` is the
> `cad` surface, and the package is the site: [`packages/cad/`](../packages/cad/)
> serves `index.html`, a module Worker holding the Rust engine and Manifold,
> and a hand-written WebGL2 renderer whose id-buffer pick lands on the
> engine's *named* faces. Every bench part builds in headless Chromium under
> `browser.selftest.mjs`; §14 records what the first frontend is and is not.
>
> **Update, 2026-09-10 — phases 0 and 1 have code.** [`packages/cad/`](../packages/cad/)
> holds the Rust engine (tree, expressions, sketches, the involute gear, named
> topology, invariants, a kernel seam with Truck and an implicit spike, the
> `cad` CLI, a 1.7 MB WASM with a raw C ABI and a passing selftest), the five
> clock parts as trees, and the bake-off. The bake-off ran: see §13 below for
> what it found and [`RESULTS.md`](../packages/cad/bakeoff/RESULTS.md) for the
> table. The recommendation in §3 changes as a result. Nothing else below is
> superseded.

**What is being proposed:** a parametric solid modeller that runs in the
browser, whose *model* is a feature tree stored as ATProto records on the
designer's own PDS, whose *geometry* is a content-addressed cache, and whose
first-class user is a machine. Exports STL/3MF/glTF/STEP, builds assemblies,
mates and moves components, runs linear-static stress. Headless first: the
browser is one host for the same code that runs under node.

**What it is not:** a SolidWorks clone. SolidWorks is a kernel (Parasolid), a
file format nobody else can read, thirty years of surfacing, sheet metal,
drawings and CAM, and an ecosystem. The parts of that worth competing with are
the ones a single designer uses ninety percent of the time — sketch, extrude,
revolve, boolean, fillet, pattern, shell, mate, export, "will it break" — and
the parts worth *beating* are the ones SolidWorks structurally cannot do: an
open, diffable, addressable model that an agent can read and write.

---

## 1. The one decision everything else follows from

**The model is the feature tree. Geometry is a cache.**

This is how SolidWorks already works — the `.sldprt` is a recipe, and "rebuild"
runs it — but SolidWorks hides the recipe inside an opaque binary. Making the
recipe the *public, canonical* artefact is the whole idea, and it pays four
times:

| Because the tree is canonical… | …we get |
|---|---|
| it is small, typed JSON | it fits in an ATProto record; it diffs; an LLM can write it |
| geometry is a pure function of it | every node is memoisable by the hash of its inputs — **incremental rebuild for free** |
| the function is deterministic | the cache is *global*: anyone who built the same subtree can serve it, and anyone can verify it by rebuilding |
| the kernel is behind that function | the kernel is replaceable, and the bake-off in §3 is a real choice rather than a marriage |

The feature tree is a DAG, not a list: a fillet depends on the extrude whose
edges it rounds, not on the unrelated boss that happens to come before it in
the timeline. That DAG is also **where the parallelism lives** — independent
branches rebuild in separate workers, each part of an assembly rebuilds in its
own — which matters because no open kernel we can run in WASM is meaningfully
multithreaded.

### 1.1 The tree, concretely

```json
{
  "$schema": "com.minomobi.cad.tree#v1",
  "units": "mm",
  "params": { "t": 3, "pcd": 40, "hole": 5.5 },
  "features": [
    { "id": "base",  "op": "sketch",  "plane": "XY",
      "profile": [{ "circle": { "c": [0, 0], "r": "pcd/2 + 8" } }] },
    { "id": "plate", "op": "extrude", "profile": "base", "depth": "t" },
    { "id": "holes", "op": "sketch",  "plane": "plate.end",
      "profile": [{ "circle": { "c": ["pcd/2", 0], "r": "hole/2" } }] },
    { "id": "cut",   "op": "extrude", "profile": "holes", "depth": "-t", "mode": "cut" },
    { "id": "ring",  "op": "pattern", "of": "cut", "kind": "circular",
      "axis": "plate.axis", "count": 4 },
    { "id": "soft",  "op": "fillet",  "edges": "plate.side ∩ plate.end", "r": 1 }
  ]
}
```

Three things in there are load-bearing:

- **Parameters are expressions.** `"depth": "t"` is what makes it parametric;
  an agent changes `t` and the whole tree follows. A tiny expression language,
  no side effects, evaluated before the kernel sees anything.
- **Topology is referenced by *name*, never by index.** `plate.end`,
  `plate.side`, `plate.axis`. "Face 37" is the famous failure mode — the
  topological naming problem that FreeCAD spent a decade on — and it kills both
  parametric robustness *and* machine usability at once. Every operation
  declares the named sub-shapes it creates (an extrude yields `start`, `end`,
  `side[<profile edge>]`, `axis`), and selectors are set expressions over those
  names. A face that no longer exists after an edit is a *typed rebuild error*
  naming the selector, not a silent wrong fillet.
- **Nothing in the tree is a mesh.** The tree references sketches, planes and
  named topology only. Meshes, B-rep binaries and FEA fields are outputs,
  addressed by CID.

---

## 2. Off ATProto — what that actually means here

The repo's [`VISION.md`](VISION.md) thesis, applied to solid models: *the
user's PDS is the backend; the site is a viewer.* Cloudflare serves HTML and
WASM. Nothing about a design ever has to touch a server we run.

### 2.1 Lexicons

| Collection | Holds | Mutability |
|---|---|---|
| `com.minomobi.cad.revision` | one immutable snapshot: the tree (inline if small, blob if not), `parents[]` as strongRefs, kernel id+version, the **invariants** of the result (volume, area, bbox, centre of mass, Euler characteristic, watertight) | immutable |
| `com.minomobi.cad.part` | a *head*: name, description, strongRef to the current revision, optional cached geometry blobs (STL, glTF, B-rep) keyed by their CID | mutable (it's a ref) |
| `com.minomobi.cad.assembly` | components `[{ref: strongRef → a part **or assembly** revision, params?: {…}, transform, name, flexible?: bool}]`, mates `[{kind, a, b, params}]`, and a head revision like parts. A component ref to an assembly is what makes assemblies of assemblies (§10); `params` binds a parametric part's exposed parameters at the instance, so a part is a function and an instance is a call | as above |
| `com.minomobi.cad.vendorPart` | a part whose tree is one `import` feature over a STEP blob, plus vendor, part number, URL, and the invariants — so an imported bolt is still measurable, still cached by CID, still referenceable (§11) | immutable |
| `com.minomobi.cad.study` | an FEA study: fixtures, loads, material ref, mesh settings, result summary (max stress, max displacement, factor of safety) and a blob of the field | immutable per run |
| `com.minomobi.cad.material` | a material: E, ν, ρ, yield — shareable, so a library is just someone's PDS | mutable |
| `com.minomobi.cad.release` | a tag: "v1.2", strongRef to a revision, notes | immutable |

`revision.parents` with strongRefs is git. Fork = new head pointing at someone
else's revision. Merge = a revision with two parents. Blame = walk the chain.
And because a strongRef pins a CID, **an assembly that references your part
cannot be broken by your next edit** — it references the revision, and upgrades
deliberately.

The PDS **does not keep history** — `getRepo` gives the current tree, not old
commits — which is exactly why revisions are explicit records rather than
relying on the repo's own Merkle history. Also why there is no
"autosave every keystroke": edits are local-first (in-memory + OPFS), and a
*commit* writes one revision. Rate limits stop mattering.

### 2.2 Addressing

Every model has an AT URI, and the viewer surface gives it content-negotiated
faces:

```
cad.mino.mobi/at/<did>/<rkey>            the editor
cad.mino.mobi/at/<did>/<rkey>.json       the tree
cad.mino.mobi/at/<did>/<rkey>.stl        geometry (from cache, or rebuilt)
cad.mino.mobi/at/<did>/<rkey>.glb
cad.mino.mobi/at/<did>/<rkey>.png?view=iso
cad.mino.mobi/at/<did>/<rkey>/measure    invariants as JSON
```

The `.stl` / `.png` path is what makes the thing *linkable* from a Bluesky
post, a README, or a purchase order.

### 2.3 What ATProto gives us that we would otherwise build

- **Identity and auth** — the shared worker at `auth.mino.mobi`, narrow scope
  `atproto repo:com.minomobi.cad.*`. Zero new auth code, per
  [`OAUTH.md`](OAUTH.md).
- **A federated parts library.** Anyone's PDS can host a part. An assembly
  references parts across DIDs. A bolt is `at://did:plc:…/com.minomobi.cad.part/m5x12`
  and everyone's assemblies can use it.
- **Live collaboration, cheaply.** `packages/atproto/jetstream.js` already
  filters the firehose by collection. Subscribe to `com.minomobi.cad.*` and you
  have "revisions landing right now, from everyone", which is both a presence
  feed and the data path for shared editing (each collaborator commits
  revisions; the editor merges trees, which are JSON DAGs and merge far more
  gracefully than meshes).
- **Content addressing.** Blobs are already CID-keyed. Geometry caches want
  exactly that.

### 2.4 What it costs

- **Public by default.** ATProto records are public. A private design is an
  encrypted blob (`packages/atproto/crypto.js`, the `vault/` pattern) with the
  head record carrying only ciphertext and a CID — or a private PDS. Either
  way, say it on the tin: this is a *commons*, and that is the point, but not
  every bracket wants to be one.
- **Record size.** Records are meant to be small. A fifty-feature tree is tens
  of KB and fine inline; a five-hundred-feature tree goes to a blob. Measure
  where the knee is before deciding.
- **No compute.** The PDS stores; it does not rebuild. Rebuilding is the
  client's job (§4), or a cache's.

---

## 3. The kernel — the honest part

The solid-modelling kernel is the moat, and the reason there are three
commercial CAD kernels in the world. Writing one is a decade. The choice is
between things that exist:

| Kernel | What it is | Gives | Costs |
|---|---|---|---|
| **OCCT** (opencascade.js) | the only open B-rep kernel with fillets, booleans and STEP; Emscripten builds exist and are used by chili3d and replicad | exactness, STEP, fillets/chamfers on real edges, drawings later | 10–30 MB WASM (custom builds shrink it), effectively single-threaded, booleans that are slow on hard cases and occasionally wrong |
| **Manifold** | Google's mesh boolean library; guaranteed-manifold output, fast, small | interactive-speed booleans, robust, ~1 MB, fits in a Worker | no exact surfaces: no STEP, no true fillets, no "the face is a cylinder" |
| **Implicit / SDF** | a field, not a surface; our own code | fillets are `smoothmin`, booleans are `min`/`max`, meshing-free FEA (§5), lattices, topology optimisation, WebGPU-native | exporting exact geometry is impossible; extracting a good mesh (adaptive dual contouring) is real work; precision costs resolution |
| **Truck** (Rust) | pure-Rust B-rep: NURBS, topology, booleans, STEP I/O, wgpu tessellation, a JS wrapper; active | Rust end to end, so one WASM module and no JS seam between the tree and the kernel; STEP; small | **no fillets**, booleans younger than OCCT's; every gap is ours to close |
| Fornjot (Rust) | was the other Rust B-rep kernel | — | **development ended, goals not reached.** Not a candidate |

**Recommendation** *(written before the bake-off; §13 records what it
found and reverses the Truck half of this)*. Two exact candidates go into the
bake-off, and the target decides between them. OCCT is the safe one: fillets, STEP, thirty years
of booleans, and a C++/Emscripten module that the Rust tree layer has to talk
to across a JS seam, one coarse call per feature. Truck is the one the *Rust
for everything* decision (§9) wants: a single WASM module, STEP in and out,
and a kernel whose gaps we can close ourselves — but no fillets today. The
clock (§10) is mostly gears, plates, pins and arbors; it needs curves and
booleans far more than it needs fillets, which is a real point for Truck on
*this* benchmark and no point at all in general. Manifold runs the preview
loop either way — every drag of a dimension re-evaluates on meshes at frame
rate and the exact rebuild lands behind it — and the server-side path, since it
fits a Worker and OCCT does not. Implicit only where it is strictly better: the
simulation path.

**This is decided by a bake-off, not by this paragraph.** The repo already has
the apparatus (`bakeoff/`). The benchmark parts are the clock's (§10): an
involute gear; an arbor with pinion and pivots; a plate with a pattern of pivot
holes; an escape wheel and pallet fork (the ugly one — curves, thin features,
booleans that touch tangentially); the case (shell, fillets). Each kernel
adapter builds them headless under node, and the table is: wall time cold and
incremental, WASM size, invariants matched against a reference, failures. The
adapter interface is the seam that makes the bake-off cheap:

```ts
interface Kernel {
  id: string; version: string;
  build(tree: Tree, cache: Cache): Result<Shape, RebuildError>;
  tessellate(shape: Shape, tol: number): Mesh;        // transferable typed arrays
  measure(shape: Shape): Invariants;
  named(shape: Shape, selector: string): SubShape[];  // §1.1 selectors
  export(shape: Shape, fmt: 'stl'|'3mf'|'glb'|'step'): Uint8Array;
}
```

Everything above the seam — tree, expressions, naming, cache, lexicons,
headless API, viewer — is ours and kernel-agnostic. Everything below it is
replaceable, and the bake-off gets re-run when a new kernel appears.

### 3.1 The sketch solver

Separate problem, much smaller. 2D geometric constraints (coincident,
horizontal, tangent, equal, dimension) solved by Newton / Levenberg–Marquardt
on residuals. FreeCAD's `planegcs` has a WASM port; our own in Rust is a
weekend by comparison with a kernel and worth owning, because the solver is
where the *feel* of a CAD lives. Deterministic, seeded, selftested on a corpus
of sketches with known solutions.

---

## 4. Performance — the actual architecture

"Performance is everything" and "runs in the browser" are compatible only if
the browser is treated as a machine with a GPU and eight cores, not a document
viewer.

**Threads.** Main thread renders and handles input. Nothing else. The kernel
runs in Web Workers — one per assembly component, plus a pool for independent
tree branches. Geometry crosses as transferable typed arrays, zero-copy.
SharedArrayBuffer for the big buffers, which needs COOP/COEP; `fold/_headers`
already does this and the pattern is in `CLAUDE.md`'s debugging table.

**Incremental rebuild.** Every feature node's output is memoised under the
hash of (op, evaluated params, hashes of inputs, kernel id+version). Change a
fillet radius and only the fillet and its dependants rebuild. Change `t` and
everything downstream of `t` rebuilds — which is what SolidWorks does, except
here the cache survives page reloads (OPFS) and can be shared (R2, keyed by the
same CID; a geometry CDN that anyone can populate and anyone can verify).

**Rendering.** WebGPU, WebGL2 fallback, and it is a solved problem at this
scale. An assembly of a thousand parts is a thousand transforms over a few
hundred unique meshes: instancing, a BVH for picking, frustum culling, LOD
from the tessellation tolerance. 60 fps for a thousand-part assembly on
integrated graphics is a budget, not an ambition.

**The preview loop.** The thing SolidWorks users feel is drag latency. Dragging
a dimension re-runs the preview kernel (Manifold, or an implicit evaluation on
the GPU) at frame rate on the *affected subtree only*; the exact rebuild
follows and swaps in. Two kernels, one tree, and the user sees the fast one.

**Budgets** (targets to be measured against, not promises):

| | target |
|---|---|
| incremental rebuild, 50-feature part, one param changed | < 200 ms |
| full cold rebuild, 50-feature part | < 2 s |
| drag preview | frame rate |
| 1,000-component assembly, orbit | 60 fps |
| linear-static FEA, 200k DOF | < 10 s in-browser |
| cold load of the exact kernel | < 5 s on a cache miss, ~0 thereafter |

**Scale in the other sense** — many users — is the part that costs nothing.
There is no server in the hot path. Each user brings a GPU, cores, and a PDS.
SolidWorks scales by selling seats; Onshape scales by buying compute; this
scales by doing nothing. The only shared component is the optional geometry
cache, and it is a CDN.

---

## 5. Stress — and why implicit earns its place

Linear static first: fixtures, loads, an isotropic material, displacement and
von Mises. That is what the "Simulation" tab does for most people, most days.

The hard part of FEA on B-rep is not the solve, it is the **mesh**. Robust
tetrahedralisation of arbitrary B-rep is its own unsolved-in-the-open problem
(TetGen exists in WASM and is fine on clean geometry and fragile on real
geometry). Two ways through:

1. **Tet mesh from the tessellation** — TetGen in a worker; works for the
   benchmark parts; fails on the ugly ones; ship it first.
2. **Immersed / cut-cell on a voxel grid of the implicit field** — no meshing
   at all. Sample the SDF, hex elements where the field is inside, cut cells
   at the boundary. Coarse, but robust on *anything*, embarrassingly
   GPU-parallel, and it is the representation that makes **topology
   optimisation** a few hundred lines on top — which is the one simulation
   feature a browser tool could ship that SolidWorks users would envy.

The solve is sparse SPD: preconditioned conjugate gradient, in WASM with a
thread pool or as a WebGPU compute pass. Hundreds of thousands of DOF in
seconds is realistic; millions is a container's job (§6). The
`ai-edu/problems/beam-deflection` page already carries a Hermite FEM with an
analytical anchor, and that is the pattern: every solver ships with a known
answer it must reproduce to machine precision.

Assemblies get a **mate solver** (the same constraint machinery as sketches,
in 3D: coincident, concentric, distance, angle), which is what "move
components" means — drag one, the mates hold the rest. Interference detection
between components is a mesh boolean, i.e. Manifold, i.e. fast.

---

## 6. Headless first — being ready to be used by a machine

This is the requirement that shapes the build order. The browser editor is a
client of a library; it is never the only client.

**`packages/cad/`** — no build step, no dependencies beyond the kernel WASM,
runs under node and in the browser identically (the `fold`/`rite` pattern:
init the WASM from bytes, not a URL, so node can drive it):

```
cad build  part.json --out part.stl        # tree → geometry
cad check  part.json                       # rebuild errors, dangling selectors, invariants
cad diff   a.json b.json                   # semantic diff of two trees
cad measure part.json                      # volume, area, bbox, com, watertight
cad render part.json --view iso --png      # so a model can *see* the part
cad study  part.json study.json            # FEA → summary + field
cad push   part.json --as @handle          # commit a revision to a PDS
```

**Tests are geometric invariants, not mesh equality.** Volume, area, bounding
box, centre of mass, Euler characteristic, watertightness, and named-topology
counts, each with a tolerance. Mesh bits change with tessellation and kernel
versions; a bracket's volume does not. That is the `*.selftest.mjs` pattern
already everywhere in this repo, applied to solids, and it is what lets the
kernel be swapped without rewriting tests.

**The agent API.** The same library behind an HTTP surface (and an MCP server,
which is the same thing with a manifest) so that a model can run the loop a
human runs:

```
propose a tree edit → build → measure → render → judge → repeat
```

Design intent arrives as text: "bracket, four M5 on a 40 PCD, 3 thick, must
hold 50 N at the tip with FoS 2". The agent writes the tree from §1.1, builds
it, reads `measure`, runs `study`, sees max stress, thickens `t`, reruns,
renders three views, commits a revision, and hands over an AT URI. The human
opens it in the browser and drags a dimension. **That workflow is impossible
against a `.sldprt`**, and it is the reason to do any of this.

Where this touches the loop programme: a CAD spec with a numeric oracle
(invariants, FoS) is the exact shape of requirement
[`LOOP-WBS.md`](LOOP-WBS.md) says an unattended fleet can consume. The
measurement API *is* the judge.

**Where the compute runs**, by host:

| host | can run | can't |
|---|---|---|
| browser | everything, incl. OCCT | very large FEA |
| node (a laptop, CI, an agent's sandbox) | everything | — |
| Cloudflare Worker | Manifold-class rebuilds, cache serving, `.stl`/`.png` on demand | OCCT (too big), FEA (CPU limit) |
| a container | everything, for the "render this 5-million-DOF study" case | — |

---

## 7. Prior art, and where the gap is

- **Onshape** proves browser CAD. Its kernel is Parasolid on their servers; the
  browser is a terminal. Data is theirs.
- **chili3d, replicad, CadQuery/build123d** prove OCCT-in-WASM and code-CAD
  respectively. Files are files.
- **Zoo (KittyCAD)** proves a text language for CAD that models can write; its
  geometry engine is remote and proprietary.
- **FreeCAD 1.0** proves open parametric CAD with topological naming solved;
  it is a desktop C++ application.

Nobody has the combination: kernel local, model on a protocol the user owns,
named topology, machine-first API. Each piece exists. The gap is the
composition, and the composition is mostly plumbing this repo already knows
how to do.

---

## 8. Phases and gates

Same discipline as [`LOOP-WBS.md`](LOOP-WBS.md): each phase has a gate that
ends it and a kill criterion.

| # | Phase | Gate | Kills the programme if |
|---|---|---|---|
| 0 | **Kernel bake-off** in `bakeoff/` style: OCCT-wasm vs Truck vs Manifold vs an implicit spike, on the five clock parts, with STEP round-trip as a mandatory column — **done, §13** | a table with wall time, size, invariant errors, STEP fidelity — [`RESULTS.md`](../packages/cad/bakeoff/RESULTS.md) | no exact kernel builds the escape wheel under 2 s cold in a browser — **OCCT does it in 1.6 s cold, 1.2 s warm** |
| 1 | **Tree + headless.** `packages/cad/`: schema, expressions, naming, the adapter, `build/check/measure/diff`, selftests with golden invariants. No UI. In Rust (§9). | the §10 gear builds under node from `{m, z, α, b, bore}` and exports a STEP that opens elsewhere and an STL that prints | topological naming can't be made stable across the benchmark edits |
| 2 | **Lexicons + push.** Revisions, heads, strongRef parents; `cad push`; rebuild a part from its AT URI | round-trip: push from node, rebuild in a fresh clone, invariants match | record limits force every tree to a blob (then the design changes, not dies) |
| 3 | **Viewer surface `cad.mino.mobi`.** Read-only WebGPU render of any `at://` part; `.stl/.glb/.png` faces; the R2 geometry cache | a Bluesky post links a part and the preview renders | — |
| 4 | **Sketcher + editor.** The 2D solver, the timeline, drag with preview kernel | a human draws the bracket without touching JSON, under the budgets in §4 | drag latency can't be brought under a frame on integrated graphics |
| 5 | **Assemblies of assemblies.** Mates, the mate solver, gear mates, sub-assemblies rigid or flexible, interference, cross-DID references, vendor parts | **the spin gate** (§10): the movement assembled from sub-assemblies, drive the barrel arbor, the whole train turns at frame rate with every mate held, on integrated graphics | it chugs |
| 6 | **Stress.** TetGen path, then the immersed path, PCG solve, study records | a gear tooth under its rated load matches the Lewis bending formula within 10 %; a plate under the mainspring reaction matches a closed-form beam within 5 % | — |
| 7 | **Agent API.** HTTP + MCP over the headless library; the loop runs a brief end to end | from "a 1:12 motion works between the minute and hour hands, module 0.5", an agent produces a passing sub-assembly with no human edits | — |

Phases 1–2 are the programme. If they hold, everything after is engineering
with known answers. If they do not, the browser editor was never the problem.

---

## 9. Decisions — the asks, answered

The four questions §9 originally asked have answers (operator, 2026-09-10),
and each one moves something above.

| Ask | Answer | Consequence |
|---|---|---|
| Public by default? | **Yes.** | No encryption phase. The commons is the product; `vault`-style private designs are a later option, not a requirement. |
| STEP required in phase 1? | **Yes.** | STEP round-trip is a column of the bake-off, not an afterthought, and it also settles the vendor-part path (§11): STEP *import* is how catalogue parts arrive. Manifold alone can never be the exact kernel. |
| Rust or JS above the kernel? | **Rust for everything we can get away with.** | One crate: tree evaluator, expression language, topological naming, the sketch solver, the mate solver, tessellation glue — `wasm-bindgen`, initialised from bytes so node drives it (the `fold`/`rite` precedent). JS is the browser glue and nothing else. It also puts Truck squarely in the bake-off, because a Rust kernel means one module and no seam. |
| Which real part first? | **A mechanical clock.** Assemblies of assemblies; the gear as a canonical part. | §10. The benchmark is no longer a bracket; the gate is no longer "it printed" but "it runs". |

And one performance sentence that is now a gate, verbatim: *if it chugs when
you try to spin it we are ngmi.* That is the phase-5 gate in §8, and it is
what the whole of §4 exists to pass.

---

## 10. The clock — assemblies of assemblies, and the gear as a canonical part

A mechanical clock is a better target than a bracket for exactly the reason it
is harder: it is only interesting *as an assembly*, and its assembly is
hierarchical. A movement is a gear train, an escapement, a motion works and a
barrel; each is a sub-assembly with its own mates; the case, dial and hands sit
around it. Nothing about it is a single part with a single load. It is the
big-picture target, and it forces the big-picture machinery early.

### 10.1 What "assemblies of assemblies" costs the data model

Almost nothing, which is the good news, and it is already in §2.1:

- A component ref points at a part revision **or an assembly revision**. The
  hierarchy is the reference graph; there is no separate concept.
- A sub-assembly is **rigid** by default — one transform for the whole thing,
  its internal mates already solved and cached. `flexible: true` opens it, so
  its internal mates join the parent's solve. A clock's gear train is flexible
  (it has to turn); its case is rigid.
- **Rendering flattens; solving does not.** The renderer walks the graph to a
  flat list of (part CID, world transform) and instances by CID — a thousand
  identical screws are one mesh. The mate solver works the hierarchy, and only
  the flexible parts of it.

What it costs the *cache*: an assembly's geometry is the union of its
components' caches, so assembling never rebuilds a part; and an instance with
`params` overrides caches under `hash(revision CID, params)`, so ten gears of
different tooth counts from one parametric part are ten cache entries and one
tree.

### 10.2 The gear

A gear is the ideal canonical part because it is *entirely* parametric and
*entirely* standard: module `m`, tooth count `z`, pressure angle `α`, face
width `b`, bore, and everything else follows — pitch diameter `mz`, addendum
`m`, dedendum `1.25m`, the involute itself. Nobody sketches a gear; they
specify one.

So `gear` is a **feature op**, not a sketch someone drew:

```json
{ "id": "g1", "op": "gear", "m": 0.5, "z": 30, "alpha": 20, "b": 1.2,
  "bore": { "d": 1.0 }, "profile": "involute" }
```

It generates the exact involute (a B-spline fit in B-rep, or the closed-form
curve in implicit), names its topology (`g1.tooth[i].flank[l|r]`, `g1.pitch`,
`g1.axis`, `g1.face[a|b]`), and the canonical part record is just a tree with
this one op and its parameters exposed. Every gear in every clock on the
network can be an instance of one public revision at one AT URI.

The **gear mate** is where the lathe pattern from `b/lathe/engine.js` shows up
again — a typed algebra with an oracle. Two gears mesh iff they share `m` and
`α`; the centre distance *must* be `m(z1 + z2)/2`; the ratio *is* `z2/z1`.
Those are not things the user sets, they are things the tree *checks*: a gear
mate between incompatible gears is a typed error, and a gear train is a typed
walk. Because a gear mate is a scalar relation between two rotations, driving
one arbor drives the whole train through the mate solver at trivial cost —
which is the spin gate. A clock in CAD turns by mates, not by contact physics;
contact is a simulation, not a constraint, and stays in §5.

### 10.3 What the clock forces, in order

| the clock needs | which is | phase |
|---|---|---|
| gears, arbors, plates | `gear`, revolve, sketch+extrude, patterns | 1 |
| an escape wheel and pallets | curves and tangent booleans — the kernel's stress test | 0/1 |
| the train | assemblies, gear mates, the spin gate | 5 |
| a barrel and a mainspring | a vendor spring (§11) or a parametric torsion spring; a torque | 5/6 |
| pivots that don't snap, teeth that don't bend | stress on a tooth and a plate | 6 |
| the case, the dial, the hands | shell, fillet, text — and the first assembly a person shows someone | 4/5 |
| "make me a motion works" | the agent loop over all of it | 7 |

The escapement is the honest risk. It is the part with real curves and the
part where kernels lie; it is in the phase-0 benchmark on purpose.

---

## 11. Vendor parts — McMaster-Carr, and what "import their stuff" is

Checked 2026-09-10. Three facts:

1. **There is an official API.** The McMaster-Carr Product Information API is
   REST at `api.mcmaster.com/v1`: login for a bearer token, subscribe to part
   numbers, then fetch product data, pricing, images, datasheets and **CAD —
   3-D STEP and 2-D DWG** from `/v1/cad/`. It is for **approved customers
   only** (apply via eprocurement@mcmaster.com), every request carries a
   **client certificate** they issue, and the CAD endpoints are rate-limited.
   No published redistribution terms either way.
2. **The famous "integrations" are thinner than they look.** Fusion's *Insert
   McMaster-Carr Component* is the McMaster website in a panel; you find the
   part, download the STEP, and Fusion inserts it. Onshape has no native
   integration. Nobody has a deep one, because the API is gated.
3. **The CAD download on the public product page needs no login.** That is
   the path everyone actually uses.

So there are three tiers, and they stack:

**Tier 1 — STEP in.** Drag a STEP onto the editor, or `cad import`, and it
becomes a `vendorPart` revision: one `import` feature over the STEP blob,
vendor and part number as metadata, invariants computed so it is measurable and
mateable like anything else. This is phase 1 work and it needs the exact
kernel's STEP reader, which is the second reason §9 made STEP a phase-1
requirement. It covers the whole long tail of the catalogue with no agreement
with anyone. The open question is whether a vendor's STEP may sit on a public
PDS blob; until answered, a `vendorPart` can carry the *part number and a
local-only blob* and rebuild from the vendor's URL on demand.

**Tier 2 — generate, don't import.** Most of what a clock orders from McMaster
is *standard*: an M2×6 socket-head screw is ISO 4762, a 2 mm dowel is ISO
2338, a bearing is a bore/OD/width triple, a gear is §10.2. Standard parts are
parametric ops in our own library — public, ours, exact, tiny, and with the
vendor part number as an *attribute* rather than the source. This is the tier
that goes hard: the BOM of an assembly becomes a McMaster cart, which is what
people keep building by hand (`solidworks2mcmaster` exists for that reason),
and nothing of McMaster's is ever redistributed.

**Tier 3 — the API, if approved.** A small BFF worker (`workers/mcmaster`)
holding the *operator's* certificate, proxying search, pricing and CAD fetch
for signed-in users, with the STEP landing as a tier-1 `vendorPart`. Browsers
cannot attach a client certificate to a `fetch`, so this cannot be
client-only; it is the one place in the whole design that needs a server we
run, and it is optional. Apply early because approval takes as long as it
takes; build it last because tiers 1 and 2 cover the clock.

---

## 12. Open — the things still nobody can measure

1. **Truck's fillet gap.** If the bake-off says Truck wins everything except
   fillets, do we close the gap ourselves (Rust, months) or run OCCT alongside
   for fillets only (a STEP round-trip per fillet, slow but on commit only)?
   The clock barely needs fillets; the case does.
2. **Which clock.** A real movement (a specific calibre with published tooth
   counts) or a designed-here one? A real one makes the gate external and
   honest; a designed one makes the agent loop the designer from day one.
3. **Vendor STEP on a public PDS** — ask, before the first one is pushed.

---

## 13. Phase 0 result — the bake-off, and what it decides

Run 2026-09-10 on one Xeon core under node 22; the table is
[`packages/cad/bakeoff/RESULTS.md`](../packages/cad/bakeoff/RESULTS.md) and
`node packages/cad/bakeoff/run.mjs` regenerates it. Five kernels, six parts,
three repeats. The shape of the table is the finding.

### 13.1 What happened

| | Truck (Rust, native and WASM) | OCCT 7.4 (WASM) | Manifold (WASM) | implicit spike |
|---|---|---|---|---|
| plate, case, arbor | ✓ exact, watertight, 0.01–0.04 % of closed form; **80–400 ms**; WASM at parity with native (plate 180 ms warm) | ✓ same accuracy; **30–280 ms** warm | ✓ 0.01–0.5 %; **2–30 ms** | ✓ 0.4–0.7 %, grid-limited |
| crossed-out gear (4 window cuts through a 60-tooth involute) | built in **13 s**, and the result is wrong: χ = −12 for −8, not watertight | ✓ correct, 2.3 s warm, 6 s cold | ✓ correct, **94 ms** | ✓ correct topology, 3 % low |
| escape wheel (15 tooth unions with coplanar caps) | **boolean union failed** | ✓ correct, 1.2 s | ✓ correct, **5 ms** | ✓ correct |
| case with a filleted rim | unsupported | ✓ **116 ms**, χ = 2, removed volume matches the fillet's | unsupported | unsupported (planned) |
| STEP out | yes | yes | no | no |
| named faces through a sweep | yes (82 on the plate) | not wired | no faces | no faces |
| module | 1.7 MB | 65.9 MB, 1.4 s to initialise | 0.5 MB, 17 ms | (in the 1.7 MB) |

Two columns in the table are about our own code, not the kernels, and are
recorded as such: face names vanish through any boolean (naming is only
implemented for sweeps — the phase-1 gap), and the STEP read-back column runs
through Truck's `ruststep`-based reader, which times out on every
spline-heavy file and misreads OCCT's arbor and plate; it verified Truck's
plate exactly and OCCT's case and fillet to 0.03 %, and read Truck's own
case STEP back at minus twice the volume. **The read-back column measures
Truck's reader, not the writers**, and needs a second reader before it can
be a fidelity column.

### 13.2 What it decides

1. **Truck is not the exact kernel.** Its sweeps are fine and fast, its
   booleans are not: one of the two boolean parts is wrong and the other
   fails, and the one that "works" takes thirteen seconds. Booleans are the
   whole of CAD after the first feature. §3's hope that a clock needs
   booleans more than fillets was right, and it is exactly the booleans
   Truck cannot do. The *Rust for everything* decision (§9) stops at the
   kernel seam, which is what the seam was for.
2. **OCCT is the exact kernel, at the cost §3 predicted:** 66 MB and 1.4 s to
   initialise, then correct on every part including the fillet, within a
   few hundred milliseconds of Truck on simple parts and *faster* than Truck
   on the hard ones. That cost is paid once per session and cached by the
   browser; it is the same trade every browser CAD has made, and the table
   says it is the right one.
3. **Manifold runs the preview loop, and it is not close.** Ten to a hundred
   times faster than either B-rep kernel on every part, correct on all of
   them, half a megabyte. The drag-a-dimension path in §4 is Manifold, fed
   the engine's sampled polylines — which the harness already does.
4. **The implicit spike earns its place only in §5.** Grid-limited accuracy
   (0.4–3 %), loses features thinner than a cell, but never fails, and the
   fillet and shell are one-liners it does not yet have. It stays as the
   simulation representation, not a modelling kernel.
5. **The engine above the seam holds.** Tree, expressions, even-odd regions,
   the gear op, sweep naming, invariants and the WASM ABI all survived five
   kernels' worth of inputs; every defect found in the bake-off was in an
   adapter or the bench, and each was fixed in the adapter. The kernel seam
   is real: OCCT went in as 300 lines of JS against the resolved tree.

### 13.3 What phase 1 now is

Same phase, different kernel under it: the Truck adapter stays as the small
exact kernel for sweeps and STEP, the **OCCT adapter moves from the harness
into the engine's kernel seam** (in the browser it is a Worker holding the 66
MB module; under node it is what the harness already runs), and Manifold is
wired as the preview kernel. Naming through booleans — tracking which faces
of the result came from which named faces of the operands — is the gap to
close first, because it is what makes a fillet after a cut addressable, and
OCCT's `BRepAlgoAPI` history (`Generated`/`Modified`) is the mechanism.

---

## 14. Phase 3, first cut — the viewer as the judgement surface

Built 2026-09-11 as the `cad` surface at `cad.mino.mobi`
([`packages/cad/CLAUDE.md`](../packages/cad/CLAUDE.md)). What it is:

- **Two builds per edit, in a Worker.** The Rust engine resolves the tree;
  Manifold builds the preview from the sampled polylines in milliseconds and
  the part appears; Truck's exact build lands behind it with every face
  named. Drag a parameter's name to scrub it and the preview follows at
  frame rate — the §4 loop, as built. A newer edit supersedes an older
  build between its two answers.
- **A rolled renderer, not three.js.** The engine hands over flat typed
  arrays with a face id per triangle; the renderer uploads them once, shades
  flat from per-triangle normals, draws feature edges from the dihedral
  angle, and picks by rendering ids into a framebuffer that is only redrawn
  when the view changes. So a hover returns `plate.end`, not a triangle
  index. Four hundred lines, and nothing between the kernel seam and the
  GPU that we do not own.
- **The report is the judgement.** Preview and exact side by side: build
  time, volume, area, χ, watertightness, triangle count, bbox, the count of
  named faces; the face under the cursor with its names, area, normal and
  centroid; three canonical views on demand; STL out; a link that carries
  the whole tree in the hash so an agent can hand a human a URL.
- **Verified in a browser, not by inspection.** `browser.selftest.mjs`
  serves the package, opens it in headless Chromium, builds all six bench
  parts, checks the plate against its closed form, picks the centre of the
  view and asserts it is a named face, edits a parameter and asserts the
  volume grows, and screenshots each part. It passes; the deploy workflow
  runs the ABI selftest and this one is run before pushing.

Second cut, the same day:

- **OCCT in the browser, on demand.** The worker imports the 66 MB module
  from unpkg (jsDelivr refuses it; Workers static assets cap files at 25
  MiB) the first time a fillet, chamfer or shell appears or Truck fails a
  boolean, after one press of *exact with OCCT*; the browser caches it. The
  filleted case lands from OCCT at the bake-off's number; the escape wheel's
  fifteen-tooth union that Truck fails falls through to OCCT. Fillet
  selectors cross the kernel seam via the engine's reference faces, as in
  the harness. The selftest runs this path against a locally served copy.
- **Assemblies, first cut.** Components with placements and `params`
  overrides, sub-assemblies flattened with prefixed ids, `gear` and `fixed`
  mates solved as a kinematic chain from one driven component, and *spin*
  with a frame-rate readout — the §10 spin gate, measurable on a phone.
  `bench/train.json` is a two-stage train built from the arbor and wheel
  bench parts, the second stage a sub-assembly. Mates are kinematic, not a
  constraint solver: a gear mate is the scalar relation §10.2 said it was.
- **Phone.** Two fingers pan and pinch; the part takes the top of the
  screen and one tabbed panel the bottom third.

Third cut: **the clock**, as `bench/clock.json`. A going train of three
stages from the escape wheel to the centre arbor (8:60, 8:32, 8:32, so
120:1 and a one-second beat gives the minute hand one turn an hour, checked
in the selftest to the fourth decimal), a lever escapement as the drive
(the wheel steps half a tooth per beat with a quick slide, the pallet fork
rocks ±lift, the balance swings over two beats, and the whole train ticks
through the mates), motion works (12:36 then 8:32, so 12:1 to the hour
hand), a dial with twelve marks, the case. Eighteen components from nine
bench parts, every one with parameter overrides — the same `gear` op is the
60-tooth fourth wheel, the 32-tooth wheels, the cannon pinion and the hour
wheel. Gear phases are automatic: a gear's tooth 0 is turned to face its
mate and the mate turns half a pitch back, which works because each gear
component has exactly one mesh. Four new parts are single even-odd
outlines rather than booleans (the balance's rim, windows and hub; the hand's
boss and blade closed by one arc), because Truck's coplanar-cap unions
were the thing the bake-off said not to lean on.

Fourth cut — **the tools an agent needs**, which are the tools a human needs:

- **Face geometry.** The engine now attaches a plane or a cylinder to every
  face it names (§1.1's naming, extended with what the face *is*), computed
  from the sketch curve that swept it. A circle is four exact arcs, so a
  bore is a real cylinder with a radius; the mesh only ever approximated
  it. The measure tool reads diameters and plane-to-plane, axis-to-axis
  and axis-to-plane distances from that, in the page and from
  `agent/measure.mjs`.
- **Interference.** Every overlapping pair of components, intersected with
  Manifold at the current pose; the shared volume is the number. It found
  the pallet fork's stones swinging into the escape wheel's teeth, the
  cannon pinion cutting into the hour wheel, and the escape wheel grazing
  the case wall — three placement errors a picture had not shown — and the
  fixes were three parameters. Pairs under 0.01 mm³ are polygon flanks
  touching at a mesh and are not reported; fixed-mated press fits are
  reported and marked. `agent/check.mjs` exits non-zero on a real clash.
- **Export.** One STL per part and a posed assembly STL from
  `agent/export.mjs`; the page exports the pinned component's part.
- **Render.** `agent/render.mjs` opens the page in headless Chromium,
  loads a document, waits for the builds, writes a PNG per view and the
  report. An agent sees what a human sees.
- **The skill.** `.claude/skills/cad/SKILL.md` is the instruction sheet
  for another agent: the loop (write tree → build → measure → check →
  render → judge), the commands, the naming, which kernel does what, and
  how to hand over a link. This is §6 as built.

What it is not, yet:

- **No sketcher.** The tree is edited as JSON and parameters; phase 4.
- **No constraint solver, no ATProto.** Mates are gear and fixed only, and
  placements are typed in. Documents come from a bench file, a dropped JSON,
  or the hash. Phases 2 and 5 proper.

Two adapter defects surfaced while building it and were fixed in the
harness as well: OCCT's outer-versus-hole decision must be taken over an
op's *combined* profile (a pattern of five circles is five holes, not five
discs), so the engine now emits per-op oriented rings; and the involute's
Bézier fit is chord-length parametrised. The OCCT column of the results
table was re-measured after the first fix and is correct on every part.

## 15. Splines, STEP out, and phase 2 — the file tree over records

Two questions from outside, answered with code rather than a paragraph:

- **"Do we do splines?"** Now: a `spline` segment inside a `path`, or a
  closed `spline` loop, is a curve *through* points — a Catmull–Rom, one
  exact cubic Bézier per span, so it is exact in every kernel (Truck and
  OCCT take the Béziers as B-spline edges; Manifold samples them) and each
  span is a named face, `cam.cam[7]` (the loop's name, as for any loop;
  `span[k]` when it has none). `bench/cam.json` is a cam: twelve
  polar points with a rise over a third of the turn, a keyed bore. It
  builds watertight in Truck and its STEP reads back to the same volume.
  What we still do not do, and should not pretend to: lofts, sweeps along
  a path, free-form surfaces, and NURBS with user-set knots and weights.
  Those are OCCT ops behind the same seam, phase 4 work, and they will be
  named faces like everything else. The sketch language was never the
  ceiling — the sketcher UI (§8 phase 4) is.
- **"Do we have STEP export? I only see STL."** STEP was in the CLI from
  phase 1 (`cad build --step`) and in the bake-off as a mandatory column;
  what was missing was a button. The page now has one. It re-runs the
  exact kernel that built the part with its writer on — Truck's, or OCCT's
  when OCCT built it (fillets, the booleans Truck fails) — so the file is
  the B-rep the report judged, not a re-tessellation. STL is written on the
  page from the exact mesh when it has landed and the preview otherwise,
  because the mesh buffers were transferred out of the worker at build
  time and only the page still holds them.

Then the ask that matters more: **"we need to roll something close to a PDS
OS to run a file tree of a user's data records."** That is §2 as built, and
the intuition is exactly right — the thing to roll is small.

### 15.1 What a file tree over records is

A repo is a flat set of collections of records. A filesystem over it is a
*view*, the way a git tree is a view over blobs:

| | record | what it holds | mutability |
|---|---|---|---|
| a file | `com.minomobi.cad.part` | `path`, `name`, `kind` (part / assembly), `head` (a strongRef to a revision), timestamps | a head: it moves |
| a version | `com.minomobi.cad.revision` | the tree, `parents[]` as strongRefs, `createdAt`, `message`, the `kernel` that built it and the `invariants` it was judged by, `forkedFrom` | immutable |

Directories are whatever the paths imply; `list('clock/train')` is a prefix
filter. A rename edits the `path` field and the record's URI does not
change, so a machine's reference survives a human's tidy-up. History is the
parents chain, and a parent is a strongRef — a URI *and* a content hash —
so it may point into another repo. That is a fork: a new head in your repo
whose first revision's parent is theirs, and `history` walks straight
across the boundary. There is no server in this design. There is no file
list to keep in sync. The repo is the file list.

### 15.2 The four backends, and why a local one comes first

`packages/cad/lib/drive.js` is one class, `Drive`, over a five-call backend
contract (`getRecord`, `listRecords`, `createRecord`, `putRecord`,
`deleteRecord` — the ATProto repo methods, and nothing else). Four backends:

1. **Memory** — a Map, with a persist hook. The node CLI (`agent/drive.mjs`)
   keeps a whole repo in one JSON file; the selftests run against it.
2. **Local** — IndexedDB, same shape, in the browser. This is the drive a
   visitor gets with no sign-in: save, history, fork, all of it, and it
   survives a reload. Local-first is not a fallback; it is the answer to
   "what if the PDS is down" and "what if I never sign in".
3. **Public** — any repo, read over the two public XRPC methods. No auth,
   because the records are public. In the page these calls go to the
   site's own worker at `/xrpc/`, which resolves the handle or DID to its
   PDS and forwards — so the page's CSP stays `connect-src 'self'` and
   the page never learns a PDS host. The gateway serves
   `com.minomobi.cad.*` only: a CAD gateway, not a proxy.
4. **Auth** — the signed-in user's own repo through the shared auth worker
   (§2.3: zero OAuth code here; `packages/oauth-client/auth.js`, narrow
   scope `atproto repo:com.minomobi.cad.part repo:com.minomobi.cad.revision`).

The memory and local backends mint `local:<sha256>` as a record's cid: an
honest content hash, but not an IPLD CID, and a PDS would reject a
strongRef to one. So **push** is not a copy. It replays a local file's
mainline oldest-first onto the PDS, rewriting each parent ref to the cid
the PDS just minted; revisions that already live in a real repo (the fork's
source) are referenced, not copied. After a push the file's history on the
PDS is `mine ← mine ← theirs`, every ref real. The drive selftest proves
that with two in-memory repos standing in for a PDS and a stranger.

### 15.3 What it is not, yet

- **Trees are inline.** A revision carries its tree as a record field.
  Bench trees are 1–4 KB; the clock is 6 KB. The phase-2 kill criterion
  (§8) was "record limits force every tree to a blob"; they do not, at
  these sizes. Geometry is not stored at all — it is a cache, rebuilt from
  the tree — which is the §1 decision paying rent. One thing the first
  real write taught: **the ATProto data model has no floats.** The PDS
  refused `m: 0.5` at the door. The drive now writes every non-integer as
  its shortest decimal string — still a valid tree, since the tree
  language reads a numeric string as an expression — and hands numbers
  back on read; the round trip is exact and the selftest counts zero
  floats in stored records.
- **The bench is published.** `agent/publish.mjs`, run by the
  `publish-cad` workflow, files the twelve parts and two assemblies in the
  service account's repo, assemblies referencing parts by AT URI.
  Idempotent, so a bench edit becomes exactly one new revision.
- **Sign-in went live the same day** by taking over the auth worker's
  surface on this branch and adding the two collections to its scope
  ceiling (the origin was already admitted by the worker's `*.mino.mobi`
  wildcard). The drive and files tab were verified against a mocked repo
  in the browser selftest and against in-memory repos in the drive
  selftest; the ceiling was verified live with a cache-busted
  `client-metadata.json` and a real PAR — not yet with a full sign-in and
  a write to a real PDS, which needs a person on the consent screen.
- **No merge.** `parents` is a list, so a merge revision is representable;
  nothing writes one. `cad diff` exists; three-way merge of trees is
  phase-4 work alongside the sketcher.
- **Phase 7, first cut: the library as MCP tools.** `cad.mino.mobi/mcp`
  runs the engine wasm inside the worker and answers `check`, `build`,
  `measure`, `step`, `list_files` and `get_file` over JSON-RPC, so an agent
  that has never cloned anything gets the same numbers the page reports
  and a link to hand a human. No render (a browser's job; the link is the
  picture), no write (a person's sign-in is the pen), and — learned on the
  first deploy — no Manifold: its Emscripten glue generates invokers with
  `new Function`, which Workers forbid, so interference stays a local tool
  until Manifold is rebuilt without dynamic execution. The phase-7 gate — a
  passing sub-assembly from a sentence, no human edits — is runnable
  against a URL for everything but the clash check.
- **No `.stl` / `.png` faces on an AT URI** (§2.2). The gateway is the
  first step; content negotiation is the next.
