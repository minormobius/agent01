# Methods (draft)

<!-- Source. Display maths in $$ TeX $$ (pandoc renders it: page.mjs). Every {{token}} is filled by papers/p1/build.mjs from the code or the ledger; the build fails on a token it
     doesn't know, so a number here can't drift from what the solver does. The rendered draft is ../draft/methods.md. -->

## 5 · Methods

**5.1 The code.** Everything in this paper is computed by code written for it: JavaScript with no outside libraries, run under Node.js,
and the same files run in a browser (four.mino.mobi/atom). The atom is `atom/js/atom.js`, with the shell kernel in
`kernel.js`. One electron in any law is `papers/p1/laws.js`, and the terms of open subshells are `atom/tools/hund.mjs`
and `termtable.mjs`. Nothing is taken from a quantum-chemistry package. Two independent codes check it (appendix E.2):
`atom/js/gauss.js`, Hartree–Fock in a Gaussian basis [@boys1950] for any $D$, with the integrals of McMurchie and
Davidson [-@mcmurchie1978], and in ours PySCF [@sun2018; @sun2020]. Every number quoted is read from the code's output by the paper's build
(appendix F).

**5.2 The law inside an atom.** An atom here is a point nucleus of charge $Z$ and $Z$ electrons, non-relativistic, with every pair of charges interacting
through the pinned potential $q_1q_2/r$ in four spatial dimensions. The same law acts between an electron and the nucleus
and between two electrons; nothing in the method borrows Gauss's law. Atomic units throughout (hartree, bohr).

Each electron moves in the field of the nucleus and of the other electrons' clouds, averaged over directions, so the
problem is radial. In $D$ dimensions a wavefunction $\psi = r^{-(D-1)/2}\,u(r)\,Y$, with $Y$ a harmonic of degree $l$ on the
$(D - 1)$-sphere, has a radial function $u$ that obeys

$$-\tfrac12\,u'' + \Big[\frac{L(L+1)}{2r^2} + V(r)\Big]\,u = \varepsilon\,u, \qquad L = l + \frac{D-3}{2},$$

so four dimensions differ from ours by the half-integer shift of $L$ ($L = l + \tfrac12$) and by the degeneracies: a
subshell of angular momentum $l$ holds $2(2l + 1)$ electrons in ours and $2(l + 1)^2$ in four dimensions. With
$V = -Z/r$ the levels are $-Z^2/2(n + (D - 3)/2)^2$, so 4D hydrogen's ground state is $-2/9$ hartree; the solver gives
{{h4.E}} (appendix E.1).

**5.3 The clouds' potential.** A spherical shell of charge at radius $s$, felt at radius $r$, gives in ours
$1/\max(r, s)$ (the shell theorem). In four dimensions under $1/r$ it gives $\kappa(t)/\max(r, s)$,
$t = \min/\max$, with $\kappa$ the $1/r$ kernel averaged over a 3-sphere,

$$\kappa(t) = \frac{2}{\pi}\int_0^\pi \frac{\sin^2\theta\,d\theta}{\sqrt{1 + t^2 - 2t\cos\theta}},$$

which falls from $\kappa(0) = 1$ to $\kappa(1) = 8/3\pi$ = {{kernel.k1}} (appendix A; Simpson's rule on {{kernel.M}} intervals, then a
table of {{kernel.table}} points with linear interpolation). Every electron–electron term in the self-consistent
field, its energy and the ionized atom's goes through this kernel. That is where the missing shell theorem enters the
atom: an inner cloud screens the nucleus from an outer electron only partly.

**5.4 Exchange.** Local exchange from the uniform electron gas of the same dimension and the same law,
$\varepsilon_x(\rho) = -A_D\,\rho^{1/D}$ per electron for an electron density $\rho$, with
$A_3 = \tfrac34(3/\pi)^{1/3}$ = {{exchange.c3}} and $A_4 = 16/15\sqrt\pi$ = {{exchange.c4}}, as in the general-$D$ formulas
of @loos2016 for $1/r$ jellium (appendix B). Spins are polarized by Hund's rule (a subshell fills one spin first),
and each electron's own share is removed from both its Hartree and its exchange potential: the Hartree term by its own
orbital's cloud, the exchange term by the fully polarized exchange of that orbital alone, in the manner of the self-interaction correction of @perdew1981. There is no correlation term. That is an omission, not a gap in what is known:
the arbitrary-dimensional exchange is old [@glasser1983], and the correlation of the $1/r$ electron gas has been
computed in any dimension, four included, by the random-phase approximation [@schlesier2020] and beyond it
[@pham2023]. We have not implemented or tested a four-dimensional correlation functional; the later paper's numbers
carry a correction to the earlier one's coefficients that would have to be settled first.

