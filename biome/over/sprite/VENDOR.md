# Vendored from `mega/sprite/`

These files are **verbatim copies** of the megaproject's pixel-creature kernels:

| here | source |
|------|--------|
| `core.js` | `mega/sprite/core.js` (xmur3/mulberry32/rngFor/ramp + humanoid) |
| `wave.js` | `mega/sprite/wave.js` (gait math: `legPhase`, `gaitStep`) |
| `poly/poly.js` | `mega/sprite/poly/poly.js` (arthropods: ant/spider/crab) |
| `quad/quad.js` | `mega/sprite/quad/quad.js` (legged vertebrates: hound/boar/bear) |
| `axial/axial.js` | `mega/sprite/axial/axial.js` (worm/snake/eel) |
| `radial/radial.js` | `mega/sprite/radial/radial.js` (echinoderms) |

biome is a no-build static site served by its own worker, so it can't import from `/mega/` at
runtime — the copy is the only option. **Re-sync from `mega/sprite/`, don't fork** (same rule as
`hoop/vendor/auth.js` and the repo's other vendored kernels). If you need to change behaviour, change
it in `mega/sprite/` and re-copy. The directory layout is preserved so each module's `../core.js` /
`../wave.js` relative imports resolve unchanged.

Only the subset biome/over uses is vendored (no `item/`, `fixture/`, `isopod/`). `over/fauna.js` is the
biome-owned glue that chooses which kernel each catalogue animal gets — it is NOT vendored.
