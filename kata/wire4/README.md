# wire4 — a hot wire in a four-dimensional pipe: derivations and the first computation

Study scripts, notes and a page (kata.mino.mobi/wire4/). Started 2026-11-19, after the rope paper. The aim is a hot-wire anemometer in a
4D pipe flow with the vortices it sheds modelled; this directory holds what has been derived and computed so far.
Nothing here has been reviewed by anyone but its author.

## 1. Laminar flow in the pipe (derived; checked numerically by `pipe4.mjs`)

A 4D pipe has one axial direction and a cross-section that is a 3-ball. For a cross-section of dimension m (ours 2,
4D's 3), with G the pressure gradient:

| | general m | ours | 4D |
|---|---|---|---|
| profile | G(R² − r²)/(2mμ) | /4μ | /6μ |
| mean speed | GR²/(m(m+2)μ) | GR²/8μ | GR²/15μ |
| centreline ÷ mean | (m+2)/2 | 2 | 2.5 |
| flow rate | S G R^(m+2)/(m²(m+2)μ) | πGR⁴/8μ | 4πGR⁵/45μ |
| wall shear | GR/m | GR/2 | GR/3 |
| Darcy friction factor | 8m(m+2)/Re | 64/Re | 120/Re |
| Nusselt number, constant wall flux | 2(m+4)(m+6)/(5m+12) | 48/11 | 14/3 |

Start-up from rest in 4D is in closed form, because the radial modes of a 3-ball are sin(kπr/R)/r:
u = (G/6μ)[R² − r² − Σ 12R³(−1)^(k+1)/(kπ)³ · sin(kπr/R)/r · exp(−k²π²νt/R²)], settling 1.7 times faster than ours.

`node kata/wire4/pipe4.mjs` (~20 s): a Cartesian Poisson solve in the 3-ball (centre 0.169 against 1/6, flow rate
0.290 against 4π/45: high by a staircase wall's error; not refined), the start-up series (cancels at t = 0, satisfies
the diffusion equation), and the Nusselt formula by quadrature for m = 1, 2, 3 (four figures; m = 1 and 2 are the
textbook values).

**Prior work.** The profile in n dimensions is Brenner's (H. Brenner, "Poiseuille flow through n-dimensional
hypercircular and hyperelliptic cylinders", ZAMP 32, 1981; record seen, paper not read). A search found no
n-dimensional friction factor or Nusselt number; that is absence of a find, not proof of novelty.

## 2. A body in the flow reduces to a problem from our world

A body long in k directions and round in the other c = 4 − k, in a flow perpendicular to its long directions: nothing
depends on the long coordinates, so the flow is the c-dimensional flow past a c-ball. Exact for an infinite body in a
uniform stream.

| probe | long in | it is |
|---|---|---|
| wire | 1 direction | flow past a **sphere** |
| ribbon | 2 directions | flow past a **cylinder** (our hot wire; spans a disc of the pipe) |

So the wire has a Stokes solution (drag 6πμaU per length) and a steady conduction solution (Nusselt number 2), and
the ribbon has neither (Stokes' paradox; King's law with no true constant). **A 4D hot wire obeys a law of King's
shape, 2 + B√U, with an exact constant** (an earlier note here guessed it would not). At very low speed they differ:
the wire's first correction is linear in U (Acrivos & Taylor 1962: Nu = 2[1 + Pe/2 + …] with Pe on the radius), the
ribbon's logarithmic. n-dimensional Stokes drag is Brenner's (J. Fluid Mech. 111, 1981).

## 3. The wire's wake is unstable along the wire before a sphere's wake is unstable at all (`wake4.py`)

The reduction assumes the flow stays the same all along the wire. `wake4.py` tests that: the steady axisymmetric
flow past a sphere (the base flow at every w), then its linear stability to disturbances exp(i m φ + i β w + σt),
m the wavenumber round the flow axis and **β the wavenumber along the wire**. β = 0 is the classical sphere problem.
Taylor–Hood finite elements in the meridional half-plane (scikit-fem), Newton for the base flow, shift-invert Arnoldi
for the eigenvalues. Re is on the diameter.

**Validation (β = 0), coarse mesh:** drag coefficient 1.089 at Re 100 and 0.771 at 200 (Fornberg 1988: 1.085, 0.768);
bubble length 0.869 and 1.435 diameters (0.87, 1.44); the m = 1 steady mode crosses zero at Re ≈ 212 (Natarajan &
Acrivos 1993: 210; Tomboulides & Orszag 2000: 212); the m = 1 oscillating mode near 280 (277.5), frequency 0.70.

**Result (β > 0):**

| mode | sphere (β = 0) | 4D wire, most unstable β | wavelength along the wire |
|---|---|---|---|
| m = 0, steady | stable | **Re ≈ 191**, β ≈ 2.5 | 2.5 diameters |
| m = 1, steady | 212 | ≈ 207, β ≈ 1.5 | 4.2 diameters |

The first instability of a 4D wire's wake is a steady mode that is symmetric round the flow axis and rippled along
the wire. A sphere cannot have it: it needs the extra direction. Growth rates at β = 2.5 on the fine mesh (80 × 64,
20 769 nodes a component): −0.0067, −0.0020, +0.0027, +0.0072 at Re 188, 190, 192, 194. The coarse mesh (50 × 40) and
a domain twice the size give the same to three decimals (`data/thresholds.txt`).

**What this is not.** A linear result on one code. The β terms were not checked against an independent
implementation (the m terms are, through the sphere thresholds, and β enters the equations the same way). It says
where the steady extruded wake stops being stable, not what replaces it or what a hot wire would then read. The
mechanism was not identified; a steady three-dimensional mode of a recirculation bubble preceding the wake's own
oscillation is known in our world behind steps and bumps (Barkley, Gomes & Henderson 2002), and that is the natural
guess. The nearest published thing found is Nikitin (J. Fluid Mech. 680, 2011), who adds a formal fourth coordinate
to a turbulent channel and finds 4D disturbances grow; a search found nothing on 4D wakes or bluff bodies.

## 4. Past the threshold the wake settles into a steady ripple (`nl4.py`), and the page shows it

`nl4.py` steps the full equations in the family of flows that stay symmetric round the flow axis: the steady base
flow plus a disturbance expanded in cosines along the wire (harmonics 0 to 6 of a period of 2π/2.5 diameters), the
linear part implicit (second-order backward differences, the same operators as section 3), the quadratic term
explicit. Started from a small bump, the first harmonic grows at the rate section 3 predicts (energy doubling every
17 flow times at Re 200, a growth rate of 0.0202), then saturates:

| Re | first harmonic's energy at rest | bubble length, fattest / thinnest (diameters) | base flow's bubble |
|---|---|---|---|
| 200 | 3.2 × 10⁻³ | 1.57 / 1.31 | 1.435 |
| 210 | 6.1 × 10⁻³ | 1.66 / 1.32 | 1.474 |
| 220 | 8.5 × 10⁻³ | 1.72 / 1.33 | 1.512 |

Each run ends steady (the energy drifts by less than 4 parts in 10⁵ over the last 20 flow times, and by parts in
10¹³ at 210 and 220). The energy rises roughly in proportion to Re − 191, which is what a gentle (supercritical)
onset looks like. **So what replaces the uniform wake is not a street: it is a standing row of cells along the wire,
fat and thin by turns, and nothing sheds.**

Limits. The period along the wire is fixed at the most unstable wavelength; other wavelengths, and patterns that
drift or modulate, are excluded. So are all modes that break the symmetry round the flow axis: above Re about 207 one
of them is unstable on the uniform wake, so the 210 and 220 states are solutions that may themselves be unstable, and
whether the rippled wake sheds earlier or later than a sphere's 277 is not known. Coarse mesh only (50 × 40).

**The page** (`index.html`, `js/main.js`) draws two slices with tracers: across the wire and along it. It computes
nothing. `export4.py mode 200` writes the base flow and the unstable mode (its size is a slider, because a linear
calculation does not fix it); `export4.py nl 210` writes a run's final state.

## 5. Higher Reynolds numbers (`nl4.py` to 800, `sec4.py`)

**In the symmetric family the ripple stays steady.** Runs at Re 250, 300 and 350 (eight harmonics, step 0.04):

| Re | bubble, fattest / thinnest | end of run |
|---|---|---|
| 250 | 1.83 / 1.41 | steady |
| 300 | 1.96 / 1.58 | steady; a pulsation of period 25 flow times dies out (swing 5.9%, 1.0%, 0.2% over successive windows) |
| 350 | about 2.07 / 1.76 | the same pulsation still dying at t = 400 (41%, 25%, 16%) |

The pulsation's decay slows as Re rises and extrapolates to zero near Re 370. That is two points and a straight line,
not a threshold. Its period, 25 diameters of travel, is about five times slower than a sphere's shedding.

**Up the ladder (2026-11-21): the symmetric family stops being steady.** Runs at Re 400, 566 and 800 on a finer mesh
(60 × 48, ten harmonics, step 0.03; 0.015 at 800, where 0.03 blew up), 300 flow times at 400 and 566, 150 at 800:

| Re | bubble at the fat station over the last quarter | what it does | top harmonic's energy over the first's |
|---|---|---|---|
| 400 | 2.14 to 2.22 | pulses with period 25; the swing was still shrinking, but more slowly each window (0.089, 0.077, 0.072) | 2 × 10⁻⁵ |
| 566 | 2.0 to 2.7 (to 3.2 earlier) | irregular; periods from 38 to 150 share the energy | 2 × 10⁻³ |
| 800 | 1.6 to 4.2 (to 5.3 earlier) | irregular, large excursions | 10⁻³ to 6 × 10⁻³ |

The period at 400 is the pulsation seen dying at 300 and 350, so the guess of an onset near 370 is not contradicted,
and 300 flow times do not say whether 400 ends pulsing or steady. At 566 and 800 the flow never repeats in the time
run. Whether that is chaos or a long transient is not settled by one run each, and at 800 ten harmonics along the wire
are too few (the spectrum falls by only a thousand), so read its picture as qualitative. These are still flows with
the symmetry round the flow axis imposed, which the real wake loses at 209: they show that the ripple has its own road
to unsteadiness, not what a wire's wake does at these Reynolds numbers. The page's flow picker has one moment of each.

**The ripple is unstable to a lopsided mode from about Re 209.** `sec4.py` steps the equations linearised about a
rippled state for disturbances of azimuthal wavenumber 1 with the ripple's period and mirror planes, and reads the
fastest mode's growth off a probe. With the ripple switched off at Re 210 it returns −0.0075, wake4's eigenvalue
(−0.0076). With it on:

| Re | growth of the fastest lopsided mode | oscillating? |
|---|---|---|
| 200 | −0.016 | no |
| 210 | +0.0023 | no |
| 220 | +0.012 | no |
| 250 | +0.022 | no |
| 300 | about +0.02 to +0.03 (the fit had not settled) | none seen |

So the order of events on a 4D wire, as far as this goes: uniform wake until 191; steady ripple along the wire; from
about 209 the ripple also tilts to one side, steadily (a sphere tilts at 212, so the ripple changes that little).
**No shedding was found up to 300.** That is weaker than it sounds: this method sees only the fastest mode, so an
oscillating one growing more slowly would be hidden; past 209 the true base state is the tilted ripple, which was not
computed; and disturbances with another period along the wire were not tried. Finding where shedding starts needs a
solver that carries the lopsided harmonics nonlinearly.

## 6. Edge effects: first estimates, nothing computed with a wall in it

What was computed is periodic along the wire with mirror planes, which is exactly a wire between two frictionless
walls a whole number of half-wavelengths apart. A real wire across a pipe differs in three ways. The estimates use
the ripple's amplitude equation, with coefficients fitted to the computed growth rates (`data/thresholds.txt`):
growth σ = 0.00237 (Re − 191.7) at the best wavenumber, falling off as 0.036 (β − 2.5)².

**Ends.** A no-slip wall where the wire meets the pipe slows the flow there, so the wake differs at the ends at every
Reynolds number, and that forces a ripple without waiting for the threshold. Below it the forced ripple dies away
from the end over √(0.036/|σ|) diameters: 0.6 at Re 150, 1.1 at 180, 3 at 190, and without limit at 191. So there is
no sharp onset on a finite wire: cells spread inward from the ends as the threshold nears (the same thing happens to
Taylor cells between end plates). The junction itself, with its horseshoe vortex, is not in this estimate.

**The pipe's profile.** A wire along a diameter sees 2.5 times the mean speed at the centre and none at the wall, so
the local Reynolds number falls as 1 − w²/R² along it. Treating the wake as locally uniform (fair only when the pipe
is many wavelengths across), the ripple first appears as a patch at the centre:

| pipe radius, in wire diameters | onset, Re on the centreline speed | half-width of the first patch |
|---|---|---|
| 5 | 203 | 1.7 |
| 10 | 197 | 2.4 |
| 25 | 194 | 3.7 |
| 50 | 193 | 5.3 |
| 100 | 192 | 7.5 |

A patch a few diameters wide holds one or two cells of the 2.5-diameter ripple, so in a narrow pipe the picture is a
single fat spot in the middle of the wire. Not included: the sheared stream also drives a flow along the wire even
below threshold (higher stagnation pressure at the centre), as it does along a cylinder in a shear flow.

**For the instrument.** A hot wire would read the speed where it is, weighted by the ripple: past 191 the heat loss
varies along the wire with the cell pattern. And the wire's cold ends: conduction to the supports reaches a length
√(k_w a / 3h) into the wire, 0.82 of ours at the same heat-transfer coefficient, because a ball cross-section has
more surface for its area.

**The ribbon** has an edge of another kind: a ribbon spanning the pipe meets the wall along a circle, and a strip
narrower than the pipe has two free edges that shed their own vortices. Not estimated.

## 7. The Reynolds ladder: 200 to 1600 in steps of √2 (`ladder4.py`)

The uniform wake's base flow, continued up a ladder spaced evenly in log Re (200, 283, 400, 566, 800, 1131, 1600;
Newton fails at the next rung, 2263), and at each rung the fastest disturbance found for azimuthal wavenumbers 0 to 3
and eleven wavenumbers along the wire from 0 to 12 (wavelengths from uniform down to half a diameter). 308 eigenvalue
problems, each solved near two shifts, one steady and one oscillating.