**5.5 Solving one configuration.** The radial equation is solved on a logarithmic grid of {{grid.N}} points from $r_0$ = {{grid.r0}} to {{grid.rmax}} bohr
(step $h$ = {{grid.h}} in $\ln r$) by Numerov's method on $y = u/\sqrt r$, with each level found by Sturm bisection on the node
count of the outward solution ({{solve.bisect}} halvings), the outward integration stopped where $h^2 f/12 > \tfrac12$ (for $y'' = f\,y$) so that
Numerov cannot fake nodes in the forbidden region, and the orbital matched to an inward solution at the turning point.

For a fixed configuration (occupations of each subshell, every orbital of a subshell sharing one radial function) the
field is iterated to self-consistency: each orbital solved in the potential of the nucleus, the others' clouds and
exchange; the new clouds mixed into the old at {{scf.mix}}; up to {{scf.iters}} iterations, stopping when the total
energy changes by less than {{scf.tol}} hartree between iterations.

**5.6 The stop, against one 10⁵ times tighter.** A stop on the energy can leave the far density less converged than the energy is; the
plane-wave work met exactly that in its pseudopotentials' all-electron atom, where exchange carried an unconverged tail
into the potential. So {{audit.n}} atoms across every row of both worlds were re-solved in their baked configurations
and then driven on from that field to a stop of {{audit.tightTol}} hartree (appendix C, `audit-scf.mjs`). Total
energies and first ionization energies moved by at most {{audit.dE}} and {{audit.dIon}} hartree, the outermost orbital
energy by {{audit.dEps}}, and $Q = \sum\langle r^2\rangle$ (the far pull's, and the forces between atoms') by {{audit.dS}} of itself; the
baked $\langle r^2\rangle$ agree with the tight ones to {{audit.bakeS}}. The density beyond about 15 bohr is not converged relatively,
but it is noise there: off by large factors only where it is 10⁻¹³ to 10⁻¹⁷ electrons per bohr, and converged to
10⁻⁶ where an atom has a loosely held s electron that puts real charge out that far. Nothing the paper quotes depends
on it; a calculation that builds a potential from the far density through exchange must converge the density
pointwise, as the pseudopotentials now do.

**5.7 The radial grid, against six others.** {{conv.n}} atoms from every row of both worlds were re-solved in their baked
configurations on six other grids, changing one of the number of points (500, 1000), the inner end (10⁻⁴, 10⁻⁶ bohr) and
the outer end (100, 250 bohr) at a time (appendix C, `convergence.mjs`). First ionization energies moved by at most
{{conv.dIon}} hartree on any of them. Total energies moved by at most {{conv.dE}} hartree, {{conv.dErel}} of themselves,
the largest for our own krypton, whose 1s sits deeper than any four-dimensional atom's and is the grid's hardest case.
The paper quotes ionization energies and energy differences, not total energies.

**5.8 The ground configuration.** For each $Z$ the ground configuration is searched, not assumed. The search starts from the hydrogenic filling (subshells
in order of n, then l), solves it, and refills by the orbital energies of every subshell, occupied or not, in the field
it has just found, up to {{ground.rounds}} rounds or until the filling stops changing. It then tries moving one or two
electrons between the open subshells, the two highest filled ones and the two lowest empty ones, solving each
candidate from the current field. A candidate counts only if its field settles: an unsettled field can report an
energy far too low, since with exchange a barely bound orbital can drift for hundreds of iterations. The lowest settled
energy is the ground state.

For {{table.repairedCount}} elements of the 4D table ({{table.repaired}}) the first search landed on an unsettled
field. They were searched again seeded from both neighbours' configurations with one or two electrons added or taken,
each seed solved from scratch, and the lowest settled one kept.

The first ionization energy is ΔSCF, a difference of two self-consistent energies: the ion's own ground state with an electron taken from whichever of the
{{ion.candidates}} least-bound occupied subshells leaves it lowest, relaxed from the atom's field, minus the atom's
energy. Koopmans' orbital energies are not used.

The table is {{table.n4}} elements in four dimensions and {{table.n3}} in ours, baked once (on GitHub's runners past
$Z \approx 80$) into a single generated file, which a selftest re-solves in sample on every change.

