# Stars that live: how long a four-dimensional star burns, and what a star like our Sun makes

<!-- Paper 2, section 3 (draft): the technical content and methods for figure 2. Every double-braced token is read by build.mjs
     from data/lifetimes.json, fusion/eps4.json or the solvers; write numbers as tokens, never by hand. -->

Section 2 asked which forces let hydrogen burn and set the burning core's temperature by a convention: our Sun's pace,
half the hydrogen in 4.6 billion years, at the network's own reference density. This section replaces that convention
with stars. For each strength $s$ of the nuclear force and each strength $G$ of gravity, it builds the main sequence of
four-dimensional stars, burning by the reaction network of section 2. It asks two questions: does any star burn as
slowly as ours, and what does the centre of the one that matches our Sun turn its hydrogen into? Gravity is the one
force the book has not yet fixed, so here it is an axis, 10^−11^, 10^−14^, 10^−17^, 10^−20^, 10^−23^ times ours.

## 3.1 Results

**Long-lived stars are generic.** 55 main sequences were run (40 in the adopted mass model and
15 in Brink's grid where the two once differed, $s \le 1.6$). 53 of them gave 553 stars from
0.13 to 5 Chandrasekhar masses, each with the time its core, held at its central temperature and density, takes to burn half
its hydrogen (figure 2a). Lighter stars burn slower, as ours do, by 6–11 decades across the range at each gravity. The slowest
take up to 1 × 10^5^ Gyr. At $G$ = 10^−11^ × ours the heaviest burn half their core in 268 years. At $G$
= 10^−23^ every star computed takes at least 13 Gyr.

**A Sun analogue at almost every point.** Our Sun's own centre, built by the same solver at zero age (13.5 MK,
74 g/cm³) and burnt by our measured rates at fixed temperature and density, takes 11.1 Gyr to burn half its
hydrogen. The real centre took about 4.6, because a core heats and compresses as it burns (section 3.2.3). So a
four-dimensional star whose zero-age core takes 11.1 Gyr is our Sun's analogue, if four-dimensional cores evolve as
ours do. 29 sequences have one inside the masses computed. Its mass, in Chandrasekhar masses at that gravity,
grows as gravity weakens:

| $G$ (× ours) | the analogue's mass ($M_\mathrm{Ch}$) | its centre (MK) |
|---|---|---|
| 10^−11^ | 0.20–0.44 | 3–17 |
| 10^−14^ | 0.39–0.50 | 3–19 |
| 10^−17^ | 0.78–0.97 | 4–21 |
| 10^−20^ | 1.75–2.53 | 5–23 |
| 10^−23^ | above 5 | — |

Where none is found at stronger gravity ($s = 1.7$ at 10^−11^ and $s = 1.75$ at 10^−11^ and $s = 1.7$ at 10^−14^), the solver's sequence starts at 0.4 $M_\mathrm{Ch}$ or more
and every star in it burns its core within 2.50 Gyr: the analogue lies below the masses computed, not outside
the window. At $G$ = 10^−23^ it lies above them. The solver found no first star for G = 10^−23^, s = 1.65; G = 10^−23^, s = 1.7.

**What the analogue burns to** (figure 2b; each centre run through the network to the end of its hydrogen at its own
temperature and density):

- 13 climb **past helium**, to elements 6–12, at 10–23 MK: every analogue at
  $s \le 1.6$ but one, and $s$ up to 1.65 where gravity is weak. At our world's strength, $s$ = 1.5152, the
  centre runs at 17.0, 18.9, 20.8, 23.3 MK at $G$ = 10^−11^, 10^−14^, 10^−17^, 10^−20^; at 10^−17^ it ends as oeon-24 48%, gluorine-23 32%.
- 10 make **helium**, at 4–11 MK.
- 6 strand as **helium-3**, at 2.5–4.7 MK: the strongest nuclear forces, where the analogue's centre is too
  cool for helium-3 to burn itself. That gives way to helium as gravity weakens: at $s = 1.85$ the analogue makes helium
  from $G$ = 10^−20^.

The two mass models give the same outcome at all 12 points where both found an analogue, and its mass
differs by at most 8%, as section 2's bound on the ceryllium cycle predicts.

**Real cores are less dense than the convention's.** The network's reference density is 3 × 10^17^–6 × 10^18^
kg/m⁴ over 10–50 MK. The analogues' centres lie at 8 × 10^12^–9 × 10^17^, near it at the strongest gravity and
thinning as gravity weakens. A thinner core must be hotter to burn at the same pace, so weak gravity pushes figure 1's
pattern towards burning further: helium-3 stranding retreats and the climb past helium reaches higher strengths.

