# four — four.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

A universe with four dimensions of space, worked out. Its light (Lumen⁴, and IRIS⁴'s rainbow you walk under), its atoms, periodic table and molecules (ATOM⁴, the official position, in seventeen chapters), and which molecule would be its water, computed with solvers written for any dimension and checked first on our own world. Papers to follow, the first a periodic table for four dimensions.

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
- **fields at `/fields/`**: electrostatics and magnetism under the pin, as seven toys (`fields/fields.js`, drawing
  only; the physics is `atom/js/fields.js`, checked by ATOM⁴'s selftest 33): point charges in a slice (pinned 4D
  draws exactly as ours), flux that grows with radius, a nucleus-in-shell atom felt from outside (a²/8s³) and the
  bowed inside of a lone shell, a current loop's field by Biot–Savart with each kernel (r⁻³ pinned and ours,
  r⁻⁴ for 4D Maxwell), a charge in a uniform 4D field turning in two planes at (|L| ± |R|)/2, an atom in a magnet
  (`atom/js/magnet.js`: diamagnetism from both halves, the spin's pull from the left half only), and a spinning ball's
  field seen from our slice (`magnet.js` `spinField`: the part within the slice and the part reaching into w, two 3D
  fields drawn as field lines, with a test charge pushed out of the slice; selftest 46 holds it to Biot–Savart).
- **plasma at `/plasma/`**: magnetic fields carried by plasma, 4D's MHD from its textbook problems (`plasma/plasma.js`,
  drawing only; the physics is `atom/js/mhd.js`, no DOM, selftest 62, in the mirror). A bivector's anatomy (six sliders:
  the canonical two planes at rates |l| ± |r| from its left and right halves, a point turned by it in a draggable 4D view,
  F∧F = 2ab), and the frozen-in theorem run rather than assumed (`carry`: a parcel's field and density integrated through
  `FLOWS.cells` / `FLOWS.swirl`, F∧F/ρ held while the field grows ×100; a simple field stays simple), and why helicity has
  no 4D counterpart. The stars chapter's plasma section links here. Section 4 is a kinematic dynamo: `atom/js/dynamo.js`
  (no DOM, selftest 63, mirrored) solves ∂F/∂t = −d(i_v F) with decay ηk² (ours) or η|k|³ (4D lens) for Roberts-type
  flows periodic in x, y, each field wave along the other directions separately (pseudo-spectral, RK4, Strang-split
  decay, F = dA so closed); `atom/tools/dynamo.mjs scan <case>` (~5 min each, sandbox-sized) and `bake` → **generated**
  `js/dynamodata.js`. Result: 4D's Roberts cells grow fields faster than ours at Rm 1–14, planar flows never do.
- **drift golf at `/drift/`**: a game on the plasma physics (`drift/drift.js` draws and aims; the physics and the course
  are `atom/js/drift.js`, no DOM, selftest 64, mirrored): a charge with dv/dt = E + F v − γv on tiles of 4D fields (rough,
  soft, back, highway = one plane z–w so the green is its free sheet, slant = x–z + y–w which drifts the ball into z and w,
  left), pushed for `PUSH_T` and coasting to rest; holed in the cup with z, w near zero, lost past `OFF`. Each hole carries
  `proof`, a way round in par found by `solvable` (beam search) and replayed by the selftest: retune a hole, rerun
  `solvable` and update its proof. The page's aim preview runs the stroke as if the field stayed the ball's tile.
- **the orrery at `/orrery/`**: a 4D planetary system run live, full screen (the view on the top two thirds, controls
  below; side by side on wide screens, as IRIS⁴). `orrery/orrery.js` draws it with its own 4D camera on `atom/js/tile.js`'s
  maths (turn, apply, the w colours): the whole of it (w by perspective) or a 3D slice with the rest as ghosts marked
  ana/kata; pick a planet (tap it, or its chip) to centre on it or ride along in w (the slice follows it); turn its
  orbit face on, edge on or into w; a gauge and a strip chart show every planet's w, the coordinate the view hides. The system is `atom/js/orrery.js` (no DOM, selftest 49): planes from the nebula runs (every orbit takes the
  cloud's left half of turning, its right half drawn round the cloud's with the measured mean cosine `MINUS`, so any two
  planes are isoclinic at half their right halves' angle and the stability map's "iso" runs apply exactly), spacings
  from `js/stabilitydata.js` (the grid point below, plus a margin, then a short run and a redraw if anything strays),
  moons in the completely orthogonal plane (left half kept, right reversed) at a third of the Hill radius,
  temperatures from `orbits.js` `planetT` round a star declared as hot as our Sun (distances in units of 100 star
  radii). Moons' distances are drawn ×8; the URL keeps the seed. Days and seasons are open (a 4D planet spins in two
  planes), so the planets don't turn.