**5.9 The terms of open subshells.** The search above gives every open subshell Hund spins. Section 6 finds where that's wrong, and the table is corrected
for it. Each d- and f-block element is searched again, seeded as the repair pass seeds, and every settled candidate's
energy gets its open subshells' term correction: the lowest term less the lowest maximum-spin term. That comes from
the subshell's own repulsion on that candidate's own orbital (`atom/tools/termtable.mjs`). It is zero wherever Hund's
first rule holds. The ionization is corrected the same way on both sides. Fillings whose spin blocks are too large to
solve per candidate take the survey's verdict (section 6.2), which for them is that the rule holds.

**5.10 The counterfactual.** To separate what the table owes to the law from what it owes to the geometry, every 4D element is solved a second time
with the shell theorem forced on: the clouds' potential taken as $1/\max(r, s)$ (our kernel) while everything else, the
4D kinetic operator, the degeneracies, exchange, the search, stays as it was. Each element's search is seeded with the
real table's configuration and its neighbours' ± one electron, so the counterfactual isn't a weaker search; and the real
law is re-solved in each counterfactual configuration, to check that the real table's configuration is still the lower
one under the law. Where no candidate's field settled, a second, wider search started from every configuration in reach
(the real table's for the element and its neighbours ± one electron, the unsettled filling, and the counterfactual's own
neighbours ± one), each solved from scratch with the clouds mixed at {{repair.mix}} for up to {{repair.iters}}
iterations. A counterfactual atom counts as settled only if its field converged and its first ionization energy is
positive (a negative one means an electron would rather leave: the search missed a lower configuration). By that rule
{{cf.settled}} of {{cf.n}} settle, every atom up to {{cf.through}}; the rest ({{cf.unsettled}}) are row 6's f block and the first elements after it.

**5.11 One electron, any law.** The arguments of section 2 use a separate solver for one electron in any central potential (`laws.js`): the same
radial equation and Numerov–Sturm method on a grid whose inner end can be moved, which is what tests a fall to the
centre. For $V = -\alpha/r^2$ it finds no level below $\alpha = \tfrac12$ on any grid and, above it, a lowest level that scales as $1/r_0^2$
(section 2.1); for $V = -1/r^\eta$ it gives the splittings within each shell (section 3.1). Its check is 4D hydrogen:
{{laws.h4}} against $-2/9$.

**5.12 A second method: Hartree–Fock.** To see which configurations depend on the choice of method, every element
is solved a second way, by numerical Hartree–Fock (`hf.js`): one radial function per subshell on its own logarithmic
grid, exact exchange instead of local exchange, and the energy the average over the subshells' maximum-spin
arrangements, to which each open subshell's whole term correction (its lowest term less that average, section 5.9's
machinery on the Hartree–Fock orbitals) is added. Exchange between subshells is expanded in the Gegenbauer
coefficients of $1/|\mathbf x - \mathbf y|$, each radial kernel a convolution on the logarithmic grid; in four
dimensions the coefficients are tabulated by quadrature, $a_0$ being the shell kernel $\kappa$. The candidates are the
local-exchange search's settled configurations within {{hf.window}} eV of its ground, so both methods rank the same
set. A configuration with an empty subshell below an occupied one of the same $l$ (sodium's $4s^1$ with $3s$ empty) is
left out of the Hartree–Fock ranking: the variational solve drops the electron into the empty lower subshell and
returns the compact configuration's energy under the other name. The energies carry an $O(h^2)$ error from the
kernel's kink at $r = r'$, so absolute energies are extrapolated from steps 0.02 and 0.01; differences converge at
0.02, where the ranking is done. Checks (block 71): our He, Ne, N ⁴S, C ³P and Fe ⁵D against the numerical
Hartree–Fock limits to 2 × 10⁻⁵ hartree, and four-dimensional closed shells against the Gaussian code.

**5.13 A known-answer test for every method.** Every method above has a known-answer test in the selftest, run on every change: hydrogen in both worlds (block 1), the
radial solver (2), the kernel against direct integration (3), exchange against the electron-gas constants (4, 18), the
ground search (5, 7), two-electron atoms against an independent Gaussian Hartree–Fock code in four dimensions and MP2
against PySCF in ours (17, 43), Hartree–Fock against its known limits (71), our table against measured values (6:
{{configs3}} configurations; ionization to a {{ion3.median}} median error), and this paper's own claims recomputed from
the bake (67).
