# The windows: which strong and weak forces let a four-dimensional universe burn hydrogen

<!-- Paper 2, section 2 (draft): the technical content and methods for figure 1. Every double-braced token is read by build.mjs
     from data/windows.json, data/masscheck.json or the solvers; write numbers as tokens, never by hand. -->

A universe with four dimensions of space has to choose its nuclear forces; nothing carries ours over. The book fixes the
charge law (paper 1) and keeps two numbers open for the nucleus: the strength $s$ of the attraction between nucleons, a
factor on a borrowed force of fixed shape, and the weak coupling $G_4$, Fermi's constant's four-dimensional counterpart,
which has units of mass$^{-3}$ and so no value inherited from ours. Figure 1 lays out the plane of those two choices and
draws on it every constraint the book has computed, each from its own calculation. Each one rules out a part of the
plane, and what is left is narrower than any one constraint suggests.

## 2.1 Results

**The strong force's window.** The deuteron binds once $s > 1.4002$, and the spin-singlet pair of nucleons binds
once $s > 1.8909$. Above that, two protons (or two neutrons) hold together by the strong force alone, and the slow
weak step that paces hydrogen burning in our Sun disappears. Between them the deuteron's binding rises from zero to
16.5 MeV. At $s = 1.5152$ it binds by 2.224 MeV, as ours does. These two edges bound the plane's horizontal
axis.

**Proton + proton.** In our Sun, hydrogen burning starts with $p + p \to d + e^+ + \nu$, which needs the deuteron to bind
by more than the neutron–proton mass difference plus an electron mass, 1.804 MeV. That happens only above
$s = 1.4984$, so the lowest 20% of the strong window (shaded) has no positron-emitting route to deuterium.
The electron-capturing route $p + e^- + p \to d + \nu$ needs only 0.782 MeV and opens at $s = 1.4516$; in our Sun
it runs at a few parts in a thousand of $p + p$ [@vinyoles2017], so across the 10% of the window between the two thresholds
deuterium is made, but slowly. The figure shades the whole strip, where $p + p$ itself is closed. Of the plane drawn,
78% has $p + p$ open and no bound diproton.

**The first minutes.** The universe's first minutes turn every neutron that survives them into helium-4. A weak force
too feeble freezes the neutrons out of balance with the protons while there are still many of them, and the universe
starts as mostly helium. For each clock of the first minutes (the universe's age when it is 1 MeV hot, which gravity sets
and the book has not yet fixed) the coloured line marks where exactly half the hydrogen survives; above it more does.
The lines are flat in $s$, and they step down by exactly half a decade in $G_4$ for every decade of the clock:
$\log_{10} G_4 / (G_F/M_W) = 5.43, 4.93, 4.43, 3.93, 3.43$ at clocks of
0.01, 0.1, 1, 10, 100 s (a slope of 0.500 per decade; each line flat in $s$ to 0.004 wherever $p + p$ is open). Both
facts are the physics of freeze-out (section 2.2.4). The rate that converts neutrons and protons grows as
$G_4^2 T^{2d-1}$ and the expansion rate as $T^{(d+1)/2}/t_1$, so the freeze-out temperature depends only on $G_4^2 t_1$.
At the edge the frozen neutron fraction is a quarter, $T_f = Q/\ln 3 = 1.18$ MeV (computed: 1.18 MeV). The
free neutron then lives 6 days, far longer than the wait for deuterium, so the deuteron's binding hardly
enters. The lines bend down only near the deuteron's threshold, where the wait for deuterium becomes long enough for
neutrons to decay. Depending on the clock, the first minutes leave half their hydrogen on 32–69% of the plane.

The weak window's lower edge says something about $G_4$ in units of the electron: half the hydrogen survives only if
$G_4 m_e^3$ is within a few orders of ours' $G_F m_e^2$. The figure's reference $G_F/M_W$, the weak force "as strong as
ours at its own scale", lies 3.4–5.4 decades below the edge and leaves a universe of helium. Matching ours at the
electron's energies, $G_4 = G_F/m_e$ (5.20 on the figure's scale), gives a neutron that lives 4.2 hours and a
freeze-out at 0.52 MeV. It keeps more than half the hydrogen for any clock longer than 0.029 s.

