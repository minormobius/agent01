# Appendices (draft)

<!-- Source. Every {{token}} is filled by papers/p1/build.mjs from the code, data/ and the ledger. -->

## A · The 4D kernel

A thin spherical shell of unit charge and radius $s$, felt at radius $r$, gives the potential $\kappa(t)/\max(r, s)$,
where $t = \min(r, s)/\max(r, s)$ and $\kappa$ is the law's $1/|x - y|$ averaged over the shell. On the 3-sphere the
average over directions carries the weight $\tfrac{2}{\pi}\sin^2\theta\,d\theta$, so

$$\kappa(t) = \frac{2}{\pi}\int_0^\pi \frac{\sin^2\theta\,d\theta}{\sqrt{1 + t^2 - 2t\cos\theta}}.$$

In ours the same average, with weight $\tfrac12\sin\theta\,d\theta$, is exactly 1 for every $t$: the shell theorem. In
four dimensions it isn't. The integral has a closed form in the complete elliptic integrals $\mathrm K$ and $\mathrm E$ of modulus $t$,

$$\kappa(t) = \frac{4\,[(1 + t^2)\,\mathrm E(t) - (1 - t^2)\,\mathrm K(t)]}{3\pi t^2},$$

which gives $\kappa(1) = \tfrac{8}{3\pi}$ (since $\mathrm E(1) = 1$), and the series

$$\kappa(t) = 1 - \frac{t^2}{8} - \frac{t^4}{64} - \frac{5t^6}{1024} - \frac{35t^8}{16384} - \dots$$

Each term is $t^n$ times the average of the Legendre polynomial $P_n(\cos\theta)$ over the 3-sphere; the odd ones
vanish. The solver evaluates $\kappa$ by Simpson's rule in $\theta$ with {{kernel.M}} intervals, tabulated at
{{kernel.table}} points of $t$ and interpolated. The closed form agrees with that quadrature to {{kernel.closedErr}}
for $t$ up to 0.9 (ledger `kernelclosed`); nearer 1 the quadrature's own error dominates, a few parts in $10^7$.

The series' first correction is the far pull of section 7. A cloud of $N$ electrons around a nucleus $+Z$, seen from
a distance $R$ outside it, gives $\big(Z - N + \sum_i \tfrac{\langle r_i^2\rangle}{8R^2} + \dots\big)/R$. A neutral atom
therefore acts on an electron through $-\tfrac{Q}{8R^3}$ with $Q = \sum\langle r^2\rangle$, and two neutral atoms on each other
through $-\tfrac{3Q_AQ_B}{64R^5}$ (section 7). Figure A1 draws $\kappa$, and the potential inside and outside a shell.

## B · The 4D electron gas

