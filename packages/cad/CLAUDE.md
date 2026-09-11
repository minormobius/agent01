# cad — cad.mino.mobi

Parametric CAD in the browser. A feature tree in, solids out: the preview
lands in milliseconds, the exact build with named faces behind it. The design
record is [`docs/CAD.md`](../../docs/CAD.md); the engine and its bake-off are
documented in [`README.md`](README.md) next to this file.

## Facts

| | |
|---|---|
| Surface | `cad` |
| Dir | `packages/cad/` — the package *is* the site (`assets.directory: "."`, `.assetsignore` drops `engine/` and `bakeoff/`) |
| Endpoint | `cad.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/browser-cad-ideation-ollmd3` |
| Deploy | [`.github/workflows/deploy-cad.yml`](../../.github/workflows/deploy-cad.yml) |
| Uses | — |
| Provides | — |

## What it is

- **`index.html` + `app.js`** — the viewer and the judgement surface: params
  (drag a name to scrub), the feature list, the raw tree, the part, and the
  report (invariants for preview and exact side by side, the face under the
  cursor with its names, three-view snapshots, STL export, a share link that
  carries the whole tree in the hash).
- **`build-worker.js`** — the engine host, off the main thread. Loads
  `cad.wasm` (the Rust engine: tree → resolved; Truck for the exact build)
  and `vendor/manifold.js` (the preview kernel). One build request answers
  twice: `preview` then `exact`; a newer request supersedes an older one
  in between.
- **`gl.js`** — hand-written WebGL2. Flat shading from per-triangle normals,
  feature edges from the dihedral angle, an id pass into a framebuffer so a
  hover returns a face id that maps onto the engine's *named* faces. No
  three.js: the geometry pipeline is ours end to end and the renderer is
  400 lines.
- **`lib/`** — shared by the site, the worker and the bake-off harness:
  `engine.js` (the ABI), `mesh.js` (weld, invariants, edges, streams, STL),
  `manifold-kernel.js` and `occt-kernel.js` (the kernel adapters as pure
  functions of a loaded module and the resolved tree).

- **Assemblies.** A document with `components` is an assembly: each
  component names a part (`bench:<name>` or an inline tree, with optional
  `params` overrides that make a distinct part build), a placement (`at`,
  `rotate`), and a `phase`; a component may instead hold a sub-`assembly`,
  flattened with its ids prefixed (`stage2/arbor`). `mates` are `gear`
  (`za`, `zb`) and `fixed`; `drive` names one component and an rpm. The
  angles are a kinematic chain from the driven component; *spin* animates it
  and reports the frame rate. Gear phases are set automatically unless a
  component gives one. A `drive` is either `{component, rpm}` or an
  `escapement` (`wheel`, `pallet`, `balance`, `teeth`, `beat`, `lift`,
  `swing`): the wheel steps half a tooth per beat, the fork rocks, the
  balance swings, and the train ticks through the mates. `bench/train.json`
  is a two-stage train; **`bench/clock.json` is the clock** — going train,
  lever escapement, motion works, hands, dial, case, eighteen components
  from nine bench parts with parameter overrides. Click a component row to
  hide or show it (hide the dial and case to watch the movement); hovering a
  face highlights its component in the list and the report.
- **OCCT, lazily.** Fillets, chamfers, shells and any boolean Truck fails go
  to OCCT, loaded on demand from unpkg (66 MB, cached by the browser) after
  the user presses *exact with OCCT* once (`localStorage cad.occt=1`), or
  always when `?occt=<base>` names a base URL — which is how the selftest
  runs it from a locally served copy.
- **Phone.** One finger orbits, two fingers pan and pinch. Under 900 px the
  part takes the top of the screen and one tabbed panel (params, tree,
  report) the bottom third.

- **Measure.** Every face the exact kernel names carries its geometry — a
  plane or a cylinder (a circle is four exact arcs, so a bore is a real
  cylinder) — so hovering a bore reads its diameter, and pinning one face
  then clicking another gives plane-to-plane, axis-to-axis (with both
  diameters and the wall between) or axis-to-plane distance. Numbers come
  from the geometry, never the mesh; the preview mesh is polygons.
- **Interference.** *check interference* in an assembly poses every
  component at the current angles and intersects each overlapping pair
  with Manifold; pairs with more than 0.01 mm³ in common are listed,
  fixed-mated bores on their arbors marked as expected touches. Hover a pair
  to light both components.
- **Export.** *stl* exports the part (or, in an assembly, the pinned or
  hovered component's part).
- **Headless, for an agent.** `agent/check.mjs`, `agent/measure.mjs`,
  `agent/export.mjs` and `agent/render.mjs` do the same from a file on disk;
  the skill at `.claude/skills/cad/SKILL.md` is the instruction sheet.

## How it works

1. `app.js` posts `{type:'build', tree}` to the worker.
2. The worker resolves the tree with the Rust engine (expressions evaluated,
   sketches to regions, gears to loops), builds the Manifold preview from the
   sampled polylines and posts it with invariants, streams and edges
   (transferred, zero-copy), then runs the Truck exact build and posts that.
3. The renderer uploads the streams once; hover picks from the id buffer.

The exact kernel in the browser is Truck first: fine and fast on sweeps,
honest about the booleans it cannot do (§13 of the design record). OCCT, the
exact kernel the bake-off chose, is 66 MB — over the 25 MiB static-asset
ceiling — so it is not shipped with the site but imported by the worker from
unpkg on demand (jsDelivr refuses files that size); the worker's own CSP in
`_headers` names that host. Fillet selectors reach OCCT through the engine's
reference faces: the tree minus its fillet ops is built by Truck, and the
named face's centroid and normal pick the OCCT face whose edges get rounded.

## Quirks

- **`cad.wasm` is committed.** Rebuild with `engine/build.sh`, which runs the
  unit tests, both builds, and `cad.selftest.mjs`. Never hand-build.
- **Two selftests gate the deploy:** `cad.selftest.mjs` (the ABI, from bytes
  under node) and `browser.selftest.mjs` (headless Chromium loads the page,
  builds every bench part, checks the report against closed forms, and
  screenshots). Run both before pushing.
- `?part=<bench>` loads a bench part; `#t=<base64url json>` carries an
  arbitrary tree — an agent can hand a human a link.
- Keys: drag orbit, shift/right-drag pan, wheel zoom, two fingers pan and
  pinch, `f` fit, `o` ortho, `e` edges, `g` grid, `space` spin, `0/1/3/7`
  views.