| Re | C_D | bubble | m = 0 | m = 1 | m = 2 | m = 3 |
|---|---|---|---|---|---|---|
| 200 | 0.771 | 1.43 | +0.020, λ 2.5 D | −0.019 | stable | stable |
| 283 | 0.650 | 1.71 | +0.145, λ 2.5 D | +0.145, uniform | stable | stable |
| 400 | 0.545 | 1.93 | +0.232, λ 2.5–3 D | +0.267, uniform | +0.007, uniform, **f 0.76** | −0.10 |
| 566 | 0.451 | 2.08 | +0.296, λ 3 D | +0.350, uniform | +0.202, uniform, **f 0.81** | +0.048, uniform |
| 800 | 0.368 | 2.18 | +0.350, λ 1.6–2 D | +0.419, uniform, **f 0.74** | +0.348, λ 3–4 D | +0.262, uniform |
| 1131 | 0.296 | 2.27 | +0.443, λ 1.6 D | +0.478, λ 2 D | +0.454, λ 3 D | +0.397, uniform |
| 1600 | 0.237 | 2.38 | +0.488, λ 1.6 D | +0.523, λ 2 D | +0.506, λ 3 D | +0.463, uniform |

Growth is per flow time (diameter over speed), λ the wavelength along the wire (2π/β, in diameters), **f** the
angular frequency where the fastest mode oscillates; no f means it is steady. "Stable" rows returned only the
truncated domain's free-stream modes. The full grid is `data/ladder-<Re>.json`, and the page charts it.

