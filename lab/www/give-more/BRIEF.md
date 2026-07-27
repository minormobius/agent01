# give-more — melting clocks in 3D

## What this is

A single-page toy at `minomobi.com/give-more/`: three surreal, Dalí-style
melting clocks rendered in real-time 3D in the browser. One is draped over the
front edge of a table (the iconic "Persistence of Memory" pose), one sits
mostly flat and less melted, one floats impossibly in the sky. Hour and minute
hands read the visitor's actual system clock — this is a working clock, not
just an animation — while the faces and hands sag and drip according to a
sine-based melt function the visitor can crank up or down.

## What was asked

The request (relayed from a Bluesky thread, paraphrased in the dispatch): "give
me more clock tools weird clocks melting clocks and do it in 3js." No prior
`give-more` site existed — this is the first build for this tenant name, and
there was no earlier "clock tools" site in the repo to extend, despite the
"more" in the name/request. Treated it as a request for a fresh, richer clock
toy, in 3D, styled after melting/surreal clocks specifically.

## The three.js decision

The lab's hard rule is one self-contained `index.html`, inline CSS/JS, **no
external dependencies, no CDN**. Actual three.js (a multi-hundred-KB library)
cannot be fetched from a CDN under that constraint, and inlining a full copy
by hand isn't practical or something to reimplement. So instead of the
literal library, this ships a small hand-rolled WebGL renderer: a ~60-line
column-major `mat4` helper set (perspective, lookAt, multiply — verified
against the standard glMatrix formulas by hand since there's no way to unit
test this in the sandbox), plus geometry built directly in JS every frame
(no persistent VBO topology reuse — the whole point-cloud is small, ~700
vertices, so simplicity won over the marginal performance win of caching
static index buffers).

The page's own footer is upfront about this substitution so nobody mistakes
the hand-rolled bit for the real library.

## Key implementation choices

- **Melt is CPU-side per vertex, not a shader.** Each clock face is a polar
  grid (5 rings × 28 segments); its vertices droop via
  `meltDrop(clock, radiusFraction, angle, t)`, a sine wave scaled by
  `radiusFraction^2.2` (center stays put, rim droops most) plus an extra
  quadratic sag for any part of a clock hanging past the table's edge
  (`drapeEdge`), imitating a hanging cloth/catenary. Lighting is also baked
  per-vertex in JS (central-difference normals off the same grid, one fixed
  light direction, Lambertian) and passed to the shader as a plain color
  attribute — the GLSL itself only ever does `gl_Position = uVP * position`
  and outputs a passed-through color. This was deliberate: with no way to
  visually test in this sandbox, keeping all the math in inspectable,
  step-through-able JS was worth far more than shader-side elegance.
- **Backface culling is disabled globally.** Given I can't render this to
  check winding order, `gl.disable(gl.CULL_FACE)` removes an entire class of
  "invisible triangle" bugs at negligible cost for a scene this small.
- **No Bluesky calls at all.** Nothing about this request names a Bluesky
  subject — no handle, no post, no profile — so `kit.bskyGet` is unused. The
  only kit dependency is `tokens.css` (palette/controls) and `kit.crumb` /
  `kit.showError` for the breadcrumb and the "no WebGL" fallback message.
- **"give me more" button.** Doubles as the literal answer to the request
  name: it reshuffles clock colors, melt-intensity variance, phase offsets,
  and the floating clock's position, so a visitor asking for "more" gets a
  fresh composition without a reload.
- Camera orbits automatically and accepts drag-to-look; melt amount and drip
  speed are both sliders, decoupled from the real-time hands so the clocks
  stay honest about the actual time even while the surreal animation runs at
  its own pace.

## What's open / unverified

- **Never rendered.** No Bash/WebFecth/browser in this sandbox — the mat4
  math, the WebGL boilerplate, and the camera framing (distance 7.6, ~45°
  vertical FOV, target near the table) are all reasoned through by hand, not
  seen. If the harness reports a blank canvas or a GLSL compile error, that's
  the first place to look — `kit.showError` will surface any thrown error
  from `startScene()` on the page itself, which should narrow it fast.
- Camera framing was chosen conservatively (zoomed out) to avoid cropping
  since it couldn't be checked visually; it could stand to be tightened once
  someone actually looks at it.
- If a future "give me more" iteration wants literally more clock *variants*
  (a flip clock, a spiral clock, a cuckoo clock) rather than more of the same
  melting style, that's additive: add new shapes to the geometry builders and
  new entries to `makeClocks()`/a variant list — the render loop and controls
  don't need to change.
