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
| `mri/index.html` | the first instrument, single-file, drives the wasm |
| `mri/pkg/` | **generated** — wasm-pack output, committed |
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

Three modules, no dependencies, and the browser shell is thin on purpose so that
what the page shows is what `cargo test` checks.

| Module | Holds |
|---|---|
| `coil.rs` | Biot–Savart from finite straight segments; loops as polygons; `sensitivity()` = the reciprocity result, `|B₁⁻| = ½√(Bx²+By²)` |
| `bloch.rs` | Bloch equations, **exact per step** (rotation + two exponentials, not Euler); hard pulses via Rodrigues; isochromat ensembles; FID and Hahn echo |
| `physics.rs` | CODATA 2018 constants, Larmor frequency and wavelength, Curie-law polarisation, and the B₀² law for Faraday detection |

```bash
cd sci/engine-rs
cargo test --release            # 17 known-answer tests, ~1s
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

## Research

| File | What |
|---|---|
| [`research/mri-sources.md`](research/mri-sources.md) | ~50 annotated sources for `/mri`, in eleven sections, each with what it gives the page and whether its text was actually read |

`sci.selftest.mjs` asserts that every DOI cited on a page also appears in the
research scan — a citation on a page that nobody catalogued is a caught error.

## What `/mri` does not cover yet

Part one is the sensor. The encoding half — gradients, k-space, spin-warp and
EPI, why the scanner screams, what contrast is — is **not written**. The sources
are catalogued and read; the pages are not built. The landing page lists
`k-space` as planned, and the `/mri` page says so in its own words. Keep that
honest as pages land.

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