What it says:

- **Each rung of m switches on in turn**: m = 0 at 191, m = 1 at 207, m = 2 just under 400, m = 3 near 500
  (interpolated between rungs). The first two arrive steady; m = 2 arrives oscillating.
- **Growth rises like log Re, not Re.** From 283 the fastest rate goes 0.145, 0.27, 0.35, 0.42, 0.48, 0.52: each
  factor of √2 adds less. The base flow's bubble lengthens the same way (1.71 to 2.38), and the drag falls roughly as
  Re^−0.6.
- **Oscillation competes from 400 and never clearly wins.** m = 2 is oscillating when it arrives and at 566. At 800
  the fastest mode of all is an oscillating m = 1, uniform along the wire (f 0.74, a Strouhal number of 0.12 on
  diameter): a sphere's shedding mode. At 1131 it is still there at +0.452, behind a steady m = 1 at +0.478. Linear
  theory does not pick between them.
- **By 1600 nothing is selected.** All four m grow within 12% of one another, and each across a band of wavelengths
  an octave or two wide: at m = 2 the rate changes by 4% from uniform to λ 2 D. A flow with that spectrum has no
  preferred cell; it goes to disorder in every direction at once, including along the wire.
- **Short waves along the wire come in.** The band's upper edge moves from λ ≈ 1.6 D (Re 283) to shorter than 0.5 D
  (1600), and m = 0's fastest wavelength shortens from 2.5 D to 1.6 D.