The solver's exchange is the local form of the uniform electron gas of the same dimension and the same law. In $D$
dimensions a spin-unpolarized Fermi sea of density $\rho$ has $\rho = 2\,\Omega_D k_F^D/(2\pi)^D$, with $\Omega_D$ the
volume of the unit ball ($\pi^2/2$ for $D = 4$). Its kinetic energy per volume is $\tfrac{D}{D + 2}\,\rho\,k_F^2/2$:
$\tfrac{3}{10}(3\pi^2)^{2/3}\rho^{5/3}$ in ours (Thomas–Fermi's 2.8712), $\tfrac{4\pi}{3}\rho^{3/2}$ in four dimensions.
Its exchange energy per volume is $-A_D\,\rho^{1 + 1/D}$. In ours $A_3 = \tfrac34(3/\pi)^{1/3}$ = {{exchange.c3}},
Dirac's constant. In four dimensions under the pinned $1/r$, with the Fermi sea's density matrix built on the Bessel
function $J_2$ and the integral $\int_0^\infty J_2(x)^2\,x^{-2}\,dx = \tfrac{4}{15\pi}$, it is $A_4 = \tfrac{16}{15\sqrt\pi}$ =
{{exchange.c4}}. These agree with Loos and Gill's expressions for the $D$-dimensional gas [-@loos2016]. The selftest checks
the textbook values in ours and the 4D integral (blocks 4 and 18). The potential each electron feels is
$v_x = -(1 + 1/D)\,A_D\,\rho^{1/D}$, spin-polarized as in section 3 (each spin's own density doubled), with each
electron's own share taken out.

## C · Numerical convergence

**The solver's stop.** The self-consistent field stops when the total energy changes by less than {{scf.tol}}
hartree between iterations. Re-solving {{audit.n2}} atoms ({{audit.atoms}}) with the stop at {{audit.tightTol}}
moves no total energy by more than {{audit.dE}} hartree and no first ionization by more than {{audit.dIon}}
(ledger `converged`).

**The radial grid.** The baked grid has {{grid.N}} points from {{grid.r0}} to {{grid.rmax}} bohr, logarithmic with
step {{grid.h}}. {{conv.n}} atoms ({{conv.atoms}}) were re-solved on six other grids, each changing one parameter
(ledger `grid`):

{{conv.table}}

The total energies of the heaviest atoms move by up to {{conv.dE}} hartree, {{conv.dErel}} of themselves, with the
innermost point. The ionization energies, the differences the paper's chemistry uses, move by at most {{conv.dIon}}
hartree.

## D · The law calculations

Section 2's arguments use a separate one-electron solver (`laws.js`), so that the grid's inner end can be moved. It
uses the radial equation with $L = l + (D - 3)/2$ on a logarithmic grid of {{law.gridN}} points, counts the nodes of
an outward Numerov solution at a trial energy, and bisects on the count to $10^{-13}$ relative; a level that falls with
the inner end of the grid is a fall to the centre. Its check is 4D hydrogen, {{laws.h4}} hartree against $-2/9$.

**Gauss's $-\alpha/r^2$.** At $\alpha$ = 0.45 there is no bound level on any grid. At $\alpha$ = 0.7 the lowest level is
{{gauss.e3}}, {{gauss.e4}} and {{gauss.e5}} hartree with the inner end at $10^{-3}$, $10^{-4}$ and $10^{-5}$ bohr:
$\varepsilon r_0^2$ = {{gauss.c3}} and {{gauss.c5}}, a fall to the centre set by $r_0$ (ledger `gauss`). The boundary
between the two is Hardy's constant $((D - 2)/2)^2 = 1$ [@hardy-inequality], which with the kinetic energy $\tfrac12|\nabla\psi|^2$
puts the critical $\alpha$ at $\tfrac12$ [@landau-qm, §35].

**Power laws $-1/r^\eta$.** The splitting of 2p from 2s, as a fraction of the shell's binding, is {{split.p08}} at
$\eta = 0.8$, {{split.p1}} at $\eta = 1$, {{split.p12}} at $\eta = 1.2$ and {{split.p15}} at $\eta = 1.5$. For 3d against 3s
it is {{split3.p08}}, {{split3.p12}} and {{split3.p15}} (ledger `uniqueness`). Only $\eta = 1$ keeps a shell together.

## E · Checks against our world

**E.1 Hydrogen.** One electron needs no search and no exchange, and four-dimensional hydrogen has an exact answer:
$-\frac{Z^2}{2(n + \frac12)^2}$ hartree, so $-2/9$ for the ground state. The solver gives {{h4.E}}.

**E.2 Two electrons.** Helium-like atoms in four dimensions are checked against an independent code, Hartree–Fock in a
Gaussian basis written for any dimension (`gauss.js`), and the same atoms in ours against PySCF at the MP2 level
(selftest blocks 17 and 43). The two codes share no part of the radial solver. From outside, the only accurate
four-dimensional numbers we have been able to read are correlated variational energies for helium-like ions
[@escobar2021]. Hartree–Fock (`hf.js`, appendix G.12) lies above them by {{he4.gap}} hartree for $Z$ = 2–10. That order is
expected but not compelled: two restricted variational families need not be nested, so a correlated trial energy is not
bound to lie below Hartree–Fock's. The gap has the size and sign of a correlation energy, which makes it a consistency
check rather than a benchmark against a Hartree–Fock limit. A four-dimensional Hartree–Fock limit to test against [@loeser1986hf] is in tables we have not obtained.

**E.3 Our own table, and the solver's lean toward d.** The same solver, the same law (in ours 1/r is Gauss's) and the same search, run in three
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
(section 5), the one thing a spin-polarized averaged field cannot represent. Its first ionization energies are off by a
median {{ion3.median}} and at most {{ion3.max}} (figure A2). That is the accuracy to expect of the 4D table: a method
that gets our transition metals mostly right and our ionizations to a few percent, not a spectroscopic one.

**E.4 Ions.** Each ion of ours searched for its own ground state, rather than made by taking one electron from the
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

**E.5 Ionizations are converged in stop and grid.** Tightening the solver's stop or changing its grid moves no ionization energy by a millihartree
(section 3 and appendix C).

**E.6 Hartree–Fock as a second method.** Hartree–Fock (appendix G.12) on the same candidates gets {{hf.oursHf}} ground
configurations of ours right, against local exchange's {{hf.oursLda}}. The two agree on {{hf.oursAgree}}, and every one of those is
right; they differ on {{hf.oursDiffer}}, and on each of these Hartree–Fock is right. The promotion of a 4s electron
into 3d shows what each method does, against the same measured centroids as appendix E.3 (eV, error of local exchange
and of Hartree–Fock: {{hf.promList}}). Local exchange makes d too cheap in all nine. Hartree–Fock makes it a little too
cheap up to half filling (Sc–Cr, {{hf.hfEarly}}) and too dear after it (Mn–Cu, {{hf.hfLate}}). So the two do not
bracket the measured value; from scandium to chromium both lie on the same side of it. Their difference is a measure
of how much an answer depends on the method, not an error bar: neither method bounds the other, and both omit the
correlation that would move each toward the measured values.

In four dimensions three things are reported separately, element by element, in `data/hftable.json`. **Agreement:** the
two methods pick the same ground configuration for {{hf.4agree}} of the 140 elements and differ on {{hf.4n}}: {{hf.4dN}} in the d
rows ({{hf.4d}}), where local exchange puts one electron more in d than Hartree–Fock, as in ours; {{hf.4fN}} at the end of
row 6's f block ({{hf.4f}}), where it puts one more in f; and {{hf.4oN}} at the start of a block ({{hf.4o}}). Agreement is not a
guarantee: both methods share the missing correlation, and in our lanthanides they agree and are both wrong {{hf.lanAgreeWrong}} times.
**Coverage:** Hartree–Fock ranks the local-exchange search's settled candidates within {{hf.window}} eV of its ground; for row 6's
f block and our lanthanides the window is 10 eV and Hartree–Fock also climbs its own one-electron neighbourhood
(appendix G.12). Candidates more than 6 eV above the best were first ranked on their raw energies; their term
corrections, which reach {{hf.corrMax}} eV in the f row, were computed afterwards for all {{hf.farAll}}: {{hf.farCorr}} completely and {{hf.farPartial}}
partially (a spin block too big to finish, so the true energy could be lower still). Each was re-solved first and its raw
energy matched the stored one before the correction was added; none falls below its element's ground, and they change no
ranking. Of all {{hf.candN}} candidates ranked, {{hf.candComplete}} have a complete term correction and {{hf.candPartial}} a
partial one. Where a run didn't record which, it follows from the configuration alone, because a spin block is skipped
only for its size; that reconstruction agrees with all {{hf.termChecked}} recorded cases. **Margins:** how
far above each method's ground its nearest competitor lies.

For the d rows, ours gives a lean. Before half filling ({{hf.4dEarly}}) Hartree–Fock's error in ours was small and in the
same direction as local exchange's, so its preference for s² should hold. After it ({{hf.4dLate}}) its margins, {{hf.4dLateM}} eV,
are inside the volt by which it overprices d in ours. In the d rows no Hartree–Fock ground lies near the window's edge.

In the f row, our lanthanides calibrate the methods. Against the measured levels [@nist-handbook], Hartree–Fock gets
{{hf.lanHf}} of {{hf.lanN}} lanthanide ground configurations right (lanthanum to hafnium) and local exchange {{hf.lanLda}}; where the two agree
they are right {{hf.lanAgreeRight}} times in {{hf.lanAgree}}. In each of the {{hf.fCalN}} measured states that change the f count, Hartree–Fock makes f
too stable, by {{hf.fCalMin}} to {{hf.fB}} eV. We take the largest of these, $B$ = {{hf.fB}} eV, as a sensitivity scale for the
four-dimensional f row. That is an assumption, not a bound: seventeen states in our world say nothing certain about how
far the method errs in another. Under it, a configuration with one f electron fewer than Hartree–Fock's ground could
lie below it if Hartree–Fock puts it less than $B$ up; one with more f only moves further up. Four-dimensional f
electrons are bound far more deeply than ours: the cheapest move of one out of Hartree–Fock's ground costs {{hf.fOut90}} eV in
element 90, {{hf.fOut100}} in 100 and {{hf.fOut109}} in 109, against {{hf.fOutTb}} eV in our terbium, where the measured cost is {{hf.fOutTbM}}. The
32 elements of row 6's f block then fall into four groups:

- **agree, nothing within $B$**: the methods agree and every fewer-f competitor lies more than $B$ up, or the ground
  has no f: {{hf.fFirm}};
- **agree, a competitor within $B$** ({{hf.fOpenAgreeN}}): {{hf.fOpenAgree}}. Element 84 is the case of our cerium, whose
  measured 4f¹5d¹6s² both methods miss, agreeing on 4f²6s²;
- **differ, leaning to Hartree–Fock** ({{hf.fLeanN}}): local exchange's choice holds one f electron more: {{hf.fLean}}. Local
  exchange overbinds f by more still, so its extra f electron is the less likely;
- **agree, untested** ({{hf.fUntestedN}}): no configuration with fewer f was solved: {{hf.fUntested}}.

Which competitor decides each verdict matters too. The corrections computed afterwards change no verdict, but they
bring the deciding gaps down by each competitor's own correction, as much as {{hf.corrMax}} eV. For {{hf.fDecidedPartialN}} verdicts ({{hf.fDecidedPartial}}) the deciding competitor's correction is
partial, so it could lie lower still; the smallest of those gaps is element {{hf.fPartialMinZ}}'s, {{hf.fPartialMinGap}} eV. For {{hf.fGroundPartialN}} the ground's own
correction is partial too, which moves the gap the other way. Every element's three numbers, each candidate's raw and corrected energies,
and whether its correction is complete, partial, computed afterwards or missing are in `data/hftable.json`.

## F · The law in full

**F.1 The fall to the centre.** In $H = -\tfrac12\nabla^2 - \alpha/r^2$ nothing is a length (section 2.1), so either nothing binds or the levels run down without end. Which of the two happens is decided at the origin. Close in, an s wavefunction
goes as $r^\sigma$ with

$$\sigma(\sigma + D - 2) + 2\alpha = 0, \qquad \sigma = -1 \pm \sqrt{1 - 2\alpha} \quad (D = 4).$$

For $\alpha \le \tfrac12$ the roots are real, and Hardy's inequality [@hardy-inequality]

$$\int |\nabla\psi|^2 \;\ge\; \Big(\frac{D-2}{2}\Big)^2 \int \frac{|\psi|^2}{r^2} \;=\; \int \frac{|\psi|^2}{r^2} \quad (D = 4)$$

says the kinetic energy $\tfrac12\int|\nabla\psi|^2$ always outweighs the pull: $H \ge 0$, and nothing binds. For
$\alpha > \tfrac12$ the roots are complex and the wavefunction near the origin is
$r^{-1}\cos\!\big(\sqrt{2\alpha - 1}\,\ln r + \delta\big)$. It changes sign infinitely often on the way in, and every node
below a level means another level beneath it, so there is no lowest one: the electron falls to the centre
[@case1950; @landau-qm, §35].

A calculation shows both. Our one-electron solver (`laws.js`, appendix D) integrates the radial equation of section 3
by Numerov's method on a logarithmic grid that stops at an inner radius $r_0$, and finds each level by bisecting on the
number of nodes. For $\alpha = 0.45$ it finds no bound level on any grid. For $\alpha = 0.7$ the lowest level is
{{gauss.e3}}, {{gauss.e4}} and {{gauss.e5}} hartree with $r_0 = 10^{-3}$, $10^{-4}$ and $10^{-5}$ bohr. It grows as
$1/r_0^2$ ($\varepsilon r_0^2$ = {{gauss.c3}}, {{gauss.c5}}), set by where the calculation stops rather than by the
electron (figure 1a). Either way there is no Bohr radius, no size an atom could settle at. Ehrenfest made the
classical version of this argument [@ehrenfest1917]: under Gauss's law in four dimensions no planetary orbit is stable
either.

**F.2 The ways out, and what each costs.** Something has to give. The squeeze that resists the pull costs
$\tfrac{\hbar^2}{2m_e r^2}$, because the electron's energy grows as the square of its momentum $p$. The pull goes as $1/r^2$
because of Gauss. Change either and a length comes back. One way is to change the electron: an energy growing as
$p^3$ or $p^4$ outgrows a $1/r^2$ pull close in, so atoms bind at every strength. It keeps Gauss's law, and with it
the shell theorem and the Faraday cage. But it gives up Galilean relativity for all matter: a moving laboratory and a
still one see the same physics only if energy is quadratic in momentum. Another is a small fourth dimension, the way
extra dimensions could hide in ours. But atoms larger than it are three-dimensional atoms and smaller ones fall again,
so it doesn't give four-dimensional chemistry. The third is to change the law: keep the electron, keep four large
dimensions, and make the potential between charges fall as $1/r$. This universe takes the third, and section 2 says why $1/r$ and what it costs. The choice between the first and the third is a judgement, stated as one: the
electron route keeps our Faraday cages, the law route keeps our mechanics.

**F.3 The symmetry behind the shells.** Classically, under $1/r$ every bound orbit is a closed ellipse. By Bertrand's theorem only $1/r$ and $r^2$ do that
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
$-\frac{Z^2}{2(n + \frac12)^2}$. With $(l + 1)^2$ orbitals to each $l$, shell $n$ holds $\sum_{l<n} 2(l + 1)^2$ electrons:
2, 10, 28, 60. That degeneracy is what makes a shell, a group of levels with a gap above it.

Without the symmetry nothing holds the $l$ together. On the same solver, 2p sits {{split.p08}} from 2s at $\eta = 0.8$,
{{split.p1}} at $\eta = 1$, {{split.p12}} at $\eta = 1.2$ and {{split.p15}} at $\eta = 1.5$ (as a fraction of the shell's
binding; 3d against 3s goes the same way, {{split3.p15}} at $\eta = 1.5$; figure 1b). Below 1 the electron with more
angular momentum is the more bound, above it the less. So under $\eta = 1.5$ a one-electron atom's 2p is bound little
more than a third as hard as its 2s, and each $l$ is a level of its own. A table would still have rows, since many
electrons split the $l$ in ours too. But the rows would be set by how the exponent treats electrons that come near the
nucleus, and would have to be found again for every $\eta$. The generalized Madelung rule, which starts from hydrogen's
degeneracy, wouldn't apply. Under $1/r$ hydrogen's shells come from counting harmonics; the table's rows still have to
be found by solving the atoms, which is what sections 4 and 6 do.

The literature on hydrogen in $D$ dimensions [@nieto1979; @aljaber1998] and on
dimensional scaling [@herschbach1992] takes $1/r$ in every $D$, mostly as a convention that keeps the problem
solvable. Négadi and Kibler's generalized Madelung rule [-@negadi1996], which gives the four-dimensional rows when it is
applied to $D = 4$, builds on the same $D$-dimensional hydrogen atom. That is why the convention is more than one: it is the only
power law under which the question "what are the shells?" has the answer the rule needs.

**F.4 No Gauss's law for 1/r.** In three dimensions $\nabla^2(1/r) = 0$ away from the charge, and that one fact is Gauss's
law. In $D$ dimensions $\nabla^2 r^{-\eta} = \eta(\eta + 2 - D)\,r^{-\eta-2}$, which vanishes only for Gauss's own
$\eta = D - 2$. In four,

$$\nabla^2 \frac{1}{r} = -\frac{1}{r^3} \qquad (r \ne 0),$$

which the solver's finite differences reproduce ({{lap.r1}} at $r = 1$, {{lap.r2}} at $r = 2$). By the divergence
theorem the flux of the field through a sphere round a charge is the integral of $-\nabla^2(1/r)$ over the ball inside
it. The integrand is $1/r^3$ and the ball's volume element $2\pi^2 r^3\,dr$, so the flux grows linearly with the
sphere's radius, as if empty space were charged with a density $\propto 1/r^3$. There is no Gauss's law for it.

**F.5 Five field theories that give 1/r, and the one taken.** A potential is what a field theory's static equation gives for a point charge,
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
$\mu_0/(\ell k)$, and call the result the **lens vacuum**. The product of permittivity and permeability is then
$\varepsilon_0\mu_0$ at every wavenumber, so light keeps the one speed $c$. The fields $\mathbf D/\varepsilon_0$ and $\mu_0\mathbf H$ obey Maxwell's equations of empty four-dimensional space
exactly, so light is ordinary four-dimensional light at every wavelength, and the energy is never negative. What
pushes a charge is $\mathbf E = (\mathbf D/\varepsilon_0)/(\ell k)$, that light seen through a lens. Dividing by $k$ in
Fourier space is, in space, spreading over a kernel $1/r^3$ (the transform of $1/k$ in four dimensions), so
$\mathbf E$ at a point is a blur of $\mathbf D$ over all of space. Its statics are $1/(\ell k^3)$, the pinned $1/r$. The
price is relativity, for the force between charges only. The blur acts across all of space at once, so there is an
absolute "now", and a charge feels another's change instantly, a little, everywhere. We have not found this pair of
constitutive laws in the literature we read. Light at one speed and an energy that is never negative do not by
themselves make the lens vacuum a causal or quantum theory; that is for the later paper.

This paper uses only route 3's statics: charges at rest and the $1/r$ between them, which is all an atom's ground
state needs. Every choice of permeability gives the same statics, so nothing here depends on that choice, on $\ell$,
on how the lens vacuum's fields move and radiate, or on the absolute now. Those dynamics, of the same lens vacuum, are
the subject of a later paper.

**F.6 Electrons: their two states and Pauli's exclusion derived, what is declared; nuclei and the fine-structure constant.** An electron's spin is a
representation of the rotations, and in four dimensions they split: so(4) = so(3) ⊕ so(3), a turn's left half and right
half. The spinors of Spin(4) = SU(2) × SU(2) come as $(\tfrac12, 0)$, two states that turn with the left half only,
$(0, \tfrac12)$, two that turn with the right, and their sum, four. The smallest have two states. The free electron
can keep its relativity, which the lens vacuum gives up only for the force between charges. Its Dirac equation in 4 + 1
dimensions has four components, and the product of the four spatial Dirac matrices squares to one and anticommutes with
each of them, so it serves as time's (the site's selftest builds them). A slow electron keeps the two components on
which that matrix is $+1$, and they carry one half of the rotations only: two spin states, and a handed spin that a
right-isoclinic turn leaves alone (four.mino.mobi/atom/motion.html#spin). A four-state electron,
$(\tfrac12, 0) \oplus (0, \tfrac12)$, would need two such Dirac fields with the same charge and mass, two species in
all but name. It would hold four to an orbital: the hydrogen shells would hold 4, 20, 56 and 120, every row of the
table would be twice as long, and the noble gases would sit elsewhere. The vector $(\tfrac12, \tfrac12)$ also has
four states, but a full turn leaves it unchanged; it is integer spin, not an electron's. So two states is what the
smallest relativistic electron gives, and that is the choice made. One thing remains declared: that the electron is
that smallest spinor.

*Pauli's exclusion, derived.* The spin-statistics theorem has two halves [@pauli1940; @duck1998]. That a field of
integer spin can't anticommute rests on causality, and so on locality, which the force here doesn't have. That a field
of half-integer spin can't commute rests only on its Dirac equation and on an energy bounded below. The lens vacuum keeps
both: it gives up relativity for the force between charges only, and its light never carries negative energy (F.5). The
argument has three steps, each checked by the selftest's block 73.

1. *The free electron has levels of both signs.* With $\Gamma_1, \dots, \Gamma_4$ the spatial Dirac matrices above and
   $\Gamma_0 = \Gamma_1\Gamma_2\Gamma_3\Gamma_4$, the free electron's Hamiltonian is
   $H_\mathrm D(\mathbf p) = c\sum_i\Gamma_i p_i + m_ec^2\,\Gamma_0$. Its square is $c^2p^2 + m_e^2c^4$ times one, so its
   levels are $\pm\sqrt{c^2p^2 + m_e^2c^4}$, two of each.
2. *Electrons that commute can share a negative-energy state.* With anticommutators each state holds one electron, and
   the negative levels are full: the vacuum of the hole theory. With commutators nothing fills them. Put $N$ electrons in
   one wavepacket of negative-energy states of width $b$ (amplitude $\propto e^{-b^2p^2}$, on a spinor at rest with
   $\Gamma_0 = -1$). Its weight in those states is $\nu = \langle(1 + m_ec^2/E)/2\rangle \ge \tfrac12$, and each electron
   brings $\langle H_\mathrm D\rangle \le -m_ec^2$.
3. *The pinned law can't stop them.* Their repulsion is $\tfrac12N(N - 1)J$, with $J$ the pinned $1/r$ between two copies
   of the packet's charge density. In four dimensions $1/r$ is the transform of $4\pi^2/k^3$, and the density's transform
   is at most $e^{-b^2k^2/2}/\nu$ (Cauchy–Schwarz on the amplitude), so $J \le \sqrt\pi/(4b\nu^2)$. For a round Gaussian
   cloud it is $\sqrt\pi/(4b)$ exactly. At $b = N^2$ bohr, with the light in its vacuum, the energy is at most
   $-Nm_ec^2 + \sqrt\pi/2$ hartree. It falls without end as $N$ grows: at $N = 10$ it is at most {{pauli.e10}}
   hartree, the repulsion taking back only a fraction of a hartree from $-10\,m_ec^2$ = {{pauli.mc10}}.

So electrons that commute have no ground state. Identical particles in three or more dimensions can only be bosons or
fermions [@leinaas1977], so the electron is a fermion. Any repulsion that weakens with distance gives the same result;
Gauss's law would change only how wide the packet must be.

This is the theorem at the level of Pauli's own proof: free fields, with the interaction added to them. The general
theorem of axiomatic field theory assumes that the whole theory is local, and it still doesn't apply here. The argument
also leaves two things open. It doesn't show that anticommuting electrons have a ground state in bulk; that is F.7's
question, and exclusion is what the proofs of stability in ours lean on [@dyson1967; @lieb1975]. Nor does it make the
electron the smallest spinor: a four-state electron would be a fermion too.

Nuclei
are point charges $+Z$, stable for every $Z$ to 140 (declared: nuclear physics in four dimensions is another paper). The
fine-structure constant is small, so atoms are solved without relativity (section 8). No other long-range field acts
on charges.

**F.7 Stability: shown for single atoms, open for matter in bulk.** In ours it is a theorem that $N$ atoms have an energy bounded below by a constant times $N$
[@dyson1967; @lieb1975], whatever the nuclei's positions. The usual proofs lean on the shell theorem, which fails here.
That doesn't close the question: decompositions of radial interactions that need no shell theorem exist in any
dimension [@hainzl2002], and Riesz gases, of which a $1/r$ law in four dimensions is one, have their own mathematics
[@lewin2022], though neither is a proof for electrons and nuclei here. So we give evidence, not a proof, and the
evidence is narrower than the theorem. Single atoms don't collapse. Thomas–Fermi scaling gives total energies growing as $Z^{3-2/D}$, $Z^{7/3}$ in ours and $Z^{5/2}$
in four dimensions [@kventsel1981], and the solved table follows it, with a fitted exponent of {{tf.exp4}} over $Z$ =
10–140 (ours: {{tf.exp3}} over 10–36; both a little above the asymptotic value, as finite-$Z$ corrections make them).
Separated neutral atoms don't run away either. Every force between them here (the permanent $-\tfrac{3Q_AQ_B}{64R^5}$ of
section 7, dispersion's $R^{-6}$) falls faster than $R^{-4}$, so summed over four-dimensional space each atom's share
of the far field is finite. That says nothing about atoms that overlap, trade charge or crowd together, which is
where a proof of stability has its work. Stability of matter here is open.

**F.8 The table under other exponents.** To test whether the rows need $1/r$, every element from 1 to {{eta.zmax}} was solved
again under $V = q_1q_2/r^\eta$ with $\eta = 0.5$ and $1.5$, for every pair of charges alike: the nucleus pulls as
$-Z/r^\eta$, the clouds act through the shell kernel of $1/|x - y|^\eta$ (the 3-sphere average of $(1 + t^2 - 2t\cos\theta)^{-\eta/2}$,
$\kappa_\eta(t)/\max(r, s)^\eta$), and the local exchange is that of the four-dimensional electron gas under the same law,
$\varepsilon_x = -C_\eta\,\rho^{\eta/4}$ per electron with $C_\eta = 2(16\pi^2)^{\eta/4}\int_0^\infty x^{-1-\eta}J_2(x)^2\,dx$ (Weber and Schafheitlin's
integral in closed form, $A_4$ at $\eta = 1$). Everything else is the table's method: each element searched as the bake
searches, seeded from the real table, its neighbours and the bare $\eta$-nucleus's filling order, then searched again
more widely where it didn't settle (`atom/tools/etatable.mjs`, `data/etatable.json`). Checks (block 72): the constant
against quadrature, the kernel, and one electron against the independent one-electron solver at both exponents, to
10⁻⁶. The solver stops at f, and under $\eta < 1$ a higher $l$ is the more bound, so the empty 5g level was solved in
every atom's own field; it never lies below the outermost occupied level ({{eta.gIntrude}} atoms). Under $\eta = 0.5$ all {{eta.settled05}}
settle; under $\eta = 1.5$ {{eta.settled15}} do, and {{eta.uns15}} have no settled ground state from any start tried.

The noble gases are found by one rule for every law: a closed configuration whose first ionization is a local maximum,
after which the next atom's is at least 30 % lower, and which holds at least half as hard as any atom before it. Under
$\eta = 0.5$ they are {{eta.n05}}, the hydrogen shells of 2, 10, 28 and 60: since higher $l$ is more bound, each shell fills
before the next begins. Under $\eta = 1.5$ they are {{eta.n15}}: s levels sink below the p of the shell before (2s, 3s, then 2p;
4s, then 3p; 5s, then 4p), so each p closes on top of the next shell's s, and d enters late. Under $1/r$ the rule gives
{{eta.n1}}, the generalized Madelung rule's noble gases with the two closed d-and-s atoms. Two cautions. Nothing physical
stands behind $\eta \neq 1$: no field theory is offered for it, and the exponent is varied as a test, not a proposal. And the
method is the table's, with its lean toward d and f, so configurations inside a row are no surer here than under $1/r$;
the noble gases, which turn on large ionization steps, are the robust readout.

## G · The methods in full

**G.1 The code.** Everything in this paper is computed by code written for it: JavaScript with no outside libraries, run under Node.js,
and the same files run in a browser (four.mino.mobi/atom). The atom is `atom/js/atom.js`, with the shell kernel in
`kernel.js`. One electron in any law is `papers/p1/laws.js`, and the terms of open subshells are `atom/tools/hund.mjs`
and `termtable.mjs`. Nothing is taken from a quantum-chemistry package. Two independent codes check it (appendix E.2):
`atom/js/gauss.js`, Hartree–Fock in a Gaussian basis [@boys1950] for any $D$, with the integrals of McMurchie and
Davidson [-@mcmurchie1978], and in ours PySCF [@sun2018; @sun2020]. Every number quoted is read from the code's output by the paper's build
(appendix K).

**G.2 The law inside an atom.** An atom here is a point nucleus of charge $Z$ and $Z$ electrons, non-relativistic, with every pair of charges interacting
through the pinned potential $q_1q_2/r$ in four spatial dimensions. The same law acts between an electron and the nucleus
and between two electrons; nothing in the method borrows Gauss's law. Atomic units throughout (hartree, bohr).

Each electron moves in the field of the nucleus and of the other electrons' clouds, averaged over directions, so the
problem is radial. In $D$ dimensions a wavefunction $\psi = r^{-(D-1)/2}\,u(r)\,Y$, with $Y$ a harmonic of degree $l$ on the
$(D - 1)$-sphere, has a radial function $u$ that obeys

$$-\tfrac12\,u'' + \Big[\frac{L(L+1)}{2r^2} + V(r)\Big]\,u = \varepsilon\,u, \qquad L = l + \frac{D-3}{2},$$

so four dimensions differ from ours by the half-integer shift of $L$ ($L = l + \tfrac12$) and by the degeneracies: a
subshell of angular momentum $l$ holds $2(2l + 1)$ electrons in ours and $2(l + 1)^2$ in four dimensions. With
$V = -Z/r$ the levels are $-\frac{Z^2}{2\,(n + (D - 3)/2)^2}$, so 4D hydrogen's ground state is $-2/9$ hartree; the solver gives
{{h4.E}} (appendix E.1).

**G.3 The clouds' potential.** A spherical shell of charge at radius $s$, felt at radius $r$, gives in ours
$1/\max(r, s)$ (the shell theorem). In four dimensions under $1/r$ it gives $\kappa(t)/\max(r, s)$,
$t = \min/\max$, with $\kappa$ the $1/r$ kernel averaged over a 3-sphere,

$$\kappa(t) = \frac{2}{\pi}\int_0^\pi \frac{\sin^2\theta\,d\theta}{\sqrt{1 + t^2 - 2t\cos\theta}},$$

which falls from $\kappa(0) = 1$ to $\kappa(1) = \tfrac{8}{3\pi}$ = {{kernel.k1}} (appendix A; Simpson's rule on {{kernel.M}} intervals, then a
table of {{kernel.table}} points with linear interpolation). Every electron–electron term in the self-consistent
field, its energy and the ionized atom's goes through this kernel. That is where the missing shell theorem enters the
atom: an inner cloud screens the nucleus from an outer electron only partly.

**G.4 Exchange.** Local exchange from the uniform electron gas of the same dimension and the same law,
$\varepsilon_x(\rho) = -A_D\,\rho^{1/D}$ per electron for an electron density $\rho$, with
$A_3 = \tfrac34(3/\pi)^{1/3}$ = {{exchange.c3}} and $A_4 = \tfrac{16}{15\sqrt\pi}$ = {{exchange.c4}}, as in the general-$D$ formulas
of @loos2016 for $1/r$ jellium (appendix B). Spins are polarized by Hund's rule (a subshell fills one spin first),
and each electron's own share is removed from both its Hartree and its exchange potential: the Hartree term by its own
orbital's cloud, the exchange term by the fully polarized exchange of that orbital alone, in the manner of the self-interaction correction of @perdew1981. There is no correlation term. That is an omission, not a gap in what is known:
the arbitrary-dimensional exchange is old [@glasser1983], and the correlation of the $1/r$ electron gas has been
computed in any dimension, four included, by the random-phase approximation [@schlesier2020] and beyond it
[@pham2023]. We have not implemented or tested a four-dimensional correlation functional; the later paper's numbers
carry a correction to the earlier one's coefficients that would have to be settled first.

**G.5 Solving one configuration.** The radial equation is solved on a logarithmic grid of {{grid.N}} points from $r_0$ = {{grid.r0}} to {{grid.rmax}} bohr
(step $h$ = {{grid.h}} in $\ln r$) by Numerov's method on $y = u/\sqrt r$, with each level found by Sturm bisection on the node
count of the outward solution ({{solve.bisect}} halvings), the outward integration stopped where $h^2 f/12 > \tfrac12$ (for $y'' = f\,y$) so that
Numerov cannot fake nodes in the forbidden region, and the orbital matched to an inward solution at the turning point.

For a fixed configuration (occupations of each subshell, every orbital of a subshell sharing one radial function) the
field is iterated to self-consistency: each orbital solved in the potential of the nucleus, the others' clouds and
exchange; the new clouds mixed into the old at {{scf.mix}}; up to {{scf.iters}} iterations, stopping when the total
energy changes by less than {{scf.tol}} hartree between iterations.

**G.6 The stop, against one 10⁵ times tighter.** A stop on the energy can leave the far density less converged than the energy is; the
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

**G.7 The radial grid, against six others.** {{conv.n}} atoms from every row of both worlds were re-solved in their baked
configurations on six other grids, changing one of the number of points (500, 1000), the inner end (10⁻⁴, 10⁻⁶ bohr) and
the outer end (100, 250 bohr) at a time (appendix C, `convergence.mjs`). First ionization energies moved by at most
{{conv.dIon}} hartree on any of them. Total energies moved by at most {{conv.dE}} hartree, {{conv.dErel}} of themselves,
the largest for our own krypton, whose 1s sits deeper than any four-dimensional atom's and is the grid's hardest case.
The paper quotes ionization energies and energy differences, not total energies.

**G.8 The ground configuration.** For each $Z$ the ground configuration is searched, not assumed. The search starts from the hydrogenic filling (subshells
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

**G.9 The terms of open subshells.** The search above gives every open subshell Hund spins. Section 5 finds where that's wrong, and the table is corrected
for it. Each d- and f-block element is searched again, seeded as the repair pass seeds, and every settled candidate's
energy gets its open subshells' term correction: the lowest term less the lowest maximum-spin term. That comes from
the subshell's own repulsion on that candidate's own orbital (`atom/tools/termtable.mjs`). It is zero wherever Hund's
first rule holds. The ionization is corrected the same way on both sides. Fillings whose spin blocks are too large to
solve per candidate take the survey's verdict (section 5.1), which for them is that the rule holds.

**G.10 The counterfactual.** To separate what the table owes to the law from what it owes to the geometry, every 4D element is solved a second time
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

**G.11 One electron, any law.** The arguments of section 2 use a separate solver for one electron in any central potential (`laws.js`): the same
radial equation and Numerov–Sturm method on a grid whose inner end can be moved, which is what tests a fall to the
centre. For $V = -\alpha/r^2$ it finds no level below $\alpha = \tfrac12$ on any grid and, above it, a lowest level that scales as $1/r_0^2$
(section 2.1); for $V = -1/r^\eta$ it gives the splittings within each shell (section 2.3). Its check is 4D hydrogen:
{{laws.h4}} against $-2/9$.

**G.12 A second method: Hartree–Fock.** To see which configurations depend on the choice of method, every element
is solved a second way, by numerical Hartree–Fock (`hf.js`): one radial function per subshell on its own logarithmic
grid, exact exchange instead of local exchange, and the energy the average over the subshells' maximum-spin
arrangements, to which each open subshell's whole term correction (its lowest term less that average, appendix G.9's
machinery on the Hartree–Fock orbitals) is added. Exchange between subshells is expanded in the Gegenbauer
coefficients of $1/|\mathbf x - \mathbf y|$, each radial kernel a convolution on the logarithmic grid; in four
dimensions the coefficients are tabulated by quadrature, $a_0$ being the shell kernel $\kappa$. The candidates are the
local-exchange search's settled configurations within {{hf.window}} eV of its ground, so both methods rank the same
set. For row 6's f block and our lanthanides, where local exchange's bias toward f can push the right configuration
out of that window, the window is 10 eV, and Hartree–Fock then climbs from its own ground through every configuration
one electron away, those more than 6 eV up ranked first on their raw energies and corrected afterwards (`hftable.mjs farcorr`), since the correction is never positive and reaches several eV. A configuration with an empty subshell below an occupied one of the same $l$ (sodium's $4s^1$ with $3s$ empty) is
left out of the Hartree–Fock ranking: the variational solve drops the electron into the empty lower subshell and
returns the compact configuration's energy under the other name. The energies carry an $O(h^2)$ error from the
kernel's kink at $r = r'$, so absolute energies are extrapolated from steps 0.02 and 0.01; differences converge at
0.02, where the ranking is done. Checks (block 71): our He, Ne, N ⁴S, C ³P and Fe ⁵D against the numerical
Hartree–Fock limits to 2 × 10⁻⁵ hartree, and four-dimensional closed shells against the Gaussian code.

**G.13 A known-answer test for every method.** Every method above has a known-answer test in the selftest, run on every change: hydrogen in both worlds (block 1), the
radial solver (2), the kernel against direct integration (3), exchange against the electron-gas constants (4, 18), the
ground search (5, 7), two-electron atoms against an independent Gaussian Hartree–Fock code in four dimensions and MP2
against PySCF in ours (17, 43), Hartree–Fock against its known limits (71), our table against measured values (6:
{{configs3}} configurations; ionization to a {{ion3.median}} median error), and this paper's own claims recomputed from
the bake (67).

## H · Hund's first rule in full

**H.1 Every term, from the open subshell's determinants.** For each open subshell of each ground configuration, its orbitals are the degree-$l$
harmonics on the 3-sphere, $(l + 1)^2$ of them (4 for p, 9 for d, 16 for f). The repulsion between two of its
electrons is the law's $1/|x - y|$, projected exactly onto the harmonics of degree $0$ to $2l$, with the radial parts
integrated over the atom's own orbital. Every arrangement of the subshell's electrons with a given $M_S$ is set up and
the lowest energy found (Lanczos, matrix-free; a 4D d⁹ block has 15 876 arrangements). A term of spin $S$ appears in
every block with $M_S \le S$, so the ground term's spin is the largest $M_S$ whose block still reaches the lowest
energy. In ours this reproduces Racah's term separations for d² and d³ to the wavenumber, and the known ground terms of
Cr³⁺, Mn²⁺, Pr³⁺ and Gd³⁺. Over all {{hund.n3}} open subshells of our table, maximum spin is lowest, as it should be.

**H.2 How complete the f survey is.** No other f filling was found to break the rule,
but the search is not complete. For {{hund.fcomplete}} every spin was checked. For {{hund.fbound}} only the highest two
or three were, because the lower-spin blocks run to 10⁶–10⁸ arrangements; there the result is a bound, no lower term
among the spins that could be run. Two fillings (elements {{hund.fmissing}}) didn't finish in the runner's time.

**H.3 The singlet's symmetry, and what the calculation establishes.** Four-dimensional d orbitals form the representation (1,1) of SO(4) ≅
SU(2) × SU(2)/ℤ₂. Two electrons in them make spatially symmetric states (2,2) ⊕ (2,0) ⊕ (0,2) ⊕ (1,1) ⊕ (0,0), all spin
singlets (25, 10, 9 and 1 states), and antisymmetric ones (2,1) ⊕ (1,2) ⊕ (1,0) ⊕ (0,1), triplets (30 and 6). The
singlet that comes lowest is the ten-state (2,0) ⊕ (0,2): two irreducible representations of SO(4), exchanged by a
reflection, so a single level once reflections are counted. In ours the triplet ³F is the term that keeps the electrons nearest right angles ({{hl.cosF3}}, against
¹D's {{hl.cosD3}} and random's 0.333), and it is the lowest for every value of $F^4/F^2$. Titanium's d² has ³F lowest
and its first singlet {{hl.ours}} eV up.

What this establishes is narrower than a whole-atom ground term. The term energies are computed within one subshell on
the atom's own maximum-spin orbital, which is neither relaxed term by term nor correlated beyond the subshell, and the
correction they give the table (section 5.3) is first order. For d² the inversion holds under both laws tested, on element 26's own
orbital held fixed (Gauss's $1/r^2$ was not given its own self-consistent orbital), and for any orbital whose $F^4/F^2$
is below {{hl.crit}}. The f-shell inversions (4f³, 4f²⁹) were computed under the pinned law only. Hund's first rule has been studied away from three dimensions, in
two-dimensional helium-like atoms and quantum dots [@sako2012; @sako2010] and by dimensional scaling [@gonzalez1991],
and two-electron matrix elements for hydrogenic d² and f² pairs have been derived for any $D$ [@summerfield1999]. We
have not been able to read the last two in full, and none of the sources we could read states this inversion.

**H.4 The corrected table.** Every d- and f-block element ({{tt.n}} of them) was searched again, with the neighbours' configurations as extra seeds ({{tt.cands}} settled
candidates each). Every candidate got its open subshells' gaps added, and the candidates were ranked again, with and
without the correction, so that a change from the wider search is told apart from one from the terms. **The terms
change no ground configuration.** They lower the eight Hund-breaking atoms' energies, and they move first ionizations
in pairs. An atom whose own ground term gains the gap holds its electron harder: {{tt.up}} eV. The next element,
whose ion lands on the broken filling, gives one up more easily: {{tt.down}} eV. That is {{tt.range}} eV either way.
The wider search found one configuration the bake had missed. Element 82 is 4f¹ 5d¹ 6s², {{tt.82}} eV below the
bake's 4f² 6s², which is our cerium's kind; its ionization goes {{tt.82ion}} eV. The table of section 4 is the
corrected one (`data/table4.csv`). The Hund-spin table it replaces is supplement S1 (`data/table4-hundspin.csv`).
How far to trust each configuration follows from appendix E.3. Take a bias of about a volt toward d and f: a ground
configuration with a competitor holding fewer d and f electrons within a volt of it could be the other way round.
{{tt.sensN}} of the {{tt.n}} d- and f-block elements have one: {{tt.sens}}.

**H.5 The d² singlet in a ligand field.** A spin singlet is not orbitally inert: the ten states of (2,0) ⊕ (0,2) still carry orbital
structure, and in a compound a ligand field splits them, and might hand the ground to a triplet. The ion here is
element 26's 2+, 3d² over closed shells, with point charges −1 at {{lf.R}} bohr in three arrangements of four
dimensions: along the axes (eight, the 16-cell, four dimensions' octahedron), at a tesseract's corners (sixteen), and at
the 24-cell's vertices (twenty-four). The field is projected exactly onto the degrees a d × d product holds, scaled from
zero, and every determinant of the two electrons is diagonalized, as in section 5.1. A four-dimensional d subshell
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

## I · Starting data for chemistry

**I.1 Valence states.** Chemistry can pay to move an electron if the bonds it then makes pay more, so the reference
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
table's ground, the open configuration of appendix E.6.

{{val.table}}

Table: **Table 1.** Valence states of representative four-dimensional atoms: the ground configuration (every open
subshell and the outermost shell) and the three lowest configurations one electron away by Hartree–Fock, each labelled
by the move and given by local exchange and by Hartree–Fock, in eV above the table's ground configuration, each method
measuring from its own energy for that configuration; a negative value means the method puts the state below the
table's ground configuration.

**I.2 Darbon's hydride holds five hydrogens.** The table implies a valence rule: an atom with $v$ electrons outside its
core makes $v$ bonds, up to $D + 1$ of them, and $2(D + 1) - v$ past that. That is a claim about molecules, and one
hydride tests it directly. Darbon (element 7, 2s²2p³) should make five bonds, so DH₅ should exist, its hydrogens at the
corners of the 5-cell, the simplest regular figure in four dimensions. Making five bonds takes the s→p promotion of
appendix I.1. At that geometry (D–H {{vt.R}} bohr, by Hartree–Fock) we computed the whole curvature matrix of the energy
by central differences, in all {{vt.n}} coordinates of six atoms in four dimensions. With the {{vt.rigid}} translations and
rotations set apart, the {{vt.nVib}} curvatures fall in groups of {{vt.groups}}, as the 5-cell's symmetry requires. None
is negative: the lowest is {{vt.low}} hartree/bohr², and the gradient is {{vt.grad}}. So DH₅ is a true minimum, not a saddle
that a symmetric search could settle on. It also lies below both balanced ways of coming apart. Losing one hydrogen,
DH₅ → DH₄ + H, costs {{vt.h1}}. Losing two as a molecule, DH₅ → DH₃ + H₂, costs {{vt.h2}}.
Each fragment is in its lowest spin: DH₄ is {{vt.s4}} and DH₃ {{vt.s3}}, with DH₃'s singlet {{vt.gap3}} higher. Energies
are by unrestricted Hartree–Fock and MP2 in the molecular basis. The fragments' geometries were optimized only within
symmetric shapes, with their hydrogens equivalent; DH₃ and DH₄ settle flat, their hydrogens in a plane or a 3-space
through darbon. A lower, less symmetric fragment could lower both costs, and the curvature matrix, which describes DH₅
only, says nothing about that. The systematic test, every hydride and its fragments searched without symmetry,
belongs to the chemistry this table starts.

## J · The atoms' response, and joining and separating them

**J.1 Polarizability, dispersion and the permanent pull.** For the closed-shell atoms and the one-s-electron alkalis of both worlds (table 2) the
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

{{resp.table}}

Table: **Table 2.** Response of closed-shell and one-s-electron atoms (atomic units): static polarizability, $C_6$, $Q =
\sum\langle r^2\rangle$, in four dimensions $C_5 = 3Q^2/64$ and $R^* = C_6/C_5$; for ours, beside each, the reference value
(ref.) of @derevianko2010. Data: `data/response.json`, with $\alpha_\mathrm p(\mathrm i\omega)$ on the quadrature nodes and each
atom's convergence.

**J.2 Joining and separating atoms.** A molecule's binding energy is measured from its atoms, so the atoms the
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
bohr. In four dimensions they don't meet them at all, as section 4 says they shouldn't. Two closed-shell atoms keep the
permanent pull, and Hartree–Fock reproduces its far form: element 12's pair at 16 bohr is bound by {{sep.e12}} mHa, and
the closed shells sit at {{sep.rClosed}} times the far form there. Hydrogen, whose four-dimensional orbital is diffuse,
is at {{sep.rH}}, still approaching it; its excess over the far form falls by five between 10 and 16 bohr, as
shorter-ranged terms do. The open p shells are at
{{sep.rOpen}}: an unrestricted atom with a partly filled p shell is not round, and the ordinary quadrupole that ours has
too adds a pull of the same order, one that depends on how the two atoms are turned. The atomic energies, the curves and
each atom's charge and spin are in `data/separate.json`.

## K · Reproducing every number

Every number in the text is read by `papers/p1/build.mjs` from one of the files below, and the selftest (block 67)
fails if any claim in `ledger.json` stops holding or any generated file is stale. What made each file:

| file | made by | where |
|---|---|---|
| `atom/js/table.js` (the bake; supplement S1) | `atom/tools/bake.mjs`, then `--repair` for 88, 101–103, 105–107 | GitHub's runners, six minutes a shard |
| `data/termtable.json` (the main table) | `atom/tools/termtable.mjs`, collected by `termtable-collect.mjs` | runner run `hund-f-and-terms` |
| `data/hund.json` | `atom/tools/hund.mjs survey`, collected by `hund-collect.mjs` | sandbox (p, d, first f) and runner run `hund-f` |
| `data/hund-law.json` | `papers/p1/hundlaw.mjs` | a minute |
| `data/promotion3.json` | `termtable.mjs` with `TERM_MODE=full` on ours, `promotion-collect.mjs` | sandbox, minutes |
| `data/shelltable.json` | `atom/tools/lawtable.mjs shell`, `repair`, `bake` | runner runs `lawtable-shell`, `lawtable-repair` |
| `data/audit-scf.json`, `data/convergence.json` | `audit-scf.mjs`, `convergence.mjs` | runner |
| `data/profiles.json` | `profiles.mjs` | sandbox |
| `data/ions.json` | `atom/tools/termtable.mjs` with a charge, collected by `ions-collect.mjs` | runner runs `ions-1`, `ions-23` |
| `data/hftable.json` | `atom/tools/hftable.mjs rank`, collected by `hf-collect.mjs` | runner runs `hf-table-1`, `hf-lanth-1`, `hf-wide-1`, `hf-climb-1` |
| `data/valence.json` | `atom/tools/hftable.mjs map`, collected by `valence-collect.mjs` | sandbox |
| `data/valencetest.json` | `atom/tools/valencetest.mjs`, collected by `valencetest-collect.mjs` | runner run `valence-1` |
| `data/response.json` | `response-table.mjs` | sandbox, six minutes |
| `data/ligandd2.json` | `atom/tools/ligandd2.mjs` | sandbox, seconds |
| `data/separate.json` | `atom/tools/separate.mjs`, collected by `separate-collect.mjs` | sandbox |
| `data/nist-*.json`, `data/response-ref.json` (measured and reference values) | fetched from NIST (the levels by `nist-levels.py`); the reference by hand from its source | by hand |
| `data/table3.*`, `data/table4.*`, `figdata/`, `figures/`, `ledger.json`, `draft/` | `build.mjs` | seconds |
| `data/crossref.json` (the references' metadata) | `refs-crossref.mjs`, from each DOI's Crossref record | by hand, when a DOI is added |
| `draft/*.html`, `draft/paper.pdf` | `page.mjs` (pandoc, with citeproc), `pdf.cjs` | seconds |

`papers/p1/reproduce.mjs` re-solves a sample of atoms and checks them against the main table to 10⁻⁴ hartree, each row by
the pipeline that made it: the bake for the elements outside the d and f blocks, and for the d- and f-block elements the
term-corrected search, with the ion's own ground state where the table took it; `--all` re-solves every element, and
`--s1` checks the bake alone against supplement S1. The runner's logs, with each command's exit status, are kept on the repository's
`atom4-data` branch under `runs/`. The solvers, the known-answer test assembled from the selftest's method blocks, `reproduce.mjs` and the paper's
tables are mirrored under the MIT licence at tangled.org/morphyxmino.bsky.social/four-atom (`npm test` runs the
known-answer test; `node papers/p1/reproduce.mjs` re-solves the sample; the term-corrected search needs tools the
mirror doesn't carry, so there those rows are named as not reproduced), refreshed on every change to them.
