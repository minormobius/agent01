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

which gives $\kappa(1) = 8/3\pi$ (since $\mathrm E(1) = 1$), and the series

$$\kappa(t) = 1 - \frac{t^2}{8} - \frac{t^4}{64} - \frac{5t^6}{1024} - \frac{35t^8}{16384} - \dots$$

Each term is $t^n$ times the average of the Legendre polynomial $P_n(\cos\theta)$ over the 3-sphere; the odd ones
vanish. The solver evaluates $\kappa$ by Simpson's rule in $\theta$ with {{kernel.M}} intervals, tabulated at
{{kernel.table}} points of $t$ and interpolated. The closed form agrees with that quadrature to {{kernel.closedErr}}
for $t$ up to 0.9 (ledger `kernelclosed`); nearer 1 the quadrature's own error dominates, a few parts in $10^7$.

The series' first correction is the far pull of section 10. A cloud of $N$ electrons around a nucleus $+Z$, seen from
a distance $R$ outside it, gives $\big(Z - N + \sum_i \langle r_i^2\rangle / 8R^2 + \dots\big)/R$. A neutral atom
therefore acts on an electron through $-Q/8R^3$ with $Q = \sum\langle r^2\rangle$, and two neutral atoms on each other
through $-3Q_AQ_B/64R^5$ (section 10). Figure A1 draws $\kappa$, and the potential inside and outside a shell.

## B · The 4D electron gas

The solver's exchange is the local form of the uniform electron gas of the same dimension and the same law. In $D$
dimensions a spin-unpolarized Fermi sea of density $\rho$ has $\rho = 2\,\Omega_D k_F^D/(2\pi)^D$, with $\Omega_D$ the
volume of the unit ball ($\pi^2/2$ for $D = 4$). Its kinetic energy per volume is $\tfrac{D}{D + 2}\,\rho\,k_F^2/2$:
$\tfrac{3}{10}(3\pi^2)^{2/3}\rho^{5/3}$ in ours (Thomas–Fermi's 2.8712), $\tfrac{4\pi}{3}\rho^{3/2}$ in four dimensions.
Its exchange energy per volume is $-A_D\,\rho^{1 + 1/D}$. In ours $A_3 = \tfrac34(3/\pi)^{1/3}$ = {{exchange.c3}},
Dirac's constant. In four dimensions under the pinned $1/r$, with the Fermi sea's density matrix built on the Bessel
function $J_2$ and the integral $\int_0^\infty J_2(x)^2\,x^{-2}\,dx = 4/15\pi$, it is $A_4 = 16/15\sqrt\pi$ =
{{exchange.c4}}. These agree with Loos and Gill's expressions for the $D$-dimensional gas [-@loos2016]. The selftest checks
the textbook values in ours and the 4D integral (blocks 4 and 18). The potential each electron feels is
$v_x = -(1 + 1/D)\,A_D\,\rho^{1/D}$, spin-polarized as in section 5 (each spin's own density doubled), with each
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
$-Z^2/2(n + \tfrac12)^2$ hartree, so $-2/9$ for the ground state. The solver gives {{h4.E}}.

**E.2 Two electrons.** Helium-like atoms in four dimensions are checked against an independent code, Hartree–Fock in a
Gaussian basis written for any dimension (`gauss.js`), and the same atoms in ours against PySCF at the MP2 level
(selftest blocks 17 and 43). The two codes share no part of the radial solver. From outside, the only accurate
four-dimensional numbers we have been able to read are correlated variational energies for helium-like ions
[@escobar2021]. Hartree–Fock (`hf.js`, section 5.12) lies above them by {{he4.gap}} hartree for $Z$ = 2–10, as it must,
since they include correlation; that is the size and sign of a correlation energy, a consistency check rather than a
benchmark. A four-dimensional Hartree–Fock limit to test against [@loeser1986hf] is in tables we have not obtained.

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
(section 6), the one thing a spin-polarized averaged field cannot represent. Its first ionization energies are off by a
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
(section 5 and appendix C).

**E.6 Hartree–Fock as a second method.** Hartree–Fock (section 5.12) on the same candidates gets {{hf.oursHf}} ground
configurations of ours right, against local exchange's {{hf.oursLda}}. The two agree on {{hf.oursAgree}}, and every one of those is
right; they differ on {{hf.oursDiffer}}, and on each of these Hartree–Fock is right. The promotion of a 4s electron
into 3d shows what each method does, against the same measured centroids as appendix E.3 (eV, error of local exchange
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

## F · Reproducing every number

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
| `data/table3.*`, `data/table4.*`, `figdata/`, `figures/`, `ledger.json`, `draft/` | `build.mjs` | seconds |
| `data/crossref.json` (the references' metadata) | `refs-crossref.mjs`, from each DOI's Crossref record | by hand, when a DOI is added |
| `draft/*.html`, `draft/paper.pdf` | `page.mjs` (pandoc, with citeproc), `pdf.cjs` | seconds |

`papers/p1/reproduce.mjs` re-solves a sample of atoms from the solver and checks them against the paper's data;
`--all` re-solves every element. The runner's logs, with each command's exit status, are kept on the repository's
`atom4-data` branch under `runs/`. The code is mirrored at a tagged version for citation.
