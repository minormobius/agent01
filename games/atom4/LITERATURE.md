# ATOM⁴ — literature notes

The prior work that ATOM⁴'s first paper (the 4D periodic table) has to cite and stand against, gathered in a first
literature pass (2026-10-25). The standard is arXiv's: every reference verified against its source before it is
cited, every claim of novelty checked against what's known. This file is the working record, not the paper.

How far each reference has been verified:

- **read**: the source itself was read.
- **index**: the bibliographic details were confirmed from a publisher's or index's listing, but the text wasn't read.
- **cited**: seen only as a citation in another work. Must be checked before it goes in a paper.

## The question, and where it stands

**Paper 1's claim to defend:** with the Coulomb interaction kept at 1/r in four spatial dimensions, the neutral
atoms' ground states, solved self-consistently, form a periodic table with rows of 2, 10, 10, 28, 28 and noble gases
at Z = 2, 12, 22, 50, 78. Inner electrons screen only partly (there is no shell theorem), so outer electrons are held
much harder than shell-theorem screening would allow.

What the pass found:

1. **The setup is established.** Keeping V = −Ze²/r while varying the number of dimensions D is the convention of the
   D-dimensional hydrogen literature and of Herschbach's dimensional-scaling programme. The alternative, the Poisson
   potential r^(2−D), is noted there and set aside, as we did for the same reason (no ground state in 4D). We cite
   the convention. Our physical argument for it (the lens vacuum) is ours, and belongs to a later paper.
2. **The hydrogenic part is known.** E = −Z²/2[N + (D − 1)/2]², with N = n − 1, and the degeneracy g(l, D), which is
   (l + 1)² in 4D. These are standard (Nieto 1979; Négadi & Kibler 1996, eqs. 10 and 14a).
3. **The period lengths were predicted, not computed.** Négadi & Kibler (1996) state a generalized Madelung rule for
   any D: fill (N + 1 + l) increasing, then N + 1, each subshell holding 2g(l, D). They work it out only for D = 2.
   Applied to D = 4, it gives rows of 2, 10, 10, 28, 28 and noble gases at 2, 12, 22, 50, 78. That is exactly what
   our self-consistent solver finds. Their rule is combinatorics plus a fitted q-deformation, with no
   electron–electron interaction.
4. **A self-consistent table exists only for D = 2.** Pyykkö & Zhao (1991) solved Hartree–Fock ground states for
   Z = 1–24 in two dimensions, with 1/r interactions. The Herschbach group computed Hartree–Fock and exact energies of
   two-electron atoms as a function of D (Loeser & Herschbach 1986, and later). No self-consistent many-electron
   table for D = 4 turned up in four searches, two of them extended.
5. **Our electron-gas constants are known.** The 4D kinetic and exchange coefficients, (4π/3)ρ^(3/2) and
   −16/(15√π)ρ^(5/4), reproduce the general-D formulas in Loos & Gill's review (checked numerically:
   εₓ = −2Dα/π(D² − 1) and εₜ = Dα²/2(D + 2), with α = 2^((D−1)/D) Γ(D/2 + 1)^(2/D), give 0.60180 and 4.18879 at D = 4).
   The forces chapter now credits them.

So paper 1's contribution, as far as the pass can tell, is:

- **The first self-consistent periodic table for four dimensions,** to Z = 78. Its period structure confirms the
  generalized Madelung rule's prediction.
- **What the rule cannot give:**
  - the ground configurations, including where 4D's transition metals depart from Madelung;
  - ionization energies and radii;
  - the strength of partial screening, measured against the shell-theorem counterfactual (noble-gas ionization
    about twice as high);
  - the far pull of a neutral atom (−Σ⟨r²⟩/8s³).
- **Validation by the same solver:** our own table in 3D (32 of 36 ground configurations, ionization energies within
  a few percent), helium against Hartree–Fock, and hydrogen exact in both worlds.

## Remaining risk to the novelty claim

The pass did not reach:

- The full text of *Dimensional Scaling in Chemical Physics* (1992/1993). Its Pyykkö–Zhao chapter, "Low D Regime"
  (with Goodson and López-Cabrera, pp. 115–138), is on low D.