**What hydrogen burning makes.** At 56 points, the 8 strengths where the book's reaction network
has been built ($s$ = 1.5152, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85) across $\log_{10} G_4/(G_F/M_W)$ = 4, 4.5, 5, 5.5, 6, 6.5, 7, the network burns a core of hydrogen and
primordial helium at the temperature where half its hydrogen goes in 4.6 billion years. That is the pace of our Sun's
centre, the book's convention until stellar lifetimes are computed. Each point is coloured by what that core ends as;
the number above it is the core's temperature in millions of kelvin. In the adopted mass model:

- 27 points end as **helium-3** (1.0–3.6 MK). A fast $p + p$ makes the core cool, and then
  $^3$He + $^3$He, which has a high barrier and no weak step to wait on, is too slow to finish the chain in 4.6 billion
  years.
- 27 points end as **helium-4** (4.1–10.9 MK).
- 2 points climb **past helium**, to element 6, at 7.8–10.0 MK ($s = 1.65$ with a weak force 6–16× weaker
  than the electron-matched one).

$p + p$'s weak factor against ours runs from 0.023 at $s = 1.5152$ to 9.1 at 1.85 at the electron-matched
$G_4$: four-dimensional phase space grows faster with the positron's energy, which grows with the deuteron's binding.
So the strong and weak forces trade through $p + p$. A weaker $G_4$ or a weaker $s$ means a slower $p + p$, a hotter core
at the same pace, and helium in place of helium-3.

**Where the mass model decides.** 12 of the 56 points, all at $s \le 1.6$, end
differently under the two mass models the book carries (split markers). The step that decides them is one nucleus: can
5-11 (a triton-like cluster on ceryllium-8) plus a proton throw out a helium-4 and give ceryllium-8 back? If it can, the
primordial helium makes its own catalyst (two helium-4s are bound as ceryllium-8, and protons climb from there to 5-11)
and the catalyst is returned, a cycle like our CNO cycle that needs no earlier stars' carbon. The adopted model opens
that step for $s \le 1.6$ (energy to spare +10.9, +8.6, +4.6 MeV), and those cores burn their hydrogen to helium at
4.1–10.9 MK whatever $G_4$. The other model closes it (−21.5 to −59.8 MeV), and its low-$s$ cores climb past helium, to
elements 8–12 at 11.2–18.8 MK. Our own world cannot settle which (section 2.2.5). From $s = 1.65$ up the two models give
the same stars, nucleus for nucleus.

**Our world's point.** The star marks both forces as ours, carried over: the deuteron bound by 2.224 MeV, as
ours is ($s$ = 1.5152), and the weak force matched to ours at the electron's energies, $G_4 = G_F/m_e$ (5.20 on
the figure's scale). Its first minutes leave helium $Y$ = 0.59, 0.38, 0.14, 0.01, 0.00 at clocks of 0.01, 0.1, 1, 10, 100 s (ours: 0.245). A core burning at the Sun's pace there ends as helium (94%) at 10.9 MK
in the adopted mass model, and as past helium (gluorine-22 81%, gluorine-23 17%) at 18.5 MK in the other. So our own forces, carried into four
dimensions, sit inside every window drawn for any clock longer than 0.029 s, and on the very strip where the one undecided mass decides what their stars
make.

**What is left.** A strong force between the diproton's edge and $p + p$'s threshold; a weak force above the first
minutes' line for the universe's clock; and within that, hydrogen burning that ends as helium rather than stranded as
helium-3, which at the Sun's pace needs $s$ below about 1.7 at the electron-matched $G_4$, and lower for a stronger weak
force. The window is real and not small, but each force is held to within about an order of magnitude of a value set by
another: the strong force by the deuteron, the weak force by the electron, and both together by $p + p$.

