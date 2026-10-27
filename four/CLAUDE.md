# four — four.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

A universe with four dimensions of space, worked out. Its light (Lumen⁴, and IRIS⁴'s rainbow you walk under), its atoms, periodic table and molecules (ATOM⁴, the official position, in twelve chapters), and which molecule would be its water, computed with solvers written for any dimension and checked first on our own world. Papers to follow, the first a periodic table for four dimensions.

## Facts

| | |
|---|---|
| Surface | `four` |
| Dir | `four/` |
| Endpoint | `four.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/minesweeper-voronoi-mesh-4hc4ir` |
| Deploy | `.github/workflows/deploy-four.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "four"`.

## How it works

A universe with four dimensions of space, worked out, as one static site: no build, no worker script, no bindings
(worker `four`, assets only, on the plain route `four.mino.mobi/*`). It split out of `games` on 2026-10-26: games is
for games, and this is a modelling programme with publications to come. The games built on the same geometry
(Foam⁴, PLATEAU, KATABASIS, Anakata, Anabasis, Hinton) stay in the arcade, and the hub links to them.

- **the hub at `/`**: `index.html`, one card per part, and the papers card. It borrows ATOM⁴'s stylesheet
  (`atom/css/atom4.css`).
- **Lumen⁴ at `/lumen/`**: light in
  four dimensions beside our own, 3D warm and 4D ice. `lumen/js/optics.js`
  (no DOM) has falloff by codimension (1/r^(n−k−1)), Gaussian beams (a laser
  is a line; on axis (w₀/w)^(n−1)), the flash (u₃ = f(t−r)/4πr; u₂ and u₄
  as η-integrals, u₄ = (1/4π²r)∫cosh η f′(t − r cosh η)dη: a negative wake,
  no Huygens in even n), round-hole diffraction ((2J₁/x)² vs (3j₁/x)², first
  dark 1.22 vs 1.43 λ/D), Fresnel with n − 1 polarizations (4D glare
  polarized in a plane), Planck in n dimensions (ν^n/(eˣ − 1), T^(n+1),
  colours via CIE), the rainbow cut by a slice (ρ = arccos(cos θ/cos β)),
  and that bow on a flat screen as a conic section (e = sin γ / cos ρ: leaning
  the sun into w turns a hyperbola into a parabola, an ellipse, a point). Who
  moved doesn't matter: with the antisolar direction in your own frame
  (`antisolarInFrame`: sun's lean, turn, twist, look into w), the bow exists iff
  |a_N| ≤ sin θ and e = √(a_R² + a_U²)/cos θ, so looking into w never changes
  its shape.
  The selftest checks each against closed forms, the wave equation itself and
  brute force. See [`lumen/README.md`](lumen/README.md).
- **IRIS⁴ at `/iris/`**: a rainbow you
  shape, in first person. `iris/js/world.js` (no DOM) is a 4D heightfield of
  0.25 m tesseract voxels (192 × 192 × 64 cells over x, z, w; periodic value
  noise, lakes), the two-level march (blocks of 8³ skipped on their tallest
  column, cells inside; `march()` is the shader's twin, line for line) and
  walking (0.5 m step-up, slide along cliffs, wrap). The same land grained by
  Kelvin's foam (A₄*) or the 24-cell foam (D₄): Foam⁴'s lattices (from `iris/js/foam.js`, a
  byte-identical copy of games' `foam4/js/foam.js`, which the selftest checks) at 1.4 voxels, a cell solid when its seed is under
  the land, `marchFoam()` walking facet to facet (the ray's facing facets once
  per ray, skips on dilated block maxima + circumradius, the cell kept across
  blocks; the shader's twin), the ground the foam's, no wrap. `js/render.js` shades it
  in a low sun, with fae colours by how far off in w a surface is from you, and
  draws Lumen⁴'s bows (primary and secondary per wavelength, Alexander's band,
  mirrored in the lakes). The page shows the bow's conic from the antisolar
  direction in your camera frame (e = √(a_R² + a_U²)/cos θ, dashed over the
  rendered bow) and a map of it. Layout: the view on the top two thirds, the
  controls below (side by side on wide screens). Imports
  `../../lumen/js/optics.js`, so run Lumen⁴'s selftest after a change there; after a change to Foam⁴'s
  `foam.js` in games, copy it over `iris/js/foam.js`. See
  [`iris/README.md`](iris/README.md).
- **where we are, at `/start/`**: the front door for a cold reader. The argument in eleven steps, each tagged (a choice /
  follows / computed / open), each with a toy whose numbers come from the same code as the chapters
  (`start/start.js`: squeezing an electron, field thinning, the charged shell (`atom/js/fields.js`), hydrogen's lines,
  the filling diagram (`table/filling.js`), the pair search, an ideal gas in 2–4 dimensions). Keep it in step with
  the position: when a conclusion changes, its step here changes too. The hub and ATOM⁴'s landing point to it.
- **fields at `/fields/`**: electrostatics and magnetism under the pin, as five toys (`fields/fields.js`, drawing
  only; the physics is `atom/js/fields.js`, checked by ATOM⁴'s selftest 33): point charges in a slice (pinned 4D
  draws exactly as ours), flux that grows with radius, a nucleus-in-shell atom felt from outside (a²/8s³) and the
  bowed inside of a lone shell, a current loop's field by Biot–Savart with each kernel (r⁻³ pinned and ours,
  r⁻⁴ for 4D Maxwell), and a charge in a uniform 4D field turning in two planes at (|L| ± |R|)/2.
- **the big periodic table at `/table/`**: `table/viewer.js` draws all 78 4D elements (`atom/js/table.js`) full width,
  our table to 54 beside it, linked both ways (hover one, its counterpart lights up), with a detail panel
  (counterpart and why, configuration, ionization and size against ours, the census's hydride, the electron cloud)
  and four colourings. The names come from `atom/js/names.js` (no DOM): an element takes our name with its first
  letter moved on when its place answers to one of ours (before a block's half-full element count from the left,
  the half-full one is ours, after it count from the full shell); 24 answer to nothing and are new, elements 6 and 8
  either side of darbon among them. Symbols keep the chapters' H, D, Px and Mi and otherwise avoid all 118 of ours.
  `table/filling.js` (no DOM) draws the filling diagram for both worlds (Madelung's diagonals of n + l; boxes of
  2(2l + 1) in ours, 2(l + 1)² in 4D, dashed past 78 where the solver hasn't been), filled to the selected element
  from its solved configuration; selftest 27 checks the order against all 78 solved atoms.
- **ATOM⁴ at `/atom/`**: the **official position on this universe**: four
  dimensions of space with the force between charges pinned at 1/r (Gauss's
  1/r² has no ground state). `index.html` is the position: every conclusion,
  one card per chapter, plus the open questions. Eleven chapter pages hold
  the working: `force.html`, `light.html`, `motion.html`, `hydrogen.html`,
  `table.html`, `shapes.html`, `darbon.html`, `forces.html`, `xater.html`,
  `census.html`, `search.html`. All run `js/main.js`, which
  draws only what each page has. **A new conclusion goes in its chapter
  and on the landing's cards**; the selftest checks every page carries the
  same nav, has no repeated id, and that every drawing has its element.
  The adopted electromagnetism is the **lens vacuum** (ε = ε₀ℓk,
  μ = μ₀/ℓk). Light (D/ε₀, μ₀H) is exactly 4D Maxwell, so Lumen⁴ and IRIS⁴
  stand; charges feel it through a 1/r³ blur, c/ℓω for one frequency. The
  cost is relativity for the force. `js/atom.js` (no DOM) is the solver:
  Numerov on a log grid with L = l + (d−3)/2, energies by Sturm bisection
  (stop where h²f/12 > ½ or Numerov fakes nodes), a self-consistent field
  (Hartree plus local exchange, own-share corrected, Hund spins; ground
  configs accept only converged fields) with the
  sphere-averaged kernel (1/max in 3D; k(min/max)/max in 4D, k(1) = 8/3π),
  and the ground-config search. `js/fields.js` holds the field theory's closed
  forms (the routes, the unitarity bound, the lens vacuum, scattering as ω³).
  `js/turning.js` holds motion and spin: so(4) = so(3) ⊕ so(3) by the Hodge
  star, the electron's handed spin (the selftest builds 4 + 1 γ matrices),
  fine structure, orbits, and a free rigid body. `js/forces.js` is the
  force field between molecules: the permanent −3S_AS_B/64R⁵ (S = Σ⟨r²⟩,
  which the bake stores per orbital), dispersion with London's 7/4, β = 2√2I,
  twisting, salt's −r⁻⁷ tail, and the noble-gas pairs. `js/pairs.js` is
  **generated** by `atom/tools/pairs.mjs` (~1 min; Gordon–Kim on the
  solver's frozen clouds, electrostatics summed shell by shell so the Z²/R
  cancellation is exact; re-run after `bake.mjs`). The force chapter opens
  with what the universe contains (electrons as fermions, nuclei declared
  stable to Z = 78, the lens photon, a small fine-structure constant) and why
  matter is stable (argued by scaling). `js/periodic.js` is the layout
  and our real table. `js/table.js` is **generated** by `atom/tools/bake.mjs`
  (~6 min, worker threads; re-run it after any change to `atom.js`, since the
  selftest recomputes a sample and fails on drift). The 3D run gets 32 of 36
  configurations right, Cr and Cu included, missing Ti, V, Co, Ni (local
  exchange leans to d); ionization within a few percent. `js/response.js` is
  **generated** by `atom/tools/response.mjs` (~1 min: the coupled response,
  α(iω) and C₆ by Casimir–Polder; hydrogen exact in both worlds, helium =
  TDHF). Bake order after a solver change: `bake.mjs`, then `pairs.mjs` and
  `response.mjs`. `js/gauss.js` (no DOM) is Hartree–Fock on Gaussians in
  any dimension (McMurchie–Davidson with G_n(T) = ∫₀¹u²ⁿ(1−u²)^((d−3)/2)
  e^(−Tu²)du in place of Boys's F_n); `js/molecules.js` is **generated**
  by `atom/tools/molecules.mjs` (~30 min, four jobs in parallel: our
  water as the check, Pxygen and Xater H₂Px, two bases, the H-bonded
  pairs), independent of `table.js`. `js/md.js` (no DOM) is molecular dynamics in any
  dimension: RATTLE-rigid molecules, Bussi thermostat, and an Ewald sum for
  the pinned 1/r in any d (split as erfc/erf of 1/r itself, since a Gaussian
  cloud's potential isn't short-ranged off 3D). It's checked against
  Madelung constants (3D, and 4D's 1.8393991 by Evjen) and NIST's SPC/E
  reference (`test/fixtures/nist-spce-1.txt`).
  `atom/tools/pairsearch.mjs` searches two molecules' every relative pose
  (model BFGS from many starts, then Hartree–Fock scoring and relaxation;
  cached) and `bake`s `js/pairmin.js`: chapter 10's correction (Xater and
  XH₃ pairs bind ~27 kcal/mol antiparallel, twice the census's linear-bond
  values). Its pose maths and descent live in `atom/js/landscape.js`, shared
  with chapter 11's live search (`js/search.js`); a descent counts only when
  |g| < 10⁻⁶ (stalls once passed for extra minima).
  `js/gas.js` (no DOM, no data) is chapter 12: the ideal gas in any d, B₂(T) by direct integration with an
  analytic tail, Boyle and inversion temperatures, the crystal's lattice sum over D_d (fcc, and the 24-cell
  lattice), and `nobleGases(mods)`, which reads the noble-gas pairs as the forces chapter does (÷1.8 … ×1). The
  critical-point rules are corresponding-states rules read off our argon (`ARGON`): estimates, labelled so.
  `atom/tools/gasnumbers.mjs` prints its numbers as JSON for `gengas.py`.
  Beside it, for chapter 12's crystals and salts: `atom/tools/crystals.mjs` (candidate lattices by lattice sum;
  fcc must win for our noble gases), `atom/tools/salt.mjs` (closed-shell ions from the solver, Gordon–Kim between
  charged clouds, the alternating lattice by Evjen cubes; in 4D past 14 bohr the exact far field from the clouds'
  moments, since a numerical tail would diverge over 4D's r³ shells; sodium fluoride is the check),
  `atom/tools/ions.mjs` (ionization and affinity for Bl₂Px₃), and `atom/tools/coexist.mjs` (Gibbs-ensemble
  liquid–vapour runs, one temperature per command, for the runner; `coexist.mjs bake` fits each system's critical
  point, both exponents, into **generated** `js/coexist.js`). `atom/tools/audit.mjs bake` writes **generated**
  `js/audit.js` (chapter 11's probe results). Both bakes read the runner's caches: `git archive origin/atom4-data tmp`
  into a directory and point `TMPDIR` at it.
  `js/clusters.js` is **generated** by `atom/tools/clusters.mjs` (minima of
  3–6-molecule clusters on the force field; `--shard i/m` splits a search
  across machines). **Long runs go to the runner, not the sandbox** (below) . `js/census.js` is **generated** by
  `atom/tools/census.mjs` (~4.5 h: every hydride of 4D rows 2–3 and our
  NH₃/H₂O/HF, then their H-bonded pairs; jobs cached in the temp dir, so a
  cut run resumes; run it on the runner). `js/polytopes.js`
  (no DOM) builds the six regular 4D polytopes, sp^d hybrids and the diamond
  nets. `js/tile.js` is a small 4D viewer (shadow coloured by w, or the 3D
  slice at w = h; drag turns in 3D or through w; idle spin in any planes,
  `step`/`overlay`/`onTurn` hooks; draws only while on screen), used by
  `js/shapes.js` and `js/turningTiles.js`, and meant to grow into the 4D
  molecular-dynamics view. Imports `../../lumen/js/optics.js` for line and
  sky colours; Lumen⁴'s page links back to the light chapter. See
  [`atom/README.md`](atom/README.md).
- **ATOM⁴'s pages are generated.** The twelve chapters and the landing come from
  `atom/tools/pages/genpages.py` (it execs `genxater.py`, `gencensus.py`, `gensearch.py` and `gengas.py` beside it, and cuts the
  first chapters from `old-index.html`). Each chapter's body and the landing's cards live there, with their numbers
  pulled from the baked `atom/js/*.js`. So change a chapter there, never in the HTML, then
  `python3 four/atom/tools/pages/genpages.py`. **A new conclusion goes in its chapter and on the landing's cards.**
- **papers**: none yet. Paper 1, a periodic table for four dimensions, is planned in `atom/WRITEUP.md` (deliberately
  pinned: it's to be held to a physics preprint's standard). Its sources are gathered in `atom/LITERATURE.md`, with
  each entry tagged by how far it's been verified. Papers will live at `/papers/`.

## Long calculations: the runner

The sandbox kills a detached run a few minutes after the session goes idle, so anything longer than a turn goes to
GitHub's runners. Queue commands in `.github/compute/atom4.json` and push it to this branch. The workflow is
`.github/workflows/atom4-compute.yml`; the tools' caches and every run's logs live on the orphan branch
`atom4-data`, which is never merged and holds no workflows. The queue accepts only
`node four/<part>/tools/<tool>.mjs` followed by plain words. How to use the results:
[`.github/compute/README.md`](../.github/compute/README.md).

## Testing

```bash
node four/atom/test/atom4.selftest.mjs     # 50–90 s, by machine: everything ATOM⁴ states, checked (see atom/README.md)
node four/lumen/test/lumen4.selftest.mjs   # < 1 s
node four/iris/test/iris4.selftest.mjs     # ~10 s, including foam.js against games' copy
```

Keep ATOM⁴'s under 120 s. `preflight` runs all three whenever this directory changes.

## Deploying

Pushes to `claude/minesweeper-voronoi-mesh-4hc4ir` that touch `four/**` trigger
[`.github/workflows/deploy-four.yml`](../.github/workflows/deploy-four.yml): `route-dns.mjs` makes sure the host's
DNS record exists, `wrangler deploy` uploads, and the run fails unless `four.mino.mobi` answers. `main` deploys
nothing. The sandbox can't reach Cloudflare, so push to deploy, never `wrangler deploy` locally.

**Old links:** `games.mino.mobi/atom4/…`, `/lumen4/…` and `/iris4/…` redirect (301) here, to `/atom/…`, `/lumen/…`
and `/iris/…`, from `games/worker.js`.
