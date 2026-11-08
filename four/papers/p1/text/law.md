# Part I · The law (draft)

<!-- Source. Display maths in $$ TeX $$, inline in $…$ (pandoc renders it: page.mjs). Citations are pandoc's [@key],
     keys from refs.json (page.mjs runs citeproc on data/crossref.json's records). Every {{token}} is filled by
     papers/p1/build.mjs from the code, the bake or the ledger; the build fails on a token it doesn't know. Symbols are
     those of the notation table (text/notation.md); a new one goes there first. -->

## 2 · Why a law has to be chosen

Ask what the atoms are in a world with four dimensions of space and there is no answer yet, because the question
leaves out the law between charges. In our world that law isn't a free choice. Gauss's law, which is what a local,
linear field theory of charge gives, says the field of a point charge spreads over the sphere around it. The sphere's
area grows as $r^{D-1}$, so the field falls as $r^{-(D-1)}$ and the potential as $r^{-(D-2)}$. In three dimensions that
is $1/r$. In four it is $1/r^2$, and with $1/r^2$ there are no atoms.

**2.1 Gauss's law leaves no atom.** One electron in the pull $V = -\alpha/r^2$ has the Hamiltonian
$H = -\tfrac12\nabla^2 - \alpha/r^2$, and nothing in it is a length. Stretch a wavefunction, $\psi(x) \to \psi(\lambda x)$,
and both terms scale by $\lambda^2$. So if there were a bound state of energy $E < 0$ there would be one at
$\lambda^2 E$ for every $\lambda$: a lowest level, and with it a size for the atom, is impossible. Either nothing binds
or the levels run down without end. Which of the two happens is decided at the origin. Close in, an s wavefunction
goes as $r^\sigma$ with

$$\sigma(\sigma + D - 2) + 2\alpha = 0, \qquad \sigma = -1 \pm \sqrt{1 - 2\alpha} \quad (D = 4).$$

For $\alpha \le \tfrac12$ the roots are real, and Hardy's inequality [@hardy-inequality]

$$\int |\nabla\psi|^2 \;\ge\; \Big(\frac{D-2}{2}\Big)^2 \int \frac{|\psi|^2}{r^2} \;=\; \int \frac{|\psi|^2}{r^2} \quad (D = 4)$$

says the kinetic energy $\tfrac12\int|\nabla\psi|^2$ always outweighs the pull: $H \ge 0$, and nothing binds. For
$\alpha > \tfrac12$ the roots are complex and the wavefunction near the origin is
$r^{-1}\cos\!\big(\sqrt{2\alpha - 1}\,\ln r + \delta\big)$. It changes sign infinitely often on the way in, and every node
below a level means another level beneath it, so there is no lowest one: the electron falls to the centre
[@case1950; @landau-qm, §35].

A calculation shows both. Our one-electron solver (`laws.js`, appendix D) integrates the radial equation of section 5
by Numerov's method on a logarithmic grid that stops at an inner radius $r_0$, and finds each level by bisecting on the
number of nodes. For $\alpha = 0.45$ it finds no bound level on any grid. For $\alpha = 0.7$ the lowest level is
{{gauss.e3}}, {{gauss.e4}} and {{gauss.e5}} hartree with $r_0 = 10^{-3}$, $10^{-4}$ and $10^{-5}$ bohr. It grows as
$1/r_0^2$ ($\varepsilon r_0^2$ = {{gauss.c3}}, {{gauss.c5}}), set by where the calculation stops rather than by the
electron (figure 1a). Either way there is no Bohr radius, no size an atom could settle at. Ehrenfest made the
classical version of this argument [@ehrenfest1917]: under Gauss's law in four dimensions no planetary orbit is stable
either.

**2.2 The ways out, and what each costs.** Something has to give. The squeeze that resists the pull costs
$\hbar^2/2m_e r^2$, because the electron's energy grows as the square of its momentum $p$. The pull goes as $1/r^2$
because of Gauss. Change either and a length comes back. One way is to change the electron: an energy growing as
$p^3$ or $p^4$ outgrows a $1/r^2$ pull close in, so atoms bind at every strength. It keeps Gauss's law, and with it
the shell theorem and the Faraday cage. But it gives up Galilean relativity for all matter: a moving laboratory and a
still one see the same physics only if energy is quadratic in momentum. Another is a small fourth dimension, the way
extra dimensions could hide in ours. But atoms larger than it are three-dimensional atoms and smaller ones fall again,
so it doesn't give four-dimensional chemistry. The third is to change the law: keep the electron, keep four large
dimensions, and make the potential between charges fall as $1/r$. This universe takes the third, and the rest of
part I says why $1/r$ and what it costs. The choice between the first and the third is a judgement, stated as one: the
electron route keeps our Faraday cages, the law route keeps our mechanics.

## 3 · Why 1/r, exactly

**3.1 Only 1/r keeps a shell together.** Any pull $V = -1/r^\eta$ with $0 < \eta < 2$ binds, and has a length of its
own. The squeeze $\hbar^2/2m_e r^2$ beats the pull close in, the pull beats it far out, and they balance at a size
that scales as $(\hbar^2/m_e)^{1/(2-\eta)}$. So $\eta = 1.5$ would give atoms with a size, and so would $\eta = 0.8$. What
singles out $\eta = 1$ is a symmetry that no other exponent has.

Classically, under $1/r$ every bound orbit is a closed ellipse. By Bertrand's theorem only $1/r$ and $r^2$ do that
[@bertrand2007], and $r^2$ confines rather than falling off; asking for closed orbits is a criterion for choosing the
law, not something every atom needs. An orbit in a central potential lies in the plane of its starting position and
velocity in any number of dimensions [@fiorani2009], so the planar theorem holds in four. A
closed ellipse keeps a fixed direction, its long axis. So the motion conserves a vector besides the angular momentum,
the Runge–Lenz vector $A_i = \sum_j L_{ij}\,p_j - Z x_i/r$, where $L_{ij} = x_i p_j - x_j p_i$ is the angular
momentum in the plane $ij$. Under any other exponent the ellipse precesses, its axis turns, and $\mathbf A$ isn't
conserved.

In quantum mechanics the rotations of $D$-dimensional space, SO($D$), together with the $D$ components of $\mathbf A$
generate the rotations of a space with one dimension more, SO($D + 1$). Fock found this by carrying momentum space onto
a sphere one dimension up [@fock1935], Alliluev carried the construction to $D$ dimensions [@alliluev1958], and Bander
and Itzykson worked out the group theory [@bander1966]. Why it
happens only for $1/r$ can be put in one line. The Schrödinger equation in momentum space contains the potential's
Fourier transform. For $1/r^\eta$ in $D$ dimensions that is $1/k^{D-\eta}$, which for $\eta = 1$ is $1/k^{D-1}$. Carried
onto the sphere, $1/k^{D-1}$ becomes, up to factors the projection itself supplies, Gauss's potential of a point
charge in $D + 1$ dimensions, and the natural functions of that are the sphere's own harmonics. For any other $\eta$ the transform carries over to something else, and the
larger symmetry is lost.

The symmetry does the work. States that the larger rotations carry into one another must have the same energy. A
level of hydrogen is the set of degree-$(n - 1)$ harmonics on that sphere, and the ordinary rotations split this set
into $l = 0, 1, \dots, n - 1$. So every $l$ below $n$ shares the energy, which in four dimensions is
$-Z^2/2(n + \tfrac12)^2$. With $(l + 1)^2$ orbitals to each $l$, shell $n$ holds $\sum_{l<n} 2(l + 1)^2$ electrons:
2, 10, 28, 60. That degeneracy is what makes a shell, a group of levels with a gap above it.

Without the symmetry nothing holds the $l$ together. On the same solver, 2p sits {{split.p08}} from 2s at $\eta = 0.8$,
{{split.p1}} at $\eta = 1$, {{split.p12}} at $\eta = 1.2$ and {{split.p15}} at $\eta = 1.5$ (as a fraction of the shell's
binding; 3d against 3s goes the same way, {{split3.p15}} at $\eta = 1.5$; figure 1b). Below 1 the electron with more
angular momentum is the more bound, above it the less. So under $\eta = 1.5$ a one-electron atom's 2p is bound little
more than a third as hard as its 2s, and each $l$ is a level of its own. A table would still have rows, since many
electrons split the $l$ in ours too. But the rows would be set by how the exponent treats electrons that come near the
nucleus, and would have to be found again for every $\eta$. The generalized Madelung rule, which starts from hydrogen's
degeneracy, wouldn't apply. Under $1/r$ the rows come from counting harmonics, and that is what lets part III tell the
geometry's share of the table from the law's.

**3.2 The convention it agrees with.** The literature on hydrogen in $D$ dimensions [@nieto1979; @aljaber1998] and on
dimensional scaling [@herschbach1992] takes $1/r$ in every $D$, mostly as a convention that keeps the problem
solvable. Négadi and Kibler's generalized Madelung rule [-@negadi1996], which gives the four-dimensional rows when it is
applied to $D = 4$, builds on the same $D$-dimensional hydrogen atom. Section 3.1 is why that convention is more than one: it is the only
power law under which the question "what are the shells?" has the answer the rule needs.

## 4 · What 1/r costs in four dimensions

**4.1 It isn't harmonic.** In three dimensions $\nabla^2(1/r) = 0$ away from the charge, and that one fact is Gauss's
law. In $D$ dimensions $\nabla^2 r^{-\eta} = \eta(\eta + 2 - D)\,r^{-\eta-2}$, which vanishes only for Gauss's own
$\eta = D - 2$. In four,

$$\nabla^2 \frac{1}{r} = -\frac{1}{r^3} \qquad (r \ne 0),$$

which the solver's finite differences reproduce ({{lap.r1}} at $r = 1$, {{lap.r2}} at $r = 2$). By the divergence
theorem the flux of the field through a sphere round a charge is the integral of $-\nabla^2(1/r)$ over the ball inside
it. The integrand is $1/r^3$ and the ball's volume element $2\pi^2 r^3\,dr$, so the flux grows linearly with the
sphere's radius, as if empty space were charged with a density $\propto 1/r^3$. There is no Gauss's law for it.

**4.2 No shell theorem, no Faraday cage.** A thin spherical shell of charge with radius $s$, felt at radius $r$, gives
$\kappa(t)/\max(r, s)$, with $t = \min(r, s)/\max(r, s)$ and $\kappa$ the law's $1/|x - y|$ averaged over the shell
(section 5, appendix A). In three dimensions $\kappa = 1$, the shell theorem, and the reason is the mean-value
property: a function with zero Laplacian averages, over any sphere, to its value at the centre, and $1/|x - y|$ is
such a function of $y$. In four dimensions $\nabla^2(1/r) < 0$, and a function whose Laplacian is negative averages to
less than its value at the centre. So $\kappa < 1$: it falls from 1 at the centre to $\kappa(1) = 8/3\pi$ =
{{kernel.k1}} at the shell (figure A1). That has three consequences. A cloud of charge never acts as if it sat at its
centre. A hollow conductor's centre sits at $3\pi/8$ = {{cage.ratio}} of its wall's potential, and a charge inside is
pushed toward the wall. And a neutral atom is felt from outside, as $-Q/8R^3$ at a distance $R$, where
$Q = \sum\langle r^2\rangle$ over its electrons (section 11). Everything distinctive in part III comes from here.

**4.3 Which field theory gives 1/r.** A potential is what a field theory's static equation gives for a point charge,
and the equation is simplest in Fourier space, where each pair of derivatives becomes a factor $k^2$ of the wavenumber
$k$. Maxwell's statics give a point charge the potential $\varphi \propto 1/k^2$, and that transforms back to
$1/r^{D-2}$ in space, so $1/r^2$ in four dimensions. A potential $1/r^\eta$ in $D$ dimensions is the transform of
$1/k^{D-\eta}$, so the pinned $1/r$ needs $1/k^3$. There are five ways to get it (the site's force chapter,
four.mino.mobi/atom/force.html, works through each). Four fail something we ask of the law, and each failure is stated
with what it assumes. The third survives with a flaw that can be removed, and it is the one this paper takes.

1. *A local, relativistic field:* impossible for a quadratic field equation with finitely many derivatives. Such an
   equation is a polynomial in $k^2$, a whole number of pairs of derivatives, and $k^3 = (k^2)^{3/2}$ isn't one. (A
   non-local kernel can arise from integrating out other fields; that is route 2 or 3.)
