# Part III · What the law does (draft)

<!-- Source. Every {{token}} is filled by papers/p1/build.mjs from the bake, data/shelltable.json or the ledger. -->

## 8 · The table again, with the shell theorem forced on

Part I chose the law; Part II solved the table under it. To see which of the table's features the law decides, every
4D element was solved a second time with one thing changed: the clouds' potential taken as if the shell theorem held
(our kernel, $1/\max(r, s)$), and everything else, the four-dimensional kinetic energy, the degeneracies, exchange,
the search, left as it was (section 5). Of the {{cf.n}} elements, {{cf.settled}} settle, every one up to element
{{cf.through}}. The rest, elements {{cf.unsettled}}, row 6's f block and the first elements after it, have no settled
ground state under the shell theorem from any starting configuration tried. They are left out, so this part's
statements about the rows hold through row 5.

**8.1 The rows are the geometry's.** With the shell theorem forced on, the first 24 elements keep every configuration,
and the noble gases close the same rows at elements {{table.nobles}} (figure 6). The lengths of the rows, 2, 10, 10,
28, 28, come from four-dimensional space's degeneracies, $2(l + 1)^2$ to a subshell. They don't come from the law
between charges, so long as that law keeps a shell together (section 3.1).

**8.2 What fills inside the rows is the law's.** Of the settled atoms, {{cf.changed}} change configuration, and the
first is element {{cf.first}}, the first d element. Under the shell theorem p beats d. Element 25 takes {{cf.25}}
where the law gives 3d¹ 4s², and the change runs on through the d and f blocks. In every changed atom the law's own
configuration is still the lower one when solved under the law, so the difference is the law's, not a weaker search.

## 9 · Partial screening

In ours an outer electron sees the nucleus screened by every inner electron whole: the shell theorem makes an inner
cloud act as its charge at the centre. In four dimensions an inner cloud screens only partly, because its pull at
radius $r$ is $\kappa(t)/r$ of a point charge's with $\kappa < 1$ (section 4.2). The outer electrons see more of the nucleus.

**9.1 The law holds outer electrons harder.** Across the {{cf.holdN}} atoms past helium that settle under both, the law holds the
outermost electron a median {{cf.holdMedian}} times as hard as the shell theorem would, from {{cf.holdMin}} to
{{cf.holdMax}} times. Among the noble gases the ratio grows from {{screen.he}} (helium) to {{screen.top}} (element
138).

**9.2 Element 128 holds hardest of all.** The largest ratio is element 128's. Its 5d¹⁸ shell, full with nothing outside it, holds its
electron at {{ion.128}} eV under the law and at {{cf.128}} eV under the shell theorem. With the shell theorem the
noble gases are again the hardest-held atoms, as ours are. The table's hardest-held electron (section 7.2) is partial
screening at its strongest: a full shell whose own cloud hides the nucleus from it least.

**9.3 Negative ions.** Partial screening holds an extra electron harder too. One electron short of a full p shell
(p⁷ in four dimensions), atoms bind an extra electron by {{ea.hal4}} eV going down the group, rising with every row,
where ours stay level ({{ea.halOurs}} eV, measured). The largest affinity in the table is {{ea.max4}}, and
{{ea.bound4}} of the 140 atoms bind an extra electron by more than 0.7 eV, the level above which the method held in
ours (appendix E.4). The light noble gases
(2, 12, 22) don't hold one at all: their anions lie {{ea.nobUn}} eV above the atom. The heavier ones come out barely
bound ({{ea.nob4}} eV), too little to call. In ours this method underbinds anions like these, whose extra electron is s.

## 10 · Neutral atoms aren't silent

