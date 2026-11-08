# Part II · The table (draft)

<!-- Source. Every {{token}} is filled by papers/p1/build.mjs from the bake, data/termtable.json (the term-corrected
     table, the main one), data/hund.json, data/hund-law.json or the ledger. -->

## 6 · Checks against what is known

**6.1 Hydrogen.** One electron needs no search and no exchange, and four-dimensional hydrogen has an exact answer:
$-Z^2/2(n + \tfrac12)^2$ hartree, so $-2/9$ for the ground state. The solver gives {{h4.E}}.

**6.2 Two electrons.** Helium-like atoms in four dimensions are checked against an independent code, Hartree–Fock in a
Gaussian basis written for any dimension (`gauss.js`), and the same atoms in ours against PySCF at the MP2 level
(selftest blocks 17 and 43). The two codes share no part of the radial solver. From outside, the only accurate
four-dimensional numbers we have been able to read are correlated variational energies for helium-like ions
[@escobar2021]. Hartree–Fock (`hf.js`, section 5.12) lies above them by {{he4.gap}} hartree for $Z$ = 2–10, as it must,
since they include correlation; that is the size and sign of a correlation energy, a consistency check rather than a
benchmark. A four-dimensional Hartree–Fock limit to test against [@loeser1986hf] is in tables we have not obtained.

