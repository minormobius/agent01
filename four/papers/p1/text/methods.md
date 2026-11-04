# Methods (draft)

<!-- Source. Every {{token}} is filled by papers/p1/build.mjs from the code or the ledger; the build fails on a token it
     doesn't know, so a number here can't drift from what the solver does. The rendered draft is ../draft/methods.md. -->

## The law inside an atom

An atom here is a point nucleus of charge Z and Z electrons, non-relativistic, with every pair of charges interacting
through the pinned potential q₁q₂/r in four spatial dimensions. The same law acts between an electron and the nucleus
and between two electrons; nothing in the method borrows Gauss's law. Atomic units throughout (hartree, bohr).

Each electron moves in the field of the nucleus and of the other electrons' clouds, averaged over directions, so the
problem is radial. In D dimensions a wavefunction R(r)Y_l, written as u = r^((D−1)/2) R, obeys

  −½ u″ + [ L(L + 1)/2r² + V(r) ] u = ε u,  L = l + (D − 3)/2,

so four dimensions differ from ours by the half-integer shift of L (L = l + ½) and by the degeneracies: a subshell of
angular momentum l holds 2(2l + 1) electrons in ours and 2(l + 1)² in four dimensions. With V = −Z/r the levels are
−Z²/2(n + (D − 3)/2)², so 4D hydrogen's ground state is −2/9 hartree; the solver gives {{h4.E}} (section 7).

**The clouds' potential.** A spherical shell of charge at radius s, felt at radius r, gives in ours 1/max(r, s) (the
shell theorem). In four dimensions under 1/r it gives k(t)/max(r, s), t = min/max, with k the 1/r kernel averaged over
a 3-sphere,

  k(t) = (2/π) ∫₀^π sin²θ (1 + t² − 2t cos θ)^(−½) dθ,

which falls from k(0) = 1 to k(1) = 8/3π = {{kernel.k1}} (appendix A; Simpson's rule on {{kernel.M}} intervals, then a
table of {{kernel.table}} points with linear interpolation). Every electron–electron term in the self-consistent
field, its energy and the ionized atom's goes through this kernel. That is where the missing shell theorem enters the
atom: an inner cloud screens the nucleus from an outer electron only partly.

**Exchange.** Local exchange from the uniform electron gas of the same dimension and the same law, ε_x(ρ) = −C_D ρ^(1/D)
per electron, with C₃ = ¾(3/π)^⅓ = {{exchange.c3}} and C₄ = 16/(15√π) = {{exchange.c4}}, taken from Loos and Gill's
general-D formulas for 1/r jellium (appendix B). Spins are polarized by Hund's rule (a subshell fills one spin first),
and each electron's own share is removed from both its Hartree and its exchange potential: the Hartree term by its own
orbital's cloud, the exchange term by the fully polarized exchange of that orbital alone (a Perdew–Zunger-style
correction). There is no correlation term.

## Solving one configuration

The radial equation is solved on a logarithmic grid of {{grid.N}} points from r₀ = {{grid.r0}} to {{grid.rmax}} bohr
(step h = {{grid.h}} in ln r) by Numerov's method on y = u/√r, with each level found by Sturm bisection on the node
count of the outward solution ({{solve.bisect}} halvings), the outward integration stopped where h²f/12 > ½ so that
Numerov cannot fake nodes in the forbidden region, and the orbital matched to an inward solution at the turning point.

For a fixed configuration (occupations of each subshell, every orbital of a subshell sharing one radial function) the
field is iterated to self-consistency: each orbital solved in the potential of the nucleus, the others' clouds and
exchange; the new clouds mixed into the old at {{scf.mix}}; up to {{scf.iters}} iterations, stopping when the total
energy changes by less than {{scf.tol}} hartree between iterations.

*To check before submission (the checklist's solver audit): a stop on the energy can leave the far density less
converged than the energy is. The plane-wave work met exactly this in its all-electron atom. A sample per row is to be
re-solved with a pointwise density test, and the differences reported in appendix C.*

## The ground configuration

For each Z the ground configuration is searched, not assumed. The search starts from the hydrogenic filling (subshells
in order of n, then l), solves it, and refills by the orbital energies of every subshell, occupied or not, in the field
it has just found, up to {{ground.rounds}} rounds or until the filling stops changing. It then tries moving one or two
electrons between the open subshells, the two highest filled ones and the two lowest empty ones, solving each
candidate from the current field. A candidate counts only if its field settles: an unsettled field can report an
energy far too low, since with exchange a barely bound orbital can drift for hundreds of iterations. The lowest settled
energy is the ground state.

For {{table.repairedCount}} elements of the 4D table ({{table.repaired}}) the first search landed on an unsettled
field. They were searched again seeded from both neighbours' configurations with one or two electrons added or taken,
each seed solved from scratch, and the lowest settled one kept.

The first ionization energy is ΔSCF: the ion's own ground state with an electron taken from whichever of the
{{ion.candidates}} least-bound occupied subshells leaves it lowest, relaxed from the atom's field, minus the atom's
energy. Koopmans' orbital energies are not used.

The table is {{table.n4}} elements in four dimensions and {{table.n3}} in ours, baked once (on GitHub's runners past
Z ≈ 80) into a single generated file, which a selftest re-solves in sample on every change.

## The counterfactual

To separate what the table owes to the law from what it owes to the geometry, every 4D element is solved a second time
with the shell theorem forced on: the clouds' potential taken as 1/max(r, s) (our kernel) while everything else, the
4D kinetic operator, the degeneracies, exchange, the search, stays as it was. Each element's search is seeded with the
real table's configuration and its neighbours' ± one electron, so the counterfactual isn't a weaker search; and the
real law is re-solved in each counterfactual configuration, to check the real table's configuration is still the lower
one. *(Run `lawtable-shell`; results pending.)*

## One electron, any law

The arguments of section 2 use a separate solver for one electron in any central potential (`laws.js`): the same
radial equation and Numerov–Sturm method on a grid whose inner end can be moved, which is what tests a fall to the
centre. For V = −α/r² it finds no level below α = ½ on any grid and, above it, a lowest level that scales as 1/r₀²
(section 2.1); for V = −1/rᵖ it gives the splittings within each shell (section 3.1). Its check is 4D hydrogen:
{{laws.h4}} against −2/9.

## Checks

Every method above has a known-answer test in the selftest, run on every change: hydrogen in both worlds (block 1), the
radial solver (2), the kernel against direct integration (3), exchange against the electron-gas constants (4, 18), the
ground search (5, 7), two-electron atoms against an independent Gaussian Hartree–Fock code in four dimensions and MP2
against PySCF in ours (17, 43), our table against measured values (6: {{configs3}} configurations; ionization to a
{{ion3.median}} median error), and this paper's own claims recomputed from the bake (67).
