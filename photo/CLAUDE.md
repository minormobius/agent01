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
| **`/glitch`** | **photo → steerable, reproducible glitch art** | `public/glitch/` |
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

## `/glitch` — steerable damage

Photo in, glitch art out, with the glitch under control. Two structural rules
carry the whole tool; break either and it degenerates into a slot machine:

- **Seeded, not random.** Nothing calls `Math.random()`. Every "random" choice
  comes from hashing the seed with the position it applies to (`hash32`), so
  the same photo + recipe + seed always gives the same bytes, and rerolling the
  seed is a deliberate move rather than an accident you can't undo.
- **Where is separate from what.** Every layer carries a **field** — a 0..1
  mask from the picture (brightness, edges), from geometry (bands, ramp,
  radial), from seeded noise, or painted by hand — and `blend()` guarantees the
  source survives *byte for byte* outside it. That guarantee is what makes
  "sort only the sky" a promise instead of a hope, and the selftest checks it
  for every operator.

| File | Holds |
|---|---|
| `public/glitch/js/glitch.js` | the pure core: seeded hashing, fields, 12 operators, blend, recipe encoding |
| `public/glitch/js/codec.js` | the JPEG databender — the one operator that needs a real encoder |
| `public/glitch/js/pipeline.js` | the async stack runner shared by the worker and the main-thread fallback |
| `public/glitch/js/presets.js` | curated stacks; each is just a recipe |
| `public/glitch/js/app.js` | photo, canvas, brush, stack editor, exports |
| `glitch.selftest.mjs` | determinism, mask containment, known answers — **run before touching `glitch.js`** |

```bash
node photo/glitch.selftest.mjs
```

Adding an operator: add it to `OPS` with a `params` schema (the UI builds its
controls from that — no app changes needed) and an `apply(src, out, W, H, P,
ctx)` that reads `src` and writes `out`. The stack does the masked blend, so an
operator must never blend for itself. The selftest picks it up automatically
and will fail it if it leaks outside a mask, ignores `amount: 0`, or is not
reproducible — which is the whole point of the registry being iterated rather
than listed.

**`jpeg` is the exception and is marked `async: true`.** It encodes a real JPEG
via canvas, corrupts bytes inside the entropy-coded scan (never a header, never
`0xFF`), and lets the browser decode the wreckage. Three honest consequences,
stated in the UI rather than hidden: it can fail (retries are seeded, so even
failures reproduce), byte offset maps only loosely to image position, and
canvas JPEG encoders differ between engines — so that operator alone is
reproducible *within* a browser, not across them. Everything in `glitch.js` is
identical everywhere. `render()` in `glitch.js` skips async ops; `renderAsync()`
in `pipeline.js` runs them.

The recipe (ops, params, fields, seed) is the whole state: it round-trips
through `?r=<base64url>`, the clipboard, and a `tEXt` chunk inside the exported
PNG, so a file found later can still say how it was made.

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
