# unit — unit.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The unit converter (reference wing, sibling to moji + uni). Thin assets Worker (worker `unit`, custom_domain unit.mino.mobi) - no build/D1/AI/secrets…

## Facts

| | |
|---|---|
| Surface | `unit` |
| Dir | `unit/` |
| Endpoint | `unit.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/emoji-wiki-platform-support-v6ubju` |
| Deploy | `.github/workflows/deploy-unit.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "unit"`.

## How it works

The unit converter (reference wing, sibling to moji + uni). Thin assets Worker (worker `unit`, custom_domain unit.mino.mobi) - no build/D1/AI/secrets. Home: category dropdown then two iOS-style CYLINDER unit pickers (unit/lib/cylinder.js, scroll-snap drum) flanking a value input + swap, with a live FULL-SPECTRUM table converting the value into every unit at once (click a row to set it as the target). Deep-linkable at /<category>/<from>/<to>?v= (e.g. /length/meter/foot?v=1). /reference is the longform table page: every unit's exact factor to/from its base both ways, affine temperature formulas, non-linear fuel economy, and SI + IEC binary prefixes. ~15 categories; all conversions in the pure engine unit/lib/units.js (factor/offset, or toBase/fromBase fns for non-affine), node-tested by unit/lib/units.selftest.mjs. Currency deliberately excluded (needs live rates).

/color (aliases /colour, /light, /wavelength; deep-linkable at /color/589.3 or
/color?hex=ff00ff) is the wavelength ↔ color page: a splash, a spectrum strip
painted from the engine, linked nm/THz/eV fields, a native color picker with
the EyeDropper API where it exists, a canvas CIE 1931 chromaticity diagram, and
the landmark spectral lines. Its engine is unit/lib/spectrum.js — separate from
units.js on purpose, because this is not a unit conversion (see below) —
node-tested by unit/lib/spectrum.selftest.mjs.

## The color page's two asymmetries

Both of these look like bugs and are not. Read this before "fixing" either.

1. **A color has no wavelength.** Only the rim of the CIE horseshoe is pure
   light. Everything inside is a mixture, so color → nm returns a *dominant*
   wavelength: cast a ray from D65 white through the color's chromaticity and
   see where it leaves the locus. Greys have no direction at all (`achromatic`),
   and magentas leave through the line of purples, which no wavelength touches
   (`purple`) — those get a complementary wavelength instead. That is why the
   page is two cards, not a swap button.

2. **No screen can show a spectral color.** Every point on the locus is outside
   the sRGB gamut, so `S.rgb(nm)` has to bring it in, and `purity` reports how
   far short it fell (cyan is worst, ~21%). Two mappings: `mode: 'vivid'`
   (default) clips the negative primaries — the familiar poster spectrum, but
   past sRGB's red primary at 611 nm every wavelength renders identically;
   `mode: 'true'` adds white instead, which keeps the dominant wavelength exact
   so nm → color → nm round-trips, at the cost of visibly pink deep reds. The
   page shows vivid and quotes the true chip beside it.

Two more places the physics bites, both handled in spectrum.js: past 700 nm the
standard observer's x̄/ȳ ratio is constant, so the locus stops moving and hue
saturates (the ray-cast locus therefore ends at 700, `S.LOCUS_MAX`); and 8-bit
rounding is coarser than the purple wedge is thin at the red tip, so a hit
within `PURPLE_SNAP` of a terminus is snapped back onto the locus.

Color-matching data is the CIE 1931 2° standard observer at 5 nm, 380–780,
linearly interpolated — 81 rows inlined in spectrum.js, from CVRL's
`ciexyz31.csv`. The selftest pins it against published chromaticities (700 nm →
0.73469, 0.26531) and against the published dominant wavelengths of the sRGB
primaries (611.4 / 549.1 / 464.2 nm), so a transposed matrix or a mangled table
fails loudly.

## Deploying

Pushes to `claude/emoji-wiki-platform-support-v6ubju` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-unit.yml`](../.github/workflows/deploy-unit.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