![**Figure 1. The strong–weak plane.** Horizontal: the strength $s$ of the nucleon force (Minnesota's attraction scaled
by $s$; the deuteron binds as ours at 1.5152), from the deuteron's threshold to past the singlet pair's (dashed: the
diproton binds). Vertical: $\log_{10}$ of the weak coupling $G_4$ over $G_F/M_W$. Grey: $p + p \to d\,e^+\nu$ closed
(the deuteron binds by less than 1.804 MeV; above $s$ = 1.4516 deuterons still come slowly through $p + e^- + p$). Lines: where the first minutes leave exactly half the hydrogen, one per
clock (the universe's age at 1 MeV); above a line, more survives. Points: what a core of hydrogen and primordial helium
burns to at the temperature where half its hydrogen goes in 4.6 billion years (number: that temperature in MK), at the
8 strengths where the reaction network has been built; split where the two mass models disagree (left the
adopted ladder-anchored model, right Brink's grid). Star: our world's forces carried over (the deuteron binds as ours;
$G_4 = G_F/m_e$). $G_F/M_W$ itself is 0 on this axis, below the plane.](../figures/windows.svg)

## 2.2 Methods

### 2.2.1 The plane

$s$ multiplies the attractive terms of the Minnesota nucleon force [@thompson1977], whose two Gaussians and
repulsive core are kept as functions of distance in both worlds. The force's shape is a borrowing, and its strength is
the choice. The plane is drawn on 50 strengths from 1.40 to 1.891 and 17 couplings from $10^{ 3 }$ to
$10^{ 7 }$ times $G_F/M_W$ in steps of 0.25 decades, at clocks of 0.01, 0.1, 1, 10, 100 s. $G_F/M_W$
(1.45 × 10^−16^ MeV$^{-3}$) is a reference, not a claim. It is what a 4 + 1 gauge theory gives if its coupling is ours at its
own scale ($g_5^2 M_W = g^2$), and quoting every $G_4$ against it keeps the axis dimensionless. Produced by
`fusion/tools/windows4.mjs`, drawn by `papers/p2/figures/windows.mjs`.

### 2.2.2 The strong window's edges

Two nucleons in an s-wave with the triplet (deuteron) or singlet (diproton) Minnesota force, solved as a radial problem
in four dimensions. The s-wave carries the centrifugal-like term $\hbar^2 (d-1)(d-3)/8\mu r^2$, a barrier in 4D that our
deuteron does not have. Bound states are found by Sturm bisection on a finite-difference grid (`atom/js/nuclear.js`,
`levels`; the deuteron with its wavefunction by `deuteron`), and each edge by bisection in $s$ (`window`). The singlet
edge is computed without the Coulomb force, so it is strictly the dineutron's. The diproton binds a little above it, and
the dashed line is the conservative edge.

### 2.2.3 Proton + proton

The positron route needs $B_d > (m_n - m_p) + m_e$ and the electron-capture (pep) route $B_d > (m_n - m_p) - m_e$, each
with the deuteron's binding from 2.2.2. Where it is open, the $p + p$ rate is computed, not assumed. The nuclear part is
$|\int u_d\, u_E\, dr|^2$, the overlap of the deuteron with the two protons' Coulomb scattering state, both from the same
force. The lepton part is the positron's phase space at that world's endpoint, and the constant is set on our
$S(0) = 4.01 \times 10^{-22}$ keV b [@adelberger2011] (`nuclear.js` `ppOverlap`; on ours it gives $\Lambda^2 = 7.04$
against the evaluated 7.035 of the same review).

### 2.2.4 The first minutes

Weak rates are Fermi's contact theory [@fermi1934] in $d$ dimensions (`atom/js/weak.js`). The coupling $G_d$ has units of
mass$^{-(d-1)}$, and a decay's rate is

$$\Gamma = \frac{G_d^2\, m_e^{2d-1}\, |M|^2\, \Omega_d^2\, f_d(W_0)}{(2\pi)^{2d-1}}, \qquad f_d(W_0) = \int_1^{W_0} p^{\,d-2}\, W\, (W_0 - W)^{d-1}\, dW,$$

with $W$ the electron's energy and $p$ its momentum in units of $m_e$, $\Omega_d$ the unit sphere's area, and no Fermi
function (it costs 7% on our neutron). The free neutron's $|M|^2 = |V_{ud}|^2(1 + 3g_A^2)$ is kept as ours: in 4D the
nucleon is still the smallest spinor, and $g_A$ belongs to the strong force. The hot universe converts neutrons to
protons through $n + \nu \to p + e^-$ and $n + e^+ \to p + \bar\nu$, with thermal, Pauli-blocked leptons and the electron's
mass kept. The reverse rate follows by detailed balance. The neutron fraction $X$ is integrated as the universe cools from
equilibrium to a thousandth of the expansion rate (`neutronFraction`), and it fixes an equivalent freeze-out
temperature $T_f = Q/\ln(1/X - 1)$.

The clock is $t = t_1 (1\,\mathrm{MeV}/T)^{(d+1)/2}$, the radiation-dominated law in $d$ dimensions with $t_1$ the free
parameter that gravity will set, and one clock serves freeze-out and the bottleneck alike (declared; ours' two clocks,
before and after electron–positron annihilation, differ by 1.8×). The deuterium bottleneck breaks where Saha's
equilibrium puts as many deuterons as neutrons, with baryons per photon η = 6.1 × 10^−10^ (ours, declared), and the
helium made is $Y = 2X_f\, e^{-t_D/\tau_n}$ (`atom/js/bbn.js` `firstMinutes`). The edge drawn is $Y = 1/2$, found on the
grid and interpolated linearly in $\log G_4$.

The scaling of section 2.1 follows from the rate's dimensions. With massless leptons the conversion rate is
$\propto G_d^2 T^{2d-1}$ and the expansion rate $H = T^{(d+1)/2}/(q\, t_1)$, so $\Gamma = H$ at
$T_f \propto (G_d^2 t_1)^{-2/(3d-3)}$, a function of $G_d^2 t_1$ alone. Contours of constant helium are lines of slope
$-1/2$ in $\log G$ against $\log t_1$. The computed slope, with the electron's mass and the integration kept, is
0.500.

### 2.2.5 Hydrogen burning at the network's points

**Nuclei.** The light 4D nuclei, by protons and neutrons, are $k$ helium-4s plus at most one small cluster (a nucleon,
two nucleons, a triton-like or helium-3-like cluster). Their bindings come from three calculations:

- helium-4 and mass 3 by diffusion Monte Carlo, exact for $A \le 4$;
- the helium-4 "ladder" ($k$ helium-4s by Monte Carlo on their pair potential);
- the clusters on fixed draws of a core of $k$ helium-4s in Brink's antisymmetrized-Gaussian model [@brink1966; @freer2018] (Hill–Wheeler [@hill1953] over
  the cluster's placements).

The ladder and Brink's grid are two methods, and on our own nuclei they err in opposite directions. Against AME2020 [@wang2021],
for $k + 1$ helium-4s relative to free ones:

| | ¹²C | ¹⁶O | ²⁰Ne | ²⁴Mg |
|---|---|---|---|---|
| measured | −7.3 | −14.4 | −19.2 | −28.5 |
| ladder | −1.4 | −4.9 | −10.0 | −16.0 |
| Brink grid | −5.3 | −19.9 | −35.4 | −93.3 |

(MeV.) The ladder underbinds, and the grid overbinds more as the core grows. Mixing grid clusters onto ladder cores,
which the network first did, puts nuclei from the two methods side by side and decides reactions by their difference.

The adopted model keeps the ladder's nuclei and scales every grid separation on core $k$ by
$r_k = S_4^{\mathrm{ladder}}(k)/S_4^{\mathrm{grid}}(k)$. That is the ratio of the two methods' energies to remove one more helium-4
from the same core, so each cluster's binding is measured against the grid's own helium-4 binding and carried to the
ladder. On ours it gives the 22 measured separations of a nucleon, two nucleons, a triton or a helium-3 from cores
of ⁸Be to ²⁰Ne to a median 30%, against 91% for the grid alone. The grid alone is kept as the other mass model
(`fusion/tools/nuc4.mjs`, `MASS=ladder|grid`; `fusion/tools/masscheck.mjs`).

The one nucleus that splits them is 5-11 on its ceryllium-8 core. Its analogue in ours, ¹¹B + p → 3α, has
$Q = 8.59$ MeV measured, 7.2 in the grid and 15.5 in the adopted model. Taking the adopted model's
6.9 MeV excess off the 4D values leaves +4.0 / +1.7 / −2.3 MeV at $s = 1.5152 / 1.55 / 1.6$; scaling instead closes the
step everywhere. So ours does not decide it, and the figure shows both.

**Rates.** Two-body rate constants at the density of our Sun's centre, on a temperature grid
(`fusion/tools/rates4.mjs` → `fusion/data4.js`):

- **computed** where the book has computed the reaction: $p + p$ (2.2.3, with 4D's weak factor), helium-4 + helium-4 by
  E2 capture, and protons and helium-4s onto two to four helium-4s by E1 and E2 capture on folded potentials;
- **carried** otherwise: our analogue's nuclear factor (its REACLIB [@cyburt2010] rate, from pynucastro's snapshot [@smith2023], against our $p + p$'s, through our Coulomb
  barrier) put through 4D's barrier;
- **β decays** from their own endpoints with ¹³N's matrix element and 4D's phase space;
- **(p,α) branches** wherever the compound nucleus sits above its helium-4 threshold, with our ¹⁵N(p,α)'s factor.

Every weak reaction is baked at the electron-matched $G_4$. A point at another $G_4$ multiplies all of them by
$(G_4/G_{4,\mathrm{baked}})^2$, exactly how the weak factor scales.

**The core.** Hydrogen 0.75 and helium-4 0.25 by mass, burned at constant temperature and density by backward Euler
with Newton's method on the analytic Jacobian (`fusion/js/net4.js`). The temperature is the one at which half the
hydrogen goes in 4.6 billion years, found by bisection. It ends as helium-3 if that holds more than half the mass, as
helium if helium-4 does, and past helium if nuclei of mass 8 and above do (no point fell short of all three).

**Not in it.** Electron screening; neutron captures; reverse rates' partition functions; the star around the core (no
structure, no mixing, no lifetime: the pace is the convention). Pinned gravity's clock is a parameter, not a result.

### 2.2.6 What is computed, carried and chosen

| | status | from |
|---|---|---|
| the strong window's edges, $p + p$'s threshold | computed | Minnesota at strength $s$ (shape borrowed) |
| freeze-out, neutron lifetime, first-minutes helium | computed | Fermi theory in 4D; $\eta$ and the clock declared |
| light nuclei | computed, two methods | Monte Carlo ladder and Brink's grid; adopted model and band |
| $p + p$, ⁴He + ⁴He, captures onto 2–4 ⁴He | computed | the same force |
| other rates | carried | REACLIB analogues through 4D's barrier |
| the core's temperature | convention | our Sun's pace, until lifetimes |
| $s$, $G_4$, the clock | chosen | the axes; gravity will fix the clock |

### 2.2.7 Checks on our own world

| | computed | measured |
|---|---|---|
| neutron lifetime (no Fermi function) | 945 s | 878.4 ± 0.5 s [@pdg2024] |
| freeze-out (clock 0.74 s) | 0.800 MeV | about 0.8 MeV (the standard estimate, not a measurement) |
| primordial helium $Y$ | 0.241 | 0.2449 ± 0.0040 [@aver2015] |
| ¹¹B + p → 3α, $Q$ (grid / adopted) | 7.2 / 15.5 MeV | 8.59 MeV |
| α-cluster binding, ¹²C–²⁴Mg | ladder under, grid over | (table above) |

### 2.2.8 Reproducing it

`node four/fusion/tools/rates4.mjs <s,…>` bakes the network (about 2.5 minutes a strength; `MASS=grid` for the other
model, into a copy of `four/`), `node four/fusion/tools/windows4.mjs` (with `ALT=<that copy>`) computes the plane, and
`node four/papers/p2/figures/windows.mjs` draws it. `node four/fusion/tools/masscheck.mjs` writes ours' check, and
`node four/papers/p2/build.mjs` fills this text from all of them. The light nuclei come from the runner's `masses-1` and
`plusmore-1` runs.
