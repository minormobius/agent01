# sci — sci.mino.mobi

Scientific instruments, taken apart. One page per instrument, each a detailed
technical explainer built around **a solver the visitor drives** — not analogies
that fall apart when you push on them.

## The rule this wing runs on

Borrowed from [`neuro/`](../neuro/CLAUDE.md), which requires every resident
model to be checked against a published number from its own paper. Here:

**Every mechanism claim on a page traces to a primary source, and the source is
on the page. Every number is computed in the browser from constants and
closed-form physics, not quoted — and the solver that computes it is checked
against an analytic solution on every build.**

If a diagram's only justification is that it is the diagram everyone draws, it
does not ship. The MRI page exists precisely because the usual pictures
("radio waves go in, radio waves come out") are wrong.

## Facts

| | |
|---|---|
| Surface | `sci` |
| Dir | `sci/` |
| Endpoint | `sci.mino.mobi` |
| Type | frontend (assets-only worker, no build step for the HTML) |
| Owning branch | `claude/sci-surface-mri-research-ji1xf9` |
| Deploy | `.github/workflows/deploy-sci.yml` |
| Engine build | `.github/workflows/build-sci-engine.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "sci"`.

## Layout

| Path | What |
|---|---|
| `index.html` | the wing landing page — instrument index + the rule |
| `mri/index.html` | part one — the sensor. Single-file, drives the wasm |
| `mri/kspace/index.html` | part two — the encoding. Same wasm, `../pkg/mri.js` |
| `mri/contrast/index.html` | part three — contrast. Same wasm |
| `mri/acoustics/index.html` | part four — the noise. Same wasm, plus Web Audio |
| `mri/pkg/` | **generated** — wasm-pack output, committed. Shared by all four pages |
| `engine-rs/` | the Rust source for that wasm; **not served** |
| `research/` | literature scans, one per instrument; **not served** |
| `sci.selftest.mjs` | guards the wiring preflight can't see |

`engine-rs/` and `research/` are excluded from the asset stage by
`deploy-sci.yml`. Everything else under `sci/` ships.

## The domain

