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

## Checks

```bash
node ana/hilbert/test/hilbert.selftest.mjs   # ~5 s: every cell once, face-neighbour steps, corners, inverse, nesting, the slice's walk vs brute force
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
