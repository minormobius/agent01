# MOONLET

A bicycle on the outside of a tiny four-dimensional moon, at ana.mino.mobi/moonlet/: a 4-ball of rock 100 m in radius,
not spinning, held together by its own gravity. Its surface is a 3-sphere, a closed three-dimensional world 628 m
round. The second megastructure page, and the HOPF HABITAT's opposite: the same shape, ridden from outside, with the
weak pull of its own mass where the habitat has the strong pull of its spin.

## The physics

Four's pinned gravity: potential −GM/r, so the pull is GM/r² and orbits close (four.mino.mobi records the pin as a
choice). Surface gravity g = 0.5 m/s², so GM = gR² = 5000 m³/s².

| | |
|---|---|
| orbital speed at the surface | √(gR) = 7.07 m/s |
| escape speed | √2 × that = 10.0 m/s |
| a skimming orbit (2 m up) | 92 s round |
| weight riding at v | g − v²/R |
| grip | μ × weight, μ = 1 |
| tightest turn at v | rate μ(g − v²/R)/v (capped at 1.4 rad/s at a crawl): 100 m across at 5 m/s, 2 m at 1 m/s |
| pedals | up to 1.2 m/s², fading to nothing at 6.5 m/s, and never more than the grip |
| a jump | 2.2 m/s: 5.1 m up, 9.4 s (flat ground would say 4.8 m, 8.8 s: the rock curves away and the pull weakens) |
| the rocket | 1.6 m/s² along the nose (or 45° up with jump held), 10%/s of fuel: 16 m/s a tank, more than escape |
| landing | under 3 m/s down: ride on with your speed along your heading; harder: bounce at 30% |

The bike's frame is four orthonormal vectors: F (heading), U (up), and Rt, N (the across pair; your slice is span{F,
U, Rt}, N is hidden). On the ground U is the radial direction and the bike moves by habitat.js `walk` (parallel
transport along the great circle). In the air: semi-implicit Euler (symplectic, so orbits hold: a skimming orbit's
radius stays within 6 cm over a whole period), the nose eases back to level (`holdLevel`), U eases to "away from the
rock" (`level`), and the stick yaws the nose in the across-plane. `circularize` turns the nose to the Δv that would make
the orbit circular here and burns when lined up. `elements` gives Kepler's orbit (apoapsis as 2a − peri, so a flight
straight up, e = 1, is right); `predict` is an RK4 forecast to touchdown (bisected).

## The topology

The painted roads, on the unit 3-sphere: ring 1 (the circle in the x₁x₂ plane), ring 2 (x₃x₄), and the trefoil, the
(2,3) torus knot on the Clifford torus between them: (cos 2t, sin 2t, cos 3t, sin 3t)/√2. `linking` stereographically
projects two curves to R³ and evaluates Gauss's double integral: rings −1.000 (the Hopf link), trefoil with ring 1
−3.000 and with ring 2 −2.000, a small unlinked circle 0.000. On the 3D surface these are knotted and linked; in the
4D space around the rock no closed curve is knotted (there's always room to lift a strand over another).

**The roads are tubes** in the 3D surface, 5 m across (`ROAD_HALF` 2.5). `roadPt` (and the shader's twin) is the
nearest point of a road: for the rings, the normalised pair; for the trefoil, one step from (α, β) along the knot's
normal on the flat torus, (3, −2)/13 times the offset c = 3α − 2β, which lands exactly on the knot (tested: always on
it, within 0.1% of the brute-force nearest distance). The kerbs (the last 0.6 m) are coloured by `side`: the offset from
the nearest centre point, dotted with your hidden direction: teal ana, pink kata, white in your slice (tailspin's and
the habitat's colours). Teal kerbs mean you're ana of the road: lean kata. Tested: a slice 1.5 m ana of ring 1 sees
teal kerbs, and leaning kata brings the bike back to within 5 cm of the centre.

`roadDist` (and the shader's twin) is the angle from a point to each road: exact for the rings; for the trefoil, the
offset from the Clifford torus and the distance across the knot's lines on the flat torus (lines 3α − 2β ≡ 0, the torus
metric ½(dα² + dβ²)): within 1.3% of brute force near the road.

The two pebble moons orbit at 1.8R in the x₁x₂ and x₃x₄ planes: completely orthogonal planes meet only at the centre,
so the moons stay exactly √2 × 1.8R apart, always.

## The page

`js/main.js`: one fragment shader ray-traces your slice: the rock (regolith noise, the roads painted with a centre
line), the bike (wheels as rings in the plane of F and U, a frame of capsules, the rider, the rocket and its flame),
eight beacon posts, the two moons, stars and the sun. The sun is a 4D direction: lighting uses the true 4D normal, and
shadows march toward it through 4D (against the bike and beacons). A bounding ball keeps the bike's SDF off most
steps. The camera rides behind and a little right of the bike in its slice, its heading and up eased; higher up it
rises over the bike and tips down by the horizon's dip, acos(R/r), but never so far the bike leaves the frame. The view
frame is Gram–Schmidted square (a look leaning right with an unsquared right put the overlay 57 px off the shader).
The overlay draws the forecast (white in your slice, teal ana, pink kata; dashed and faint where the rock hides it),
the ✕ where you'll come down, the beacons (the next one named, with its ana/kata offset, or an edge arrow) and the
moons. The minimap is the whole rock as a ball on your axes (habitat.js `mapOf`). "Slice follows the beacon" turns
your across pair about your heading toward the next beacon, lazily (1.5 m) and slowly (0.8 rad/s), toward the nearer
of ±right. Resolution follows the frame rate (0.45–1).

Controls: W S pedal and brake, A D lean right/left (in the air, turn), Q E lean kata/ana, space jump, shift rocket
(with space: 45° up), C hold to circularize, J L twist your slice, H back to the start. Touch: the stick, ROCKET, JUMP,
BRAKE, GO, the twist pad, and HOLD: CIRCULARIZE in the air.

`window.moonlet` exposes `S`, `M`, `project` and the last camera, for tests.

## Checks

`node ana/moonlet/test/moonlet.selftest.mjs` (34 checks, ~2 s; `V=1` prints each measured claim).
