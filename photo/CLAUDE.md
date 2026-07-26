# photo — photo.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Photo explorer. Every image from any handle, rendered as a filterable masonry grid with engagement analytics — plus a wing of standalone image toys sharing the surface's origin.

## Facts

| | |
|---|---|
| Surface | `photo` |
| Dir | `photo/` |
| Endpoint | `photo.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/stained-glass-photo-endpoint-l7vy3r` |
| Deploy | `.github/workflows/deploy-photo.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "photo"`.

## Shape of the surface

One Cloudflare Worker (`photo`, custom domain `photo.mino.mobi`) with an assets
binding. [`worker.js`](worker.js) routes its own `/api/*` and hands everything
else to `env.ASSETS` — the Vite build output. Read the header comment in
`worker.js` before adding a route: Pages conventions (`functions/`,
`public/_worker.js`) are **not** honoured by Workers-with-assets, and trying
them again is a known dead end.

| Path | What it is | Lives in |
|---|---|---|
| `/` | the React explorer (repo → CAR → WASM → DuckDB → masonry grid) | `index.html`, `src/` |
| `/#/thread` | thread view | `src/components/Thread.jsx` |
| `/dm` | group-chat picture sender (posts as morphyx) | `dm/`, `dm-worker.js` |
| `/orb` | a thread's images on a WebGPU sphere | `public/orb/` |
| `/astro` | EXIF → the sky at the moment of the shot | `public/astro/` |
| `/prism` | live camera through a prismatic cornea | `public/prism/` |
| `/fractal` | photo → orbit-trapped fractal | `public/fractal/` |
| `/juice` | liquid-glass optics lab | `public/juice/` |
| **`/glass`** | **photo → the stained-glass panel of best fit** | `public/glass/` |
| `/api/img` | same-origin proxy for `*.bsky.app` images (canvas/WebGPU can't read them cross-origin) | `worker.js` |
| `/api/model` | same-origin proxy for the ocrs OCR models used by `/codescan` | `worker.js` |
| `/api/dm/*` | the `/dm` backend | `dm-worker.js` |

Anything under `public/` is copied verbatim into `dist/` by Vite — no build
step, no bundler, plain ES modules. Only `/` and `/dm` are Vite entry points
(`vite.config.js` → `rollupOptions.input`); a new static tool needs **no**
config change, just a directory under `public/`.

## `/glass` — the stained-glass projection of best fit

In goes a photograph, out comes the closest stained-glass window that can be
built from flat pieces and lead. The claim in the name is literal:

- Fix a partition of the image into pieces. The windows buildable from it are
  the functions constant on each piece — a linear subspace. The nearest member
  to the photo is the **orthogonal projection**, whose value on each piece is
  that piece's **mean colour**, taken in CIELAB so "nearest" is perceptual.
- The partition itself is fitted with **SLIC** (k-means in `(L,a,b,x,y)`), then
  connectivity-enforced: a piece that lands in two islands can't be cut as one.
- The leads are the piece boundaries traced on the pixel-corner lattice into a
  planar graph, **cut at junctions and simplified once per arc**, so two
  neighbours can never round a shared edge differently and open a hairline
  crack. Preserve that: per-polygon simplification looks fine on screen and
  falls apart in the SVG.
- Choosing a palette is a *second* projection — onto glass a glazier can buy —
  and its extra error is reported separately (`paletteCost`) rather than folded
  into the fit.

| File | Holds |
|---|---|
| `public/glass/js/glass.js` | all the maths, DOM-free: colour, SLIC, projection, stats, boundary tracing, SVG |
| `public/glass/js/worker.js` | runs the fit off the main thread |
| `public/glass/js/app.js` | photo loading, canvas rendering, workbench, exports |
| `glass.selftest.mjs` | proves the maths — **run it before touching `glass.js`** |

```bash
node photo/glass.selftest.mjs
```

It plants images whose best piecewise-constant approximation is known exactly,
brute-forces alternatives to confirm nothing beats the cell mean, and checks
that the traced pieces tile the panel to exact area with shared arcs. `node
scripts/preflight.mjs` runs it automatically whenever `photo/` changes.

Views: **glass** (the panel), **cartoon** (the glazier's cut drawing — leads
only), **residual** (where the flat glass is lying; an auto-ranged ΔE heat map),
**photo**. `?u=<image url>` loads a picture straight in; `*.bsky.app` URLs are
routed through `/api/img`, because that CDN Origin-checks browser fetches.

Everything is client-side — the photograph never leaves the tab.

## Deploying

Pushes to `claude/stained-glass-photo-endpoint-l7vy3r` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-photo.yml`](../.github/workflows/deploy-photo.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.

The workflow also pushes `MORPHYX_APP_PASSWORD` onto the worker after the deploy
(from the `BLUESKY_MORPHYX_APP_PASSWORD` Actions secret) for `/dm`. That step is
skipped when the secret is absent, so a deploy without it still succeeds and
only `/dm` stops working.
