# Packaging the solvers for free use: a plan (waiting on a licence)

The methods behind four.mino.mobi are an asset in their own right: solvers written for any number of dimensions, each
checked on ours, with no dependencies, that run in a browser or in node. This plan turns them into a library anyone can
use. **Nothing is published until a licence is chosen** (2026-10-28: "not yet"); the code is public to read, but
without a licence nobody may reuse it.

## What there is

Fourteen modules in `atom/js/`, about 1,900 lines, none touching the page (no DOM):

| group | modules | depends on |
|---|---|---|
| geometry | `geometry.js` (spheres, directions, packings, walks, Hopf, Clifford), `polytopes.js` (the six regular polytopes, hybrids, nets), `turning.js` (so(4), spin, rigid bodies) | nothing |
| atoms | `atom.js` (Numerov, self-consistent field in any d, the 4D kernel) | nothing |
| molecules | `gauss.js` (Hartree–Fock on Gaussians in any d) | nothing |
| dynamics | `md.js` (rigid molecules, thermostat, Ewald in any d), `landscape.js` (poses, BFGS, cluster descent), `ffmodel.js` (the fitted force field) | `ffmodel` → `md` |
| matter | `gas.js` (virial coefficients, lattice sums), `forces.js` (the force field between molecules) | `forces` → Lumen⁴'s `optics.js`, `polytopes` |
| sky | `stars.js` (polytropes, virial, tunnelling), `orbits.js` (n-body, precession, moons, starlight), `nebula.js` (collapse with collisions) | `stars`, `orbits` → `atom` (for the kernel only) |
| fields | `fields.js` (the routes to 1/r, the lens vacuum, Biot–Savart) | `atom` (the kernel only) |

Beside them: the tools that run long jobs (`atom/tools/*.mjs`) and the compute runner (`.github/workflows/atom4-compute.yml`
with `.github/compute/plan.mjs` and `run.mjs`): a small, reusable way to run resumable jobs on free GitHub runners.

## The plan

1. **Split the kernel out of `atom.js`.** `k4`/`kTab` (the sphere-averaged 1/r in 4D) go into their own module, so
   stars, orbits and fields no longer import the atom solver.
2. **Move the source into `packages/<name>/`, keep copies on the site.** The repo's rule for shared code: the package
   is the source, the site keeps byte-identical copies, and a sync check (like `scripts/sync-dataviz.mjs --check`)
   fails preflight on drift. Edit the package, never a copy.
3. **Known-answer tests per module, without the site's data.** The site's self-test mixes checks of the method (Lane–Emden,
   Madelung, NIST water, Kepler) with checks of baked results. The first kind moves into the package's own tests and
   runs in seconds with node alone; the second stays with the site.
4. **A README per group**: what it computes, the call, a ten-line example, what it was checked against, its limits.
   The methods appendix already holds most of this text.
5. **The runner as a template**: the workflow, the queue's format and the plan/run scripts, documented so a fork can
   run its own resumable jobs.
6. **Publish** under the chosen licence: the package in this repo, and a mirror (as `packages/cad` is mirrored).

## Decisions wanted

- **Licence.** Recommended: MIT for the code, CC BY 4.0 for the book's text and figures.
- **Name.**
- **Scope of the first release**: everything above, or a first cut (geometry, atoms, molecules, sky) with the rest after.
