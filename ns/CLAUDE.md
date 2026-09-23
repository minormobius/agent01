# ns — ns.mino.mobi

<!-- HAND-OWNED. Instruction set for THIS surface. Repo-wide rules live in
     ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

An explainer pack on **"Finite time blowup for Navier–Stokes" (OpenAI, 2026)**,
the 166-page paper claiming, for every viscosity, a smooth compactly supported
force under which the 3D incompressible equations start from rest, keep bounded
kinetic energy, and develop unbounded velocity at t = 1 — Fefferman's
alternatives (C) and (D). Each sub-page takes one piece of the construction and
*implements* it in the browser rather than describing it.

## Facts

| | |
|---|---|
| Surface | `ns` |
| Dir | `ns/` |
| Endpoint | `ns.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/navier-stokes-website-rl8aox` |
| Deploy | `.github/workflows/deploy-ns.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "ns"`.

## Pages

| Path | What it implements | From the paper |
|---|---|---|
| `/` | the hub: the theorem and what it does *not* claim, an animated r–z anatomy (core · annulus · exterior), the proof map, a timeline of prior work | §1–3, Figs 1–6 |
| `/core/` | the concentrating core: every scaling law vs τ with the exponent h live; the similarity map q(z,τ); true meridional streamlines from the reference axis profile U = 4η + j₀ via the incompressibility identity for V₀; the viscosity and torus rescalings | §2.1, §3.1, (3.2), (4.7), (10.22), Cor. 10.6 |
| `/pulse/` | the pulse: integrates the projected wave-amplitude ODE and overlays the envelope P(v); the exact Kelvin/Orr shearing wave in Couette flow (the mechanism in its simplest setting); the centrifugal criterion, showing v_s > 2 is Rayleigh's criterion with axial shear | §7.1–7.2, (7.5)–(7.12), Lemma 7.4 |
| `/stress/` | Reynolds stress from zero-mean waves; the admissible stress cone, drawn from (t_s, v_s) exactly as (4.23)/(7.1) define it, with a draggable target and its positive representation c₁v₁ + c₂v₂ | §2.2, §4.3, Fig. 4, Prop. 7.5 |
| `/exterior/` | the heat exterior: H(Z) by quadrature, K(r,τ), the pressure integral, a finite-difference residual of the swirl heat equation, and a radial FD solver checked against the exact field | (3.5), (4.29), (10.7)–(10.8), Lemma A.6 |
| `/bands/` | the ledger of scales: dyadic bands Q = 2^−ℓ, ε = Q^h, S* = ℓ², carrier k, wavelength and amplitude ratios, the correction cycle σ_j, and how small q must be before h = 1/100 bites | §3.6, (6.1), (7.2), (9.8) |
| `/solver/` | a 2D pseudo-spectral incompressible Navier–Stokes solver (hand-written FFT, vorticity form, RK with integrating factor, 2/3 dealiasing) with a shear-plus-wave experiment that measures ⟨uv⟩ and the mean-flow feedback — and shows why 2D cannot blow up | contrast to §1; Orr 1907, Craik–Criminale 1986 |
| `/explorer/` | the 3D explorer: a seeded leading-order field (`field.js`, exact incompressibility via (4.7), zero axial moment, axis regularity, centrifugal pressure table, heat-law exterior; selftest `field.selftest.mjs`, 40 checks) rendered in raw WebGL2 — the section plane with pressure colour + LIC streaks (bismuth’s trick), additive streamlines integrated on the CPU in similarity units, transform-feedback particles in physical time through the collapse, a ray-marched pressure glow. The GLSL field is generated from `field.js` (`glslField()`) so there is one set of formulas | (3.2), (4.3)–(4.7), (4.25), (4.29), Thm 4.6(v) |

## How it works

Pure static: one `index.html` per page, `ns.css` and `ns.js` shared (tabs,
HiDPI canvas helper, formatting). Links between pages are **relative** so the
pack works both at `ns.mino.mobi/<page>/` and, through the root bundle, at
`mino.mobi/ns/<page>/`. No build step, no dependencies, no network calls.

Every number a page prints comes from a formula in the paper, and the page says
which one. Where a page uses an *illustrative* profile because the paper only
proves existence (the swirl profile in the hub's anatomy, the annulus radii
X_a, X_b), it says so in the caption. Do not tighten those into claims.

**The paper is a preprint by "OpenAI" with no named authors; nothing here
verifies its proof.** The hub says so. Keep that sentence.

The explorer is **not a simulation**. It draws the leading-order ansatz with a
modelled profile; its docs tab lists exactly what is exact and what is not, and
the selftest pins the exact part. Keep those two lists in step with `field.js`.

## Deploying

Pushes to `claude/navier-stokes-website-rl8aox` that touch `ns/**` trigger
[`.github/workflows/deploy-ns.yml`](../.github/workflows/deploy-ns.yml). The
sandbox cannot reach Cloudflare — push, don't `wrangler deploy` locally.

`ns.mino.mobi` did not exist before this surface. `wrangler.jsonc` declares the
`custom_domain` route, so the first deploy creates worker `ns` and binds the
domain (the same path `ink`, `sci` and `jurassic` took). **Confirm from the run
log that it prints `ns.mino.mobi (custom domain)`** — green alone is not proof
(../docs/DEPLOYS.md §4). DNS may take ~10 s to resolve on that first run.

## Adding a page

1. `ns/<slug>/index.html`, single file, load `../ns.css` and `../ns.js`.
2. Add it to the hub's page grid and to `catalogue.json` (`p: "ns"`,
   `surface: "ns"`, category `data`), and place it in
   `rethink/proposal.json` under the `ns` group.
3. `node scripts/preflight.mjs --fix`.