**Limits.** Above 191 the uniform wake is not the state a wire would have, so every row past the first is the
instability of an unstable state: what the flow is trying to do and how fast, not what it does. Shift-invert returns
the modes nearest each shift; a faster mode far from both (a frequency well above 1, say) would be missed, and where a
steady and an oscillating mode are close the table shows only the faster. Mesh: Re 800 and 1131 were repeated on a
finer mesh (100 × 80 against 70 × 56) at seven points between them and agree to 0.001 in growth; Re 1600 has one mesh only (on the finer one Newton would not converge there, even stepping up from 1470), and its near-flat spectrum is
the kind of result under-resolution can produce, so hold it more loosely than the rest. The
outer boundary is where it was for Re 200, and the bubble is now 2.4 D long: not tested for these rungs.

## 8. A sheared stream between mirror planes: the first edge effect computed (`shear4.py`)

Step one of the edge effects, and only the second of section 6's three: the pipe's profile, without its wall. The
stream is U(w) = 1 − (1 − cos(2w/R))/2, which matches the pipe's parabola 1 − w²/R² near the axis and falls to zero,
with zero slope, at w = πR/2, where a mirror plane stands in for the wall. A body force holds the profile. The stream
does not vary across the wire, so this is a sheared slab, not a tube, and nothing is no-slip except the wire. Same
method as `nl4.py`: cosine series along the wire (harmonics of 2/R), symmetric about the flow axis, even about w = 0.
Reynolds number on the centreline speed. Mesh 50×40, 14 harmonics for R = 5 and 28 for R = 10.

