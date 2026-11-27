# W1 — audit sheet: what to reproduce, and what would count as agreement

For an independent auditor with their own code and their own machine. Each item is a self-contained problem, the
numbers we got, and the tolerance within which we would call it reproduced. Items are ordered by how much the paper
leans on them. **A2 is the one that matters most**: it is the paper's headline, it rests on one code, and nothing
outside this study checks it. A1 is its sanity check and has literature values. A4 and A5 are cheap (minutes).
A6 and A7 are expensive and optional.

This file is generated (`node kata/papers/w1/build.mjs` from `audit.src.md`): the numbers are read from the same
data files as the paper's. Please report the numbers you get, not only pass or fail, and anything in a problem
statement that was ambiguous.

Conventions throughout: incompressible Navier–Stokes, constant properties; lengths in the diameter D of the wire (or
sphere), speeds in the free-stream speed U, time in D/U; Re = UD/ν; Prandtl number 0.7. Growth rates are per D/U.

---

## A1. The sphere (literature check of the base flow)

**Problem.** Steady axisymmetric flow past a sphere of diameter 1 in a uniform stream, in the meridional half-plane
(x, r). No slip on the sphere, uniform stream far away.

| Re | drag coefficient (ours) | recirculation length behind the sphere, from its rear (ours) |
|---|---|---|
| 1 | 27.70 | none |
| 10 | 4.321 | none |
| 50 | 1.579 | |
| 100 | 1.089 | 0.87 |
| 200 | 0.771 | 1.44 |
| 250 | 0.691 | |

Literature: Fornberg (1988) gives C_D 1.085 and 0.768 and lengths 0.87 and 1.44 at Re 100 and 200. Our domain: outer
boundary 12 D upstream and to the side, 25 D downstream (so the drag at Re 1 and 10 is a little high: the boundary is felt there).

**Agreement:** C_D within 1% at Re ≥ 50; lengths within 0.02.

Also the classical stability results at β = 0 (see A2 for the notation): the m = 1 steady mode crosses zero at
Re ≈ 212 (we get 212; Natarajan & Acrivos 210; Meliga et al. 212.6, Citro et al. 212.4, both as quoted by Schuh
Frantz et al. 2025); the m = 1 oscillating mode on the axisymmetric base flow near Re 280 with angular frequency
≈ 0.70 (we get ≈ 280, 0.70; Meliga et al. 280.7 as quoted; the 271.8 of Citro et al. is on the bifurcated base flow
and is not the same calculation).

## A2. The headline: linear stability with a wavenumber along a fourth direction

**Problem.** Take the A1 base flow (U(x, r), V(x, r)), and regard it as a flow in four space dimensions that does not
depend on the fourth coordinate w (this is the flow past an infinite straight "wire" whose cross-section is a
3-ball). Linearise the 4D Navier–Stokes equations about it for disturbances

(u, v, a, b, p)(x, r) · exp(i m φ + i β w + σ t),

with u along x, v radial, a azimuthal (φ), b along w. Writing 𝒟 = U ∂ₓ + V ∂ᵣ and
Δₘ = ∂ₓₓ + ∂ᵣᵣ + (1/r) ∂ᵣ − m²/r²:

- σu + 𝒟u + u ∂ₓU + v ∂ᵣU = −∂ₓp + (1/Re)(Δₘ − β²) u
- σv + 𝒟v + u ∂ₓV + v ∂ᵣV = −∂ᵣp + (1/Re)[(Δₘ − 1/r² − β²) v − (2 i m / r²) a]
- σa + 𝒟a + V a / r = −(i m / r) p + (1/Re)[(Δₘ − 1/r² − β²) a + (2 i m / r²) v]
- σb + 𝒟b = −i β p + (1/Re)(Δₘ − β²) b
- ∂ₓu + (1/r) ∂ᵣ(r v) + (i m / r) a + i β b = 0

Disturbances vanish on the sphere and far away; the outflow condition is the solver's own. With β = 0, b decouples
and this is the classical sphere problem. With m = 0, a decouples, and with b → i b the system is real, so the
eigenvalues of interest are real or come in conjugate pairs.

**What we found.** The first instability is m = 0, real σ, at β ≈ 2.5. Growth rate of the fastest m = 0 mode at
β = 2.5, on an 80 × 64 Taylor–Hood mesh (20 769 nodes per velocity component):

| Re | 188 | 190 | 192 | 194 | 200 |
|---|---|---|---|---|---|
| σ | −0.0067 | −0.0020 | +0.0027 | +0.0072 | +0.0204 |

Zero crossing by linear interpolation: **Re = 190.9**. (Coarse mesh, 50 × 40: −0.0021 at 190 and
+0.0202 at 200. Domain twice the size, 60 × 40: −0.0023 and +0.0200.)

Growth against β at Re 200 (a different mesh, 70 × 56 with nodes clustered toward the wake):

