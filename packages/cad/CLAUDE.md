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
  `rotate`, `offset`), a `phase`, a `repeat`; a component may instead hold a
  sub-`assembly`, flattened with its ids prefixed (`stage2/arbor`). `mates`
  are `gear`, `belt`, `fixed`, `screw`, `rack` and `slider` (the table at
  the top of `lib/assembly.js`: each propagates turning or travel from the
  drive, in either direction; `solveAngles` carries a `slide` map beside the
  angles and `modelOf` composes placement × travel × turn); `drive` names
  one component and an rpm. The
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
  **Placements are expressions** (`lib/expr.js`, a mirror of the engine's
  `expr.rs` that `assembly.selftest.mjs` holds to the bit): a document's
  `params` and its `derived` (resolved in dependency order, any key
  order, with `t` seconds and `theta` the driven angle) may appear in any `at`, `rotate` or `drive` number, and in
  component `params` overrides. `flatten` marks such components `dynamic`
  and `modelOf` re-evaluates their placement at the `t`/`theta` the angles
  map carries; static documents pay nothing. `bench/crank.json` is the
  crank–slider that proves it, in the node test and the browser test.
  **Repeat and place-by-feature:** `repeat: n` makes `id[i]` instances
  with `i` in scope; `at: "@comp.face"` and `rotate.align` put a component
  on another's named face (anchor and axis from the exact kernel's face
  geometry) and follow that component through its motion. `flatten` takes
  a `facesOf(partKey, treeJson)` hook for the geometry — `agent/common.mjs`
  builds with Truck once per tree; the page's `facesOf` asks the build
  worker and awaits the exact report (`build()` then skips a slot already
  built from the same tree); `mcp.js` has its own. Without the hook a
  reference is an error. `bench/lift.json` — screw, nut, platform, four
  bolts by reference — proves all three in every test.
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
  fixed- and screw-mated pairs (a bore on its arbor, a nut on its screw)
  marked as expected touches (`expectedTouch` in the library, shared with
  `check.mjs` and the MCP). Hover a pair to light both components.
  Headlessly, `check.mjs --sweep N` and the MCP tool's `sweep` check N
  instants over a period (`periodOf`: a turn, two beats, or given).
  **Clearance, without a kernel:** `lib/proximity.js` is a pure-JS BVH
  over the exact meshes — nearest approach per pair with the realising
  points, triangle crossings, containment by ray parity (three rays,
  majority, because one axis ray lands on a cube's diagonal), a
  penetration estimate, and `touching` for contact with no depth.
  `lib/sweep.js` runs it through the motion and chases each pair's
  minimum between samples (golden section), with `verdictOf`: collision /
  contact / expected / fit / close / loose / clear — a touch with no depth
  is contact, not collision, and a document's `fits` (`[min, max]` per
  pair, `[*]` for a repeat, `contact: true` for a designed touch) are
  judged on their own numbers (`expectations(mates, fits)`). Clearance
  meshes are built at `res: 256` (chord tolerance 0.0025 mm) so a designed
  0.1 mm reads 0.098, not 0.093. `check.mjs --clearance d` and the MCP
  `interference` tool's `clearance` use it — which is why interference is
  a server tool now (Manifold still cannot run there; volumes stay local).
  **The server's sweep is windowed, and budgeted by WORK, not time.** A
  Cloudflare Worker freezes its clock during synchronous execution, so a
  wall-clock budget never trips and the request dies on CPU instead
  (measured on the clock: code 1102 at 143 s, 2026-09-12). `pairWork` in
  `lib/sweep.js` counts what an instant actually costs — the triangles on
  both sides of every pair — measured at 1.5–5.7 µs per unit under node
  across the bench. `sweepClearance` takes `from`, `maxInstants`,
  `refineBudget` (units, closest pair first) and `refineWithin` (skip pairs
  no closer than four times the clearance plus a millimetre), and returns
  `done`, `next`, `sampled` and `work`; `budgetMs` still works where the
  clock runs. `mcp.js` builds at most `maxParts` new part meshes per call
  and keeps them in a module-level `MESH_CACHE` (48 entries, keyed by tree
  text and res) so the next call resumes, spends six tenths of
  `caps.workBudget` on instants and the rest on refinement, and takes
  `res` (64/128/256) so a coarse check is affordable. An assembly whose
  single instant is past the budget is **refused** (`incomplete: "too-big"`,
  with the numbers and what to do) rather than killed. The live worker is
  created with `maxParts: 3, workBudget: 6e6` under its 120 s `cpu_ms` —
  calibrated live: three instants of the lift plus refinement, 2.1M units,
  took 11 s of one request, so about 5 µs a unit, twice node's. The clock
  fits at res 64 (1.9M) and 128 (2.5M), not at 256 (6.7M); the lift takes
  nine instants a call.
  Components with `reference: true` are drawn translucent and left out of
  checks and export; `hidden` is display only and counts.