- Loeser & Herschbach (1986).
- Citation-forward searches from Pyykkö & Zhao and from Négadi & Kibler, for later work at D = 4.

A first citation-forward search (Pyykkö's publication list, works citing Négadi & Kibler, D-dimensional Madelung
work since 2000) found nothing at D = 4. It was a web search, not a citation index, so the claim in the paper will read
"to our knowledge", and a Web of Science or Scopus forward search on both papers should be run before it's posted.

## References

### Dimension and the inverse-square law
- P. Ehrenfest, Proc. Amsterdam Acad. **20**, 200 (1917); Ann. Phys. **61**, 440 (1920). Orbits and atoms are
  unstable for D > 3 under the Poisson potential. — *cited* (via Tangherlini and later reviews)
- F. R. Tangherlini, "Schwarzschild field in n dimensions and the dimensionality of space problem", Nuovo Cimento
  **27**, 636–651 (1963). Extends the argument to general relativity and to the Schrödinger hydrogen atom. — *index*
  (INSPIRE)
- C. Callender, "Answers in search of a question: 'proofs' of the tri-dimensionality of space" (2005), and F. Caruso &
  R. Moreira Xavier, on the stability argument's weakness. — *cited*; the exact references are to be fixed.

### D-dimensional hydrogen and periodic tables
- M. M. Nieto, "Hydrogen atom and relativistic pi-mesic atom in N-space dimensions", Am. J. Phys. **47**, 1067
  (1979). — *cited* (via hep-th/9410161)
- S. M. Al-Jaber, "Hydrogen atom in N dimensions", Int. J. Theor. Phys. (1998). — *cited*; volume and pages to be fixed.
- G. F. Kventsel & J. Katriel, Phys. Rev. A **24**, 2299 (1981). The Poisson-equation potential in D dimensions.
  — *cited* (via Négadi & Kibler)
- T. Négadi & M. Kibler, "The periodic table in Flatland", Int. J. Quantum Chem. **57**, 53 (1996);
  arXiv:atom-ph/9512001. — *read*
- P. Pyykkö & Y. Zhao, "The elements of Flatland: Hartree–Fock atomic ground states in two dimensions for Z = 1–24",
  Int. J. Quantum Chem. **40**, 527–544 (1991), doi:10.1002/qua.560400408. — *index* (Wiley)
- E. Madelung, *Die mathematischen Hilfsmittel des Physikers* (Springer, 1936); V. M. Klechkovskii (1955, 1961).
  The Madelung rule. — *cited* (via Négadi & Kibler)

### Dimensional scaling
- D. R. Herschbach, J. Avery & O. Goscinski (eds.), *Dimensional Scaling in Chemical Physics* (Kluwer, Dordrecht,
  1992; softcover 1993). — *index*
