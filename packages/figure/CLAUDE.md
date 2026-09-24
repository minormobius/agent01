# packages/figure — the character rig

What it is and how to use it: `SKILL.md` (the loop) and `README.md` (the spec
and the modules). This file is what you need before changing it.

## The design, in four decisions

1. **Head units.** One unit is one head height. Proportions are what
   character design argues about, and in head units they are just numbers:
   `heads`, and joint heights as fractions of the body below the chin. The
   7-head reference is the figure-drawing book's (knee 1.9, crotch ~3.5,
   fingertips to mid-thigh), and `figure.selftest.mjs` holds it there.
2. **Poses are intent.** A foot is planted by its contact point, a hand is
   placed on the body's surface, and solvers (`settle.js`) make that true for
   whatever body it is. Raw-number poses fit one body. The checks ran five
   bodies against the same poses, which is how this was found out.
3. **One body, measured and drawn.** `body.js`'s primitive list is packed for
   the GPU AND evaluated in JS by the checks. `browser.selftest.mjs` reads back
   the geometry pass and compares it with JS ray-casting (IoU 0.999). If you
   change a distance function, change it in both `body.js` and `shader.js`.
4. **Groups.** Smooth blending within a group (shoulder into arm), hard union
   between groups (an arm against the hip stays an arm). Ink lines come from
   the geometry pass: silhouette, overlaps (depth jumps), and folds where two
   groups meet at an angle. Seams where groups merge flat get no line.

## Faults the checks found, and what fixed them (2026-09-24)

- **A rigid foot pivoting on its ball drove its toes 0.09 heads into the
  floor** at push-off. Fixed with toes that bend at the ball (`rig.js`,
  `toeBend`): with the heel up, the toes stay flat.
- **The left shoulder differed from the right by 0.006.** A smooth minimum
  is not associative, and the torso listed its left parts first. Fixed: the
  centre parts blend first, then each side blends onto the centre separately,
  and the two are united (`side` on each primitive; same in the shader).
- **The pelvis path had corners**: troughs where support passes from one leg
  to the other, peaks where a pivot changes. Fixed with a morphological
  opening of the reach limit (erode with curvature 2a, dilate with 4a), which
  never rises above what the legs can reach. Vertical acceleration is bounded
  by 4a = 16 heads/s² (about 0.5 g, the peak for real walking).
- **Hands meant to rest sank in**: a hand on the hip went 0.2 heads into it,
  and fingers on a knee curled into the kneecap. Fixed: `handOn` finds the
  surface, `seatHand` pushes the hand out by the measured depth, and placed
  hands barely curl.
- **Tall figures got wider as they got taller**, so "fashion" looked heavy.
  Widths follow build, not the head count.
- **The chibi's feet were long for its legs**, so it scuffed or over-bent
  its knees. Foot length now scales with k^0.8, and the step with leg length.

## Not done yet (the next layers)

The face (eyes, brows, mouth on the turning head: the anime predicates), hair
as locks with spring follow-through, clothing, hands with fingers, and the
predicate → spec generator ("tsurime, twin tails, 6.5 heads"). The head
already carries construction lines: the centre line and the eye line, drawn
on its surface from its own frame, where the features will go.