- **Audit.** `agent/audit.mjs --at <repo> [--kernels]` rebuilds every
  part in a repo and diffs volume, χ, watertightness and face count against
  the invariants its revision recorded (`publish.mjs` stores them on every
  part it publishes); `--kernels` checks Truck and Manifold agree on volume
  within a tolerance. `publish-cad.yml` runs it on the bench after each
  publish: the whole published corpus as the kernels' regression suite.
- **Drawings.** `lib/drawing.js` makes an engineering drawing as SVG from
  the exact meshes, with no kernel and no browser, so the page's *drawing*
  button, `agent/drawing.mjs` and the MCP `drawing` tool all produce the
  same picture: third-angle views (front, top, right by default; `iso` and
  the other four on request), hidden lines found by casting a ray from each
  piece of each edge toward the viewer through a BVH of every body, the
  overall width, height and depth dimensioned, and every cylindrical hole
  called out with its count, diameter and depth when blind. A circle is four
  exact arcs, so one bore is four cylindrical faces: they are grouped by
  axis line and radius within a tolerance (exact string keys split on the
  last bits and on negative zero). A face whose surface normal points away
  from its axis is a boss, not a hole. On an assembly every component is
  posed at `t` and `reference` ones are left out. The output is
  deterministic, so two drawings of one tree diff cleanly.
- **Assembly reports.** `lib/report.js` turns an assembly into one
  self-contained HTML page — the *report* button, `agent/report.mjs` and the
  MCP `report` tool all produce the same bytes: the assembly in three views,
  an **exploded** isometric with a numbered balloon per item (`drawing`'s
  `balloons` option; the balloons de-overlap by relaxation), a parts list
  with quantities, volumes and sizes, a drawing of every distinct part, and
  the assembly steps. Every row links into the viewer (`#t=` of that part's
  own tree, `?at=` for the assembly when it came from a repo), so the page
  is a handover document rather than a picture. **The steps are derived, not
  inferred** (`assemblySteps`): a placement says where a component goes, a
  `@comp.face` reference says what it sits on (recorded as `placedBy` by
  `flatten`), a mate says what joins it and with which numbers, a `fits`
  entry says the clearance the pair is designed to keep. Nothing is guessed
  — `report.selftest.mjs` asserts that no step contains a word the document
  did not state. Order is the document's own, which is a build order because
  a reference must name a component declared before it; consecutive
  instances of one repeat collapse into a single step. `explodeBodies`
  pushes each part away from the centre — along its own axis where it is
  concentric with it, and further out when it is behind another part going
  the same way, so a stack separates from itself; the test asserts that
  nothing touches once exploded. A part the exact kernel cannot build here
  (a boolean Truck refuses, which OCCT does in the browser) is **named on
  the page with its error** and left out of the drawings, rather than
  silently dropped or failing the whole report — the clock reports 16 of 18
  components that way. The MCP tool redraws without hidden lines and with
  fewer part sheets when a page would come back over 3.5 MB, and says so.
- **Export.** *stl* writes the mesh on the page (the exact one when it has
  landed, else the preview); *step* asks the worker to re-run the exact
  kernel that built the part with its STEP writer on — Truck's, or OCCT's
  when OCCT built it. In an assembly both export the pinned or hovered
  component's part.