- **the big periodic table at `/table/`**: `table/viewer.js` draws all 140 4D elements (`atom/js/table.js`; the sixth row's f block, 81–112, as a band below, from `atom/js/periodic.js` `layout`) full width,
  our table to 54 beside it, linked both ways (hover one, its counterpart lights up), with a detail panel
  (counterpart and why, configuration, ionization and size against ours, the census's hydride, the electron cloud)
  and four colourings. **Inside the atom** (`table/inside.js`, below the tables) draws the pinned element's subshells in
  profile and any of its orbitals cut by any of the six planes, paper 1's figures 4 and 5 for every element, from
  **generated** `table/profiles.json` (`atom/tools/profiles.mjs bake`, ~2.5 min: each element re-solved in `tablec.js`'s
  configuration with radial functions kept, checked against the table's energy; selftest 70). Re-run it after a bake or
  `terms.mjs bake`. `/table/#Z` opens on element Z (the paper links it). **Every tile is a link to `#Z`** (ours to its 4D counterpart): a click or tap navigates, the `hashchange` handler pins it and redraws the detail panel and Inside the atom, and the back button walks the history. Hover previews answer `pointerType === "mouse"` only: Safari on a phone treats a tap whose mouseover changes the page as a hover and never sends the click, which once left Inside the atom on the old element (PI, 2026-11-10). The names come from `atom/js/names.js` (no DOM): an element takes our name with its first
  letter moved on when its place answers to one of ours (before a block's half-full element count from the left,
  the half-full one is ours, after it count from the full shell); 52 of the 140 answer to nothing and are new (paper 1's `table.newN`), elements 6 and 8
  either side of darbon among them. Symbols keep the chapters' H, D, Px and Mi and otherwise avoid all 118 of ours.
  `table/filling.js` (no DOM) draws the filling diagram for both worlds (Madelung's diagonals of n + l; boxes of
  2(2l + 1) in ours, 2(l + 1)² in 4D, dashed past 140 where the solver hasn't been), filled to the selected element
  from its solved configuration; selftest 27 checks the order against all 140 solved atoms (each subshell by when it's half full).
  The table to 140 was baked on the runner (`bake.mjs --zmax4=140 --cache --shard=i/6`, then `--assemble`); seven
  elements (88, 101–103, 105–107) first landed on unsettled fields and were redone with `bake.mjs --repair=Z,…`,
  which seeds `ground()` from the neighbours' configurations ±1, ±2 electrons. Check any new bake's energies for a
  smooth second difference before committing it. The solver is not relativistic: past ~100 it's a first pass.
- **ATOM⁴ at `/atom/`**: the **official position on this universe**: four
  dimensions of space with the force between charges pinned at 1/r (Gauss's
  1/r² has no ground state). `index.html` is the position: every conclusion,
  one card per chapter, plus the open questions. Seventeen chapter pages hold
  the working: `geometry.html`, `force.html`, `light.html`, `motion.html`, `gravity.html`, `hydrogen.html`,
  `table.html`, `shapes.html`, `darbon.html`, `forces.html`, `xater.html`,
  `census.html`, `search.html`, `gas.html`, `nuclei.html`, `stars.html`, `planets.html`. All run `js/main.js`, which
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
  `js/magnet.js` (no DOM) is atoms in a magnet (the motion chapter's section, the fields page's sixth toy): the 4D Pauli
  identity (τ̄·a)(τ·b) = a·b + iσ·ℓ(a∧b) on quaternion units, so the spin couples to the field's left half only (g = 2 for
  a field in one plane); Langevin's diamagnetism −Σ⟨r²⟩/2d from `table.js`'s per-orbital ⟨r²⟩; Hund's-first-rule spins and
  Curie's paramagnetism, scaled by the field's shape |ℓ|²/|F|². Selftest 45 checks the identity, our noble gases against
  measured susceptibilities and spins against NIST; `atom/tools/magnetnumbers.mjs` gives the chapter its numbers.
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
  stable to Z = 140, the lens photon, a small fine-structure constant) and why
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
  `gauss.js`'s `mp2` adds MP2 (closed shells, cores frozen) on a Hartree–Fock result; selftest 43 holds it to PySCF. `ump2` is
  unrestricted MP2 for open shells (selftest 59: closed-shell MP2 exactly on a closed shell). `hartreeFock` reports `converged`
  only when an iteration met both tests, with `iterations`, `dE` and `commutator` (before the audit an exhausted budget read
  as converged; selftest 58). `atom/tools/reconverge.mjs` re-runs saved pair energies under the fixed test (runner; `bake` →
  **generated** `js/reconverge.js`). `atom/tools/diatomic.mjs` (`mol <F2|O2|Gl2|Px2>`): heavy-atom diatomics by Hartree–Fock
  and (U)MP2, counterpoise, three starts per point (bare nuclei, atoms parallel, antiparallel; the lowest kept), our F₂ and
  O₂ the checks; `bake` → **generated** `js/diatomicdata.js`; cache `$TMPDIR/atom4-diatomic`. `atom/tools/bonds.mjs` (`mol <name>`):
  atomization energies (Hartree–Fock geometry, MP2 energy, atoms by UMP2), hydrogen against gluorine on darbon, pxygen and
  gluorine, ours as the checks; `bake` → **generated** `js/bondsdata.js` (4D bonds to hydrogen 0.46–0.80 of ours, without
  hydrogen 0.99–1.08). `atom/tools/molpair.mjs`: pairs of XL₂ molecules too big for the full basis (PxGl₂; our OF₂ the
  check): the core contracted (each heavy atom's tight s primitives into its 1s) and integrals in single precision,
  `check` against the full basis, `pair <name> <k>` one random placement a runner command (MP2, counterpoise); `bake` →
  **generated** `js/molpairdata.js`. `atom/tools/molff.mjs fit <name>`: an XL₂ force field (charges, Born–Mayer repulsions,
  damped dispersion) fitted to those MP2 pairs, a fifth held out → **generated** `js/molffdata.js`; `liquid.mjs` models
  `of3` and `pg4` run on it. The OF₂ check FAILED in the default basis (no liquid at 120 K; `basis <name> <k> <plus>` showed the
  split d deepens pairs 1.1–2.2×, an f adds ~1%): `pair … --plus=Dd` caches `pairDd-…` (baked under `grown`), `molff.mjs fit
  OF2 --plus=Dd` stores `OF2@Dd`, and the `of3d` liquid model runs on it.
  `atom/tools/correlation.mjs` re-scores the best pairs with it (`pair <key> [plus] [shift]`, counterpoise-corrected;
  `plus` grows `census.mjs`'s `basisFor` recipe: D diffuse, d a second d, p hydrogen's second p, f an f, F two f, h a d on hydrogen, g a g) and `bake`s
  **generated** `js/correlation.js` for the census chapter's correlation section; `atom/tools/correlation-ref.py`
  (PySCF, pip install pyscf) computes our pairs in aug-cc-pVTZ/QZ for comparison. Both read and write
  `$TMPDIR/atom4-correlation`.
  `atom/tools/pairsearch.mjs` searches two molecules' every relative pose
  (model BFGS from many starts, then Hartree–Fock scoring and relaxation;
  cached) and `bake`s `js/pairmin.js`: the census chapter's correction (Xater and
  XH₃ pairs bind ~27 kcal/mol antiparallel, twice the census's linear-bond
  values). Its pose maths and descent live in `atom/js/landscape.js`, shared
  with the search chapter's live search (`js/search.js`); a descent counts only when
  |g| < 10⁻⁶ (stalls once passed for extra minima).
  `js/gas.js` (no DOM, no data) is the gases chapter: the ideal gas in any d, B₂(T) by direct integration with an
  analytic tail, Boyle and inversion temperatures, the crystal's lattice sum over D_d (fcc, and the 24-cell
  lattice), and `nobleGases(mods)`, which reads the noble-gas pairs as the forces chapter does (÷1.8 … ×1). The
  critical-point rules are corresponding-states rules read off our argon (`ARGON`): estimates, labelled so.
  `atom/tools/gasnumbers.mjs` prints its numbers as JSON for `gengas.py`.
  Beside it, for the gases chapter's crystals and salts: `atom/tools/crystals.mjs` (candidate lattices by lattice sum;
  fcc must win for our noble gases), `atom/tools/salt.mjs` (closed-shell ions from the solver, Gordon–Kim between
  charged clouds, the alternating lattice by Evjen cubes; in 4D past 14 bohr the exact far field from the clouds'
  moments, since a numerical tail would diverge over 4D's r³ shells; sodium fluoride is the check; `salt.mjs bake` → **generated**
  `js/saltdata.js`, adding magnesia and nagnesium pxide with Watson-held anions and the densities, which the stars chapter's
  "What sets G" turns into G; without `bake` it prints the baked JSON),
  `js/ionic.js` (no DOM, selftest 65, mirrored): ionic crystals in a cell of any shape, any d: Ewald sums of 1/r and 4D's
  charge–cloud 1/r³ (r^(−p) split by incomplete gammas, FT_p(k) = π^(d/2)2^(d−p)k^(p−d)Γ((d−p)/2)Q((d−p)/2,k²/4α²)/Γ(p/2)),
  the r⁻⁵ cloud terms direct, salt's short-range curves tabulated and tapered to zero over the last 2 bohr, analytic
  slopes in ions and cell, and anion site potentials. `atom/tools/ionic.mjs`: `known Al2O3` (corundum relaxed: 163.2 eV
  per formula against 165.0 measured, density 3.995 against 3.987, CN 6/4), `search <Al2O3|Bl2Px3> <Z> <n> [--shard]`,
  `rerank` (each candidate's anion Watson radius from its own site potential, its shrinking paid for by `anionOwn`),
  `bake` → **generated** `js/ionicdata.js`. `tables <name> [--xs=]` (~2 min, workers) writes `tools/pib-<name>[-xNN].json`,
  the curves at every pair of anion radii for per-site breathing (`pibRelax`: R_i = 2/φ_i, each anion's squeezing paid by
  `anionOwn`); `--disp` adds dispersion (C₆ by Casimir–Polder from `response.mjs coupledAlpha` with the anion inside its
  Watson shell, `vext`; Tang–Toennies damping, β from the curve) and `--xs` scales the overlap's exchange (×0.85 fits our
  Ne₂, Ar₂, Kr₂ wells within ~10%). `ladder Al2O3 [Z] [--pib] [--disp] [--xs=]` ranks corundum, θ-alumina (`theta()`,
  half its Al tetrahedral, above corundum in hybrid DFT) and the search's best. `tools/ionref.py [RW]` (PySCF) is the
  reference: linear Al³⁺–O²⁻–Al³⁺, the oxide in a point-charge Watson shell, HF/MP2 and the frozen clouds (Heitler–London).
  `tools/crystalref.mjs Al2O3 <corundum|theta|impostor> <scale>` (runner, ~1 h each; `table` prints them) is the
  independent ranking: periodic PBE (PySCF, GTH, DZVP) on `tools/crystalref-Al2O3.json`'s three cells, scaled 0.98–1.04,
  internal coordinates held. PBE: corundum lowest, the impostor +0.15, θ +0.50 eV per formula (upper bounds, unrelaxed).
  At those same geometries (cell scaled only) the variants give θ−α / imp−α: fixed R 0.12 / −0.47; **fixed R + dispersion
  0.48 / +0.04**; PIB 0.06 / −0.48; PIB + dispersion 0.40 / +0.01; either with ×0.85 exchange ~0.1 / −0.4. So the model
  adopted is **fixed Watson radius + dispersion** (`model(name, null, { disp: true })`, `search … --disp`, cache
  `<name>-disp_<Z>`): it tracks PBE on θ and gets the impostor's sign, 0.1 eV short; relaxed it ranks corundum first by
  0.19 and 0.28, density 4150 against 3987 (4% dense), U 165.9 against 165.0 measured. Breathing and the noble gases'
  exchange scaling both make the match to PBE worse, and are kept only as diagnostics. The HF reference (`ionref.py`)
  still says the pair repulsion is too weak and a −1.3 to −2.4 eV-a-bond relaxation is missing; at fixed geometry the two
  largely cancel, which is what the PBE match measures. **Blind check passed:** `search Al2O3 2 200 --disp` finds corundum
  lowest (17 of 200 starts; bonds 3 × 1.82 + 3 × 1.97 Å, CN 6/4), then the impostor (+0.19) and θ-alumina (+0.28).
  Two 4D fixes came with it (no 3D effect): the tables' inner wall continues the whole meeting and subtracts the clouds'
  far field (`hermite(…, farCoef)`; before, 4D's −3S²/64r⁵ between anions beat the wall and ions fell together), and
  js/ionic.js switches the r⁻⁵ cloud terms off over the 2 bohr before rc with the continuum taking the rest (`tailJ`; a
  hard cut made the energy jump and stalled BFGS at |g| ~ 10⁻³). Bl₂Px₃, Z = 2, 200 starts (sandbox): lowest U 181.3 eV
  per formula, density 3.57 × 10¹³ kg/m⁴, every Bl 13-coordinated (3 + 3 + 1 + 3 + 3 at 1.93–2.09 Å), Px 8 and 9;
  next +0.36. Runner `bl2px3-search` (every command exit 0): Bl₂Px₃ Z = 4, 240 starts, finds the same structure lowest
  (52 hits) and nothing below it; Z = 3 can't hold it (best 180.40), Z = 1 tops at 178.97. Our Al₂O₃ at Z = 4 (160
  starts) finds one arrangement 0.023 eV per formula *below* corundum (density 4051, 1 hit): Al all 6-, O all 4-coordinated
  like corundum, 2 regular and 6 distorted octahedra. That's inside the model's ~0.1 eV error against PBE, so it is
  `poly6` in `crystalref-Al2O3.json` and on the runner (`crystalref.mjs Al2O3 poly6 <scale> 4`, 20 atoms, 4 threads).
  **PBE's verdict (run `al2o3-dft-poly6`, all exit 0): corundum stays lowest, poly6 +0.38 eV per formula** (best at
  ×1.02–1.04). At the same geometries the model has it −0.19: an error of 0.57 eV, where θ's was 0.02 and the impostor's
  0.11. **So the model fails the larger-cell test**: its energy function can be off by more than half an eV per formula
  between same-coordination arrangements, and Bl₂Px₃'s runner-up (0.36 eV) is inside that. The Bl₂Px₃ structure is a
  candidate, not a result; nothing from it goes into a chapter. What did work: periodic PBE on the model's candidates
  picks corundum every time ("the model proposes, a quantum method decides", the book's pair-search pattern). 4D has no
  periodic quantum code yet, which is the gap — being built: `js/pw.js` (no DOM) is plane-wave DFT in d dimensions (mixed-
  radix FFT, the Coulomb kernel 4π/G² or the pinned 4π²/G³, atom.js's local exchange without the own-share correction,
  Kleinman–Bylander projectors on d-dimensional harmonics l ≤ 2, block Davidson, Pulay + Kerker, Ewald with background),
  and `js/pseudo.js` (no DOM) norm-conserving Troullier–Martins pseudopotentials from the book's atom with L = l + (d−3)/2.
  Checked so far (scratch tests, selftest block to come): FFT against a direct transform; Gaussian wells against the
  radial solver in 3D and 4D (4D converges from above, −2.4532 at ecut 16 against −2.4565); pseudo-atoms reproduce the
  all-electron levels to 10⁻⁶ (our Ne, O; 4D element 12, pxygen); our Ne in plane waves, extrapolated over box size (an
  isolated atom's energy carries a 1/L³ Makov–Payne-type term, which crystals don't), within 1 mHa of the radial
  pseudo-atom, and s- or p-projector choices agree to 1 mHa. In 4D the ions' energy carries the cores' leak
  (Z_iS_j/8r³ and the r⁻⁵ terms, through js/ionic.js, plus two background integrals), split-independent to 10⁻⁵. **An
  isolated atom in a 4D box carries a 1/Ω artefact a hundred times ours**: the plane-wave electrostatics of the radial
  atom's own density differ from the radial integrals by −C/Ω with C = 3450 (L = 7, 8, 10 give 3448, 3451, 3460; ours 37),
  which is why the 4D element-12 check sits 0.8 Ha below the radial at L = 8 while its s–p spacing agrees (0.7556 against
  0.7531 at ecut 24). Crystals have no such term. `tools/pwcheck.mjs`: `atom …` (that check) and `crystal <file> <name>
  <scale> <ecut> [k]` (k a number, or aX / aXs for ⌈X/|a_i|⌉ Γ-centred / shifted). Corundum at Γ: ecut 30, 40, 50 give
  −102.402, −102.421, −102.424 Ha a cell (40 is within 1.3 mHa a formula), gap 5.96 eV (LDA-level; measured 8.8).
  Selftest 66 (FFT, transforms, a Gaussian well, the ions' split independence, neon's pseudo-levels), mirrored.
  Forces (`forces(states, rho)`, Hellmann–Feynman: local through ρ(G), projector phases, ions via ionic.js's slopes)
  match central differences: F₂ in ours to 10⁻⁶, a 4D element-12 pair to 10⁻⁵ Ha/bohr. `tools/pwpool.mjs` shares the
  k-points out to worker threads through shared memory (`scf({ pool })`; pwcheck's 6th argument): serial-exact to 10⁻¹²,
  3.5× on four cores. The complex Hermitian eigensolver (`hermEigen`, the real double [[A,−B],[B,A]]) once dropped a
  vector in degenerate blocks; it now takes exactly n in two passes. Pseudopotential sets in pwcheck (`PSEUDO_ARGS`):
  ours (Al rc 2.1/2.3, O 1.45), 4D (Bl 2.2/2.4 with its 12-electron core, Px 1.6), and `soft` variants of each.
  Runs: `al2o3-pw` (ecut 40, k a18s): corundum's minimum at the measured cell, −1394.353 eV per formula; poly6
  crashed on the solver bug and is rerun in `pw-poly6-bp-conv`, with Bl₂Px₃'s convergence at Γ (`crystalref-Bl2Px3.json`,
  the ionic model's eight best cells; 15 → 20 Ha moved the total 30 eV a formula, so the gap between candidates is
  what's being converged) and the soft sets on the aluminas. **`al2o3-pw` result (all exit 0 but poly6): corundum
  lowest, but θ +1.47 and the impostor +1.56 eV per formula where PBE has +0.50 and +0.15** — too far apart, and the two
  in the wrong order. Not the cells (the same corundum in a sheared cell agrees to 10⁻⁶ Ha); the pseudopotentials:
  stripping Al to Al³⁺ was 0.6 eV off all-electron (Bl to Bl³⁺ 0.46) because exchange isn't linear in the density.
  `makePseudo({ …, nlcc: true })` now keeps a partial core (Louie–Froyen–Cohen: the true core density outside the radius
  where it falls to the valence's, a + br² + cr⁴ inside) in the exchange, in pw.js's potential, energy and forces
  (AlF's forces match central differences to 5 × 10⁻⁶): Al³⁺ to 5 meV, Bl³⁺ to 22. On for Al and Bl only (O's and Px's
  1s cores barely meet their valence: 15–25 meV without it). Selftest 66 checks Al → Al³⁺ within 50 meV.
  **`al2o3-pw-nlcc` (all 16 exit 0): the core correction barely moves the ranking** — θ +1.50, impostor +1.59, poly6 +0.66
  eV per formula (from +1.47, +1.56, +0.67), and the soft set at ecut 25 agrees (+1.39, +1.57, +0.86). So it isn't the
  pseudopotentials. The excess over PBE follows the volume: −11.6 eV × V_corundum/V per formula fits poly6 and θ exactly
  and the impostor within 0.16. The electrostatics are verified exact, so that isn't a bug: a Gaussian atom in a box (3D),
  the same with a smeared ion through `forPW`'s tables, and a 4D model atom with a point nucleus, a leaking Gaussian core
  and a Gaussian valence, whose energy minus the exact lattice sum of its pair interaction is box-independent to 10⁻⁶
  (selftest 66 now). The earlier "isolated-atom 1/Ω artefact" is that lattice sum in 4D, not an error. Bessel factors past
  x = 8 now by Abramowitz–Stegun's rational forms (the 8-term asymptotic series was 10⁻⁶ off at x ≈ 12). Remaining
  suspects, queued as `xc-and-4dk`: the book's functional (exchange only, no correlation: PySCF with exchange-only LDA
  and with full LDA on the same four cells), and for Bl₂Px₃, whose two best cells sat 15 eV per formula apart at Γ
  (z2-1 − z2-0 converged in ecut by 25: +15.8 default, +15.1 soft), sampling (4 shifted k).
  **`xc-and-4dk` (all exit 0): PySCF with the book's own functional (exchange-only LDA) gives θ +0.58, impostor +0.28,
  poly6 +0.58 at ×1.00 — close to PBE — so the functional wasn't it**; Bl₂Px₃'s gap held at 4 k (+13.6). **The cause, two
  bugs in pseudo.js:** (1) `aeAtom` stopped on its eigenvalues while the far tail of the mixed density was still 6× off
  the orbitals' (at 20 bohr), and exchange (∝ ρ^(1/d)) carried that into V; the descreened ion then had a tail that
  skewed α Z (O 0.78 → 1.42, Al +0.9) — exactly a 1/V error. Now converged on the density pointwise, with V rebuilt from
  the final orbitals. (2) In 4D the ion's leaked moment used the core's ⟨r²⟩ only, but norm conservation doesn't keep
  ⟨r²⟩: S = S_core + S_val(true) − S_val(pseudo) (Px 0.264 → 0.134), else α Z grows linearly with the integral's reach.
  Both are in selftest 66 (α Z settled past 25 bohr). θ − corundum at ×1.00, ecut 30: **+0.69** (from +1.53; PySCF same
  functional +0.58, PBE +0.51). **`pw-fixed` (all exit 0): corundum lowest and the order right, but against same-functional PySCF at ×1.00 θ is
  +0.69 (PySCF +0.58, 0.11 off), the impostor +0.53 (+0.28, 0.26 off), poly6 +0.98 (+0.58, 0.40 off)**; all four cells
  still falling at ×1.04 (minimum not bracketed). That misses the agreed 0.2 eV bar on two of three, so the stop-loss
  applies: the Bl₂Px₃ candidate stays the ionic model's (density 3.57 × 10¹³ kg/m⁴) and the next step is its bands.
  Bl₂Px₃ at Γ can't rank: going from 1 to 4 k moved z2-0 by 17.8 eV per formula, and z2-0 and z2-1 sit 0.09 eV
  apart once k-sampled (the old 15 eV gap was the 4D ion-moment bug).
  **Bands** (the stop-loss's next step): `pw.bandsAt(V, ks, { nbands })` solves non-self-consistently at any k in a
  converged potential (the grid doesn't depend on k; `localR()` gives the ions' grid potential for `potential()` outside
  an scf), `pwpool.mjs bandsParallel` shares the k-points out to threads, and `pwcheck.mjs bands …` (same arguments as
  `crystal`) runs the SCF, then a path Γ → b_i/2 and → Σb/2 plus a Γ-centred grid: valence top, conduction bottom and
  where, the gap, whether direct, the DOS → `…-bands.json`. Check: the bands at Γ give back the SCF's gap to every digit
  (corundum, ecut 20, Γ: 5.5128 eV, direct). Note the earlier runs' `a18s` grids are shifted and never sample Γ, where
  corundum's gap sits. `crystalref.py` now reports PySCF's gap (whole mesh and at Γ). **Calibration (`bands-1`): our corundum at ×1.00, ecut 40, gap 6.02 eV direct at Γ (the
  valence top 0.011 eV higher at (⅛,0,0), within the band residuals: effectively direct); PySCF with the same
  functional 5.95 eV at Γ.** So the code's band gap is good to 0.06 eV; the functional (exchange-only LDA) is 2.8 eV
  under measured 8.8, the stated correction for Bl₂Px₃ (+2.8 eV, or ×1.47). Bl₂Px₃'s two cells were cut at the deadline
  with their SCFs converged and the 29-point path unfinished, nothing kept; `bands` now saves the SCF
  (`<tag>-scf.json`, the potential `<tag>-V.f64`) and each path point (`<tag>-bandk.jsonl`) as they finish, prints the
  SCF grid's band edges before the path (a line with `"stage":"scf"`), and runs a shorter path (t = ½, 1 toward each face
  and the far corner, occ + 4 bands, 100 iterations); a rerun resumes. **`bands-2` (both exit 0, path finished): Bl₂Px₃ z2-0 (soft, ecut 25, a10, 8 k): gap 3.79 eV,
  indirect, valence top at Γ, conduction bottom at (½,½,0,0), where the smallest vertical gap is 4.30; z2-1 (4 k):
  4.57 eV, direct at Γ.** With the calibration (+2.8 eV, or ×1.47) z2-0's gap is 5.6–6.6 eV (direct 6.3–7.1), z2-1's
  6.7–7.4: a wide-gap insulator either way, transparent to visible light, like corundum; the two cells disagree on
  direct against indirect. Total energies here: z2-0 lower by 0.65 eV per formula, but on unequal k-grids (8 k against
  4), so still no ranking (0.09 eV at a10s). The band edges are from the SCF grid plus a 10-point path, not a dense
  zone search.
  `atom/tools/crystalfield.mjs <ruby|bl [cell]|check>` (sandbox, seconds) is the first look at a 4D ruby: a 3d³ dopant
  on a cation site, its ligands point charges −2, and in 4D each ligand's cloud also leaks S/8|x−X|³ (S = Σ⟨r²⟩ of the
  anion in its Watson shell, 29.3 for Px²⁻). Each ligand's potential is projected exactly onto the sphere harmonics of
  degree 0, 2, 4 (all a d × d product holds) at every radius of the free ion's 3d orbital; `check` reproduces 3D's
  r_<^n/r_>^(n+1) and 4D Gauss's r_<^n/r_>^(n+2) to 6e-12. (A first version summed r^k/R^(k+1) series: in 4D every even
  k contributes, and with the leak the series grew with k instead of settling, because the C_k^(3/2) coefficients reach
  the orbital's tail past the ligand. It also had a φ-index slip in the 4D quadrature. Both are gone.) **Results,
  point-charge model:** ruby (Cr³⁺ on corundum's Al site, 3 + 3 O at 3.505/3.725 bohr) 10Dq = 0.600 eV (textbook series
  0.617) against measured ≈ 2.23 eV (from memory, unverified): the model gives 0.27 of the measured value, as point
  charges are known to (no covalency, no overlap). 4D, element 28's 3+ (3d³, ⟨r⟩ 1.19 bohr) on Bl₂Px₃: z2-0's single
  13-coordinated site (3.64–3.96 bohr): the 9 d levels spread 0.85 eV without the leak, **0.30 eV with it** (groups 5 +
  1 + 3); z2-1's 12-coordinated site 1.88 → 0.40 eV and its 14-coordinated site 0.47 → 0.43 eV. So the clouds' leak,
  which exists because the shell theorem fails, pulls the d electron toward the ligands and cancels most of the
  ligands' field: on Bluminium's high-coordinated sites the point-charge spread is half to two-thirds of ruby's (0.63). Scaling by ruby's
  shortfall (×3.7) would put the 4D splitting near 1–1.5 eV, but that factor is covalency in our world and is not
  carried over; the leak is also only its leading term (anion radius about half the ligand distance). The real test is
  a cluster Hartree–Fock dopant calculation; not built.
  `atom/tools/multiplets.mjs <check|ion D Z n|ruby|bl cell [n] [Z]|dopants cell>` (sandbox; ruby 1 s, `bl` 15 s,
  `dopants` 2.5 min) turns that field into the levels that decide a laser: every determinant of n electrons in the d
  shell's 10 (ours) or 18 (4D) spin orbitals, one M_S block, the repulsion projected exactly onto degree 0/2/4 like the
  field (Slater's F⁰, F², F⁴ in ours), spin from ⟨S²⟩, Householder + QL eigensolver. Blocks above 1600 determinants are
  refused, so 4D's 3d⁵ … 3d¹³ are not done. `check`: ours' free-ion terms equal Racah's formulas to the
  cm⁻¹ (⁴P = 15B, ²G = 4B + 3C for d³; ³P, ¹D, ¹G, ¹S for d²); in 4D the d² and d³ term degeneracies match SO(4)'s
  decomposition (d = (1,1): d² singlets 25 + 10 + 9 + 1, triplets 30 + 6). Two scales: s on the point-charge field, β on
  F², F⁴. **Ruby fixes them** (⁴T₂ at 2.23 eV, ²E at 1.786 eV, both from memory): s = 3.75, β = 0.67 (B 1167 → 785 cm⁻¹,
  free Cr³⁺ is ≈ 918 from memory); ruby then sits 25% above its crossover (s ≈ 3.0), and ²E's slope against s is 0.015
  eV against ⁴T₂'s 0.60, which is the sharp line. **The carry tested inside ours:** Ti³⁺ on the same site at ruby's s
  absorbs at 3.57 eV against ≈ 2.5 measured (Ti:sapphire, from memory): carrying s between ions is good to about ×1.4,
  because the point-charge model makes the ion's size matter too much. **4D, z2-0's 13-coordinated site, at ruby's s and
  β:** 3d³ (element 28) has no visible ruby. The free ion's terms are compressed: the first doublet sits 0.17 eV above
  the 39-fold quartet ground term, against ours' 2.2 eV. The pinned 1/r is not harmonic, so its quadrupole part is weak
  (F²/F⁰ 0.15; Gauss's 1/r² gives 0.52), and the field is weak as well. The quartets spread 0–0.24 eV and the spin-flip
  doublet sits at 0.29 eV (slope 0.027): a candidate sharp line in the mid-infrared, near 4 µm. **3d¹ (element 26), the
  Ti:sapphire analogue, is the laser-like one:** its 9 levels fall into two sets, 0 / 0.18 / 0.36 and
  1.07 / 1.75 / 2.06 eV. That is a 0.7 eV gap with broadband emission across it, about 0.5 eV if Ti's ×1.4 overshoot
  applies: a tunable near- to mid-infrared emitter pumped in the red or near-IR. The other dopants (3d², 3d⁴, 3d¹⁴–3d¹⁷)
  have everything below 0.6 eV. **The second cell, z2-1, changes the picture.** Its 12-coordinated site holds d¹ at
  0 / 0.52 / 1.16 / 1.91 / 2.56 eV, with no clean gap; its 14-coordinated site at 0 / 0.53 / 1.38–1.69 / 2.73 eV. d³'s
  spin-flip doublet sits at 0.63 eV on the 12-site (slope 0.17, not sharp) and at 0.40 eV on the 14-site (slope 0.026).
  So whether d¹ has its gap and where d³'s line sits depend on the structure, which is still unranked (`bands-2`).
  Ranking z2-0 against z2-1 now decides the laser too. **Hund's first rule fails for 4D d²:** the free 3d² ion (and 3d¹⁶, its hole mirror) has a
  spin-singlet ground term, the 10-fold (2,0)⊕(0,2), with the triplet 0.52 eV up. It holds for d³ and d⁴. This is the 4D
  shell, not the law: Gauss's 1/r² gives the same order. The F² part favours that singlet, and with F⁴ alone the triplet
  is lowest. The table's solver fills shells as a spin-polarized average and doesn't resolve terms, so its d²-like
  configurations are unaffected; any statement about their ground spin would be.
  **Hund's rule across the table (first survey, 2026-11-06).** `angular(d, l)` and `dopant(…, shell)` now take p
  shells and any subshell. Every neutral 4D p configuration, p² to p⁷ (elements 6–11), has its maximum spin lowest, as
  C, N and O do in ours, so the light elements are safe. **Every neutral 4D d² and d¹⁶ ground configuration breaks
  Hund's first rule.** On each atom's own orbital, the 10-fold singlet sits below the triplet by: element 26 (3d²)
  0.40 eV, 39 (3d¹⁶4s¹) 0.77, 54 (4d²) 0.30, 66 (4d¹⁶) 0.58, 114 (5d²) 0.36, 126 (5d¹⁶) 0.63. The table's solver gives
  them Hund spins, so their configuration energies are too high by about that much. Where the ionized electron is a d
  electron (54, 66, 114, 126) the ionization rises by roughly the same, because the ion's d¹ or d¹⁵ has no such
  singlet. Not yet checked: d⁵–d¹³ (blocks up to 15 876 determinants, which needs a sparse lowest-eigenvalue solver)
  and every f shell, elements 82–110 (needs 4D f harmonics, and degree-6 terms in the repulsion).
  **`atom/tools/hund.mjs`** (2026-11-06) does the general case:
  - **Harmonics:** degree-l harmonics on S^(D−1) for any l, built by orthogonalizing monomials on the sphere.
  - **Repulsion:** projected onto degrees 0 … 2l over each atom's own orbital.
  - **Spin:** a matrix-free Lanczos gives the lowest energy of each M_S block, dense below 400 determinants. The ground
    term's spin is the largest M whose block still reaches the overall lowest energy.
  - **Too-big blocks:** skipped and named, so the answer becomes a bound.
  - **`check`** passes: ours' Cr³⁺ d³ ⁴F, Mn²⁺ d⁵ ⁶S, Pr³⁺ f² ³H and Gd³⁺ f⁷ ⁸S; 4D element 26's singlet at 0.396 eV, as
    the dense solver gives.
  - **Commands:** `survey <D> [Z/Z/…|all] [limit]` and `one <D> <Z> <config,with,commas> <shell>`.
  - **No prior art found:** three web searches (Hund's rules in D dimensions, dimensional scaling, 4D multiplet
    structure). A citation-index search is still owed before the paper claims it.

  **The 4D survey so far (sandbox):**
  - **d² and d¹⁶ break Hund's rule:** elements 26, 39, 54 and 66, as above.
  - **Every other d filling holds:** d¹, d³–d¹², d¹⁴, d¹⁵ and d¹⁷ (3d and 4d rows complete; 3d⁹ and 4d⁹ blocks of
    15 876 run in full).
  - **f, partial:** 4f² (82) and 4f⁴ (84) hold; **4f³ (83) breaks it**, with spin ½ lowest, 0.151 eV below the quartet.
  - **The f block (`hund-f`, run 75):** 4f²⁹ (108) breaks the rule too, with spin ½, 0.261 eV below the quartet:
    the mirror of 4f³. Every other f filling holds. All spin blocks ran for f², f⁴, f⁵, f²⁸ and f³⁰; for f⁶–f²⁵ only the
    highest two or three spins ran (the lower blocks hold 10⁶–10⁸ determinants), so those are bounds. 102 and 106 were
    cut. **In 4D the rule breaks two from either end of the d shell and three from either end of the f shell.**
  **`atom/tools/termtable.mjs <Z/Z/…> [D]`, the term-corrected table:**
  - **Search:** an element's configurations searched as the bake does (`ground()`, the same solver), with the
    neighbours' configurations ±1 and ±2 electrons as extra seeds, as the repair pass makes them.
  - **`ground({ collect })`:** new; hands back every settled candidate. Without it `ground()` behaves as before.
  - **Correction:** each candidate gets its open d and f shells' Hund correction (lowest term − lowest max-spin term,
    `groundSpin()` on its own orbitals). Fillings whose biggest block exceeds `TERM_LIMIT` (3000) take the survey's
    verdict and are flagged `assumed`.
  - **Output:** both rankings and both first ionizations, so a change from the wider search is told apart from one
    from the terms.
  - **Element 26:** same configuration (3d²4s², one of 63 settled candidates, none within 1 eV once corrected),
    E −0.396 eV, ionization 7.457 → 7.440 eV (the ion keeps the d² singlet).
  - **Queued:** every d- and f-block element (23–42, 51–70, 79–130), in the runner's `hund-f-and-terms`.
  - **The plan for paper 1:** the term-corrected table becomes the main result; the Hund-spin table moves to the
    supplement.
  - **Result (runner `hund-f-and-terms`, all 32 commands exit 0, collected by `papers/p1/termtable-collect.mjs` into
    `data/termtable.json`):** the terms change **no** ground configuration. They lower the eight Hund-breaking atoms'
    energies and move eight ionizations in pairs by 0.30–0.67 eV: up for 54, 66, 114 and 126; down for 55, 67, 115 and
    127, whose ions land on the broken filling. The wider search found one bake miss, element 82: 4f¹ 5d¹ 6s² (our
    cerium's kind), 0.363 eV below 4f² 6s², ionization 7.03 → 7.39 eV. **Paper 1's main table is now the corrected one**
    (`build.mjs` overlays it; supplement S1 is `data/table4-hundspin.*`; claim `termtable`). `js/table.js` and the site's
    table chapter still show the bake: to do.
  - **The full term correction, tested and rejected (2026-11-06).** `TERM_MODE=full` corrects each candidate by its
    whole term structure: lowest term − the average of the max-spin determinants (`maxSpinAverage()`, closed form,
    checked against brute force). On ours (5–36) it gets **26/32** configurations right against the bake's 28, fixes
    none of Ti, V, Co, Ni, and breaks Sc and Fe. The 4s→3d promotion energies against measured ones show why. The solver
    is too cheap for d in every 3d atom, by 0.35–1.70 eV (mean 1.06), from local exchange without correlation, and the
    full correction leaves the mean at 1.07. **So paper 1 corrects only Hund's first rule** and states the bias. 11 of the
    92 4D d/f elements have a fewer-d competitor within 1 eV, flagged in appendix H.4 (`data/promotion3.json`,
    `promotion-collect.mjs`, claim `promotion`).
  - **Ions (`termtable.mjs <Z/…> <D> <q>`, 2026-11-06).** A charge argument searches each cation (q = +1) or anion
    (q = −1) for its own ground configuration. `ground({ nelec })` is new: an ion's electron count, nucleus unchanged.
    The seeds are the neutral configurations within two electrons, moved to the ion's count. Ion candidates count only
    if every occupied orbital is bound and E > E_neutral − 1 Ha, because an anion's extra electron in a subshell with no
    bound level otherwise "settles" on nonsense (orbital energy 0, totals thousands of hartree low). Sandbox checks: 26⁺
    is 3d² 4s¹ and keeps its singlet; 9⁻ (2p⁶) is bound by about 0.8 eV; H⁻ and 12⁻ are not. H⁻ *is* bound in ours (0.75
    eV), so the anion method is checked on ours first. Queued as `ions-1`: both charges, both worlds.
    **Result (`ions-1`, 350 searches, exit 0; `papers/p1/ions-collect.mjs` → `data/ions.json`):**
    - **Ours:** the cation search changes no ionization. Anions: 7 of 7 unbound right, every p-block acceptor bound
      (C 1.32/1.26, Si 1.30/1.39, Ge 1.25/1.23, F 2.80/3.40 eV). It fails for H⁻ (−0.33 against 0.75), the alkalis, P and
      As, where correlation binds. Trust a 4D affinity above about 0.7 eV.
    - **4D:** 128's 29.56 eV survives. Seven ions rearrange (36, 93–95, 103–105, up to −1.29 eV), folded into
      `termtable.json` by `termtable-collect.mjs` and so into the paper, the figures and the site.
    - **p⁷ affinities rise down the group:** 3.4, 5.7, 7.8, 10.3, 12.9 eV, against ours near 3.4 throughout.
    - **Noble gases:** 2, 12 and 22 don't hold an extra electron; 50, 78 and 138 come out barely bound, too little to
      call.
    - Claims `ions3`, `ions4` and `halogens4`; the paper's appendix E.4, §4.2 and §6.4.
    - **+2 and +3 (`ions-23`, 2026-11-08, 342 ions, all settled):** `ions-collect.mjs` now keeps every charge's
      configuration, corrected E and SCF E (`ions[q]`) and the 2nd/3rd ionizations. Against NIST (fetched:
      `papers/p1/data/nist-ie.json`, H–Kr; `IE_REAL` agrees with it to 0.01 eV) ours' 2nd and 3rd are off a median 2.0 %
      and 1.4 %, the 1st 4.3 %. 4D's 3d-row ions lose s before d as ours do; the first halves of the 4d and 5d blocks
      (and 81–82) lose a d electron first at +1/+2, as our Y⁺ and Lu⁺. Claim `ions23`, appendix E.4. The table page's ions:
      `profiles.mjs bake <q>` → `table/profiles-p1/p2/p3/m1.json` (anions only where bound), checked by selftest 70.
  - **The site shows the corrected table (2026-11-06).** **Generated** `js/terms.js` (`tools/terms.mjs bake`, from
    paper 1's `data/termtable.json`; element 82 re-solved for its orbitals and density) is laid over the bake by
    `js/tablec.js`. **Pages import the table from `tablec.js`, never `table.js`** (main.js, shapes.js, table/viewer.js,
    start/start.js, fields/fields.js). `table.js` stays the bake, which is the paper's supplement S1 (`HUNDSPIN`).
    Selftest 69 checks the overlay against `termtable.json`. Rerun `terms.mjs bake` after `termtable-collect.mjs`. The
    paper's figures lay the same data over the bake (`figures/make.mjs`). The table chapter gains a section, `#hund`,
    and its landing card a bullet. All of this stands on point charges ×
  a factor carried from ruby.
  **The Hund explainer, `atom/hund.html`** (`js/hundpage.js`; linked from the landing and from paper 1 §5.2) has five
  parts:
  - orbitals as boxes, with each filling's verdict from the survey;
  - the d orbitals on the sphere, and on slices of the 3-sphere;
  - each d² term's separation-angle distribution: P(γ) from a₂ and a₄ alone, exact;
  - the level ladder against F⁴/F², with real atoms marked;
  - the survey across the table.

  It is computed live from `bluminiumdata.js`'s angular tensors and `js/multiplet.js`, and fetches
  `papers/p1/data/hund.json` and `hund-law.json`. The key fact, also ledgered as `hundcrit`: E(term) = F⁰ + a₂F² + a₄F⁴
  with a_n = ⟨C_n(cos γ)⟩ over the term. In 4D the ten-state singlet (2,0)⊕(0,2) has ⟨cos²γ⟩ = 1/8, against the best
  triplet's 0.19, and it is lowest whenever F⁴/F² < 5/3. In ours ³F is lowest for every F⁴/F².
  **The Bluminium viewer, `atom/bluminium.html`** (off the chapter nav, linked from the landing's "made" line and
  its open questions): `js/bluminium.js` draws both Bl₂Px₃ cells and each cation site's coordination in `tile.js`
  tiles. It tabulates the energies and gaps from hand-kept `tools/bluminium-results.json` (update it from the
  runner's logs, then rebake), and runs the dopant playground: site, ion (4D 3d¹–3d⁴ and 3d¹⁴–3d¹⁷; ours
  Ti/V/Cr/Mn³⁺ on corundum), the leak on or off, sliders on s and β. That gives the level diagram, a verdict (sharp
  spin-flip line, broad band, or a two-set gap) and the scan against s. **Generated** `js/bluminiumdata.js`
  (`tools/bluminium.mjs bake`, about 1 min, 112 kB) holds the cells, the field matrices, F⁰/F²/F⁴, the angular tensors
  and ruby's fitted s and β. The page solves live in `js/multipletworker.js` with `js/multiplet.js` (no DOM), which
  `tools/multiplets.mjs` now imports too. `levels()` takes eigenvalues only and gets spin by counting each level's
  copies across M_S blocks (identical to the ⟨S²⟩ route, `levelsByVectors`, on all 60 cases tried; 4–5× faster: 4D d³
  in 40 ms, d⁴ about 3.5 s). Selftest 68 checks that agreement, the free 4D d² singlet, and ruby at the baked s, β.
  **`atom/tools/laser.mjs <ti | bl [cell] [s]>`, can a d¹ ion lase (2026-11-06).** It moves past level positions to the
  numbers that decide a broadband laser.
  - **The field** is crystalfield.mjs's projection, rebuilt for any ligand positions from radial tables v_n(R) and a
    small exact sphere rule. It leaves out n = 0: the d electron's spherical pull is already in the ionic model through
    the dopant's net charge. A first version kept it and the cage "relaxed" by 14 bohr.
  - **The cage's stiffness** is the ionic model's Hessian in the ligands' coordinates, everything else held, in a
    supercell where the ligands are distinct ions (ours 2×2×1, 120 ions; 4D 3×3×2×2, 360 ions, about 70 s).
  - **Relaxation:** each state (the ground; the lowest level of the upper set) minimizes s·λ_k(X) + ½XᵀKX, Jahn–Teller
    included. That gives absorption, emission, the zero-phonon line, Stokes shift, Huang–Rhys and widths (T = 0), the
    host's highest Γ phonon, the gap in phonons, and Dexter–Klick–Russell's Λ = Stokes/(2·absorption), quenched past
    about ¼.
  - **The check, Ti:sapphire, only 10Dq fitted** (s = 2.52; measured values from memory): absorption 2.77 (≈ 2.5),
    emission 1.84 (≈ 1.57), **Stokes 0.94 (≈ 0.93)**, zero-phonon line 2.07 (≈ 2.0), emission width 0.24 (≈ 0.35),
    Λ 0.17. The ionic model's highest sapphire phonon is 0.16 eV against ≈ 0.11, too stiff by about 45 %.
  - **4D d¹ (element 26's 3+) at Ti:sapphire's s:**
    - z2-0's 13-site: absorption 1.24, emission 0.65 eV (1.9 µm), zero-phonon line 0.94, width 0.41, only **5.1 phonons
      in the gap, Λ 0.24: marginal, at the quenching edge**.
    - z2-1's 12-site: absorption 1.66, emission 1.28 eV (970 nm), zero-phonon line 1.52, width 0.39, **9.3 phonons,
      Λ 0.12: a robust broadband near-IR emitter**, like Ti:sapphire.
    - At ruby's s (3.75), z2-0 gives emission 0.94, 8.9 phonons, Λ 0.27.
  - **So the 4D Ti:sapphire hangs on the structure again:** z2-0, the one favoured by 0.40 eV, is the marginal host.
    Still missing: an ab initio field (embedded cluster or a doped plane-wave supercell) to replace s, the radiative
    rate (odd-parity mixing; a 13-coordinated site has no inversion centre), and excited-state absorption.
  `atom/tools/pwrelax.mjs <structures.json> <name> <scale> <ecut> <k> [threads] [soft] [fmax] [steps]` relaxes the ions
  in a fixed cell: plane-wave SCF (warm-started from the last step's density, `scf({ rho0 })`), Hellmann–Feynman forces
  (the pool's projector share included), and BFGS in Cartesian coordinates with the mean force removed. Steps are capped
  at 0.2 bohr an atom, and an uphill step is halved back. It is resumable after every step (`<tag>-relax.json`,
  `-relax-rho.f64`) and ends with `<tag>-relaxed.json`, a crystalref-style structure. k accepts an explicit
  `2x2x1x2[s]`, so both Bl₂Px₃ cells get the same grid (a10 gave z2-0 8 k against z2-1's 4, because their 4th axes are 9.51
  against 10.09 bohr). There is no stress, so volume comes from relaxing at several scales and fitting E(V); the cell's shape stays the
  ionic model's. Checked before queueing: in 4D (z2-0, ecut 8, 2 k) the pool's forces equal the serial ones to 2 × 10⁻⁸ Ha/bohr and a
  central difference of the energy to 1.4 × 10⁻⁶ (the largest force 0.07); our corundum at ×0.97 (ecut 12, Γ) relaxes
  in 4 steps to fmax 4 × 10⁻⁵, the energy falling at every step, and a cut run resumes from its saved state. Run `relax-1` (queued): both cells relaxed at ×0.97, 1.00, 1.03, ecut 25 soft, 2×2×1×2 shifted (4 k).
  Alongside it, unrelaxed single points at a14 (3×3×2×2 for both) Γ-centred and shifted, because a10 against a10s moved
  the cells' difference 0.56 eV per formula. **Decision rule, fixed before the results:** the cells rank only if the
  relaxed difference beats 0.4 eV per formula (`pw-fixed`'s worst miss against PySCF in ours) plus however far the
  k-ladder still moves it; otherwise they stay unranked and both stay in play.
  **`relax-1` (exit 0 where finished; the rest cut at the deadline with their state saved):** a step costs 70–100 min
  (the warm start barely helps; the first SCF iteration's 40 band sweeps dominate). The first step overshot and went
  uphill in five of six runs, so K0 is now 0.6. z2-0 ×1.03 relaxed in 5 steps (−1969.150 → −1969.194 eV a formula,
  fmax 1.9 × 10⁻⁴); the rest after 3–4 steps (eV a formula, fmax): z2-0 ×0.97 −1966.213 (0.018), ×1.00 −1968.457
  (0.008); z2-1 ×0.97 −1966.167 (0.039), ×1.00 −1968.360 (0.015), ×1.03 −1969.038 (0.004). So far z2-0 is lower by
  0.05 / 0.10 / 0.16 eV at ×0.97 / 1.00 / 1.03, under the 0.4 bar: **unranked, as the rule says.** The energy is still
  falling at ×1.03 (0.74 eV a formula below ×1.00), so the minimum isn't bracketed. k-ladder: z2-0 at ×1.00 unrelaxed
  gives −1968.042 (a14, 20 k), −1968.164 (a14s, 18 k) and −1968.389 (2×2×1×2s, 4 k). The absolute energy is still
  moving 0.1–0.3 eV with sampling, and the SCF-grid gap moves with it (a14 5.02, a14s 5.44 eV; a10 3.79). z2-1's
  single points were cut just short, so the crystal SCF now saves its mixed density every 2 min (`scf({ onIter })`)
  and warm-starts on a rerun (corundum: 16 iterations cold, 2 warm). **`relax-2` (queued):** resumes the five
  unfinished relaxations, adds ×1.06 and ×1.09 for both cells, and reruns z2-1's a14 and a14s.
  **`relax-2` (exit 0 where finished; the rest cut with state saved):** relaxed (eV a formula, 4 k): z2-0 ×0.97
  −1966.2285, ×1.00 −1968.4605, ×1.03 −1969.1942 (all converged), ×1.06 −1968.838 and ×1.09 −1967.726 (2–3 steps);
  z2-1 ×0.97 −1966.210 and ×1.03 −1969.0385 (converged), ×1.00 −1968.368 (fmax 1.1 × 10⁻³), ×1.06 −1968.641 and ×1.09
  −1967.470 (2 steps). **The minimum is bracketed:** quadratic and cubic fits in V put both cells near ×1.033 (z2-0
  −1969.22 to −1969.23, z2-1 −1969.05 to −1969.08), so z2-0 is lower by 0.16 eV there at 4 k. The difference grows with
  volume (+0.02, +0.09, +0.16, +0.20, +0.26 from ×0.97 to ×1.09). **k-ladder:** z2-1 unrelaxed ×1.00 gives −1967.649
  (a14) and −1967.761 (a14s), so z2-1 − z2-0 is +0.11 at 4 k, +0.393 at a14 and +0.403 at a14s. The two dense grids
  agree on the difference to 0.01, so it is converged there, and 4 k understates it by 0.29. **Verdict under the rule:**
  the estimate at the relaxed minimum is 0.16 + 0.29 ≈ 0.45, past the 0.41 bar (0.4 + the ladder's 0.01) but by
  adding two measurements made at different geometries. So it is not ranked yet; z2-0 is favoured. The relaxed
  structures are now `tools/crystalref-Bl2Px3-relaxed.json` (keys `z2-0-x097` … `z2-1-x103`; z2-1 ×1.00 isn't
  converged yet). **`relax-3` (queued):** a14 and a14s single points on both cells' relaxed ×1.03, the direct
  measurement, and the five unfinished relaxations. The SCF grid's gaps at a14/a14s (z2-0 5.02/5.44, z2-1 4.62/4.45)
  miss z2-0's conduction minimum at (½,½,0,0), which 3-point axes don't sample. `bands-2`'s 3.79 eV stands.
  **`relax-3` (all relaxations exit 0 and converged):** z2-0 ×1.06 −1968.8499 and ×1.09 −1967.7268; z2-1 ×1.00
  −1968.3682, ×1.06 −1968.6443 and ×1.09 −1967.4795 (eV a formula, 4 k, fmax < 10⁻³). E(V) through all five points
  (cubic rms 0.02, quartic exact): minima at ×1.034 (z2-0) and ×1.032 (z2-1). 4 k difference by scale: +0.02, +0.09,
  +0.16, +0.21, +0.25. **The direct measurement, a14 on the relaxed ×1.03 structures:** z2-0 −1968.8426, z2-1
  −1968.4468, so **+0.396 eV a formula, just under the 0.41 bar. Unranked by the rule fixed in advance; z2-0 favoured.**
  The relaxed-k difference matches the unrelaxed one (0.393 at a14), so relaxation and sampling barely interact. The
  a14s twins were cut at the deadline with their densities saved, and `relax-4` finishes them for the second grid.
  The a14 SCF-grid gaps on the relaxed cells: z2-0 4.78, z2-1 3.61 eV (grid only; a path would be lower). All ten
  relaxed structures are in `tools/crystalref-Bl2Px3-relaxed.json`. What could settle the ranking: the code's
  accuracy, not more sampling. The 0.4 eV bar is `pw-fixed`'s worst miss against PySCF on the aluminas, so a harder
  pseudopotential set and a higher cutoff on these two relaxed cells is the next lever.
  **`relax-4` (both exit 0):** a14s on the relaxed ×1.03 cells: z2-0 −1968.9569, z2-1 −1968.5602, so **+0.397**
  against a14's +0.396. The grids agree to 0.001, so the bar is 0.401 and the measurement sits just under it.
  **Final under the rule: unranked, z2-0 favoured by 0.40 eV a formula.** Sampling, relaxation and volume are all
  converged; only the method's accuracy (pseudopotentials, cutoff, functional) or the cell's shape could move it.
  Carried forward as z2-0, tentatively.
  `atom/tools/air.mjs` (`mol`: H₂ in both worlds; `pair <He|H2> <d>`: MP2 pair scans, counterpoise, H₂ over four orientations
  weighted (1, 2(d−1), …)/d² by how a rod lies; `bake` → **generated** `js/airdata.js`; cache `$TMPDIR/atom4-air`),
  `atom/tools/ions.mjs` (ionization and affinity for Bl₂Px₃), and `atom/tools/coexist.mjs` (Gibbs-ensemble
  liquid–vapour runs, one temperature per command, for the runner; `coexist.mjs bake` fits each system's critical
  point, both exponents, into **generated** `js/coexist.js`). `atom/tools/audit.mjs bake` writes **generated**
  `js/audit.js` (the search chapter's probe results). Both bakes read the runner's caches: `git archive origin/atom4-data tmp`
  into a directory and point `TMPDIR` at it.
  `js/stars.js` (no DOM) is the stars chapter, stars under three laws of gravity (Newton, 4D Gauss 1/r², 4D pinned 1/r):
  the self-consistent polytrope on each law's shell kernel (checked against Lane–Emden), the virial bookkeeping
  E = W(1 − k/d(γ − 1)), the share of the pull from outside each radius (zero with a shell theorem), and WKB
  tunnelling with Langer's term (the 4D s-wave's built-in barrier) for ignition. `atom/tools/stars.mjs` bakes
  **generated** `js/starsdata.js` (~30 s). Gravity's pin and the weak force are recorded as choices, not taken.
  `js/geometry.js` (no DOM) is the geometry chapter, the book's first: spheres' areas and volumes in any d (so a
  point's spread thins as 1/r^(d−1)), corners and skins, the angle between random directions, kissing numbers and D_d
  packings, flats in general position, planes of turning, Hopf's circles (the flow v = Jx combs the 3-sphere), points in
  thin shells, Pólya's return chances (Montroll's integral, and seeded walks), a tesseract's slices, and the Clifford torus.
  `js/geomviz.js` draws its toys (a cube and tesseract to turn and slice, an equal double rotation, a tesseract
  passing through corner first and cube first, the Hopf circles and the Clifford torus stereographically projected).
  Selftests 37 and 38 check it against sampling, counting and known values.
  `js/orbits.js` (no DOM) is the planetary-systems chapter's orbits (and the gravity chapter's nudge): a leapfrog n-body for a 1/r^k pull in any dimension, an orbit's
  eccentricity and plane, the principal angles between two planes, a round star's outside potential from its shells
  (pinned 4D: −1/r + ⟨r²⟩/8r³) and the precession that causes, and two planets in one plane or turned apart (two kinds of tilt), a moon round a planet
  in any plane (`moonRun`), and starlight on a planet (`absorbShare`, `planetT`: T ∝ r^(−(d−1)/(d+1))).
  `js/tides.js` (no DOM) is the planets chapter's tides: the constant time-lag bulge (Mignard, Hut) for a spin Ω in any
  number of planes (torque = (3λM²/r⁶)(ŝ·r̂)(ŝ∧r̂), ŝ = e^(ΩΔt) r̂(t − Δt); a round planet's L = −2I₀Ω), `spinDown` under a
  circular orbit, `starAngle` (sunlight at a surface point), and `springPlanet`, a simplex of masses on damped springs
  orbiting as point masses, the independent check. Result: the orbit plane's spin locks, mixed parts die, the completely
  orthogonal plane's spin is untouched (exactly), and on a locked planet the star never moves in the sky.
  `atom/tools/tidenumbers.mjs` gives the chapter its numbers. Selftest 50.
  `js/nuclear.js` (no DOM) is nuclei in any d, for the abundance question (which elements stars make, hence what
  planets are made of): Malfliet–Tjon's nucleon force with its attraction scaled by s (s = 1 ours; pinned, so the same
  function of distance in both worlds), radial bound states by Sturm bisection, the window of strengths where the
  deuteron binds and the diproton doesn't (ours 0.856–1.045, 4D 1.229–1.499: 4D's s-wave barrier unbinds our force's
  deuteron), a Woods–Saxon shell model with 4D's spin–orbit (2 s·J_L, declared), a uniform ball's Coulomb factor, and
  `fixedNode`, diffusion Monte Carlo with four species (exact up to helium-4, checked on our −31.36 MeV; past A = 4 it
  fails our own ⁶He and ⁸Be both ways, so it's used for A ≤ 4 only). `js/gscale.js` (no DOM) is what sets G:
  Chandrasekhar's mass in d dims from the index-d polytrope (ours 1.44 M☉; pinned 4D closes too, N_Ch = 1.52 α_G^(−4/3)),
  the Earth-like planet's G for a rock density (v² = 2gR in any d, so Earth's radius: G ρ₄ = 2g/π²R², ≈ 3 × 10⁻¹⁷ G),
  and the smallest air-holding planet and the dark-star size at any G. `js/dirac.js` (no DOM) is how far a table can go:
  the innermost Dirac level in d dims (κ = −(d − 1)/2), exact round a point nucleus (Zα = 3/2 fails: 205 in 4D), diving at
  Z ≈ 170 ours (the check) and ≈ 230 in 4D with a nucleus of 4–5 fm. `nuclear.js` also has `matter`: nuclear matter by
  Brueckner–Hartree–Fock in any d (Serber's Malfliet–Tjon; a three-nucleon repulsion, the same function of distance in both
  worlds, its strength `THREE_C` fitted to our −16 MeV, its range b the uncertainty), and `atom/tools/nuclei.mjs` runs the
  fit, the matter scans and the light nuclei (`he4 <d> <s> <b|none> [A]`, on the runner) and bakes **generated**
  `js/nucleidata.js` (cache `$TMPDIR/atom4-nuclei`). A second force, Minnesota's Gaussians (`MN`; every `nuclei.mjs`
  command takes `MN` as a last word), checks nothing hangs on Malfliet–Tjon's shape; light nuclei past helium are helium-4
  clusters (`alphaPair`, `alphaNucleon`: folded force, Saito's orthogonality by Kukulin's pseudopotential, one factor
  calibrated on our ⁸Be or ⁵He; `nuclei.mjs cluster`). The nuclei chapter (`atom/tools/pages/gennuclei.py`) and the stars
  chapter's "What sets G" read it. Selftest 51. `nuclear.js` also carries the helium-4 ladder (a local pair potential by
  Baye's supersymmetric removal of the Pauli-forbidden states, its tail by the Riccati equation; `alphaDMC` for N bosons)
  and the first capture (`alphaCapture`: E2 light through the lens vacuum, where ℓ cancels; `nuclei.mjs capture`).
  `js/brink.js` (no DOM) is the same clusters microscopically: Brink's antisymmetrized determinants of Gaussian helium-4s
  in any d, Minnesota's force (its exchange mixture u set on our ⁸Be) plus the three-nucleon force with full exchange,
  Hill–Wheeler over random placements, and ⁸Be's 0⁺ and 2⁺ by angle projection (`nuclei.mjs brink <d> <s> <b> <N>`, on
  the runner). It brackets the cluster ladder from the other side: on ours it overbinds oxygen where the ladder
  underbinds it. Selftest 52.
  `js/bbn.js` (no DOM) is the universe's first minutes as the standard first estimate in any d: photons and baryons,
  neutron freeze-out and decay, the deuterium bottleneck by Saha, then `nucleonCapture` (a proton or neutron onto
  helium-4 by E1, in `nuclear.js`) and the helium-4 pair's E2 capture integrated as the universe cools, using helium up.
  The weak force (ours), η and the clock t₁ (1 MeV/T)^((d+1)/2) are parameters; `nuclei.mjs capture` writes the σv tables
  and `bake` the grid. Ours as the check (Y 0.235). Selftest 53. Mass 5 comes from `brink.js`'s `kernelSpecies` /
  `nucleonAlpha` (one nucleon outside a helium-4, each nucleon's spin and isospin followed; `nuclei.mjs mass5 <d> <s> <b>`):
  unbound in ours (the check) and in 4D except at the window's top; `capture` resets the folded potential to that binding,
  or drops nucleon capture where it's unbound. No spin–orbit force in it.
  `js/burning.js` (no DOM) is how far stars build: a core's highest central temperature against its mass in any d (the gas
  polytrope's centre, ions as a hot gas, Fermi–Dirac electrons relativistic and partly degenerate, maximized over radius;
  masses × the Chandrasekhar mass, so G drops out). `nuclei.mjs burning` (~5 min) sets it against each stage's temperature
  (ours as the check: 0.08, 0.29, 0.73 × M_Ch for H, He, C against 0.056, 0.22, 0.74). Selftest 54.
  The rungs past beryllium-8 are `nuclear.js`'s `foldCore` / `rungFactor` / `rungCapture` (a helium-4 onto k helium-4s by
  E2: the pair's deep potential folded over the core, one depth per rung set on its capture energy from the ladder and
  Brink, Wildermuth's rule for the forbidden states; `nuclei.mjs rungcap [MN]`, ~10 min). Our ¹²C(α,γ)¹⁶O E2 to the ground
  state is the check (12–41 keV b against 45–70); `burning` uses the computed rungs where they exist.
  The road to a 4D Earth (`atom/ROADMAP.md`, on the landing) starts with odd against even: `brink.js`'s `kernelBlocks` (the
  species kernel factored by species, two-body) and `nucleonOnCoreGrid` (a nucleon on a grid round fixed core placements,
  against the same placements alone) give a nucleon's separation energy from a ladder nucleus; `nuclei.mjs plusone <d> <s>
  <k> <Z> [dirs]`, on the runner. Ours as the check: carbon-13 and nitrogen-13 bound, about 1.3 MeV too tightly.
  `nuclear.js`'s `coreNucleonFactor` / `coreNucleonCapture` (a nucleon on k helium-4s by E1, depth set to that binding) and
  `nuclei.mjs protonflow MN` compare proton against helium-4 capture onto ladder nuclei (ours: ¹²C(p,γ)¹³N the check).
  `plusone ... compact` draws the core's helium-4s close (the closed-shell limit: our ¹⁷O/¹⁷F within a MeV; files end
  `-c.json`), and loose against close is the stated spread. `nuclei.mjs hburn` (sandbox, ~5 min) runs `burning.js`'s `burnNetwork`, a zone burning hydrogen and helium
  together at each temperature, every rate a ratio to proton + proton's (density drops out); `protonflow compact MN` gives
  it the close-draw capture tables. Result: zones above ~10 MK burn wholly to the element where the climb stops; a Sun-pace
  core makes element 9 or pxygen, decided by proton + proton's nuclear size (ROADMAP step 2).
  `nuclei.mjs giveback` (seconds) averages hburn's zones over the lifetimes of stars that finish before a Sun-like one
  forms (declared mass function, lifetime slope, range): gluorine, oeon and pxygen lead, pxygen ahead of oitrogen in every
  case (ROADMAP step 3). `nuclei.mjs heavy` (minutes, `massFor` is slow): the ash fusing pairwise needs cores at M_Ch,
  ends as elements 13–23 (the rock row); equilibrium ends at the drop's N = Z peak, element 103–137 (step 4).
  `nuclei.mjs runaway` (a minute): at ignition the core's degeneracy and binding per nucleon (ours: carbon, the check) and
  each stage's energy per nucleon; the nuclei chapter's heavy section and the stars chapter's "What 4D stars burn to" read it.
  `nuclei.mjs explode` (minutes): how far an exploding core burns, iron / rock row / unburnt by core mass, calibrated on our
  white dwarfs (full density → nickel, Arnett; spread 30–100× → the observed split).
  `nuclei.mjs starmix` (seconds; reads `js/mainseqdata.js`): steps 2–3 from the computed main sequence, per G and proton size:
  a Sun-long star's core, what stars finishing within 5–20 Gyr give back, and the Eddington-limit star's life.
  `nuclei.mjs cores` (seconds): which stars explode at each G from the main sequence's stirred cores (`mainseq.js`
  `convectiveCore`; growth ×1–2, winds 3–30% declared), when the first does, and the iron / rock row / ash shares.
  `js/mainseq.js` (no DOM) is the main sequence in any d: shooting from centre and surface to a fitting mass (Newton on
  ln P_c, ln T_c, ln R, ln L), Fermi–Dirac electrons (burning.js, tabulated), light u/d, convection at ∇_ad = 2/(d+2), the
  photosphere at τ = 2/3, our opacity (scattering + Kramers) and 4D's (electron scattering through the lens vacuum,
  σ = (3π³/4) r_e² c/ω, so κ ∝ 1/T; and free–free, `kappaFF4`: classical passes, no Gaunt logarithm in 4D, Kirchhoff,
  Rosseland with scattering from a one-dimensional table; ×0.5–2 the band, since the same reasoning gives half of Kramers' on ours), and pinned-4D gravity from the whole profile as
  f(m) = g r²/(G m) (`pinnedF`; `toPinned` blends to it from g = G m/r², `nextPinned` carries it along a sequence).
  `atom/tools/mainseq.mjs` (`ours` the check: our zero-age sequence 0.5–30 M☉; `run <G> <rnp> [ff]`, on the runner: 4D from
  0.13 to 5 M_Ch at G × ours; `bake` → **generated** `js/mainseqdata.js`, with each star's life, where a 288 K planet sits
  and its year). Cache `$TMPDIR/atom4-mainseq`. Selftest 56.
  `js/gibbs.js` (no DOM) is liquid against vapour for rigid molecules in any d: Gibbs-ensemble Monte Carlo (two boxes
  trading volume and molecules), Ewald per box (real space to L/2, α = 2.6/rc, |nᵢ| ≤ 6, the structure factor updated
  move by move), the short-range tail past rc as a uniform fluid's. Selftest 57 (its energy is md.js's Ewald on NIST's
  SPC/E configuration). `group: true` cuts the short-range terms by molecule (first sites' distance, every site pair at
  that image) instead of by site: on for `pg4`, whose 4D charge–cloud terms q c/r³ (md.js `{ttr:[n, B, C, k]}`, a
  Tang–Toennies-damped C/r^k; `tools/molff.mjs termsOf` now emits them in its pairs) only cancel molecule by molecule.
  Selftest 61. `atom/tools/liquid.mjs`: `run <spce|w3|x4|w3L|x4L> <T>` one temperature on the runner
  (resumable; `--seed=S` for independent repeats, the liquid taken block-wise); `probe <w3|x4|n4> <round>` pairs from the field's own liquid, Hartree–Fock on each, the field's error before
  a refit sees them, then the refit (**generated** `js/liquidff.js`, every probe pair kept); `check <model>` a damped
  shifted force against Ewald (3D: 0.34 kcal/mol a molecule; 4D: 42, because the pinned 1/r charges a polarization wave
  as 1/k, so 4D liquids need the full sum); `bake` → **generated** `js/liquiddata.js` (critical point, vapour line,
  boiling point by corresponding states, Xater calibrated by our water). Cache `$TMPDIR/atom4-liquid`. First finding:
  the book's Xater field matches Hartree–Fock on its liquid's close pairs (sum within 1%), and its liquid is far denser
  than the pair's spacing suggests, but half its cohesion is the fitted 1/r⁶ term past 9 bohr, which nothing tested.
  **What's computed in a sandbox lives only in the cache and the bake**: if `$TMPDIR/atom4-nuclei` is lost (a container
  restart wipes /tmp), `nuclei.mjs restore` writes it back from `js/nucleidata.js` (a bake from it reproduces the file
  byte for byte); then add the runner's files from atom4-data.
  `atom/tools/stability.mjs` maps two planets' stability over orbit ratio, plane angle and mass on the runner, and
  bakes **generated** `js/stabilitydata.js`.
  `atom/tools/orbits.mjs` bakes **generated** `js/orbitsdata.js` (~30 s).
  `js/nebula.js` (no DOM) is the planetary-systems chapter's formation: a rotating cloud of gas falling onto a star (1/r², so
  Newton in 3D and pinned in 4D: only the dimension differs) with pairwise collisions that keep momentum and spin
  exactly, its shape (flatness: the two smallest extents over the two largest), how each orbit's two halves of turning
  line up with the cloud's, a turning's two rates from its invariants, and the ratio of rates a random spin has.
  `atom/tools/nebula.mjs` runs one cloud resumably on the runner and bakes **generated** `js/nebuladata.js` (each
  run's shape over time, and 500 particles of the shown runs' end states); the planets page loads it on demand.
  `js/nebulaviz.js` shows those end states orbiting live in the shared viewer. Selftest 40.
  `js/clusterlive.js` (no DOM) is the search chapter's live five-molecule search: start s is built exactly as
  `tools/clusters.mjs` builds it, so it follows the runner's start s to the same minimum, and the page names each
  minimum from the runner's list (nearest in energy; selftest 39 checks two starts). `js/search.js`'s
  `buildClusters` shows it in the shared viewer, a tab per world.
  `js/crystal.js` (no DOM) is molecular crystals in any d: rigid molecules in a cell of any shape (lower-triangular
  rows), the lattice energy (Ewald's split of the pinned 1/r with k = 2πH⁻¹n, the force field's pairs over every image
  within rc with a quintic switch, the continuum past it), analytic slopes in sites and cell, and a BFGS descent of
  molecules and cell together that LLL-reduces the cell and folds the turns as it goes. A hard core (0.01(1.5/r)¹²
  between opposite charges) stops a hydrogen falling into another molecule's heavy atom, which the model's finite
  repulsion allows. `atom/tools/ice.mjs` searches with it (`<key> <Z> [starts] [--shard i/m]`: random cells, each
  relaxed; `known`: our water's hand-built proton-ordered cubic ice, the known answer; `probe <key> <round>`: Hartree–Fock
  on the found crystals' closest pairs, appended to `js/ffdata.js` as k ≥ 10000 for `fitff.mjs` to refit; `bake` writes
  **generated** `js/icedata.js`). Selftest 47. Our water passes blind (random starts find the four-connected ice as
  the lowest); the 4D force fields as first fitted collapse into crystals four times too dense, which Hartree–Fock
  says they shouldn't, hence the probe rounds.
  **The polarizable force field** (the search chapter's audit, "Three at once"): `js/polmodel.js` (no DOM) has charges
  on the nuclei, in 4D a cloud term per atom (c/r³: a round cloud's own potential once the shell theorem fails; charge–
  cloud q c/r³, cloud–cloud −3cc′/r⁵, Tang–Toennies-damped), Thole-damped induced dipoles on every site solved for all
  molecules at once (between molecules Thole's a = 0.39, or the trimer-fitted `pol.inter`; the tensor's own within one) and Born–Mayer repulsion.
  `js/polcrystal.js` is the same in a periodic cell (Ewald's split for r⁻¹ and r⁻³ in any d). Both have analytic
  slopes (forces, and the cell's for stress) at the solved dipoles, Hellmann–Feynman: each pair's terms differentiated
  as they stand (switch and damping included), the smooth parts through S = Σ(q + ik·μ)e^(ik·x); `clusterEnergy(…, true)`
  gives `g`, `energy(H, mols, true)` gives `gx`, `gH` as `crystal.js` takes them (`numericSlopes` is still honoured if set). **Generated** `js/polfields.js` comes from
  `atom/tools/fitpol.mjs` (charges and clouds fitted to the molecule's Hartree–Fock potential, `tools/esp.mjs`;
  polarizabilities to its Hartree–Fock tensor, `tools/polarize.mjs`; then repulsions and the clouds' damping to pairs,
  crystal probes weighted 50×; XH₃ takes Xater's H–H repulsion). `atom/tools/manybody.mjs` runs Hartree–Fock trimers
  (all seven energies in the trimer's basis) and a crystal's every neighbour pair (`shell`) on the runner, from
  `tools/manybody-set.json`, and bakes **generated** `js/manybody.js`; `tools/polnumbers.mjs` prints what the search
  chapter quotes from it. `clusters.mjs repol` relaxes the cluster search's best minima on the polarizable field (the
  cluster audit; `repolbake` → `js/clusteraudit.js`). Selftest 48. Measured: 4D hydrogen-bonded rings are strongly
  cooperative (three-body 23% and 42% of a ring's binding, our water's 8%); with Thole's a = 0.39 between molecules the field
  overshot it 2–4×, so the 4D a is fitted to the trimers (0.198; held-out trimers to about a kcal/mol, `interFit`);
  Hartree–Fock rejected the dense 4D crystals the first fields found, and its verdict on the refitted field's is pending.
  `js/clusters.js` is **generated** by `atom/tools/clusters.mjs` (minima of
  3–6-molecule clusters on the force field; `--shard i/m` splits a search
  across machines). **Long runs go to the runner, not the sandbox** (below) . `js/census.js` is **generated** by
  `atom/tools/census.mjs` (~4.5 h: every hydride of 4D rows 2–3 and our
  NH₃/H₂O/HF, then their H-bonded pairs; jobs cached in the temp dir, so a
  cut run resumes; run it on the runner). `js/polytopes.js`
  (no DOM) builds the six regular 4D polytopes, sp^d hybrids and the diamond
  nets. `js/tile.js` is the 4D viewer (shadow coloured by w, or the 3D
  slice at w = h; drag turns in 3D or through w; idle spin in any planes,
  `step`/`overlay`/`onTurn` hooks; draws only while on screen), used by
  `js/shapes.js`, `js/turningTiles.js`, `js/geomviz.js`, `js/search.js` and `js/liquid.js`, and meant to grow
  into the 4D molecular-dynamics view. **Viewers are full width, one at a time:** several `makeTile`s in one
  `.tiles` host become one viewer with a tab each (option `tab`; `data-all` on the host shows them all, as the live
  search needs). On a phone they run to the screen's edges. **Touch is tap-to-engage** (`engageable`, also used by
  the Hopf and Clifford views): a touch does nothing until the viewer is tapped live, so the page scrolls; ✓, a tap
  elsewhere or scrolling away lets go. A mouse turns it directly. **The reticle** (bottom right, KATABASIS's) shows
  the four axes as they lie in the view; tapping an axis, or its flip button, swings it into w by a quarter turn,
  and ▣ squares the view onto the axes (`nearestSquare`). Imports `../../lumen/js/optics.js` for line and
  sky colours; Lumen⁴'s page links back to the light chapter. See
  [`atom/README.md`](atom/README.md).
- **ATOM⁴'s pages are generated.** The seventeen chapters and the landing come from
  `atom/tools/pages/genpages.py` (it execs `gengeometry.py`, `genxater.py`, `gencensus.py`, `gensearch.py`, `gengas.py`, `genstars.py` and `gennuclei.py` beside it, and cuts the
  first chapters from `old-index.html`). Each chapter's body and the landing's cards live there, with their numbers
  pulled from the baked `atom/js/*.js`. So change a chapter there, never in the HTML, then
  `python3 four/atom/tools/pages/genpages.py`. **A new conclusion goes in its chapter and on the landing's cards.**
  (2026-11-07: hand edits had crept into `index.html` and `table.html` (the Hund section, its landing bullet, the
  Bluminium open question, the "to play with" links); they now live in `genpages.py` as anchored insertions that fail
  loudly if their anchor moves. Diff a regeneration before committing it.)
  **Cross-references:** write "chapter N" only as a link to that chapter's page (`<a href="gas.html">chapter 13</a>`);
  the generator renumbers every such link from the chapter list `CH`, and the selftest fails on an unlinked or wrong
  one. In `main.js` use `chap("gas")`. Elsewhere (comments, docs) name chapters ("the gases chapter"), never number
  them. That is what lets the book be reordered (`atom/TEXTBOOK.md`).
- **the methods appendix, `atom/methods.html`**: how the book is made (six rules), the compute runner with its ledger
  of every run, one panel per method (what, how, the self-test checks that cover it, code, chapters, cost, limits),
  and how to run it yourself. Source `atom/tools/pages/genmethods.py`: it reads the self-test's numbered check titles,
  and a method citing a check that doesn't exist stops the build. **A new method gets a panel; a new runner run
  updates the ledger:** `git fetch origin atom4-data && node four/atom/tools/ledger.mjs` writes **generated**
  `js/ledger.js`, then regenerate the pages. The code has no licence yet (packaging for free use waits on one).
- **the tangled mirror, `four/mirror/`**: the solvers as their own MIT-licensed repo,
  `tangled.org/morphyxmino.bsky.social/four-atom` (repo DID `did:plc:r4ziwpsesst5ykm3afo3rkfq`, on knot1.tangled.sh,
  SHA-1; created 2026-11-10; the monorepo itself has no licence, only the mirror is licensed). The workflow pushes by the
  DID (falling back to the name) and takes the object format from the remote, since Tangled's Rust knot makes new repos
  SHA-256 and a SHA-1 repo can't push to one.
  `mirror/build.mjs` decides what ships: the no-DOM modules (`MODULES`) at their own paths, the 4D viewer, Lumen⁴'s
  optics, a known-answer test assembled from the selftest's method blocks (`BLOCKS`: no baked data; 57 checks, 7 s),
  its fixture, `mirror/README.md` and `mirror/LICENSE`. `node four/mirror/build.mjs --check` stages and runs it;
  selftest 42 checks it still stages. `.github/workflows/mirror-four-tangled.yml` stages, tests and force-pushes on
  every push touching those files, and skips the push with a notice until the repo exists on tangled. It also carries paper 1's `papers/p1/reproduce.mjs` (with `atom/tools/bake.mjs` and
  `js/periodic.js`) and the paper's data (`DATA`), and the workflow runs the reproduction's sample. A new solver
  module goes in `MODULES`; a new method-only selftest block in `BLOCKS`; neither may import baked data.
- **papers**: paper 1, a periodic table for four dimensions, started 2026-11-04. `papers/p1/OUTLINE.md` holds the
  sections (each claim mapped to its baked file and selftest block), the figure plan, the companion objects (paper
  page, data release, `reproduce/p1.mjs` in the mirror, widgets, `refs.json`) and the checklist before prose. The kit
  survey and decisions are in `atom/WRITEUP.md`; sources in `atom/LITERATURE.md`, each tagged by how far it's been
  verified. Authors: Claude, Astra (audits), minor mobius (last, PI). Papers live at `/papers/`. `papers/p1/widgets/` is the paper's widgets (choose a law, from `laws.js` live; screening on and off, solved
  live in a worker, `solve.js`; a neutral atom's far pull from the baked cloud), declared `content` in the catalogue. `papers/p1/reproduce.mjs` re-solves a sample against the paper's data.
  **`papers/` is the process page** (`index.html` + `process.js`): it renders `p1/process.json` (hand-kept: the
  pipeline's stages, the checklist before prose, the journal: add an entry when something happens to the paper),
  `p1/ledger.json` (generated by `build.mjs`: each claim recomputed from the bake, the data files' hashes; selftest 67
  fails if a claim stops holding) and `p1/refs.json`. A new claim goes in `build.mjs`'s `ledger()`, with its gate.
  **Citations and symbols (2026-11-07):** the text cites as pandoc `[@key]` (keys from `refs.json`; the build fails
  on an unknown one). `page.mjs` runs citeproc on `draft/references.json` (CSL JSON that `build.mjs` makes from
  Crossref's record of each DOI, cached in `data/crossref.json` by `refs-crossref.mjs`, which is the only networked
  step; `refs.json`'s `csl` field overrides Crossref's quirks), author–date, linked to DOIs; entries not `read`/`index`
  are flagged as unchecked. Every symbol is in `text/notation.md`, one meaning each: the trial exponent is η, the shell
  kernel κ, an atom's Σ⟨r²⟩ is Q, the exchange constant A_D. Add a new symbol there before using it.
  **The paper's spine is the charge law** (restructured 2026-11-04 at the PI's direction): part I why a law must be
  chosen and what 1/r costs, part II the table, part III what the law does, measured against a counterfactual.
  `papers/p1/laws.js` (no DOM, mirrored): one electron under any central V on a movable log grid (`levels`; Gauss's
  −α/r²: nothing binds below ½, ε ∝ 1/r₀² above; `shellSplit`: only 1/r keeps 2s with 2p). `atom/tools/lawtable.mjs
  shell <i> <m>` (runner, run `lawtable-shell`) solves every 4D element with the shell theorem forced on, seeded from
  the real table's configurations, and `bake` writes `papers/p1/data/shelltable.json`. Result: 107 of 140 settled; the first 24 and all six noble gases unchanged
  (rows are the geometry's), 52 changed from element 25 on (p beats d without the law), 128's hold 29.6 → 3.1 eV. 33
  (38, 39, 41, 88–117) never settled (E null: `ground()`'s seeded search keeps E = ∞ when no field converges); `repair
  <i> <m>` re-searches them from every configuration in reach with mixing 0.15 for 1500 iterations (run
  `lawtable-repair`, all exit 0): it settled 38, 39, 41, 88, 117; 114–116 "settled" with negative ionization (a missed lower
  configuration: treated as unsettled); 89–113 never converge under the shell theorem. Count only rows with E ≠ null and
  ion ≥ 0 (`build.mjs`'s `settledRow`): 112 of 140, every atom to 88, 57 changed. Next for 89–116: a homotopy in the
  kernel from the law's converged field, not a search. Ledger claims carry `part`
  (law, table, consequence) and the process page groups them so. `bake.mjs`'s `element(Z, d, seeds, solver)` takes the
  scf options.
  **Figures and text are generated too.** `papers/p1/figures/make.mjs` draws the paper's figures (SVG, on
  `figures/plot.js`: charts.js's theme and Okabe–Ito order, with log axes) from the bake and `laws.js`, captions in
  `CAPTIONS`; `text/*.md` are the sections' sources, every number a `{{token}}` that `build.mjs`'s `numbers()` reads
  from the solver's own source (its defaults parsed from the function text), the kernel, the bake or the ledger, and an
  unknown token stops the build; the rendered drafts are `draft/*.md`, each figure placed after the paragraph that first cites it (`placeFigures`). All of it is in `build()`'s output, so selftest
  67 fails on a stale figure or draft. The process page shows the figures and lists the drafts. The figure set was pruned to six for the main
  text, numbered in order of first citation (1 the law, 2 the table, 3 ionization, 4 elements in profile, 5 orbitals only
  4D has, 6 the counterfactual) and
  A1–A2: a figure has to carry an argument. `papers/p1/profiles.mjs` (seconds) re-solves the profiled atoms in their
  baked configurations with their radial functions kept → `data/profiles.json`; `build.mjs` stops if one drifts from the
  bake, so re-run it after a bake. Figures 4 and 5 for every element are the big table's "Inside the atom"; figure 5's hydrogen twin is kata.mino.mobi/orbital (the kata branch's ORBITAL).
  **The Hartree–Fock atom (2026-11-08), paper 1's second table.** `atom/js/hf.js` (no DOM, mirrored, selftest 71):
  `hfAtom(D, Z, [{n, l, q}], { grid: { h } })`, numerical Hartree–Fock with one radial function per subshell, the energy the
  average over max-spin determinants (exact for full or one-electron spin-subshells: C ³P, N ⁴S, Fe ⁵D). Exchange by the
  Gegenbauer coefficients a_k(t) of 1/|x−y| (3D t^k; 4D tabulated by graded quadrature; a_0 is κ), each radial kernel a
  convolution on the log grid (FFT); angular weights `angularB` by one zonal integral (4D: (l+1)(l'+1) for every allowed k).
  Own grid from 10⁻¹¹ bohr (s waves in 3D need it); the energy's error is O(h²) from the kernel's kink, so absolute
  energies take Richardson from h = 0.02 and 0.01 (He–Kr to 10⁻⁶ of the numerical limits); differences converge at 0.02.
  Checks: 4D closed shells against `gauss.js` (elements 2, 4, 12, 22); angular weights against brute-force harmonics.
  `atom/tools/hftable.mjs check | rank <Z/…> [D] [window_eV]`: the local-exchange search's candidates within the window,
  each by Hartree–Fock with the full term correction (lowest term − max-spin average) on its own orbitals, against the
  local exchange with the Hund-only correction. **`hf-table-1` (all exit 0; `papers/p1/hf-collect.mjs` → `data/hftable.json`
  and **generated** `table/hfverdict.js`, the table page's firm/open line):** ours Hartree–Fock 36/36, local exchange 32/36,
  agreement always right; 4D agree on 126 of 140, open 30, 31, 37, 38, 40, 58, 61, 107–111, 53, 83. Gapped
  configurations (an empty subshell below an occupied one of the same l) are dropped from the Hartree–Fock ranking: the
  solve collapses them onto the compact one. **Not a bracket:** against NIST's 3d promotions both methods are too cheap
  for d from Sc to Cr; paper 1 calls the spread method sensitivity (appendix E.6, claim `hfcheck`). Past element 36 in ours the
  tool seeds from `papers/p1/data/nist-lanthanides.json` (NIST Handbook, `nist-levels.py`): run `hf-lanth-1`, Cs–Hf,
  the f-block calibration. **The f row's verdicts** (`hf-collect.mjs hf-table-1 hf-lanth-1 wide hf-climb-1`, later files
  overriding earlier ones; claim `frow`, appendix E.6): `rank … 10 climb` widens the window and climbs Hartree–Fock's own
  one-electron neighbourhood. Our lanthanides give B = 4.1 eV, the most Hartree–Fock overstabilizes f against a measured
  state; a 4D f-row element is firm when no fewer-f competitor lies within B (17 of 32), open though agreed (82, 84–87),
  leaning Hartree–Fock (83, 107–111) or untested (101, 105, 106, 112). `table/hfverdict.js` codes them 0–4 for the viewer.
  **The literature audit (Astra, 2026-11-08)** is imported: `refs.json` (66) and `data/crossref.json`; measured 3d
  promotions in `data/nist-promotions.json` (lowest-term centroids, which `promotion-collect.mjs` now uses). Route 2's
  unitarity argument is stated for the field strength (`fields.js` `fieldStrengthDim`, Heydeman et al. 2020); the site's
  force chapter still states it for the potential: to update.
  **Paper 1 is the atomic reference (PI, 2026-11-08): everything but the nucleus.** `papers/p1/response-table.mjs`
  (6 min, 4 processes) → `data/response.json`: α(0), α(iω), C₆, Q, C₅, R* for closed-shell and one-s-electron atoms of
  both worlds with quadrature and grid convergence; ours against `data/response-ref.json` (Derevianko–Porsev–Babb 2010,
  read from arXiv; hand-kept with table locators). Table 2, appendix J.1, is generated (`respTokens`). `atom/tools/ligandd2.mjs`
  (seconds) → `data/ligandd2.json`: 26²⁺ 3d² in point charges on the 16-cell, tesseract and 24-cell (appendix H.5).
  `hftable.mjs map <Z/…> [D]`: an element's valence states (every one-electron move from its table ground, both methods,
  the ground's spin ladder) → `papers/p1/valence-collect.mjs` → `data/valence.json` (appendix I.1, table 1; ours calibrated on
  `data/nist-light.json` and `nist-third.json` from `nist-levels.py light|third`). `atom/tools/separate.mjs atoms <D>` /
  `stretch <D> <Z> [R,…]` → `papers/p1/separate-collect.mjs` → `data/separate.json` (appendix J.2): the molecular codes' atoms
  and basis errors, and stretched pairs (charges, spins, starts; in 4D the far form −3Q²/64R⁵). `atom/tools/valencetest.mjs
  reactions|hessian|assemble` (run `valence-1`): darbon's DH₅ by balanced alternatives and its full curvature matrix → `papers/p1/valencetest-collect.mjs` → `data/valencetest.json` (appendix I.2, claim `valencetest`): a true minimum (14
  curvatures, none negative) below DH₄ + H and DH₃ + H₂ by 1.55/2.32 and 2.13/3.43 eV (Hartree–Fock/MP2); fragments only in
  symmetric shapes.
  **A pending atom4-compute run is replaced by a newer push of the queue** (GitHub concurrency): don't push
  `.github/compute/atom4.json` while a run waits behind another.
  **Methods' supporting runs** (sandbox, seconds to a minute; re-run after a solver change): `audit-scf.mjs` (the SCF's
  stop against one 10⁵ tighter → `data/audit-scf.json`), `convergence.mjs` (six other radial grids, each in its own
  process via `ATOM4_GRID="N,r0,rmax"`, which `atom.js` reads at import and nothing else sets → `data/convergence.json`).
  **Astra's final audit (2026-11-10), the correction pass.** F01: `reproduce.mjs` re-solves each main-table row by the
  pipeline that made it (bake outside the d/f blocks; `termtable.mjs` for 23–42, 51–70, 79–130, with the ion search where
  `cation_rearranged`); `--s1` checks the bake against supplement S1; in the mirror (no termtable/hund/bake) those rows are
  named "not reproduced here". 26, 39, 54, 55 now reproduce to Δ 0. F03: `hftable.mjs rank` skipped the term correction
  for candidates > 6 eV up, though corrections reach −7.7 eV; `farcorr` computed all 182 (run `farcorr-eta-repair-1`: 54 complete, 128 partial; no ranking or verdict changed, deciding gaps fell by up to 7.8 eV, closest partial 99 at 7.0 eV) and
  `hf-collect.mjs` folds them in with provenance per candidate (`term`: corrected after / partial / uncorrected) and per
  f-row verdict (`decidedBy`, `groundPartial`). F02: "firm" is gone from the paper and the table page: agreement, coverage
  and margins are reported separately, and B (4.1 eV) is a sensitivity scale, not a bound. F04: subshell size (rotations,
  any potential), shared shell energies (1/r, SO(5)) and row lengths (a many-electron result) are kept apart; the rows
  "survive the shell theorem", not "are the geometry's". F05: Hund under both laws is d² on element 26's fixed orbital
  only. F06: the response results are for the 15 round-cloud atoms sampled. F07, F08: wording, explicit fractions,
  `abbrConfig` (every open subshell kept in table abbreviations), figure 5 and table 1 captions.
  **The bracket of the pinned law (PI, 2026-11-10): the table under 1/r^η, η = 0.5 and 1.5.** `atom.js` takes `eta`
  (scf/ground/potentials options; default 1, which is untouched and bit-identical): the nucleus −Z/r^η, the clouds through
  `kernel.js`'s `kEtaTab(eta)` (the 3-sphere average of 1/|x−y|^η, kη(t)/max^η), the local exchange of that law's own
  4D electron gas, e_x = −C ρ^(1+η/4) with C = 2(16π²)^(η/4)∫x^(−1−η)J₂² (`exchangeConst`, `j2Integral`; A₄ at η = 1), and
  each level's lower bound from the potential's minimum (`lowerBound`; under 1/r it is read off the origin). Selftest 72
  (mirrored): the constant against quadrature, the kernel, and one electron against `laws.js` at both η.
  `atom/tools/etatable.mjs run <eta> <i> <m> [zmax]` (runner, run `eta-table-1`: 1–100, 16 shards per η) seeds every
  search from the real table, its neighbours and the bare η-nucleus's filling order, and solves the empty 5g level in
  each atom's field (`gIntrudes`: the solver stops at f, and under η < 1 higher l is more bound); `repair` re-searches
  the unsettled; `bake` → `papers/p1/data/etatable.json`. First look (sandbox, 1–6): η = 0.5 fills 2p before 2s
  (1s² 2p² at 4), η = 1.5 puts 3s before 2p (1s² 2s² 3s¹ at 5).
  **Result (runs `eta-table-1`, `farcorr-eta-repair-1`; paper 1 §6.5, appendix F.8, figure 1c, claim `etarows`):** η = 0.5:
  all 100 settle, 5g never intrudes, noble gases (one rule, `papers/p1/eta.js`) at 2, 12, 40, 100, hydrogen's shells;
  η = 1.5: 82 settle (45–54, 57–58, 77–81, 83 never do), noble gases at 2, 14, 24, 34, 72, each p closing on the next
  shell's s. Under 1/r the rule gives 2, 12, 22, 42, 50, 70, 78 (with the zinc-kind 42, 70). So the rows survive the shell
  theorem but need the exponent 1/r.
  **The electron's two states (PI, 2026-11-10):** paper 1 §2.5 and appendix F.6 now derive what can be derived (the smallest
  4 + 1 Dirac electron's slow limit is two states of one chirality, the selftest's γ matrices) and name what stays declared
  (that the electron is that smallest spinor, and Pauli's exclusion, which spin-statistics can't supply here). A four-state
  electron, (½,0)⊕(0,½), would double every shell (4, 20, 56, 120); a table under it is the natural next bracket, not built.
  **Length (PI, 2026-11-10): the main text is at most seven two-column journal pages, with generous appendices.**
  `pages.cjs` (sandbox, Playwright) lays `draft/paper.html` out as a two-column letter page at 10 pt and prints the main
  text's page count and words (`draft/paper-journal.pdf`); check it after any change to the body. The body is §1–8 (the law,
  a methods summary, the table, Hund, what the law decides, the neutral atoms' pull, limitations and conclusion, about
  4 300 words, six pages); the arguments and methods in full are appendices F–H, the chemistry starting data (valence states,
  DH₅) I, response and separation J, reproducing K, and the notation table opens the appendices. Ledger claims carry
  their new sections. A new result goes to an appendix unless it changes the spine.
  **The paper and its supplement (PI, 2026-11-10):** `draft/paper.md` is abstract to conclusion, the main figures and
  the references; `draft/supplement.md` (`assembleSupplement`) is the notation, the appendices and figures A1–A2 with
  their own references. `linkRefs` turns every "appendix X.N", "section N.M", "figure N" and "table N" into a link to its
  anchor on the right page (`anchorHeads` writes `#sec-2-4`, `#app-f-8`, `#fig-1`, `#tab-2`, `#notation`), and bare
  four/kata.mino.mobi and tangled.org addresses into links. Write cross-references as plain words in `text/*.md`; the
  build links them, a bare address after "(" included. After a change, check every `href="…#id"` resolves (done by hand so far). `pdf.cjs` prints both PDFs, rewriting every relative link to the live `four.mino.mobi/papers/p1/draft/` copy first (printed from disk, they would point at `file:///home/…`).
  **Pages:** `page.mjs` renders each `draft/*.md` to `draft/*.html` with pandoc (`--mathml`; display maths in the text
  sources as `$$ TeX $$`, inline as `$…$`) on `paper.css` (forked from wormhole's); each page carries its source's SHA-256
  and selftest 67 fails on a stale one, so after changing a text source run `build.mjs` then `page.mjs`.

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

**A run that fails with no jobs at all** (every workflow on the push red within a minute) is GitHub Actions not
starting, not the code (2026-11-09, 18:10–22:50 UTC). Sessions here can't re-run or dispatch a workflow (403), and an
empty commit doesn't match `paths:`, so redeploy by pushing a real change under `four/` once Actions runs again.

**Old links:** `games.mino.mobi/atom4/…`, `/lumen4/…` and `/iris4/…` redirect (301) here, to `/atom/…`, `/lumen/…`
and `/iris/…`, from `games/worker.js`.
