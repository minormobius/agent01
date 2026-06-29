# rind/ops — the white-collar weave (the theory)

> **NOW IN 3D — a PANCAKE.** The primary view (`index.html` + `3d-app.js`, kernel `foam3d.js`) resolves the
> weave in a **volumetric voronoi foam pancake**: a wide, thin, **two-layer** disc woven from **counter-rotating
> spirals**. 6 white arms spiral from the **upper-centre** hub, 8 production from the **lower-centre** hub (the
> six starts sit ABOVE the eight); upper/lower layer = over/under; the hubs join only through the woven body.
> Counter-rotation ⇒ K(6,8). Two reads — **orbit** (the woven pancake) and **inhabit thread** (*the mapping
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