| Re | R | bubble at the axis | same Re, uniform stream | 1 D along the wire | 2 D along |
|---|---|---|---|---|---|
| 150 | 5 | 1.28 | 1.19 | 1.12 | 0.97 |
| 180 | 5 | 1.60 | 1.37 | 1.26 | 1.08 |
| 190 | 5 | 1.70 | 1.41 | 1.30 | 1.11 |
| 200 | 5 | 1.79 | 1.43 | 1.34 | 1.13 |
| 210 | 5 | 1.87 | 1.46 | 1.37 | 1.16 |
| 220 | 5 | 1.93 | 1.49 | 1.41 | 1.18 |
| 230 | 5 | 1.98 | | 1.44 | 1.20 |
| 250 | 5 | 2.06 (2.10 with 28 harmonics) | | 1.50 (1.48) | 1.25 (1.24) |
| 200 | 10 | 1.57 | 1.43 | 1.50 | 1.43 |
| 220 | 10 | 1.76 | 1.49 | 1.60 | 1.52 |
| 250 | 10 | 2.03 | | 1.77 | 1.64 |

- **Every run settles to a steady flow, and none shows the 2.5-diameter ripple.** The bubble is longest on the axis
  and shortens steadily toward the planes; there are no side crests, and the energy per harmonic falls steadily with
  no bump at the ripple's wavenumber. That holds to Re 250 at R = 5, where a uniform stream at the centreline speed
  would grow the ripple at 0.14 per flow time, and to Re 220 at R = 10.
- **A wider tube does not bring the ripple back, as far as these runs go.** At R = 10 and Re 250 the stretch of wire
  past the uniform-stream threshold is nearly 10 D long, room for four ripple wavelengths, and the bubble is again one
  peak on the axis falling away on both sides. The peak is narrow: 2.03 on the axis, 1.77 one diameter along. This
  run settles through a slowly damped oscillation: the axis bubble and the harmonics from 8 up swing together with a
  period near 42 flow times, the bubble's swing 0.025 near t = 100, 0.006 near 200 and 0.001 near 330 (run to 400).
  A lightly damped mode like that is what sits just below an oscillating instability, so a slightly higher Reynolds
  number at this radius may pulse. It does: at Re 320 (300 flow times, 28 harmonics, time step 0.015) the axis bubble
  swings between 2.1 and 2.65 with a period near 32 flow times, five cycles from t = 150 to 300 with no decay, and
  the rate of change stays near 0.01. This is the first unsteady flow in the sheared stream. It is as under-resolved
  along the wire as the Re 250 run, so the amplitudes are rough. Re 280 pulses too: four successive peaks at 2.333, 2.333, 2.333, 2.332 (t = 80 to
  190, period 36.6), troughs near 2.17, so the cycle has saturated and is not decaying. The onset is between 250 and
  280. The page plays one cycle (36.75 flow times; first and last frames differ by 1% of the swing): the tip of the
  bubble on the axis draws out into a narrow point and sinks back, and nothing detaches. (That run stopped at t = 210 of 300 when the sandbox restarted; the saved state is t = 210.) The Re 250 spectrum is
  flat from harmonic 10 to 22, so the peak is not resolved by 28 harmonics. The bubble profile carries small steps
  1.2 D apart; the same steps, four times weaker, are in the Re 220 run, and 1.2 D is the wavelength of the last
  harmonics kept, so they are read as truncation, not as a ripple.
- **The bubble on the axis is longer than in a uniform stream at the same speed**, at every Reynolds number, including
  150, well below the threshold. This is the flow along the wire that section 6 said it left out: the pressure behind
  the wire is lowest where the stream is fastest, so wake fluid is drawn along the wire toward the axis and collects
  there. (The mechanism is inferred from the bubble shape; the pressure field was not examined.)
- **There is no sharp onset, at 203 or anywhere.** The excess grows smoothly from 0.09 at Re 150 to 0.44 at 220,
  fastest between 190 and 200. That is what a smeared-out threshold would look like, but it is a weak signal.
- The estimate in section 6 assumed the pipe was many ripple wavelengths across. At R = 5 the patch it predicts is
  narrower than one wavelength, so there was never room for a ripple distinct from the bulge.

**Limits.** At R = 5 with 14 harmonics the top harmonic holds about 1% of the first one's energy at Re 220 to 250
and is not smaller than its neighbours, so those runs are under-resolved along the wire. Bubble lengths within about
2 D of the mirror planes are meaningless (the stream is nearly at rest there). The R = 10 run at Re 200 is barely past
the threshold on the axis alone, so it tests nothing; R = 10 at 250 is the test, and it is
under-resolved along the wire. Doubling the harmonics at R = 5, Re 250 moved the axis bubble from 2.06 to 2.10 and
the profile within 3.5 D of the axis by no more than 0.03. Runs at Re 230 and above need time step 0.02; 0.04 blows up. One mesh. The runs were
150 to 300 flow times, and the rate of change was still falling slowly at the end (like 1/t) with the bubble fixed
to four figures.

