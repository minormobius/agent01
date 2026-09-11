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

## How it works

1. `app.js` posts `{type:'build', tree}` to the worker.
2. The worker resolves the tree with the Rust engine (expressions evaluated,
   sketches to regions, gears to loops), builds the Manifold preview from the
   sampled polylines and posts it with invariants, streams and edges
   (transferred, zero-copy), then runs the Truck exact build and posts that.
3. The renderer uploads the streams once; hover picks from the id buffer.

The exact kernel in the browser is Truck: fine and fast on sweeps, honest
about the booleans it cannot do (§13 of the design record). OCCT, the exact
kernel the bake-off chose, is 66 MB — over the 25 MiB static-asset ceiling —
so it is not shipped here yet; `lib/occt-kernel.js` is ready for it as a lazy
load from a CDN that serves it (unpkg does, jsDelivr does not).

## Quirks

- **`cad.wasm` is committed.** Rebuild with `engine/build.sh`, which runs the
  unit tests, both builds, and `cad.selftest.mjs`. Never hand-build.
- **Two selftests gate the deploy:** `cad.selftest.mjs` (the ABI, from bytes
  under node) and `browser.selftest.mjs` (headless Chromium loads the page,
  builds every bench part, checks the report against closed forms, and
  screenshots). Run both before pushing.
- `?part=<bench>` loads a bench part; `#t=<base64url json>` carries an
  arbitrary tree — an agent can hand a human a link.
- Keys: drag orbit, shift/right-drag pan, wheel zoom, `f` fit, `o` ortho,
  `e` edges, `g` grid, `0/1/3/7` views.