2. *Relativistic but non-local:* the potential obeys $(k^2 - \omega^2/c^2)^{3/2}\,\varphi \propto \rho$,
   Maxwell's wave operator raised to the power $3/2$, which in space and time is an integral over all of both. This is
   the non-local electrodynamics $F\,D^{s-2}F$ of @heydeman2020 with $s = 3$ in $d = 5$ spacetime dimensions, a case
   their analysis covers ($d = s + 2 \ge 5$). There the gauge-invariant field strength has scaling dimension
   {{fields.fdim}}, below the {{fields.ffloor}} that unitarity requires of it in a conformal theory, and they expect time
   evolution not to be unitary: states of negative probability. Fractional and non-local gauge theories are not
   non-unitary as a class [@marino2014; @lanave2019]; it is this one, in the framework where the bound applies, that
   fails.
3. *A vacuum whose permittivity grows with wavenumber,* $\varepsilon_0\,\ell k$ with $\ell$ a length. The static
   equation becomes $\varepsilon_0\ell k \cdot k^2\varphi = \rho$, which is $1/k^3$, the pinned $1/r$. With the
   permeability left at $\mu_0$, light obeys $k^2 = \ell k\,\omega^2/c^2$, so $\omega = c\sqrt{k/\ell}$. It
   disperses like deep-water waves, and there is no speed of light. A permittivity rising as a power of $k$, and the
   fractional Poisson equation it gives, is known from media with power-law spatial dispersion
   [@tarasov2013; @tarasov2016]; their power $\alpha = 3$ without screening is this one, applied here in four
   dimensions. This is the route we take, and the flaw is removed below.