`sci.mino.mobi` **did not resolve** before the first deploy — checked
2026-08-15, `ENOTFOUND`, no A record. The expectation from
[`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7 would be that a human must attach the
custom domain; the `neuro` precedent says otherwise, because `mino.mobi` is a
zone on this account and wrangler created `neuro.mino.mobi` itself on its first
deploy (see [`neuro/CLAUDE.md`](../neuro/CLAUDE.md) § *The domain*). This
surface was wired on that precedent.

**Confirm it.** The golden rule is not suspended for a first deploy: the run log
must show

```
Deployed sci triggers (…)
  sci.mino.mobi (custom domain)
```

If it bound only a `workers.dev` host, the domain needs attaching to the `sci`
worker in the dashboard and the workflow re-running. The verify step is
`continue-on-error`, so a slow-DNS run is not red for a reason CI cannot fix —
read the log, don't trust the colour.

## The deploy pair

Ordering matters, and it mirrors `neuro`:

- **`build-sci-engine.yml`** — fires on `sci/engine-rs/**`. Runs
  `cargo test --release`, prints the known-answer table (`--bin verify`), builds
  with wasm-pack into `mri/pkg/`, commits it, then *dispatches* `deploy-sci`
  (a `GITHUB_TOKEN` push doesn't trigger other workflows).
- **`deploy-sci.yml`** — fires on `sci/**`. Runs the selftest, stages to
  `../.sci-stage`, and `wrangler deploy`s. It **hard-fails** if
  `mri/pkg/mri_bg.wasm` is missing from the stage: every number the page prints
  comes out of that module, so a deploy without it is a page full of em-dashes
  that still goes green.

### The dispatch race — found on the first run, fixed here

`build-sci-engine` pushes `pkg/` and then dispatches `deploy-sci`. A
`workflow_dispatch` resolves its `ref` to **whatever the branch tip is at
dispatch time**, and GitHub's branch read lags a push by a second or two. The
first run dispatched two seconds after pushing and the deploy ran against the
*previous* commit: it redeployed the old wasm, and both runs were green while
the committed `pkg/` and the live asset silently disagreed.

The fix is the `Wait for the branch tip to settle` step — poll the branch API
until it reports the SHA we just pushed, then dispatch. **`neuro`'s workflow has
the same shape and the same race**; it has not been touched from here because
that surface is owned by another branch, but it is worth fixing there before it
bites.

The general lesson, and it is the golden rule again in a new costume: two green
runs do not prove the thing that was built is the thing that is being served.
`curl -w '%{size_download}'` the live wasm against `stat -c%s` the committed one
when in doubt.

The sandbox cannot reach Cloudflare — **push to the owning branch, don't
`wrangler deploy` locally.** The sandbox *can* build the wasm (`rustup target
add wasm32-unknown-unknown` + wasm-pack) and run the whole site under
`python3 -m http.server`, which is how the pages were verified before shipping.

## engine-rs — what it actually computes

Eight modules, no dependencies, and the browser shell is thin on purpose so that
what the page shows is what `cargo test` checks.

| Module | Holds |
|---|---|
| `coil.rs` | Biot–Savart from finite straight segments; loops as polygons; `sensitivity()` = the reciprocity result, `|B₁⁻| = ½√(Bx²+By²)` |
| `bloch.rs` | Bloch equations, **exact per step** (rotation + two exponentials, not Euler); hard pulses via Rodrigues; isochromat ensembles; FID and Hahn echo |
| `phantom.rs` | ellipses in the continuous plane and their **closed-form** k-space (Bessel J₁); Shepp–Logan, original and Toft-modified |
| `fft.rs` | radix-2 Cooley–Tukey, 1D and 2D, plus `fftshift2`. Sixty lines, and it is the entire reconstruction algorithm |
| `encode.rs` | gradients as a steering wheel for k-space; spin-warp / EPI / radial; T₂* and off-resonance applied through **sample time**; reconstruction; the circular-cross-correlation shift measurement |
| `contrast.rs` | measured tissue T₁/T₂ (Stanisz 2005 Table 1, transcribed and asserted), the three sequence signal equations, the Ernst angle, the null time, and the contrast zero-crossing root finder |
| `acoustics.rs` | trapezoid gradient lobes, the Lorentz force, the `d²G/dt²` acoustic drive, one damped resonator (**a model**, labelled as such), spectra, and decibels |
| `physics.rs` | CODATA 2018 constants, Larmor frequency and wavelength, Curie-law polarisation, and the B₀² law for Faraday detection |

```bash
cd sci/engine-rs
cargo test --release            # 45 known-answer tests, ~1s
cargo run --release --bin verify   # every result printed beside its closed form
```

`cargo test` is not decoration. Each test compares a solver against an analytic
solution the page cites — the on-axis field of a circular loop, `e^(−t/T₂)`,
the `√2·z` optimum, the exactness of the echo. If one fails, the page is lying
to visitors, not merely broken.

### The results the page is built on

- **Reciprocity** (Hoult & Richards 1976): receive sensitivity at a point = the
  field the coil would produce there per unit current. This is why a sensitivity
  map is computable at all.
- **A coil parallel to B₀ is deaf, not weak.** Same `|B|` at isocentre —
  `1.340 µT/A` either way in the default geometry — and the sensitivity falls
  from `0.670 µT/A` to `2.3 × 10⁻¹⁶`. Only the transverse component couples.
  This is the page's headline and it has its own test.
- **The echo is exact.** Whatever the field spread, the Hahn echo at 2τ has
  magnitude `e^(−2τ/T₂)` to the last digit the solver carries. Reversible
  dephasing costs nothing.
- **`a = √2·z`** maximises a loop's on-axis field at depth `z` — derived, not
  asserted. Flagged in both the engine and the page as a *signal-only* optimum;
  noise grows with coil size too, which is Edelstein 1986 / Ocali & Atalar 1998
  territory and is where the page hands off to the literature.
- **Polarisation ≈ 4.94 ppm at 1.5 T, 37 °C**, and **signal ∝ B₀²** for a coil.
  The second power belongs to the *sensor*, which is the setup for the
  ultra-low-field section: a SQUID's sensitivity is frequency-flat, so it does
  not pay that price.

### …and part two

- **No inverse crime.** k-space is evaluated from the closed-form transform of
  an ellipse, not by FFT-ing a picture, so the aliasing on the page is the real
  thing rather than an artefact of reusing a grid (Guerquin-Kern 2012). Checked
  against brute-force numerical integration of the ellipse's indicator function.
- **`FOV = 1/Δk` and `Δx = 1/(2·k_max)`**, both measured rather than asserted: a
  disc parked at a known offset reconstructs at that offset, and a point object
  reconstructs into exactly one pixel with the PSF's zeros landing on its
  neighbours.
- **The EPI shift is `Δf · N · esp / R`.** Measured by circular
  cross-correlation against an undistorted reference and matched to the formula
  within a tenth of a pixel, at R = 1, 2 and 4. Spin-warp, same k-space, same
  Δf, comes out at 0.004 px — the artefact lives in the *timing*, not the
  sampling pattern.
- **Two modelling bugs found by testing, both fixed:** the image grid was
  half a pixel off (`(j − n/2)`, not `(j − n/2 + 0.5)`), which silently biased
  every position the module reported; and accelerated EPI was charging time for
  the lines it skipped, which made its distortion R× too large.
- **Measure shifts with `shift_along_y`, not a centroid.** The phantom is not
  symmetric, so its centroid is not zero to begin with, and a large shift wraps
  around the FOV — which a centroid reads as a small shift and a circular
  correlation reads correctly. The tool has its own test.

### …and part four

- **`F/L = B·I`**, and the number that lands: at 3 T and 300 A every metre of
  gradient winding carries the equivalent of **92 kg**, reversing thousands of
  times a second.
- **You hear the corners.** Radiated pressure goes as the *acceleration* of the
  radiating surface, so it follows `d²G/dt²` — the ramps are silent and the
  corners are not. Halving the ramp time doubles the kick, tested.
- **The spectrum is a comb locked to the sequence clock**: >90% of the acoustic
  energy sits on multiples of `1/(2·esp)`, asserted. The loudest line is
  usually a *harmonic*, not the fundamental, because `d²/dt²` weights by `ω²` —
  the original test asserted the fundamental, failed, and the measurement was
  the better claim.
- **The spectrum path is validated against a square wave's Fourier series** —
  odd harmonics falling as 1/n, even harmonics absent.
- **What is a model, and labelled as one:** the step from force to *sound* is a
  single damped resonator. A real former has many modes and a measured transfer
  function. The selftest asserts that page and engine use the same sentence
  about it: *the timing structure is the physics; the timbre is a model.*
- **The slew ceiling is physiological.** Past ~200 T/m/s the changing field
  stimulates peripheral nerves (Schaefer 2000), so gradient speed — and
  therefore the floor under the noise — is limited by the patient, not the
  amplifier.

### …and part three

- **The sequence equations are validated against the physics, not a textbook.**
  Each closed form is compared with a full Bloch simulation — repeated pulses
  from `bloch.rs` run to steady state with explicit spoiling — and agrees to
  ~1e-14. That is the strongest tie between the three parts: part one's
  integrator certifies part three's algebra.
- **The textbook simplification is measured, not waved away.** The usual
  `PD(1−e^{−TR/T₁})e^{−TE/T₂}` drops the 180° pulse's position in the recovery
  period; the error is under 2% in the T₁-weighted corner and several per cent
  in the T₂-weighted one. `contrast.rs` implements the exact form and a test
  pins the size of the difference.
- **Tissue values are Stanisz et al. 2005 Table 1, read from the paper**, with
  uncertainties, asserted digit-for-digit by both a Rust test and the JS
  selftest — two independent copies of the list, so a "tidy-up" has to defeat
  both. They are **in vitro**; the same table disagrees with its own literature
  column by 24% on grey-matter T₁, and the page says so in a caveat box rather
  than picking a winner.
- **The invisibility curve.** For every TE up to ~110 ms there is a TR at which
  white and grey matter produce identical signal. It runs between the
  T₁-weighted and T₂-weighted corners, which is *why* those two images look
  like negatives of each other — they are on opposite sides of a sign change,
  not on opposite sides of a physiological fact.
- **Proton density is 1.0 for every tissue** because that table does not measure
  it. Stated on the page. It makes the T₁/T₂ story cleaner and slightly
  overstates how much of clinical contrast is relaxation.

## Research

| File | What |
|---|---|
| [`research/mri-sources.md`](research/mri-sources.md) | ~50 annotated sources for `/mri`, in eleven sections, each with what it gives the page and whether its text was actually read |

`sci.selftest.mjs` asserts that every DOI cited on a page also appears in the
research scan — a citation on a page that nobody catalogued is a caught error.

## What `/mri` does not cover yet

The four parts are the sensor, the encoding, the contrast and the noise — which
is the whole instrument, end to end. What is left is depth rather than coverage.

Named omissions in part four: the acoustic output of a real gradient set is
dominated by *measured* mechanical resonances and by radiation efficiency, and
neither is modelled; the three real quieting strategies (force-balanced coil
design, damping and vacuum mounting, resonance-avoiding sequence design) are
pointed at rather than explored.

Named omissions inside part three, each an addition rather than a correction:
multi-echo trains (fast spin echo is more T₂-weighted than the single-echo
equation admits), imperfect spoiling (which gives steady-state free precession,
a different equation), and **contrast agents**, which shorten T₁ in proportion
to concentration and are in a large fraction of clinical scans.

Each page's scope box says where it stops, and `sci.selftest.mjs` asserts those
statements stay true — so retiring a "not written" means updating the selftest
in the same commit, which is the point.

## Adding an instrument

1. `research/<name>-sources.md` first — the literature scan, with verification
   status per entry. No page starts before its sources are read.
2. Solvers into `engine-rs/`, each with known-answer tests against a closed
   form. If a claim can't be tested, it needs a citation instead; if it has
   neither, cut it.
3. `<name>/index.html`, single-file, importing `../<name>/pkg/…`. New instrument
   ⇒ new wasm-pack target; add it to `build-sci-engine.yml` and to the stage
   check in `deploy-sci.yml`.
4. Extend `sci.selftest.mjs` — the import/export check and the DOI cross-check
   are per-page.
5. Add it to `index.html` here, and to the root `index.html` catalogue.
6. `node scripts/preflight.mjs --fix`, then push to the owning branch.

Interactives should reuse [`packages/dataviz/`](../packages/dataviz/) where a
chart is a chart. The MRI page draws its own canvases because a sensitivity map
and a k-space trajectory are not chart types.
