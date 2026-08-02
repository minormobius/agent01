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
| `/explore` | the image explorer (repo → CAR → WASM → DuckDB → masonry grid) | `src/components/Explorer.jsx` |
| `/albums` | your own pictures and albums, on your PDS | `src/components/Arena.jsx`, `src/lib/arena.js` |
| ~~`/thread`~~ | **moved to [b.mino.mobi/thread](https://b.mino.mobi/thread/)** — 301 in `worker.js` |
| ~~`/sleuth`~~ | **moved to [b.mino.mobi/sleuth](https://b.mino.mobi/sleuth/)** — 301 in `worker.js` |
| `/codescan` | OCR — pull text off a picture | `src/components/CodeScan.jsx` |
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
| **`/bloom`** | **one seed photo → a growing web of permutations, any of which opens in `/shop`** | `public/bloom/` |
| `/api/img` | same-origin proxy for `*.bsky.app` images (canvas/WebGPU can't read them cross-origin) | `worker.js` |
| `/api/model` | same-origin proxy for the ocrs OCR models used by `/codescan` | `worker.js` |
| `/api/dm/*` | the `/dm` backend | `dm-worker.js` |

Anything under `public/` is copied verbatim into `dist/` by Vite — no build
step, no bundler, plain ES modules. Only `/` and `/dm` are Vite entry points
(`vite.config.js` → `rollupOptions.input`); a new static tool needs **no**
config change, just a directory under `public/`.

### Every picture offers both doors

`shopUrl` and `bloomUrl` (`lib/urls.js`) sit side by side on every picture this
surface shows — the explorer's lightbox and `/albums`'s — because they answer
different questions. **Shop is "I know what I want to do to this"; bloom is "I
don't, show me."** Only shop hung off a picture at first, which made bloom
something you had to already know existed. That is exactly how `#/sleuth`
stayed shipped-and-linked-from-nowhere for months, and `photo.selftest.mjs`
asserts both links for that reason.

The third edge closes the triangle: **`/shop` → `file → grow variations in
/bloom…`**, deliberately a **cul-de-sac**. Bloom seeds from *one* picture, so
what goes over is the composite — what is on screen, flattened — not the
document. There is no way back that keeps your layers, and round-tripping a
stack that bloom would immediately fold into its own would be a worse lie than
a one-way door. Bloom's own *open in /shop* is the way out, and it hands over a
fresh stack rather than yours.

**A new tool must be added to [`src/lib/catalogue.js`](src/lib/catalogue.js)**,
or it will exist and be reachable by nobody — which is precisely what happened
to `#/sleuth`, shipped and linked from nowhere for months. `photo.selftest.mjs`
checks that every catalogued static path exists on disk, so the list cannot rot
in the other direction either.

### Embeds: match on shape, never on name

`extractImages` (`lib/duckdb.js`) and `extractMedia` (`lib/thread.js`) both read
a post's pictures, and both used to name the embed lexicons they knew. When
Bluesky shipped `app.bsky.embed.gallery` — what a post of more than four
pictures becomes — every one of those posts silently vanished from the grid and
from the thread reader. No error: the predicate just matched nothing, and an
account's best posts were missing from its own archive.

The SQL asks for the *shape* instead: any embed carrying an array of entries
with a blob under `.image`, at any of the four paths in `IMAGE_ARRAY_PATHS`
(`images`/`items`, bare or under `media`). The next lexicon needs no change.
The view side still has to name its types, because `#view` suffixes are
load-bearing — and note that `gallery#view` spells its small rendition
`thumbnail` where `images#view` says `thumb`.

## The React app

`/` is an index, not an app. Every route except the landing is behind
`React.lazy`, because the explorer pulls in DuckDB and the CAR parser and
CodeScan pulls in an OCR engine — both of which used to ship to anyone who
opened the front page. Each route also gets its own
`ErrorBoundary`: a WASM failure in the explorer must not white-screen the
surface's index.

### The routes are real paths, and that costs a worker rule

These were fragments — `#/explore`, `#/thread`, … — which meant several
applications hiding behind one URL: the server saw `/` for all of them, none
could be linked to as a place, and every address carried a `#` that told the
reader only that a framework was involved.

They are paths now, and **three files have to agree** or a link silently breaks:

| File | Its part |
|---|---|
| `src/lib/catalogue.js` | `REACT_ROUTES` — the one list. Add a route here. |
| `worker.js` | serves `index.html` for each; a path it doesn't know **404s** |
| `src/App.jsx` | renders each; a path it doesn't know shows the **landing page** |

Both failures are invisible from the other side, so `photo.selftest.mjs` reads
the worker's and the app's source and holds them against the catalogue.

It is an allowlist, not `not_found_handling: single-page-application` — a
catch-all would turn every typo under `/shop/` and `/glass/` into the React app,
which is a worse answer than a 404.

⚠️ **The worker asks `env.ASSETS` for `/`, never `/index.html`.** Static Assets'
default `html_handling` is `auto-trailing-slash`, which answers `/index.html`
with a **307 to `/`** — and a 307 returned from the worker is a redirect the
browser follows, so every route would bounce to the landing page. Same file; one
of the two spellings is a redirect. The selftest asserts the spelling.

**There is no client-side router.** Moving between these tools is a full
navigation on purpose: they are not screens of one app but four heavy
independent programs, and a real navigation frees everything the last one held.
Plain `<a href>`, no interception.

`src/lib/route.js` also rewrites the old fragment URLs, so a shared
`#/explore?u=alice` still lands. Two of them now resolve to a different surface
entirely — see below.

### Two tools left this surface

`/thread` and `/sleuth` read Bluesky **text**. They were never image tools; they
were here because this is where they happened to get written. They live on
`b.mino.mobi` now — the surface whose whole job is the Bluesky tools, and which
was already linking to them here.

What stayed behind is the forwarding:

* `worker.js` **301s** `/thread` and `/sleuth`, query string intact.
* `src/lib/route.js`'s `MOVED` map handles the fragment forms, which a server
  never sees — and **translates the deep links** rather than dropping them:
  `#/thread/<post url>` → `?p=`, `#/sleuth/<handle>` → `?u=`. A redirect that
  loses the thing you were looking at is only half a redirect.

The move was done with `scripts/rehome.mjs` (see `docs/surface-mitosis.md`).
The pure libraries travelled unchanged; the three React components did not —
`b` has no build step, so they were rewritten as plain DOM there. Their
assertions travelled too, into `b/thread/thread.selftest.mjs` and
`b/sleuth/sleuth.selftest.mjs`.

### Explore reads; albums write

The explorer used to be two programs sharing a header: a reader for anyone's
public archive, *and* a private upload-and-curate tool. They wanted different
chrome from the same row — a handle box and filters versus a sign-in and a set
of albums — and neither got a good one. Curation moved to `/albums`
(`Arena.jsx`); `lib/arena.js` holds the record shapes both pages and `/shop`
write.

Three deliberate seams, and nothing else:

* `/explore`'s lightbox can copy any picture it is showing into an album.
* `/shop`'s post dialog can *save to album* instead of posting.
* every picture in `/albums` opens in `/shop`.

**Adding someone's picture copies the bytes.** A blob is scoped to the repo
holding it — your PDS cannot serve a CID it does not have, so a record pointing
at someone else's blob resolves for nobody. `importPicture` downloads the
original from the author's PDS (falling back to the CDN rendition through
`/api/img`) and uploads it into yours. Provenance rides along on the entry
(`source.did`, `source.rkey`, `source.handle`), so an album can always say where
a picture came from and link back to the post.

**The sign-in asks for a narrow scope now.** It used to pass none at all, which
falls back to the union of every collection every mino.mobi site writes — a
consent screen listing forty lexicons to upload a photograph. `ARENA_SCOPE` is
`atproto repo:com.minomobi.arena.image repo:com.minomobi.arena.album
blob:image/*`; both collections were already inside the auth worker's declared
ceiling, so **no change to `workers/auth` was needed**. `/shop` keeps a
different, equally narrow scope for posting and escalates to this one, just in
time, the first time you save to an album.

Uploaded pictures are served by `getBlob` from the owner's PDS, so `/albums`
resolves the signed-in user's PDS endpoint on load. Without it `blobUrl` returns
`''` — which is why every uploaded image rendered as a broken frame until this
page started doing it.

The pure parts live in `src/lib/` and are proved by `photo.selftest.mjs`:

| File | Holds |
|---|---|
| `lib/catalogue.js` | every tool on the surface — what the landing page renders |
| `lib/cid.js` | blob refs → CIDs. Read the two ordering comments before touching it; both encode a bug that was live |
| `lib/route.js` | which page the address bar is asking for, and the legacy-fragment rewrite |
| `lib/arena.js` | album/upload record shapes, the narrow scope, and the copy-a-picture import |
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
| `public/shop/js/core/publish.js` | the pure half of posting: the fit ladder, the record, facet byte offsets |
| `public/shop/js/ui/` | viewport, tools, panels, schema-driven controls, file I/O, the post dialog |
| `public/shop/js/vendor/auth.js` | **a copy** of `packages/oauth-client/auth.js` — see below |
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

### The loop: archive → shop → Bluesky

The two ends of this surface are now joined. Any picture opened in the
explorer's or the thread reader's lightbox has an **open in shop** link, and any
picture in shop can be **posted straight back to Bluesky**.

**Going in.** `lib/urls.js`'s `shopUrl(src, { alt })` builds `/shop/?u=…&alt=…`.
The URL handed over is the *un-proxied* one: shop does its own proxying (it
reads pixels, so it must route `*.bsky.app` through `/api/img` — the CORS rule
above), and handing it a proxied URL would produce `/api/img?u=/api/img?u=…`.
`alt` rides along so a described picture stays described — shop's post dialog
pre-fills from it. Uploads work too: a PDS `getBlob` URL needs no proxy, because
the PDS answers with `access-control-allow-origin: *`.

**Coming out.** *file → post to Bluesky* uploads a blob and writes one
`app.bsky.feed.post`, through the shared OAuth worker's `/pds/*` proxy — the
browser never holds a PDS token. Four things about it:

- **The scope is narrow**: `atproto repo:app.bsky.feed.post blob:image/*`, and
  nothing else. Both tokens are already inside the ceiling
  `workers/auth/src/oauth/scope.ts` declares, so **no auth-worker redeploy is
  needed**; the selftest asserts they are still there, because if they ever
  leave, the only symptom is a redirect that 400s.
- **What posts is not what exports.** Bluesky refuses a blob over 1,000,000
  bytes; shop exports PNG at up to 2400px, which for a photograph is routinely
  6–10 MB. `core/publish.js` walks a bounded ladder — quality first, then size,
  because 2400px at q=0.58 beats 1000px at q=0.92 — and the dialog states what
  the fit cost before anything is sent. A picture with transparency tries PNG
  first and only falls back to JPEG-over-white as a last resort, because JPEG
  has no alpha and would post the holes as black.
- **Signing in costs a navigation, so the whole session travels.** See below —
  this was the single worst bug on the surface and it has its own section.
- **Facet offsets are in bytes.** URLs in the post text get link facets, or they
  post as inert strings. Counting with `String.length` puts the link on the
  wrong span the moment there is an emoji in front of it; the selftest checks
  exactly that case.

### Surviving the OAuth redirect — `?resume=`

⚠️ **A one-shot baton must never be a return address.** This was the worst bug
on the surface, and it was invisible from the code:

`/bloom` hands a local picture to `/shop` as `?seed=<key>`, an IndexedDB baton
that `takeSeed` **deletes as it reads**. The OAuth return URL was built from
`location.href`, so it carried that key forward — and by the time the
authorization server sent the browser back, the blob it named was gone. Every
trip from the archive through bloom to shop to *post* came back to an empty
canvas. Not a rare race: a guaranteed miss, on the exact path a person takes.

Two lifetimes were sharing one URL slot. A baton is read once; a return address
is read after a round trip. `handoff.js` now spells them as different functions
— **`take` deletes, `peek` does not** — so which one a caller wants is a
decision rather than a default.

What travels now is the **whole session**, written to IndexedDB before the
navigation, addressed by one key:

```
/shop/?resume=<key>
```

| Carried | Why |
|---|---|
| the document | layers, their pixels, masks, blend modes, transforms, the effect stack with its parameters and per-effect masks, the live selection — the work, not a description of it |
| the original | what *show original* compares against; first thing dropped if the ceiling is hit |
| zoom and pan | you come back looking at what you left |
| the caption and alt | **you did not click "sign in", you clicked *post*** — so the dialog reopens with your words still in it |

Not carried: **undo history**, deliberately. It holds a snapshot of every
buffer at every step — the document over again per level — and nobody signs in
mid-edit to preserve their ability to undo the edit before last. The dialog
says so before it navigates.

Five rules hold it together, each of which was a bug first:

* **`?resume=` is checked before `?u=` and `?seed=`, and wins outright.**
  Those are how a picture *arrives*; `resumeUrl` strips all of them, so a
  leftover can never re-open an emptier version over the top of the real one.
* **The key is reused across hops.** Signing in and then escalating scope is
  *two* redirects; a fresh key per hop would leave a full-size document in
  storage each time, cleared only by the half-hour sweep.
* **Reading uses `peek`, not `take`** — a reload of the page you just came back
  to has to find it again.
* **Opening a different picture drops the key from the address bar**
  (`forgetResume`), or a reload would silently throw away what you just opened
  in favour of the stale snapshot.
* **A failed write falls back to the old behaviour** — `?u=` plus `#r=<recipe>`
  — rather than refusing the sign-in. Private browsing and denied quotas are
  real; a document past `SESSION_LIMIT` is real. `describeCarry` says which
  case you are in, in the dialog, *before* the click.

`core/session.js` holds all of that as pure functions (what a session is, the
ceiling and what it gives up first, both return-address shapes) so
`shop.selftest.mjs` can hold them to account; `ui/post.js` writes and
`ui/app.js` restores.

**`/albums` and `/dm` do not have this problem** and were checked rather than
assumed: both gate everything behind the sign-in, so it is the first thing you
do and there is no accumulated work to lose.

**`js/vendor/auth.js` is a copy, and copies rot.** `public/` is served verbatim,
so `/shop` cannot import across directories any more than a lab tenant can — the
same hazard `scripts/sync-dataviz.mjs` already exists to manage. It is listed in
that script's `EXTRA` pairs, so `preflight` fails if it drifts. **Edit
`packages/oauth-client/auth.js`, then run `node scripts/sync-dataviz.mjs
--write`.** Never edit the copy.

## `/bloom` — the search half of `/shop`

`/shop` answers "apply this to my picture". `/bloom` answers the question that
comes before it: **which of the fifty-seven, at what settings, aimed where?**
Nobody browses a registry of 57 effects with schema-driven controls to find out
what they want. So this one takes a seed photograph and grows a web: every tile
is its parent plus **one more mutation**, six at a time, and clicking one grows
its own six. You judge with your eyes and open the one that stopped you.

It is a **tool on this surface, not a separate deploy surface**, and that is
forced: the whole explorable space *is* `public/shop/js/core/registry.js`.
Anything outside `photo/` would have to vendor the effects, and a vendored copy
of 57 effects drifts the first time one is fixed. Being here, an effect added to
`/glitch` or `/lens` is in bloom's space on the next reload with no change to
any file.

Four decisions carry it:

- **The address is the path, and a node stores nothing.** `?p=3.0.7` means
  "fourth child, then its first, then its eighth", and the stack there is a
  *fold* from the root — one mutation per step, each seeded by
  `keyFor(root, path)`. So the tree is a pure function of one string: a shared
  link reproduces the whole web bit for bit with nothing on a server. Same RNG
  as `b/lathe` (xmur3 + mulberry32), deliberately.
- **Neutral effects have to be pushed off their neutral point.** Seventeen of
  the 57 are declared `neutral` — exact identities at their defaults, which is
  shop's contract and the right one for an editor. For a generator it is fatal:
  `add` with `defaults()` produces a child pixel-identical to its parent. So
  `energise()` reads the registry's own flag and biases those toward the ends of
  their ranges.
- **Dead branches are rejected by rendering, not by sampling.** Sampling cannot
  know that `filter:bloom` thresholded at 0.9 does nothing to a picture whose
  brightest pixel is 0.78 — that depends on the image. The worker holds the
  parent's pixels, so it compares and **re-rolls with a salted key**. Measured:
  ordering the three range pairs (`lo/hi`, `inLo/inHi`, `outLo/outHi` — sampled
  independently they invert a quarter of the time, and an inverted range selects
  nothing) took it from 8% to 5.8%; the render-time re-roll takes it to 0, at 13
  re-rolls per 200 nodes. **The salt is not part of the address** — it is
  re-derived from the same picture, so `?p=` still reproduces exactly.
- **One branch is open at a time.** A radial tree with every fan open cannot be
  made to fit: give each node a wedge of its parent's and the radius has to grow
  like 6^d. Opening a node folds away every fan not on the way to it; the
  siblings you passed stay as tiles, so the landscape is still there to judge.
  With no cousins the geometry is local and provable — `ringFor` inverts the
  sibling chord so two tiles can never touch, and the selftest walks four rings
  deep and measures the closest pair.

| File | Holds |
|---|---|
| `public/bloom/js/mutate.js` | the grammar: RNG, the parameter sampler, the five moves, the fold |
| `public/bloom/js/tree.js` | where nodes sit, what folds, and the hit test |
| `public/bloom/worker.js` | every thumbnail, off the main thread, with the re-roll |
| `public/bloom/js/app.js` | the canvas, the lineage rail, the door into `/shop` |
| `bloom.selftest.mjs` | determinism, range repair, **dead branches by rendering**, no overlaps |

```bash
node photo/bloom.selftest.mjs
```

**Thumbnails at 168px are the whole performance story.** Shop's effects are
O(pixels) and it composites at up to 2400px; two hundred variations at that size
is not a slow feature but an impossible one. At 168px each render is ~200×
cheaper. The full-resolution version is never made here — that is what handing
the recipe to `/shop` is for.

**The hand-off carries the salts.** The rail and the `#r=` recipe fold with the
salts the *worker actually used*, not with zero. Fold with zero and a re-rolled
tile opens in shop as a different picture from the one that was clicked — which
would look like nothing at all. `doc.seed` is set to the same string the worker
rendered with, so seeded effects land in the same place. The remaining gap is
honest and unavoidable: the tile was 168px and the editor opens at up to 2400,
so anything measured in pixels (a blur radius, a halftone cell) is
proportionally smaller there.

A picture with a URL goes over as `/shop/?u=…#r=…`. One dropped off a local disk
has no URL, so it goes through **`public/shop/js/handoff.js`** — an IndexedDB
baton, written by bloom and *taken* (deleted on read) by shop, swept after 30
minutes. It lives in shop because shop is the hub every tool hands pictures to;
bloom imports it rather than keeping a second copy.

**Pictures arrive here three ways**, all of them tested: the file input or a
drop, `?u=` (a link — `/explore`'s lightbox), and `?seed=` (a blob in
IndexedDB — `/shop`'s composite, which exists only in that tab). The last one
**does not consume the key on read**; see `public/shop/js/handoff.js` for the
two separate bugs that taught us why.

⚠️ **`hidden` loses to any `display` rule.** Both the veil and the stage are
`display: grid`, so the dismissed veil stayed laid over the page — the same
colour as the background, invisible in a screenshot, and swallowing every click
on the web underneath. `[hidden] { display: none !important }` is in the page's
CSS for that reason. A browser caught it; reading the file never would have.

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

**That step can also fail on a run whose deploy succeeded**, with

> Secret edit failed. You attempted to modify a secret, but the latest version
> of your Worker isn't currently deployed.

`wrangler secret put` runs seconds after `wrangler deploy` and loses a race with
the new version. **It is not rare** — three of the five runs on 2026-08-01
failed here, so treat a red photo deploy as *probably* this until the log says
otherwise. (An earlier version of this note called it occasional, on two
data points. It is not.)

The error names the fix — `wrangler versions secret put` — and that is left
undone deliberately: it writes the secret to a version *without* deploying it,
so the secret might never take effect, and a silently-ineffective secret is
worse than a loud red step. Worth a proper pass with somewhere to test it. **Read the log before
believing a red run here** — if `Deploy to Cloudflare` is green and the upload
listed your files, the site shipped; only the secret was left at its previous
value, which is the value it already had. The site is what to check, not the
tick.
