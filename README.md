# atom4-data

Results of ATOM⁴'s long calculations, written by `.github/workflows/atom4-compute.yml` on the games branch
(`claude/minesweeper-voronoi-mesh-4hc4ir`). See `.github/compute/README.md` there.

- `tmp/atom4-*/`: the tools' caches (`games/atom4/tools/*.mjs` keep them in `$TMPDIR`). Copy them to `/tmp/` and the
  tools' `bake` modes pick them up.
- `runs/<run>/`: each run's logs, per group, and `run.json`.

Data only: no workflows live here, so a push here wakes nothing. Never merged into any other branch.

Seeded from the sandbox's caches of 2026-10-26: the hydride census and its pairs, the force-field training data, the
pair search's Hartree–Fock energies, and the first cluster census.
