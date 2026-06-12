# FOAM.md — the course to the 3D foam society

The destination: rind's dense **33k-chamber foamview** (Ri 250 · T 50 · 18° · 10 axial, 20 m
rooms), **painted with a legible society** — every chamber coloured by the building that owns it,
the certified ramps and roads threading the city as its actual streets, and wayfinding, supply,
and social fabric all one model. This file is the chart. Leg 1 is shipped; the rest are in order.

## Why the 2D kernel had to be rebuilt before painting anything

econ.js v1 was a flat rectangle with crow-flight supply wiring. The foam is an annular chamber
graph where gravity is radial and travel is anisotropic — azimuthal is level street, radial is
climb, and climb is only cheap where a certified spiral ramp exists (rind/wayfind.js). Painting a
Euclidean society onto that geometry would have produced a *picture*, not a model: the colours
would say "bakery" while the supply lines cut through fifty load-bearing walls. Three inversions
were required first, and they are the architecture of everything below:

1. **Infrastructure first.** wayfind's `planRoute()` chains are scarce certified artifacts; the
   city yields right-of-way to them *before* any building is placed — not the other way round.
2. **Buildings are chamber clumps.** A building is a connected set of real chambers, keyed by
   chamber index — the foamview's own id space. Painting the society IS colouring chambers.
3. **Distance is road distance.** Supplier choice, access, (eventually) commutes — all measured
   by anisotropic Dijkstra over the chamber graph (climb ×6 off-deck, decks discounted), never
   by Euclid. Measured effect: **~50% of supply edges choose a different supplier than
   crow-flight would** — the geometry genuinely restructures the economy.

## Leg 1 — the kernel (SHIPPED: `society3d.js` + `test/econ3d.selftest.mjs`)

`buildFoamCity({Ri,T,cell,arcDeg,axial,grade,seed,genome})` →

```
sectorFoam (rind, vendored)        the same 33k chambers foamview renders
  └─ planRoute → RIGHT-OF-WAY      ramps + roads reserved, unbuildable
       └─ graph-Voronoi buildings  sized by the econ genome's FOOTPRINT (fp^0.65)
            └─ 2-label Dijkstra    per-resource road-nearest supplier (self excluded)
                 └─ access         median dwelling→basket road cost → 0..1 oracle signal
```

Output is econ.js-shape (places/edges/closure…) so `buildSociety` / `socialMetrics` /
`removeImpact` run **unchanged**, PLUS the foam layer: `chamberOwner` (chamber → building | road
| void), `route` (drawable ribbons), `access`. `scoreFoamSociety` blends access into vitality —
move the ramps and the score moves. Full 33k sector: ~5.5 s in node, deterministic from
`(genome, seed)`.

## Leg 2 — paint the foamview (SHIPPED: `econ/foam/` + `test/econfoam.selftest.mjs`)

The page at `hoop.mino.mobi/econ/foam/` — foamview.html's instanced rendering (WebGPU + the same
2D-fallback contract, orbit/pinch/probe controls) colouring by **society, not stress**:

- **A module Worker** (`foam/builder.js`) builds the city off the render thread (~6 s full
  sector), bakes FOUR colour layers (role · building size · bridges-vs-bonds · access heat on
  dwellings) + the route-ribbon geometry, posts them as transferable arrays, then *stays alive
  holding {city, society, metrics}* to answer click inspections. The page never touches the
  model — its whole input is typed arrays + small JSON, and that contract is what the selftest
  pins (32 checks, headless via a worker-global shim).
- **Chamber instancing by owner**: per-instance colour = owning building under the active lens;
  right-of-way chambers road-grey under EVERY lens (the streets always read); voids dark. The
  radial probe is the street-level cut.
- **Legibility is aggregation**: glyph billboards render only above a 13 px screen-space
  footprint (the hospital reads from orbit, the dwelling up close); road-fronting buildings get
  brighter colour (+18%) and gold glyphs — the eye finds the high street.
- **Click a chamber → the econ dossier**: owner, footprint, who's there, weave %, the two-web
  shock, access (dwellings) — answered by the worker, displayed in the corner panel.
- **Permalinks**: `?seed=&n=` reproduces the whole society (leg 5's contract, prefigured).

## Leg 3 — roads and ramps interact WITH the city (both directions)

Today infrastructure shapes the city (right-of-way, access). The reverse coupling is the
interesting leg:

- **Demand-routed roads.** After the society lands, re-run wayfind with junction anchors biased
  to the highest-traffic supply corridors (the edges array carries cost·volume); iterate
  infrastructure ↔ city to a fixed point (2–3 rounds — it converges fast because right-of-way
  is small). The town centre then *emerges* where the math wants it.
- **Junction towns.** Score each building by road-network betweenness of its door chamber; the
  oracle's `bridges` signal should correlate with junction proximity — the Granovetter weak-tie
  thesis acquiring a *spatial cause*. Pin that correlation in the selftest (it is a falsifiable
  model prediction, the first one the society makes about geography).
- **Ramp-foot gravity.** Footprint targets near ramp foots shift toward trade/serve (the genome
  gains a `junctionBias` gene). A dormitory genome with a strong junctionBias is a transit
  suburb; the archetypes acquire geography.

## Leg 4 — wayfinding for PEOPLE (commutes close the loop)

- Hats already know home and workplace. Route them: `commute(person)` = door→door anisotropic
  path; the distribution of commute costs joins the oracle (`commute` signal beside `access`).
- The same fan machinery hoop's world map uses (`nav.js wayfan`) applies here: a person's
  reachable-in-budget tree IS their lived neighbourhood; bridging should fall out of overlapping
  fans, not just shared membership. This unifies econ's social metrics with hoop's HPA* nav.
- Then the painting gets its final layer: desire lines. Accumulate commute traffic per chamber,
  render as luminance — the city lights up along its true streets, and dead infrastructure goes
  visibly dark (the legibility test of the whole model).

## Leg 5 — one id space (postal) + persistence

- Bind buildings to hoop's postal addresses: a building's key becomes `(chunk, ordinal)` of its
  door chamber — genome-stable across regenerations, exactly what `postal.js` exists for. Then
  an econ place and a hoop forum *place* can be the same ATProto record
  (`com.minomobi.hoop.place` gains an optional `building` field; lexicon change, additive).
- Persist a rolled city as `(genome, seed)` — two integers; the permalink contract the gacha
  pattern already proved. `/econ/foam/?n=…&seed=…` reproduces the whole 33k-chamber society.

## Sequencing note

Leg 2 ships value immediately (the painted foamview) and forces no model decisions. Leg 3's
demand-routing is where the research interest is. Leg 4 is cheap after 3 (all machinery exists).
Leg 5 should land before any ATProto write. Keep `rind/wayfind.js → hoop/vendor/wayfind.js` a
verbatim re-sync (same rule as vendor/auth.js); if the two drift, the certificate the kernel
relies on is no longer the one foamview draws.