4. *A nonlinear vacuum,* $\nabla\cdot(|\mathbf E|^{\beta-2}\mathbf E) = \rho$. It keeps a Gauss's law, for the flux of
   $|\mathbf E|^{\beta-2}\mathbf E$ instead of $\mathbf E$. A point charge then has $|\mathbf E|^{\beta-1}r^{D-1}$
   constant, and a $1/r$ potential ($|\mathbf E| \propto 1/r^2$) needs $\beta = (D + 1)/2$ = {{fields.m}}, the
   $p$-Laplacian with $p = 5/2$, whose point solution is exactly that [@lindqvist2017]. It is a consistent theory, but
   fields no longer add: the field of two charges isn't the sum of each one's, so there is no pair potential, which an
   atom's Hamiltonian as written here needs.
5. *A small fourth dimension:* $1/r$ far away, but then atoms are three-dimensional (section 2.2).

Route 1 doesn't exist under its assumptions, route 2 has states of negative probability in the framework where that
can be shown, route 4 gives up a pair potential, and route 5 gives back three-dimensional atoms. That leaves route 3.
This is a choice among the routes found, not a proof that no other theory gives the law. The
permittivity fixes the statics, and the statics are all that the pinned law asks of it. The permeability is still
free, and it decides only how fields move. Left at $\mu_0$ it gives the dispersive light above. We choose
$\mu_0/\ell k$, and call the result the **lens vacuum**. The product of permittivity and permeability is then
$\varepsilon_0\mu_0$ at every wavenumber, so light keeps the one speed $c$. The fields $\mathbf D/\varepsilon_0$ and $\mu_0\mathbf H$ obey Maxwell's equations of empty four-dimensional space
exactly, so light is ordinary four-dimensional light at every wavelength, and the energy is never negative. What
pushes a charge is $\mathbf E = (\mathbf D/\varepsilon_0)/\ell k$, that light seen through a lens. Dividing by $k$ in
Fourier space is, in space, spreading over a kernel $1/r^3$ (the transform of $1/k$ in four dimensions), so
$\mathbf E$ at a point is a blur of $\mathbf D$ over all of space. Its statics are $1/\ell k^3$, the pinned $1/r$. The
price is relativity, for the force between charges only. The blur acts across all of space at once, so there is an
absolute "now", and a charge feels another's change instantly, a little, everywhere. We have not found this pair of
constitutive laws in the literature we read. Light at one speed and an energy that is never negative do not by
themselves make the lens vacuum a causal or quantum theory; that is for the later paper.

