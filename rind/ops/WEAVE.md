# rind/ops — the white-collar weave (the theory)

> **THE SEVEN-HEXAGON OFFICE (`office.html` · kernel `officeweave.js`, proof `test/office.selftest.mjs`).**
> The thread-office ("your thread is an office") re-founded on two moves. **(1) Thicken by aperture-7.** The
> threads read too tight because the whole 14-thread weave was packed into one hexagon. The fix is the weave's own
> self-similarity clause (see "How the cells tessellate"): extend the weave-cell to **seven hexagons** — the H3
> aperture-7 parent (area ×7 ⇒ `hexScale = √7`, the child flower rotated `atan(√3/5) ≈ 19.106°`). Same 14 threads,
> same topology, ~2.4× the chambers per thread (median ≈550 vs ≈230) and physically broader corridors — and the
> FULL onedoor certificate survives untouched on every seed tested: **K(6,8) = 48/48, 14/14 spirals continuous,
> every door at grade, one-door** (pinned). The seven child hexagons persist as **DISTRICTS**: a true 7-way Voronoi
> partition of the chambers (nearest child-centre), drawn as the dashed flower overlay and read back by the HUD —
> an office genuinely *spans* districts now. (`certify` gained an additive `probes` opt so the page can rest on
> the structural one-door proof at load time; the selftests keep the measured sampling.) One honest seam:
> `placeDoors` picks each K-pair's door independently, and at ×7 two pairs can land on the SAME chamber — a cell
> can only be one door first-person, so `officeweave.dedupeDoors` relocates the collider to the next-flattest
> adjacency of the same two threads (the certificate's own doors are untouched). **(2) Hew to hoop/v101.** The
> office partition adopts the v101 room programme (vendored policy `v101/rooms.js` — see `v101/VENDOR.md`):
> **traffic-sized rooms** (zone weights = `TRAFFIC_FOOTPRINT`, so civic hubs claim more chambers than dwellings —
> measured and pinned), a **grand anchor** at the nexus end (GRAND role on whites, the engine core on production),
> **MIN_ROOM bulldozing**, and the v101 world-painter read: the hallway spine is carved out as the HALL, every
> room boundary is a **wall** except **one lit threshold per room** (a spanning tree of the region graph rooted at
> the hall — walls are the default, doors are deliberately-placed gaps), light **pools per room** from a
> self-emitting component (+ warm bollards along the hall), and residents walk at half scale with boids
> separation. Movement respects the walls (`passable()` is the walk graph; reachability of every chamber from the
> nexus is pinned). Rendering note: the 3D face adjacency projects to INTERLEAVED floor tiles (only ~9% of
> 3D-adjacent pairs share a 2D tile edge — measured), so walls are laid on the 2D map's OWN Voronoi adjacency
> (each tile edge attributed to the neighbour whose bisector cut it, 99.8% attribution) and the 3D doorways
> surface as threshold markers.

> **THE ONE-DOOR RESOLUTION (`onedoor.html` · `rind.mino.mobi/ops/onedoor.html`; kernel `onedoor.js`, proof
> `test/onedoor.selftest.mjs`).** The hard spec line — *wayfinding from ANY point in the chunk to ANY other point
> passes through only ONE door, including the two central hubs* — is now true **by construction and proven**, not
> "≈ one door". Why it was stuck: the per-thread door graph (`cells3d.routeMinDoors`) counts a door as *crossing
> into a different **thread***, and the 6 white arms all spiral the same way out of the top hub so **no white arm
> ever crosses another white arm** — white·i → white·j shares no door and must detour through a production arm (2
> doors); same for the 8 production arms; the interstitial matrix is a third region on top. So same-colour trips
> cost ≥2 and the honest max was up to 4. It's a property of how doors are **counted**, not of the geometry.
> **The fix collapses the walkable space to exactly TWO door-free concourses joined only by controlled doors:** the
> WHITE concourse = the 6 arms **+ the nave (top) hub**, ONE connected door-free region (open plates throughout);
> the PRODUCTION concourse = the 8 arms + the bottom hub, ONE connected door-free region on the floor stratum; and
> **the only doors in the whole chunk are the 48 K(6,8) crossings**, each a single **zero-grade** doorway at the
> flat the weave already lands there — every other white/production plate is a **wall** (the rind rule: walls are
> the default, doors are deliberately-placed gaps). Then within a colour → **0 doors**, across colours → **exactly
> 1** (walk your concourse free to the nearest crossing, cross once, walk free), so **max over ALL pairs, incl. both
> hubs, = 1** — the structural proof (two 0-connected regions + ≥1 door ⇒ max 1) *and* an exhaustive-ish measurement
> agree, pinned across seeds/widths/chunks. The "6 arms / 8 arms" survive as a wayfinding **identity overlay** (which
> arm tours which engines — the tour is unchanged), not as walls. **How it's built** (`onedoor.js`): (a)
> `assignConcourses` hard-binds every ARM-owned cell to its colour — so NO K crossing is ever lost — and floods only
> the interstitial matrix to the nearest colour, which stitches the same-colour arms into one component through their
> hub; (b) `placeDoors` opens, per (w,f), the single flattest white-w↔prod-f adjacency (the zero-grade doorway); (c)
> `certify` proves whiteConnected ∧ prodConnected ∧ maxDoors===1 ∧ hubs-one-door. **Honest tensions kept raw:**
> K lands **~44–48/48** (a few crossings have no adjacency — widen / add decks) and a handful of doors are genuine
> over/under **stairs** rather than zero-grade (drawn dashed-red) — these are QUALITY metrics, reported but *not*
> part of the one-door proof, which holds no matter how many of the 48 a seed opens. The next lever, if we want
> 48/48 truly at grade, is a **meet-at-grade weave** (both threads pass through mid-height with a flat at each
> crossing instead of over/under parity) — a local `onedoor` centreline variant that would not touch `prism`'s
> over/under art piece.
>
> **TWO SUBSTRATES (the `▦ HCP / ✳ on-curve` toggle · kernel `curveseed.js`).** The one-door tech is substrate-
> agnostic — the same certificate runs over two different ways of getting the Voronoi nuclei: **(HCP)** the prism's
> homogeneous lattice claimed by the fair watershed (above); **(on-curve)** nuclei seeded DIRECTLY ALONG the 14
> analytic thread curves at an arc `pitch`, plus a sparse HCP filler, then the polyhedra GROW to fill the prism.
> On-curve is the more curve-native substrate and lands the spec *better*: because a nucleus sits on its thread, it
> realises the **full K(6,8) = 48/48** and **every door is zero-grade** on every seed (the crossings are on the
> curves, not a deck apart). The catch it exposed — and the general lesson — is that **nearest-curve ownership
> fragments**: the over/under weave chops each thread into Voronoi islands at its crossings, so hard-binding those
> owners gives dozens of concourse pieces, not one. Two fixes make it whole: **(1)** concourses are assigned by a
> **geodesic flood from the two hubs** (`assignConcoursesFlood` — a Dijkstra forest from a connected seed is
> connected by construction, so each concourse is ONE region on any substrate), and **(2)** the sparse filler +
> an orphan-**stitch** pass (buildCells' 0.5 face tolerance drops a few genuine faces, leaving degree-0 slivers and
> small floating clusters — `stitchComponents` links every offcut to its nearest cell so the foam is one connected
> solid). With both, the on-curve substrate is provably one-door (pinned in `onedoor.selftest.mjs` over 6 seeds:
> K=48/48, all doors at grade, both concourses one region, max = 1). `filler: 0` is the instructive pure-curve case:
> K=48 and 100% fill but the concourses fragment and one-door FAILS — the interstitial filler is what bridges the
> crossing-chopped pieces back together. On-curve is the **default** view; a `〜 curves` overlay draws the 14 analytic
> centrelines (with a dot at each rim exit) so you can read the ideal seeding curve against the grown cells and see
> all 14 threads reach the outer surface.
>
> **PER-SPIRAL VORONOI CONTINUITY — the core requirement, and it's an OWNERSHIP property, not a seeding or room one
> (the `◐ watershed / ◑ nearest` toggle).** Each of the 14 spirals must be ONE connected component in the true
> face-adjacency graph. Measured finding: assigning each chamber to its **nearest nucleus** (plain Euclidean Voronoi)
> gives **0/14** continuous at every setting — at each crossing the other spiral's nucleus is simply closer and
> *slices* your thread — and **more room makes it worse**: 7→19 hexes went 22→57 fragments per thread, more decks did
> nothing. Room can't fix it because the crossings are topological (K(6,8) is non-planar), not a crowding problem.
> The cure is how ownership is assigned: a **geodesic watershed** (grow each thread from its nexus seed, only ever
> claiming a cell adjacent to one it already owns — `layWeave`) is connected *by construction*. Running that same
> watershed on the curve-seeded nuclei is the sweet spot — **14/14 spirals continuous, K≈45–48, doors at grade,
> balanced coverage, and one-door all at once** (the DEFAULT: `ownership:'watershed'`; certify hard-binds the
> now-continuous arms so no K contact is lost, floods only the matrix). `◑ nearest` is kept as the instructive
> counter-example. Pinned in `onedoor.selftest.mjs` (`spiralsContinuous`).
>
> **GRADE-AWARE ROUTING (`routeGraded`).** Plain door-minimisation (`routeOneDoor`) counts only doors, so within a
> concourse it happily takes a near-vertical shortcut between stacked cells (measured grade 7–35 — it *looked* like
> routing broke the walkable-grade rule, because it did). `routeGraded` keeps doors as the hard primary objective
> (still ≤ 1) but adds a steep-step penalty, so among equal-door paths it walks the gentlest one — measured max grade
> drops to ~0.3–0.6 (at the pedestrian cap) with the same door count. The route read-out shows the path's max grade,
> green when walkable. Pinned in `onedoor.selftest.mjs`.
>
> **THE ZERO-LADDER 6×8 (the `breathe` lever = `turnScale`).** The last residue was ~2–3 K-doors landing as over/under
> stairs rather than at grade. Measured that NO knob removes them — more nodes (worse when densest), thickness, width,
> and the flat/meet z-profiles all leave ~2–4 — because a door lives on the shared FACE between a white and a
> production cell, and in a thick weave some of those faces are horizontal (a hatch) not vertical (a wall). Two things
> DO reach zero, and they're the same mechanism (more radial room per crossing ⇒ gentler ramps ⇒ threads linger at
> mid-height ⇒ they meet side-by-side, a walkable wall, instead of stacking): **(a) fewer threads** — ≤ 4×4 hits
> steep=0 with full K; and **(b) loosening the spirals at the FULL 6×8** — `turnScale ~0.35` (fewer turns spreads the
> crossings radially; "let the tight curves breathe — it's an infinite world"). At `turnScale ≤ 0.35`, 6×8 is a TRUE
> zero-ladder world on every seed: **every one of the 48 doors at grade, full K(6,8)=48, every spiral continuous, one
> door** — all at once (pinned in `onedoor.selftest.mjs`; the onedoor view defaults to `breathe 0.35` with a
> `zero-ladder ✓` readout). Note it is NOT the diameter: expanding hexR at fixed turns keeps the crossings just as
> crowded in rf and does NOT help (`hexScale` alone measured no better) — it's the turn count (crossings-per-lap)
> that matters. Below `turnScale ~0.28` the spirals stop crossing (Σturns < 1) and K breaks, so ~0.3–0.4 is the band.

