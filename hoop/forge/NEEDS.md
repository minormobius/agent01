# The ship's needs — how we enumerate every end product (and the living-materials catalogue)

> The product set is the spine of the Forge. This is the **theory of the case**, the **method** for
> enumerating products without guessing, and the **catalogue** itself. The machine-readable version is
> `catalogue.js` (element-tagged, so it feeds the periodic-table → looping-Sankey endpoint). The "weird
> stuff" (the carbon-pump hypothesis) is kept as a *latent layer* — noted, not baked in.

## The method: list NEEDS, not products

You can't enumerate "every product" — it's unbounded. But the **needs** of a closed system are finite and
decomposable, and **every product exists to close a loop that would otherwise run down**. Enumerate the
loops; each loop's parts *are* the catalogue. Completeness test: if you can name a need no product covers,
that's a missing class — which is exactly how you find the gaps.

Grounded in real closed-life-support work — NASA ECLSS, ESA **MELiSSA**, **Biosphere 2**, ISS logistics —
plus the extra loops a *generation* ship adds: it must reproduce its **people**, its **machines**, and
**itself**, indefinitely, with zero resupply.

## The theory of the case

**The ship is a closed homeostat:** a fixed stock of matter + a steady energy input must sustain a
human-and-machine society across generations. Every artifact is a part in one of these loops:

- **Life loops** — air · water · food · waste (the CELSS core)
- **Body loop** — health · medicine · hygiene
- **Skin loops** — clothing/textiles · habitat/fixtures
- **Vessel loops** — structure/hull · energy · compute/control · propulsion/nav
- **Labor loop** — machines · **logistics droids** · tools (the factory that builds the factory)
- **Society loops** — knowledge/culture/governance, and the one that makes it a *generation* ship:
  **reproduction/continuity** (the genetic + biological stock)

### The latent meta-loop (the carbon-pump hypothesis — deferred)

If the ship's true purpose is cycling/sequestering carbon, then **carbon is the master element** and
**woven carbon fiber is the apex product** — the swing good that is at once clothing, structure, *and*
carbon store. `biomass → pyrolysis → carbon fiber → hull/cable` is literally a carbon pump from atmosphere
into structure. The catalogue is built so this slots in cleanly later; we have **not** committed to it.

## The catalogue — end-product classes by loop

~40 classes from 15 loops. Each is a stand-in for a family of items; the element tags drive the Sankey.

| Loop | end-product classes | dominant elements |
|---|---|---|
| **Air** | CO₂ sorbent beds · O₂ generation cells · gas sensors · fans & ducts | Si · Ca · Fe · trace |
| **Water** | filtration membranes · still/condenser cores · pipe & valve sets · coolant | C·H · Fe · **H₂O** |
| **Food** | staple crops · cultured protein (algae/yeast/myco) · fats & sugars · micronutrients · packaging | **C·H·O·N** · P · trace |
| **Waste** | digester cultures · sorbent/catalyst media · ash & slag handling | microbial · trace |
| **Body** | pharmaceuticals · wound textiles · medical instruments · hygiene consumables | C·H·O·N · trace · fiber |
| **Textiles** | **woven carbon fiber** · cellulose/bast cloth · mycelium leather · technical cloth · insulation | **C** · polymer |
| **Habitat** | partitions · furniture · lighting · plumbing fixtures · flooring | Fe · Si · polymer · fiber |
| **Structure** | hull plate · frames/bulkheads · **carbon-fiber cable & tether** · shielding · seals | Fe · Si · **C** |
| **Energy** | PV/reactor parts · batteries & fuel cells · capacitors · wiring/busbars | Fe · Cu · Si · **rare-earth** |
| **Compute** | chips · sensors · displays · comms gear | Si · **trace** · Cu |
| **Labor** | **logistics droids** · manipulator arms · motors/actuators · hand tools · drones | Fe · Cu · polymer · fiber |
| **Mobility** | transport pods · conveyors · lift gear · droid docks | Fe · fiber · polymer |
| **Propulsion/Nav** | thruster parts · reaction-mass handling · gyros · nav sensors | Fe · ceramic · trace |
| **Society** | data-storage media · record/paper stock · instruments · ritual & art goods | polymer/paper · Si · trace |
| **Continuity** | genetic/seed archive · nursery fixtures · growth monitors · the living stock | biological |

It's *closed*: every class answers a named need.

## The living-materials sub-catalogue (the bio-derived spine — the carbon thread)

The materials that **are**, or come from, living systems — where the carbon economy lives:

- **Foodstuffs** — grains, pulses, vegetables, oils/fats, sugars; **cultured** protein (spirulina/chlorella
  algae, yeast single-cell protein, mycoprotein), cultured meat.
- **Fibers** — cellulose (cotton-like), bast (flax/hemp analogs), **carbon fiber** (pyrolyzed biomass — the
  pump), **mycelium** leather/composite, cultured silk.
- **Biopolymers** — PHA/PLA bioplastics (from biomass sugars), cellulose film, lignin resin, **chitin**.
- **Biochemicals** — vitamins, antibiotics, enzymes, hormones — fermented/cultured from feedstock + trace.
- **Living infrastructure** — algae photobioreactors, the **microbial consortia that ARE the recyclers**
  (digester/nitrifier cultures), soil/root microbiome, seed & genetic stock.
- **Structural bio** — wood/bamboo analogs, lignin composites, **calcium** biominerals (shell/bone).

Three elements do most of the work here — **C, N, Ca** — and the current 7-commodity model tracks none of
them distinctly. That's the bridge to the endpoint.

## The element pivot (what unlocks the periodic table → looping Sankey)

The endpoint needs products carrying **real elemental composition**, not the 7 families. So every product in
`catalogue.js` carries a composition vector over a tracked element set —
**H · C · N · O · Si · P · S · Al · Ca · Fe · Cu · Ti · Ni · (rare-earth)** — ~14 elements covering ~99% of
a ship's mass and every loop. Click an element on the periodic table → a Sankey of *that element* flowing
through products → use → waste → recycle → back, **looping on itself** because the system is closed. The
closure math `graph.js` already does, re-expressed per element.

## Status / next

- `catalogue.js` — the ~40 classes as data, each with loop · need · element vector · family bridge · a
  `living` flag for the bio-derived subset. Pure, node-tested (`test/catalogue.selftest.mjs`).
- **Not yet wired** into `graph.js` or the page — that refactor (products 5 → ~40, families → elements) is
  the next step, once the theory (and how weird to go) is settled.
- **Deferred:** the carbon-pump meta-loop and any other "weird" purpose — latent, not committed.
