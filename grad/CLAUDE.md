# /grad/ — Grad's conjecture, disproved in closed form

Part of the **math** surface (`math.mino.mobi`). See [`../geometry/CLAUDE.md`](../geometry/CLAUDE.md)
for the pack and [`../CLAUDE.md`](../CLAUDE.md) for repo-wide rules.

Grad (1967) conjectured that smooth MHD equilibria, (∇×B)×B = ∇p with ∇·B = 0,
with nested toroidal flux surfaces and non-constant pressure exist only with a
symmetry, as in a tokamak. Gómez-Serrano et al. (2026) proved non-symmetric ones
exist. Matt Landreman (arXiv:2609.26742, Sept 2026) then wrote two families
down **explicitly**, in Cartesian coordinates with elementary functions:

- **Family 1, ι = 2** (§2). A Solov'ev tokamak field stretched by
  A = diag(√(1+ε), √(1−ε), 1). This works because B₀·∇B₀ = −Dx with D =
  diag(1,1,4), and A commutes with D. Field lines are harmonic oscillators, so
  they have an explicit map r(u, v, ζ) (12). Every line closes after one turn.
  Domain: 0 ≤ ε < 1, 0 < δ < (1−ε)²/4 (18).
- **Family 2, sheared ι** (§3). A complex-analytic construction in ω = x+iy,
  with parameters ε, S, λ and edge k_b. Here ι varies across surfaces, from
  (54). Domain: k_b < 1, arcsin k_b < S (45).

The page is a WebGL viewer in the szilassi/chair44 layout: object in the top
two thirds, controls in the bottom third, side by side on wide screens.

## Run this first

```bash
node grad/field.selftest.mjs    # ~5 s, 128 checks
```

## The one idea

`field.js` is the only copy of the maths. The page and the selftest both import
it. **Nothing solves an equilibrium.** B, ψ, p and the surface maps are the
paper's closed forms. Every numerical routine is a *check* that uses a different
route from the formula it tests:

| check | how | independent of |
|---|---|---|
| force balance, ∇·B, B·∇ψ | central differences of B alone | ψ, the surface maps |
| surfaces | a field line traced through B alone (RK4 in the geometric angle φ) stays on ψ | the surface formulas |
| ι | the same trace, poloidal angle about the axis unwrapped per step (24) | (26), (54) |
| volume, ⟨\|B\|²⟩, β | brute quadrature of the Jacobian (48) over (k, χ, ζ) | the paper's reduced integrals (64) |
| Jacobians (14), (48) | finite differences of the maps | the closed forms |

The paper's printed values are reproduced exactly: β = 2/57 (family 1 at
ε = ½, δ = 1/64), ι(0) = 2.28690 and ι(δ) ≈ 2.2878 (family 2 at ε = 2, S = 1,
k_b = 0.1).

## Things that bite

- **Text extraction of the paper eats everything after a `<`** in the maths,
  which dropped a = √(1+ε), b = √(1−ε) and both domain bounds. They are now
  in the code with their equation numbers. If you re-extract, escape `<`
  in the alttext first.
- **Finite-difference force balance is O(h²).** At ε = 0.8 the worst relative
  residual is 1.3e-3 at h = 1e-4 and 1.3e-5 at h = 1e-5. That is truncation,
  not a violation, and the selftest tolerance (1e-4) is set knowing it.
- **The tracer needs 512+ steps per turn for fat or strongly shaped
  surfaces.** At ε = 5, k_b = 0.8 the ψ drift over 20 turns is 4.5e-3 at 256
  steps and 1.4e-5 at 512, which is 4th-order convergence. The page uses 512
  for sections and 1024 in the check tab.
- **`pointAt` (finding a surface point at a given toroidal angle) has two
  float traps.** A sample can sit exactly on the plane, and bisection with a
  zero at the bracket end walks to the other end. The unwrapped period can also
  land an ulp short of 2π, so no bracket straddles the plane. Both are handled,
  and the selftest sweeps every section label the page draws.
- **Family 1 lines all close.** A long trace revisits one dot per slice, so the
  sections trace 16 short lines per surface for family 1 and 1 long line per
  surface for family 2.
- **The conjectures index is open-only** (its schema has no resolved status),
  so Grad's conjecture is *not* listed there. It lives here and in the hub
  table as `disproved`.

## The page

- Knobs: family 1 has ε and δ (as a fraction of its ceiling, so the slider can
  never leave the domain). Family 2 has ε, S, λ and k_b (as a fraction of
  min(1, sin S)). The state is in the URL hash.
- `→ tokamak` eases ε to 0, holds, and eases back. At ε = 0 both families
  are axisymmetric, and the check tab says so from |B| on the axis.
- Colours: the outer surface is |B| on a one-hue orange ramp. Inner surfaces
  and the section curves are blue ramp steps (edge light, core dark). Traced
  points use the categorical orange, so "formula" and "traced" are two series
  with a legend.
