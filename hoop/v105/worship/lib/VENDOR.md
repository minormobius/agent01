# worship/lib — VENDORED divination kernels (verbatim · re-sync, never fork)

The same rule as `hoop/vendor/auth.js` and `hoop/v105/morph/`: these are **verbatim copies**;
re-sync from source if they change, do not edit here.

| File | Source of truth |
|---|---|
| `iching.js` | `clock/lib/iching.js` |
| `zhouyi.js` | `clock/lib/zhouyi.js` (canonical 周易 text; optional — the oracle uses HEX.j) |
| `geomancy.js` | `clock/lib/geomancy.js` |
| `geomancy-meanings.js` | `clock/lib/geomancy-meanings.js` (Fludd significations) |
| `hexagrams.js` | extracted from the inline `const HEX` table in `clock/yijing/index.html` |
| `stalk-render.js` | `clock/lib/stalk-render.js` (`drawStalk` — the yarrow stalks, canvas) |
| `soil.js` | `clock/lib/soil.js` (the sand height-field `Field` + `soilProps`/`crackMask`) |
| `soil-render.js` | `clock/lib/soil-render.js` (`makeRenderer` — WebGPU→canvas2d shaded sand) |

Consumed by `worship/oracle-cast.js` (pure cast kernel), `worship/oracle.js` (the fixture UI),
`worship/yarrow.js` (the yarrow division, ported from `clock/yijing/index.html`), and
`worship/sand.js` (geomancy in sand, ported from `clock/geocast/index.html`).
A no-build static site can't import a sibling surface at runtime, hence the copies.