- **The published bench.** `agent/publish.mjs` writes every bench part to
  `parts/<name>` and the assemblies to `train`, `clock`, `crank` and `lift` in the service
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
  worker's `/xrpc/` gateway** (`gateway.js`: the two public read methods,
  `com.minomobi.cad.*` only, handle and DID resolved server-side; plus the
  two public actor methods, `searchActorsTypeahead` and `getProfile`,
  forwarded to the public API with their declared params), so the page's
  CSP stays `connect-src 'self'` plus the auth worker. **Every handle field
  suggests accounts as you type** — `vendor/typeahead.js`, a copy of
  `packages/oauth-client/typeahead.js` kept by `sync-dataviz`, a native
  `<datalist>` fed by the gateway; the browse field skips DIDs and AT URIs.
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
  (`check`, `build`, `measure`, `interference`, `drawing`, `report`, `step`,
  `list_files`, `get_file`), mounted at `/mcp` by `worker.js` — GET the descriptor, POST
  JSON-RPC. The engine wasm runs *inside the worker*: imported as a wasm
  module (Workers cannot compile wasm from bytes) and instantiated once per
  isolate on first call. **Manifold cannot run there**: its embind glue
  builds invokers with `new Function`, which Workers forbid (measured:
  "Code generation from strings disallowed"), so the live host is created
  with `capabilities: { manifold: false }`; the preview kernel is off the
  menu there, and `interference` answers in clearance mode (exact meshes,
  `lib/proximity.js`) — shared volumes run locally. `measure` takes an
  assembly with `component.face` names and `t`. CPU is the other limit: the 60-tooth
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
- **`/parts/` is another worker.** The social layer (`../../parts/`, its own
  surface, Durable Object and cron) is mounted here through the `PARTS`
  service binding in `wrangler.jsonc`: `worker.js` strips the prefix and
  forwards, so the parts worker sees the paths it would on a host of its
  own. It has no host of its own because the `mino.mobi` zone is at
  Cloudflare's ceiling of 100 Workers custom domains (measured on its first
  deploy, code 100122); `parts/CLAUDE.md` has the detail. Deploying cad
  therefore needs the `parts` worker to exist — it does; a fresh account
  would deploy parts first.
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
  unit tests, both builds, and `cad.selftest.mjs`. Never hand-build. A
  failed union of a region's outer loops names the two loops (`union of
  outer loops \`body\` and \`slot\` failed — do their outlines overlap or
  touch?`): a kernel error reported as the design error it almost always is.
- **Seven selftests gate the deploy:** `cad.selftest.mjs` (the ABI, from
  bytes under node), `drive.selftest.mjs` (the file tree and the gateway),
  `assembly.selftest.mjs` (expressions against the engine, kinematics
  against closed forms, the mates, repeat and references),
  `drawing.selftest.mjs` (the SVG drawing by its numbers: views, dimensions,
  hole callouts, hidden lines, and that it is deterministic),
  `report.selftest.mjs` (the assembly report: the parts list, the steps and
  what they refuse to invent, the exploded view actually separating parts),
  `mcp.selftest.mjs` (the tool surface, both hosts) and
  `browser.selftest.mjs` (headless Chromium loads the page, builds every
  bench part, checks the report against closed forms, spins the train and
  the crank, poses the lift, saves and forks files against a mocked repo,
  draws, reports, and screenshots; skips, saying so, without Playwright).
  Run all seven before pushing.
- **Truck's gear build is not deterministic.** The first thing the corpus
  audit found: the 60-tooth gear, built twice in one process, gives χ −40
  then −41, different triangle counts, and a volume that moves in the
  fourth decimal — old wasm and new alike, so it is Truck (hash-ordered
  work inside its meshing and booleans), not a rebuild. The tell is
  `watertight: false`; a part Truck closes (the plate, the case) is exact
  run to run. Its B-rep is stable — 502 faces every time — and the volume
  to a part in a thousand, so those are what `audit.mjs` holds a
  non-watertight part to, and χ and the triangle count only where the
  mesh closes. Do not "fix" this by loosening a watertight part's check.
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
