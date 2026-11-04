# LAVALAMP

A lava lamp in 3D beside one in 4D. Both use the same physics and are the same size: 16 cells across and 32 tall.
**3D on the left** shows the whole lamp; **4D on the right** shows your 3D slice of it. The wax is drawn solid and
coloured by its temperature, from deep red (cold) to yellow (hot); the liquid is clear.

| preset | what you see | the result |
|---|---|---|
| **lamp** | wax pooled on the floor, a heater below, a cool top | the pool warms, expands until it's lighter than the liquid, and lets go. A plume rises, cools, gets heavier at the top and sinks; the cycle repeats. Both lamps cycle; the 4D one a little faster (about 78 time units against 85, by the readout) |
| **thread** | a column of wax floor to ceiling with a ripple; no gravity, no heater | a thread breaks into drops when its ripple is long enough: **kR < 1 in 3D, kR < √2 in 4D**. At kR = 1.18 ours **straightens** and the 4D one **pinches off** |
| **cooling** | a hot ball of liquid (R = 5, T = 1) in cold liquid; no wax, no flow | the 4D ball loses half its heat about **1.9× faster** (t 17 against 33) |

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
pulled toward 0). It's explicit and upwind, in real space.

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

- **No glass.** The lamp's sides are periodic. A cylindrical wall would need a solid boundary in the flow, by
  penalisation or a different basis.
- **One blob at a time.** At 16 cells across, the pool lets go as one plume. A wider lamp would make several blobs, but
  in 4D every cell across costs it cubed.
- **Viscosity is the same in wax and liquid.**
- **Convection's onset isn't shown,** only stated.

## Testing

```bash
node kata/lamp/test/lamp.selftest.mjs   # ~50 s
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
- **The lamp.** The 3D lamp cycles: its wax rises past 0.7 of the height and comes back below 0.2. The 4D lamp isn't
  run here, because one cycle costs about a minute. The thread and the cooling exercise its physics.
