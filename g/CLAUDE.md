# g — g.mino.mobi

The WebGPU gallery: simulation toys, one canvas each. Repo-wide rules live in
[`../CLAUDE.md`](../CLAUDE.md); the index of all surfaces is
[`../docs/SURFACES.md`](../docs/SURFACES.md).

## Facts

| | |
|---|---|
| Surface | `g` |
| Dir | `g/` (config only — **the content lives in `clock/`**) |
| Endpoint | `g.mino.mobi` |
| Type | frontend (assets Worker `g`) |
| Owning branch | `claude/morphhdl-sonification-graphs-s9t2qo` |
| Deploy | [`.github/workflows/deploy-g.yml`](../.github/workflows/deploy-g.yml) |
| Uses | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "g"`.

## The one thing to know

**`g/` holds no site.** It holds `wrangler.jsonc` and nothing else. The deploy
workflow mirrors `clock/` into `g/dist/` at build time and points wrangler at
that. So:

* to change the gallery, edit **`clock/`** — `clock/index.html` is the hub and
  each toy is `clock/<toy>/`;
* `g/dist/` is build output. It is gitignored (`dist/` in the root
  `.gitignore`) and must never be committed;
* `clock.mino.mobi` still serves the same directory. It is the deprecated
  predecessor and keeps working until its dashboard redirect to `g.mino.mobi`
  is in place, so a change to `clock/` shows up on both.

`clock/` is also the source for the `torus` surface, which stages a subset of
the same toys (`corn`, `emsim`, `inpac`, `knotpac`, `pac`, `torpac`,
`toruschess`) to `torus.mino.mobi`. A change to one of those directories
deploys to **both** surfaces. `clock/CLAUDE.md` is torus's instruction file, not
this one.

## Adding a toy

1. `clock/<toy>/index.html` — self-contained, ES modules, no build step. The
   gallery is a static assets Worker: whatever you commit is what ships.
2. Add a row to the `P` array at the top of `clock/index.html` —
   `['NAME','./<toy>/','one-line description','#accent']`.
3. Link back with `<a href="../">← gallery</a>`.
4. Push to the owning branch. `clock/**` is in this surface's `paths`, so the
   push deploys.

## The toys with more than a page to them

| Toy | What is behind it |
|---|---|
| [`clock/bearings/`](../clock/bearings/) | Steel bearings self-assembling a wire in oil. Rust DEM + Kirchhoff solver compiled to wasm, raw-WebGPU renderer. Has its own [README](../clock/bearings/README.md), `cargo test` suite and a node selftest. |
| [`clock/morph/`](../clock/morph/) | A recursive HDL whose circuits grow themselves, after Mordvintsev's [MorphoHDL](https://paradigms-of-intelligence.github.io/morpho/). Rust graph-rewrite engine + Barnes–Hut layout compiled to wasm, WebGL2 renderer, Web Audio sonification, live source editor. Own [README](../clock/morph/README.md), `cargo test` suite and node selftest. Unlike the rest of the gallery it needs **WebGL2, not WebGPU**. |
| `clock/hourglass/` | Grain-scale sand, WebGPU compute |
| `clock/helix/` | the original Helix Calendar this surface grew out of |
| `clock/mol/`, `clock/globe/`, `clock/scape/` | molecular dynamics, megaprojects globe, landscape |
| the toroidal games | shared with `torus.mino.mobi` — see above |

## Deploying

A push to `claude/morphhdl-sonification-graphs-s9t2qo` that touches `clock/**`,
`g/**` or the workflow triggers
[`deploy-g.yml`](../.github/workflows/deploy-g.yml). The sandbox cannot reach
Cloudflare — **push to the owning branch, never `wrangler deploy` locally**.

> ⚠️ **The gallery is a single manifest, so the owning branch must hold every
> toy.** `deploy-g.yml` stages a mirror of `clock/` and Workers Static Assets
> replaces the whole manifest — it does not merge. Deploying from a branch that
> is missing a toy silently unpublishes it, from a green run.
>
> Two live consequences of that, worth knowing before you push:
>
> * Ownership moved here from `claude/ball-bearing-assembly-dc9cph` when
>   `clock/morph/` landed. Bearings work pushed to that branch **no longer
>   deploys** — it has to reach this branch (via `main`) to go live.
> * [`build-bearings-solver.yml`](../.github/workflows/build-bearings-solver.yml)
>   still dispatches `deploy-g` on **its own ref** after committing a new
>   `bearings.wasm`. Fired from a branch without `clock/morph/`, that
>   republishes the gallery without morph. The fix is to land the change here
>   rather than to dispatch from there; the dispatch cannot be neutralised from
>   this branch, because a workflow run always uses the copy of the file on the
>   ref that triggered it.

Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
`wrangler.jsonc`'s `name` must be the worker that owns the live custom domain,
or the run goes green while the site never changes. For this surface the proof
is a log line binding `g.mino.mobi (custom domain)` to worker `g`.

Rust/wasm inside a toy is built by its own workflow (for bearings,
`build-bearings-solver.yml`), which commits the `.wasm` and then dispatches
`deploy-g.yml`. The gallery deploy itself has no build step and no secrets
beyond the Cloudflare token.