Under the shell theorem a neutral atom is invisible from outside its cloud. Here it isn't. A spherical shell
of charge $q$ and radius $s$, felt at a distance $R$ outside it, gives $q\,\kappa(s/R)/R$ with
$\kappa = 1 - t^2/8 - \dots$ (appendix A). Summed over the nucleus and the electrons, the leading terms cancel in a
neutral atom, and what remains, for an electron at distance $R$, is a pull $-Q/8R^3$, with $Q = \sum\langle r^2\rangle$
over the atom's electrons. The solved noble gases follow it: at 30 bohr the full cloud's potential and the far form
agree to {{far.dev}}. Between two atoms the same failure gives a permanent attraction
$-3Q_AQ_B/64R^5$, with no dipole needed, which outranges London's $R^{-6}$. The papers
that follow take it up: noble gases that condense far above where ours do, and molecules held differently.

**10.1 Polarizability, dispersion and the permanent pull.** For the closed-shell atoms and the one-s-electron alkalis of both worlds (table 2) the
static polarizability $\alpha_\mathrm p(0)$, the polarizability at imaginary frequency and from it the dispersion
coefficient $C_6$ by Casimir and Polder's integral are computed by the coupled response of the same solver (Hartree plus
local exchange, each electron's own share removed; exact for hydrogen in both worlds). The set is the atoms for which
that response's angular bookkeeping is exact: full subshells and a single s electron. Doubling the frequency
quadrature moves $C_6$ by at most {{resp.quad}}, and the other radial grids move $\alpha_\mathrm p(0)$ and $C_6$ by at most
{{resp.grid}}. The sum rule $\omega^2\alpha_\mathrm p(\mathrm i\omega) \to Z$, read at $\omega$ = 300 hartree, holds to
{{resp.sumMin}} or better; the shortfall in the heaviest atoms is core response at higher frequencies still. In ours,
against the reference values of @derevianko2010, the noble gases' $\alpha_\mathrm p(0)$ is off by {{resp.nobA}}, and the
alkalis and alkaline earths are too easily polarized, by {{resp.sA}} in $\alpha_\mathrm p(0)$ and {{resp.sC}} in $C_6$
(median errors {{resp.medA}} and {{resp.medC}}), as local exchange without correlation is known to make them.

In four dimensions the permanent pull has its own coefficient, $C_5 = 3Q^2/64$ for two like atoms, and the distance
$R^* = C_6/C_5$ inside which dispersion is the larger. For hydrogen and helium $R^*$ is {{resp.rH}} bohr; for the
alkali-like and alkaline-earth-like atoms {{resp.rS}}; for every other atom in the table {{resp.rClosed}}, which is
inside the atom. Past contact, for most of the table, the permanent term is the leading pull between neutral atoms at
every distance where a far-field form applies at all.

{{resp.table}}

Table: **Table 2.** Response of closed-shell and one-s-electron atoms (atomic units): static polarizability, $C_6$, $Q =
\sum\langle r^2\rangle$, in four dimensions $C_5 = 3Q^2/64$ and $R^* = C_6/C_5$; for ours, beside each, the reference value
(ref.) of @derevianko2010. Data: `data/response.json`, with $\alpha_\mathrm p(\mathrm i\omega)$ on the quadrature nodes and each
atom's convergence.

One consequence is a requirement on every later model of four-dimensional matter. In ours the trace of a charge
distribution's second moment is dropped from multipole expansions, because $1/r$ is harmonic there and the trace
carries no field. Here it is the leading field of a neutral atom ($-Q/8R^3$ on a charge, $-C_5/R^5$ between two atoms),
so a four-dimensional force field has to keep it. The force fields of the later papers do, as a cloud term on every
atom.

