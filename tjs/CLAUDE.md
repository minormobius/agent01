# tjs — tjs.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

tjs.mino.mobi — three.js workbenches…

## Facts

| | |
|---|---|
| Surface | `tjs` |
| Dir | `tjs/` |
| Endpoint | `tjs.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/threejs-procgen-buildings-mprgs6` |
| Deploy | `.github/workflows/deploy-tjs.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "tjs"`.

## How it works

tjs.mino.mobi — three.js workbenches. Landing at /, benches at /gantry (configurable HBot gantry test bench: seven-segment jerk-limited motion profiles, open-loop stepper torque-vs-pullout-envelope dynamic analysis, two Z lead-screw axes with gripper/pipettor tools), /orb (spherical-symmetry toy: a sphere sliced into n longitudinal lunes (axial Cn) or a polyhedral kaleidoscope — tetra/octa/icosa Schwarz-triangle fundamental domains), /infill (a 50mm sphere packed with 3D-printer infill — gyroid, Schwarz-P, diamond, Neovius, honeycomb, grid, triangular — raymarched with a scroll-driven peel plane that caps the cut cross-section; CPU Monte-Carlo density calibration; solid-shell toggle; and a coarse in-browser 3D FDTD acoustic panel — transmission loss of the orb vs free field, run in a module worker over a validated reference solver in infill/acoustics.js, WebGPU fine-grid port planned), and /swarm (a 3D swarm of bees: instanced bee micro-meshes with shader-flapped wings over a live agent sim in swarm3d.js — attractor orbit (radial pull + axis×radial swirl) + Reynolds boids over a 27-cell 3D spatial hash + divergence-free 3D curl-noise + a true stigmergy scent voxel grid bees deposit into / evaporate+diffuse / climb the gradient of; deterministic fixed-1/60s step, node-tested in swarm3d.selftest.mjs; lead-the-swarm pointer steering + scent-field visualisation), and /beelix (a descending helix of bees emerging from BOIDS, not authored geometry: a hive particle-emitter up top, a death plane below that recycles bees into the pool, and a central light pipe. Bees run real Reynolds boids (separation/alignment/cohesion) as self-propelled constant-cruise active-matter particles; the ONLY authored forces are the light pipe's — phototaxis (inward confinement, sets no radius), downward flow, and a faint Light-swirl (pipeSpin) which is the sole rotational input. Pure boids in a flow-through column lock a handedness only ~half the time (raw emergence is unreliable); the faint light swirl breaks the tie and boids alignment AMPLIFIES it into a coherent mill that the descent shears into a helix — radius/pitch/thickness stay emergent, swirl sign sets handedness. HUD reads the swarm angular momentum L so you can watch it lock. Travelling light pulses kick+glow bees they pass. Instanced bees via shared beelix/beemesh.js; reuses swarm3d's curl-noise; node-tested in beelix.selftest.mjs (18 checks incl. sign(L)=sign(swirl) on every seed), and /cube (smart cellular bricks — browser port of rmorenoga/cube3D: a 3D neural cellular automaton where every living voxel runs the EXACT trained ~26k-param network lifted from the physical ESP32 cube firmware's neural_network.h (7-point-stencil perceive 28→84 + dense 84→84→27, tanh residual, stochastic fire), gossiping class beliefs with 6 face-neighbours until the assembled shape classifies ITSELF among 7 ShapeNet classes; ships the repo's real 487-shape 15³ voxel dataset; smash-mode raycast damage with ballistic debris + slab-chop — survivors re-classify (paper's damage recovery); instanced-mesh render, per-cube vote colour × softmax confidence; engine nca.js is pure/DOM-free, node-tested in nca.selftest.mjs against numpy goldens (<5e-6 logit parity, 99.4% cell accuracy over the full dataset)), and /geb (a Gödel-Escher-Bach trip-let generator: type three strings and the solid is carved as the intersection of three text-extrusion prisms — a voxel is kept only where all three silhouettes agree — so its orthogonal shadow down each axis spells that axis's line, exactly as the two wooden trip-lets on the GEB cover throw G/E/B. Each string is rasterised to an N×N silhouette (fit-to-box, per-axis in-plane rotation so letters can be turned relative to each other as the real trip-lets need), intersected on an N³ grid (N 48–120), surface-meshed (only solid↔empty faces). The object sits smaller inside a larger shadowbox (object-size slider) whose walls are lit from inside by three axis lights plus a froxel volumetric — the occupancy grid uploaded as a Data3DTexture and raymarched (RawShaderMaterial, GLSL3, additive, gracefully optional) so haze fills the box and the solid carves shadow-shafts through it. The true swept projection is drawn as instanced shadow squares on the three walls (with per-plane colour pickers driving wall tint + shadow/prism colour), a per-axis fidelity readout, aspect-aware camera framing that never clips the box, axis-snap camera views, an optional underline that reconnects a word's strokes, and an optional translucent view of the three prisms pre-intersection. A second material mode — 'dichroic (directional)' — swaps the intersection solid for three directional prisms rendered opaque only when viewed along their own axis (view-dependent alpha shader) and casts each shadow from the full silhouette, so every plane reads exactly with no intersection loss (the 'opaque one way, clear the other' trick for the trip-let compatibility problem). Core occupancy/projection math is pure-logic node-tested in geb.selftest.mjs), and /kite (a Revolution-kite CFD workbench: a vortex-lattice aerodynamics solver — the classic potential-flow panel method for thin lifting surfaces — written in Rust and compiled to WebAssembly. The bowed quad-line sail is discretised into nspan×nchord panels, each carrying a horseshoe vortex; the dense influence system A·Γ=b is solved for the circulation, per-panel forces come from the near-field Kutta–Joukowski law, and tapping a cell CUTS it out of the lattice so the circulation redistributes over the survivors — total lift/pull drop and the centre of pressure shifts (asymmetric cuts make a side force). Sliders for wind speed, angle of attack, bow, and lattice resolution; live force-arrow field, load-coloured sail, wind-axis readout (line pull / lift / side / L·D⁻¹ / C_L). The Rust core (solver/kite-solver, zero-dep, cargo-tested against lifting-line theory) is wrapped by solver/kite-solver-wasm and built to solver/pkg/ by build-kite-solver.yml; an identical JS port in kite-vlm.js is the fallback so the page works with or without the wasm, cross-checked to 1e-6 in kite-vlm.selftest.mjs). And /dragon (a dragonfly aerial-combat sim: two dragonflies fly a real pursuit engagement over a Rust→wasm solver — constant-bearing/decreasing-range interception on visual bearing alone, the strategy an actual Anax uses, integrated in solver/dragon-solver (zero-dep, cargo-tested) and wrapped by solver/dragon-solver-wasm into solver/pkg/, with an identical JS port in dragon-sim.js as the always-available fallback, cross-checked in dragon-sim.selftest.mjs. Two dragonfly-eye POVs render the same instant — a conformal fisheye and a faceted compound eye — beside the third-person neon arena. /dragon also plays a TAG MATCH: two brains chase each other and the winner is whoever spends less time as IT, with a find-match roller, P1/P2/IT eye targets and a directional body so you can read who is hunting whom.) And /brut + /brut/plan (SEEDED PROCEDURAL BRUTALISM — two sites over one generator. brut/arch.js is a pure, DOM-free, three.js-free kernel: one seed → one building, in six typologies (béton-brut cathedral, civic hall, office block, housing slab, research block, car park). It is a pipeline of pure stages — massing schedule (inverted ziggurat / ziggurat / setback / stagger / slab over bar·L·T·cross·court plates, every plate re-cut at each level so wings stay DISJOINT and on the structural grid) → cores sized against the SMALLEST plate the building ever has (so a stair can never leave the plate on an upper floor) → floor plans (a corridor spine, cores and light wells subtracted, then a BSP that only ever cuts ALONG the corridor, so every room fronts the circulation; a separate longitudinal generator for the basilica — narthex, nave, aisles, a crossing at a seeded fraction, chancel, faceted apse, chapels between the buttresses) → a facade grammar (a repeating cell of 2–5 letters from a 13-module alphabet — pier, ribbon, brise-soleil, oriel, balcony, lancet, rose, louvre, shadow recess… — with mirror symmetry and rare per-bay punctuation, each letter carrying the DEPTH that makes a brutalist elevation read as relief) → parts(), an axis-aligned box list the 3D bench instances. /brut renders it in board-marked concrete (a per-seed canvas formwork texture: board joints, grain, tie holes, weathering) with sun control, an X-RAY mode that is literally the blueprint extruded, and a SECTION mode clipped on the drawing's own A–A line. /brut/plan is the drawing office: GA plans for every storey (north up, poché cores, column grid, room refs + areas), four correctly-handed elevations, section A–A, a schedule of accommodation, a title block, print CSS and an SVG export — all pure SVG strings from brut/blueprint.js, projected from the same objects, never traced off the render. Both pages share brut/ui.js, so one permalink codec drives both address bars and the cross-link carries the seed. Determinism is load-bearing: xmur3+mulberry32 with a SALTED sub-stream per draw (editing the rhythm must not move a wall), and node-tested in brut/arch.selftest.mjs — 41 checks incl. determinism, sub-stream independence, query round-trip, rooms inside/disjoint/reachable, cores continuous, parts in bounds, bay widths summing to the plate edge, every DRAWN bay being a BUILT bay, and the generator running with Math.random() disabled.) AND A STRUCTURAL SOLVE over the building the generator made (brut/struct.js): because the architecture is not a skin — there is a real column grid with tributary areas, slab thicknesses, core walls and a room schedule — the loads are read rather than assumed (the civic hall's library stacks really do put 7.2 kPa on its floors; the car park's decks really are light). The lateral system is a coupled flexural–shear cantilever (Heidebrecht & Stafford Smith), one Timoshenko element per storey, EI from the core boxes plus the SOLID PART OF THE ELEVATION working in its own plane as coupled piers (a brutalist facade is cast concrete, so glazing a bay really does soften the building, and a church with no core stands on its buttressed aisle walls), GA from Muto D-values plus web shear, cracked-section stiffness per ACI 318 §6.6.3.1, rotations statically condensed out (Guyan) to leave an n×n system with a diagonal mass matrix. Over that: a Jacobi eigensolve for periods, mode shapes and participation; ASCE 7-16 equivalent-lateral-force AND modal response spectrum with storey drift against §12.12; ASCE Ch. 26–27 wind with the flexible-building gust factor Gf fed by the n₁ the modal analysis just produced (the dynamics feed back into the static load); overturning FS, vortex lock-in, ISO 10137 occupant comfort; ACI 318 column axial and core-wall shear. Plus SEEDED time histories — Kanai–Tajimi ground motion and Davenport buffeting, both functions of the building seed, so 'this building in this earthquake' is a permalink — integrated by Newmark-β and animated in the bench, where the storeys visibly shear. brut/structdraw.js draws the engineer's set. Node-tested in brut/struct.selftest.mjs — 67 checks, the FE core against CLOSED FORM (cantilever PH³/3EI and 1.8751²√(EI/m′H⁴), shear beam PH/GA and (π/2)√(GA/m′H²), SDOF 2π√(m/k), Newmark step response peaking at exactly 2× static) and the code layer against ASCE's own printed table anchors. Pure static, CDN three.js importmap (no build), no D1/secrets beyond shared Cloudflare creds. The kite’s and dragon’s Rust→wasm solver/pkg/ is committed and rebuilt in CI.

## Deploy status

MANAGED — new surface via deploy-tjs.yml (Worker `tjs`). Self-contained static three.js workbench surface; stages tjs/ into dist at build time. Owning branch reassigned to claude/threejs-procgen-buildings-mprgs6 (procedural-brutalism take-over; adds /brut, a seeded architecture generator rendered as a 3D model, and /brut/plan, the same seed drawn as a blueprint set).

## Deploying

Pushes to `claude/threejs-procgen-buildings-mprgs6` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-tjs.yml`](../.github/workflows/deploy-tjs.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.


## /brut — the procedural-brutalism pair

Two sites, one seed. `/brut/` renders the model; `/brut/plan/` draws it. Neither
generates anything: both read `brut/arch.js`.

| File | Role |
|---|---|
| `brut/arch.js` | **the kernel** — pure, DOM-free, no three.js. `deriveParams` / `resolveParams` / `paramsToQuery` (the permalink codec), `generate()` (massing → cores → plans → facades), `parts()` (the box list the bench instances), `section()`, `schedule()`, `bounds()`. Runs in node and the browser. |
| `brut/struct.js` | **the engineer** — load takedown off the room schedule, the coupled flexural–shear cantilever + Guyan condensation + Jacobi eigensolve, ASCE 7-16 seismic and wind, ACI 318 member checks, seeded Kanai–Tajimi and Davenport records, Newmark-β. `verify(b, hazard)` returns every check with a margin and the governing one. |
| `brut/structdraw.js` | the engineer's SVG sheets: verification schedule, design spectrum, storey shear/drift, mode shapes, framing plan by utilisation. |
| `brut/blueprint.js` | **the drawing office** — pure SVG-string renderers: `planSVG`, `elevationSVG`, `sectionSVG`, `titleBlockSVG`, `scheduleSVG`, `sheetSVG`, `revision`. Takes a building, returns a string; no DOM, no measurement. |
| `brut/ui.js` | the control panel + URL sync **both** pages wear, so neither can invent its own idea of a seed. |
| `brut/index.html` | the 3D bench (three.js, instanced boxes, per-seed formwork texture, x-ray + section modes). |
| `brut/plan/index.html` | the blueprint set (print CSS, SVG export). |
| `brut/arch.selftest.mjs` | **run this before touching the kernel**: `node tjs/brut/arch.selftest.mjs` (47 checks, ~3 s). It is also a gate in `deploy-tjs.yml`. |
| `brut/struct.selftest.mjs` | **run this before touching the solve**: `node tjs/brut/struct.selftest.mjs` (67 checks, ~4 s). Also a deploy gate. |

**Invariants worth knowing before you edit:**

1. **Determinism is load-bearing.** No `Date.now()`, no bare `Math.random()` in
   the generator — `rollSeed()` is the one unseeded roll and it only chooses
   *which* deterministic building to open. The selftest asserts the whole
   pipeline runs with `Math.random` throwing.
2. **Salt every new draw.** `Rand(seed, 'your-stage')`. An unsalted draw
   correlates stages, so adding a facade feature would silently reshape the
   massing behind every existing permalink.
3. **Wings must stay disjoint.** The plan solver runs per wing; overlapping
   wings put two rooms in one square metre. Non-rectangular plates are cut as
   complements, and the schedule re-cuts the shape at each level rather than
   scaling the pieces.
4. **Cut plans along the corridor, never across it.** Cutting across stacks a
   second rank of rooms behind the first with no way in.
5. **Slabs are cast at each level's FLOOR, so a plate is only roofed by what
   stands on it.** Anything the level above does not build on — the top storey,
   and every terrace a setback or a ziggurat leaves behind — needs a deck of its
   own, which is what `rect.subtract` is for. The selftest samples every plate
   and fails on any square metre left open to the sky.
6. **The two sites may not diverge.** If you add a facade module, give it a
   `parts()` case *and* a `bayGlyph()` case — the selftest checks every drawn
   bay is a built bay. Same rule for volume: a room the plan draws (the
   cathedral's transept arms, its chapels) has to be a thing the model builds.
7. **The hazard is not part of the building.** The same concrete stands in Kent
   and in Kobe, so the earthquake, the site class, the wind speed and the
   exposure live in their own control strip and stay out of the seed's permalink.
8. **Check the solve against closed form, not against plausibility.** A wrong
   structural number looks exactly like a right one. Two real errors were caught
   this way: treating a window-pierced elevation as an unbroken plate (which gave
   a period SHORTER than ASCE's own deliberately-low Ta), and mixing lumped and
   consistent mass conventions in a test (worth 2–4% on ω₁).
9. `paramsToQuery` emits the seed plus only what differs from the seed's own
   reading, so an untouched seed's link is just `?s=<seed>`. Keep it that way:
   it is what makes the cross-link between the two sites short and stable.