**6.3 Our own table.** The same solver, the same law (in ours 1/r is Gauss's) and the same search, run in three
dimensions, gives {{configs3}} of our measured ground configurations. The four it misses, {{misses3}}, each take one
d electron too many against 4s, the known lean of local exchange toward d. The misses have one cause. Moving an electron from 4s into 3d comes out
too cheap in every 3d atom we can compare (eV, the solver against measured: {{prom.list}}), short by {{prom.min}}–{{prom.max}}
eV and a mean {{prom.bias}}, always in d's favour. The measured values are differences of each configuration's lowest
term, its levels averaged with weights $2J + 1$, from NIST's level tables [@nist-handbook], because the solver has no
spin–orbit coupling and lands each configuration in its lowest term. Taking the lowest level of each instead moves them
by at most {{prom.levelShift}} eV and turns nickel's sign ({{prom.niLow}} rather than {{prom.ni}}). That is local
exchange without correlation. Resolving every open
subshell's whole term structure doesn't remove it. With that correction (the lowest term less the average of the
maximum-spin arrangements, which is what a spherically averaged field stands for), the bias stays at {{prom.fullbias}} eV and
the configurations get worse, {{prom.full}} against {{prom.bake}}. So the paper corrects only Hund's first rule
(section 7), the one thing a spin-polarized averaged field cannot represent. Its first ionization energies are off by a
median {{ion3.median}} and at most {{ion3.max}} (figure A2). That is the accuracy to expect of the 4D table: a method
that gets our transition metals mostly right and our ionizations to a few percent, not a spectroscopic one.

**6.4 Ions.** Each ion of ours searched for its own ground state, rather than made by taking one electron from the
atom's configuration, changes no first ionization. Searched the same way, our +2 and +3 ions give second and
third ionization energies within a median {{ion23.m2}} and {{ion23.m3}} of measured ones [@nist-asd] (worst
{{ion23.w2}} and {{ion23.w3}}), closer than the first ionizations' {{ion23.m1}}, and they lose their 4s electrons before
3d, as measured (Fe⁺ 3d⁶4s, Fe²⁺ 3d⁶, Fe³⁺ 3d⁵). In four dimensions the 3d row's ions do the same. Elements in the first half
of the 4d and 5d blocks, and the two that open row 6's f block with a 5d electron, instead give up a d electron at +1
or +2 while keeping the outer s ({{ion23.dZ}}), as our yttrium and lutetium do (Y⁺ 5s², Lu⁺ 6s²). The same search for anions gives our electron affinities where
the extra electron is bound by the field and exchange: the p-block acceptors ({{ea.pOurs}} eV, measured second). It
also finds every anion that should be unbound to be unbound: the noble gases, beryllium, magnesium and nitrogen. It
fails where correlation does the binding ({{ea.fail}}). In ours, then, the method's affinities hold above about 0.7 eV
and not below (the measured values are from @rienstra2002). That is a calibration in our world, not an error bar for
four dimensions: an affinity near threshold there would need its own checks, a wider radial grid for the extra
electron, the anion's and the atom's fields both converged, and correlation.

**6.5 Numbers.** Tightening the solver's stop or changing its grid moves no ionization energy by a millihartree
(section 5 and appendix C).

**6.6 A second method.** Hartree–Fock (section 5.12) on the same candidates gets {{hf.oursHf}} ground
configurations of ours right, against local exchange's {{hf.oursLda}}. The two agree on {{hf.oursAgree}}, and every one of those is
right; they differ on {{hf.oursDiffer}}, and on each of these Hartree–Fock is right. The promotion of a 4s electron
into 3d shows what each method does, against the same measured centroids as section 6.3 (eV, error of local exchange
and of Hartree–Fock: {{hf.promList}}). Local exchange makes d too cheap in all nine. Hartree–Fock makes it a little too
cheap up to half filling (Sc–Cr, {{hf.hfEarly}}) and too dear after it (Mn–Cu, {{hf.hfLate}}). So the two do not
bracket the measured value; from scandium to chromium both lie on the same side of it. Their difference is a measure
of how much an answer depends on the method, not an error bar: neither method bounds the other, and both omit the
correlation that would move each toward the measured values.

In four dimensions the two agree on {{hf.4agree}} of the 140 elements, and these are the table's firm configurations.
They differ on {{hf.4n}}, which are open: {{hf.4dN}} in the d rows ({{hf.4d}}), where local exchange puts one electron
more in d than Hartree–Fock, as in ours; {{hf.4fN}} at the end of row 6's f block ({{hf.4f}}), where it puts one more
in f; and {{hf.4oN}} at the start of a block ({{hf.4o}}). For the d rows, ours gives a lean. Before half filling
({{hf.4dEarly}}) Hartree–Fock's error in ours was small and in the same direction as local exchange's, so its
preference for s² should hold. After it ({{hf.4dLate}}) its margins, {{hf.4dLateM}} eV, are inside the volt by which it
overprices d in ours. In the f row the comparison is incomplete. The candidates are those within the window of local
exchange's ground, and local exchange overbinds f, so in our lanthanides the configurations with one f electron fewer
fell outside it, the measured ground's nearest competitor among them. Hartree–Fock's margins in the 4D f row
({{hf.4fM}} eV) are measured only against local exchange's own choice, and the f row's configurations, agreed or not,
are provisional until a wider window has been run. In the d rows no Hartree–Fock ground configuration lies near the
window's edge. Every element's verdict, both methods' rankings and the margins are in `data/hftable.json`.

## 7 · Hund's first rule in four dimensions

The solver gives each open subshell the most parallel spins it can hold. That is Hund's first rule, and in ours it is
the known answer for the ground terms of free atoms. In four dimensions it is an assumption, and for some fillings it
is wrong.

**7.1 How the terms are found.** For each open subshell of each ground configuration, its orbitals are the degree-$l$
harmonics on the 3-sphere, $(l + 1)^2$ of them (4 for p, 9 for d, 16 for f). The repulsion between two of its
electrons is the law's $1/|x - y|$, projected exactly onto the harmonics of degree $0$ to $2l$, with the radial parts
integrated over the atom's own orbital. Every arrangement of the subshell's electrons with a given $M_S$ is set up and
the lowest energy found (Lanczos, matrix-free; a 4D d⁹ block has 15 876 arrangements). A term of spin $S$ appears in
every block with $M_S \le S$, so the ground term's spin is the largest $M_S$ whose block still reaches the lowest
energy. In ours this reproduces Racah's term separations for d² and d³ to the wavenumber, and the known ground terms of
Cr³⁺, Mn²⁺, Pr³⁺ and Gd³⁺. Over all {{hund.n3}} open subshells of our table, maximum spin is lowest, as it should be.

**7.2 Where it fails.** In four dimensions all {{hund.p4}} open p subshells of the table keep the rule, and so do the d
fillings {{hund.dhold}}. The two exceptions are d² and its mirror d¹⁶, in all three d rows: {{hund.fails4d}}. In each the ground
term is a spin singlet of ten states, and the triplet the solver assumed lies {{hund.range}} eV above it. In the f block
4f³ (element 83) fails too, and so does its mirror 4f²⁹ (element 108), three short of a full shell. Both have a
ground term of spin ½, {{hund.f3}} and {{hund.f29}} eV below the quartet. No other f filling was found to break the rule,
but the search is not complete. For {{hund.fcomplete}} every spin was checked. For {{hund.fbound}} only the highest two
or three were, because the lower-spin blocks run to 10⁶–10⁸ arrangements; there the result is a bound, no lower term
among the spins that could be run. Two fillings (elements {{hund.fmissing}}) didn't finish in the runner's time.

**7.3 Why it fails.** It isn't the law. On element 26's own orbital Gauss's $1/r^2$ gives the same order, with the
singlet {{hl.gauss}} eV below the triplet, against {{hl.law}} eV under $1/r$; the pinned law makes the failure smaller,
not larger. The cause is the shell itself. Four-dimensional d orbitals form the representation (1,1) of SO(4) ≅
SU(2) × SU(2)/ℤ₂. Two electrons in them make spatially symmetric states (2,2) ⊕ (2,0) ⊕ (0,2) ⊕ (1,1) ⊕ (0,0), all spin
singlets (25, 10, 9 and 1 states), and antisymmetric ones (2,1) ⊕ (1,2) ⊕ (1,0) ⊕ (0,1), triplets (30 and 6). The
singlet that comes lowest is the ten-state (2,0) ⊕ (0,2): two irreducible representations of SO(4), exchanged by a
reflection, so a single level once reflections are counted. For two electrons in a d subshell each term's energy is
exactly $F^0 + a_2F^2 + a_4F^4$. The $F^n$ are the radial parts of the repulsion and depend on the orbital. The
$a_n = \langle C_n(\cos\gamma)\rangle$ over the term ($\gamma$ is the angle between the two electrons seen from the
nucleus) depend only on the term. $a_2$ measures how much the term lets the electrons line up along a common axis. The
ten-state singlet holds them nearest right angles, $\langle\cos^2\gamma\rangle$ = {{hl.cosS4}}, half of random
(0.250), where the best triplet reaches {{hl.cosT4}}. It lies below every triplet whenever $F^4/F^2 <$ {{hl.crit}}.
Element 26's orbital has $F^4/F^2$ = {{hl.rLaw}} under the law and {{hl.rGauss}} under Gauss's, so the rule breaks
either way. In ours the triplet ³F is the term that keeps the electrons nearest right angles ({{hl.cosF3}}, against
¹D's {{hl.cosD3}} and random's 0.333), and it is the lowest for every value of $F^4/F^2$. Titanium's d² has ³F lowest
and its first singlet {{hl.ours}} eV up. Pauli keeps same-spin electrons apart, which is the usual reason for Hund's
rule; four-dimensional space gives paired spins a way to stay apart that is better still. In SO(4) terms, every
rotation splits into a left and a right half, and a d orbital carries one unit of each. The singlet adds the two
electrons' left halves and cancels their right ones, or the other way round. Three-dimensional rotations don't split,
so ours has no such state. An interactive version is at four.mino.mobi/atom/hund.html.

What this establishes is narrower than a whole-atom ground term. The term energies are computed within one subshell on
the atom's own maximum-spin orbital, which is neither relaxed term by term nor correlated beyond the subshell, and the
correction they give the table (section 7.4) is first order. The inversion holds under both laws tested, and for any
orbital whose $F^4/F^2$ is below {{hl.crit}}. Hund's first rule has been studied away from three dimensions, in
two-dimensional helium-like atoms and quantum dots [@sako2012; @sako2010] and by dimensional scaling [@gonzalez1991],
and two-electron matrix elements for hydrogenic d² and f² pairs have been derived for any $D$ [@summerfield1999]. We
have not been able to read the last two in full, and none of the sources we could read states this inversion.

**7.4 What it does to the table.** Where the rule fails, the solver's energy for that configuration is the
maximum-spin state's, too high by the gap. The table in section 8 corrects that. Every d- and f-block element
({{tt.n}} of them) was searched again, with the neighbours' configurations as extra seeds ({{tt.cands}} settled
candidates each). Every candidate got its open subshells' gaps added, and the candidates were ranked again, with and
without the correction, so that a change from the wider search is told apart from one from the terms. **The terms
change no ground configuration.** They lower the eight Hund-breaking atoms' energies, and they move first ionizations
in pairs. An atom whose own ground term gains the gap holds its electron harder: {{tt.up}} eV. The next element,
whose ion lands on the broken filling, gives one up more easily: {{tt.down}} eV. That is {{tt.range}} eV either way.
The wider search found one configuration the bake had missed. Element 82 is 4f¹ 5d¹ 6s², {{tt.82}} eV below the
bake's 4f² 6s², which is our cerium's kind; its ionization goes {{tt.82ion}} eV. The table that follows is the
corrected one (`data/table4.csv`). The Hund-spin table it replaces is supplement S1 (`data/table4-hundspin.csv`).
How far to trust each configuration follows from section 6.3. Take a bias of about a volt toward d and f: a ground
configuration with a competitor holding fewer d and f electrons within a volt of it could be the other way round.
{{tt.sensN}} of the {{tt.n}} d- and f-block elements have one: {{tt.sens}}.

