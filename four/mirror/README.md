# four: solvers for any number of dimensions

The methods behind [four.mino.mobi](https://four.mino.mobi), a universe with four dimensions of space worked out from
atoms to planetary systems. Every solver here is written for any number of dimensions d, checked first on ours (d = 3)
against measured or published answers, and only then run in four. Plain JavaScript modules, no dependencies: they run
in a browser or in node 20+.

How each method works, what checks it and its limits: [four.mino.mobi/atom/methods.html](https://four.mino.mobi/atom/methods.html).

```bash
git clone https://tangled.org/morphyxmino.bsky.social/four-atom
cd four-atom && npm test        # the known-answer test: every method against its checks
node papers/p1/reproduce.mjs     # paper 1's atoms, solved again and set against its data
```

## What's here

| module | computes |
|---|---|
| `atom/js/atom.js` | atoms: the radial equation with l + (d − 3)/2, Numerov on a log grid, a self-consistent field (Hartree, local exchange, Hund spins), the ground configuration |
| `atom/js/kernel.js` | the 1/r kernel averaged over a 3-sphere (4D has no shell theorem) |
| `atom/js/gauss.js` | Hartree–Fock on Gaussians in any d (McMurchie–Davidson, with Boys's F_n generalized to G_n), and MP2 on top of it |
| `atom/js/md.js` | molecular dynamics: rigid molecules, a thermostat, an Ewald sum for 1/r in any d |
| `atom/js/gibbs.js` | liquid and vapour of rigid molecules side by side: Gibbs-ensemble Monte Carlo with a per-box Ewald sum in any d |
| `atom/js/landscape.js` | poses of rigid molecules, BFGS, descents for pairs and clusters |
| `atom/js/ffmodel.js`, `forces.js` | force fields between molecules |
| `atom/js/gas.js` | virial coefficients, lattice sums |
| `atom/js/stars.js` | stars: polytropes on each law's shell kernel, the virial theorem in d dimensions, WKB tunnelling |
| `atom/js/orbits.js` | n-body orbits in any d, precession round a real star, planets in planes turned apart, moons, starlight |
| `atom/js/nebula.js` | a rotating cloud of gas settling round a star |
| `atom/js/geometry.js` | spheres, directions, packings, random walks, Hopf circles, the Clifford torus |
| `atom/js/polytopes.js`, `turning.js` | the six regular 4D polytopes; rotations in planes, handed spin, rigid bodies |
| `atom/js/fields.js` | routes to a 1/r force in 4D, the lens vacuum, Biot–Savart under each kernel |
| `lumen/js/optics.js` | light in n dimensions: falloff, diffraction, Planck, rainbows |
| `atom/js/ionic.js` | ionic crystals of any shape in any d: Ewald sums, charge clouds that leak in 4D, a short-range model |
| `atom/js/pw.js`, `pseudo.js` | plane-wave density functional theory in any d (FFT, Davidson, Pulay mixing, forces, k-points) and norm-conserving pseudopotentials from `atom.js` |
| `atom/js/periodic.js`, `atom/tools/bake.mjs` | where each element sits in the table; one element's ground state and ionization, as the paper's table was baked |
| `atom/js/tile.js` | the 4D viewer the site draws with (a browser canvas: shadow or slice, turning through w, the reticle) |

## Try it

```bash
node atom/test/methods.selftest.mjs     # every method against known answers
```

```js
import { hydrogen, ground } from "./atom/js/atom.js";
hydrogen(1, 1, 4);                          // −0.222 hartree: 4D hydrogen binds by 6.05 eV (ours 13.6)
ground(10, 4, { exchange: true }).config;   // "1s2 2s2 2p6": element 10 in four dimensions

import { polytrope } from "./atom/js/stars.js";
polytrope("pinned4", 2).bound;              // 0.5: a 4D star of gas is bound with E = W/2, as ours is

import { returnChance } from "./atom/js/geometry.js";
returnChance(4);                            // 0.193: a random walker comes home less often in 4D (ours 0.341)
```

## Paper 1: a periodic table for four dimensions

`papers/p1/data/` holds the paper's table (the 4D table to Z = 140, and the same solver in our 36, beside the measured
values; schema in its README) and `papers/p1/refs.json` its references, each marked by how far it was checked.
`papers/p1/reproduce.mjs` solves the atoms again and checks them against that data:

```bash
node papers/p1/reproduce.mjs                 # a sample, a few seconds per core
node papers/p1/reproduce.mjs --z4=78,138     # chosen 4D elements
node papers/p1/reproduce.mjs --all           # everything (hours)
```

## About this copy

This is a mirror of part of https://github.com/minormobius/agent01 (the `four/` directory), refreshed on every change
there. Don't open pull requests here; this copy is overwritten. The live site, its chapters and the data its long runs
produced stay in the monorepo.

MIT licensed: see `LICENSE`.
