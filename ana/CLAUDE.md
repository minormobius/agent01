# ana — ana.mino.mobi

Four-dimensional widgets: small instruments for looking ana and kata (Hinton's words for the two ways along the
fourth direction of space). Each widget is one object or idea in 4D that you turn, slice and read numbers off, with
its 2D and 3D versions beside it. A landing page and its widgets. The first is **HILBERT⁴**, the Hilbert curve on the
unit tesseract.

## Facts

| | |
|---|---|
| Surface | `ana` |
| Dir | `ana/` |
| Endpoint | `ana.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/epic-mayer-y28tpl` |
| Deploy | `.github/workflows/deploy-ana.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "ana"`.

## How it works

One static site: no build, no worker script, no bindings (worker `ana`, assets only, on the plain route
`ana.mino.mobi/*`). `.assetsignore` keeps this file, the tests and `wrangler.jsonc` out of the upload.

- **the landing at `/`**: `index.html`, self-contained (inline CSS), one card per widget. When a widget ships, it gets
  a card here, an entry in `../catalogue.json` (`p: "ana"`, `surface: "ana"`), and a bullet below.
- **HILBERT⁴ at `/hilbert/`**: the Hilbert curve in 2, 3 or 4 dimensions, order 1 up to 2²⁰ cells, drawn as
  **hypertubes** (every point within a radius of the path, in 4D; the radius is the panel's first slider, in cells).
  `js/hilbert.js` (no DOM) is Skilling's construction (*Programming the Hilbert curve*, 2004): index ↔ cell by a Gray
  decode and one sweep of reflections and exchanges, any n, plain bit ops (n·b ≤ 30, enforced). Also the 4D view
  maths (six-plane rotations, `turn4` re-orthonormalised each call, the n-cube's frame), and the slice's walk:
  `cellLinks` (one word a cell: `h << 8 | prev << 4 | next`, direction codes 2·axis + sign, 15 none), `hitHalf` (ray
  against the capsule body from a cell's centre to a face and the ball at the centre) and `traceTubes` (4D
  Amanatides–Woo through the grid). Padded axes (n < 4) are one cell spanning [0, 1], the curve sitting at 0.5.
  `js/main.js` draws two views of one frame (the rotation `S.R`, unit tesseract → your axes, and `S.w0`):
  - **shadow**: instanced quads as wide as the tube is at its depth (radius × perspective), round-capped and shaded in
    the fragment shader, which also pushes `gl_FragDepth` toward you by the bulge so crossing tubes cut into each
    other. Under ~1.8 px it draws a `LINE_STRIP` from the same buffer (the quads choked software GL at order 5).
    4D→3D perspective with the eye at w = 4. An optional band lights |w − w₀| < thickness (two passes).
  - **slice**: a full-screen fragment shader, the twin of `traceTubes` line for line (keep them in step: the selftest
    checks the JS against brute force, not the GLSL). Links in an R32UI texture 1024 wide. Rendered at dpr ≤ 1.5.
  - **the pad and lever** are kata's (WAVELAB's markup and spring-back rate control): pad x/y turn `S.R` in the xw/yw
    planes at up to 35°/s, the lever moves w₀ at up to 0.6/s (the tesseract is 2 across on your axes). Keys J L I K,
    R F, Z squares up (rotation with no w-plane angles, w₀ = 0), V swaps the view.
  See [`hilbert/README.md`](hilbert/README.md).
- **MANDELBRACT at `/mandelbract/`**: the Mandelbrot set in 4D, four ways (`js/fractal.js`, no DOM, explains why
  there are four): `cz` (z → z² + c with c and z₀ both free; z₀ = 0 is M, c = const its Julia set; unbounded, as
  thinning dust past c = −2), `bicomplex` (M × M through the idempotent basis), `quaternion` (M spun round its real
  axis) and `bulb` (hyperspherical power-n). Each has an escape test and a distance estimate; `march` sphere-traces
  by them (step 0.6 × estimate). `js/main.js` is one full-screen fragment shader, the twin of fractal.js formula for
  formula: **solid** (your 3D slice, sphere-traced inside a ball of radius 2.6 view units; the gradient's fourth
  component, out of the slice, colours "by w") and **plane** (the 2D slice through the middle of your view; squared up
  on cz it's the Mandelbrot set). **Cut open** drops the half toward you, the cut face being that plane. Frame:
  `S.R` (rows = your x, y, z, w in the set's axes), `S.ctr`, `S.size` (set units per view unit), `S.w0`, `S.zoom`.
  Draws only when something changed, at half resolution while moving, then once sharp (dpr ≤ 1.5). Double-tap runs
  fractal.js's `march` on the CPU to find the point and flies there. Single precision: it breaks up past ~10⁴×.
  **Zoom**: iterations rise 30 per factor of ten unless "more as you zoom in" is off (`itersNow`, cap 512, the
  shader's loop bound); zoom stops at 2·10⁴; the lever's rate is divided by the zoom; every zoom goes through
  `setZoom`. **The link**: the view lives in the address hash (`toHash`/`fromHash`, saved on each sharp frame).
  **Tan Lei's twist** (cz only): `tangent` gives A = ∂zₙ/∂c, B = ∂zₙ/∂z₀ at the centre (stopped once |B| > 10¹²:
  rescaling A mid-run without rescaling its +1 gave a wrong ratio at c = i, so don't), `twistFrame(θ, φ)` the plane
  δc = cos θ·t, δz₀ = sin θ·t turned by φ, `hold` the φ and zoom that undo K(θ) = A cos θ + B sin θ. `S.tl` anchors
  a twist (A, B, φ₀, zoomRef); anything that moves the centre or turns the frame another way clears it. Four
  Misiurewicz points (`MISIUREWICZ`) are buttons; the selftest holds each to Tan Lei (IoU ≥ 0.95 held, < 0.6 not).
  **It imports `rotation4` and `turn4` from `../../hilbert/js/hilbert.js`** (same site, not a copy), so a change there
  runs both selftests. See [`mandelbract/README.md`](mandelbract/README.md).

## Checks

```bash
node ana/hilbert/test/hilbert.selftest.mjs           # ~5 s: every cell once, face-neighbour steps, corners, inverse, nesting, the slice's walk vs brute force
node ana/mandelbract/test/mandelbract.selftest.mjs   # <1 s: each set against its claim, the estimates safe to march by, the march stops on the edge, Tan Lei
```

Preflight finds every `*.selftest.mjs` and runs the ones under changed directories.

## Conventions (shared with four and kata, not code)

- Dark page, the site's ice → violet → rose → gold gradient; **teal is ana (+w), rose is kata (−w)**.
- Layout: **on a phone the view is the top two thirds and the controls scroll in the bottom third** (the page itself
  never scrolls); side by side from 980 px.
- 4D navigation is kata's: a spring-back **twist pad** bottom left (turns your slice into w) and an **ana/kata lever**
  bottom right (moves it along w), on the view, with the same keys.
- Each widget: `index.html`, `css/`, `js/<name>.js` (no DOM, the maths), `js/main.js` (the page), `test/` (node
  selftest of every claim the page makes), `README.md`.
- No imports across surfaces: a site can't import from another host's directory. If a widget needs four's or kata's
  code, copy it byte-identically and make the selftest check the copy, as kata does with `foam.js`.
