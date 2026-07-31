# vendored biome engine — VERBATIM, do not fork

`cycles.mjs`, `allometry.mjs`, `roster.mjs` are **verbatim copies** of
`biome/cycles/sim/{cycles,allometry,roster}.mjs` (the repo-root **biome** wing's element-exact,
closed-ecosystem box model). hoop is a pure-static site and can't import a sibling wing at runtime, so —
same rule as `hoop/vendor/auth.js` and `econ/society3d.js`'s `vendor/wayfind.js` — we **copy, never fork**.

The Forge's unified element ledger (`../../ledger.js`) runs this engine as the **biotic / life-support**
half of one element ledger; the forge supplies the **industrial** half. biome owns + conserves C·H·O·N; the
two couple at the shared pools (biomass/food, CO₂, mineral N, water).

**If biome changes:** re-copy the three files (don't hand-edit here) and re-run
`node hoop/forge/test/ledger.selftest.mjs`. The engine is zero-dep, so the copy is self-contained.

Source of truth: `biome/cycles/sim/`. Re-sync command:

```
cp biome/cycles/sim/{cycles,allometry,roster}.mjs hoop/forge/vendor/biome/
```
