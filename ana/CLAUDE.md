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
- **HILBERT⁴ at `/hilbert/`**: the Hilbert curve in 2, 3 or 4 dimensions, order 1 up to 2²⁰ cells. `js/hilbert.js` (no
  DOM) is Skilling's construction (*Programming the Hilbert curve*, 2004): index ↔ cell by a Gray decode and one sweep
  of reflections and exchanges, any n, plain bit ops (n·b ≤ 30, enforced). Also the 4D view maths: six-plane
  rotations, `turn4` (re-orthonormalised each call), the n-cube's corners and edges. `js/main.js` draws it in WebGL2:
  each segment an instanced quad widened in screen space; when that width would be under ~1.8 px (the fine orders) it
  draws a `LINE_STRIP` from the same buffer instead, a quarter of the vertices (the quads choked software GL at order
  5). The 4D turn, the 4D→3D perspective (eye at w = 4) and the 3D perspective happen in the vertex shader. The slice
  is two passes: outside |w − w₀| < thickness faint and undepth-tested, inside opaque and depth-tested. See
  [`hilbert/README.md`](hilbert/README.md).

## Checks

```bash
node ana/hilbert/test/hilbert.selftest.mjs   # ~4 s: every cell once, face-neighbour steps, corners, inverse, nesting
```

Preflight finds every `*.selftest.mjs` and runs the ones under changed directories.

## Conventions (shared with four and kata, not code)

- Dark page, the site's ice → violet → rose → gold gradient; **teal is ana (+w), rose is kata (−w)**.
- Layout: the view on top (62svh), controls below on a phone; side by side from 980 px.
- Each widget: `index.html`, `css/`, `js/<name>.js` (no DOM, the maths), `js/main.js` (the page), `test/` (node
  selftest of every claim the page makes), `README.md`.
- No imports across surfaces: a site can't import from another host's directory. If a widget needs four's or kata's
  code, copy it byte-identically and make the selftest check the copy, as kata does with `foam.js`.
