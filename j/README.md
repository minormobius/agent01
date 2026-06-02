# j — ImageJ in the browser (Rust/WASM)

**Live at**: `j.mino.mobi`
**Stack**: Cloudflare Worker (assets-only) + a Rust→WASM compute kernel + WebGPU
**Deploy**: `.github/workflows/deploy-j.yml` (builds the kernel with `wasm-pack`, then `wrangler deploy`)

Image analysis for confocal microscopy of spheres, with everything client-side.
The browser never uploads pixels anywhere — it hands an RGBA buffer to the WASM
kernel and gets numbers back. Heavy math is Rust; the pages are vanilla JS.

## Pages

### `/` — ImageJ
- Load any image, or **generate a synthetic confocal sphere field** (surface-bright
  signal penetrating inward with exponential decay + shot noise).
- **Gross statistics**: min/max/mean/std/median/percentiles + histogram + integrated density.
- **Edge detect & circle count**: Gaussian blur → Sobel → Hough-gradient circle
  detection. Overlay + live count.
- **Line profile**: drag a line, read the intensity profile. Increase the line
  **thickness** to roll up (average) the signal across the perpendicular band.
- **Monte-Carlo radial sampling**: casts random diameters through every detected
  sphere → a population of radial brightness curves (center→surface), with mean ±σ.
  Export to CSV/JSON or hand straight to `/model`.

### `/model` — Fickian diffusion fit
Fits the radial curves to:
- **Fickian sphere** (Crank eq. 6.18): φ(ρ,τ) = 1 + (2/πρ)·Σ(−1)ⁿ/n·sin(nπρ)·e^(−n²π²τ),
  τ = Dt/R². One nonlinear parameter (τ), linear (bg, A). Reports Mₜ/M∞.
- **Semi-empirical penetration**: I(ρ) = bg + A·exp(−(1−ρ)/λ).
- **Population mode**: fits every curve → histogram of τ (and D, given R & t).

**Power law**: Fickian uptake into a sphere goes as **Mₜ/M∞ ∝ t^½** at early time;
the Korsmeyer–Peppas exponent for a sphere is **n ≈ 0.43**. Plug in real R (µm) and
t (s) to recover D = τ·R²/t.

### `/playground` — WebGPU diffusion
3D explicit finite-difference simulation of a species diffusing into a sphere from
a surface reservoir, running entirely on the GPU. Live axis-aligned cross-section,
Arrhenius temperature control (D = D₀·exp(−Eₐ/RT)), surface concentration, and a
first-order reaction term for a Thiele-type steady state.

## The kernel (`wasm/src/lib.rs`)

| Export | Purpose |
|--------|---------|
| `grayscale`, `stats`, `sobel` | conversion + global stats + edge map |
| `detect_circles` | Hough-gradient circle detection |
| `line_profile` | bilinear line profile with thickness roll-up |
| `monte_carlo_radial` | population of radial brightness curves |
| `fit_sphere_diffusion`, `fit_exp_penetration`, `fit_power_law` | curve fits |
| `synth_image` | synthetic confocal sphere field (test data) |

## Local build

```bash
cd j/wasm
wasm-pack build --release --target web --out-dir ../pkg --out-name imagej
# then serve j/ over http (the kernel + lib modules use absolute /pkg, /lib paths)
```

`pkg/` is a build artifact (git-ignored) — CI rebuilds it on every deploy.
