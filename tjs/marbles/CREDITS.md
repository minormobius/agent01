# Credits and licence — tjs.mino.mobi/marbles

## Whose idea this is

This bench exists because of **Codetaur** — [@vibe-coded.com](https://bsky.app/profile/vibe-coded.com)
on Bluesky.

- the post that started it: <https://bsky.app/profile/vibe-coded.com/post/3mvhbk3xyh22r>
- the original, running: <https://marbles.vibe-coded.com/>
- the source: <https://github.com/ngwnos/marbles> — MIT, © 2026 ngwnos

Codetaur's brief, in their own words, was to test a parametric modeller by asking
it to *reconstruct Marbleworks maze pieces from reference photos, and then use
them in three.js to make a marble maze builder with Box3D physics*. They did
that, and published the whole thing — including the fitted dimensions — under a
permissive licence.

## What of theirs is in here

**The concept**: a marble-run sandbox built from procedurally generated
Discovery Toys Marbleworks parts, snapped together on the toy's own connector
grid, with the marbles then actually run through it.

**The dimensional reconstruction**, which is the part you cannot get anywhere
else. These numbers are photogrammetry-fitted, not invented, and this bench uses
them unchanged. They are ported from `src/pieces/marbleworks-spec.ts`:

| | |
|---|---|
| vertical grid — rise | 47 mm |
| vertical grid — insertion | 15 mm |
| connector post / male / bore / socket ⌀ | 27 / 24 / 21 / 24.2 mm |
| wall | 1.5 mm |
| channel inside width | 20 mm |
| channel depth | 17 mm |
| trough fillet | 5.5 mm |
| floor-to-floor fall of the accepted standard ramp | 13 mm |
| port span | hypot(138, 24) = 140.0714 mm |

**The port table** — where each piece's connector columns sit in plan, and at
what elevation — is ported from their generated
`src/generated/component-alignment.json` (`PART_PORTS` in
[`marbleworks.js`](marbleworks.js)).

**The assembly rule**: a male post entering a female socket, ports carrying a
gender and an axis, a fit tolerance below the socket's radial clearance. That
model is theirs, from `src/assembly/snapping.ts`.

Their repo carries a `references/` directory of source links, drawings and
modelling notes. If you want to know where the numbers came from, read that,
not this.

## What is ours, and why it exists at all

The original is React + TypeScript + Vite, rendering through three.js
WebGPU/TSL, with **Manifold** generating the part solids and a patched **Box3D**
WebAssembly build doing rigid-body physics. It is a real application with a real
build.

This surface hosts static, build-free pages, and the brief here was *mobile
support*. So this is a re-implementation rather than a port of their code:

- **one static page**, plain three.js from a CDN, no build step, no wasm;
- **swept-trough geometry** generated at load from a U-channel cross-section
  rather than CSG'd solids — ~12 cached geometries for a 90-piece board;
- a **curvilinear marble solver** instead of rigid-body contact: one arclength
  coordinate per marble, accelerated by the textbook rolling-sphere law
  `a = (5/7)·g·sinθ` minus rolling resistance, free-falling 34 mm down each
  connector bore between pieces, integrated at a fixed 240 Hz step;
- a **touch-first builder**: screen-space socket picking with finger-sized
  targets, tap-to-aim then tap-to-place, one-finger orbit, two-finger pinch and
  pan, long-press to remove, a bottom sheet in portrait and a side panel in
  landscape.

No code was copied from `ngwnos/marbles`. What was taken is the numbers and the
assembly model, which are exactly the things their licence grants and their post
was offering.

## What this bench cannot do, that the original can

Worth saying plainly, because the trade is real. A marble constrained to a
centreline cannot jam, cannot pass or strike another marble, cannot rattle
against a trough wall, and cannot fly out of a bend it is taking too fast. There
is no storage tub, no cat's-eye refraction, no fixed-timestep video export, and
the part set here is 12 pieces against their 20.

For any of that, go to [the original](https://marbles.vibe-coded.com/).

## Licence of the reused material

```
MIT License

Copyright (c) 2026 ngwnos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Marbleworks is a Discovery Toys product; this is a fan reconstruction and is not
affiliated with or endorsed by Discovery Toys.