| β | 0 | 1 | 1.5 | 2 | 2.5 | 3 | 4 |
|---|---|---|---|---|---|---|---|
| m = 0 | −0.1585 | −0.0854 | −0.0227 | +0.0106 | +0.0203 | +0.0119 | −0.0443 |

and for m = 1 at Re 200: −0.0378 at β = 0, −0.0190 at 1.5, −0.0381 at 2.5. The m = 1 mode's own threshold
with β free is Re ≈ 207 at β ≈ 1.5 (coarse mesh).

**Agreement:** the m = 0 threshold at β = 2.5 between Re 190 and 192; the growth rates in the first table within
±0.001; the β of fastest growth at Re 200 between 2.25 and 2.75; the mode steady (Im σ = 0).
**It would overturn the paper** if the m = 0 mode at β = 2.5 were stable at Re 200, or if the threshold moved above
the sphere's 212.

**A coincidence to rule out.** A circular cylinder's wake goes unstable along its span (mode A) at Re = 188.5 ± 1.0
(Barkley & Henderson 1996), next to our 191. The problems differ (periodic two-dimensional base flow there, steady axisymmetric here; wavelength
3.96 D there, 2.5 D here; our mode is steady), and we take the closeness for chance, but an independent
implementation of the β terms is what settles it.

A caution about values near −0.13 to −0.17 that do not change with m: on our truncated domain those are
free-stream modes of the box, not wake modes (the m = 0, β = 0 entry above is one). They should not be compared.

**Audited 2026-11-27.** A separate implementation (own base flow, complex forms with iβ, a differently
triangulated mesh; the same element family, libraries and outer boundary) returned −0.00664661, −0.00190022,
+0.00274962, +0.00730579 and +0.02043928 at Re 188, 190, 192, 194 and 200: within 0.0001 of the table, all real, a
crossing at 190.817. Not covered by that audit: other m, oscillating branches, the β range, another discretisation,
another domain.

**A cheap independent route** that needs no eigen-solver: time-step the 4D equations for one Fourier mode in w
(wavenumber 2.5) on the axisymmetric base flow at Re 200 from a small disturbance, and measure the exponential
growth of its energy. Ours doubles every 17 time units (energy growth rate 2σ = 0.040).

## A3. Past the threshold (optional)

**Problem.** The full equations in the family of flows independent of φ (m = 0), periodic in w with period 2π/2.5,
even about w = 0, started from the base flow plus a small disturbance, run until steady.

| Re | recirculation length at the fattest station | at the thinnest |
|---|---|---|
| 200 | 1.57 | 1.31 |
| 220 | 1.72 | 1.33 |

Ours: 6 Fourier harmonics in w, the 50 × 40 mesh, 500 time units. **Agreement:** a steady state (no shedding), and
lengths within 0.05.

## A4. Heat from a sphere (minutes)

**Problem.** On the A1 flow, steady advection–diffusion of temperature with Péclet number Re·Pr, Pr = 0.7; T = 1 on
the sphere, 0 in the incoming stream. Nu = (total heat flow) / (π D k ΔT).

| Re | 1 | 10 | 25 | 50 | 100 | 150 | 200 | 250 |
|---|---|---|---|---|---|---|---|---|
| Nu (ours) | 2.249 | 3.319 | 4.302 | 5.395 | 6.903 | 8.082 | 9.115 | 10.037 |

With the outer boundary 1000 D away (it matters below Re ≈ 0.5): 2.0316 at Re 0.1 and 2.0030 at 0.01.
Published: 5.4, 6.91–6.92, 9.12–9.17, 9.95–9.96 at Re 50, 100, 200, 250 (second-hand, see REFERENCES.md).

**Agreement:** within 0.5% at Re ≥ 10; within 1% of the published values is what we got.

## A5. The instrument (minutes; an ordinary differential equation)

**Problem.** A wire along a diameter of a pipe, from the axis (w = 0) to the wall (w = R, in wire diameters). With
θ(w) the fractional rise of its local resistance,

Λ θ″ + P (1 + θ) − π Nu(Re · U(w)) θ = 0,  θ′(0) = 0,  θ(R) = 0,

where Nu(·) is A4's function of the local Reynolds number (Nu → 2 as its argument → 0), U(w) = 1 − (w/R)² is the
developed profile over its centreline value, and Re is on the centreline speed and the wire's diameter. Find the P
for which the mean of θ over the wire is 0.5.

| Re | 0.25 | 1 | 3 | 10 | 25 |
|---|---|---|---|---|---|
| P, for R = 100, Λ = 3000 | 2.6537 | 2.8172 | 3.1346 | 3.8423 | 4.7769 |
| share of the Joule heat that goes to the stream | 0.812 | 0.816 | 0.823 | 0.836 | 0.850 |