**7.5 In a ligand field.** A spin singlet is not orbitally inert: the ten states of (2,0) ⊕ (0,2) still carry orbital
structure, and in a compound a ligand field splits them, and might hand the ground to a triplet. The ion here is
element 26's 2+, 3d² over closed shells, with point charges −1 at {{lf.R}} bohr in three arrangements of four
dimensions: along the axes (eight, the 16-cell, four dimensions' octahedron), at a tesseract's corners (sixteen), and at
the 24-cell's vertices (twenty-four). The field is projected exactly onto the degrees a d × d product holds, scaled from
zero, and every determinant of the two electrons is diagonalized, as in section 7.2. A four-dimensional d subshell
splits {{lf.axSplit}} on the axes and {{lf.coSplit}} at the corners (ours' octahedron {{lf.oursAx}}, cube
{{lf.oursCo}}). On the axes the two electrons go into the six-fold set, and the singlet stays the ground at every field
strength: its ten states split, the lowest of them {{lf.axGround}}-fold, an orbital doublet that a distortion could act
on, and the lowest triplet stays {{lf.axTrip}} eV up, the free ion's gap. At the corners the three-fold set is lowest,
and two electrons in it favour a triplet: the singlet holds until the one-electron spread $\Delta$ reaches
{{lf.coCross}} eV, and a triplet is the ground beyond, but only just, {{lf.coGap}} eV below the singlet even at $\Delta$ =
{{lf.coDmax}} eV. The 24-cell splits the d subshell not at all ({{lf.c24}}): its vertices average every harmonic of
degree 2 and 4 to zero, as the icosahedron does for ours, so a d ion in that site keeps its free-ion terms. Ours'
Ti²⁺ (3d²) is the check, with its triplet the ground at every field in both shapes, as @tanabe1954 found for d².
These are point charges, a model of the field's symmetry rather than of its size (`atom/tools/ligandd2.mjs`,
`data/ligandd2.json`).