**10.2 Joining and separating atoms.** A molecule's binding energy is measured from its atoms, so the atoms the
molecular codes reach when a bond is pulled apart have to be the atoms of this paper. The light atoms of both worlds
({{sep.nA}} of them) were computed by every method the later papers use: numerical Hartree–Fock, the local exchange of
the table, and the Gaussian code (`gauss.js`, unrestricted Hartree–Fock and MP2) in the basis the molecular work uses.
For the closed shells that basis lies {{sep.closed}} mHa above the numerical Hartree–Fock limit. For the open shells the
unrestricted energy lies {{sep.open}} mHa from the restricted numerical one; below it mostly, because an unrestricted
determinant can polarize its spins, which is not a better basis. Then pairs of like atoms (ours {{sep.pairs3}}; in four
dimensions elements {{sep.pairs4}}) were stretched from 6 to 16 bohr, each started three ways (from bare nuclei and from
the two atoms with parallel and with antiparallel spins) and the lowest kept. Every pair separates into neutral atoms
(Mulliken charges {{sep.maxQ}}) with each atom's own spin, but not from every start: the bare-nuclei start lands up to
{{sep.worst}} hartree too high, on ion pairs and wrong spin states. A molecular code that starts one way only can report
a binding energy measured from the wrong atoms. In ours the separated pairs meet the atoms to {{sep.ours16}} mHa at 16
bohr. In four dimensions they don't meet them at all, as section 10 says they shouldn't. Two closed-shell atoms keep the
permanent pull, and Hartree–Fock reproduces its far form: element 12's pair at 16 bohr is bound by {{sep.e12}} mHa, and
the closed shells sit at {{sep.rClosed}} times the far form there. Hydrogen, whose four-dimensional orbital is diffuse,
is at {{sep.rH}}, still approaching it; its excess over the far form falls by five between 10 and 16 bohr, as
shorter-ranged terms do. The open p shells are at
{{sep.rOpen}}: an unrestricted atom with a partly filled p shell is not round, and the ordinary quadrupole that ours has
too adds a pull of the same order, one that depends on how the two atoms are turned. The atomic energies, the curves and
each atom's charge and spin are in `data/separate.json`.

## 11 · Limitations

**The law's own.** The force acts instantly (section 4.3), so only statics are safe; this paper has nothing that
moves. Heavy atoms would need relativity, which the law has given up for the force between charges; the table past
about element 100 is first-pass for that reason. Round a point nucleus the innermost Dirac level fails at
$Z\alpha = 3/2$, $Z \approx 205$ in four dimensions [@katsura2006; @gu2002]; round a nucleus of 4–5 fm it instead
dives into the negative continuum near Z ≈ 230 (our own finite-nucleus solution, `dirac.js`, which gives ours' 170).
Both are potential problems, not ones met here, and a Dirac equation in a prescribed $1/r$ is not the relativistic
completion the lens vacuum lacks. Nuclei are declared stable to Z = 140.

**The method's.** Local exchange and no correlation, which in ours favours d by about a volt (appendix E.3); in four
dimensions that leaves the configurations section 6.4 lists in doubt. Every subshell's cloud is
averaged over the sphere. The terms of open subshells are resolved only to first order, on the solver's orbitals, and
only where the rule fails (section 6). The counterfactual table leaves row 6's f block unsettled (section 8).

**What isn't claimed.** That four-dimensional chemistry looks like ours: the next papers take up bonds, liquids and
crystals under the same law.

## 12 · Conclusion

A world with four large dimensions of space has to choose its law between charges, because Gauss's law gives it no
atoms. Pinned at $1/r$, the only power law that keeps a shell together, it has atoms, and they have a periodic table:
rows of 2, 10, 10, 28, 28, 60, noble gases at 2, 12, 22, 50, 78 and 138, as the generalized Madelung rule predicts.
The rows are the geometry's. Everything that fills inside them from the first d element on is the law's, because in
four dimensions $1/r$ isn't harmonic and an inner cloud screens only partly: outer electrons are held about two and a
half times harder, the table's hardest-held electron belongs to a full d shell rather than a noble gas, and a neutral
atom pulls from afar. And four-dimensional space breaks Hund's first rule for the d² and d¹⁶ fillings and for 4f³ and 4f²⁹,
under both laws tested.
