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

- **The basin.** Inside an ellipsoid over x, z and w (semi-axes 21, 21 and 7.4 m) the land is low and rolling, at most
  40 voxels, rising to a lip. Outside it stands a rim of at least 50 voxels, filling all six faces of the world's box,
  so the world's wrap is never reached.
- **The track,** carved at 22 voxels (5.5 m) wherever the centreline is within 1.5 m, eased into the land over a 1 m
  shoulder. The polyline has 1536 segments, so the distance is exact to its 6 cm chords.
- **Materials.** A cell's byte holds its height in bits 0–5 and its material in bits 6–7: ground, tarmac, the centre
  line (within 12 cm of the centreline, a thin tube, so in your slice it's a line or a dot), and kerbs (the outer 25 cm).
- **Walking in substeps.** `walk()` cuts every move into substeps of under a cell along each axis. However fast you go
  (a vehicle, later), you can only reach a cell next to one you stood on. That's what lets the selftest prove the basin
  closed.

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
- every track cell is at the track's height and marked, nothing off it is, and track and shoulder lie inside the basin;
- the rim stands at least 50 voxels everywhere outside, the floor at most 40 inside, and it covers the box's six faces;
- `nearestTrack()` agrees with the carved distance field;
- every block holds its tallest column, and the two-level march agrees with brute force on 120 rays;
- **you can't get out:** a flood of every cell reachable from the start, by `walk()`'s own rule (a substep moves at
  most one cell along each axis, x then z then w, each climbing at most a step above where it began), never touches
  the rim, and reaches every cell of the track;
- random walking never climbs more than a step, and even at 30 m/s never leaves the basin;
- the shader's grid, blocks and cell layout are `world.js`'s.

## Next

Vehicles: the w-cycle (a tricycle stable in your slice, balanced in w), then the bicycle. They want `walk()`'s
substepping, the track's Frenet frame and the basin as they are.