Further targets: R = 250, Λ = 3000, Re 3: P = 2.7478. The smallest P at which the linear problem has no bounded
solution (thermal runaway at constant current), R = 100, Λ = 3000, Re 10: 10.744. Profiles carrying the same flow
rate, U(w) = 0.4 (n + 3)/n · (1 − (w/R)ⁿ) (n = 2 is the developed flow; the plug is U = 0.4): at R = 100, Λ = 3000,
Re 3, P = 3.0536 for n = 4 and 2.9071 for the plug.

Two profiles with the same average along the wire, U = 1 − (w/R)² and U = 2/3, give readings that differ by 2.2%
at Re 3 and 3.2% at Re 10 (R = 100, Λ = 3000): the wire does not take a line average. The sensitivity to the
local loss h = π Nu is δP = ∫θ² δh dw / ∫θ(1 + θ) dw (the audit's result; checked here to six figures).

**Audited 2026-11-27** by adaptive collocation on our Nu table: P agrees to 0.002%, the runaway at 10.7438.

**Agreement:** P within 0.5%, given our Nu table (`kata/wire4/data/nu-table.json`); within 1% with your own.

The claim that this "row of spheres" picture is adequate is checked in A6: for R = 5, Λ = 3000, Re 100 it gives
P = 120.01 and the full tube computation 120.04.

## A6. The wire in a true tube (optional; hours)

**Problem.** A 4D pipe whose cross-section is a 3-ball of radius R = 5; a wire (3-ball cross-section, diameter 1)
along a diameter of that ball, perpendicular to the pipe's axis, from wall to wall. Inflow: the developed profile
1 − ρ²/R² (ρ the distance from the pipe's axis), 8 D upstream of the wire; outflow 20 D downstream; no slip on the
wall and the wire. The flow is sought in the family invariant under rotations of the two directions perpendicular to
both the stream and the wire, and mirror-symmetric about the pipe's axis, which makes it a 3D computation with a
radial weight. Re on the centreline speed.

| Re | 25 | 50 | 100 | 150 | 200 | 250 |
|---|---|---|---|---|---|---|
| recirculation length behind the wire on the pipe's axis | 0.02 | 0.34 | 0.78 | 1.21 | 1.71 | 1.97 |
| Nusselt number per length at the axis, wire temperature ∝ cos(πw/2R) | 4.28 | 5.36 | 6.83 | 7.98 | 9.05 | 9.96 |

All six are steady. Ours: 62 000 P2/P1 tetrahedra, 0.06 D on the wire, one mesh. **Agreement:** steady; lengths
within 0.05; Nusselt numbers within 2%.

The energy balance on that flow (the same equation as A5 with the stream's loss taken from the computed
temperature fields, in the first eight cosines along the wire), mean θ = 0.5, gives P = 8.526 at Λ = 30 and
18.921 at Λ = 300 for Re 100, and 117.174 and 123.526 at Λ = 3000 for Re 25 and 250.

## A7. The sheared-stream model and its pulse (optional; under-resolved, reported as an observation)

**Problem.** As A3 but with the stream U(w) = (1 + cos(2w/R))/2 held up by a body force, between mirror planes at
w = 0 and πR/2. At R = 5 everything we ran is steady, with the recirculation on the axis 1.28, 1.79 and
2.06 long at Re 150, 200, 250. At R = 10 the flow settles at Re 250 and pulses at 280 (period 36.8,
the length on the axis swinging between 2.18 and 2.33) with 28 harmonics along w, which is too few.
We would like to know whether the pulse survives resolution; we do not claim it.

## A8. The pipe (pencil and paper)

For a cross-section that is an m-ball: profile G(R² − r²)/(2mμ); centreline over mean (m + 2)/2; Darcy friction
factor 8m(m + 2)/Re on the diameter and mean speed; Nusselt number for developed flow with constant wall flux
2(m + 4)(m + 6)/(5m + 12) (48/11 for m = 2). And the line average of the profile along a diameter is 2/3 of the
centreline speed for every m, so it is (m + 2)/3 of the mean: 4/3 in our pipe, 5/3 in the 4D one.

---

## Running our codes instead

`kata/wire4/README.md` has a "Running it" block. In brief (Python with numpy, scipy, scikit-fem; gmsh for A6):

```bash
python wake4.py 50 40                                        # A1, and the beta = 0 thresholds
python crit4.py '{"Nr":80,"Nt":64}' 188,190,192,194 2.25,2.5,2.75 0    # A2's first table
python nl4.py 200 2.5 500                                    # A3
python nu4.py                                                # A4
python strip4.py table && python strip4.py 100 3000          # A5   (or: node test/anem.selftest.mjs)
python tube4.py 200 5 150 && python heat4.py 200-R5 0.7 8 && python anem4.py   # A6
```

Running our code checks that the paper reports what the code gives. It does not check the code. For A2 an
independent implementation is what is wanted.
