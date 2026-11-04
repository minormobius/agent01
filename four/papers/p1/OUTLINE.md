# Paper 1 — outline, figure plan and companion objects

**Status: started 2026-11-04** (unpinned from `atom/WRITEUP.md`, whose decisions and kit survey still stand). The bar is
arXiv's: checkable claims, verified references, reproducible numbers. Every number in the text comes from a baked
file and is checked against it, as the chapter pages are. Nothing here is written as prose yet.

## Title (working)

*Atoms in four spatial dimensions with a 1/r interaction: a self-consistent periodic table.*

## Authors (provisional)

- **Claude** (Anthropic): computation, code, analysis, drafting.
- **Astra**: independent audit (the failure contracts behind selftest 58, and the audit rounds to come).
- **minor mobius** (pseudonym), last: direction, judgement of results, PI.

arXiv doesn't accept AI models as authors. If this goes there, the AI contributors move to a contribution statement
(what each did, with the session record), and the byline is minor mobius. On four.mino.mobi the byline above can
stand. To settle: Astra's form of credit.

## The claim (abstract, to be written last)

With the force between charges kept at 1/r in four spatial dimensions (Gauss's 1/r² has no atomic ground state), the
neutral atoms' ground states, solved self-consistently, form a periodic table with rows of 2, 10, 10, 28, 28, 60 and
noble gases at Z = 2, 12, 22, 50, 78, 138. The rows are the ones Négadi and Kibler's generalized Madelung rule predicts
for D = 4; this is the first self-consistent many-electron table that confirms it, and what the rule can't give comes
with it: configurations, ionization energies, sizes, and partial screening. Without a shell theorem inner electrons
screen only partly, outer electrons are held much harder than shell-theorem screening allows, and a neutral atom pulls
on a distant charge as −Σ⟨r²⟩/8s³. The same solver run in three dimensions gets 32 of our 36 ground configurations and
our ionization energies to a few percent.

## Sections

Each section lists what it claims, what holds it up (the baked file and the selftest block), and what is still to do.

1. **Introduction.** Ehrenfest's dimension argument; D-dimensional hydrogen; Herschbach's dimensional scaling;
   Négadi & Kibler's rule (D = 2 worked, D = 4 predicted); Pyykkö & Zhao's self-consistent table in D = 2. What is new:
   the self-consistent table for D = 4, to Z = 140.
   *Holds it up:* `atom/LITERATURE.md` (each reference tagged read / index / cited). *To do:* the forward citation search.
2. **Model.** V = −Z/r with the 4D kinetic operator; why 1/r and not r⁻² (stated as the convention of the
   D-dimensional hydrogen literature; the physical case, the lens vacuum, is a later paper); spin-½ electrons; point
   nuclei declared stable to Z = 140; non-relativistic.
3. **Method.**
   - The radial equation with L = l + (D − 3)/2; Numerov on a log grid; Sturm bisection. *Selftest 1–2.*
   - The sphere-averaged 1/r kernel in 4D, k(min/max)/max with k(1) = 8/3π. *Selftest 3.*
   - Local exchange from the 4D electron gas (Loos & Gill's constants, checked), the own-share correction, Hund
     spins. *Selftest 4, 18.*
   - The ground-configuration search, converged fields only, and the repair pass seeded from neighbours (elements 88,
     101–103, 105–107). *Selftest 5, 7.*
4. **Validation.**
   - Hydrogen exact in both worlds (−Z²/2(n + ½)² in 4D). *Selftest 1.*
   - Two-electron atoms against an independent Gaussian Hartree–Fock code in 4D (`js/gauss.js`), and MP2 against
     PySCF in ours. *Selftest 17, 43.*
   - Our table: 32 of 36 ground configurations (Ti, V, Co, Ni missed: local exchange leans to d), ionization within a
     few percent. *Selftest 6.*
5. **Results.**
   - Rows and noble gases. First ionization peaks at 2, 12, 22, 50, 78, 138 (from `js/table.js`). *Selftest 7, 27.*
   - Configurations, including where the filling departs from the simple order.
   - Ionization energies and radii against Z, both worlds.
6. **Partial screening.** No shell theorem: noble-gas ionization against the shell-theorem counterfactual
   (`SHELL_COUNTERFACTUAL` in `js/table.js`); a neutral atom's far pull −Σ⟨r²⟩/8s³. *Selftest 8.*
7. **Limitations.** Local exchange and no correlation; spherical averaging; non-relativistic (the innermost Dirac
   level dives near Z ≈ 230 in 4D for a 4–5 fm nucleus, `js/dirac.js`; past ~100 the table is a first pass); nuclear
   stability declared.
8. **Conclusion.**

**Appendices.**
- A. The 4D kernel, and the shell potential's expansion (1 − t²/8 − …).
- B. The 4D electron-gas constants, against Loos & Gill's general-D formulas.
- C. Numerical convergence: grid (N, r₀, r_max), SCF tolerances, configurations' robustness. *New runs needed (below).*
- D. Reproducing every number: the commands, the runner logs, the data files.

## Figure plan

| # | Figure | Data | Exists as | To build |
|---|---|---|---|---|
| 1 | The 4D periodic table, f block as a band, beside ours | `js/table.js`, `js/periodic.js` `layout` | `/table/` viewer | a static print version (SVG) |
| 2 | The filling diagram, both worlds (Madelung's diagonals; boxes of 2(2l+1) and 2(l+1)²) | `table/filling.js`, `js/table.js` | `/table/` | static SVG |
| 3 | First ionization energy against Z, both worlds, ours against measured | `js/table.js` (`ion`), NIST values in `js/periodic.js` | landing / table chapter charts | paper figure with both worlds on one axis set |
| 4 | The 3D validation: computed against measured ionization, configuration hits and misses marked | `js/table.js` 3D | table chapter | scatter + residual panel |
| 5 | Subshell energies against Z (where d turns over), both worlds | `js/table.js` (`orb`) | — | new |
| 6 | Partial screening: noble-gas ionization against the shell-theorem counterfactual | `SHELL_COUNTERFACTUAL` | force/table chapter | paper figure |
| 7 | A neutral atom's far pull: the potential outside an atom, −Σ⟨r²⟩/8s³ against the full solve | `js/table.js` (`dens`), `js/fields.js` | `/fields/` toy | paper figure |
| 8 | Radii against Z, both worlds | `js/table.js` (`orb` ⟨r⟩) | table detail panel | new |
| C1 | Convergence: total energy and ionization against grid and tolerance, a few elements per row | new runs | — | appendix |

Figures are SVG from `packages/dataviz/charts.js` (Okabe–Ito palette), generated from the bakes by a script, never by
hand. Each has a companion widget where interaction helps (below).

## Companion objects

1. **The paper page**, `four.mino.mobi/papers/p1/`: HTML with print CSS (forked from `wormhole/paper.css`), maths
   pre-rendered once at generation (KaTeX `renderToString`), a PDF printed headlessly (Playwright). Generated, like the
   chapters, so the prose can't drift from the numbers; a selftest checks the rendered numbers against the bakes.
2. **The data**, `papers/p1/data/` (**built**): the 4D table and our 36 as JSON and CSV (Z, name, configuration,
   total energy, ionization, orbital energies, ⟨r⟩ and ⟨r²⟩; ours beside the measured), with a schema README, and each
   figure's data in `papers/p1/figdata/`. `papers/p1/build.mjs` writes them from `js/table.js`; selftest 67 fails if
   they're stale or if the outline's claims (the six noble gases, 32 of 36) stop holding. Run `bake.mjs`, then
   `build.mjs`.
3. **The code**, the tangled mirror (`tangled.org/morphyxmino.bsky.social/four`, MIT): already staged and tested on
   every push (84 checks), waiting only for the repo to be created on tangled. Add a `reproduce/p1.mjs` that rebuilds
   the table's sample and every figure's data from the solver, and tag the version the paper cites.
4. **Widgets**, standalone and linked from the paper:
   - the 4D table viewer (`/table/`, exists): hover a counterpart, configurations, clouds;
   - the filling diagram (exists);
   - *new:* **screening on/off**, one atom solved with the 4D kernel and with the shell-theorem kernel, side by side,
     the outer electron's binding as the slider moves Z;
   - *new:* **an atom's far pull**, a test charge walked out from a neutral 4D atom, the potential against −S/8s³;
   - the `/start/` toys that already illustrate steps of the argument.
5. **References**, `papers/p1/refs.json`: one entry per reference with `verified: read | index | cited`; the generator
   refuses to cite a `cited` entry, and a selftest enforces it.
6. **The audit record**: Astra's audit contracts (selftest 58) and the audit rounds for this paper, summarized in an
   appendix or a supplementary note.

## Before writing

1. **Literature:** the forward citation search on Pyykkö & Zhao (1991) and Négadi & Kibler (1996); turn every *cited*
   entry into *read* or *index*.
2. **Solver audit** (today's lesson): `atom.js`'s self-consistent field stops on the total energy. The plane-wave
   work found that a stop on energies can leave the far density unconverged (it skewed the pseudopotentials' tails).
   Check what that does to the table's energies and ionizations: re-solve a sample per row with a pointwise density
   tolerance, and report the differences in appendix C.
3. **Convergence runs** for appendix C (grid and tolerances, a few elements per row; the runner).
4. ~~Re-derive the 3D validation numbers~~ (done: `figdata/f4-validation3d.json`, 32 of 36, Ti V Co Ni each one d
   electron too many against 4s; median ionization error 4.3 %).
5. **Decide the Z range in the main text:** to 78 with 79–140 as a section marked first-pass, or all 140 with the
   relativistic caveat in the limitations.
6. **The equation pipeline:** check that `katex` installs in the sandbox; otherwise fall back to hand-written MathML.

## Later papers (the series)

2. Stars and nuclei under pinned gravity: stellar structure, the helium ladder, what stars burn to and give back (the
   declared choices — the weak force, G, gravity's route — stated up front).
3. Molecules: bonds in 4D, the hydrogen problem, the census. After Xater's phases settle.
4. The lens vacuum: the physical case for 1/r, and what it costs.