## 8 · The table

**8.1 Rows and noble gases.** The table's rows hold {{table.rows}} elements (and {{table.lastRow}} of the next by
element 140), and its noble gases are elements {{table.nobles}}, each a peak of the first ionization energy (figures
2 and 3). Those are the rows the generalized Madelung rule of @negadi1996 gives when it is applied to four
dimensions, which they stated for any dimension and worked out for two. To our knowledge this is the first
self-consistent table that confirms them in four dimensions. The rule is a filling order. It builds the table's skeleton of rows and
blocks, which is how figure 2 is drawn. Like Madelung's rule in ours, it doesn't promise each
atom's ground configuration, and ours has exceptions to it, chromium and copper the first of about twenty. Read
that way, {{nk.match}} of the 140 ground configurations are exactly the rule's. Each of the other {{nk.n}} moves one
or two electrons from one subshell to another: {{nk.sd}} from the outer s
into the d or f subshell below it ({{nk.sd2}} of them two electrons), as our chromium, copper and palladium do, and
the other {{nk.otherN}} between other pairs: {{nk.other}}. The solver finds more of these than there are. Over our
first 36 elements it departs from the rule {{nk.ours}} times ({{nk.oursList}}), where the measured configurations depart
{{nk.real}} times ({{nk.realList}}). The reason is its lean toward d (section 6.3), so the 4D count is likely too high,
and these departures, not the rows, are where the table is least sure. Part III asks how much of the table the law
decides.

