# Part II · The table (draft)

<!-- Source. Every {{token}} is filled by papers/p1/build.mjs from the bake, data/termtable.json (the term-corrected
     table, the main one), data/hund.json, data/hund-law.json, data/hftable.json or the ledger. The Hund calculation in
     full is appendix H; valence states and darbon's hydride are appendix I. -->

## 4 · The table

**4.1 Rows and noble gases.** The table's rows hold {{table.rows}} elements (and {{table.lastRow}} of the next by
element 140), and its noble gases are elements {{table.nobles}}, each a peak of the first ionization energy (figures
2 and 3). Those are the rows the generalized Madelung rule of @negadi1996 gives in four dimensions; to our knowledge
this is the first self-consistent table that confirms them. The rule is a filling order, and like Madelung's in ours it
doesn't promise each atom's ground configuration. Read that way, {{nk.match}} of the 140 are exactly the rule's. Each
of the other {{nk.n}} moves one or two electrons between two subshells, {{nk.sd}} of them from the outer s into the d
or f below it, as our chromium, copper and palladium do. The solver finds more of these departures than there are:
over our first 36 elements it makes {{nk.ours}} where the measured configurations make {{nk.real}}, from its lean
toward d (appendix E.3). So the 4D count is likely too high, and these departures, not the rows, are where the table
is least sure.

**4.2 The hardest-held electron isn't a noble gas's.** Element 128 has an 18-electron d shell, full, with nothing
outside it. It holds its outermost electron at {{ion.128}} eV, harder than its row's noble gas 138 ({{ion.138}} eV) and
harder than any other atom in the table. Element 68, the same kind a row up, comes within a volt of its noble gas 78
({{ion.68}} eV against {{ion.78}}). Ours goes the other way: palladium's full 4d¹⁰ gives up an electron at 8.3 eV,
xenon at 12.1 [@nist-handbook]. Searching each ion for its own ground state leaves 128's ionization where it was.
Section 6 shows the law does it.

**4.3 How firm each configuration is.** A second method, numerical Hartree–Fock, ranks the same candidates (appendix
E.6). Agreement, the search's coverage and the margins are reported separately. Hartree–Fock and local exchange agree on
{{hf.4agree}} of the 140 ground configurations and differ on {{hf.4n}}: {{hf.4d}} in the d rows, where local exchange puts one electron
more in d, as it does in ours; {{hf.4f}} at the end of row 6's f block, where it puts one more in f; and {{hf.4oN}} at the start of
a block ({{hf.4o}}). In ours Hartree–Fock gets {{hf.oursHf}} configurations right against local exchange's {{hf.oursLda}}, and where the two
agree they are right. Agreement is not a guarantee, though: in our lanthanides both overbind f, Hartree–Fock by up to
{{hf.fB}} eV in the measured states. Taking that as a sensitivity scale (an assumption, not a bound), {{hf.fFirmN}} of the 32
elements of row 6's f block have no competitor with fewer f within it, {{hf.fOpenAgreeN}} agree with one inside it, and {{hf.fUntestedN}} agree with
none solved. The [interactive table](https://four.mino.mobi/table/) gives each element's group.

**4.4 Every element in profile.** Figure 4 draws six atoms' radial densities, and figure 5 what their outermost
orbitals look like on the 3-sphere. The same two pictures for every element are on the interactive table, where any
subshell can be cut by any of the six planes of four-dimensional space ([four.mino.mobi/table](https://four.mino.mobi/table/#128);
`#Z` opens on element Z). The configurations, energies, ionizations and radii are in `data/table4.csv`. What chemistry
starts from, each atom's valence states and a direct test of the valence rule on darbon's hydride DH₅, is in appendix I.

## 5 · Hund's first rule in four dimensions

The solver gives each open subshell the most parallel spins it can hold. That is Hund's first rule, the known answer
for the ground terms of free atoms in ours. In four dimensions it is an assumption, and for some fillings it is wrong.
To test it, every arrangement of each open subshell's electrons is diagonalized under the law, on the atom's own
orbital (appendix H.1). In ours this reproduces Racah's term separations to the wavenumber, and maximum spin is lowest
in all {{hund.n3}} open subshells of our table.

**5.1 d², d¹⁶, 4f³ and 4f²⁹ break the rule.** In four dimensions all {{hund.p4}} open p subshells keep the rule, and so
do the d fillings {{hund.dhold}}. The exceptions are d² and its mirror d¹⁶, in all three d rows: {{hund.fails4d}}. In each
the ground term is a spin singlet of ten states, and the triplet the solver assumed lies {{hund.range}} eV above it. In
the f block 4f³ (element 83) fails too, and so does its mirror 4f²⁹ (element 108), each with a ground term of spin ½,
{{hund.f3}} and {{hund.f29}} eV below the quartet. No other f filling was found to break the rule, though for the
fullest blocks only the highest spins could be run (appendix H.2).

**5.2 For d², the four-dimensional shell breaks it, not the law.** On element 26's own orbital, held fixed, Gauss's $1/r^2$ gives the same
order, the singlet {{hl.gauss}} eV below the triplet against {{hl.law}} eV under $1/r$. The cause is the shell. For two
electrons in a d subshell each term's energy is exactly $F^0 + a_2F^2 + a_4F^4$: the $F^n$ are the radial parts of the
repulsion and depend on the orbital, and the $a_n = \langle C_n(\cos\gamma)\rangle$ over the term depend only on the
term ($\gamma$ the angle between the two electrons seen from the nucleus). The ten-state singlet, $(2,0) \oplus (0,2)$
of SO(4), holds the electrons nearest right angles, $\langle\cos^2\gamma\rangle$ = {{hl.cosS4}} against random's 0.250
and the best triplet's {{hl.cosT4}}, and lies below every triplet whenever $F^4/F^2 <$ {{hl.crit}}. Element 26's orbital
has {{hl.rLaw}} under the law and {{hl.rGauss}} under Gauss's, so the rule breaks either way. In ours the triplet ³F is
the term that keeps the electrons nearest right angles, and it is the lowest for every $F^4/F^2$. Pauli keeps same-spin
electrons apart, which is the usual reason for Hund's rule; four-dimensional space gives paired spins a better way. Every
four-dimensional rotation splits into a left and a right half, a d orbital carries one unit of each, and the singlet
adds the two electrons' left halves and cancels their right ones, or the other way round. Three-dimensional rotations
don't split, so ours has no such state (appendix H.3; interactive at four.mino.mobi/atom/hund.html).

**5.3 The correction moves energies and ionizations, no configuration.** Where the rule fails, the solver's energy is
the maximum-spin state's, too high by the gap. Every d- and f-block element was searched again with each candidate's
gaps added (appendix H.4). **The terms change no ground configuration.** They lower the eight Hund-breaking atoms'
energies and move first ionizations in pairs, by {{tt.range}} eV: up for an atom whose own ground term gains the gap,
down for the next, whose ion lands on the broken filling. The wider search found one configuration the bake had
missed, element 82's 4f¹ 5d¹ 6s², our cerium's kind. The table of section 4 is the corrected one (`data/table4.csv`);
the Hund-spin table is supplement S1. In a ligand field the singlet survives on the 16-cell's eight axes and gives way
to a triplet, barely, at a tesseract's sixteen corners (appendix H.5).
