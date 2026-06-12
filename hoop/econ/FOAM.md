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

## Leg 3 — roads that GROW (the desire-line / Laplace reframe) · PROTO SHIPPED in `/paint`

The corkscrew-plus-connectors of leg 1 is a *highway system* with no *streets*, and it is imposed
top-down — at odds with the generated ethos of everything else. The fix is not "more roads" but a
different category of road. In spin gravity there are two, with opposite generation logic:

- **Level circulation** (azimuthal *and* axial — both constant-radius, constant-g): cheap, dense,
  and should EMERGE from where people actually go. This is the missing capillary layer.
- **Radial circulation** (changing floors — climbing): expensive, sparse, legitimately engineered.
  The corkscrew is the *vehicle elevator*, not the road network.

So the right mental model is **a stack of 2-D cities**: each radial shell is a flat city with its
own street grid on the unrolled (azimuth × axial) plane, threaded by a few vertical cores. (That
also *defines the 2-D game*: one unrolled shell — and "one road entrance per floor" is a building
punching up the stack and opening onto each shell's grid once.)

**The mechanism (the user's framing):** the stationary flux of NPC trips is the **Laplace transform
of NPC motion** — the resolvent / graph Green's function, the time-integrated chamber occupancy
under the ensemble of journeys. Solve that field once and **roads are its superlevel set**: the
chambers the most journeys cross become open concourse; everything below the waterline stays
sequestered building. One solve = streets + hierarchy + doors + the ambient traffic to animate.

We compute it biologically (Physarum / ant-trail / current-flow betweenness): place only attractors
(home/work/basket) + trip demand, route, accumulate flux, let conductance follow flux (cost =
length/conductance), iterate to a fixed point. The feedback exponent **μ** is the one knob —
**μ<1 keeps parallel streets (a grid), μ>1 collapses to one arterial (a tree)** — i.e. μ *is* "do
I have enough roads". The corkscrew need not be imposed: vehicular trips that must change radius
concentrate onto the cheapest helix, so the ramp can FALL OUT as a measured object.

**Proto (shipped):** `paint/flux.js` + `test/flux.selftest.mjs` (20 checks) + the **desire-line
roads** mode in `/paint`. It grows streets over the room-adjacency graph, renders roads as
zero-wall concourse + buildings glowing by their ambient traffic (the Laplace field) + a 3-tier
network + one door per building, with μ and street-fraction dials. Invariants pinned: the network
is one connected component, every building fronts a road with exactly one door, opened walls only
ever sit between two road rooms, and μ is monotone (grid↔tree).

**Ported to /econ (2D):** `econ/roads.js` + `test/econroads.selftest.mjs` + the **⛗ grow roads**
button on `/econ/`. The demand is no longer synthetic — it is the LIVED society: every hat is a
recurring trip (home→work/parish/club), every supply edge a freight run, aggregated into desire
lines. The page animates the field stepwise (one reinforcement round per frame: faint desire lines
sharpening into a hierarchy), then the CARVE: road cells are expropriated from the buildings they
cross, every surviving building keeps frontage + one door, fully-eaten buildings are absorbed.
The kernel is shared with /paint (`makeGraph`/`createGrower`/`finalizeField` in `paint/flux.js`,
now steppable + early-exit/flat-heap optimised: ~0.45 s per round at 8 k cells, 11× the naive).

**Still to port to the foam (`society3d.js`):** run the same grower over the chamber graph in
place of `planRoute`; keep the radial cores sparse; let the helix emerge. Then **junction towns** — score a
building by the road betweenness of its door chamber and pin that the oracle's `bridges` signal
correlates with junction proximity (the Granovetter weak-tie thesis acquiring a *spatial cause* —
the first falsifiable prediction the society makes about geography). Watch the two cautions:
flux can over-concentrate into one mega-artery (the μ/decay tuning, asserted via a road-size
*distribution*, not just "roads exist"); and door assignment must be inside the fixed-point loop,
not a post-step, or a building strands when its nearest road moves.

**Sectors + density (the room to spread).** At ~5 k in the sample sector against a 1 M design
you are ~200× under-packed — a gift: sparser settlement leaves voids for generous concourse and
plazas, and road-per-capita rises on its own. Reserve azimuthal/axial sectors for reactors, water
treatment, farms; give each a per-sector *program* (a genome gene): residential = dense pedestrian
streets + one sequestered door; industry/utility = sparse freight roads + docks + restricted
access; market = porous, many doors. Sector boundaries become the natural arterials.

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

> Deploy note: a Cloudflare API 504 ate the first leg-2 deploy (run 27421574156) — transient,
> re-fired by commit. If a hoop deploy fails at "Deploy Worker + Assets" with a 504, re-push; the
> sandbox cannot dispatch workflows.
