# HOPF HABITAT

A space station for four-dimensional people, at ana.mino.mobi/habitat/: a hollow 3-sphere spun at equal rates in two
orthogonal planes. The first of the 4D megastructures (the physics is four's: gravity pinned at −GM/r, light as 4D
Maxwell).

## The idea

Spin x(t) = e^{ωtJ}x with J the complex structure J(a, b, c, d) = (−b, a, −d, c), J² = −1 (an isoclinic rotation). Every
point accelerates at −ω²x, so in the turning frame the centrifugal field is ω²x: radial, and ω²R on every point of a
3-sphere floor of radius R. No axis, no poles. Each point is carried round a great circle (a Hopf circle); no two meet.

## What's computed (`js/habitat.js`, no DOM)

- `flight`: a free object's exact path. Inertially it's a straight line (velocity relative to the floor plus ωJx);
  turning it back by e^{−ωtJ} gives the path you see; it lands where the line meets |x| = R.
- `integrate`: RK4 on a = ω²x − 2ωJv in the turning frame, the check on `flight`.
- `floorFrame`: down x̂, spinward f = Jx̂, and e, Je across the spin (J turns the across-plane by 90°).
- `weight`: the floor's push on something moving at vRel: |vRel + ωJx|²/R.
- `hoopStress`, `maxRadius`: σ/ρ = gR/3 for the 3-sphere hull (σ = pR/((n−1)t) for a sphere in n dimensions) against
  gR for a cylinder: three times the radius for the same material.
- `walk`: parallel transport along a great circle, re-orthonormalised.
- `hopf`, `towers` (the 24-cell's vertices), `roads` (Hopf circles over an icosahedron's vertices).

## Claims and checks (`test/habitat.selftest.mjs`)

- J is a rotation with J² = −1; every point of the turning body accelerates at −ω²x (numerical second derivative).
- Spin gravity is the same at 500 random floor points; an unequal double rotation (0.14, 0.10) varies by 49%.
- Exact flights match RK4 in the turning frame.
- A 20 m drop at R = 300 m, 1 g lands 5.234 m antispinward at every one of 200 points, as the cylinder worked
  separately; nothing across the spin.
- A throw spinward doesn't swerve sideways; a throw across the spin swerves the same in all 8 directions, always
  toward +J of the throw (one handedness).
- Walking at 5 m/s: (ωR + u)²/R spinward, (ωR − u)²/R against, (ω²R² + u²)/R across.
- The hull's force balance by sampling: half a 3-sphere's projected load is the 3-ball the cut leaves, so σ = pR/3t.
- Hopf circles: the Hopf map is constant along them; two stay the same distance apart all the way round.
- A 6.5 km walk keeps the frame on the floor and orthonormal; `orthonormalTo` fills in a direction that was in the span
  of the others (mounting a bike can hand it one).
- The map: `mapOf` and `fromMap` invert each other, distances from you are walking distances, all within πR, and your
  forward, right and w are its axes. Lakes cover some but not all of the floor; home is dry; each track's laid line is
  no wetter than the first it could have taken.
- Riding: great circles keep their spin share all round; the spin never pushes along any track (slalom included);
  with the spin no lean and (ωR + v)²/R; against at the floor's speed weightless; across a constant lean
  tan φ = 2ωv/(ω²R + v²/R) toward J of your heading; at 45° smaller and constant; the slalom closes and its lean swings.

## Riding

`makeTrack` lays a closed track through where you stand (a great circle, or the slalom: one with two sine wiggles, one
of them through w); `trackAt` interpolates it; `ride` gives what the ground must do: F/m = v²x'' − ω²x + 2ωJv. Its part
toward the centre is your weight; its sideways part (a vector across the track: right and w) over that is the lean a
balancing rider holds, and the grip needed. Neither field has a part along the track, so the spin never speeds you up.
Every great circle keeps a constant share of the spin (its tangent's component along Jx is constant), so a straight
road rides the same all the way round. At R = 300 m, 1 g, 15 m/s: with the spin 1.63 g, upright; against 0.52 g, and at
the floor's speed weightless; across, upright nowhere: a constant 27.2° lean toward J of your heading, grip 0.51; at 45°,
14.9°. The camera leans with the bike; turn your slice so the lean lies in w (*put the lean in w*) and the world stops
rolling while you lean 27° into a direction you can't see.

## The map and the land

- `isWater` twins the shader's terrain (its noise rounded through `Math.fround`, since GLSL's floats are 32-bit; a
  point within a hair of a lake's edge can still be called differently).
- `mapOf`/`fromMap` are the 3-sphere's logarithm and exponential at you: each point at its walking distance, in the
  direction you'd walk to reach it, on your axes (right, forward, w). The whole floor fits in a ball of radius πR.
  The page draws it as a spinnable ball (lakes as blue point clouds, the track coloured by which side of you it runs,
  dashed on bridges, landmarks, home).
- `layTrack` lays each kind of track on its driest line from where you mount (24 turns of its free direction); the
  spin road has no freedom. From home at R = 300 m: across 4.2% over water, 45° 2.2%, slalom 3.9%, spin road 15.6%.
  What can't be dodged is a bridge.
- `LANDMARKS`: the 24 towers, lettered A–X, each its own hue (A and B stand in lakes); `HOME` is where you start.
- The road is a tube in the 3D floor: its edge is coloured by the side it lies on against your slice (teal ana, pink
  kata, white in your slice), so a track turning into w shows before it goes (tailspin's kerbs).

## The page

You stand on the floor; the shader ray-traces your 3D slice (forward, right, up): the floor from inside, 24 towers
(4D capsules: you see one only when your slice cuts it), the Hopf roads (yours gold), the sun at the centre, haze.
An overlay draws the balls from `flight`: solid where your slice cuts them, a ring labelled ana/kata where it doesn't.
Controls are kata's (twist pad, lever) plus a walk pad; drag looks; *face spinward* puts your hidden w across the spin,
so a throw across it curves out of your slice. Not modelled: air drag (the air turns with the hull), the hull's own
gravity, 4D materials' real strengths (four hasn't computed them).
