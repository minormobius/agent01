# wire4 — a hot wire in a four-dimensional pipe: derivations and the first computation

Study scripts and notes, no page yet. Started 2026-11-19, after the rope paper. The aim is a hot-wire anemometer in a
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

## Running it

```bash
node kata/wire4/pipe4.mjs                         # the pipe checks, ~20 s, no dependencies
python3 -m venv venv && venv/bin/pip install numpy scipy scikit-fem
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1   # several runs at once fight over threads otherwise (50× slower)
venv/bin/python kata/wire4/wake4.py 50 40         # base flow and the sphere validation, ~2 min
venv/bin/python kata/wire4/crit4.py '{"Nr":80,"Nt":64}' 188,190,192,194 2.25,2.5,2.75 0   # growth at (Re, β), m = 0
venv/bin/python kata/wire4/scan4.py 200 50 40 out.json   # m = 0, 1, 2 over β at one Re
```

In the scans, rows near −0.13 to −0.17 that are the same for every m are the truncated domain's free-stream modes,
not wake modes.

## Next

- An independent check of the β > 0 result (a second discretisation, or a time-stepped 4D run near Re 191).
- What the unstable wake becomes: weakly nonlinear, or a direct simulation periodic along the wire.
- The ribbon: its Kármán street has a plane of span directions and none preferred, so its break-up must choose a
  pattern. Floquet analysis with a spanwise wavevector of any direction in that plane.
- Then the instrument: heat loss from the wire with the wake it actually has.
