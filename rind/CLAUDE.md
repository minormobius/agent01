# rind — CLAUDE.md (the STRUCTURE wing)

You are working on **rind**, the structure wing of the O'Neill cylinder modelling package.
Read `rind/README.md` first — this file is the operational quick-reference.

## What rind is

The foam **space-frame shell** of an infinite O'Neill cylinder, plus the Rust/WASM **frame
solver** that scores it. Three browser tools over one structural pipeline (generate foam in
JS → emit a frame model → solve for stress):

- `cylinder.html` — structural + radiative scratchpad; sizes the shell, live stress play-slice.
- `foamview.html` — 3D read of the layered foam (orbit, radial probe, solved member forces),
  plus wayfinding: a drivable spiral ramp → azimuthal road → ramp route through the chamber
  graph (`wayfind.js`, certified by `test/wayfind.selftest.mjs`).
- `walk.html` — first-person walk through a planar cut of the foam.

## The package it belongs to

Four surfaces, one cylinder. **game → [hoop](../hoop)** · **structure → rind (you)** ·
**thermodynamics → [tide](../tide)** · **ecosystem → [biome](../biome)**. rind was split out
of hoop; it is the shell, tide/biome are the air/life inside it. Keep the cross-links in
`index.html`'s "four wings" block and the footer working when you touch the landing page.

## Run / test (everything works from the sandbox except deploy)

```bash
( cd rind/solver/cylinder-solver && cargo test )   # the solver math, offline
node rind/solver/foam-preview.mjs                  # headless foam → frame model preview
node rind/test/wayfind.selftest.mjs                # wayfinding certificates (no deps)
open rind/index.html                               # the three tools
```

Structural correctness lives in the Rust crate's `cargo test`; the wayfinding (spiral ramps +
azimuthal roads through the chamber graph, `wayfind.js`) is certified by its node selftest.
The pages themselves are exercised by eye (open them).

## Deploy

- **Site:** push `rind/**` on `main` or `claude/oneill-cylinder-refactor-xjknww` →
  `deploy-rind.yml` runs `wrangler deploy`. The sandbox **cannot** deploy; push and let the
  Action run. Verify the log binds `rind.mino.mobi (custom domain)` (the golden rule).
- **Solver wasm:** edit the Rust under `solver/cylinder-solver{,-wasm}/` → `build-cylinder-solver.yml`
  rebuilds `solver/pkg/**`, commits it, and dispatches `deploy-rind.yml`. Don't hand-edit
  `solver/pkg/` — it's generated.
- Ownership lives in `deploy-registry.json` (surface `rind`, branch
  `claude/oneill-cylinder-refactor-xjknww`). Change the branch there, then run
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## Invariants — do not break

1. **The solver is optional.** The JS fallback must keep every page working when `solver/pkg`
   is absent or fails to load. Verify the `solver: …` pill degrades to "offline — geometry only".
2. **"hoop" here is structural physics** (hoop tension / hoop BC / annular hoop solve), not the
   game site. Never rename those identifiers.
3. **Edges are structure, plates are not.** Doors/stairs are openings in plates and must never
   cut a structural edge — that's what keeps the foam navigable *and* load-bearing at once.
4. **Pure static.** No build step for the site, no D1/DO/secrets. Geometry in JS, scoring in
   optional WASM.
