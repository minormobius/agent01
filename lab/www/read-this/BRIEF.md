# BRIEF — read-this (seam carving)

## What this is

The requester read Avidan & Shamir's 2007 "Seam Carving for Content-Aware
Image Resizing" paper a while back and wanted a working implementation, and
asked whether I could actually read the linked dl.acm.org PDF. I could not —
this sandbox has no network tools, no WebFetch, no bash, nothing that reaches
the internet. So I did not open the PDF; I implemented the algorithm the
paper is known for from general knowledge (it's one of the most widely
documented image-processing papers there is — Wikipedia, the Princeton course
assignment it's often taught through, etc. all describe the same energy
function and DP recurrence). Said so plainly in NOTE.txt rather than implying
I'd read the actual paper.

Shipped: a single-file client-side seam carver. Upload/drop an image, it's
downscaled to fit within 480px on the long side (kept small so the DP stays
interactive — see GOTCHAS), you pick a target width% and height% via sliders,
hit carve, and watch it narrow seam-by-seam with a progress bar. There's an
energy-map toggle so you can see what the algorithm considers "boring" before
you carve. Download button saves the result as a PNG.

## Decisions

- **Removal only, no insertion (enlarging).** The paper covers both, but
  insertion needs the two-pass approach (find the first k seams on a scratch
  copy without actually removing them, record their original-image indices,
  then insert all k back into the untouched original in the right order so
  they don't all cluster in one place). That's real additional work, not a
  small extension of what's here, and I ran out of turn before starting it.
  The slider only goes down (40%–100%) for that reason — it's not hidden,
  the UI just doesn't offer what isn't built.
- **Downscale to 480px max dimension before carving, always, silently (with
  a caption noting it happened).** Full-res photos (2000px+) would make the
  DP genuinely slow — it's O(w×h) recomputed from scratch per seam, no
  incremental energy update — and this is a single-threaded main-thread loop
  with no Worker. 480px keeps a few hundred seam removals to single-digit
  seconds. See GOTCHAS for why it's not using a Worker already.
- **No Bluesky/atproto anything.** This is a pure image-processing tool, no
  handle needed, nothing to look up. Deliberately skipped kit.handleInput —
  there's no handle field on this page at all.
- **One seam per animation frame**, alternating between width and height
  seams proportionally to the two target reductions, rather than doing all
  width seams then all height seams. This was a deliberate choice so both
  dimensions visibly shrink together during the animation instead of the
  image looking oddly stalled on one axis, and it also means either target
  reaching zero mid-carve degrades gracefully into single-axis carving for
  the remainder.

## The plan (next turn, in order)

1. **Seam insertion / enlarging.** This is the natural next feature and the
   paper's other half. Implementation sketch: run the *removal* seam-finder
   k times on a scratch copy, but instead of shrinking the working copy,
   just record each found seam's coordinates *mapped back to original-image
   indices* (each removal shifts later x-coordinates, so track an index
   array alongside the pixels, not just x positions). Then walk the original
   image once, inserting a new pixel next to each recorded seam pixel
   (average of it and its neighbour is the usual approach), all k seams in
   one pass, sorted by column so indices don't drift as you insert. Test on
   a small image by eye first — a broken insertion order is a specific known
   failure mode (seams bunching on one edge) and easy to eyeball.
2. **Move the carve loop to a Worker.** Right now large seam counts (near
   the 60%-reduction end of the sliders) take several seconds of rAF-paced
   main-thread work. It stays responsive because it yields every frame, but
   a Worker would let it run full-speed without frame-budget throttling and
   free up the option to raise MAX_DIM. Not started — no urgency, current
   version is honestly labelled and doesn't hang.
3. **Object removal via a mask** (paint over something, seams are forced
   through it preferentially) is the paper's other headline demo and would
   be a nice addition, but it's a genuinely separate UI (a paint tool) and
   algorithm change (energy penalty in the masked region), not a small add.
   Lowest priority of the three.

## Gotchas

- **The transpose math for horizontal-seam removal is fiddly — I got it
  wrong on the first pass and caught it on re-read before shipping.**
  `transpose(data, w, h)` returns a buffer of width `h`, height `w` (it
  swaps the axes). After `removeVerticalSeam` shrinks that transposed
  buffer's width by one, the buffer you're holding is `(h-1)` wide, `w`
  tall — NOT `h` wide, `(w-1)` tall, which is the intuitive-looking but
  wrong guess. Transposing back needs `transpose(t2, h - 1, w)`. If height
  carving ever produces a corrupted/garbled image again, check this exact
  spot first (`runCarve`'s else-branch) before anything else.
- No fixtures were needed for this build — it makes zero network calls, so
  none of `lab/_kit/fixtures/` applies here. Worth checking `lab-content-gate`
  still passes cleanly given there's no bskyGet usage at all (should be a
  non-issue, but it's the one gate I couldn't run locally).
- Never actually saw this render in a browser — no test tooling in this
  sandbox. If the smoke harness reports a canvas/ImageData issue, start with
  the `new ImageData(new Uint8ClampedArray(origData), dw, dh)` calls; that
  constructor throws if the byte length doesn't exactly match width×height×4,
  and it's called in a few places after array copies.
