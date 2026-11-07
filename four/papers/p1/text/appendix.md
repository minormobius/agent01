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

The series' first correction is the far pull of section 11. A cloud of $N$ electrons around a nucleus $+Z$, seen from
a distance $R$ outside it, gives $\big(Z - N + \sum_i \langle r_i^2\rangle / 8R^2 + \dots\big)/R$. A neutral atom
therefore acts on an electron through $-Q/8R^3$ with $Q = \sum\langle r^2\rangle$, and two neutral atoms on each other
through $-3Q_AQ_B/64R^5$ (section 11). Figure A1 draws $\kappa$, and the potential inside and outside a shell.

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

## E · Reproducing every number

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
