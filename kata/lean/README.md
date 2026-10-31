# Lean — the track

The first of kata's demos: a track in four dimensions, to walk before anything is ridden on it.

## The idea

A road on our ground is a curve made wide in the one direction across it. On a four-dimensional ground (up, and the
three directions x, z and w across the ground) there are **two** directions across a curve. So this track is a curve
made wide in both: every point of the ground within 1.5 m of a closed centreline, all at one height. Its profile over
x, z and w is flat, a tube of tarmac carved level through the land.

The centreline is an oval in x and z that rises and falls in w twice a lap:

    x = 24 + 13 cos t,   z = 24 + 10 sin t,   w = 8 + 3 sin 2t      (metres; a lap is 77.3 m)

So its bends turn partly in the plane you start in and partly into w. The plane of the bend (spanned by the tangent
and the principal normal) itself turns as you go round, at the curve's **torsion** τ, up to 0.11 rad/m here. A road on
our ground lies in a plane and has none. This is the quantity a 4D bicycle would steer by: the size of its lean sets
the curvature of its path, and the rate the lean's direction turns sets the torsion.

## The readout

Where you stand, the page splits the centreline's curvature vector κN into your own frame: κ_F and κ_R lie in
the 3D slice you see, and κ_N lies along the one direction across the ground you can't see. It reports the share of the
bend in your slice, (κ_F² + κ_R²)/κ², and τ. **Face the track** (↦, or T) turns you so F is the tangent, R the principal
normal and N the binormal: then the whole bend is in your slice, and τ is how fast it leaves.

## The world (`js/world.js`)

IRIS⁴'s engine (`four.mino.mobi/iris/`): a heightfield of 0.25 m tesseract voxels over x, z and w (192 × 192 × 64
cells), the two-level ray march (`march()`, the shader's twin, line for line) and walking (eye 1.7 m, step up 0.5 m,
slide along cliffs). Cut down to the tesseract grid, with no foams and no rainbows, and changed in four ways:

- **The basin.** Inside an ellipsoid over x, z and w (semi-axes 21, 21 and 7.4 m) the floor is perfectly flat, every
  cell at 22 voxels (5.5 m). Outside it stands a rim of at least 50 voxels, a 7 m wall, filling all six faces of the
  world's box, so the world's wrap is never reached.
- **The track** is marked on that floor wherever the centreline is within 1.5 m: a closed loop of tarmac with nothing
  in its way. The polyline has 1536 segments, so the distance is exact to its 6 cm chords.
