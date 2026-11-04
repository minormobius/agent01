# PHASELAB

Two liquids un-mixing, in 3D and in 4D side by side, by the same equations on the same grid spacing. On the left is
the whole 3D box, 32³ cells. On the right is your 3D slice of the 4D box, 32⁴ cells. Teal is one liquid, drawn solid;
the other is clear.

## What it shows

Most of what phase separation does **doesn't depend on dimension**. Two things do, and both are about curvature.

| preset | what you see | the result |
|---|---|---|
| **un-mix** | a 50/50 mixture separates and coarsens | domains grow at the same rate in both (as t^⅓), and at the same domain size they carry the **same** interface per volume (~1.9/L) with ~29% of the material in interfaces. Dimension doesn't change these |
| **emulsion** | a quarter of one liquid in the other | ours **breaks into pieces** as it coarsens (2–4 pieces, its largest down to 60–70% of it, between t ≈ 200 and 450); in 4D it stays **one connected network** throughout. In a box this small both end as one piece once the domains reach the box's size |
| **droplet** | one droplet settling to equilibrium | the droplet's own squeeze, μR/σ (Gibbs–Thomson), is **1 in 3D and 3/2 in 4D**: its surface curves two ways in 3D and three in 4D. Measured: 0.99 and 1.45 |
| **nucleus** | the same R = 7 droplet in the same over-saturated liquid | it **grows** in 3D and **dissolves** in 4D. The critical radius R* = (d − 1)σ / (Δφ μ) is 5.5 in 3D and 8.3 in 4D |

**What "surface-dominated" means here.** At the same domain size the interface per volume is the same in 3D and 4D;
the measurements say so. What is stronger in 4D is the **curvature**: a ball's surface curves in d − 1 directions, so at
the same radius a 4D droplet is squeezed half again as hard by its own surface. That raises the pressure inside it, the
solubility of its liquid around it (Gibbs–Thomson), and the size a speck of a new phase must reach before it can grow.
So in 4D, small droplets dissolve sooner and new phases are harder to start.

Controls: drag to turn both boxes. The pad twists your 4D slice into w (J L, I K), the lever moves it ana and kata
(R F), ⊞ or Z squares it up. **again** starts over with a new random mixture. The plot at the foot follows what the
preset is about, for both runs.

## The model (`js/phase.js`, no DOM)

**Cahn–Hilliard.** φ is the composition (+1 one liquid, −1 the other). The free energy is

  F = ∫ ¼(φ² − 1)² + ½ε²|∇φ|²

and φ flows down the gradient of μ = φ³ − φ − ε²∇²φ while each liquid's amount is conserved: ∂φ/∂t = ∇²μ. Nothing in
it knows its dimension except ∇². A flat interface is tanh(x/√2ε) with σ = (2√2/3)ε per unit of interface, in any
dimension. ε = 1 and the grid spacing is 1.

**The solver** is spectral and periodic: stabilised semi-implicit steps (Eyre's splitting, A = 2), which never raise
the free energy at any step size, two FFTs a step.

- **The FFT** is WAVELAB's 1D transform (`../wavelab/js/fft.js`, imported, not copied), batched across axes: along every
  axis but the first, each butterfly runs over all the lines at once. The 32⁴ transform takes ~75 ms on the machine this
  was built on, so **a 4D step takes ~190 ms there**. That's 4–6 steps a second, against ~200 for the 3D box.
- **The step grows as the pattern coarsens** (dt = 0.3 + 0.02t, up to 4). Big steps make coarsening run a little slow
  (L about 16% behind a fine-stepped run by t = 400), so the page makes no claim about coarsening *rates* beyond both
  dimensions sharing one. The droplets step bolder still (up to 6): only where they settle matters.
- **The two runs are kept in step**: each is in its own worker, and the 3D one never runs ahead of the 4D one's time.
- **The 4D worker cuts your slice itself** (32³ points, quadrilinear and periodic) and sends only that, so the 4 MB box
  never crosses to the page.

**The droplets** start in a liquid already over-saturated (φ = −0.9 far away). In a box this small, a droplet in pure
liquid dissolves entirely, because there's enough liquid round it to absorb it, and then there's no equilibrium to
measure. That same over-saturation (μ = 0.171) sets the critical radii.

**The measures**:
- **domain size** L = 2π/⟨k⟩, from the structure factor;
- **interface per volume**, from ∫|∇φ|/2;
- **the fraction in interfaces**, the share of cells with |φ| < 0.6;
- **pieces**, by union–find over face neighbours, periodic;
- **μ** in the liquid far from any interface;
- **a droplet's radius**, as the radius of a ball of its cell count.

## Not yet

- **No thermal noise.** The capillary-wave roughness that should distinguish a 3D interface (it roughens without limit
  as it grows) from a 4D one (bounded) needs fluctuations and much bigger interfaces than a 32-cell box.
- **No gravity.** The ocean's liquid–gas separation under gravity is WAVELAB's assumption, not something shown here.
- **The chemistry underneath** (whether 4D molecules attract like this at all) is assumed, as everywhere in kata.

## Testing

```bash
node kata/phase/test/phase.selftest.mjs   # ~2 min: the 4D runs are a million cells
```

It checks:
- **The solver.** The batched FFT matches WAVELAB's. Each liquid's amount is conserved, and the free energy never rises.
  A flat interface carries σ = 2√2/3 in both dimensions (0.9424 against 0.9428).
- **The droplet.** μR/σ within 5% of 1 in 3D (0.990) and within 0.1 of 1.5 in 4D (1.448).
- **The nucleus.** R = 7 grows in 3D (to 7.73) and is gone by t = 1000 in 4D.
- **The emulsion.** For two seeds, at t = 200, 300 and 400, 3D's largest piece falls below 80% of the minority (to
  61–69%), while 4D is one piece every time.