## 9. The true tube: a no-slip wall, and the wire meeting it (`tube4.py`, `tmesh.py`)

Rotations in the two directions perpendicular to both the flow and the wire leave the wire, the tube wall and the
stream unchanged, so the flow that keeps that symmetry is a three-dimensional problem in (x along the flow, ρ the
distance from the plane of flow and wire, w along the wire), weighted by ρ. The wall is the quarter-circle
ρ² + w² = R², the inflow is the pipe's own 1 − (ρ² + w²)/R², and the wire runs from the axis into the wall.
`tmesh.py` meshes it with gmsh (tetrahedra, 0.06 D on the wire); `tube4.py` time-steps it: Taylor–Hood, BDF2,
convection extrapolated, pressure correction in rotational form, velocity by conjugate gradients.

**Checks.** (1) No wire: the solver holds the pipe's exact profile to 0.4% of the centreline speed on a coarse mesh
(the wall is faceted). (2) The same solver on section 8's problem (mirror planes, slip lid 8 D above the wire, the
cosine stream held by a body force; `geom=slab`), Re 200, R = 5: bubble on the axis 1.785 against `shear4.py`'s
1.79, and within 0.03 of it at most stations out to 4.7 D along the wire (0.06 at worst; the series run has
truncation wiggles of that size and this one has none). Two codes, two discretisations, different outer boundaries.

**The tube, R = 5, Reynolds number on the centreline speed** (62 000 tetrahedra; Re 25 to 100 run 80 flow times, the rest 150; all six steady,
rate of change 1e-5 to 5e-5 at the end and the axis bubble fixed to three figures or better):

| along the wire, D | 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 |
|---|---|---|---|---|---|---|---|---|---|---|
| bubble, tube, Re 25 | 0.02 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| bubble, tube, Re 50 | 0.34 | 0.33 | 0.32 | 0.29 | 0.24 | 0.17 | 0.09 | 0.00 | 0.00 | 0.00 |
| bubble, tube, Re 100 | 0.78 | 0.78 | 0.74 | 0.69 | 0.62 | 0.54 | 0.43 | 0.29 | 0.14 | 0.00 |
| bubble, tube, Re 150 | 1.21 | 1.14 | 1.05 | 0.96 | 0.87 | 0.77 | 0.65 | 0.50 | 0.35 | 0.29 |
| bubble, tube, Re 200 | 1.71 | 1.40 | 1.23 | 1.11 | 1.02 | 0.91 | 0.79 | 0.65 | 0.50 | 0.49 |
| bubble, tube, Re 250 | 1.97 | 1.55 | 1.34 | 1.21 | 1.11 | 1.01 | 0.89 | 0.75 | 0.62 | 0.62 |
| bubble, mirror planes, Re 200 (this solver) | 1.78 | 1.49 | 1.32 | 1.21 | 1.13 | 1.05 | 0.96 | 0.87 | 0.77 | 0.66 |

(The mirror-plane row is interpolated from stations 0.2 D apart.) A 0.00 means no reversed flow
from 0.02 D behind the wire on; at Re 100 the station at 3.5 D failed to read and its entry is the mean of its
neighbours 0.125 D either side. The tube's wake is the same single bulge on the
axis, a little shorter there (1.71 against 1.78) and shortening faster toward the wall, where the parabola is
slower than the cosine stream and the wall adds its own drag. The bubble does not close at the wall: it is still
half a diameter long 0.5 D from it. No ripple at any of the three. On the axis the tube's bubble sits 0.07 to 0.09
below section 8's mirror-plane values (1.28, 1.79, 2.06) at each Reynolds number, and the bulge sharpens with
Reynolds number the same way: flat at 150, peaked at 250. One mesh, one tube radius so far; the junction is not
examined beyond that.

## 10. Heat leaving the wire (`heat4.py`)

Forced convection with constant properties: the temperature rides on the flow and does not change it. So nothing
has to be rerun: `heat4.py` solves the steady advection–diffusion equation on a flow `tube4.py` saved, directly, in
a minute or two. That holds only while the flow is steady. A time-averaged heat loss from an unsteady wake needs the
temperature stepped with the flow, which `tube4.py` does not yet do. Buoyancy and temperature-dependent viscosity
would feed back on the flow and are left out (a small overheat).

The wire is isothermal across its section and not along it: its excess temperature is a sum of a few shapes along
the wire (in the tube, cos((j + ½)πw/R), zero at the wall, which is cold like the inflow). One solve per shape gives
the heat lost per length at every station and the matrix H_ij = ∫φ_i Q_j dw. A wire energy balance, conduction
along the wire plus Joule heat minus that loss, is then a small linear system; the current, the wire's
conductivity and how its resistance rises with temperature come in there, with no more flow solves. For a steady
current the heat made per length is I²/(σ·(4/3)πa³) whatever the force law between charges; σ for a 4D metal is not
something this study has.