**Burning steep enough for convective cores, without a CNO cycle.** In our Sun, the pp chains' rate rises with
temperature about as $T^{ 4.6 }$ and the CNO cycle's as $T^{ 15–16 }$ (our measured rates, computed the
same way as below). The steep CNO cycle is what gives our stars above about 1.25 solar masses a convective core:
0.19 of the mass at 2.5 solar masses, 0.27 at 5. Four dimensions has no cycle, but where the network climbs
past helium its captures are as steep. A fresh core's rate rises as $T^{ 3–7 }$ where the pp chains carry it,
and as $T^{ 15–19 }$ above 18 MK at $s$ = 1.5152, where the climb does; at $s = 1.85$, which never climbs, it
stays at $T^{ 3–5 }$. At $G$ = 10^−17^ the heaviest star computed (5 $M_\mathrm{Ch}$) has a convective
core of 0.19 of its mass at $s$ = 1.5152, 0.19 at 1.55 and 0.09 at 1.85. Four dimensions' adiabatic
gradient is 1/3 against our 2/5, so convection starts more easily. Light stars show small, noisy convective centres
(0.01–0.06 of the mass from 0.5 $M_\mathrm{Ch}$ up at 10^−17^), where ours have none. These are zero-age cores, and
$\bar\varepsilon$ is a mean over the first half of the hydrogen, so a core's sensitivity before its catalysts build up
is not resolved.

