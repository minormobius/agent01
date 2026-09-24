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

## The face (2026-09-24)

Drawn in the GEOMETRY pass, not painted on after: at every pixel that hits the
head, the shader has the exact 3D point in the head's own frame, projects it
along the head's forward axis to face coordinates (u, v) and evaluates the
features there (`faceAt` in shader.js), writing a material code to a second
render target. So features turn with the head, the head's own shape hides the
far eye (checked: 0 iris pixels in profile), and they inherit the 2× supersample
antialiasing. `lidsAt` and `browFloor` in GLSL are line-for-line `lids` and
`browFloor` in face.js. The checks measure the JS side and the browser selftest
reads back the GLSL side, so change both together.

Faults found and fixed:
- **An angry tsurime brow went into the lash line** (−0.005 heads): the
  expression lowers the brow's inner end, and the lifted eye's inner lid is
  high. Fixed with a constraint: a brow never sits below the lid + a lash + a
  gap. That needs the lid point under each brow point, which on a tilted eye
  means solving for it (4 fixed-point steps), not reading it at the same x.
- **The face was shaded like the body**, with a hard shadow across the cheek.
  Anime keeps a face lit and shades only its far side, so the head group's
  terminator sits past the light's 90°.
- **The cheek dented** where the skull met the jaw: fixed with a cheek mass.

## Masculine and feminine forms (2026-09-24)

`femme`, `bust`, `waist`, `hips` in proportion.js; breasts and glutes in body.js.
The silhouette check (`checkSilhouette`) was written to make "reads as feminine"
a number, and it caught the male figures as well: they had a pinched waist (WHR
0.68, where a real man is ~0.9). They read as male only by their square shoulders
and flat chest. The pinch was between the belly and pelvis masses, below where a
waist belongs, so the masculine belly now reaches down to the pelvis, and the
feminine one stays short so its pinch sits at the natural waist. Two more fixes
came out of it:
- A wide hip's cap (the socket the thigh sits in) runs well down the thigh, and
  the interpenetration check called that a leg through the torso. A limb is now
  measured against the body WITHOUT its own socket (hip cap, deltoid).
- The ink drew a line wherever two groups met at 37°, so every hip looked like
  shorts. Seams are inked only past ~52°.

## Hair (2026-09-24)

hair.js designs it (cap, bangs, sidelocks, back curtain, tails, buns, ahoge),
and buildHair drapes it on the solved pose. It becomes four more groups (`hair`,
`hair_back`, `tail_l`, `tail_r`). A new primitive, CAPPED (an ellipsoid cut by a
plane), gives the hairline. A 7th texel per primitive carries a bounding sphere,
and the shader skips a primitive the ray is far from, so ~150 more primitives
cost little. Lessons:
- **Only a lock's root blends.** Smooth-blending consecutive segments bulges at
  every joint (the union of two overlapping pieces, then some), and the ring
  highlight turned each bulge into a ripple. Segments meet with a hard min;
  locks meet each other hard too, which is where anime draws the lines between
  clumps anyway.
- **Tips end in wedges** (radius ≥ 0.016): a tip thinner than the ink is drawn
  as a black drip.
- **Long hair is a sheet** of flattened ellipsoids behind the locks, or it
  reads as strings.
- **Symmetry again.** The check found four styles off by 0.004–0.07. The causes
  were a twin tail's spread not mirrored, a parted fringe's centre lock pushed to
  one side, a spiky fringe varied by index, and, as with the shoulders, the blend
  order: locks are built centre-outward on both sides. Now exact to 1e-14.
- Hair has no mass: the balance solver leaves it out, or a lopsided fringe
  shifts the pelvis. The body checks measure the body without its hair.

## Necks, legs, masculine faces (2026-09-24, from a look at the cast)

The operator saw overdeveloped traps with no neck, chunky legs, and lumpy
("greebled") limbs, and said not to trust their eye. So each became a
measurement (`checkForm`) before any fix:
- **a neck shows**: from the chin down, how far before the silhouette passes
  1.4× the neck's own diameter. It measured 0.02 heads: the trapezius started at
  the jaw. The neck base sat 0.1 heads too high (the head then hung from it by a
  fixed offset, so it now sits at the chin wherever the neck starts), and the
  trapezius now rises from behind the side of the neck's base. Now 0.2–0.3 heads.
  The bar scales like the neck does (k^0.6), not like the body.
- **legs smooth in outline**: turns in a leg's outer edge, ankle to hip. It
  measured 5–7; a leg has 3 (the calf out, the knee in, the thigh out). The
  extras were the smooth union bulging at every joint, the same lesson as the
  hair. **A limb's segments do not blend**: round cones sharing a sphere already
  meet smoothly. Legs are also ~12% slimmer.
- **a masculine face** follows the body (`masc` = 1 − femme, damped for chibi).
  It SCALES the identity: smaller eyes, a line of lash with no flick, heavier,
  straighter and lower brows, a drawn nose bridge (one-sided on purpose), a wider
  jaw, a blunter chin and an Adam's apple.

## Not done yet (the next layers)

Hair
as locks with spring follow-through, clothing, hands with fingers, and the
predicate → spec generator ("tsurime, twin tails, 6.5 heads"). The head
already carries construction lines: the centre line and the eye line, drawn
on its surface from its own frame, where the features will go.
