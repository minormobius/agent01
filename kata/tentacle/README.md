# TENTACLE

A muscular hydrostat, an arm with no bones, in 3D (to calibrate your eye) and in 4D. Muscle alone bends, twists and
stretches it, at constant volume.

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

**Not yet:**
- **No dynamics.** The arm takes the shape its muscles give at once. Water drag and momentum are next.
- **One arm.** Many arms on a body, suckers, and (in 4D) the webbing come later. Webbing matters because a curve can't
  be knotted or linked around a line in 4D: a coiled tentacle slips off, so a 4D horror that wants to hold you needs
  membranes.

## Testing

```bash
node kata/tentacle/test/tentacle.selftest.mjs   # ~1 s
```

It checks:
- **The rod:** a steady bend is a circle, in 3D and 4D; bend and twist is a helix with constant turning and winding.
  Frames stay orthonormal.
- **The muscles:** one side contracting curls the arm that way and no other, and shortens it. Squeezing it thin
  lengthens it, keeping every segment's volume.
- **The hairy ball:** the 3D twist field never vanishes on the ring; each 4D one vanishes at exactly two opposite poles.
- **Pieces:** the writhing 4D arm is cut by a slice through its base into 3 separate pieces.
