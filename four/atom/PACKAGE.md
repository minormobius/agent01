# Packaging the solvers for free use

The methods behind four.mino.mobi are an asset in their own right: solvers written for any number of dimensions, each
checked on ours, with no dependencies, that run in a browser or in node. This plan turns them into a library anyone can
use. **Decided 2026-10-28:** the monorepo stays unlicensed; the solvers are mirrored to their own repo on tangled,
`tangled.org/morphyxmino.bsky.social/four`, and that repo is **MIT**. Built: the kernel split (`kernel.js`), the mirror's
build (`four/mirror/build.mjs`), its README and licence, its known-answer test (57 checks, 7 s, from the selftest's
method blocks), and the workflow that stages, tests and pushes it. Waiting on: the repo being created on tangled.

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

1. **Split the kernel out of `atom.js`.** (Done: `kernel.js`.) `k4`/`kTab` (the sphere-averaged 1/r in 4D) go into their own module, so
   stars, orbits and fields no longer import the atom solver.
2. **The source stays where the site uses it; the mirror is built from it.** `four/mirror/build.mjs` copies the
   modules at their own paths into a staged tree, so there's one source and no copies to keep in step. (Done.)
3. **Known-answer tests, without the site's data.** (Done: assembled from the selftest's method blocks.) The site's self-test mixes checks of the method (Lane–Emden,
   Madelung, NIST water, Kepler) with checks of baked results. The first kind moves into the package's own tests and
   runs in seconds with node alone; the second stays with the site.
4. **A README per group**: what it computes, the call, a ten-line example, what it was checked against, its limits.
   The methods appendix already holds most of this text.
5. **The runner as a template**: the workflow, the queue's format and the plan/run scripts, documented so a fork can
   run its own resumable jobs.
6. **Publish**: the MIT mirror on tangled, refreshed by `.github/workflows/mirror-four-tangled.yml` on every change. (Built; waits on the repo.)

## Still open

- A README per group, with examples beyond the four in the mirror's README.
- The runner as a template, in the mirror or its own repo.
- A licence for the book's text and figures (CC BY 4.0 was suggested), if they're ever mirrored.
