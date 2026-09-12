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
- **Export.** *stl* writes the mesh on the page (the exact one when it has
  landed, else the preview); *step* asks the worker to re-run the exact
  kernel that built the part with its STEP writer on — Truck's, or OCCT's
  when OCCT built it. In an assembly both export the pinned or hovered
  component's part.
- **The published bench.** `agent/publish.mjs` writes every bench part to
  `parts/<name>` and the assemblies to `train` and `clock` in the service
  account's repo (`BLUESKY_BOT_*`, the identity that owns minomobi.com),
  rewriting `bench:` refs to the AT URIs of the published heads;
  `.github/workflows/publish-cad.yml` runs it on a push touching `bench/`,
  the publisher, or itself, and verifies through the gateway. Idempotent:
  an unchanged tree is skipped. A component ref may be `bench:<name>`, an
  AT URI (a part head, or a revision to pin), or an inline tree — in the
  page and in the agent scripts.
- **Files.** The *files* tab is a file tree over ATProto records
  (`lib/drive.js`): a `com.minomobi.cad.part` head names a path and points
  at an immutable `com.minomobi.cad.revision` (the tree, its parents as
  strongRefs, the kernel and invariants it was judged by). Three repos can
  be on screen: the **local drive** (IndexedDB, `did:local`), the
  signed-in user's **PDS** (writes through `auth.mino.mobi` with the narrow
  scope `atproto repo:com.minomobi.cad.part repo:com.minomobi.cad.revision`),
  and any **public repo** browsed by handle, DID or AT URI. `?at=<at://…>`
  opens a file; save, history (click a revision to view it), fork (to local,
  lineage kept across repos) and push (local → PDS, revisions recreated
  oldest-first so they get real cids). Public reads go through **this
  worker's `/xrpc/` gateway** (`worker.js`: the two public read methods,
  `com.minomobi.cad.*` only, handle and DID resolved server-side), so the
  page's CSP stays `connect-src 'self'` plus the auth worker.
- **Headless, for an agent.** `agent/build.mjs` (check and exact build
  over the wasm: invariants, named faces, STL/STEP — node only, no Rust),
  `agent/check.mjs`, `agent/measure.mjs`, `agent/export.mjs`,
  `agent/render.mjs` and `agent/drive.mjs` (the file tree from a terminal:
  a JSON-file repo, anyone's public repo, or your own with `--login` and an
  app password) do the same from a file on disk. **`SKILL.md` in this
  directory is the instruction sheet** — canonical here, served at
  `cad.mino.mobi/SKILL.md`, and synced to `.claude/skills/cad/SKILL.md` by
  `scripts/sync-dataviz.mjs` (edit it here, never the copy). `llms.txt` is
  the site's index for agents; `README.md` (the schema) is served too.
- **MCP.** `mcp.js` is the headless library as Model Context Protocol tools
  (`check`, `build`, `measure`, `interference`, `step`, `list_files`,
  `get_file`), mounted at `/mcp` by `worker.js` — GET the descriptor, POST
  JSON-RPC. The engine wasm runs *inside the worker*: imported as a wasm
  module (Workers cannot compile wasm from bytes) and instantiated once per
  isolate on first call. **Manifold cannot run there**: its embind glue
  builds invokers with `new Function`, which Workers forbid (measured:
  "Code generation from strings disallowed"), so the live host is created
  with `capabilities: { manifold: false }` and its tool list omits
  `interference` and the preview kernel, saying so in the descriptor and
  the instructions; those run locally. CPU is the other limit: the 60-tooth
  gear takes ~27 s of Truck there, so `wrangler.jsonc` raises `cpu_ms` to
  120 s and the host builds an assembly **three parts per call**
  (`maxParts`; the client passes `parts` to continue — the whole clock in
  one request was a 1102). No render (needs a browser; the link is the
  picture), no OCCT, no writes. `mcp.selftest.mjs` drives the module
  under node both ways; the worker-side loading is verified only by the
  deploy and a live `curl -X POST …/mcp` — do both after touching it.
- **`docs/index.html`** is the system page (`cad.mino.mobi/docs/`): spec,
  pipeline, kernels, data model, backend, tests, agent access, and what is
  not built. Static, no scripts, its own inline styles on the site's
  palette; the header's *docs* link points at it. Declared in the root
  catalogue's `notListed` as `content`. Keep it honest: a `not yet` tag on
  anything unbuilt, numbers only where a test asserts them.
- **The mirror.** `.github/workflows/mirror-cad-tangled.yml` force-pushes
  this package — minus `engine/target`, `node_modules` and the Cloudflare
  files, plus the skill under `.claude/skills/cad/` and a README — to a
  repo on tangled after every push here, with the morphyx deploy key the
  hoop mirror uses. That repo is the front door for anyone who wants the
  CAD without the monorepo: `https://tangled.org/morphyxmino.bsky.social/cad`
  (`TANGLED_HANDLE` / `TANGLED_REPO` in the workflow). Verified 2026-09-11:
  a fresh HTTPS clone is 4 MB and passes `build.mjs`, all three node
  selftests, and a `check.mjs` on the clock pulled from the network.

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
- **Four selftests gate the deploy:** `cad.selftest.mjs` (the ABI, from
  bytes under node), `drive.selftest.mjs` (the file tree and the gateway),
  `mcp.selftest.mjs` (the tool surface) and `browser.selftest.mjs` (headless Chromium loads the page, builds every
  bench part, checks the report against closed forms, saves and forks files
  against a mocked repo, and screenshots). Run all four before pushing.
- **`vendor/auth.js` is a copy** of `packages/oauth-client/auth.js`, kept
  byte-identical by `scripts/sync-dataviz.mjs` (preflight checks it). Edit
  the package, never the copy.
- **This branch owns the auth worker too** (`workers/auth`, since
  2026-09-11): it was taken over to put `com.minomobi.cad.part` and
  `com.minomobi.cad.revision` into the live scope ceiling. The origin needed
  nothing — `isAllowedOrigin` has a `*.mino.mobi` wildcard — but it is listed
  explicitly. Adding a cad lexicon means editing `WRITE_COLLECTIONS` in
  `workers/auth/src/oauth/scope.ts` on this branch; a push under
  `workers/auth/**` deploys it. Read `workers/auth/CLAUDE.md` first: union
  only, never remove, `node scripts/check-auth-scope.mjs` green. Signed out,
  the page works against the local drive and public repos.
- `?part=<bench>` loads a bench part; `#t=<base64url json>` carries an
  arbitrary tree — an agent can hand a human a link; `?at=<AT URI>` opens a
  file from any repo.
- Keys: drag orbit, shift/right-drag pan, wheel zoom, two fingers pan and
  pinch, `f` fit, `o` ortho, `e` edges, `g` grid, `space` spin, `0/1/3/7`
  views.
