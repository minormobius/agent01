# PRISM — light puzzles in four dimensions

`ana.mino.mobi/prism/`. Turn 4D prisms and mirrors to steer a beam into targets that sit off in w.

## The physics

Ray optics doesn't depend on the number of dimensions. At a boundary the incoming ray d, the boundary's normal N and the
outgoing ray lie in one plane, and Snell's law holds in it. In vector form (`refract`):

    t = η d + (η cos θ₁ − cos θ₂) N,   η = n₁/n₂,   cos θ₂ = √(1 − η²(1 − cos² θ₁))

with total internal reflection when the square root's argument goes negative. Mirrors reflect: r = d − 2(d·n)n.
Dispersion is Cauchy's n(λ) = 1.6 + 0.02/λ² (λ in µm): about a dense flint glass, 1.65 for red, 1.70 for blue. White light
is traced as three rays: red 650 nm, green 530 nm, blue 450 nm.

What's 4D is the geometry:

- **a 4D prism** is a triangle times a square (a 3,4-duoprism). Its refracting faces are 3D cells, and it bends light only
  in its triangle's plane. Turn that plane to contain w and the beam goes ana or kata.
- **in a slice a beam is a spark.** A line meets a 3D hyperplane in one point, so the slice view draws a spark where each
  segment pierces it, ringed teal if the beam is heading ana (+w), rose if kata. Beams have width (`BEAM`, 0.12): every part within that of the slice draws, fading with distance, so a beam along our space survives a nudge of the lever (at first only segments exactly in the slice drew, and the beam from the emitter vanished at the slightest touch). Under it all, the whole path faint and dashed, flattened onto the slice.
- **targets are 4D solids.** A ray almost never meets a 2D patch or a point in 4D; it meets a solid.
- **the shadow's eye is tilted.** Projected from an eye straight out along w, a beam bent into w looks almost unbent
  (w only scales the picture radially). The shadow's home frame (`homeE`) turns 35° between z and w, so w shows as its own
  slant. The slice's home frame is our space, squared up. ⊞ returns to the view's home frame.

## Levels

`LEVELS` in `js/optics.js`. Each level is a function from knob angles (degrees) to its pieces; each knob turns one piece
about its centre in one plane (world axes: `yw` turns the y axis toward w). Levels are designed backwards: build the
pieces at the solution, trace the beam, put the targets where it goes (`TCACHE`, once per level). So every level is
solvable by construction, and the selftest checks it is solved at the solution and not at the start, with each knob's
slack. The levels' prism is turned in its own plane by `MIN_DEV_TILT` so a beam along x passes at least deviation for
green (the ray inside parallel to the base, the textbook path); a beam entering low would bounce off the base by total
internal reflection, which cancels the dispersion.

| level | pieces | the move | slack at the solution |
|---|---|---|---|
| Ana | one prism | turn it 90° in yw: its triangle into xw | 15° steps |
| Over the wall | four mirrors (two turnable) | the first to −45°, the last to 45° in xw: a periscope over a wall 1.2 thick in w | −46..−40°, 37..53° |
| Rainbow in w | one prism, white light | yw 90°, then tilt in xw near least deviation so red, green, blue each cross their own target | xw −3..7° |
| Round the corner | a prism and a mirror | prism into w, mirror 45° in xz: up z | mirror 37..52° |

## Checks

`node ana/prism/test/optics.selftest.mjs` (<1 s): Snell on 2,000 random rays and surfaces in 4D (the sine law, coplanarity,
unit length, total reflection exactly past the critical angle); the critical angle along w as along x; reflection; a
60° prism's least deviation found by turning it equals 2 asin(n sin 30°) − 60°; red bends least, blue most; turned 90° in
yw the prism bends the beam the same angle into w and nowhere else; a whole level turned and moved at random in 4D
carries its beam with it; light retraces its path; every level solved at its solution, not at the start; the rainbow's
targets each take their own colour only.

## Next

Polarization: light in 4D has three transverse directions, not two, so a polarizer passes one direction of a 3D
cross-section and rotations of polarization don't commute. Filters and wave plates would make locks whose order matters.
