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
four-dimensional analogues themselves removes the convention, and they have now been aged on this machinery, with
the charge law's plasma (screening under the pinned $1/r$ and the lens vacuum's cutoff on light). Of the {{a4grid}}
Sun analogues section 3 found, {{a4n}} burn half their central hydrogen, in
{{a4min}}–{{a4max}} Gyr: {{a4rlo}}–{{a4rhi}} times the 4.6 Gyr section 3 gave them.{{a4rest}} From G = 10⁻¹⁴ to 10⁻²⁰ the
slowest sit at the strength nearest ours, s = 1.5152: {{a4s15}} Gyr.

At that strength {{a4nStall}} runs stop at the same point in the core's chemistry, at G = {{a4stGs}}. The centre has
burnt all its helium and holds, by mass, hydrogen {{a4cH}}, pxygen {{a4cPx}} and oitrogen {{a4cOx}}: the proton
captures that turn oitrogen into pxygen-20, the burning that stirred the core, are running out of oitrogen. At
G = {{a4stG}} half the hydrogen is gone at {{a4stHalf}} Gyr and the solver finds no star past {{a4stEnd}}. Over its
last {{a4stDt}} Gyr the stirred core shrank from {{a4stQ0}} to {{a4stQ1}} of the mass, while the centre grew {{a4stRho}}
denser and {{a4stTc}} cooler and the light rose {{a4stL}}. The solver keeps every shell in thermal balance, with no
energy drawn from contraction, so it cannot follow a core changing that fast; where it fails does not depend on where
the shooting meets. Following these stars further needs that energy in the structure.

**What the aged stars hold.** Summed over each analogue's last kept profile, the elements past helium are {{ashA}} of
its mass at s ≤ 1.55, mostly {{ashAel}}; {{ashB}} at s = 1.6–1.65, {{ashBel}}; {{ashC}} at s = 1.7, {{ashCel}};
and at most {{ashDmax}} from s = 1.75 up, where the stars burn hydrogen to helium and no further. Where the climb runs,
the stars of weaker gravity (heavier, with hotter cores) mostly make more. This is what the stars hold when their runs
end, not what they return to the gas. What they return, and the second generation built from it, come next.

**The opacity, measured and then computed.** Everything above carries the textbook opacity: electron scattering plus
Kramers's law. Along Model S's interior that law is {{krLo}}–{{krHi}} times OPAL's tables [@iglesias1996], and it is
why the centre above is too thin. With OPAL's tables in the interior (Asplund et al.'s mixture [@asplund2009], with
Ferguson et al.'s below 5600 K [@ferguson2005], as MESA distributes them [@paxton2011]), the star's outer layers
integrated as an envelope on the surface model's gas with mixing length α, and the Sun calibrated on two numbers at
MIST's $Z$ = {{opZ}} ($X_0$ to L☉ and α to R☉ at 4.57 Gyr), $X_0$ = {{opX0}} and α = {{opAlpha}}. At 4.57 Gyr the
centre is then {{opTc}} MK and {{opRho}} g/cm³, against BP2000's {{bpTc}} and {{bpRho}}, and $X_c$ = {{opXc}}.
Against MIST's published tracks [@choi2016; @dotter2016], at 1–3 M☉ and half the centre's hydrogen, $L$ is
{{mLlo}}–{{mLhi}} of MIST's, $R$ {{mRlo}}–{{mRhi}} and $T_\mathrm{eff}$ {{mTlo}}–{{mThi}}. On the textbook opacity
$R$ was {{kRlo}}–{{kRhi}} and $T_\mathrm{eff}$ up to {{kThi}}. Lives to $X_c$ = 10⁻³ come to {{lifeHlo}}–{{lifeHhi}} of
MIST's at 1.6–3 M☉, where MIST's cores overshoot into fresh fuel, and {{lifeSun}} at 1 M☉, where its helium settles
inward. Neither is in our stars.

OPAL is measured input, not the book's own physics. The book's own opacity is the surface model's, carried inward.
Free–free takes a Born–Elwert Gaunt factor. The metals' bound–free and free–free come from every ion of fifteen
elements, each solved by the book's atom and ionized by Saha with Debye lowering. Along Model S's interior, metal-free
gas comes to {{bk0lo}}–{{bk0hi}} of OPAL's metal-free tables, against {{bkg1lo}}–{{bkg1hi}} with the Gaunt factor set to
1. The ions supply {{bkMlo}}–{{bkMhi}} of what OPAL's metals add, and the whole comes to {{bkLo}}–{{bkHi}} of OPAL's.
What is left is the lines, the bound–bound transitions, which the book does not have yet.

**Without metals.** The metals and their lines drop out of a metal-free star. Only hydrogen's and helium's lines
remain missing from the book, and they matter only in the outer envelope. So there the book's own opacity can be tried
nearly whole, against MIST's metal-poor tracks ([Fe/H] = −4) at the same hydrogen. At half its central hydrogen, a 1 M☉ star
on OPAL's metal-free tables has {{fo1L}} of MIST's $L$ and {{fo1T}} of its $T_\mathrm{eff}$, and lives {{fo1life}} as
long. On the book's own opacity it has {{fb1L}}, {{fb1T}} and {{fb1life}}. At 0.8 M☉ the two give $L$ {{fo08L}} and
{{fb08L}}; at 1.6 M☉ {{fo16L}} and {{fb16L}}, with lives {{fo16life}} and {{fb16life}}. So the book's own opacity costs
a few per cent of the light against OPAL's. Both fall short of MIST's luminosity by more than at the Sun's metals, on
the same tables, so that shortfall is not the opacity. Where it comes from is open. MIST's helium settling matters more
in a metal-poor star, whose stirred envelope is thin. Its equation of state is another difference.

## 4.2 Methods

### 4.2.1 The star

The star is section 3's solver: hydrostatic and thermal equilibrium, Fermi–Dirac electrons, convection at the
adiabatic gradient, our opacity. Its composition may now vary with mass. The energy comes from burning only. The slow
contraction's share, $\varepsilon_\mathrm{grav}$, is left out; it is small on the main sequence. The composition
lives on a fixed grid in $q = m/M$, 401 points spaced as $q = (j/400)^{1.5}$, finer at the centre.

With OPAL's opacity, the tables are read in $\log T$ and $\log R$ ($R = \rho/T_6^3$) by cubic interpolation, linearly in
$X$ and $Z$, the low- and high-temperature tables blended over $\log T$ = 3.80–3.88 as MESA does. The envelope is the
surface model's gas from the photosphere inward. It starts with a grey atmosphere from τ = 10⁻⁴ to ⅔, then integrates
inward in $\ln P$ at fixed $L$ to 3 × 10⁵ K, where the interior takes over. Its convection is mixing length
(Böhm-Vitense's cubic, in Kippenhahn & Weigert's form), with $\ell = \alpha H_P$. Its last step is cut to end exactly
at 3 × 10⁵ K, so the fit point moves smoothly with $R$ and $L$. Every star is settled for 10⁶ yr before its clock
starts, so that its carbon-12 and helium-3 come into balance, as MIST's zero age is taken after them.

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
