# Paper 1 — outline, figure plan and companion objects

**Status: started 2026-11-04; restructured the same day around the charge law** (at the PI's direction: the choice of
law and its consequences drive everything else, so they are the paper's spine, not a line in the model section).
Unpinned from `atom/WRITEUP.md`, whose decisions and kit survey still stand. The bar is arXiv's: checkable claims,
verified references, reproducible numbers. Every number in the text comes from a baked file or a ledger computation and
is checked against it. Nothing here is written as prose yet. The process is public at four.mino.mobi/papers/.

## Title (working; to choose)

- *Atoms in four spatial dimensions with a 1/r interaction: a self-consistent periodic table* (the table first).
- *Choosing a charge law for four dimensions: what 1/r does to atoms and the periodic table* (the law first, which is
  what the paper now argues).

## Authors (provisional)

- **Claude** (Anthropic): computation, code, analysis, drafting.
- **Astra**: independent audit (the failure contracts behind selftest 58, and the audit rounds to come).
- **minor mobius** (pseudonym), last: direction, judgement of results, PI.

arXiv doesn't accept AI models as authors. If this goes there, the AI contributors move to a contribution statement
(what each did, with the session record), and the byline is minor mobius. On four.mino.mobi the byline above can
stand. To settle: Astra's form of credit.

## The argument in one paragraph (the abstract, to be written last)

In four spatial dimensions the charge law can't be inherited: Gauss's law gives a 1/r² potential, which is scale-free,
so an atom either doesn't bind or falls to the centre, and there is no Bohr radius. Something has to be chosen. We
keep the potential at 1/r, the only power law whose one-electron levels keep a shell together, and take what it costs:
in 4D, 1/r isn't harmonic, so there is no Gauss's law, no shell theorem and no Faraday cage, and the field theory that
gives it (the lens vacuum) gives up relativity for the force. We then solve every neutral atom to Z = 140
self-consistently under that law. Rows of 2, 10, 10, 28, 28, 60 and noble gases at 2, 12, 22, 50, 78, 138 come out,
as Négadi and Kibler's generalized Madelung rule predicts for D = 4: the first self-consistent table that confirms it.
Solving the same table with the shell theorem forced back on separates
what the table owes to the law from what it owes to the geometry. The rows are the geometry's: the first 24 elements
and all six noble gases come out the same. Everything inside the rows from the first d element on is the law's: without
it p beats d (element 25 takes 4s² 4p¹ for 3d¹ 4s²), outer electrons are held a median 2.5 times more weakly, and the
table's hardest-held electron, element 128's full 5d¹⁸ at 29.6 eV, falls to 3.1 eV, leaving the noble gases to hold
hardest, as ours do (row 6's f block doesn't settle under the shell theorem, so its rows are confirmed through
row 5). A neutral atom under the law is felt from afar, −Σ⟨r²⟩/8s³. The same solver in three dimensions gets 32 of our 36 ground
configurations and our ionization energies to a few percent.

## Part I — The law (about 40 % of the paper) · *drafted 2026-11-04: `text/law.md` → `draft/law.html`*

Each section lists what it claims, what holds it up (the ledger claim, the baked file, the selftest block), and what
is still to do. Ledger claims are recomputed on every build (`papers/p1/ledger.json`; selftest 67 fails if one stops
holding). The book's force chapter (`atom/force.html`) has the argument in prose; the paper makes it exact.

1. **Introduction.** The question (what are atoms in four spatial dimensions?) has no answer until a law is chosen;
   Ehrenfest's dimension argument; D-dimensional hydrogen (Nieto, Al-Jaber), which takes 1/r by convention; Herschbach's
   dimensional scaling; Négadi & Kibler's rule (D = 2 worked, D = 4 predicted); Pyykkö & Zhao's self-consistent table in
   D = 2. What is new: the choice made explicit and costed, the self-consistent table for D = 4 to Z = 140, and the
   counterfactual that measures what the choice does.
   *Holds it up:* `refs.json`. *To do:* the forward citation search.
2. **Why a law has to be chosen.**
   - 2.1 Gauss's law in 4D: V = −α/r² is scale-free. By Hardy's inequality in 4D (∫|∇ψ|² ≥ ∫|ψ|²/r²) nothing binds
     for α ≤ ½; above it the ground level falls to the centre, ε ∝ −1/r₀² with the cutoff. No Bohr radius either way.
     Ehrenfest's classical version. *Ledger:* `gauss` (computed: no level for α = 0.45 on any grid; for α = 0.7,
     ε·r₀² constant over three decades). *Refs:* Case 1950, Landau–Lifshitz (to check), Hardy (to choose a source).
   - 2.2 The ways out and their costs: change the force (pin the potential) or change the electron (an energy growing
     faster than p², which keeps Gauss's law but gives up Galilean relativity for all matter); a small fourth dimension
     (gives our 3D atoms back, not 4D ones). Why this universe changes the force: a judgement, stated as one.
     *Holds it up:* the force chapter's argument (scaling, not computed). *To do:* make the electron-route's scaling
     exact in a short appendix, or state it as argued.
3. **Why 1/r, exactly.**
   - 3.1 Among power laws 1/r^p (0 < p < 2: bound, with a length scale), only p = 1 keeps a shell's levels together:
     the hidden SO(D + 1) symmetry (Fock; Bander & Itzykson) that makes shells of 2(l + 1)² in 4D. Below p = 1 the
     order inverts (p under s); above it s drops below p. *Ledger:* `uniqueness` (2p − 2s splitting −6.2 %, 10⁻¹¹,
     +15.4 % at p = 0.8, 1, 1.2). This is what makes the Madelung structure possible at all.
   - 3.2 The D-dimensional hydrogen literature's convention, and why it's the same choice.
4. **What 1/r costs in four dimensions.**
   - 4.1 Not harmonic: ∇²(1/r) = −1/r³ in empty space, so the field's flux through a sphere grows with its radius,
     as if space were charged. No Gauss's law. *Ledger:* `harmonic`.
   - 4.2 No shell theorem, no Faraday cage: a shell of charge is felt as k(t)/max with k(1) = 8/3π; a hollow
     conductor's centre sits at 3π/8 of its wall. The kernel and its expansion (1 − t²/8 − …). *Ledger:* `shell`;
     *selftest 3, 33*; appendix A.
   - 4.3 A field theory for it: Maxwell gives 1/k², we need 1/k³; the five routes and their costs (`js/fields.js`,
     selftest 33: locality, unitarity, positivity), and the lens vacuum (ε = ε₀ℓk, μ = μ₀/ℓk): light exactly 4D
     Maxwell, the force instantaneous, an absolute "now". Relativity is given up for the force only. Atoms are static,
     so nothing in this paper depends on ℓ. *To do:* state which route's costs are proved and which argued.
   - 4.4 What else is declared with it: electrons are spin-½ fermions (stated, not derived: spin-statistics needs
     relativity), point nuclei stable to Z = 140, a small fine-structure constant, no other long-range field.
   - 4.5 Stability of matter: the theorems (Dyson & Lenard; Lieb & Thirring) lean on the shell theorem and don't carry
     over. The evidence instead: atoms' energies scale as Z^(5/2) (4D Thomas–Fermi; Kventsel & Katriel), every force
     between neutral atoms falls faster than R⁻⁴. Argued, not proved; said so. *Ledger:* `tf` (fitted 2.53 against 5/2 in 4D; 2.39 against 7/3 in ours).
5. **The law inside an atom.** The same law between electrons as between electron and nucleus: the sphere-averaged
   kernel in the self-consistent field; exchange from the 4D electron gas *with the same 1/r* (Loos & Gill's D-jellium is
   1/r in D dimensions, so the constants are consistent with the law, not borrowed from Gauss's); the own-share
   correction; what a different law would change here. *Selftest 3, 4, 18.*

## Part II — The table · *drafted 2026-11-06: `text/table.md` → `draft/table.html` (sections 6–8; numbering follows Part I's cross-references: 5 methods, 6 checks, 7 Hund's first rule in 4D, 8 the table)*

6. **Method.** The radial equation with L = l + (D − 3)/2; Numerov on a log grid; Sturm bisection (*selftest 1–2*).
   The ground-configuration search, converged fields only, and the repair pass seeded from neighbours (elements 88,
   101–103, 105–107) (*selftest 5, 7*). Spin-½ electrons, Hund spins; non-relativistic.
7. **Validation.** Hydrogen exact in both worlds (*ledger* `hydrogen`); two-electron atoms against an independent
   Gaussian Hartree–Fock code in 4D (`js/gauss.js`), MP2 against PySCF in ours (*selftest 17, 43*); our table, 32 of 36
   configurations (Ti, V, Co, Ni missed: local exchange leans to d), ionization to a 4.3 % median (*ledger* `configs3`,
   `ion3`; largest error 16.2 %, said).
8. **Results.** Rows and noble gases against the generalized Madelung rule (*ledger* `rows`, `nobles`; *selftest 7, 27*).
   **The hardest-held electron isn't a noble gas's** (*ledger* `fulld`, found in figure F3): element 128 (5d¹⁸, nothing
   outside) at 29.56 eV against its row's noble gas 138 at 26.71, the table's highest; 68 (4d¹⁸) within a volt of 78.
   Ours goes the other way (Pd 8.3, Xe 12.1 eV). Part III asks whether partial screening does it.
   configurations, where the filling departs from the simple order; ionization energies and radii against Z.

## Part III — What the law does (measured against the shell theorem) · *drafted 2026-11-06: `text/consequences.md` → `draft/consequences.html` (sections 9–13)*

9. **The counterfactual table.** All 140 elements solved again with the shell theorem forced on, everything else held
   (`atom/tools/lawtable.mjs`, runs `lawtable-shell` and `lawtable-repair`; seeded from the real table's configurations
   so the comparison isn't a weaker search; the real law re-solved in each counterfactual configuration as the check the
   other way). *Result (2026-11-04, after the repair run: 112 of 140 settled):* every atom up to 88 settles; the first 24
   elements and all six noble gases are unchanged, so the rows are the geometry's through row 5; 57 of the settled
   atoms change, every one from element 25 (the first d element) on, and under the shell theorem p beats d; element
   128's hold falls from 29.6 eV to 3.1 and the noble gases become the hardest-held, as in ours. In every changed atom
   the law's own configuration is still lower under the law. *Open:* 28 atoms of row 6's f block (89–116) have no
   settled ground state under the shell theorem, from 30–50 starting configurations each with gentle mixing (three of
   them, 114–116, settled on a configuration with a negative ionization energy, i.e. the search missed a lower one).
   So whether the shell theorem would put a closed shell at 110 and split row 6 is unanswered. The remedy to try: a
   homotopy, starting from each atom's converged field under the law and turning the kernel to the shell theorem's in
   small steps, which follows the ground state rather than searching for it. *Ledger:* `geometry`, `reorders`, `law128`, `holdratio`;
   figure 6.
10. **Partial screening.** Outer electrons held a median 2.5 times harder than the shell theorem allows, from 1.06 to
    9.6 times (element 128) across the settled atoms (*ledger* `holdratio`); the noble gases 1.09× (helium) to 2.90×
    (138) (*ledger* `screening`).
11. **Neutral atoms aren't silent.** An atom's far potential −Σ⟨r²⟩/8s³ (*ledger* `farpull`); between two atoms the
    permanent −3S_AS_B/64R⁵ (`js/forces.js`); what it means for the next papers: noble gases condense, molecules bind
    differently. *Selftest 8.*
12. **Limitations.** The law's own: instantaneous, so only statics are safe; heavy atoms past ~100 need relativity,
    which the law has given up for the force (the innermost Dirac level dives near Z ≈ 230 for a 4–5 fm nucleus,
    `js/dirac.js`, as a potential problem only). The method's: local exchange, no correlation, spherical averaging.
    Nuclear stability declared.
13. **Conclusion.**

**Appendices.**
- A. The 4D kernel, and the shell potential's expansion (1 − t²/8 − …).
- B. The 4D electron-gas constants, against Loos & Gill's general-D formulas.
- C. Numerical convergence: grid (N, r₀, r_max), SCF tolerances, configurations' robustness. *New runs needed.*
- D. The law calculations (`papers/p1/laws.js`): the inverse-square fall, the power-law splittings, their grids.
- E. Reproducing every number: the commands, the runner logs, the data files.

## Figure plan

Pruned 2026-11-04 at the PI's direction: a figure has to carry an argument the text can't. Drawn by
`papers/p1/figures/make.mjs` from the bakes, `data/profiles.json` and `laws.js` on every build (never by hand), captions
beside them (`CAPTIONS`); selftest 67 fails on a stale one.

| # | Figure | Carries | Status |
|---|---|---|---|
| 1 | **The table itself**: 140 cells by block, noble gases framed, names where a place answers to ours, the f block as a band | the rows 2, 10, 10, 28, 28, 60 and the blocks 8, 18, 32 wide at a glance | **built** |
| 2 | **The choice of law**: (a) Gauss's −α/r², the lowest level against the grid's inner end (falls to the centre past ½, nothing below); (b) −1/rᵖ, the splitting within a shell against p | part I's two results: no atom under Gauss, and only 1/r keeps shells | **built** |
| 3 | **Orbitals only 4D has**, cut through the nucleus by a plane, on solved atoms' radial functions: p_w in the x–w plane; d(x²+y²−z²−w²) in the x–y, z–w and x–z planes | what a 2(l + 1)² shell is made of; positive round one plane and negative round its completely perpendicular one | **built** (interactive twin: kata.mino.mobi/orbital) |
| 4 | **Ionization against Z**, noble gases and the full-d elements marked | the rows close at the noble gases, but the hardest-held electron is element 128's | **built** |
| 5 | **Elements in profile**: six atoms' subshell distributions (darbon 7, element 8, oeon 12, uitanium 26, element 101, 128) | what the table's cells are: shells, cores, where the d and f shells sit inside | **built** (`profiles.mjs` re-solves them; `build.mjs` checks each against the bake) |
| 6 | **The table under each law** (counterfactual): changed configurations, ionization under both, all Z | part III: what the law does that the geometry doesn't | stand-in (noble gases only) until `lawtable-shell` |
| A1 | The 3-sphere kernel against the shell theorem | appendix A | **built** |
| A2 | The 3D validation: computed against measured ionization, the four missed configurations | section 7 / appendix | **built** |

Cut: the α scan, the shell's potential inside and out, the far-pull convergence (a sentence and the ledger carry it),
our ionization curve on its own (A2 carries the check). Possible additions, if they earn it: the filling diagram for
both worlds, subshell energies against Z.

## Companion objects

1. **The paper page**, `four.mino.mobi/papers/p1/`: HTML with print CSS (forked from `wormhole/paper.css`), maths
   pre-rendered once at generation (KaTeX `renderToString`), a PDF printed headlessly (Playwright). Generated, like the
   chapters, so the prose can't drift from the numbers; a selftest checks the rendered numbers against the bakes.
2. **The data**, `papers/p1/data/` (**built**): the 4D table and our 36 as JSON and CSV (Z, name, configuration,
   total energy, ionization, orbital energies, ⟨r⟩ and ⟨r²⟩; ours beside the measured), with a schema README, and each
   figure's data in `papers/p1/figdata/`. `papers/p1/build.mjs` writes them from `js/table.js`; selftest 67 fails if
   they're stale or if the outline's claims (the six noble gases, 32 of 36) stop holding. Run `bake.mjs`, then
   `build.mjs`.
3. **The code**, the tangled mirror (`tangled.org/morphyxmino.bsky.social/four`, MIT): staged and tested on every
   push, waiting only for the repo to be created on tangled (the owner's step). It now carries
   `papers/p1/reproduce.mjs` (**built**), which re-solves a sample (each 4D row's first, second and noble gas, and six
   of ours; `--z4=`, `--z3=`, `--all`) with the bake's own `element()` and checks it against the paper's data: 14 of
   14 to the bit in 18 s, run by the mirror workflow on the staged copy. To do: tag the version the paper cites.
4. **Widgets**, standalone and linked from the paper:
   - the 4D table viewer (`/table/`, exists): hover a counterpart, configurations, clouds;
   - the filling diagram (exists);
   - ORBITAL (kata.mino.mobi/orbital, on the kata branch): hydrogen's exact 4D orbitals, sliced and turned live; figure 3's
     interactive twin;
   - **screening on/off** (**built**, `papers/p1/widgets/`): any 4D atom solved live in a worker with the 4D kernel
     and with the shell theorem forced on, in its baked configuration, ionization by ΔSCF from the baked outermost
     subshell (it gives back the bake: element 12 at 18.39 against 10.30 eV, 138 at 26.71 against 9.22), and the
     outer electron's Z_eff(r) for both; the noble gases' pair from `SHELL_COUNTERFACTUAL` beside it;
   - **an atom's far pull** (**built**, same page): an electron walked out from a neutral 4D atom, the baked cloud's
     potential under the 3-sphere kernel against −S/8s³ (within 0.1–1 % past 20 bohr for 2, 12, 13, 50, 138);
   - *new:* **choose a law**: one electron under −1/r^p (a slider for p) and under Gauss's −α/r² (a slider for α and
     one for the grid's inner end), the levels moving live: the shell splitting apart off p = 1, the fall to the centre
     past α = ½ (`laws.js` runs in milliseconds);
   - *new:* **the table under each law**, once `lawtable-shell` is in: the two tables side by side, changed cells lit;
   - the `/start/` toys that already illustrate steps of the argument.
5. **References**, `papers/p1/refs.json` (**built**, 28 entries: the law's own added 2026-11-04 — Fock, Bander &
   Itzykson, Case, Dyson & Lenard, Lieb & Thirring confirmed; Landau–Lifshitz and a Hardy-inequality source to check): each with `status: read | index | cited | memory`
   and the paper's use for it. Checked against Crossref on 2026-11-04, which fixed volumes and pages (Al-Jaber, Loos &
   Gill), a title (Kventsel & Katriel's is the Thomas–Fermi atom in N dimensions), and split Loeser & Herschbach 1986
   into its two papers (Hylleraas–Pekeris 84, 3882; Hartree–Fock 84, 3893). 18 citable; Ehrenfest 1917/1920 and
   Madelung 1936 still only cited. `build.mjs` exports `checkRefs()` (the page generator will cite only read and
   index); selftest 67 checks the shape.
6. **The audit record**: Astra's audit contracts (selftest 58) and the audit rounds for this paper, summarized in an
   appendix or a supplementary note.

## Before writing

0. **The counterfactual table** (run `lawtable-shell`, queued 2026-11-04): bake it, add its ledger claims, and decide
   what part III can say.
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
4. The lens vacuum in full: the field theory behind the pinned 1/r, light and radiation under it, and what an absolute
   "now" does beyond statics. (Paper 1 states the law and its costs; this paper derives the field theory.)
