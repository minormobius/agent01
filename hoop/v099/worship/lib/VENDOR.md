# worship/lib — VENDORED divination kernels (verbatim · re-sync, never fork)

The same rule as `hoop/vendor/auth.js` and `hoop/v099/morph/`: these are **verbatim copies**;
re-sync from source if they change, do not edit here.

| File | Source of truth |
|---|---|
| `iching.js` | `clock/lib/iching.js` |
| `zhouyi.js` | `clock/lib/zhouyi.js` (canonical 周易 text; optional — the oracle uses HEX.j) |
| `geomancy.js` | `clock/lib/geomancy.js` |
| `geomancy-meanings.js` | `clock/lib/geomancy-meanings.js` (Fludd significations) |
| `hexagrams.js` | extracted from the inline `const HEX` table in `clock/yijing/index.html` |

Consumed by `worship/oracle-cast.js` (pure cast kernel) + `worship/oracle.js` (the fixture UI).
A no-build static site can't import a sibling surface at runtime, hence the copy.
