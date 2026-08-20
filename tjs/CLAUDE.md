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

tjs.mino.mobi — three.js workbenches. Landing at /, benches at /gantry (configurable HBot gantry test bench: seven-segment jerk-limited motion profiles, open-loop stepper torque-vs-pullout-envelope dynamic analysis, two Z lead-screw axes with gripper/pipettor tools), /orb (spherical-symmetry toy: a sphere sliced into n longitudinal lunes (axial Cn) or a polyhedral kaleidoscope — tetra/octa/icosa Schwarz-triangle fundamental domains), /infill (a 50mm sphere packed with 3D-printer infill — gyroid, Schwarz-P, diamond, Neovius, honeycomb, grid, triangular — raymarched with a scroll-driven peel plane that caps the cut cross-section; CPU Monte-Carlo density calibration; solid-shell toggle; and a coarse in-browser 3D FDTD acoustic panel — transmission loss of the orb vs free field, run in a module worker over a validated reference solver in infill/acoustics.js, WebGPU fine-grid port planned), and /swarm (a 3D swarm of bees: instanced bee micro-meshes with shader-flapped wings over a live agent sim in swarm3d.js — attractor orbit (radial pull + axis×radial swirl) + Reynolds boids over a 27-cell 3D spatial hash + divergence-free 3D curl-noise + a true stigmergy scent voxel grid bees deposit into / evaporate+diffuse / climb the gradient of; deterministic fixed-1/60s step, node-tested in swarm3d.selftest.mjs; lead-the-swarm pointer steering + scent-field visualisation), and /beelix (a descending helix of bees emerging from BOIDS, not authored geometry: a hive particle-emitter up top, a death plane below that recycles bees into the pool, and a central light pipe. Bees run real Reynolds boids (separation/alignment/cohesion) as self-propelled constant-cruise active-matter particles; the ONLY authored forces are the light pipe's — phototaxis (inward confinement, sets no radius), downward flow, and a faint Light-swirl (pipeSpin) which is the sole rotational input. Pure boids in a flow-through column lock a handedness only ~half the time (raw emergence is unreliable); the faint light swirl breaks the tie and boids alignment AMPLIFIES it into a coherent mill that the descent shears into a helix — radius/pitch/thickness stay emergent, swirl sign sets handedness. HUD reads the swarm angular momentum L so you can watch it lock. Travelling light pulses kick+glow bees they pass. Instanced bees via shared beelix/beemesh.js; reuses swarm3d's curl-noise; node-tested in beelix.selftest.mjs (18 checks incl. sign(L)=sign(swirl) on every seed), and /cube (smart cellular bricks — browser port of rmorenoga/cube3D: a 3D neural cellular automaton where every living voxel runs the EXACT trained ~26k-param network lifted from the physical ESP32 cube firmware's neural_network.h (7-point-stencil perceive 28→84 + dense 84→84→27, tanh residual, stochastic fire), gossiping class beliefs with 6 face-neighbours until the assembled shape classifies ITSELF among 7 ShapeNet classes; ships the repo's real 487-shape 15³ voxel dataset; smash-mode raycast damage with ballistic debris + slab-chop — survivors re-classify (paper's damage recovery); instanced-mesh render, per-cube vote colour × softmax confidence; engine nca.js is pure/DOM-free, node-tested in nca.selftest.mjs against numpy goldens (<5e-6 logit parity, 99.4% cell accuracy over the full dataset)), and /geb (a Gödel-Escher-Bach trip-let generator: type three strings and the solid is carved as the intersection of three text-extrusion prisms — a voxel is kept only where all three silhouettes agree — so its orthogonal shadow down each axis spells that axis's line, exactly as the two wooden trip-lets on the GEB cover throw G/E/B. Each string is rasterised to an N×N silhouette (fit-to-box, per-axis in-plane rotation so letters can be turned relative to each other as the real trip-lets need), intersected on an N³ grid (N 48–120), surface-meshed (only solid↔empty faces). The object sits smaller inside a larger shadowbox (object-size slider) whose walls are lit from inside by three axis lights plus a froxel volumetric — the occupancy grid uploaded as a Data3DTexture and raymarched (RawShaderMaterial, GLSL3, additive, gracefully optional) so haze fills the box and the solid carves shadow-shafts through it. The true swept projection is drawn as instanced shadow squares on the three walls (with per-plane colour pickers driving wall tint + shadow/prism colour), a per-axis fidelity readout, aspect-aware camera framing that never clips the box, axis-snap camera views, an optional underline that reconnects a word's strokes, and an optional translucent view of the three prisms pre-intersection. A second material mode — 'dichroic (directional)' — swaps the intersection solid for three directional prisms rendered opaque only when viewed along their own axis (view-dependent alpha shader) and casts each shadow from the full silhouette, so every plane reads exactly with no intersection loss (the 'opaque one way, clear the other' trick for the trip-let compatibility problem). Core occupancy/projection math is pure-logic node-tested in geb.selftest.mjs), and /kite (a Revolution-kite CFD workbench: a vortex-lattice aerodynamics solver — the classic potential-flow panel method for thin lifting surfaces — written in Rust and compiled to WebAssembly. The bowed quad-line sail is discretised into nspan×nchord panels, each carrying a horseshoe vortex; the dense influence system A·Γ=b is solved for the circulation, per-panel forces come from the near-field Kutta–Joukowski law, and tapping a cell CUTS it out of the lattice so the circulation redistributes over the survivors — total lift/pull drop and the centre of pressure shifts (asymmetric cuts make a side force). Sliders for wind speed, angle of attack, bow, and lattice resolution; live force-arrow field, load-coloured sail, wind-axis readout (line pull / lift / side / L·D⁻¹ / C_L). The Rust core (solver/kite-solver, zero-dep, cargo-tested against lifting-line theory) is wrapped by solver/kite-solver-wasm and built to solver/pkg/ by build-kite-solver.yml; an identical JS port in kite-vlm.js is the fallback so the page works with or without the wasm, cross-checked to 1e-6 in kite-vlm.selftest.mjs). And /dragon (a dragonfly aerial-combat sim: two dragonflies fly a real pursuit engagement over a Rust→wasm solver — constant-bearing/decreasing-range interception on visual bearing alone, the strategy an actual Anax uses, integrated in solver/dragon-solver (zero-dep, cargo-tested) and wrapped by solver/dragon-solver-wasm into solver/pkg/, with an identical JS port in dragon-sim.js as the always-available fallback, cross-checked in dragon-sim.selftest.mjs. Two dragonfly-eye POVs render the same instant — a conformal fisheye and a faceted compound eye — beside the third-person neon arena. /dragon also plays a TAG MATCH: two brains chase each other and the winner is whoever spends less time as IT, with a find-match roller, P1/P2/IT eye targets and a directional body so you can read who is hunting whom.) And /brut + /brut/plan (SEEDED PROCEDURAL BRUTALISM — two sites over one generator. brut/arch.js is a pure, DOM-free, three.js-free kernel: one seed → one building, in six typologies (béton-brut cathedral, civic hall, office block, housing slab, research block, car park). It is a pipeline of pure stages — massing schedule (inverted ziggurat / ziggurat / setback / stagger / slab over bar·L·T·cross·court plates, every plate re-cut at each level so wings stay DISJOINT and on the structural grid) → cores sized against the SMALLEST plate the building ever has (so a stair can never leave the plate on an upper floor) → floor plans (a corridor spine, cores and light wells subtracted, then a BSP that only ever cuts ALONG the corridor, so every room fronts the circulation; a separate longitudinal generator for the basilica — narthex, nave, aisles, a crossing at a seeded fraction, chancel, faceted apse, chapels between the buttresses) → a facade grammar (a repeating cell of 2–5 letters from a 13-module alphabet — pier, ribbon, brise-soleil, oriel, balcony, lancet, rose, louvre, shadow recess… — with mirror symmetry and rare per-bay punctuation, each letter carrying the DEPTH that makes a brutalist elevation read as relief) → parts(), an axis-aligned box list the 3D bench instances. /brut renders it in board-marked concrete (a per-seed canvas formwork texture: board joints, grain, tie holes, weathering) with sun control, an X-RAY mode that is literally the blueprint extruded, and a SECTION mode clipped on the drawing's own A–A line. /brut/plan is the drawing office: GA plans for every storey (north up, poché cores, column grid, room refs + areas), four correctly-handed elevations, section A–A, a schedule of accommodation, a title block, print CSS and an SVG export — all pure SVG strings from brut/blueprint.js, projected from the same objects, never traced off the render. Both pages share brut/ui.js, so one permalink codec drives both address bars and the cross-link carries the seed. Determinism is load-bearing: xmur3+mulberry32 with a SALTED sub-stream per draw (editing the rhythm must not move a wall), and node-tested in brut/arch.selftest.mjs — 627 checks incl. determinism, sub-stream independence, query round-trip, rooms inside/disjoint/reachable, cores continuous, parts in bounds, bay widths summing to the plate edge, every DRAWN bay being a BUILT bay, and the generator running with Math.random() disabled.) AND EVERY BUILDING TAKES A POSITION (brut/parti.js): a generator with a stage per element makes a building whose parts have never met — each stage individually defensible and none of them about anything — so a PARTI runs FIRST, before the massing, and emits not geometry but commitments. Eight memes: PIANO NOBILE (the important floor is not the ground one; the ground is a plinth you pass through and the storey above is taller, holds the hall, and is arrived at ceremonially), PENTHOUSE (a top storey that is a different building — taller, fewer and larger rooms, a terrace, and a private helix out of the floor below that nobody else uses), GREAT HALL (double height, so it takes the floor above with it, and the stair in it is wide enough to be furniture), ATRIUM (one void cut through the plan with a gallery round it on every floor, and the stair that climbs it lands on the terrace at the top), UNDERCROFT (the ground given back: pilotis, no plan at all at grade, so the one stair that has to land becomes the object in the void), CLOISTER (the plan wraps a court and the circulation runs round it — quiet, no ceremony, because the void is doing the stair's work), SKIP-STOP (the Unité's move: a rue intérieure every third floor and maisonettes reaching up and down from it, so two thirds of the building has no corridor at all and every home owns a stair) and PROMENADE ARCHITECTURALE (a ramp the whole way, expressed outside, the route as the architecture). One or two per building, and only pairs that do not contradict — incompatibility is listed rather than inferred, because the interesting pairs (an atrium under a penthouse, an undercroft under a piano nobile) are the ones an inference would throw away. Everything downstream then READS it: storey heights multiply, the hall is claimed out of the same bands the plan solver will cut (so it fronts the spine and so does the plan either side of it), the atrium is solved once against the INTERSECTION of the plates it passes through (an atrium that moves is not an atrium), a penthouse floor gets fewer and bigger rooms, an undercroft's ground floor is not planned at all, a skip-stop level has no corridor and its rooms name the deck they are entered from, and the ceremonial stair is drawn from a set the meme names rather than from whatever fits a leftover shaft. The parti is in the panel, in the title block, and in every level's name — 'Level 3 (rue intérieure)' is the reason the two floors above it have no corridor. AND A STRUCTURAL SOLVE over the building the generator made (brut/struct.js): because the architecture is not a skin — there is a real column grid with tributary areas, slab thicknesses, core walls and a room schedule — the loads are read rather than assumed (the civic hall's library stacks really do put 7.2 kPa on its floors; the car park's decks really are light). The lateral system is a coupled flexural–shear cantilever (Heidebrecht & Stafford Smith), one Timoshenko element per storey, EI from the core boxes plus the SOLID PART OF THE ELEVATION working in its own plane as coupled piers (a brutalist facade is cast concrete, so glazing a bay really does soften the building, and a church with no core stands on its buttressed aisle walls), GA from Muto D-values plus web shear, cracked-section stiffness per ACI 318 §6.6.3.1, rotations statically condensed out (Guyan) to leave an n×n system with a diagonal mass matrix. Over that: a Jacobi eigensolve for periods, mode shapes and participation; ASCE 7-16 equivalent-lateral-force AND modal response spectrum with storey drift against §12.12; ASCE Ch. 26–27 wind with the flexible-building gust factor Gf fed by the n₁ the modal analysis just produced (the dynamics feed back into the static load); overturning FS, vortex lock-in, ISO 10137 occupant comfort; ACI 318 column axial and core-wall shear. Plus SEEDED time histories — Kanai–Tajimi ground motion and Davenport buffeting, both functions of the building seed, so 'this building in this earthquake' is a permalink — integrated by Newmark-β and animated in the bench, where the storeys visibly shear. brut/structdraw.js draws the engineer's set. Node-tested in brut/struct.selftest.mjs — 67 checks, the FE core against CLOSED FORM (cantilever PH³/3EI and 1.8751²√(EI/m′H⁴), shear beam PH/GA and (π/2)√(GA/m′H²), SDOF 2π√(m/k), Newmark step response peaking at exactly 2× static) and the code layer against ASCE's own printed table anchors. THE FLOOR, THE FRAME AND THE GROUND ARE ALL CHOSEN THINGS: a FLOOR SYSTEM (flat slab, post-tensioned plate, one-way slab on beams, ribbed/waffle, precast hollow-core, double-tee, composite metal deck) with a real depth-from-span, self-weight and economical span — it sets most of the seismic mass, and the storey height FOLLOWS it rather than the other way round; a LATERAL SYSTEM (moment frame, core+frame, outriggers as a rotational spring at the outrigger level, framed tube, diagrid on Moon/Connor/Fernandez rigidities) plus an optional tuned mass damper, each drawn as visible members AND modelled as a real term in the FE; and a FOUNDATION chosen by the ground rather than by the designer — soil from the site class, then pads → raft → piles, with bearing pressure under the overturning eccentricity, middle-third uplift, sliding friction and elastic settlement, settlement being part of the ladder rather than an afterthought. AND THE STAIRS ARE REAL (brut/stair.js): a stair is SOLVED, not drawn — every riser in a flight exactly equal (so the count is an integer and the rise is H/n, unrounded), the going from BLONDEL'S RULE 2R+G = 630 mm (the length of a human pace, published 1675), and the pitch from atan(R/G). TWENTY types across the three ways of spending the horizontal length a stair has to find: RUN (straight, cantilevered, crossed flights, amphitheatre seating, a CORDONATA — Michelangelo's stepped ramp at the Campidoglio, ridden as much as walked, so the rise drops to a hoof's clearance and 2R+G lands near 1050 rather than 630 — and an ALTERNATING TREAD ladder whose half-width paddles stagger left and right so each foot gets twice the going the plan shows, which is what buys sixty degrees legally), FOLD (dog-leg, open well, quarter turn, a WINDER whose kite treads replace the landing so the stair keeps climbing round the corner, three-flight, a SCISSOR — two interlocking stairs in one shaft, offset half a storey, giving two protected escape routes for one core — the IMPERIAL, and its mirror the BIFURCATED: an imperial takes you up together and DISPERSES you left and right, a bifurcated stair GATHERS two flights onto one landing and carries everybody on as one, which is the same treads and the opposite social fact) and TURN (spiral, helical, double-helix — Chambord's two people who never meet — a TRIPLE helix, and a FLYING stair with no newel and no inner string, each stone tread bedded into the wall and resting a corner on the one below). A helix does not climb a storey in exactly one turn: fix the going on the walking line and let the rotation be whatever that implies, and the narrow-end rule then SETS the newel radius (a 1.2 m wide public spiral needs one about 0.54 m, which is why wide spirals have fat newels and escape spirals are narrow). The CORE IS SIZED BY THE STAIR — placeCores asks the footprint how big a shaft it needs, over the ENVELOPE of every storey height, because the footprint is not monotone in storey height (34 risers split into three flights, 27 into two, so the shorter storey needs the longer shaft). Every core is a hollow shaft of walls rather than a solid block, the stairs run inside them, external stair towers are placed against the plate the building ALWAYS has so they stay attached all the way up, and a cathedral's campanile is climbed by a turret helix from grade to the bells. The plan draws them by the real convention — nosings, a break line at the cut, an UP arrow from the bottom riser, and nothing above the cut — and a STAIRS view in the bench ghosts the building so you can read the fold, the well and the turn from outside. Both sites carry a MOBILE BOTTOM SHEET (peek / open / full, tabbed, draggable) into which the floating panels are RE-PARENTED rather than duplicated. AND /manifold (A CONCRETE COBORDISM — the anti-brutalist companion to /brut. Topologically the family is a genus-0 surface taking n boundary circles to m: n legs on the ground, a collector ring, m mouths in the air, so the three-legged hyperboloid with a ring about its middle is just the n=3, m=1 member of it. Every piece is a HYPERBOLOID OF ONE SHEET, which is doubly ruled — a curved surface made entirely of straight lines — so the thing reads as a Gaudí curve while every rib in it is dead straight, which is how Shukhov built his towers in 1896. The lattice is not fitted to the surface: node (k,p) sits at r = a/cos(πp/N), z = c·tan(πp/N), θ = (2k+p)π/N, which is exactly where the two rulings cross, so every crossing is a shared joint, every face is a triangle and every triangle edge is a real member. Surface treatments — bare Shukhov lattice, trencadís, a board-marked sprayed shell, ribbed, perforated, glass — change the weight, the light AND the section, because a rib cast integral with the shell is a T-beam and the flange is most of the stiffness. manifold/struct.js carries TWO structural models on purpose: the PINNED one asks whether it would stand as a bolted kit of parts, and for a doubly-ruled lattice the answer is usually no — the straightness that makes it buildable gives it a zero-energy Kagome floppy mode, so it stands only because its joints are cast monolithic; the real verdict comes from a SPACE FRAME (6 DOF/node, reverse Cuthill–McKee ordering, profile LDLᵀ whose pivot signs are the mechanism census by Sylvester's law of inertia), giving ASCE 7-16 load cases, the linear BUCKLING LOAD FACTOR λ_cr from K + λKg, member checks, foot uplift, and FUNICULARITY — the fraction of ribs in compression under gravity alone, the Gaudí question, with the shortfall quoted in tonnes of reinforcement. AND IT IS INHABITED: the p-levels ARE the storeys, which costs no extra topology because the levels are already rings of real joints — c is chosen so consecutive levels sit a storey apart. Their spacing widens away from the waist (c·Δtan), so a leg comes out with a double-height ground, apartments through the pinch and a lofty crown, and floor area per storey π(a²(1+(z/c)²) − r_core²) has a MINIMUM at the waist: the hourglass is the building type, not a stylistic choice. Each leg carries a central core (lift, stair, and the leg's spine) with T-beam spokes out to the ruling, each floor is an annulus whose core-to-facade depth decides whether anyone can live in it, and every level projects a balcony and balustrade PAST the shell so the storeys are countable from outside. The collector ring — the only place every leg touches — carries a public deck: a street in the air. schedule() reads the accommodation off the geometry: gross and net area per level, use (commons / dwelling / service / terrace), homes, population, plot ratio and homes per hectare. The solve runs in a module worker; the bench animates the fold and the buckling mode and colours the ribs by force. Node-tested in manifold/shell.selftest.mjs — 83 checks against CLOSED FORM (cantilever PL³/3EI, torsion TL/GJ, Euler for fixed-free and fixed-pinned ends, global equilibrium ΣR = Σ applied to 1e-14) plus the ruled-surface identity, the triangulation, determinism and the permalink codec.) Pure static, CDN three.js importmap (no build), no D1/secrets beyond shared Cloudflare creds. The kite’s and dragon’s Rust→wasm solver/pkg/ is committed and rebuilt in CI.

## Deploy status

MANAGED — new surface via deploy-tjs.yml (Worker `tjs`). Self-contained static three.js workbench surface; stages tjs/ into dist at build time. Owning branch reassigned to claude/threejs-procgen-buildings-mprgs6 (procedural-brutalism take-over; adds /brut, a seeded architecture generator rendered as a 3D model, and /brut/plan, the same seed drawn as a blueprint set).

## Deploying

Pushes to `claude/threejs-procgen-buildings-mprgs6` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-tjs.yml`](../.github/workflows/deploy-tjs.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.


## /manifold — the concrete cobordism

One site over two kernels, same discipline as `/brut`: the geometry is pure and
the solve is checked against closed form.

| File | Role |
|---|---|
| `manifold/shell.js` | **the geometry AND the accommodation** — `deriveParams` / `resolveParams` / `paramsToQuery` (the permalink codec), `generate()` (legs → ring → mouths → floors → cores), `schedule()` (the floor-by-floor schedule, homes, density), `memberParts()`, `surfaceGeometry()`, `profile()`. Pure, DOM-free, no three.js. |
| `manifold/struct.js` | **the solve** — RCM ordering, profile LDLᵀ, a pinned truss model AND a space frame, ASCE 7-16 wind and snow, the linear buckling eigenvalue, funicularity and the reinforcement bill. |
| `manifold/solve.worker.js` | the solve, off the main thread. Requests carry a monotonic id; stale replies are dropped. |
| `manifold/index.html` | the bench. |
| `manifold/shell.selftest.mjs` | **run this before touching either kernel**: `node tjs/manifold/shell.selftest.mjs` (175 checks, ~25 s). It is also a gate in `deploy-tjs.yml`. |

**Invariants worth knowing before you edit:**

1. **The lattice is not fitted to the surface — it IS the surface.** Node (k, p)
   sits at `r = a/cos(πp/N)`, `z = c·tan(πp/N)`, `θ = (2k+p)π/N`, which is
   exactly where the two rulings of the hyperboloid cross. That is why every
   generator is dead straight and every face is a triangle bounded by three real
   members. Do not "adjust" a node position: move the parameters instead, or the
   ruling stops being a ruling and the whole claim collapses.
2. **A pin-jointed model of this is WRONG, not conservative.** Because each
   ruling passes straight through every node, the two collinear bars there
   resist nothing normal to the surface, and the hoops resist an alternating
   pattern only at second order — a Kagome floppy mode. Every seed comes back a
   mechanism. Real ones are riveted or cast monolithic, so the verdict comes
   from the SPACE FRAME. The pinned census is kept and reported because the
   difference between the two is the interesting part, not because it decides
   anything.
3. **The collector ring must have width as well as depth.** A hoop is a
   mechanism; so is a two-hoop ring truss, because every bar at a node still
   lies in the tangent–vertical plane and nothing resists radial motion. It is a
   triangular-section ring truss for that reason, and the first solve found the
   fold when it was not.
4. **A tie is three NON-COPLANAR bars**, admitted by Gram–Schmidt rather than
   picked by a neighbour rule. Three bars in one plane leave a joint free normal
   to it, and a lone mouth springing off the ring plane lands exactly on ring
   nodes, so the degenerate cases are real.
5. **Ribs are sized from the bay they span**, and are T-beams wherever the shell
   is cast integral with them (`composite` in `SURFACES`). The flange sits a
   whole rib-radius off the neutral axis, so it is most of the stiffness — not a
   refinement. Glass is not a flange.
6. **There is a NODE BUDGET.** Every node is six DOF and the factorisation is
   O(n·b²), so `deriveParams` shrinks the ruling until the model fits. Raise it
   and a basilica takes ten seconds.
7. **Check the solve against closed form.** Cantilever `PL³/3EI`, torsion
   `TL/GJ`, the buckling eigenvalue against Euler for two end conditions, and
   global equilibrium `ΣR = Σ applied` to 1e-14. That last one caught a reaction
   summed from axial force alone on a frame, where the shears carried up to 10%.
8. **The hazard is not part of the building.** Wind, exposure and snow live in
   their own control strip and stay out of the seed's permalink — same rule as
   `/brut`.
9. **Do not round A and I.** They span orders of magnitude; `r4` on a small deck
   chord's `πr⁴/4` rounds it to exactly zero, which makes `Pcr` zero and the
   utilisation NaN.
10. **THE p-LEVELS ARE THE STOREYS.** This is what makes the family habitable
   rather than sculptural, and it costs no topology at all: the levels are where
   the two rulings cross, so each is already a ring of real joints, and `c` is
   chosen (`storeyFlare`) so consecutive levels sit a storey apart. Do not add
   floors at arbitrary heights — you would have to split every generator and
   re-triangulate the shell, and the drawn/modelled invariant would go with it.
11. **Storey heights are NOT uniform, and that is the type.** Spacing is
   `c·Δtan`, which widens away from the waist, so the ratio of tallest to
   shortest is about 1.7 — a double-height ground, apartments through the pinch,
   a lofty crown. `pMaxFor` is capped at 0.25·N to hold that ratio; raise it and
   the ends become unusable voids.
12. **Size the plate, not the composition.** `plate` in `PROGRAMMES` is the waist
   radius in METRES, because what decides whether anyone can live in a leg is the
   core-to-facade depth. A leg reads as a tower rather than a drum only when the
   waist is under about 0.4·N metres — `pMax ≈ 0.25N` caps the storeys at `0.5N`
   and the flare at 1.41× the waist, so that ratio is arithmetic, not taste.
13. **A floor is a plate, not a wheel of rods.** Spokes carry `Iy` ≠ `Iz`: weak
   out of plane, very stiff in it, because in-plane slab stiffness is the
   diaphragm action that ties the facade together. And they are T-beams with the
   slab as flange — the solve rejected a 220 mm plate spanning 10 m by asking
   for 15% reinforcement over a 176 mm lever, which was correct of it.
14. **The floor edge must express on the facade.** An opaque shell hides
   everything inside it, so each level projects a balcony lip and a balustrade
   past the surface. That band is what makes the storeys countable from outside,
   and countable storeys are the whole difference between a building and a wire
   model.


## /brut — the procedural-brutalism pair

Two sites, one seed. `/brut/` renders the model; `/brut/plan/` draws it. Neither
generates anything: both read `brut/arch.js`.

| File | Role |
|---|---|
| `brut/arch.js` | **the kernel** — pure, DOM-free, no three.js. `deriveParams` / `resolveParams` / `paramsToQuery` (the permalink codec), `generate()` (massing → cores → plans → facades), `parts()` (the box list the bench instances), `section()`, `schedule()`, `bounds()`. Runs in node and the browser. |
| `brut/parti.js` | **the parti** — pure, and it runs FIRST, before the massing. Eight memes (piano nobile, penthouse, great hall, atrium, undercroft, cloister, skip-stop, promenade architecturale), each declaring what it demands of the section (`height`), of the plan (`hall`, `voids`, `rooms`, `openGround`, `every`) and of the ceremony (`feature` — where the stair is, how wide, and which types it is allowed to be). `deriveParti` picks one or two that do not contradict; `heightAt` / `voidsAt` / `hallAt` / `roomScaleAt` / `terraceAt` / `openGround` / `corridorEvery` / `features` are what the rest of the kernel asks it. |
| `brut/stair.js` | **the stair** — pure solver and typology. `solveFlight` (equal risers, Blondel, pitch), `stairFootprint` (how big a shaft it needs — takes a LIST of storey heights and returns the envelope), `layout` (flights, landings, every tread), `stairParts`, `stairPlan` (the plan symbol), `check`, `chooseStair`. **Twenty types** across three ways of spending the horizontal length: RUN (straight, cantilevered, crossed, amphitheatre, cordonata, alternating-tread), FOLD (dog-leg, open well, quarter turn, winder, three-flight, scissor, imperial, bifurcated, ramp) and TURN (spiral, helical, double helix, triple helix, flying). Four of them do not obey Blondel and say so: a ramp has no risers, seating steps are furniture, a cordonata is ridden, and an alternating tread gives each foot twice the going the plan shows. |
| `brut/lift.js` | **the lifts** — pure traffic analysis. `probableStops` / `highestReversal` (the two expected-value formulas the whole discipline rests on), `flightTime` (the seven-segment jerk-limited profile), `roundTrip` (CIBSE Guide D's RTT), `service` (interval and handling capacity), `sizeGroup` (the ladder: fewest cars, then smallest car, then zones), `populationFromArea` / `populationFromSchedule`, `check`, `liftsFor`. |
| `brut/plant.js` | **the botany** — Phase 1 of [`ECOBRUTALISM.md`](brut/ECOBRUTALISM.md). `grow()` (space colonization over an ENVELOPE the architecture supplies), `pipeRadius` (Shinozaki's pipe model, which is simultaneously the shape rule and the structural rule), `dbhFor`/`heightFor`/`crownFor`/`dryMass` (allometry, Chave 2014 for the biomass because the mass IS the load), `dragOn` (Vogel reconfiguration), `SOIL`/`soilFor`/`soilLoad` (the substrate ladder, which runs DOWNWARD from what the slab takes), `plantParts`, `plantPlan`, `check`. |
| `brut/struct.js` | **the engineer** — load takedown off the room schedule, the coupled flexural–shear cantilever + Guyan condensation + Jacobi eigensolve, ASCE 7-16 seismic and wind, ACI 318 member checks, seeded Kanai–Tajimi and Davenport records, Newmark-β. `verify(b, hazard)` returns every check with a margin and the governing one. |
| `brut/structdraw.js` | the engineer's SVG sheets: verification schedule, design spectrum, storey shear/drift, mode shapes, framing plan by utilisation. |
| `brut/blueprint.js` | **the drawing office** — pure SVG-string renderers: `planSVG`, `elevationSVG`, `sectionSVG`, `titleBlockSVG`, `scheduleSVG`, `sheetSVG`, `revision`. Takes a building, returns a string; no DOM, no measurement. |
| `brut/ui.js` | the control panel, URL sync and the **mobile bottom sheet** both pages wear, so neither can invent its own idea of a seed. `mountSheet` MOVES the existing panels into the sheet below the breakpoint — duplicating them is how a control ends up disagreeing with itself. |
| `brut/index.html` | the 3D bench (three.js, instanced boxes, per-seed formwork texture, x-ray + section modes). |
| `brut/plan/index.html` | the blueprint set (print CSS, SVG export). |
| `brut/arch.selftest.mjs` | **run this before touching the kernel**: `node tjs/brut/arch.selftest.mjs` (759 checks, ~25 s). It is also a gate in `deploy-tjs.yml`. |
| `brut/struct.selftest.mjs` | **run this before touching the solve**: `node tjs/brut/struct.selftest.mjs` (105 checks, ~6 s). Also a deploy gate. |
| `brut/plant.selftest.mjs` | **run this before touching the botany**: `node tjs/brut/plant.selftest.mjs` (251 checks, ~3 s). Also a deploy gate. Checks the relations rather than the shape — the pipe model at every fork in every tree, the allometry round-tripped, Chave against a hand-computed case, and the drag against its rigid limit. |
| `brut/lift.selftest.mjs` | **run this before touching the traffic kernel**: `node tjs/brut/lift.selftest.mjs` (82 checks, <1 s). Also a deploy gate. Almost every check is against closed form or against an identity, because the failure mode of a probability calculation is a plausible number for the wrong reason. |

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
9. **A system is only real if it is drawn AND modelled.** A floor system that
   changes the weight has to change the slab you can see; a lateral system that
   changes the stiffness has to put members in the model. The selftests check
   both directions, and it was a test of exactly this that caught `frame` and
   `core + frame` returning identical periods, because the cores were acting as
   shear walls whatever the system said.
10. **Do not calibrate against ASCE's Ta on a squat building.** Ta = Ct·H^x is
   fitted to normally-proportioned buildings and is deliberately low. A 79 m
   wide, 37 m tall concrete box really does come out at a quarter of it, and
   chasing that ratio down was a wasted afternoon. The honest diagnostic is a
   SLENDERNESS SWEEP — hold the plan, add storeys, and check T₁/Ta rises through
   the measured band and that α = H√(GA/EI) rises with it. That is what the
   selftest does.
11. `paramsToQuery` emits the seed plus only what differs from the seed's own
   reading, so an untouched seed's link is just `?s=<seed>`. Keep it that way:
   it is what makes the cross-link between the two sites short and stable.
12. **A STAIR IS SOLVED, NOT DRAWN.** Every riser in a flight is exactly equal,
   so the riser count is an integer and the rise is `H / n` — and `rise` and
   `going` are therefore NOT rounded. Rounding the rise to a millimetre puts a
   2 cm error at the top of a tall flight; rounding is for the label and the
   label does it. Blondel's `2R + G ≈ 630` then gives the going, and the pitch
   follows.
13. **The core is sized BY the stair.** `placeCores` asks `stairFootprint` how
   big a shaft the chosen type needs and sizes the core from that. Candidates
   that do not fit the plate the building always has are discarded before the
   choice, so the type is always one that actually works there.
14. **The footprint is NOT monotone in storey height** — size a core on the
   ENVELOPE over every storey the building has, never on the tallest. The flight
   cap is a step function: 34 risers split into three flights of twelve, 27 into
   two of fourteen, so a 4.5 m storey needs a LONGER shaft than a 5.6 m one.
15. **A type that cannot express the flight count it needs is rejected**, not
   truncated. A quarter turn is two flights by definition; when the risers need
   three, the layout used to drop the third and the stair arrived two metres
   below its floor.
16. **One tread convention: `w` across the stair, `d` along travel, `ry` turns
   it into world.** Swapping `w`/`d` *and* setting `ry` applies the rotation
   twice and lays every tread along the flight instead of across it — a stair of
   planks. It passes a containment test, which is how it survived one.
17. **The parti runs first, and everything downstream reads it.** A generator
   with a stage per element makes a building whose parts have never met — the
   massing draws from one sub-stream, the plan from another, the stair from a
   third, each individually defensible and none of them about anything.
   `parti.js` emits the commitments (which storey is the important one, where
   the room that is not a room goes, which stair is the event) and `massing`,
   `placeHalls`, `planCellular` and `featureStairs` are consequences of it
   rather than independent draws. Two memes at most, and only pairs that do not
   contradict — `CONFLICTS` lists incompatibility rather than inferring it,
   because the interesting pairs (an atrium under a penthouse, an undercroft
   under a piano nobile) are the ones an inference would have thrown away.

18. **A hall is claimed the way a ROOM is claimed, out of the same bands the
   plan solver will cut** — full depth from the spine to the outside face, and
   only its length along the corridor negotiable. Centring a rect in the
   leftover ground instead put a great hall a metre and a half off the only
   corridor on the floor, with a strip of dead plan between them. `spineFor`
   exists so the hall and the plan cannot disagree about where the corridor is.

19. **An atrium that moves is not an atrium.** It is solved ONCE against the
   INTERSECTION of the plates it passes through — the same discipline that
   sizes a core against the smallest plate. Re-deriving it per level looks right
   until the massing steps, and then the section shows a stack of unrelated
   holes.

20. **A skip-stop level has no corridor, and that is a section, not a bug.**
   The rooms on it carry `viaLevel`, naming the deck they are entered from, and
   the selftest requires that deck to exist, to have a corridor, and to have a
   room of the same dwelling under them fronting it. That is a stronger test
   than "every room fronts a corridor", not an exemption from it.

21. **Viability over a stack of storey heights is AND-ed, not inherited.** A
   winder expresses a 3.4 m floor happily and cannot express the 5.7 m piano
   nobile above it; `stairFootprint` over a LIST used to copy the first
   height's verdict, which sized a core for a stair that then failed its own
   check three levels up.

22. **A LIFT IS A QUEUEING PROBLEM, not a geometry one.** Nothing about it is
   decided by drawing one: how many there are and how big they are fall out of
   the round-trip time, and that is a function of population, floors served and
   car size. The two thresholds are DIFFERENT RULES with different reasons and
   conflating them is the classic error — ACCESS bites at ONE storey above the
   entrance (a storey nobody in a wheelchair can reach is a storey they are
   excluded from), TRAFFIC bites at four. `probableStops` and
   `highestReversal` are EXPECTED VALUES, not worst cases; sizing on the worst
   case doubles the shafts and the building pays for them on every floor for
   sixty years.

23. **The population is who is THERE, not who has a desk.** A plate designed at
   one person per ten square metres never holds that many at nine in the
   morning — holidays, meetings elsewhere, illness — so the traffic population
   is about four fifths of the design population. Using the desk count put two
   extra shafts through every floor of a 14-storey office.

24. **The lifts are sized BEFORE the core they go in**, off an area take,
   because that is the order the constraint actually runs — and then VERIFIED
   after the plan exists, off the room schedule. The two counts are meant to
   disagree; the gap is what the verification is for. The verification may not
   resize anything: a check that moves the thing it is checking is not a check.

25. **When the plate will not hold the group, the shafts are CAPPED and the
   shortfall is a number.** A core hanging off the edge of its own floorplate
   is nonsense, not a finding; `built` is what the building has, `carsTotal`
   is what it needs, and the difference is a failing check. This is a real
   constraint on deep plans: past a certain population the core eats the
   building it serves.

26. **Do not round what a decision is made on.** `service()` returns the
   interval and the capacity unrounded, for the same reason a riser is
   unrounded — two identities hold exactly (twice the cars is half the wait and
   twice the capacity), and rounding to a reported precision turns a ladder
   choosing between close candidates into one choosing between rounding errors.

27. **A shaft is drawn at every level it PASSES, not only where it opens.** A
   shaft that stops being built where its doors stop is a shaft with nothing
   holding it up, and on a zoned building that is most of its height. The
   express run and the skip-stop are the same idea in one pair of lists:
   `passes` and `opens`.

28. **The lift core is also the shear core.** More storeys is more lifts is a
   bigger core is a stiffer building, so the structural slenderness sweep can
   no longer assume monotonicity — it measures the core and requires any
   reversal to be explained by a step in it. That is a stronger claim than the
   one it replaced.

29. **A PLANT IS A LOAD.** The whole course is in
   [`brut/ECOBRUTALISM.md`](brut/ECOBRUTALISM.md); the one number behind it is
   that a metre of saturated substrate is **16 kPa** against an office floor's
   2.4 — so planting is the load case that SIZES a slab, not a finish applied
   to one. `brut/plant.js` is Phase 1 and is deliberately built so the growth
   rule and the structural rule are the same rule: the pipe model
   `d_parent^n = Σ d_child^n` is both the botanical plumbing and the cantilever
   sizing, which is the only reason a generated tree can go into a structural
   model without lying. Three consequences worth knowing:

   - **The envelope is the coupling.** `grow()` takes the crown envelope as an
     argument, so a tree under a soffit is genuinely a smaller, lighter tree
     with less sail area — not the same tree scaled. Growing one in free space
     and fitting it afterwards is instancing with extra steps, and it is the
     one shortcut that would make this decorative.
   - **Bottom-up means reverse index order, not branch depth.** Every node of
     the clear stem shares depth 0, so sorting the pipe-model pass on depth left
     the trunk's own order arbitrary and it summed radii that had not been
     computed yet.
   - **A tree is not a signboard.** Vogel reconfiguration — the crown furls and
     the frontal area collapses, so F ∝ U^(2+Ψ) with Ψ ≈ −0.6 in leaf — is
     worth 40 % of the drag on a mature crown. A bare winter crown is a
     different load case with almost no reconfiguration left in it.

30. **Stairs reach the ground by construction.** One stair per shaft per level,
   each climbing that level's own height from that level's floor, so the flights
   tile `[0, top]` with no gap. The selftest asserts the tiling closes and that
   an external stair tower stays attached at every level — it used to be placed
   against level 0 and lose a stepped mass on the way up. A campanile is exempt
   and detached on purpose, and climbs on its own turret.