![**Figure 2. Four-dimensional stars that live.** (a) The time a star's core, held at its zero-age central temperature
and density, takes to burn half its hydrogen, against the star's mass in Chandrasekhar masses, at $G$ = 10^−17^ × ours,
one line per strength $s$ (solid: the adopted mass model; dashed: Brink's grid, $s \le 1.6$). Dashed grey: 11.1 Gyr,
our zero-age Sun's core computed the same way; dotted: 4.6 Gyr. (b) For each $G$ and $s$, the star whose core takes
11.1 Gyr, coloured by what its centre burns its hydrogen to (number: its central temperature, MK); open circles:
the analogue lies outside the masses computed. Every point is the same in both mass models.](../figures/lifetimes.svg)

## 3.2 Methods

### 3.2.1 The network as an energy law

The network of section 2 knows each rate relative to proton + proton's at a reference density; a star needs energy per
kilogram per second at its own density. The two meet through proton + proton itself. Its absolute four-dimensional
rate is $\langle\sigma v\rangle = \tilde S\, c\, (\hbar c)^3 I(T) / (2\mu^2 (kT)^2)$: $\tilde S$ our $p + p$'s nuclear
factor (carried), $I(T)$ the barrier integral through the same 4 fm barrier the network uses, times the computed nuclear
overlap and four dimensions' weak factor as the network carries them. The network's own $p + p$ rate is
$k_{pp}(T) = n\langle\sigma v\rangle$ at its reference density, so
$\rho_\mathrm{ref}(T) = m_u k_{pp,\mathrm{net}}(T)/\langle\sigma v\rangle(T)$, and running the network at
$\rho/\rho_\mathrm{ref}(T)$ is burning at density $\rho$. Every four-dimensional two-body rate shares the
$1/(\mu^2 (kT)^2)$ form, so one $\rho_\mathrm{ref}(T)$ serves them all. On a grid of 31 temperatures (1–100 MK) by 11
densities ($10^{13}$–$10^{18}$ kg/m⁴), a fresh primordial core (hydrogen 0.75, helium-4 0.25 by mass) burns at fixed
$T$ and $\rho$ until half its hydrogen is gone. That gives the half-life $t_{1/2}$ and the mean energy rate over it,
$\bar\varepsilon$: the loss of atomic rest mass over $t_{1/2}$, with the catalysts built up as they are in a real
core. The neutrinos' share is not taken off; in our pp chains it is about 2%. The weak coupling is the electron-matched
$G_4 = G_F/m_e$ throughout.

### 3.2.2 The star

Each star is a zero-age main-sequence model in four dimensions, solved by shooting from the centre and the surface to
meet at a fitting mass, with Newton's method on the central pressure and temperature, the radius and the luminosity.
Its parts:

- **the gas:** ideal ions; Fermi–Dirac, relativistic electrons; light pressing $u/4$ with $u = aT^5$;
- **transport:** radiation, or convection at the adiabatic gradient $2/(d+2)$ wherever radiation cannot carry the flux;
- **opacity:** scattering by free electrons through the lens vacuum ($\kappa \propto 1/T$), plus classical free–free
  absorption from the pinned charge law, at its central value (factor 1 of a 0.5–2 band);
- **gravity:** pinned $1/r$, which has no shell theorem, so the pull at each radius is summed over the whole profile
  and iterated until it settles;
- **the photosphere:** at optical depth 2/3.

The burning is $\bar\varepsilon(T,\rho)$ from 3.2.1, interpolated in the logarithms. The convective core is the mass
inside the innermost point where the temperature gradient falls below the adiabatic one. Each sequence starts from one
Chandrasekhar mass at that $G$ (the four-dimensional limit for a white dwarf of two nucleons per electron) and walks
in mass from there. Where the walk cannot start from the diffusion estimate it falls back to a grid of central
temperatures.

### 3.2.3 The Sun analogue

A star's core half-life at fixed central conditions is not its lifetime. The core heats and compresses as hydrogen
turns to heavier nuclei, and burns faster. The solver builds zero-age stars only, so the comparison is made at zero age
on both sides. Our own zero-age Sun from the same solver (13.5 MK, 74 g/cm³), burnt by REACLIB [@cyburt2010]
at fixed $T$ and $\rho$, halves its hydrogen in 11.1 Gyr. The real centre has done it in about 4.6. The analogue is
the four-dimensional star whose zero-age core takes the same 11.1 Gyr, found by interpolating $\ln t_{1/2}$ in
$\ln M$ between the two stars around it. This assumes that four-dimensional cores evolve by the same factor as ours;
it is declared, not computed. The 4.6-Gyr star is kept beside it in the data.

### 3.2.4 What a centre burns to

The analogue's centre, at its own $T$ and $\rho$, is run through the network until its hydrogen is gone. It is classed
by its main product: helium-3 or helium-4 if either is more than half the mass, past helium if nuclei of mass 8 and
up are. This is section 2's run, with the star's own conditions in place of the convention's.

### 3.2.5 Temperature sensitivity

The exponent $\nu = -d\ln t_{1/2}/d\ln T$ of a fresh core's half-life at fixed density. For four dimensions it comes
from the 3.2.1 table at $10^{16}$ kg/m⁴, differenced across two grid steps. For ours it comes from REACLIB at our
zero-age centre's density, over a 10% step: hydrogen and helium alone for the pp chains at 15 MK, and our Sun's
carbon, nitrogen and oxygen at 20–30 MK for the CNO cycle. Where the energy per reaction stays fixed, $\nu$ is the
exponent of $\varepsilon \propto T^\nu$.

### 3.2.6 What is computed, carried and chosen

| | status | from |
|---|---|---|
| the burning, its energy and its temperature sensitivity | computed | section 2's network; $p + p$'s absolute rate |
| $p + p$'s nuclear factor $\tilde S$ | carried | ours, through 4D's barrier |
| the star's structure, gas, transport | computed | the solver, pinned gravity |
| opacity | computed, one value of a band | lens-vacuum scattering, classical free–free |
| composition | chosen | hydrogen 0.75, helium-4 0.25; no metals |
| the Sun analogue | calibrated on ours | zero-age $t_{1/2}$ = ours'; cores evolving as ours assumed |
| $G$, $s$ | chosen | the axes; $G_4$ electron-matched |
| what happens after zero age | not computed | — |

### 3.2.7 Checks on our own world

| | computed | standard value |
|---|---|---|
| pp chains' $\nu$ near our Sun's centre | 4.6 | about 4 |
| CNO cycle's $\nu$ at 20–30 MK | 15–16 | about 15–20 |
| first convective core | 1.25 $M_\odot$ | about 1.2–1.3 $M_\odot$ |

The standard values are textbook rules of thumb, quoted from memory and not yet checked against a source.

### 3.2.8 Reproducing it

`node four/fusion/tools/eps4.mjs` (with `ALT=<a copy of four/ baked under MASS=grid>`) writes the energy law
`fusion/eps4.json`, about 15 minutes per mass model.
`node four/atom/tools/mainseq.mjs net <G> <s> [ladder|grid] 1` builds one sequence, 5–25 minutes each. The
55 sequences ran as the runner's `lifetimes-1`; the 15 at $s \le 1.6$ in the adopted model were rerun
after section 2's bound changed the network.
`node four/fusion/tools/lifetimes4.mjs <their directory>` (with `ALT=` and `OURS=<mainseq.mjs ours's output>`)
writes `data/lifetimes.json`, `node four/papers/p2/figures/lifetimes.mjs` draws figure 2, and
`node four/papers/p2/build.mjs` fills this text.