Nusselt number per local excess (Nu = h D / k; 2 is conduction to a fluid at rest), Prandtl number 0.7, the tube
with the first temperature shape:

| along the wire, D | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Re 25 | 4.28 | 4.24 | 4.09 | 3.79 | 3.36 |
| Re 50 | 5.36 | 5.31 | 5.10 | 4.69 | 4.00 |
| Re 100 | 6.83 | 6.79 | 6.51 | 5.96 | 5.01 |
| Re 150 | 7.98 | 7.94 | 7.61 | 6.94 | 5.82 |
| Re 200 | 9.05 | 8.92 | 8.61 | 7.82 | 6.52 |
| Re 250 | 9.96 | 9.88 | 9.57 | 8.64 | 7.15 |
| stream speed there | 1 | 0.96 | 0.84 | 0.64 | 0.36 |

Between mirror planes with a uniformly hot wire: 9.13 on the axis, 7.08 where the stream is half speed, 2.71 on the
plane where it is at rest. Sphere correlations at Re 200 and Pr 0.7 give 8.7 (Whitaker) to 9.5 (Ranz–Marshall),
and the wire's cross-section is a ball, so the level is right; that is a plausibility check, not a validation. A
uniform-stream run of this solver against the sphere literature is the check still owed. The temperature
undershoots by 0.02 of the excess somewhere in the wake (no upwinding). Because the stream slows along the wire, a
wire in a tube reads less than the centreline speed: 4 D out, the coefficient is 0.72 of its value on the axis, at
Reynolds numbers from 100 up (0.73, 0.73, 0.72, 0.72) and more at lower ones, where conduction counts for more
(0.79 at Re 25, 0.75 at 50). On the axis, Nu − 2 runs 2.28, 3.36, 4.83, 5.98, 7.05, 7.96 from Re 25 to 250: a power
of Re that is 0.54 over the whole decade and between 0.52 and 0.57 on each step, with no trend. King's shape, with an exponent
between the boundary layer's ½ and the wake's ⅔, as sphere correlations have (they give 4.2 to 4.7 at Re 25).

## 11. The anemometer: the wire's energy balance (`anem4.py`)

A steady current heats the wire; the stream and the cold wall at each end cool it; its resistance rises with its
temperature, and the resistance is the reading. With θ = α(T − T₀), α the temperature coefficient of resistivity, so
that θ is the fractional rise in local resistance, per length of wire

    Λ θ″ + P (1 + θ) − Q[θ] = 0,    θ = 0 at the wall,

where Λ = (k_wire/k_fluid)·π/6 is conduction along the wire (its section is a 3-ball of volume πD³/6),
P = α I² ρ₀/(A k_fluid D) is the current squared made dimensionless, and Q[θ] is the loss to the stream, which is
section 10's matrix. In the same shapes this is an 8 × 8 linear system; no flow is solved. The wire's resistance is
R₀(1 + mean θ). Two material numbers are free: Λ, and α, which only sets the scale of current and overheat. In a
metal the wire's thermal and electrical conductivity are tied (Wiedemann–Franz), which again only rescales the
current. A real metal wire in a gas has k_wire/k_fluid of a few thousand, so Λ of a few thousand.

Constant-temperature operation, resistance held at 1.5 of cold (mean θ = 0.5), tube radius 5, Pr 0.7. P is the
current squared needed; n = d ln P / d ln Re is the instrument's sensitivity (King's law for a long wire would give
P = A + B Reⁿ′ and n somewhat under n′ ≈ 0.5):

| Λ | P at Re 25 | 50 | 100 | 150 | 200 | 250 | n, 25→50 … 200→250 | heat into the wall, Re 25 / 250 |
|---|---|---|---|---|---|---|---|---|
| 0 (no conduction along the wire) | 4.21 | 5.09 | 6.33 | 7.28 | 8.10 | 8.83 | 0.28 … 0.39 | 0 |
| 30 | 5.86 | 6.98 | 8.53 | 9.71 | 10.74 | 11.66 | 0.25 … 0.37 | 0.27 / 0.18 |
| 300 | 16.08 | 17.27 | 18.92 | 20.20 | 21.34 | 22.36 | 0.10 … 0.21 | 0.72 / 0.55 |
| 3000 | 117.2 | 118.4 | 120.0 | 121.3 | 122.5 | 123.5 | 0.015 … 0.038 | 0.95 / 0.91 |

Constant current (set to give 1.5 at Re 150), the reading R/R₀ at Re 25, 50, 100, 150, 200, 250:
Λ = 0: 2.40, 1.92, 1.62, 1.50, 1.43, 1.38; Λ = 300: 1.74, 1.65, 1.56, 1.50, 1.46, 1.43;
Λ = 3000: 1.529, 1.520, 1.509, 1.500, 1.493, 1.486. At constant current the wire runs away (resistance
heating feeding itself) at P about 2.4 to 2.8 times the values above.

