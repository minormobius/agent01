# Browser CAD — a design record

One pass of ideation, written before anything exists, so the reasoning survives
the conversation it came from. Same genre as [`CLOSED-LOOP.md`](CLOSED-LOOP.md):
the **why** and the shape, not a backlog.

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
| `com.minomobi.cad.assembly` | components `[{ref: strongRef → part revision, transform, name}]`, mates `[{kind, a, b, params}]`, and a head revision like parts | as above |
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
| **Truck / Fornjot** (Rust) | young open B-rep kernels | Rust, ours to extend | years from fillets that work |

**Recommendation.** OCCT behind the adapter as the *exact* kernel, because a
CAD without fillets and STEP is a toy and every machinist's first question is
"can you send me a STEP". Manifold for the preview loop — every drag of a
dimension re-evaluates on meshes at interactive rate, and the exact rebuild
lands behind it — and for the server-side path, since it fits a Worker and
OCCT does not. Implicit only where it is strictly better: the simulation path.

**This is decided by a bake-off, not by this paragraph.** The repo already has
the apparatus (`bakeoff/`). Five benchmark parts of rising nastiness (a plate
with holes; a shelled box with fillets; a revolved flange with a bolt pattern;
a boolean of two swept tubes; a 200-feature real-world bracket), each kernel
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
| 0 | **Kernel bake-off** in `bakeoff/` style: OCCT-wasm vs Manifold vs an implicit spike on the five benchmark parts | a table with wall time, size, invariant errors | no kernel builds the 200-feature bracket under 5 s cold in a browser |
| 1 | **Tree + headless.** `packages/cad/`: schema, expressions, naming, the adapter, `build/check/measure/diff`, selftests with golden invariants. No UI. | the §1.1 bracket builds under node and exports an STL that prints | topological naming can't be made stable across the benchmark edits |
| 2 | **Lexicons + push.** Revisions, heads, strongRef parents; `cad push`; rebuild a part from its AT URI | round-trip: push from node, rebuild in a fresh clone, invariants match | record limits force every tree to a blob (then the design changes, not dies) |
| 3 | **Viewer surface `cad.mino.mobi`.** Read-only WebGPU render of any `at://` part; `.stl/.glb/.png` faces; the R2 geometry cache | a Bluesky post links a part and the preview renders | — |
| 4 | **Sketcher + editor.** The 2D solver, the timeline, drag with preview kernel | a human draws the bracket without touching JSON, under the budgets in §4 | drag latency can't be brought under a frame on integrated graphics |
| 5 | **Assemblies.** Mates, mate solver, interference, cross-DID references | a ten-part assembly from three PDSes, drag a component, mates hold | — |
| 6 | **Stress.** TetGen path, then the immersed path, PCG solve, study records | the bracket's max stress matches a closed-form beam within 5 % | — |
| 7 | **Agent API.** HTTP + MCP over the headless library; the loop runs the bracket brief end to end | an agent produces a passing revision from the text brief with no human edits | — |

Phases 1–2 are the programme. If they hold, everything after is engineering
with known answers. If they do not, the browser editor was never the problem.

---

## 9. Asks — things no gate can measure

In the manner of [`.github/loop/vision.md`](../.github/loop/vision.md), the
questions only the operator can answer, so that the next turn does not guess:

1. **Public-by-default is acceptable?** The commons is the thesis, but the first
   real design will be something you might not want on a firehose. Encrypted
   blobs cost one phase of work; say whether it is phase 2 or phase 9.
2. **STEP is required for phase 1?** It decides whether OCCT is in the first
   bake-off or the second. My prior is yes.
3. **Rust or TypeScript for the layer above the kernel?** The repo's WASM
   precedent is Rust; the no-build precedent is plain JS. The tree/expression/
   naming layer is small enough to be either. Rust if the sketch and mate
   solvers are ours; JS if we take `planegcs`.
4. **Which real part first?** The benchmark bracket should be something you
   actually need printed, so the gate is "it printed and fit", not a number.
