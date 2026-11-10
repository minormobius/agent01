# Part I · The law (draft)

<!-- Source. Display maths in $$ TeX $$, inline in $…$ (pandoc renders it: page.mjs). Citations are pandoc's [@key],
     keys from refs.json (page.mjs runs citeproc on data/crossref.json's records). Every {{token}} is filled by
     papers/p1/build.mjs from the code, the bake or the ledger; the build fails on a token it doesn't know. Symbols are
     those of the notation table (text/notation.md); a new one goes there first. The arguments in full are appendix F. -->

## 2 · The law between charges

Ask what the atoms are in a world with four dimensions of space and there is no answer yet, because the question
leaves out the law between charges. In ours that law isn't a free choice. Gauss's law, which a local, linear field
theory of charge gives, spreads a point charge's field over the sphere around it, whose area grows as $r^{D-1}$, so the
potential falls as $r^{-(D-2)}$. In three dimensions that is $1/r$. In four it is $1/r^2$, and with $1/r^2$ there are
no atoms.

**2.1 Gauss's law leaves no atom.** One electron in the pull $V = -\alpha/r^2$ has the Hamiltonian
$H = -\tfrac12\nabla^2 - \alpha/r^2$, and nothing in it is a length. Stretch a wavefunction, $\psi(x) \to \psi(\lambda x)$,
and both terms scale by $\lambda^2$, so a bound level at $E < 0$ would bring one at $\lambda^2 E$ for every $\lambda$.
Either nothing binds or the levels run down without end. Hardy's inequality [@hardy-inequality] decides which: for
$\alpha \le \tfrac12$ the kinetic energy always outweighs the pull and nothing binds, and for $\alpha > \tfrac12$ the
wavefunction changes sign infinitely often on the way in and the electron falls to the centre
[@case1950; @landau-qm, §35] (appendix F.1). Our one-electron solver shows both (figure 1a). For $\alpha = 0.45$ it finds
no level on any grid. For $\alpha = 0.7$ the lowest level is {{gauss.e3}}, {{gauss.e4}} and {{gauss.e5}} hartree as the
grid's inner end moves from $10^{-3}$ to $10^{-5}$ bohr: set by where the calculation stops, not by the electron. There
is no Bohr radius, and classically no stable orbit either [@ehrenfest1917].

**2.2 The way out taken.** Something has to give: the squeeze $\hbar^2/2m_e r^2$ that resists the pull, or the pull.
An electron whose energy grows faster than $p^2$ binds under Gauss's law, at the cost of Galilean relativity for all
matter. A small fourth dimension gives back three-dimensional atoms. This universe keeps the electron and four large
dimensions and changes the law: the potential between charges falls as $1/r$. The choice between the first route and
this one is a judgement, stated as one (appendix F.2): the electron route keeps our Faraday cages, the law route keeps
our mechanics.

**2.3 Only 1/r keeps a shell together.** Any pull $-1/r^\eta$ with $0 < \eta < 2$ binds and has a length of its own.
What singles out $\eta = 1$ is a symmetry. Under $1/r$ every bound orbit is a closed ellipse [@bertrand2007], so the
Runge–Lenz vector $A_i = \sum_j L_{ij}\,p_j - Z x_i/r$ is conserved, and in quantum mechanics the rotations SO($D$)
together with $\mathbf A$ generate SO($D + 1$) [@fock1935; @alliluev1958; @bander1966]. A level of hydrogen is then the
set of degree-$(n - 1)$ harmonics on a sphere one dimension up, so every $l$ below $n$ shares the energy, in four
dimensions $-Z^2/2(n + \tfrac12)^2$. With $(l + 1)^2$ orbitals to each $l$, shell $n$ holds 2, 10, 28, 60 electrons: a
group of levels with a gap above it. Without the symmetry nothing holds the $l$ together. On the same solver 2p sits
{{split.p08}} from 2s at $\eta = 0.8$, {{split.p1}} at $\eta = 1$, {{split.p12}} at 1.2 and {{split.p15}} at 1.5, as a
fraction of the shell's binding (figure 1b). Rows would still form under another exponent, but they would have to be
found anew for each, and the generalized Madelung rule, which starts from hydrogen's degeneracy, wouldn't apply. Under
$1/r$ the rows come from counting harmonics, which is what lets Part III tell the geometry's share of the table from
the law's (appendix F.3).

**2.4 What 1/r costs: the shell theorem.** In four dimensions $\nabla^2(1/r) = -1/r^3$ away from the charge, so there
is no Gauss's law for it: the flux through a sphere round a charge grows with the sphere (appendix F.4). A thin
spherical shell of charge with radius $s$, felt at radius $r$, gives $\kappa(t)/\max(r, s)$, $t = \min(r, s)/\max(r, s)$,
with $\kappa$ the law's $1/|x - y|$ averaged over the shell. In ours $\kappa = 1$, the shell theorem, because $1/r$ is
harmonic and a harmonic function averages over a sphere to its value at the centre. Here the Laplacian is negative, so
$\kappa < 1$: it falls from 1 to $\kappa(1) = 8/3\pi$ = {{kernel.k1}} at the shell (appendix A, figure A1). Three things
follow. An inner cloud screens the nucleus from an outer electron only partly. A hollow conductor's centre sits at
$3\pi/8$ = {{cage.ratio}} of its wall's potential, so there is no Faraday cage. And a neutral atom is felt from
outside, as $-Q/8R^3$ at a distance $R$, with $Q = \sum\langle r^2\rangle$ over its electrons (section 7). Everything
distinctive in Part III comes from here.

**2.5 Where 1/r comes from, and what is declared.** A potential $1/r^\eta$ in $D$ dimensions is the Fourier transform
of $1/k^{D-\eta}$, so the pinned law needs $1/k^3$ where Maxwell's statics give $1/k^2$. No local field equation gives
it. Of the five routes we examined (appendix F.5), the one that survives is a vacuum whose permittivity grows with
wavenumber, $\varepsilon_0\ell k$ with $\ell$ a length [@tarasov2013]. With the permeability $\mu_0/\ell k$, the fields
$\mathbf D/\varepsilon_0$ and $\mu_0\mathbf H$ obey four-dimensional Maxwell's equations exactly, and what pushes a
charge is that light seen through a lens, $\mathbf E = (\mathbf D/\varepsilon_0)/\ell k$; we call it the **lens
vacuum**. Its price is relativity, for the force between charges only: the static $1/r$ acts across space at once.
This paper uses only its statics, which are all an atom's ground state needs. The free electron keeps its own
relativity, which the lens vacuum gives up only for the force between charges, and that fixes how many electrons an
orbital holds. In 4 + 1 dimensions the smallest Dirac electron has four components, the product of the four spatial
Dirac matrices serves as time's, and a slow electron keeps the two components of one chirality, which turn with one
half of a four-dimensional rotation only: two spin states, two to an orbital (appendix F.6). A four-state electron is
possible in principle and would double every shell. What stays declared is that the electron is the smallest spinor and
that it obeys Pauli's exclusion, which in ours the spin-statistics theorem derives from a local, relativistic theory, as
the force here is not. Nuclei are point charges stable to $Z = 140$, and the fine-structure constant is small, so atoms
are solved without relativity. Single atoms don't collapse (their energies follow the Thomas–Fermi
$Z^{5/2}$ [@kventsel1981], fitted exponent {{tf.exp4}}), but the stability of matter in bulk, whose proofs in ours lean
on the shell theorem, is open (appendix F.7).
