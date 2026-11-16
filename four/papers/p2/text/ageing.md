# Stars that age: our Sun first

<!-- Paper 2, section 4 (draft): ageing a star, checked on our own Sun before four-dimensional stars are aged the same
     way. Every double-braced token is read by build.mjs from data/evolvecheck.json (fusion/tools/suncheck.mjs); write
     numbers as tokens, never by hand. -->

Section 3 built stars at zero age only. It stood in for their lives with the time a zero-age centre, held at its
temperature and density, takes to burn half its hydrogen, and calibrated that clock on our Sun by a declared factor.
This section ages stars instead: hydrogen burnt shell by shell, the stirred regions mixed, the star re-solved at every
step. Before four-dimensional stars are aged that way, the machinery is run on our own Sun and checked against the
standard solar models, in four layers so that a mismatch can be placed: the burning law alone, the structure alone,
the calibration, and the history.

## 4.1 Results on our Sun

**The burning law is right.** At Model S's own temperatures, densities and abundances
[@jcd1996], shell by shell out to half the Sun's mass, our energy generation is {{epsLo}}–{{epsHi}} times Model S's.
Without screening it would be {{epsUnLo}}–{{epsUnHi}}.

**The structure carries the opacity's error.** Solved on Model S's composition profile, with our opacity, gas and
burning, the star has $L$ = {{stL}} L☉ and a centre at {{stTc}} MK and {{stRho}} g/cm³. Model S has {{stTcS}} MK and
{{stRhoS}} g/cm³. Half its light comes from inside $q$ = {{stQ50}} of the mass, against Model S's {{msQ50}}. So with
the composition given, our Sun is {{stRhoPct}} less dense at the centre and its burning is spread a little wider. That
is our opacity, a textbook Kramers law with electron scattering, 1.3–1.5 times Model S's (OPAL) through the core. Four-dimensional
stars do not use it: they have their own opacity, computed from the lens vacuum.

**Calibrated as standard models are, the Sun ages correctly.** A standard solar model sets its initial helium so the
luminosity is L☉ at 4.57 Gyr. Done the same way here, the initial hydrogen is $X_0$ = {{X0cal}}; Bahcall,
Pinsonneault & Basu's model has {{X0bp}} [@bahcall2001]. At 4.57 Gyr the centre is at {{nowTc}} MK (theirs
{{bpTc}}, Model S {{msTc}}). The luminosity history $L(t)/L(4.57\,\mathrm{Gyr})$ follows theirs to within
{{relEarly}}% from 0.2 to 4.6 Gyr. After that ours brightens faster, to {{L8}} at 8 Gyr against {{L8bp}}, {{relLate}}%
apart. The centre's hydrogen runs out ($X_c$ = 10⁻³) at {{tX001}} Gyr. Pols's 1 M☉ model of near-solar composition
does it after {{polsX001}} [@pols2026, §10.2.2].

**What does not match, and why.** The present centre is {{nowRhoPct}} less dense than the standard models' ({{nowRho}}
against {{bpRho}} and {{msRho}} g/cm³). That is the structure's own shortfall above, carried along. Its hydrogen is
$X_c$ = {{nowXc}} against {{bpXc}} (BP2000), {{msXc}} (Model S) and {{b16Xc}} (B16 [@vinyoles2017]). It stays higher
later too: {{Xc65}} at 6.5 Gyr against {{Xc65bp}}, and $X_c$ = 0.008 at {{tX008}} Gyr against their 8. All three
reference models let helium settle into the core, which lowers its hydrogen; ours have no diffusion. How much of the
difference that accounts for would need a reference model without it, which these papers do not tabulate.

**Section 3's clock, tested.** Aged, our Sun's centre halves its hydrogen in {{clockAged}} Gyr. Held at the
temperature and density of the settled zero-age star (0.1 Gyr, {{setTc}} MK), fresh gas would take {{clockSet}} Gyr,
a factor of {{clockSetR}}. Section 3 took {{clockS3R}}, from a zero-age Sun built under a simpler burning law. The
factor depends on what counts as zero age. The run's very first star, before its helium-3 and carbon-12 have come
into balance, sits at {{freshTc}} MK and would take {{clockFresh}} Gyr, a factor of only {{clockFreshR}}. Ageing the
four-dimensional analogues themselves removes the convention. That is the next step, on this machinery.

## 4.2 Methods

### 4.2.1 The star

The star is section 3's solver: hydrostatic and thermal equilibrium, Fermi–Dirac electrons, convection at the
adiabatic gradient, our opacity. Its composition may now vary with mass. The energy comes from burning only. The slow
contraction's share, $\varepsilon_\mathrm{grav}$, is left out; it is small on the main sequence. The composition
lives on a fixed grid in $q = m/M$, 401 points spaced as $q = (j/400)^{1.5}$, finer at the centre.

### 4.2.2 The burning

Each shell carries its own protons, helium-3, helium-4 and carbon, nitrogen and oxygen isotopes. It burns on every
REACLIB reaction of the pp chains and the CN and NO cycles [@cyburt2010], with weak screening by Debye–Hückel
[@pols2026, eq. 6.31] and each weak reaction's neutrino share taken off (pp 0.265, ⁷Be 0.814, ⁸B 6.71 MeV [@pols2026, §6.4.1]).
Short-lived species (deuterium, beryllium-7, the CNO cycle's β-unstable nuclei) sit at their steady state in the
structure. Helium-3 is evolved, because outside the Sun's centre it never reaches its steady state. Each shell burns
implicitly (backward Euler with Newton) at its own temperature and density. In the structure each shell's energy is a
local power law in $\rho$ and $T$, refitted at each solution until the luminosity settles to 10⁻⁴.

### 4.2.3 Stirring and stepping

A region the solver stirs burns as one zone, on the mass-weighted mean of its shells' rate constants. Each flux is
linear in its rate constant, so that is exact while the zone stays mixed. Burning each shell on its own over a step
starves a convective core's centre of the fuel the stirring brings in: in its first few tens of millions of years, our Sun's carbon-12 burning
stirs up to a tenth of its mass. Each step is second-order: burn half a step at the present star's conditions,
re-solve, then burn the whole step at that half-way star's conditions. A step is accepted only if what the shells
burnt over it matches what the half-way star radiated to 0.3%. Otherwise it is halved. Over the Sun's life the ratio
stayed within {{balLo}}–{{balHi}}. To 4.57 Gyr that took {{nMod}} models. Tightening the check to 0.1% ({{nModFine}}
models) moves $L$ by {{dLfine}}% and $X_c$ by {{dXfine}}.

### 4.2.4 The references

Bahcall, Pinsonneault & Basu's standard model (BP2000) gives $L$, $R$ and $T_\mathrm{eff}$ against age in its tables
1–3, the centre's hydrogen in its §III.4 and the present centre in its table 5 [@bahcall2001]. Model S is the present
Sun, read from its authors' model file [@jcd1996]. Its abundances, ε and κ serve the first two checks. B16-GS98 gives
the present centre's helium and metals [@vinyoles2017, table 4]. Every number used is kept in `data/ssm-ref.json` and
`data/modelS.json` with its locator.
