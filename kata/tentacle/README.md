# TENTACLE

A muscular hydrostat, an arm with no bones, in 3D (to calibrate your eye) and in 4D. Muscle alone bends, twists and
stretches it, at constant volume. With **physics** on (the default) it has mass, moves through water, can't pass
through itself, and carries **suckers**. And a **knot** tied in it jams in 3D and slips out in 4D.

## What you see

- **3D / 4D**: the same muscles on our arm and on kata's.
- **The skin shows the muscle:**
  - **rings** down the arm for its continuous segmentation;
  - an **orange glow** where the longitudinal fibres contract (on the inside of every bend);
  - **stripes** that spiral as it twists;
  - in 4D, **blue bald lines**, below.
- **In 4D, your slice:** the pad twists it into w (J L, I K), the lever moves it ana and kata (R F), ⊞ or Z squares it
  up. A small view top right draws the whole arm (x, y and z, with w as colour) and shows in gold what your slice holds.
  The readout counts the **pieces** your slice cuts it into.

| preset | what it shows |
|---|---|
| **reach** | a curled arm unrolling base to tip, as an octopus reaches: a bend that travels |
| **writhe** | waves of contraction running down it, the contracting side turning as they go. In 4D the side swings between ana and kata along the arm, so the arm weaves through your slice and you see **separate pieces** that swell, merge and vanish: one smooth arm, cut |
| **coil** | steady bend and twist: a helix. In 4D a second twist comes and goes and the helix winds into w |
| **twist** | the helical muscles alone. In 4D the bald lines show |
| **strike** | the transverse muscles squeeze it thin, and at constant volume thinner is longer: it shoots out |
| **curl / into w** | one side contracting; in 4D the w side, so it curls out of your slice |
| **whip** | only the base flicks; the rest is left slack (low tone). Momentum carries the bend out and the tip outruns the muscles (physics only) |
| **limp** | no muscle, no tone: what's left of gravity takes it, the water slows it (physics only) |
| **knot** | an overhand knot in 5.9 m of arm, its ends pulled apart. 3D: it **jams**. 4D: it **slips out**. **pull** slackens or pulls again, **retie** starts over |

- **physics** (on by default): off, the arm takes the shape its muscles ask for at once, as in v1. On, the readout
  gives the tip's speed and the force the arm puts on the body (the blue arrow, log length).
- **Suckers** run down the underside (−e1, the paler side). In 3D, two staggered rows. In 4D the skin is a 2-sphere, so
  they spiral round a cap of it at the golden angle, and your slice cuts each cup into a smaller cup or misses it. A cup
  is one 2D profile turned round its axis, so in 4D its rim is a 2-sphere's worth, not a ring. They come closer
  together as the arm narrows (one every 0.75 resting radii). **coil** now curls the sucker side inward, as an octopus
  grips.

## The model (`js/rod.js`, no DOM)

**A discrete Cosserat rod.** The arm is 64 segments. A centreline carries a frame, its heading T and the d − 1
directions across, and each segment has strains in its own frame:

| | 3D | 4D |
|---|---|---|
| bend (T toward each direction across) | 2 | 3 |
| twist (the directions across turning among themselves, one per plane) | 1 | 3 |
| stretch | 1 | 1 |
| **strains per segment** | **4** | **7** |

The frame is carried from segment to segment by the exact rotation of those strains, the matrix exponential of the
segment's generator. The centreline steps along the mid-segment tangent.

**The muscles.**
- **Longitudinal fibres** cover the skin all round: a ring of 16 in 3D; in 4D, Lebedev's 26 points on the 2-sphere,
  whose weights integrate polynomials exactly and which are symmetric under every reflection. Their activation is a
  pattern over that skin. Its dipole bends the arm toward the contracting side, b = κ_max ⟨a n⟩(d − 1), and a thinner
  arm bends harder. Its mean shortens it.
- **Transverse fibres** squeeze it. The cross-section is a (d − 1)-ball, so the arm keeps r^(d−1) × length fixed:
  thinner means longer.
- **Helical fibres** twist it, one left- and right-handed pair per plane across.

**The hairy ball theorem.** A twist muscle in plane (i, j) moves the skin point n as n_i e_j − n_j e_i, which is zero
where n_i = n_j = 0:
- **3D: never.** The skin is a circle, and a circle can be combed.
- **4D: two opposite poles.** The skin is a 2-sphere, so each of the three twist muscles has **two bald lines** down the
  arm where it can't twist. The **twist** preset turns the skin in the x–w plane, so its poles point along z, where your
  slice can see them. A twist in the x–z plane would put them along w, out of sight.

