# photo — photo.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

An index of image tools sharing one origin: a layered editor, projections and warps, optical instruments, and an explorer that renders every image from any Bluesky account as a filterable masonry grid. `/` is the catalogue; everything else hangs off it.

## Facts

| | |
|---|---|
| Surface | `photo` |
| Dir | `photo/` |
| Endpoint | `photo.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/image-manipulation-platform-g5puxy` |
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
| **`/`** | **the index of this surface — every tool below, grouped** | `src/components/Landing.jsx`, `src/lib/catalogue.js` |
| `/#/explore` | the image explorer (repo → CAR → WASM → DuckDB → masonry grid) | `src/components/Explorer.jsx` |
| `/#/thread` | thread view | `src/components/Thread.jsx` |
| `/#/sleuth` | post search + LLM dossier (BYOK) | `src/components/Sleuth.jsx` |
| `/#/codescan` | OCR — pull text off a picture | `src/components/CodeScan.jsx` |
| `/dm` | group-chat picture sender (posts as morphyx) | `dm/`, `dm-worker.js` |
| `/orb` | a thread's images on a WebGPU sphere | `public/orb/` |
| `/astro` | EXIF → the sky at the moment of the shot | `public/astro/` |
| `/prism` | live camera through a prismatic cornea | `public/prism/` |
| `/fractal` | photo → orbit-trapped fractal | `public/fractal/` |
| `/juice` | liquid-glass optics lab | `public/juice/` |
| **`/glass`** | **photo → the stained-glass panel of best fit** | `public/glass/` |
| **`/glitch`** | **photo → steerable, reproducible glitch art** | `public/glitch/` |
| **`/lens`** | **photo → conformal warps, with the distortion measured** | `public/lens/` |
| **`/shop`** | **all of the above, in one non-destructive layer stack** | `public/shop/` |
| `/api/img` | same-origin proxy for `*.bsky.app` images (canvas/WebGPU can't read them cross-origin) | `worker.js` |
| `/api/model` | same-origin proxy for the ocrs OCR models used by `/codescan` | `worker.js` |
| `/api/dm/*` | the `/dm` backend | `dm-worker.js` |

Anything under `public/` is copied verbatim into `dist/` by Vite — no build
step, no bundler, plain ES modules. Only `/` and `/dm` are Vite entry points
(`vite.config.js` → `rollupOptions.input`); a new static tool needs **no**
config change, just a directory under `public/`.

**A new tool must be added to [`src/lib/catalogue.js`](src/lib/catalogue.js)**,
or it will exist and be reachable by nobody — which is precisely what happened
to `#/sleuth`, shipped and linked from nowhere for months. `photo.selftest.mjs`
checks that every catalogued static path exists on disk, so the list cannot rot
in the other direction either.

## The React app

`/` is an index, not an app. Every route except the landing is behind
`React.lazy`, because the explorer pulls in DuckDB and the CAR parser, Sleuth
pulls in the LLM client, and CodeScan pulls in an OCR engine — all of which used
to ship to anyone who opened the front page. Each route also gets its own
`ErrorBoundary`: a WASM failure in the explorer must not white-screen the
surface's index.

The pure parts live in `src/lib/` and are proved by `photo.selftest.mjs`:

| File | Holds |
|---|---|
| `lib/catalogue.js` | every tool on the surface — what the landing page renders |
| `lib/cid.js` | blob refs → CIDs. Read the two ordering comments before touching it; both encode a bug that was live |
| `lib/urls.js` | which of the three image sources to use, and the CORS rule for reading pixels |
| `lib/filters.js` | the gallery's filter/sort rules |
| `lib/urlstate.js` | gallery state ↔ the address bar |

```bash
node photo/photo.selftest.mjs
```

**Colour sampling must go through `/api/img`.** `cdn.bsky.app` serves images to
an `<img>` but sends no `access-control-allow-origin`, so a CORS-mode load —
which is what reading pixels back off a canvas requires — fails outright. The
sampler pointed straight at the CDN for months: every extraction failed, the
palette cache stayed empty, and the colour filter silently matched everything
while the app downloaded every thumbnail in the repo to achieve it. Sampling is
now opt-in (a button in the filter bar) and the filter only appears once there
is a palette behind it.

### Third-party code at runtime — a decision, written down

`lib/duckdb.js` imports DuckDB-Wasm from jsdelivr at runtime and `index.html`
maps `apache-arrow` to the same CDN. Neither can carry SRI (there is no
integrity attribute for a dynamic `import()` or an import map), and this origin
holds the `*.mino.mobi` OAuth session cookie.

The decision for now is **accept the dependency, reduce the blast radius**: the
BYOK API key moved from `localStorage` to `sessionStorage`, so a compromised CDN
response can reach one tab's key rather than a permanent one, and the settings
panel says where the key lives. Vendoring DuckDB into `public/vendor/` (as
`ffmpeg` already is) is the real fix and remains open; it is ~30 MB of wasm and
wants its own change.

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
**photo**. Whatever is on screen is what leaves: *copy image* puts it on the
clipboard (`ClipboardItem` gets the blob as a pending promise, because Safari
drops the gesture permission if you await first), *save PNG* / *save SVG* write
a file. `?u=<image url>` loads a picture straight in; `*.bsky.app` URLs are
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
through `?r=<base64url>`, the clipboard, and a `tEXt` chunk inside the *saved*
PNG, so a file found later can still say how it was made. *copy image* puts the
result on the clipboard instead — the browser re-encodes it, so that copy loses
the recipe chunk; the UI says so rather than pretending otherwise.

## `/lens` — conformal warps

Fisheye, funhouse mirrors, Droste spirals and tiny planets, built as functions
of a complex variable. The organising fact: a **holomorphic** map is
*conformal* — near any point it only rotates and scales, never shears — so
angles survive it exactly. And that is measurable.

**K = σ₁/σ₂**, the quasiconformal dilatation (the ratio of the Jacobian's
singular values) is 1 exactly where a map is conformal. Every map declares its
kind and the tool measures whether the claim holds:

| kind | maps | what the measurement shows |
|---|---|---|
| `conformal` | tiny planet (exp), sphere turn, Möbius bulge, power, Droste, spiral, inversion, Joukowsky, holomorphic wave | K = 1 |
| `anticonformal` | kaleidoscope | K = 1, orientation reversed on half the plane |
| `lens` | lens projections, funhouse mirror, pinch, twirl, squeeze | K > 1 — they shear, by construction |

That last row is a small theorem, not a bug: a radial map r ↦ g(r) stretches by
g′(r) along the radius and g(r)/r around it, and those agree only when
g(r) = cr — a plain zoom. **No fisheye and no radial bulge can preserve shape.**
The selftest holds every map to its row, and checks the one projection that
*is* a plain zoom (rectilinear) really does come back K = 1.

| File | Holds |
|---|---|
| `public/lens/js/conformal.js` | the maps, the measurement, the mip sampler, recipes |
| `public/lens/js/worker.js` | keeps the mip pyramid, runs the warp off the main thread |
| `public/lens/js/presets.js` | curated stacks; each is just a recipe |
| `public/lens/js/app.js` | photo, canvas, stack editor, the two measurement views |
| `lens.selftest.mjs` | the taxonomy, known answers, and the plumbing — **run before touching `conformal.js`** |

```bash
node photo/lens.selftest.mjs
```

Adding a map: one entry in `MAPS` with a `params` schema (the UI builds its
controls from it), a `kind`, and `pull(x, y, P, out)` — the **pullback**, i.e.
where an output point reads from, which is the inverse of the visual transform.
The selftest picks it up automatically and will fail it if the measured
dilatation contradicts the declared kind, so a map cannot quietly claim to be
conformal.

Two things worth preserving:

- **The measurement is not taken from the rendered field.** Differencing over
  whole pixels folds the map's curvature into the answer and reports shear that
  isn't there (a sphere rotation came out at K = 1.13 that way). `measure()`
  evaluates the composed map at ±¼ pixel on a coarse grid instead. `scaleOf()`
  keeps the cheap neighbour differences, which is exactly right for its job —
  choosing a mip level.
- **Mip filtering is correct here for a reason.** When σ₁ = σ₂ the filter
  footprint is a circle, so an isotropic mip lookup is the right answer and no
  anisotropic filtering is needed — which is why the Droste rings and planet
  horizons resolve instead of boiling.

Where a map moves more than ~64 source pixels per output pixel, or jumps a
branch seam, the estimate stops meaning anything; those samples are reported as
*beyond measurement* rather than averaged in, and `worstK` is quoted next to the
99th percentile because a single seam pixel would otherwise own it.

## `/shop` — the workbench the other four feed

A layered editor. The wing of standalone toys above each do one thing to a
whole photograph; `/shop` is where they become **one stack of manipulations
over a stack of layers**, with the classic tools around them: lasso and wand
selections, layer masks, blend modes, brushes, undo.

The organising claim, and the thing to preserve:

- **Every manipulation is one entry with one contract.**
  `apply(src, out, W, H, P, ctx)` — read `src`, write `out`, **never blend for
  itself**. The stack blends the result back through a mask. That single rule is
  why a levels adjustment, a Droste warp and a pixel sort compose in any order,
  and why the selftest can hold all 57 to the same standard by iterating the
  registry rather than listing it.
- **Where is separate from what** — inherited wholesale from `/glitch`. Every
  entry carries a *field* (brightness, edges, bands, radial, noise, or a
  selection you drew) and outside it the source survives **byte for byte**.
  Selections, layer masks, brush strokes and effect fields are all the same
  Float32 mask in 0..1, which is why a lasso can gate a conformal warp with no
  adapter in between.
- **Nothing is destructive.** The stack is applied on the way to the screen and
  never to the stored pixels, so any parameter stays editable forever.
  `flatten` exists, and is the only operation that gives that up.

**`/glitch`, `/lens` and `/glass` are imported, not copied.**
`js/core/registry.js` wraps `OPS`, `MAPS` and `stainedGlass` where they live.
Add a map to `/lens` and it appears here on the next reload; fix an operator in
`/glitch` and this changes with it. Don't "sync" them — there is nothing to sync.

| File | Holds |
|---|---|
| `public/shop/js/core/pixels.js` | colour, 22 blend modes, alpha compositing, resampling |
| `public/shop/js/core/select.js` | selections: shapes, lasso, wand, boolean algebra, feather, grow/contract, contours, RLE |
| `public/shop/js/core/adjust.js` | tonal and colour adjustments, incl. the monotone curve LUT |
| `public/shop/js/core/filters.js` | neighbourhood filters: blurs, sharpen, median, kuwahara, halftone, dither… |
| `public/shop/js/core/registry.js` | the one table of all 57 effects, and the three adapters |
| `public/shop/js/core/doc.js` | layers, the stack runner, the composite, serialisation |
| `public/shop/js/core/history.js` | undo/redo, and the copy-on-write rule it depends on |
| `public/shop/js/core/wire.js` | what crosses to the render worker (structure always, buffers only when changed) |
| `public/shop/js/ui/` | viewport, tools, panels, schema-driven controls, file I/O |
| `shop.selftest.mjs` | proves all of the above — **run it before touching `js/core/`** |

```bash
node photo/shop.selftest.mjs
```

Four things it will fail you for, all of which break silently otherwise: an
effect that writes its source, one that leaks outside its mask, one that is
declared neutral at its defaults but is not the exact identity, and an
adjustment layer composited with `compositeOver` (which applies the source-over
alpha rule twice and slowly turns soft edges opaque — see `compositeAdjust`).

Three rules that carry the rest:

- **Layer buffers are always document-sized**, and moving a layer is a
  *transform* resolved at composite time. One coordinate system for masks,
  selections, brushes and fields; the identity transform short-circuits to a
  copy, so an unmoved layer is never resampled.
- **Never mutate a pixel or mask buffer history might hold** — replace it.
  Tools call `beginPixelEdit` once per stroke, then mutate that copy freely.
  Snapshots hold buffers by reference, so this is what keeps undo cheap.
- **No proxy resolution.** A blur radius, a grain size and a halftone cell are
  measured in pixels, so a half-size preview is a different picture. Imports are
  capped at 2400px instead and the composite runs at document resolution in the
  worker: what you see is what leaves.

Adding an effect: register it with a `params` schema and an `apply`. The UI
builds its controls from the schema (number, enum, bool, colour, curve), the
stack gives it masking, strength and seeding, and the selftest picks it up
automatically. No UI change, anywhere.

The recipe — layers, stacks, parameters, masks — round-trips through
`#r=<base64url>` and a `tEXt` chunk in the exported PNG, so a file found later
can still say how it was made. *copy image* cannot carry it: the browser
re-encodes the bitmap and drops unknown chunks, and the UI says so.

## Deploying

Pushes to `claude/image-manipulation-platform-g5puxy` that touch this surface's paths trigger [`.github/workflows/deploy-photo.yml`](../.github/workflows/deploy-photo.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.

The workflow also pushes `MORPHYX_APP_PASSWORD` onto the worker after the deploy
(from the `BLUESKY_MORPHYX_APP_PASSWORD` Actions secret) for `/dm`. That step is
skipped when the secret is absent, so a deploy without it still succeeds and
only `/dm` stops working.