**8.2 The hardest-held electron isn't a noble gas's.** Element 128 has an 18-electron d shell, full, with nothing
outside it. It holds its outermost electron at {{ion.128}} eV, harder than its row's noble gas 138 ({{ion.138}} eV) and
harder than any other atom in the table. Element 68, the same kind a row up, comes within a volt of its noble gas 78
({{ion.68}} eV against {{ion.78}}). Ours goes the other way: palladium's full 4d¹⁰ gives up an electron at 8.3 eV,
xenon at 12.1 [@nist-handbook]. Searching each ion for its own ground state leaves element 128's ionization where
it was. Seven other ions do rearrange, and their ionizations drop: {{ion.re4}} eV. The main table carries those. Section 9 shows the law does it.

**8.3 Inside the rows.** Figure 4 draws six atoms in profile: their radial densities, and what each one's outermost
orbital looks like on the 3-sphere (figure 5). The same two pictures for every element, from the same solver, are on
the interactive table, where picking an element draws them and any of its subshells can be cut by any of the six planes
of four-dimensional space ([four.mino.mobi/table](https://four.mino.mobi/table/#128); a link ending `#Z` opens on
element Z). Where the filling departs from the simple order, and how the ionization energy and the radius run with Z,
are in the data files (table4.csv).

**8.4 Valence states.** Chemistry can pay to move an electron if the bonds it then makes pay more, so the reference
records the cost. For each of {{val.n4}} representative atoms, every configuration one electron away from the ground
(any electron near the top moved to any subshell near the top) was solved by local exchange and by Hartree–Fock (table
1; all {{val.n4}} with the ground's spin ladder in `data/valence.json`). Ours is the calibration, {{val.nCal}} states
against NIST's levels [@nist-handbook]. Moving an electron into a higher shell of the kind that makes a Rydberg series
is good to a median {{val.ryd}} eV ({{val.nRyd}} states). The s→p promotion, the price of hybrid bonding, is not. For
atoms whose p shell is less than half full ({{val.spEarlyEl}}) both methods make it too cheap, by {{val.spEarly}} eV,
the near-degeneracy of an s² pair with p² that neither method holds; past half full ({{val.spLateEl}}) they make it too
dear ({{val.spLate}} eV), where the measured state mixes with others. In four dimensions the p subshell holds eight, so
every second-row atom up to element 8 is in the first group: element 4's 2s→2p costs {{val.d4}} eV by the two methods,
darbon's (element 7) {{val.d7}} eV, element 14's 3s→3p {{val.d14}} eV, and on our evidence each is probably a volt or
two short of the true cost. Element 26's three lowest moves (into 4p, from 4s into 3d, from 3d into 4p) lie within
0.2 eV of each other by Hartree–Fock and a volt apart by local exchange, so its chemistry has several states to draw
on and the methods disagree about which is cheapest. For element {{val.below}} Hartree–Fock finds a state below the
table's ground, the open configuration of section 6.6.

{{val.table}}

Table: **Table 1.** Valence states of representative four-dimensional atoms: the ground configuration (outer subshells)
and the three lowest configurations one electron away by Hartree–Fock, each labelled by the move and given by local
exchange and Hartree–Fock (eV above each method's own ground; a negative value is a state below the table's ground).
