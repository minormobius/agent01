# MOONLET

A bicycle on the outside of a tiny four-dimensional moon, at ana.mino.mobi/moonlet/: a 4-ball of rock 100 m in radius,
not spinning, held together by its own gravity. Its surface is a 3-sphere, a closed three-dimensional world 628 m
round. The second megastructure page, and the HOPF HABITAT's opposite: the same shape, ridden from outside, with the
weak pull of its own mass where the habitat has the strong pull of its spin.

## The physics: forces, summed every step

The bike is a point mass (100 kg dry + up to 2 kg of nitrogen) with a body frame: F (the nose, along the ground
when riding), U (its up), Rt and N (the across pair; your slice is span{F, U, Rt}, N is hidden). Every 1/120 s,
`step` adds up the forces, ground or air:

| force | how it's computed |
|---|---|
| gravity | m·(−GM x/r³), GM = gR² = 5000 m³/s²: four's pinned law, g = 0.5 m/s² at R = 100 m |
| rocket | 180 N along F while burning; mass flow T/vₑ with vₑ = 716 m/s (cold N₂, Isp 73 s), so the mass drops and a tank gives vₑ·ln(102/100) = 14.18 m/s (measured: 14.184) |
| the ground | the normal force, **solved** from the contact: N/m = −(gravity + thrust)·n − κv², κ the surface's curvature along your velocity (`curvature`, from the normal's change). When it comes out ≤ 0 the ground can't hold you and you fly: no lift-off rule |
| the tyres | along: pedals (300 W, at most 150 N), brakes, rolling resistance 0.01·N; across: whatever cancels the sideways slip in one step. The sum is clipped to the friction circle μN (μ = 1). Clipped means sliding |
| a jump | an impulse, 220 N·s along the normal |

On the ground the bike is integrated (all forces, the normal one included) and put back on the surface, its velocity
made tangent. Steering is the bicycle's: yaw rate v·tan(δ)/L (L 1.1 m, δ up to 0.6 rad), and the **grip limiter**
(on by default, labelled; like traction control) holds it to 0.95·μN/(m·v) so the tyres don't slide; **raw** lets them.
In the air: semi-implicit Euler (symplectic: a 15 m orbit's radius holds to 6 cm), and the frame turns only by the
**reaction wheels**, at commanded rates (1.2 rad/s): the stick yaws the nose, W/S pitch it (only after you've let go of
W since leaving the ground, so pedalling into a jump doesn't pitch you). **SAS** (labelled, default on) uses the same
wheels to turn your wheels toward the ground, about the nose, never moving it; off, nothing turns you. `touchdown`:
on your wheels (U·n > 0.6) and under 3 m/s into the ground, the suspension takes it and you ride on; otherwise a crash,
bouncing at 30% with half your ground speed. `refuel` at the pad, 0.4 kg/s, standing still. `circularize` is an
autopilot: it slews the nose to the Δv that would make the orbit circular here and burns when lined up.

**Terrain.** h(û) = Σ A·exp(−θ²/s²) over eight hills (three 2.2 m kickers on the slalom, five big ones elsewhere),
θ = 2·asin(|û − c|/2). `gradH` is analytic (checked against finite differences to 1e-7), `normalAt` = unit(û − ∇h/r).
The shader's `heightAt` is the twin (its SDF steps at 0.85 for the slopes).

What the selftest measures (50 checks): the normal force is m·g standing and m(g − v²/R) riding (51.00 N, 25.52 N
against 25.50); coasting over a kicker conserves ½v² − GM/r to 1.6e-3 J/kg and slows you exactly as energy says; at
5.5 m/s the same kicker launches you (its crest curves at 0.039/m, so above √(g/κ) = 3.6 m/s); the tyre force never
leaves the friction circle; pedalling matches the scalar force balance dv/dt = min(power, legs, μN) − rolling to 0.2%,
and closes on orbital speed with time constant R/(2μv) ≈ 7 s, lifting off at 67 s (you can pedal into orbit, in the
limit); the tightest held turn at 4 m/s curves the path at 49.5 m within the surface, which on a 3-sphere of radius
100 is a circle 44.4 m across, and the bike traced 44.4 m; full lock without the limiter slides 4.8 m/s sideways; a
jump is J/m and peaks where Kepler says; the whole tank in deep space is Tsiolkovsky's Δv; burning along the ground
lifts off at orbital speed; Kepler's apoapsis and the forecast agree with the flight; landings, crashes, SAS, pitch;
the circularizer; and the slalom is rideable (a steering controller at 3 m/s threads all ten gates on the ground; at
4 m/s the kickers throw it for 11 s and it still makes them).

Earlier versions faked the ground (a scalar speed slid along the heading, gravity only capping grip, a lift-off rule,
a self-levelling nose, self-refilling fuel). This replaced all of it.

## The slalom

`GATES`: ten along ring 1, 36 m apart, each centred 4 m off the course to the right, ana, left, kata in turn. On a 3D
ground a gate is a ring of posts (radius 2.6 m, 4 m tall) round its centre in the plane across the course; your
slice cuts it at two posts. `gateCross` says pass (through the disk, under the posts' tops) or miss (+5 s) when you
cross its plane forwards. The shader colours the posts like the kerbs (teal ana of the gate's centre, pink kata, white
in your slice); a gate offset into w is invisible until you lean toward it.

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

Controls: W S pedal and brake (in the air: pitch), A D steer right/left, Q E steer kata/ana (in the air the stick turns
the nose), space jump, shift rocket, C hold to circularize, J L twist your slice, H back to the pad. Touch: the stick, ROCKET, JUMP,
BRAKE, GO, the twist pad, and HOLD: CIRCULARIZE in the air.

`window.moonlet` exposes `S`, `M`, `project` and the last camera, for tests.

## Checks

`node ana/moonlet/test/moonlet.selftest.mjs` (50 checks, ~2 s; `V=1` prints each measured claim).
