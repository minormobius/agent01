# Method — the financial periodic table

What the numbers in `elements.js` mean, where they came from, and what they are
not. Read this before quoting anything off the page.

## The question

> For each chemical element: how is it actually extracted, what form does it
> really trade in, what is a year of world extraction worth, and how large is
> the economy that extraction stands under?

The last part is the research question. The first three exist to make it
answerable, because **most elements are not sold as elements** and a table that
priced them as elements would be describing a market that does not exist.

## The four numbers

| Field | Definition |
|---|---|
| `prod × price` → **upstream** | world annual production × a representative price, both on the basis named in `basis` |
| `mid` | the market for the form the element is actually traded and consumed in |
| `down` | annual revenue of the **first-order** product markets that cannot be made without it |
| `down / upstream` → **leverage** | dollars of downstream economy per dollar of extraction |

### Upstream

Production and price come from the [USGS Mineral Commodity Summaries
2026](https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf) for every commodity
that publication covers — about seventy of them, and every large one. The rest
are attributed per element in `refs`: World Nuclear Association and the OECD-NEA
Red Book for uranium, the World Gold Council for gold demand, the IEA for
hydrogen, WSTS for semiconductors, DOE/ORNL isotope programmes for the
reactor-made nuclides.

**`prod` and `price` are always on the same basis**, and that basis is stated.
Fluorine is quoted per tonne of CaF₂, not per tonne of F. Potassium is per tonne
of K₂O equivalent. Chromium is per tonne of gross-weight chromite ore. Mixing
element content with compound content is the single easiest way to publish a
figure that is wrong by a factor of two, and keeping them paired in one record
makes `prod × price` verifiable by inspection. The selftest asserts that every
priced element has both.

### The traded form

Each record names the form the element is bought in, because that is where the
economics live:

| Element | Sold as | Share |
|---|---|---|
| Sulfur | sulfuric acid | ~90% of consumption |
| Nitrogen | ammonia, then urea and nitrates | ~88% to fertiliser |
| Titanium | TiO₂ pigment | ~95% of titanium consumed |
| Sodium | caustic soda and soda ash | metal is negligible |
| Hydrogen | never sold — captive to ammonia and refining | ~99% |
| Fluorine | hydrofluoric acid | elemental F₂ is made in situ |

### Downstream — one hop, counted once

`down` is the annual revenue of the product markets where the element is a
**non-substitutable input**, stopping at the first hop.

This constraint is doing real work. Following iron past crude steel into
"buildings, ships and vehicles" would reach a large fraction of world GDP, and
the same buildings would be counted again under calcium, copper, zinc and
manganese. One hop makes the elements additive enough to compare without
pretending the total is meaningful.

Where the wider claim is the interesting one it goes in the element's `note`,
not into the number. Nitrogen books $155bn of fertiliser and chemicals; its note
records that roughly half the nitrogen in the protein of living humans came
through a Haber–Bosch reactor. Fluorine books $45bn; its note records that ~20%
of marketed drugs carry a C–F bond. Those are true and they are not revenue
attributable to the atom.

### Leverage

`down / upstream`. High leverage means the element captures very little of the
value it makes possible — usually because it is a by-product whose supply cannot
respond to price, or a trace input whose cost is invisible next to the product.
Gold is the only element in the table with leverage below 1×, because it is
bought to be held rather than consumed.

## Confidence — the honesty field

Market-research estimates of the same industry routinely differ by a factor of
two or three between houses. Several of the searches behind this dataset
returned spreads like "$14bn to $50bn" for one market in one year. So every
element carries a tier, and the tier is the number you should actually believe:

| `conf` | Meaning |
|---|---|
| `high` | upstream is a sourced USGS/industry figure; downstream is a measured market |
| `med` | upstream sourced; downstream is a reasoned estimate over published market sizes |
| `low` | both ends order-of-magnitude — read the exponent, ignore the mantissa |
| `nil` | no extraction economy exists at all |

Roughly a quarter of the table is `nil`. Everything above fermium is assembled
one atom at a time in an accelerator; the honest economic answer for those
elements is zero, and saying so is more useful than inventing a notional price.

## The chokepoint flag

`gate: true` is not "important". It is a three-part test, and an element must
pass **all three**:

1. **No drop-in substitute** in its principal use.
2. **Supply cannot respond to price** — a by-product, a single deposit, or more
   than ~60% from one country.
3. **Leverage ≥ 10×**, *or* the downstream is food, health or safety critical.

24 of the 118 qualify. Silicon and tin were considered and dropped: silicon's
leverage is the largest on the board but quartzite is not scarce, and tin's
supply, while fragile, is neither single-sourced nor by-product-bound. The badge
is only worth anything if it stays narrow.

## Known limitations

- **Downstream is a judgement.** The attribution rule above is defensible, not
  measured. A different rule gives different numbers, sometimes by 3–5×.
- **Prices are annual averages in a volatile year.** Sulfur went from $46/t to
  $180/t between 2024 and 2025; antimony, bismuth, germanium and tungsten all
  moved on export controls. Upstream values for those elements are a snapshot of
  a moving market, not a trend.
- **Recycling is excluded from upstream.** Secondary lead exceeds mine supply
  and secondary aluminium is a large fraction of consumption; both are noted in
  the records but neither is added to `prod`, which is mine/primary output.
- **Co-production is not netted out.** Copper and its by-products (Se, Te, Re,
  Mo, Ag, Au) each carry their own upstream value, so summing the table
  double-counts the ore body they share. The total on the page is a sum of
  markets, not of mines.
- **The rare-earth split is apportioned**, not separately reported. USGS gives
  one 390,000 t REO world total; per-element tonnages here are distributed by
  known basket composition and priced from the MCS oxide price table.

## Changing the data

`elements.js` is hand-written and is the only place the figures live. After
editing, run the selftest, which is what `scripts/preflight.mjs` runs for you:

```bash
node finance/ptable/ptable.selftest.mjs
```

It asserts all 118 elements are present exactly once, the grid has no
collisions, `prod`/`price`/`basis` travel together, downstream is non-negative,
`gate` only appears on elements with a downstream, every record carries a note
and a confidence tier, and `nil` elements carry no priced market. It does not
and cannot check whether a figure is *right* — only that the dataset is
internally coherent. Corrections to the figures themselves are welcome; put the
source in `refs`.
