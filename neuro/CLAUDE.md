# neuro — neuro.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Cognitive-science models reimplemented from their published papers in Rust,
compiled to WebAssembly, and served as static pages that run the model in the
visitor's tab.

The wing's rule, and the reason it exists: **each resident is checked against a
published number from its own paper, and the comparison is on the page.** A
model that can't be shown to replicate doesn't get a URL here.

## Facts

| | |
|---|---|
| Surface | `neuro` |
| Dir | `neuro/` |
| Endpoint | `neuro.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/website-hidden-paper-8vum5k` |
| Deploy | `.github/workflows/deploy-neuro.yml` |
| Engine build | `.github/workflows/build-neuro-engine.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "neuro"`.

## Layout

| Path | What |
|---|---|
| `index.html` | the wing landing page — residents + the editorial rule |
| `homeostasis/index.html` | the first resident, single-file, drives the wasm |
| `homeostasis/pkg/` | **generated** — wasm-pack output, committed |
| `engine-rs/` | the Rust source for that wasm; **not served** |
| `neuro.selftest.mjs` | guards the wiring preflight can't see |

`engine-rs/` is excluded from the asset stage by `deploy-neuro.yml`. Everything
else under `neuro/` ships.

## The domain — how the first attach actually went

`neuro.mino.mobi` **did not resolve** before the first deploy; the hostname was
new. Going in, the expectation from
[`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7 ("attach / detach custom domains" is
dashboard-only) was that a human would have to attach it and that the first run
would otherwise go green against a `workers.dev` host.

**That turned out to be wrong, and it's worth knowing for the next new
subdomain:** wrangler created the custom domain itself on the first deploy. The
run log shows

```
Deployed neuro triggers (1.15 sec)
  neuro.mino.mobi (custom domain)
```

and the verify step got `Could not resolve host` on attempt 1, then `✓ neuro is
live` five seconds later — DNS propagating, not a missing binding. §7's rule
covers *detaching* domains and cleaning up orphan workers; a first attach on a
zone this account owns is something the API token can do.

The golden rule still applies to every deploy after this one: **confirm the log
binds `neuro.mino.mobi (custom domain)`**, because green alone never proves it.
The workflow's verify step is `continue-on-error` so a slow-propagation run
isn't red for a reason CI can't fix by itself.

## The deploy pair

Two workflows, and the ordering matters:

- **`build-neuro-engine.yml`** — fires on `neuro/engine-rs/**`. Runs
  `cargo test --release`, builds with wasm-pack into `homeostasis/pkg/`, commits
  it, then *dispatches* `deploy-neuro` (a `GITHUB_TOKEN` push doesn't trigger
  other workflows).
- **`deploy-neuro.yml`** — fires on `neuro/**`. Stages to `../.neuro-stage` and
  `wrangler deploy`s. It **hard-fails** if `homeostasis/pkg/homeostasis_bg.wasm`
  is missing from the stage, because the page is nothing but a shell around that
  module — a deploy without it is a blank site that still goes green.

The sandbox cannot reach Cloudflare — **push to a trigger branch, don't
`wrangler deploy` locally**. If you edit Rust, let the build workflow produce
`pkg/`; don't hand-commit a locally built module unless you've also run the
tests.

## homeostasis — the resident

Falandays, Nguyen & Spivey (2021), *Is prediction nothing more than multi-scale
pattern completion of the future?*, Brain Research 1768:147578
([doi](https://doi.org/10.1016/j.brainres.2021.147578), open access, CC BY-NC-ND
4.0). A 100-node spiking reservoir with **no teaching signal and nothing that
represents a prediction** — every node only nudges its incoming weights so its
own activation drifts toward a private target. Train on a toy grammar, cut the
input off, and the fading activity resembles the likely next token.

### Provenance — read before touching

The authors' reference implementation is three Jupyter notebooks at
[github.com/bfalandays/HomeostasisModel](https://github.com/bfalandays/HomeostasisModel),
linked from a footnote on p. 12 of the paper. **That repo carries no LICENSE
file.** Nothing from it is vendored here and no code was copied; `engine-rs/` is
an independent port written from the paper's §5 and the update equations. Keep
it that way — if you need to disambiguate behaviour, read their notebooks and
implement, don't paste. (Their code also no longer runs on a current Python
stack: it calls `DataFrame.append`, removed in pandas 2.0.)

Credit goes to the authors on the page, in the engine's doc comments, and in the
footer. Don't strip it.

### What replicates, and how well

Verified in this sandbox with `cargo run --release --bin replicate -- 500`:

| Claim | Paper | This port |
|---|---|---|
| Table 2 top-ranked token | 6 rows | 6/6 match |
| Table 2 second-ranked token | 6 rows | 6/6 match |
| Table 2 cell values | — | mean abs difference **0.0048** |
| Population-code strength | 0.65–0.77 | 0.64–0.77 |
| Surprise at a single bad token | "> 3 σ" | **≈ 1 σ** — see below |
| Surprise over consecutive bad tokens | climbs | +1.2 σ → +2.2 σ → +3.7 σ |

The single-token surprise number is the one honest divergence, and the page says
so in its docs tab. The paper's >3 σ figure comes from a *sequence* of
violations, which does reproduce; one impossible token on its own moves mean
activation by about one standard deviation. The ordering the argument needs
(expected < unlikely < impossible < sustained-impossible) holds throughout.

It is not bit-for-bit and can't be — NumPy's Mersenne Twister vs xoshiro256\*\*
explore different networks. What replicates is the statistics over many runs,
which is all the result ever claimed.

### The two binaries

`engine-rs` builds a lib (wasm + native) plus two native drivers, both of which
print their comparison against the published numbers:

```bash
cd neuro/engine-rs
cargo test --release                              # 13 tests, ~1s
cargo run --release --bin replicate -- 500        # Table 2, ~8s on 8 threads
cargo run --release --bin surprise  -- 200        # §5.5 activation profiles
```

`cargo test` is not decoration here — it asserts the *model's claims*
(homeostasis reduces error, population codes emerge, the fading memory ranks the
likely continuation first, identical inputs get position-specific codes). If one
of those fails, the site is wrong, not just the build.

### Page structure

Six tabs, all driven from one `Reservoir` object across the wasm boundary:
`watch` (live raster + error trace), `cut the input` (the Table 2 probe on a
single network), `surprise` (§5.5, averaged over a batch of networks — one
network can't show a 1 σ effect), `population codes` (the Fig. 10
autocorrelation matrix), `replicate table 2` (runs 100–500 networks in-tab,
~15 networks/sec), and `docs`.

Model parameters are live controls. Changing any of them rebuilds the network
and invalidates the trained snapshot the analysis tabs share
(`trainedParams` / `ensureTrained`).

### Gotchas

- **Don't name a module-level variable `history`** in the page script — it
  shadows `window.history` and breaks the tab router. Cost an afternoon once.
- The probe procedure keeps learning **on** during the prompt and lets target
  drift carry across the six probes. That's a quirk of the reference
  implementation, faithfully preserved. Don't "fix" it without re-running the
  replication.
- `pkg/.gitignore` and `pkg/package.json` are wasm-pack droppings; the build
  workflow deletes them so `pkg/` can be committed. Do the same locally.
- Correlations are rounded to 2 dp *before* averaging, matching the notebooks'
  `np.around(..., 2)`. Looks odd, is deliberate.

## Adding a resident

Same shape: `<model>/index.html` + `<model>/pkg/` + its own crate (one per
model — don't merge them). Add it to the wing landing page's residents list and
to `serves` in the registry entry, extend `neuro.selftest.mjs`, and **do not add
it until you have a published number it reproduces.**