This paper uses only route 3's statics: charges at rest and the $1/r$ between them, which is all an atom's ground
state needs. Every choice of permeability gives the same statics, so nothing here depends on that choice, on $\ell$,
on how the lens vacuum's fields move and radiate, or on the absolute now. Those dynamics, of the same lens vacuum, are
the subject of a later paper.

**4.4 What is declared with it.** Electrons are spin-½ fermions, two to an orbital. That is stated, not derived: in our
world it follows from relativity and spin together, and this universe has given up relativity for the force. Nuclei
are point charges $+Z$, stable for every $Z$ to 140 (declared: nuclear physics in four dimensions is another paper). The
fine-structure constant is small, so atoms are solved without relativity (section 12). No other long-range field acts
on charges.

**4.5 Is matter stable?** In ours it is a theorem that $N$ atoms have an energy bounded below by a constant times $N$
[@dyson1967; @lieb1975], whatever the nuclei's positions. The usual proofs lean on the shell theorem, which fails here.
That doesn't close the question: decompositions of radial interactions that need no shell theorem exist in any
dimension [@hainzl2002], and Riesz gases, of which a $1/r$ law in four dimensions is one, have their own mathematics
[@lewin2022], though neither is a proof for electrons and nuclei here. So we give evidence, not a proof, and the
evidence is narrower than the theorem. Single atoms don't collapse. Thomas–Fermi scaling gives total energies growing as $Z^{3-2/D}$, $Z^{7/3}$ in ours and $Z^{5/2}$
in four dimensions [@kventsel1981], and the solved table follows it, with a fitted exponent of {{tf.exp4}} over $Z$ =
10–140 (ours: {{tf.exp3}} over 10–36; both a little above the asymptotic value, as finite-$Z$ corrections make them).
Separated neutral atoms don't run away either. Every force between them here (the permanent $-3Q_AQ_B/64R^5$ of
section 11, dispersion's $R^{-6}$) falls faster than $R^{-4}$, so summed over four-dimensional space each atom's share
of the far field is finite. That says nothing about atoms that overlap, trade charge or crowd together, which is
where a proof of stability has its work. Stability of matter here is open.