- **The instrument works as a law.** Resistance against flow rate is a smooth, monotonic curve, and the pipe's flow
  rate follows from the centreline speed exactly (mean speed 2/5 of it, through a 3-ball of radius R).
- **In this tube a metal wire is nearly blind.** The wire is only 10 diameters long. With Λ = 3000, 91% of the heat
  goes down the wire into the wall or more, and the current needed changes by 5% over a tenfold change in flow rate. This is the
  ordinary hot-wire rule (ours are made 200 diameters long for this reason) and not a 4D effect: the length over which
  the wall cools the wire is √(Λ/πNu), about 11 diameters at Λ = 3000, against a half-length of 5.
- **So the instrument wants a thin wire in a wide tube**, and that changes which of this study's results it uses. A
  wire 200 diameters long in the same pipe flow has a Reynolds number 20 times smaller than the cases computed here:
  below every instability of sections 3 to 8, where the stream varies slowly along the wire, each station loses heat
  as a sphere would at its local speed (section 2), and the wall's effect is this section's conduction term. The
  tube computations of section 9 are then the check on that strip picture at the short-wire end, and the wake
  instabilities are what a thick wire or a fast stream would add.

**Limits.** Six Reynolds numbers over one decade, one tube radius. The heat matrices
carry section 10's limits (not validated against the sphere literature, one mesh, Pr 0.7). The shapes all vanish at
the wall, so a uniform heat source is represented to 2.5%: the heat balance closes to 1.7%, and the current needed
moves by 3.5% between 4 and 8 shapes at Λ = 0 and by 0.04% at Λ = 30 and above. Properties constant: no radiation,
no change of k or α with temperature. Fully developed flow only.

## Running it

```bash
node kata/wire4/pipe4.mjs                         # the pipe checks, ~20 s, no dependencies
python3 -m venv venv && venv/bin/pip install numpy scipy scikit-fem
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1   # several runs at once fight over threads otherwise (50× slower)
venv/bin/python kata/wire4/wake4.py 50 40         # base flow and the sphere validation, ~2 min
venv/bin/python kata/wire4/crit4.py '{"Nr":80,"Nt":64}' 188,190,192,194 2.25,2.5,2.75 0   # growth at (Re, β), m = 0
venv/bin/python kata/wire4/scan4.py 200 50 40 out.json   # m = 0, 1, 2 over β at one Re
cd kata/wire4 && ../../venv/bin/python nl4.py 210 2.5 500   # the nonlinear run, ~15 min alone -> data/nl-210.*
../../venv/bin/python sec4.py 210 300 0.05 5      # the ripple's stability to lopsided modes, ~30 min
../../venv/bin/python ladder4.py 800,1131               # two rungs of the ladder, ~2 h a rung on one core
../../venv/bin/python shear4.py 200 5                   # sheared stream, tube radius 5, ~1 h -> data/shear-200-R5.*
../../venv/bin/pip install gmsh && apt-get install -y libglu1-mesa   # tube4.py only
../../venv/bin/python tube4.py 200 5 150                 # the true tube, ~3 h -> data/tube-200-R5.*  (geom=slab: section 8's problem)
../../venv/bin/python heat4.py 200-R5 0.7 8               # heat from the wire on that flow, ~2 min -> data/heat-200-R5.json
../../venv/bin/python anem4.py 0.5                        # the wire's energy balance on every data/heat-*.json, < 1 s
RESUME=1 FRAMES=25 ../../venv/bin/python shear4.py 280 10 255 0.015 28 50 40 && ../../venv/bin/python export4.py pulse 280-R10 40   # one cycle for the page
../../venv/bin/python export4.py nl 210 && ../../venv/bin/python export4.py mode 200   # what the page reads
```

In the scans, rows near −0.13 to −0.17 that are the same for every m are the truncated domain's free-stream modes,
not wake modes.

## Next

- An independent check of the β > 0 result (a second discretisation, or a time-stepped 4D run near Re 191).
- A nonlinear solver that carries the lopsided harmonics, to find the tilted ripple and where it starts to shed.
- The tube at higher Reynolds numbers and other radii, a finer mesh, and a look at the junction. Lopsided flows need the
  full 4D problem or harmonics round the axis.
- Heat: the uniform-stream check against the sphere literature, and temperature stepped with the flow for unsteady
  wakes.
- The instrument proper: a long thin wire (low wire Reynolds number) by strip theory on the sphere's Nu(Re), checked
  against a tube run; then a developing inlet profile.
- The ribbon: its Kármán street has a plane of span directions and none preferred, so its break-up must choose a
  pattern. Floquet analysis with a spanwise wavevector of any direction in that plane.
- Then the instrument: heat loss from the wire with the wake it actually has.
