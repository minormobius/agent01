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

## Clothes (2026-09-24)

clothes.js. A garment piece is a COVER: a body primitive copied into a garment
group (top, bottom, legwear, shoes, accent, collar), inflated by the cloth's
thickness, and cut by up to two clip planes (a new pair of texels per primitive;
any primitive can carry them). Built on the solved pose, a cover cannot miss the
skin it covers. A SKIRT is a new primitive: a flared round cone with pleats round
the hem. It runs past its hem by its own radius and is cut flat, because a round
cone ends in a ball, and the first skirts were balloons. Per pose:
- the axis follows the thighs' mean but tilts at most 25° from hanging down
- the top holds both thighs
- the flare holds them down to the hem, capped at 2× (an A-line)
- a thigh that still leaves the cone gets a DRAPE: skirt-coloured covers over
  the thigh to the hem's reach

Faults the check found, and their fixes:
- **A running knee pierced the skirt**; the fix is the drape.
- **A crouching thigh was sliced by the drape's own hem.** A plane across the
  shin cuts a thigh folded back over it: a hem plane cuts only the bone it lies
  across.
- **The check demanded a mini cover a crouching knee.** For a draped leg, the
  drape's hem defines what should be covered.

90 body × outfit pairs (10 bodies, 9 outfits) over 16 poses each: no skin shows
through. The sailor collar is a flap down the back plus lapels laid on the chest
in segments; one straight lapel ran through the chest's curve.

## Reference, not taste (2026-09-24)

The operator saw the neck overcorrected, haunches like shorts, and a bust that was
one knob, and asked for reference material. `reference/ansur2.mjs` derives
`lib/ansur2.js` from ANSUR II, and the silhouette and form checks now hold bands
from it (5th–95th percentile plus an anime allowance) instead of numbers chosen by eye:
- **The shoulders sat 0.48 heads below the chin**; people: 0.19–0.51, median 0.34.
  The neck fix had dropped them. Now ~0.36 (`shoulderY` from `neckBase`).
- **Feminine WHR was 0.53–0.68**; people 0.76–0.95. The waist and hip factors
  were halved, feminine shoulders narrowed less and deltoids fill with `mass`.
  Every spec now falls within the allowance.
- **Haunches read as shorts** because groups meet hard. The torso and each leg
  now blend at the hip (`HIP_BLEND`, the pelvis's `hk`, in `sdf` and the shader's
  `map`). The glutes sit OUT of that blend (`noHip`, packed as a negative `k`), so
  a fold stays under each cheek. They sit lower and further back, the pelvis's
  back is shallower, and they are close enough that they meet behind it in a
  hard V, which the crease ink draws as the cleft.
- **The bust is `cup` × `lift` × `set`** (r ≈ −0.03 with frame: independent).

The viewer's checks run in a worker (`studio/figure/check-worker.js`), group by
group, and a change terminates a running check instead of queuing behind it. A frame
solves the pose once: the gaze comes from the previous frame's head.

## What the lucky button found (2026-09-24)

The operator scanned random characters and found four faults, all past the checks:
- **The glutes hung under a crouching thigh like a goiter.** They were fixed in the
  pelvis frame. A flexed hip now carries them up and back round the joint (half the
  flexion past 0.3 rad), so they ride over the thigh.
- **A running foot pointed backwards.** For a leg posed by angles, the foot frame
  squared the thigh's forward against the shin, and past 90° of knee bend that
  points back up the thigh. The toes now turn with the shin. New check,
  `toesForward`: with the knee bent, the heel-to-ball line leans to the shin's front
  (the thigh, squared against the shin). It fails on the old code (−0.955).
- **Skin showed under a shirt, under the bust.** The top didn't cover the new lower
  mass, and a part buried in the blend still bulges the skin out past cloth that
  copies only the covered parts. `checkClothes` only ever sampled parts that already
  had a cover, so it could not see this. It now also samples the skin (projected onto
  the actual surface) over every other torso part in a garment's region. Skin fails
  where it lies outside all garments, within 0.06 of a same-group cover, inside that
  cover's hems, with cloth on at least two sides (a hole, not a hem). A garment
  declares what it leaves bare (`bareParts`: a tank's shoulders), and the neck is
  never counted. The same check then found two more:
  - a bent body's hip showing between a tee and its shorts: the top now covers the hip caps
  - a raised arm's shoulder cut bare by the neckline plane: the deltoid cover is no longer clipped by it

  90/90 body × outfit pairs clean.
- **Skirt topology.** A skirt was a solid cone cut flat, so from above its hem was a
  lid, and in a spread crouch the thighs ran out through its sides over a tube. It is
  now a shell (`r[2]` = thickness, `max(d, −d − t)`, in JS and GLSL). Knees spread past
  2.6 × the hip half-width pull the hem up to the knee line, and a panel (a thin
  ellipsoid, with a front edge sagging from knee to knee) spans the thighs. The
  thighs-inside-the-skirt check holds them against the skirt as a solid.

## Hands (2026-09-24)

`lib/hand.js` replaces the mitten (palm + one fingers ellipsoid + a thumb). The design
follows the rest of the package: anatomy in the hand's own units, gestures as intent,
solvers make the intent true for this hand, and checks hold it (`checkHands`). Hands are
built LAST in `buildBody`, after the clothes, so a placed hand can rest on them.

What the new checks found:
- **Fists and points had the thumb sticking straight out.** The thumb's angles were a
  table, and on thicker fingers they ran it through the curled ones, so the fallback
  unbent it. The thumb now has intent too: `onto`, its pad on the middle bone of a closed
  finger, solved by coordinate descent from several starts (one start stalls against the
  fingers).
- **Placed hands floated 0.2–1.0 heads off the knees and hips on half the cast.** Three
  causes stacked:
  - `seatHand` pushed the hand out to clear the FOREARM (dipping into a jacket in a
    crouch). It now measures the hand's parts only.
  - It counted long hair as solid, so hands were pushed out of hip-length hair. Hair is
    soft to it now.
  - A hollow skirt's inside counted as free space, and the hand was also pushed out of
    its own sleeve. Contact scenes now use `solidified` skirts and `notOwnArm`.
  Then fingers aimed along the body under a flared skirt dug into the flare past full
  hyperextension. `handOn` now aims along the clothes, and `seatHand` tips the hand up
  (heel down) when the fingers dig in, rather than lifting the whole hand.
- **A chibi's fat fingers overlapped**: finger radius is capped by the knuckle spacing,
  and the thumb shortens half as much as the fingers.
- **Hands at full-figure scale were black scribbles**: four fingers a few pixels wide
  are eight ink lines. `detail: 'block'` melts alike fingers into one mass (their own
  bones, smooth-unioned at 1.5× a finger's radius). Chained ellipsoids read as beads, and
  clustering by bend alone fused a V sign's fingers; fan is compared too.

## Not done yet (the next layers)

Hair
as locks with spring follow-through, and the predicate → spec generator ("tsurime, twin tails, 6.5 heads"). The head
already carries construction lines: the centre line and the eye line, drawn
on its surface from its own frame, where the features will go.