- P. Pyykkö & Y. Zhao, "Flatland: the periodic system for D = 2", in the above. — *index* (Pyykkö's publication list).
  A Springer listing found by search gives a "Low D Regime" chapter, pp. 115–138, by D. Z. Goodson, M. López-Cabrera,
  P. Pyykkö & Y. Zhao. Whether these are the same chapter is to be settled from the book.
- J. G. Loeser & D. R. Herschbach, J. Chem. Phys. **84**, 3882–3892 (1986). Hartree–Fock and exact energies of He-like
  ions against D. — *cited* (via Ghosh, Kais & Herschbach 2020; Bernard, Loos & Gill 2013)
- A. Ghosh, S. Kais & D. R. Herschbach, "Unorthodox dimensional interpolations for He, Li, Be atoms and hydrogen
  molecule", Front. Phys. (2020), doi:10.3389/fphy.2020.00331; arXiv:2004.11489. — *index*

### The uniform electron gas in D dimensions
- P.-F. Loos & P. M. W. Gill, "The uniform electron gas", arXiv:1601.03544 (2016); published in WIREs Comput. Mol.
  Sci. (2016), volume and pages to be confirmed. — *read* (the general-D kinetic and exchange formulas)

### Methods the solver uses (to be verified before citing)
- Numerov integration; Sturm bisection for eigenvalues.
- Local exchange (Dirac/Slater); J. P. Perdew & A. Zunger, Phys. Rev. B **23**, 5048 (1981), self-interaction
  correction. — *from memory; verify*
- Hund's rules; the shell theorem (Newton).

### Molecules: Hartree–Fock in any dimension (chapters 9 and 10)
- S. F. Boys, "Electronic wave functions. I. A general method of calculation for the stationary states of any molecular
  system", Proc. R. Soc. A **200**, 542–554 (1950), doi:10.1098/rspa.1950.0036. Gaussians, and the Boys function our
  G_n(T) generalizes. — *index*
- L. E. McMurchie & E. R. Davidson, "One- and two-electron integrals over Cartesian Gaussian functions", J. Comput.
  Phys. **26**, 218–231 (1978), doi:10.1016/0021-9991(78)90092-X. The integral scheme `js/gauss.js` follows. — *index*
- S. F. Boys & F. Bernardi, Mol. Phys. **19**, 553 (1970). The counterpoise correction. — *from memory; verify*
- P. Pulay, Chem. Phys. Lett. **73**, 393 (1980). DIIS. — *from memory; verify*
- R. S. Mulliken, J. Chem. Phys. **23**, 1833 (1955). Population analysis. — *from memory; verify*
- Water at the Hartree–Fock limit (r ≈ 1.776 bohr, θ ≈ 106.3°, μ ≈ 0.78 au; dimer ≈ 3.6 kcal/mol) and measured
  (1.809 bohr, 104.5°, 0.730 au; dimer De ≈ 5.0 kcal/mol, O–O 2.91 Å): the values the chapters quote. — *from memory;
  each needs a primary source*

### Molecular dynamics (js/md.js)
- P. P. Ewald, Ann. Phys. **64**, 253 (1921). The lattice sum, which `md.js` generalizes to any dimension. — *from
  memory; verify*
- H. M. Evjen, Phys. Rev. **39**, 675 (1932). The weighted direct sum used as the independent check on the 4D Madelung
  constant. — *from memory; verify*
- The rock-salt Madelung constant 1.747565. — *standard value; cite a table*
- J.-P. Ryckaert, G. Ciccotti & H. J. C. Berendsen, J. Comput. Phys. **23**, 327 (1977), SHAKE; H. C. Andersen,
  J. Comput. Phys. **52**, 24 (1983), RATTLE. — *from memory; verify*
- G. Bussi, D. Donadio & M. Parrinello, "Canonical sampling through velocity rescaling", J. Chem. Phys. **126**,
  014101 (2007), doi:10.1063/1.2408420; arXiv:0803.4060. The thermostat. — *index*
- H. J. C. Berendsen, J. R. Grigera & T. P. Straatsma, "The missing term in effective pair potentials", J. Phys.
  Chem. **91**, 6269–6271 (1987). SPC/E, the published water model used to check the engine. — *index*
- NIST Standard Reference Simulation Website, "SPC/E water reference calculations — 10 Å cutoff":
  https://www.nist.gov/mml/csd/chemical-informatics-group/spce-water-reference-calculations-10a-cutoff, and the
  configurations (https://www.nist.gov/document/spcesampleconfigurations-targz). The Ewald parameters (α = 5.6/L,
  kmax 5, k² < 27, 10 Å) and the reference energies, which `md.js` matches part by part. Configuration 1 is in
  `test/fixtures/`. — *read*
- NIST, "LAMMPS MD equation of state: pressure vs density, SPC/E water":
  https://www.nist.gov/mml/csd-mml/informatics/lammps-md-equation-state-pressure-vs-density-spce-water. SPC/E's
  parameters, with ε/k = 78.2 K and its 5.213 kJ/mol induction term; the 300 K rows couldn't be read reliably. —
  *read (in part)*
- C. Vega & J. L. F. Abascal, "Simulating water with rigid non-polarizable models: a general perspective", Phys. Chem.
  Chem. Phys. (2011). The water models' liquid properties, needed to quote SPC/E's U at 298 K exactly (ours gives
  −46.9 kJ/mol). — *cited (via arXiv:0905.4009); volume and pages to be fixed*

## Next

1. A citation-index forward search on Pyykkö & Zhao (1991) and Négadi & Kibler (1996). The web search is done.
2. Turn every *cited* entry into *read* or *index*.
3. An outline for paper 1.
