# LAVALAMP

A lava lamp in 3D beside one in 4D, each in the classic glass on a metal base. Both use the same physics and are the
same size: 16 cells across and 32 tall.
**3D on the left** shows the whole lamp; **4D on the right** shows your 3D slice of it. The wax is drawn solid and
coloured by its temperature, from deep red (cold) to yellow (hot); the liquid is clear.

| preset | what you see | the result |
|---|---|---|
| **lamp** | the classic lamp: wax pooled on the heater, in a glass that swells above its base and tapers to the cap | the wax rises in a thin hot stream, gathers into a blob in the cool upper glass, and the blob sinks back. Both lamps cycle. In 4D, move the lever and the whole lamp slims (below) |
| **thread** | a column of wax floor to ceiling with a ripple; no gravity, no heater | a thread breaks into drops when its ripple is long enough: **kR < 1 in 3D, kR < √2 in 4D**. At kR = 1.18 ours **straightens** and the 4D one **pinches off** |
| **cooling** | a hot ball of liquid (R = 5, T = 1) in cold liquid; no wax, no flow | the 4D ball loses half its heat about **1.9× faster** (t 17 against 33) |

## The lamp's shape

The glass's radius in cells at height y (0 the floor, 32 the top) is `glassR(y)`:
- 5 at the bottom;
- swelling to 6.8 at y = 9;
- then a straight taper to 3.2 at the top.

A metal cone sits below it (5.4 at the top to 7.6 at the bottom, 9 cells tall) and a small cap above it (3.6 to 2.3, 6
tall). The base and cap are drawn, not simulated.

**In 4D it's the same profile turned round the vertical axis**, with a 3-ball across instead of a disc: a hypersurface
of revolution. Your slice at w from the axis meets every part of it at radius √(R² − w²). So moving the lever slims the
whole lamp: the narrow cap first, then the top of the glass pinches shut, while the wide middle lasts longest. Tilting
your slice doesn't change it: the lamp is the same in every direction across.

**The glass in the solver:**
- **The flow.** The velocity is zeroed in the glass and projected back to divergence-free. About a fifth of the flow's
  energy is still in the glass afterwards, but it carries nothing (next point).
- **Transport.** φ and T move by fluxes through the faces between cells, and a face that touches glass carries none.
- **The wax.** Outside the glass, a stiff potential W(φ + 1)²/2 (W = 40) holds the composition at pure liquid. The liquid
  wets the glass, so the wax doesn't stick, and the liquid outside can hold only μ/(2 + W) of dissolved wax. (With a soft
  wall, the big region outside slowly soaked up the wax, and diffusion carried it there.) The stabiliser is raised to
  match: A ≥ (W + 2)/2.
- **The heat.** The heater is in the glass's bottom layers. The upper half of the glass loses heat, more toward the top.
  The room outside is held near T = 0.3.

**The lamp's settings** differ from the other presets:
- **A sharper interface, ε = 0.7.** At 16 cells across, a 4D blob is barely bigger than an ε = 1 interface. 4D squeezes
  small blobs harder, so they dissolve away (PHASELAB's effect).
- **The wax is a fifth of the glass's volume.**
- **A gentler heater.**

**Why it cycles, and the lag.** A lamp cycles because its blobs lag behind their surroundings thermally: hot on the way
up, cold on the way down. A blob that comes into balance with the liquid around it just settles at its neutral height,
where wax and liquid have the same density. With these densities that's at T ≈ 0.63. A 4D blob trades heat faster (see
cooling), so its lag is shorter. Two things made the 4D lamp cycle at all:
- The heat transport went from plain upwind, whose numerical diffusion (≈ u·dx/2 ≈ 0.5) was several times the real κ
  = 0.08, to a slope-limited second-order upwind.
- The lower thermal diffusivity tried, κ = 0.04, brought back a cold layer of wax stuck across the widest part of the
  glass. So κ stays 0.08.

**Why the thread breaks sooner in 4D.** Take a column of radius r rippled with wavenumber k, at constant volume. Its
surface area falls (so the ripple grows) when k²r² < n − 1, where n is the dimension of its cross-section. In 3D the
cross-section is a disc (n = 2): kr < 1, Plateau and Rayleigh's result. In 4D the cross-section is a 3-ball (n = 3):
kr < √2. The column's surface curves two ways round it in 4D instead of one, so the squeeze that pinches a neck is
stronger. A blob leaving a 4D lamp's pool hangs on a neck like this, and lets go sooner.