## The physics (`js/dyn.js`, `js/arm.js`, no DOM)

rod.js says what shape the muscles ask for. dyn.js says what the arm actually does: position-based dynamics on the
nodes, each with its share of the flesh (ρ 1050) plus the water it drags along (added mass, C_a = 1). 8 substeps a frame.

- **Muscle**: each window of 5 nodes is pulled toward the shape the muscles ask for there, turned to fit wherever the
  window now is (shape matching). The best-fit rotation is refined one step a substep from the last (Müller's method,
  in d dimensions: the antisymmetric part of A Rᵀ is the torque in every plane at once). A second pull holds the whole
  shape relative to the body; without it the long, slow modes are as soft as a rope's.
- **Tone** sets how hard both pull. A hydrostat is only as stiff as its muscles are tense: resting tone 0.4, more where
  it contracts, a slack end for the whip, none at all for limp.
- **Water**: quadratic drag per node, across the arm ~20× along it, applied implicitly (it slows, never reverses).
  Flesh is 5% denser than water, so 0.47 m/s² of gravity is left.
- **Contact**: segment against segment, closest points in d dimensions, pushed apart to the sum of the radii.
- **The force on the body** is the drag on the arm minus the rate of change of the arm's momentum.
- The frames the shader needs ride along: each window's rotation applied to the frame the muscles asked for, then
  turned the least amount onto the true tangent, so the twist the muscles made is kept.

Slow motions (writhe, coil) track their shape closely. The fast ones (strike, whip, reach curling back) lag and
overshoot. In 4D the force units are 4D ones (the masses are per extra metre); compare them with each other, not with
3D.

## The knot

An overhand knot: the trefoil (sin t + 2 sin 2t, cos t − 2 cos 2t, −sin 3t) opened at its outer lobe, strands 2.2
radii apart, tails straight out. 117 nodes, 7 cm radius, 5.9 m. It settles for 1.2 s, then its ends are pulled apart
along x, the pull rising to 16 N over 3 s. The rope's tone is 0.1: it bends easily.

- **3D: it jams.** The strands press on one another and every push is back along the line between them. Its ends stop
  at ~70–75% of its length: the knot eats the rest.
- **4D: it slips out.** Where two strands press there's a fourth direction to give way along. The rope starts with a
  wobble in w of about 1 cm (a real rope is never exactly in a 3-space); the contact pushes have a w part, the strands slide
  past each other through w, and it pulls straight in about 2 s.
- **The control: 4D, held exactly in w = 0, no wobble.** Every push stays in that 3-space, nothing moves it out, and it
  jams as in 3D. It's the fourth direction that unties it.

This is why knots need two more dimensions than the thing tied: a string in 3D, a sheet in 4D. A 4D horror that wants
to hold you needs **webbing**.

**Not yet:**
- **One arm.** Many arms on a body, and (in 4D) the webbing, come later.
- **Suckers don't grip.** They're shape and colour; nothing sticks to them yet.
- **The body is anchored.** The arm pushes it (the arrow) but it doesn't move.

## Testing

```bash
node kata/tentacle/test/tentacle.selftest.mjs   # ~1 s
node kata/tentacle/test/dyn.selftest.mjs        # ~30 s
```

It checks:
- **The rod:** a steady bend is a circle, in 3D and 4D; bend and twist is a helix with constant turning and winding.
  Frames stay orthonormal.
- **The muscles:** one side contracting curls the arm that way and no other, and shortens it. Squeezing it thin
  lengthens it, keeping every segment's volume.
- **The hairy ball:** the 3D twist field never vanishes on the ring; each 4D one vanishes at exactly two opposite poles.
- **Pieces:** the writhing 4D arm is cut by a slice through its base into 3 separate pieces.
- **The dynamics** (`dyn.selftest.mjs`):
  - shape matching finds a 4D rotation in two planes at once, and leaves a rod already in shape where it is;
  - the least turn maps a onto b and leaves the rest of 4D alone;
  - the knot exactly as the page runs it: 3D jams (ends 60–85% of the length apart) without ever passing through itself
    (closest approach ≥ 0.97 of the thickness); 4D slips out (> 97%); 4D held in w = 0 jams;
  - tone holds the arm up to within 3 cm against gravity, limp it falls, and the whip's tip outruns the muscles' own
    tip speed by more than 1.3×.