- **Materials.** A cell's byte holds its height in bits 0–5 and its material in bits 6–7: ground, tarmac, the centre
  line (within 12 cm of the centreline, a thin tube, so in your slice it's a line or a dot), and kerbs (the outer 25 cm).
- **Walking in substeps.** `walk()` cuts every move into substeps of under a cell along each axis. However fast you go
  (a vehicle, later), you can only reach a cell next to one you stood on. That's what lets the selftest prove the basin
  closed.

## The autopilot bicycle (`js/bike.js`)

A bicycle rides the centreline at a set speed (5 m/s by default; the slider goes from 1 to 9), kinematically, in the
**steady-turn calibration**. The physics is our world's, done with vectors. In a steady turn the line from the contact
to the centre of mass leans so that gravity and the centripetal pull balance about the contact line:

    up ∝ g Y + v² κ N,   so   tan φ = v² κ / g,   and the lean points along N.

On our ground this is the textbook tan φ = v²/gR. Here N lies anywhere in the plane across the direction of travel, so
the lean is a 2-vector, ana, kata or in between, wherever the curve bends. Along the track N turns about the tangent at
the torsion (Frenet: N′ = −κT + τB), so the lean's direction turns at τv rad/s. The steer is the kinematic
δ = atan(wκ/cos λ), toward N. The geometry is close to the benchmark bicycle of Meijaard et al. (2007): wheelbase
1.02 m, head angle 18°, wheels 0.34 m. At 5 m/s the most it leans here is 18.3°.

**Two mechanisms** (the button, or M), which differ only in how the frame carries that turning lean:

- **two-axis** steering (cyan frame, a cross of bars): the fork turns into either of the frame's lateral directions,
  so the frame never rolls about its direction of travel. Its lateral axes are the curve's non-twisting (Bishop)
  frame, and the lean and steer turn round inside them at τ. After a lap the frame comes home turned **31.9°**, the
  track's holonomy ∫τ ds.
- **one-axis** steering (gold frame, a single bar): the fork turns only toward the frame's own y, so y must follow N,
  and the whole frame rolls about its direction of travel at τv. That's the precession into w. The wheel's point
  contact lets it pivot in the plane across its axle without slipping. What drives the roll is the dynamics' question.

The bike is drawn as 4D shapes in the shader (`sdBike`, the twin of `bike.js`'s `sdf`): two tyres (every point
within 3 cm of a circle) and twenty capsules for frame, bars and rider, sphere-traced inside a bounding ball, lit and
fae-tinted like the land, with a shadow. Because they are 4D, a bike leaning into w slices thinner in your view: lean
far enough out of your slice and you see slivers of it.

**Ride along** (the button, or R; it cycles walk → follow the bend → no twist). The camera rides behind the rear wheel,
upright, facing along the track. In **follow the bend** its unseen direction is the binormal, so every bend and lean is
in your slice. In **no twist** it carries the non-twisting frame, so you watch the lean swing out into w as the torsion
carries it. Back to walk, you step off where the camera was.

## The map

Below the readout, the whole ground, x, z and w, with w up, as a solid you drag to turn (double-click resets). The
track is drawn as the tube it is: in an orthographic view a tube's outline is its diameter wide everywhere, so each
stretch is a stroke of the true 3 m thickness, drawn back to front and coloured by w (key: kata to ana), with the near
half of a round cross-section every few metres. The basin's three principal ellipses frame it. You're the gold dot,
with where you face (gold) and the direction you can't see (dashed blue).

On a phone (a touch screen, or anything under 700 px wide) the view takes five sixths of the screen and the map the
bottom sixth, in place of the readout; the buttons float over the view's right edge, clear of the stick.

## Controls

IRIS⁴'s: **WASD** walk (**shift** runs), the **mouse** turns and looks (click to grab it), **Z**/**C** or the
**wheel** twist (R toward w), **Q**/**E** look into w (F toward w), **X** square up, **T** face the track. On a phone
the stick walks, dragging turns and looks, and the buttons twist, look ana and kata, square up and face the track.

## Checks

```bash
node kata/lean/test/lean.selftest.mjs   # ~2 s
```

- the land is deterministic;
- the analytic Frenet frame (κ, τ, T, N, B) agrees with finite differences, the bends really turn into w and the plane
  really turns, and the tube never comes near itself;
- the basin's whole floor is flat at the track's height; every track cell is marked, nothing off it is, and the track lies inside the basin;
- the rim stands at least 50 voxels everywhere outside, and it covers the box's six faces;
- `nearestTrack()` agrees with the carved distance field;
- every block holds its tallest column, and the two-level march agrees with brute force on 120 rays;
- **you can't get out:** a flood of every cell reachable from the start, by `walk()`'s own rule (a substep moves at
  most one cell along each axis, x then z then w, each climbing at most a step above where it began), never touches
  the rim, and reaches every cell of the track;
- random walking never climbs more than a step, and even at 30 m/s never leaves the basin;
- the shader's grid, blocks and cell layout are `world.js`'s.

## Checks: the bike

```bash
node kata/lean/test/bike.selftest.mjs   # < 1 s
```

- up balances gravity and the centripetal pull exactly (tan φ = v²κ/g) at 2, 5 and 8 m/s, and the lean points along N;
- where the bend lies in our plane it's our bicycle, φ = atan(v²/gR), nothing into w;
- two-axis: the frame doesn't twist; one-axis: it rolls at τv; the lean sits at θ = ∫τ ds inside the two-axis frame;
- the holonomy (31.9°) agrees with a vector carried round the polyline by projection, and laps add up;
- the steer is atan(wκ/cos λ) toward the bend; the front wheel stays on the track; both tyres rest on it, to the
  tyre-width correction r(1 − cos φ); the shader's bounding ball holds every part.

## Next

The dynamics: a 4D Whipple model whose selftest reproduces the benchmark's eigenvalues with w switched off, and a
controller that has to reach this calibration. Then other vehicles: the w-cycle (a tricycle stable in your slice, balanced in w), then the bicycle. They want `walk()`'s
substepping, the track's Frenet frame and the basin as they are.
