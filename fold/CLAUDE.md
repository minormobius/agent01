# fold — fold.mino.mobi

Watch a protein fold. A structure-based C-alpha model under Langevin dynamics,
in Rust compiled to WebAssembly, rendered live in WebGL2.

## Facts

| | |
|---|---|
| Surface | `fold` |
| Dir | `fold/` |
| Endpoint | `fold.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/protein-folding-rust-wasm-dyceu3` |
| Deploy | [`.github/workflows/deploy-fold.yml`](../.github/workflows/deploy-fold.yml) |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "fold"`.

## What it is

Nine deposited structures ship with the site. Pick one, and a chain released
from a random coil folds into it in front of you — collapse, search, and the
native contacts snapping shut one by one. Alongside the 3D view: the contact
map (which specific pairs are made *right now*), the folding funnel drawn from
the trajectory rather than as a cartoon, Q and RMSD traces, and the sequence
laid out flat with each residue lit by how much of its own contact set is made.

Two of the nine are there because the site came out of a question about
[Ji et al., *Orthoflaviviruses use diverse binding modes to engage LDLR family
receptors*](https://www.biorxiv.org/content/10.64898/2026.08.22.744730v1):
the LDLR LA5 module (`1AJJ`) and the TBEV envelope protein E (`1SVB`).

## The model, and its one dishonesty

Clementi–Onuchic structure-based ("Gō") C-alpha model. One bead per residue:

```
V = Σ Kr (r − r0)²                              bonds,     Kr = 100
  + Σ Kt (θ − θ0)²                              angles,    Kt = 20
  + Σ K1[1 − cos(φ − φ0)] + K3[1 − cos3(φ − φ0)] torsions, K1 = 1, K3 = 0.5
  + Σ ε[5(σ/r)¹² − 6(σ/r)¹⁰]                    native contacts
  + Σ ε(4 Å/r)¹²                                excluded volume