**Why heat leaves faster.**
- A 4D ball has 4/3 the surface for its volume, and its heat has more room to spread into.
- If a ball's surface were held at a fixed temperature, the slowest-cooling mode would decay 1.49× faster in 4D
  (j₁,₁²/π² = 14.68/9.87, the ratio of the two balls' lowest Laplacian eigenvalues).
- A blob losing heat to its surroundings does better still: about 1.9× by half-life, measured.

**What doesn't change.** How hard you must heat a layer before it starts to convect is the same in any dimension. The
linear stability problem depends only on the size of the horizontal wavenumber, not on how many horizontal directions
there are. Only the cells' pattern differs: with three directions across, cells can tile in 3D lattices. That's a known
analytic result; the page doesn't demonstrate it.

## The model (`js/lamp.js`, no DOM)

**The liquids** are PHASELAB's immiscible pair. Cahn–Hilliard, φ = +1 wax and −1 liquid, is now carried by a flow:
∂φ/∂t + u·∇φ = ∇²μ, with μ = φ³ − φ − ε²∇²φ.

**The flow** is creeping (Stokes). A lava lamp is slow and syrupy, so inertia is dropped, and the velocity follows from
the forces at each step, exactly, in Fourier space: û = (I − k̂k̂ᵀ) f̂ / (ηk²). Two forces drive it:
- **buoyancy**, along y;
- **the interfaces' own tension**, f = μ∇φ, which is Laplace's pressure: it rounds blobs and pinches necks.

**The heat** is ∂T/∂t + u·∇T = κ∇²T, plus a heater in the bottom three layers (T pulled toward 1) and a cool top (T
pulled toward 0). It's explicit, in real space. Advection is by fluxes through cell faces, with second-order upwind
faces slope-limited by minmod, so it's conservative and adds no new overshoots.

**The densities:** ρ' = ½(1 + φ)(δ − α_w T) − ½(1 − φ)α_l T. Cold wax is a little denser than the liquid, and wax
expands more when hot, so hot wax is lighter.

**The parameters** are in grid units. Gravity is strong enough that a hot pool can let go at all. Surface tension holds
a flat interface against every ripple shorter than 2π√(σ/Δb), Rayleigh–Taylor's capillary cut-off. That must be well
under the lamp's 16-cell width; with these parameters it's ~10 cells.

**The walls.**
- The floor and ceiling are mirrors (free slip, nothing through them). The solver works on the lamp and its mirror image
  stacked, a periodic box twice as tall. φ, T and the flow across are even about the walls, the flow along y is odd, and
  gravity points the other way in the mirror half.
- Convection amplifies rounding errors between the two halves, so the real half is copied onto the mirror half: T every
  step, φ every tenth.
- The lamp's sides wrap round (periodic): it's a lamp in a hall of mirrors, not a glass cylinder.

**The cost.** The FFT is WAVELAB's, batched across axes of mixed lengths (`makeFFTn`). The force's components are real,
so two share each complex transform: four transforms for the flow in 4D, not eight. The modes at an axis's Nyquist
wavenumber carry no flow; there, +k and −k are one point, the projection isn't conjugate-symmetric, and the packed pairs
would mix. Per step, on the machine this was built on:
- 3D (16k cells): ~11 ms;
- 4D (262k cells): ~140 ms, so the 4D lamp moves at 5–7 steps a second. The 3D one is held to its time.

## Not yet

- **The glass isn't a true no-slip wall.** The flow is masked and re-projected once, not solved with the glass as a
  boundary, and some flow remains in the glass. It carries nothing across, but the flow next to the glass isn't
  exactly what a wall would give.
- **A thin stream, not round blobs, going up.** At 16 cells across, hot wax rises as a stream too thin to count as a
  piece, and gathers into a blob at the top. A wider lamp would make several round blobs, but in 4D every cell across
  costs it cubed.
- **4D lamp cycles aren't in the selftest.** At ~180 ms a step, one cycle is minutes of compute here.
- **Viscosity is the same in wax and liquid.**
- **Convection's onset isn't shown,** only stated.

## Testing

```bash
node kata/lamp/test/lamp.selftest.mjs   # ~45 s
```

It checks:
- **The solver.**
  - The FFT on a 4 × 8 × 2 grid matches a direct transform.
  - The flow solves Stokes (residual ~10⁻¹⁵ of the force) and is divergence-free, in 3D and 4D.
  - The doubled box stays its own mirror image, so nothing crosses the walls.
  - The wax is conserved to rounding.
- **The thread.** At kR = 1.18, 3D straightens (ripple 0.33 → 0.09, never pinched) and 4D pinches off by t 83. The
  control at kR = 0.69 pinches in 3D too.
- **The cooling.** Half the heat is gone by t 32.8 in 3D and t 17.2 in 4D: at least 1.6× faster (1.91).
- **The lamp.** The 3D lamp in its glass cycles: wax reaches 0.7 of the height, and a blob cooled up there is back
  below half height. None of the wax is ever outside the glass. The 4D lamp isn't run here (one cycle is minutes of
  compute); the thread and the cooling exercise its physics. It was run by hand to t = 300: pieces at 0.11, 0.45 and
  0.80 of the height at once at t ≈ 204, moving up and down.
