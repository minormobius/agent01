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

## Leg 2 — paint the foamview (the legible society)

A new page `hoop/econ/foam/` (hoop is the game wing — the society viewer belongs here), reusing
foamview.html's instanced-WebGL approach but colouring by **society, not stress**:

- **Chamber instancing by owner**: `chamberOwner` → per-instance colour = owning building's role
  hue (the brutalist econ palette). Right-of-way chambers in road grey; voids dark. The radial
  probe (foamview's scrub) becomes the *street-level cut*: scrub inner→outer and watch dwell
  give way to industry near the hull.
- **Legibility is aggregation, not labels.** At 33k chambers, glyphs drown. Render building
  glyph billboards only above a screen-space footprint threshold (the hospital reads from orbit,
  the dwelling only up close) — the cartographic generalisation rule.
- **Routes as ribbons** (already solved in foamview's `drawRoute`) — but now they are *streets
  with frontage*: tint buildings whose door is on the right-of-way (`onRoad`) a half-step
  brighter. The eye should find the high street instantly.
- **Click a chamber → the econ inspector**: owner building, who's there, weave %, the two-web
  shock — the same rail the 2D page has. One `chamberOwner` lookup is the whole hit test.
- Perf note: build the city in a Worker (5.5 s) and post `chamberOwner` + colours as transferable
  arrays; the render thread never blocks.

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