```

Integrated with Langevin dynamics in reduced units (ε = 1, m = 1, Å).

**Every reference geometry is read off the deposited structure** — bond lengths,
bond angles, torsions, and each native contact's equilibrium distance. The
native state is the global minimum *by construction*. This model reproduces a
fold; it cannot predict one. Say so wherever the site describes itself; the
About panel does, at length, and that paragraph is load-bearing rather than
decorative.

What it does earn: the shape of the process. Collapse, the order contacts form
in, β-sheets being more frustrated than helix bundles, and the melting
transition when you push the temperature up. Those are real dynamics.

## Layout

| File | |
|---|---|
| `index.html` | the whole page chrome and its CSS |
| `app.js` | clock, camera, controls, and the steps-per-frame decision |
| `engine.js` | the wasm bridge — typed-array views over linear memory |
| `gl.js` | WebGL2 renderer: scene → bright-pass → blur → composite |
| `panels.js` | contact map, funnel, traces, sequence strip |
| `proteins.json` | 9 C-alpha traces + sequence + secondary structure, 16 KB |
| `fold.wasm` | **committed build artefact** — see below |
| `engine/` | the Rust source, `build.sh`, and the native validator |
| `fold.selftest.mjs` | node-only ABI + physics test; preflight runs it |

## Changing the engine

`fold.wasm` is committed, like `clock/morph.wasm` — the deploy is a plain static
push and there is no wasm toolchain in the job. So:

```bash
./engine/build.sh        # gradient check + folding run, then wasm, then selftest
```

**Never hand-build the wasm.** `build.sh` runs `cargo run --bin check` first,
which is the thing that keeps this honest:

- **`check`** — every analytic force against a central finite difference of V,
  per term and in total, plus a folding run from a coil. The dihedral force was
  wrong on the first pass (sign, and the wrong j/k redistribution coefficients);
  nothing folded and nothing else caught it. Errors should land at ~1e-5.
- **`check profile`** — steps-to-fold at the shipped defaults. This decides
  whether the site is worth looking at.
- **`check tune`** — the T / γ / dt sweep the defaults came out of.
- **`check bench`** — throughput per protein.

The ABI between `engine/src/lib.rs` and `engine.js` is hand-written with no
bindgen. `layout()` reports the strides the wasm was built with and `engine.js`
asserts against them at load, so bump `ABI_VERSION` on both sides when the shape
changes. A mismatch that slips through renders plausible garbage, not an error.

### Defaults, and why they are those numbers

`T = 0.80, γ = 0.10, dt = 0.010, contact cutoff 8.0 Å` — from `check tune`.
Measured on one core of a 2.8 GHz Xeon:

| | n | contacts | steps to fold | steps/s | seconds |
|---|---|---|---|---|---|
| Chignolin `1UAO` | 10 | 13 | 40k | 427,000 | 0.1 |
| Trp-cage `1L2Y` | 20 | 33 | 70k | 193,000 | 0.4 |
| Villin HP-35 `2F4K` | 35 | 70 | 50k | 85,000 | 0.6 |
| FBP28 WW `1E0L` | 37 | 66 | 40k | 74,000 | 0.5 |
| LDLR LA5 `1AJJ` | 37 | 83 | 40k | 71,000 | 0.6 |
| Protein G B1 `2GB1` | 56 | 138 | 80k | 42,000 | 1.9 |
| SH3 `1SHG` | 57 | 154 | 60k | 41,000 | 1.5 |
| Ubiquitin `1UBQ` | 76 | 177 | 90k | 29,000 | 3.1 |
| TBEV protein E `1SVB` | 395 | 1111 | **never** | 2,200 | — |

Everything folds far faster than anyone can watch, so `app.js` paces to a
**twelve-second** target against the wall clock (not against frames — a 15fps
machine should get a choppier fold of the same length, not a four-times-longer
one), then backs off if integration exceeds 7 ms in a frame.

`1SVB` is deliberately unfoldable and deliberately included: it is the honest
edge of the whole exercise. 395 residues never reached Q ≥ 0.85 inside the cap.

## Adding a protein

`engine/extract-testdata.py` is the provenance: it pulls a PDB entry, takes
MODEL 1 and the first protein chain, extracts C-alpha coordinates, assigns
secondary structure by the P-SEA C-alpha distance rules, centres the trace, and
writes both `proteins.json` and `engine/testdata.txt`. Add an entry to its
`META` list, re-run it, then re-run `fold.selftest.mjs` — it checks every trace
for ~3.8 Å C-alpha spacing, which is what catches a mis-parsed chain.

Keep the roster small. Every entry is bytes in the initial payload, and the
value of the site is that each one is *chosen*.

## Quirks worth knowing

- **Centre-of-mass drift.** Langevin noise is per-coordinate, so the molecule
  random-walks out of frame and away from the ghost. `remove_com_motion()`
  zeroes net velocity *and* recentres positions each batch. Both are rigid
  translations; no internal coordinate changes.
- **The native ghost is superposed per frame.** It is drawn through a model
  matrix built from the same Kabsch rotation the RMSD already needs, so you see
  the chain converging *into* its target rather than drifting beside it. Without
  it the ghost reads as a second protein and the view is worthless.
- **`[hidden]` needs `display: none !important`.** `#sheet` and `#tip` both set a
  `display`, which beats the UA sheet — without the override the About panel is
  open on load.
- **`'wasm-unsafe-eval'` in `_headers`.** Drop it and the page dead-ends at its
  "could not start" panel. It permits wasm compilation, not `eval()`.
- **Software rendering.** In a sandbox with no GPU (SwiftShader) this runs at
  ~4fps. That is the renderer, not the engine — the step rate is separately
  throttled and reported in the HUD.

## Deploying

Pushes to `claude/protein-folding-rust-wasm-dyceu3` that touch `fold/**` trigger
[`.github/workflows/deploy-fold.yml`](../.github/workflows/deploy-fold.yml),
which runs the selftest before `wrangler deploy`.

The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**. Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first,
especially the golden rule: the `wrangler.jsonc` `name` must be the worker that
owns the live custom domain, or the deploy goes green while the site never
changes. `fold.mino.mobi` was a **new hostname** — wrangler creates the custom
domain itself on a zone this account owns (as it did for `neuro`), but confirm
the run's log binds `fold.mino.mobi (custom domain)`.
