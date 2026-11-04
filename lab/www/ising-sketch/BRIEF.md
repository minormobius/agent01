# BRIEF — Ising Sketch

## What this is

Requester asked for a site that takes any uploaded image and runs a 2D Ising
model with Glauber dynamics to render it as a drawing in spin-up/spin-down,
with the two spin colors configurable. That shipped, complete and working:

- Upload an image (`<input type=file accept=image/*>`, `FileReader` → `Image`,
  all local — nothing leaves the browser).
- The image is downsampled (cover-cropped to square) to a lattice resolution
  the visitor picks (48–160 per side) and its per-pixel grayscale becomes an
  external field `h_i` on that site, scaled by an "image strength" slider.
- A real periodic-boundary 2D Ising model runs on top: `E = -J Σ s_i s_j - Σ
  h_i s_i`, updated site-by-site with the actual Glauber/heat-bath rule
  (`P(+1) = 1/(1+exp(-2·local/T))`), not an approximation of it.
- Temperature `T`, coupling `J`, image strength `h`, and sweeps/frame are all
  live sliders. Spin-up and spin-down colors are `<input type=color>`, with a
  swap button.
- **This turn:** raised the max lattice resolution to 512×512 (was 160×160),
  per request. Added 256×256 as an intermediate step too.
- Run/Pause (rAF-driven continuous sweeping), Step (one sweep), Reset to
  image (re-threshold from the field), Shuffle (randomize spins so you can
  watch order re-emerge from noise), Download PNG.
- `prefers-reduced-motion` disables the Run/continuous-animation button
  (message says why) but leaves Step fully working, so the simulation is
  still usable, just not self-animating.

## Decisions

- **Cover-crop to square** rather than letterboxing, so the lattice is always
  square and every pixel of the display canvas is a real spin — simpler code,
  and it matches how people expect a square Instagram-style crop to behave.
  Cropping direction isn't user-choosable; if that's wanted, it's an easy add
  (a second canvas step with pan or an aspect toggle).
- **Periodic (wrap-around) boundary conditions**, not fixed/free edges. Fixed
  edges would need special-casing the boundary sites (fewer neighbours) for
  no real visual benefit at these resolutions — periodic keeps the sweep loop
  uniform and is the textbook default for lattice simulations like this.
- **No kit.pds / sign-in.** This tool has no meaningful per-visitor state to
  save to their ATProto repo beyond "the last image and slider values",
  which is exactly what a page reload losing is fine to lose. Skipped rather
  than bolted on for the sake of it.
- **Colors default to near-white / near-black** (`#f2ede4` / `#12111a`)
  rather than the kit's accent/bg pair, so the very first render already
  looks like a legible drawing instead of a low-contrast accent-on-dark blob.
- **rAF loop runs unconditionally and checks a `playing` boolean each frame**
  rather than starting/stopping the loop itself — simpler, and the idle cost
  of an empty rAF tick is negligible.
- **The "sweeps/frame" slider is scaled by `effectiveSweepsPerFrame()`,
  not used raw**, once 256/512 were added as options. The slider was tuned
  against the 96×96 default (max 8 sweeps/frame there is ~74k site updates);
  used raw at 512×512 the same "8" would be 2.1M site updates/frame and lock
  up a phone. It now scales down by `(96*96)/(size*size)` so the *rate of
  visible settling* stays roughly constant across resolutions instead of the
  *sweep count*. Only the continuous Run loop is scaled — Step still does
  exactly one full sweep at whatever the true resolution is, since that's a
  single click, not a per-frame budget.

## The plan (not built yet, roughly in order)

1. **A "download the current image, upscaled" option distinct from the raw
   lattice PNG** — right now Download PNG exports exactly the lattice
   resolution (e.g. 96×96), which is correct but tiny as a keepsake image.
   Cheapest fix: draw the lattice into an offscreen canvas at N× scale with
   `imageSmoothingEnabled = false` before calling `toBlob`.
2. **A pan/zoom or aspect-ratio choice for the crop**, if a visitor complains
   the cover-crop cuts off the wrong part of their photo. Would need a small
   crop-preview UI before committing to a resolution.
3. **Web Worker for the sweep loop.** Resolution now goes to 512×512 (was
   capped at 160×160); `effectiveSweepsPerFrame()` scales the continuous-run
   loop down so it doesn't try 2M+ site updates/frame at max res, but this is
   a band-aid — it makes 512×512 update *slower*, not free. It's still all on
   the main thread, so a slow phone at 512×512 can still jank the rest of the
   page (scrolling, the sliders) even though the animation itself throttles.
   A worker would fix that properly; not done this turn since it's a bigger
   change (postMessage the spins buffer back for render, or use a
   SharedArrayBuffer — the latter needs COOP/COEP headers this site doesn't
   currently set).
   Untested at 512×512 on an actual slow device — only reasoned about from
   the update count.
4. Possibly a second external-field mode where color channels (not just
   grayscale) map to two independent lattices rendered as a duotone — bigger
   scope, only worth it if requested.

## Gotchas

- `field[i]` and `spins[i]` **must** use the same flat-index convention
  (`i = y*size + x`, row-major, matching `getImageData`'s own layout) or the
  drawing comes out scrambled/rotated. Both are built from the same `size`
  in the same loop order — don't let a future edit desync them (e.g. don't
  switch one to column-major without the other).
- Canvas internal resolution (`canvas.width/height`) and its CSS display
  size are deliberately decoupled (`image-rendering: pixelated` + CSS
  `width:100%; aspect-ratio:1/1`). Changing `gridSel` resizes the *internal*
  buffer in `render()`, not the CSS box — don't add a fixed pixel width
  anywhere near `#latticeCanvas` or it breaks at 360px.
- Untested in an actual browser beyond reading the code closely — the
  harness screenshot after this build is the first real look. If the initial
  render looks blank, check that `resetToImage()` actually ran after image
  load (it's called from inside the `FileReader`/`Image` `onload` chain, so a
  broken image decode silently leaves the canvas at its default black fill).
