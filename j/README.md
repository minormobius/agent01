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

### `/model` — diffusion model fitting + ranking
Fits the radial curves to **five** models and ranks them by AIC/BIC:
- **Fickian sphere** (Crank eq. 6.18): φ(ρ,τ) = 1 + (2/πρ)·Σ(−1)ⁿ/n·sin(nπρ)·e^(−n²π²τ),
  τ = Dt/R². Reports Mₜ/M∞.
- **Reaction–diffusion (Thiele)**: C/Cs = (R/r)·sinh(φr/R)/sinh φ. For when the
  snapshot is *steady* but signal stays piled at the surface (binding/consumption).
  Reports Thiele modulus φ, penetration δ=R/φ=√(D/k), effectiveness factor η.
- **Stretched (Weibull)**: I = bg + A·exp(−((1−ρ)/λ)^β) — heterogeneous media.
- **Bi-exponential / core–shell**: two length scales λ₁<λ₂.
- **Exponential penetration**: I = bg + A·exp(−(1−ρ)/λ) (the β=1 / large-φ limit).

A **"Try a model"** control synthesises a clean analytic radial curve so each fit
can be seen to win its own physics (image-derived curves are PSF-blurred, where
Weibull is robustly best). **Population mode** fits every curve → histogram of τ
(and D, given R & t).

**Power law**: Fickian uptake into a sphere goes as **Mₜ/M∞ ∝ t^½** at early time;
the Korsmeyer–Peppas exponent for a sphere is **n ≈ 0.43**. Plug in real R (µm) and
t (s) to recover D = τ·R²/t.

### `/playground` — WebGPU diffusion
3D explicit finite-difference simulation of a species diffusing into a sphere from
a surface reservoir, running entirely on the GPU. Live axis-aligned cross-section,
Arrhenius temperature control (D = D₀·exp(−Eₐ/RT)), surface concentration, and four
**regimes** that mirror the `/model` fits — via a per-cell diffusivity field:
- **Uniform Fickian**
- **Reaction–diffusion (Thiele)** — first-order consumption k
- **Core–shell barrier** — a slow outer shell (bi-exponential profile)
- **Heterogeneous** — quenched random diffusivity (stretched-exponential front)

## The kernel (`wasm/src/lib.rs`)

| Export | Purpose |
|--------|---------|
| `grayscale`, `stats`, `sobel` | conversion + global stats + edge map |
| `detect_circles` | Hough-gradient circle detection |
| `line_profile` | bilinear line profile with thickness roll-up |
| `monte_carlo_radial` | population of radial brightness curves |
| `fit_sphere_diffusion`, `fit_reaction_diffusion`, `fit_weibull_penetration`, `fit_biexp_penetration`, `fit_exp_penetration`, `fit_power_law` | curve fits (each returns SSE + n_params for AIC/BIC) |
| `synth_image`, `synth_model` | synthetic confocal fields — `synth_model` seeds any of the five model profiles |

## Local build

```bash
cd j/wasm
wasm-pack build --release --target web --out-dir ../pkg --out-name imagej
# then serve j/ over http (the kernel + lib modules use absolute /pkg, /lib paths)
```

`pkg/` is a build artifact (git-ignored) — CI rebuilds it on every deploy.