> **THE SUBSTRATE REBUILD (`prism.html` · `rind.mino.mobi/ops/prism.html`).** The weave is being re-founded on a
> proper **hexagonal prism of homogeneously spaced nodes** (`prism.js`, HCP packing — every interior node has 12
> neighbours at the same distance; `prism.selftest.mjs` proves the prism is thick enough that **no Voronoi cell
> touching the ceiling also touches the floor** — the rigorous "two real floors"; proven minimum 3 layers,
> default 4). `weave3d.js` then **lays the weave** on it: 6 white + 8 production counter-rotating spiral TUBES
> claim the prism's nodes, with four honest levers — **width** (nodes per path), **areal density** (in-plane
> spacing, at a **pinned 4-layer thickness** — the lever changes node count, never the height), **flat-core
> radius** (inside it the offices are clean **radial sectors** with no weave; all undulation is pushed into the
> annulus, killing the centre hairball), and **chunks** (1/7/19). The math is not softened: the viewer +
> `weave3d.selftest.mjs` surface every failure mode — thin tubes drop crossings (K(6,8) < 48), a width wider than
> the pinned thickness merges white & production, too few chunks cramp the cell until threads dissolve. Un-claimed
> nodes are the **interstitial matrix** (future walls/corridors), reported but not a failure. Chambers are a
> **TRUE 3D Voronoi** (`cells3d.js`): every node owns a polyhedron (hex prism clipped by each neighbour's bisector),
> packing the prism **SOLID** (Σvol/prism = 100%; *not* painted planes). The **door graph** is the real 3D face
> adjacency; **wayfinding** routes the fewest THREAD doors (staying in one corridor is free) — **anywhere→anywhere
> ≈ one door**.
>
> **CONTINUITY (the current invariant).** Threads used to fragment (a "corridor" was ~20 disconnected pieces),
> because assignment was proximity-to-a-curve, which ignores the discrete adjacency graph. Fixed in `weave3d.js`:
> each thread is grown as ONE connected corridor by a **fair priority watershed** over the Voronoi graph — every
> thread floods out from a distinct hub seed, the globally nearest unclaimed cell is taken next, and a region only
> ever expands from its own cells. A flood from a seed is connected and claims only unclaimed cells, so **every
> thread is exactly one walkable component — continuity is guaranteed by construction** (pinned across all
> seeds/widths in `weave3d.selftest.mjs`; 0 dead threads, foam still 100% solid). **The one honest tension:**
> complete K(6,8) and full continuity conflict in discrete space — closing the last crossings would need flips
> that fragment a thread. A bounded **repair pass** bridges what it can *without* breaking continuity (continuity
> wins the tie), so K(6,8) lands ~44–48/48 (48 on many seeds) and is reported raw. Three-stage API:
> `buildGeometry` → `buildCells` → `layWeave` (geometry+Voronoi cached; the flood re-runs cheaply on width/flatR).
>
> **A TRUE over/under weave (`weaveLines`, ported from foam3d).** Outside the flat no-weave core each thread
> undulates ceiling↔floor with a **zero-grade flat at every crossing** (peak = over, trough = under, plain-weave
> parity), grade-limited ramps between, amplitude growing toward the rim (crossings crowd the centre). So **top
> threads genuinely become bottom threads** — white sweeps ~0→100% of the thickness — while the `maxGrade` cap
> keeps it walkable (measured ≤ ~0.44). The flat core (rf < flatR) stays white-high / production-low, no weave.
> The honest cost: a real weave separates a few crossings by a deck too far to touch, so K(6,8) is a touch lower
> than the flat two-deck version (best in the roomier families, e.g. 19-chunk / width-4: 46–48/48).
>
> **THICKNESS is the lever that resolves it (the "one swirl" fix).** With only 4 decks the grade-cap collapses the
> weave amplitude to ~zero near the centre, so white and production sit at the *same* height there — one swirl, no
> visible over/under. Two changes: an **amplitude FLOOR** (≥ ~0.9 deck, so the weave never flattens) and a **decks
> lever** (`layers`, 4–12; the prism thickens at pinned deck-pitch). At **8 decks** the weave is fully resolved —
> ~100% of crossings show white & production ≥ 0.8 deck apart, alternating over/under — while the width tube stays
> thick enough (~2 decks) to keep them touching, so continuity + K(6,8) survive. Peel the top decks (viewer's
> "peel" slider) to watch office threads pass over and under the production threads.
>
> **THREAD COUNTS are a lever too (Nyquist).** A white thread crosses all NF productions per lap, so its over/under
> z-signal runs at ~NF cycles/lap; at NF=8 that aliases below the node grid ("one swirl"). Drop to a **3×3** (the
> `weave` slider) and crossings-per-lap fall ~2.7×, each thread gets ~2.6× the nodes (725 vs 278), and the weave
> resolves cleanly — K(3,3)=9/9, continuous, foam solid. `NW`/`NF` clamp to [2 … 6/8] and default to the full
> K(6,8); `buildGeometry` just slices the warp/weft lists. Pinned in `weave3d.selftest`.

> **NOW IN 3D — a PANCAKE.** The primary 3D view (`orbit.html` + `3d-app.js`, kernel `foam3d.js`; `index.html` is
> now the ops landing hub) resolves the
> weave in a **volumetric voronoi foam pancake**: a wide, thin, **two-layer** disc woven from **counter-rotating
> spirals**. 6 white arms spiral from the **upper-centre** hub, 8 production from the **lower-centre** hub (the
> six starts sit ABOVE the eight); upper/lower layer = over/under; the hubs join only through the woven body.
> Counter-rotation ⇒ K(6,8). **The threads WEAVE between the two planes** (`zWhite`/`zProd`) as a **ZERO-LADDER
> object** — one continuous controlled-grade surface, **no discrete floors, no vertical access**. A thread's
> height has a **zero-grade flat exactly AT each crossing** (a peak where it passes OVER, a trough where UNDER),
> so **the crossing IS the flat landing where a door belongs** (`tours[w].stops` all sit on flats); between
> crossings it ramps at ≤ `maxGrade` (smoothstep ⇒ the zero grade at every flat is free). The amplitude at each
> flat is capped by the arc-run to its neighbours, so where crossings crowd the centre the hills stay tiny and
> **grow toward the rim** — the weave spreads outward, and wayfinding goes up-and-down with a bend, never a stair.
> **The solver objective (`occupancy.js`):** the voronoi foam is HOMOGENEOUS, so the weave is only "right" if
> its paths fill the volume. Each path is a **tube of diameter d**; `occupancy(d)` = coverage (fraction of
> chambers within d/2 of the nearest pass of ANY tube) − overlap (double-occupied), and the solver maximises it.
> Two levers: a **slope cap** (`maxGrade` — these hills sit in spin gravity) that spreads the undulations toward
> the rim, and **windings** (`windings`) — more turns lay more tube-passes, BUT past a sweet spot (≈2) the slope
> cap crowds the crossings and **flattens** the weave, costing z-volume: occupancy peaks at an **interior
> optimum** in windings (the same shape as `bestTube`'s interior optimum in diameter). The **◎ analytic** toggle
> hides the foam and shows the pure woven tubes; sliders for tube/slope/windings. Pinned by
> `occupancy.selftest.mjs` (a modest winding bump fills more; piling them on loses z-volume).
> Two reads — **orbit** (the woven pancake) and **inhabit thread** (*the mapping
> tech*: the disc unrolls around your chosen arm — it becomes a straight spine centre→rim, the 8 production arms
> slant across and cross it at numbered stations; reselect and the map re-organises — the puzzle box).
> `foam3d.selftest.mjs` (21) + K(6,8) verified over 80 seeds. The 2D lineage below is preserved at
> `flat.html` (polar rosette) / `decks.html` / `weave.html`.
>
> The design problem, the diagnosis of the gyroid, and the structure we replace it with.
> Kernel: `weave.js` (the K(6,8) plaid). Proof: `test/weave.selftest.mjs` (41 checks).
> **In practice** — `index.html` + `ops-app.js` (kernel `weavefloor.js`): a **POLAR / spiral weave** — a woven
> rosette over a **19-chunk** hex region (centre + 6 + 12, the forge tiling) on **two floors**, over a fine
> (sub-chunk) **voronoi** substrate. The puzzle the render solves: **all 6 white-collar meet at the top-floor
> centre tile, all 8 production meet at the bottom-floor centre tile, and those two hubs are disconnected
> except through the weave.** The structure: **two counter-rotating spiral families** (the rind's own {N/k}
> Shukhov motif on the floor) — 6 white arms spiral out one way (converging at the top hub), 8 production arms
> the other (converging at the bottom hub). Counter-rotation makes every white arm cross every production arm
> ⇒ **K(6,8)** preserved; over/under parity puts each crossing on the upper or lower floor ⇒ **100% of both
> floors**. The hubs share no shaft, so the only path between them is out along a white arm, across in the
> field, and back along a production arm. It is a **seedable FAMILY** (spiral turns + phases vary per seed,
> SUM of turns ≥ 1 guarantees K(6,8); verified over 80 seeds). `test/weavefloor.selftest.mjs` (24) pins the
> hub split, convergence, K(6,8), full coverage, and the family. (Earlier renders kept for contrast:
> `decks.html` — stacked decks + a link-star, the wrong metaphor; the cartesian checkerboard + the
> undulating-ribbon versions in git history.) The loom-chart / woven-tube proof is at `weave.html`.

## The problem

The rind's production floor is **autonomic** — eight engines run lights-out:

> **foundry · chemworks · mill · fab · weave · assembly · fluid · reclaim** (8 surfaces)

Over them sits the **ops cortex** — six white-collar surfaces that watch and steer the floor:

> **perfusion · dispatch · scheduling · gate · telemetry · inventory** (6 surfaces)

The requirement: **every white-collar surface must reach every production surface.** The user wants the
visitor to **enter at a single point**, step onto **one of the six** white surfaces, and from that surface's
point of view **tour all eight** engines — and the whole thing to read as a **tangled-up mess**, laid out in
just **2–3 map floors**.

## The diagnosis: why the gyroid didn't make it

The earlier proto (`hoop/forge/micro.js`, the `/forge/micro` page) modelled this as a **gyroid**: two broad
woven **sheets** — one "white-collar", one "material" — crossing over-under a quarter-wave out of phase, with
a facility at every crossing, claiming *every office touches every facility*.

It's a pretty picture but it answers the wrong question. A gyroid is the **two-phase** triply-periodic minimal
surface. To use it here you have to **collapse all six white surfaces into one sheet** and **all eight engines
into one sheet**. Then "contact" is true by area — and, in the code, literally by fiat:

```js
const whiteTouches = facilities.map(() => true);   // micro.js:90 — asserted, not derived
```

Two fatal consequences:

1. **No identity ⇒ no tour.** Once the six are one sheet, there is no "white surface 3" to follow. The
   user's core ask — *tour the eight from one surface's point of view* — is unrepresentable. A gyroid gives
   contact-as-**area**; the tour needs contact-as-**path**.
2. **The material analogy points the other way.** A gyroid is what **two** components do (block-copolymer
   microphase separation, lamellar↔gyroid). We don't have two components — we have **fourteen** surfaces that
   must mutually touch. The many-component version of "interpenetrating phases that all stay in contact" is
   not a minimal surface. It's **a woven textile.**

## The reframe: it's a graph, and the graph is K(6,8)

Strip the geometry and the requirement is exactly one object: the **complete bipartite graph K(6,8)** — six
vertices on one side, eight on the other, **every** white joined to **every** prod. 6·8 = **48 edges**.

Two facts about K(6,8) decide the whole design:

- **It is non-planar.** It contains K(3,3) (the utilities-puzzle graph) many times over, so its 48 contacts
  **cannot** be drawn on one floor without crossings. The "tangled-up mess" the user is hoping for is not a
  stylistic choice — it is **forced** by the graph.
- **Its genus is 6** (`⌈(6−2)(8−2)/4⌉ = 6`). Genus counts the handles a surface needs to embed the graph
  cleanly — i.e. how many times threads must dive past each other through the thickness. **The tangle *is* the
  genus.** Our job is to realise that genus as something a person can walk in 2–3 floors.

## The structure: a plain weave (a plaid), wrapped onto the cylinder

Keep all fourteen surfaces as distinct **threads** and weave them:

- **6 warp threads** = the white-collar tours (run *along* the tour direction)
- **8 weft threads** = the production lines (run *across*)

In a **plain weave**, every warp crosses every weft **exactly once**. Those **48 crossings are the 48 edges of
K(6,8)** — realised, not asserted. Each crossing is a **facility** where one white surface meets one engine
(the old "facility at every weave crossing", now honest). Over/under follows a checkerboard — *warp over weft
iff (w+f) is even* — which **alternates along every warp and every weft**: a genuine plain weave, **two
interpenetrating layers** ("broad, not deep" — the gyroid's one true virtue, kept).

### The tour falls straight out

Follow **one warp thread** and you pass through **all eight wefts in order** — meeting each engine once,
over-under-over. That **is** "enter one white surface, tour the eight engines from its point of view." The
itinerary for warp *w* is the cyclic order `[(w+0), (w+1), … (w+7)] mod 8` — row *w* of a **Latin rectangle**
(shifts of ℤ/8). Because the six offsets are distinct, at **every** tour step the six whites occupy six
**different** engines: the six tours are **conflict-free** (no two whites at the same engine at the same step)
yet fully interleaved.

### Wrapped onto the rind, it's a braid

The rind is an O'Neill **cylinder**. Wrap the plaid onto it: the **8 wefts become 8 azimuthal stations** (a
ring — the same azimuthal layout as the zoom viewer and `/forge/ship`), and the **6 warps become helices**,
all leaving the **single entry** on the nave side and wound at six different phase offsets. Six strands round
an eight-station ring, phase-shifted = a **6-strand braid** — the tangle, made of distinct followable threads.
The radial thickness the helices wind through is only a few cells: the **2–3 floors**.

## What the kernel guarantees (proven, in `test/weave.selftest.mjs`)

| Claim | How it's checked |
|---|---|
| **48 contacts, complete** | the incidence matrix is rebuilt from the crossing set and confirmed all-ones |
| **every white tours every prod** | each warp's itinerary is a permutation of all 8 |
| **conflict-free schedule** | at each of the 8 steps the 6 warps sit on 6 distinct engines |
| **genuine plain weave** | over/under alternates along every warp *and* every weft; each warp is over 4 / under 4 |
| **single entry → 6** | 6 helices, 6 distinct phase offsets (a braid, not a parallel cable) |
| **real tangle** | each helix crosses all 8 rings (48 total) and passes front↔back of the tube |
| **deterministic** | identical from the seed (atproto/permalink-stable, like every rind kernel) |

Contrast the gyroid's `contact()`, which returned a hardcoded `true`. Here completeness is **derived from the
crossings themselves**, so the theory is the thing the test pins.

## How the cells tessellate (`tess.html` · the honeycomb)

One weave-cell is a **hexagon** — `foam3d`'s `rings` cuts it into a **centered-hexagonal number** of chunks
(`chunkCount(rings) = 3n²+3n+1`: **1 · 7 · 19 · 37 · 61 …**; the `⬡ chunks` button cycles 7/19/37). Hexagons
**honeycomb**, so the cells tile the rind shell. The interesting part is the *coupling*, and it falls out of a
coincidence that isn't one:

- **A hexagon has exactly 6 neighbours. The cortex has exactly 6 white arms.** So **each white arm is aimed at
  one neighbour** — white arm *k* exits cell A through edge *k* and hands off to cell B. The **white weave is the
  connective tissue** of the lattice; a white role threads engines across many cells, not just its own.
- **The 8 production engines don't divide a hexagon's 6-fold symmetry, so they stay LOCAL** — each cell's own
  machinery, its own lower hub. *The floor is islands; the cortex is the sea.* This is also the right semantics:
  ops surfaces (dispatch, scheduling, telemetry…) are exactly the things that coordinate *across* production
  blocks; the engines are local plant. The 6-vs-8 mismatch that forced K(6,8) non-planar is the same mismatch
  that decides what tiles (the 6) and what doesn't (the 8).
- **What couples across an edge:** white arm *k* of A reaches into B, where it can touch B's 8 engines — so A's
  whites tour B's engines too. **K(6,8) per cell, plus white→engine reach across every shared edge**; the global
  fabric is one connected cortex over a field of production islands.
- **Self-similar (aperture-7).** Seven cells make a bigger hex-flower rotated ≈19.106° — the **same aperture-7
  nesting Uber's H3** uses to tile the globe. So the weave nests: 7 ops-cells → a district, 7 districts → a
  region, at every scale the same K(6,8) motif.
- **On the cylinder.** Honeycomb the plane, then wrap it with an **integer azimuthal period** and the tiling
  closes around the rind's spin while staying unbounded along the axis.

**Design implication (not yet in the 3D kernel):** to actually hand off, a cell's 6 white arms should terminate
at the **6 hexagon edge-midpoints** (pinned rim-exits), not at spiral-arbitrary angles. `tess.html` draws the
idealised honeycomb with that pinning; folding it back into `foam3d` (anchor each white arm's rim-exit to its
edge, then stitch neighbour hubs) is the next build if we want the lattice to be navigable end-to-end.

## Open questions (the next turn of theory)

- **Is the cyclic Latin rectangle the right schedule**, or do we want a more scrambled (less regular) weave to
  read as *more* of a mess? The cyclic shift is the most legible tangle — each thread is "always advance one
  station". A twill or a random derangement would tangle harder at the cost of followability.
- **2 floors vs 3.** A plain weave is 2 layers. The third "floor" is the radial gap the braid descends
  through (office band → weave floor → lower-rind portal, the `micro.js` gradient). Do we keep the portal as a
  distinct third deck, or fold it into the weave?
- **The wefts aren't symmetric.** reclaim feeds the front of the chain and assembly feeds the nave; a real
  layout might *order* the ring by the production DAG rather than treat the 8 as interchangeable. That turns
  the plaid into a weave with a grain.
