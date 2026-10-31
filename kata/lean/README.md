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

IRIS⁴'s engine (`four.mino.mobi/iris/`): a heightfield of 0.25 m tesseract voxels over x, z and w (320 × 320 × 128
cells, an 80 × 80 × 32 m world, packed for the GPU as an atlas of w-slices 12 across, 3840 × 3520, inside the 4096
any phone takes), the two-level ray march (`march()`, the shader's twin, line for line) and walking (eye 1.7 m, step up 0.5 m,
slide along cliffs). Cut down to the tesseract grid, with no foams and no rainbows, and changed in four ways:

- **The basin.** Inside an ellipsoid over x, z and w (semi-axes 37, 37 and 14.5 m: a stadium 74 m across, 29 m
  in w) the floor is perfectly flat, every cell at 22 voxels (5.5 m). Outside it stands a rim of at least 50 voxels,
  a 7 m wall broken up block by block, filling all six faces of the world's box, so the world's wrap is never
  reached. The track sits in the middle half of it: the walls stand at least 10 m off it even in w, where they used to
  be 3 m away, so looking into w shows you open floor and the track, not wall.
- **The track** is marked on that floor wherever the centreline is within 1.5 m: a closed loop of tarmac with nothing
  in its way. The polyline has 1536 segments, so the distance is exact to its 6 cm chords. Only the cells near it
  are kept (`trackCells()`, sparse: a few hundred thousand of the world's 13 million).
- **Materials.** A cell's byte holds its height in bits 0–5 and its material in bits 6–7: ground, tarmac, the centre
  line (within 12 cm of the centreline, a thin tube, so in your slice it's a line or a dot), and kerbs (the outer 25 cm).
- **Walking in substeps.** `walk()` cuts every move into substeps of under a cell along each axis. However fast you go
  (a vehicle, later), you can only reach a cell next to one you stood on. That's what lets the selftest prove the basin
  closed.

## The bicycle's dynamics (`js/dyn.js`)

The bike on the page is now a dynamic one. `bike.js` below is still the steady-turn calibration it is checked against, and the shapes it is drawn with.

- **Our world, exactly.** The linearized Whipple bicycle of Meijaard, Papadopoulos, Ruina & Schwab (2007, *Proc. R. Soc.
  A* 463:1955): M q̈ + v C1 q̇ + (g K0 + v² K2) q = (0, T), q = (lean, steer). `matrices()` builds M, C1, K0, K2 from the
  benchmark's parameters by the paper's appendix formulas. The selftest holds them to the published values (to 10⁻¹⁴),
  the standstill eigenvalues to ±5.5309 and ±3.1316, and the self-stable range to 4.2924–6.0243 m/s.
- **Four dimensions.** Near upright and straight, a 4D bicycle is two of these, one leaning into y and one into w. The
  wheels spin in (x, z), and the rotation algebra pairs (x, z) with (z, y) into (x, y) and with (z, w) into (x, w), so
  each lean keeps its own steer. The copies differ only in inertia: a body's roll into w is Σm(w² + z²) where into y it
  is Σm(y² + z²). So the w copy swaps each body's spread in y (Σmy² = (Ixx + Izz − Iyy)/2) for its spread in w.
  - A bike **built round** (as wide in w as in y) is the benchmark both ways.
  - A bike **built flat** (ours, which is the default) is 0.503 kg m² lighter to roll into w, so it falls slightly
    faster that way, and it balances itself into w only above 4.304 m/s (4.292 into y).
- **The calibration from the equations of motion.** The steady turn of the linear model is exactly
  φ = (v²κ/g)(1 + S_T/(−m_T z_T)) + (S_A/(m_T z_T)) δ: the calibration v²κ/g, plus 1.48% for the wheels' spin, minus
  1.35% for the front's weight off the steering axis. On the benchmark bike those two nearly cancel, leaving 0.13% at
  5 m/s.
- **The rider.** One LQR per steering copy, on (φ, δ, φ̇, δ̇) with the steer torque as input, about the steady turn for
  the lean asked for. It is stable from 1 to 9 m/s in both copies.
- **The autopilot.** Pure pursuit: aim at the point 2.5 + 0.8v metres ahead on the track and ask for the lean of the
  circle through it. At 3, 5 and 7 m/s it rides two laps within 0.1, 0.2 and 0.3 m of the centreline, its lean within
  4–8% of its own path's v²κ/g (the lean leads the turn it makes).
- **One-axis steering, dynamically.** With the steer locked, a fall into the frame's w grows as e^(3.14 t) at every
  speed, so no steering can catch it: the frame must twist. Here the frame twists so its one steering axis stays along
  the steer, and reports the rate and the torque. Nothing on the ground can supply that torque, since the contact force
  acts through the contact point, so it's internal: the rider against a flywheel, or their own body. If the steer swings
  round faster than the frame can twist (6 rad/s, for more than 0.15 s), it falls. On the track the twist peaks near
  1.2 rad/s at 5 m/s. Swap a lean in y for one in w all at once, and one-axis falls while two-axis rides it out.

## Two modes

Walking and riding are two different games in one world, so each has its own few controls. One button (**🚲 ride / 🚶
walk**, or R) switches between them.

- **Walk:** the stick (or WASD) walks, dragging (or the mouse) looks. The buttons: twist ⟲ ⟳, look ana and kata,
  square up, face the track.
- **Ride:** the stick (or WASD, or the arrows) is the **handlebars**: across for your slice, up for ana, down for
  kata, and let go for hands off. Dragging looks. The buttons: **👁** the camera (no twist, or follow the bend; V),
  the **speed** (5, 6, 7, 3, 4 m/s), and **⚙** for the rest: who holds the bars, the steering mechanism, and tilt.

Who holds the bars (under ⚙, or H):

- **✋ Hands on** (the default) is full control. The stick is the **handlebar's torque**, up to 2.5 N m on each copy,
  and nothing balances the bike but the bike itself. The physics makes that rideable: between its weave and capsize
  speeds (4.3–6.0 m/s) this bicycle rights itself hands off, in both copies, so at 5 m/s you can let go and it rides
  straight. You steer it the way a real bike steers, which includes the surprise that holding a turn takes a push
  the other way. Slower than 4.3 m/s it falls unless you balance it; faster than 6 m/s it slowly capsizes.
- **🤝 Assisted:** the stick asks for a **lean**, and the LQR rider in the machine balances and steers to get it.
- **🤖 Autopilot:** it rides the track by itself (pure pursuit), and you watch from behind.

The controls:

- **Phone:** the stick (bottom left) is the handlebars. There are only two controls, so a thumb does it. If you'd
  rather steer by tilt, turn on **📱 tilt** (under ⚙): roll the phone for your slice and tip its top away for kata, toward you for ana. ±26°
  is full scale, with a 2° dead zone, zeroed where you hold it when you turn it on. iOS asks for permission to read
  the motion sensors.
- **Keyboard:** A/D or ← → in your slice, W or ↑ ana, S or ↓ kata.
- **The gauge** (bottom of the view): across is your slice, up is ana. The gold dot is the bike's lean. The ring is
  your push on the bars when hands on (orange), or the lean you asked for when assisted (blue).

The camera rides in the non-twisting frame, so "across" and "ana" stay put while the bike's own frame twists under you.
If it falls, or reaches the rim, it's put back on the track.

## The autopilot's calibration (`js/bike.js`)

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

## Checks: the dynamics

```bash
node kata/lean/test/dyn.selftest.mjs   # ~2 s
```

The published matrices, eigenvalues, weave and capsize speeds; the 4D copies (round = ours, flat differs by Σmy²);
the locked-steer pendulum; the steady turn's exact decomposition; hands off it rights itself at 5 m/s and falls at 3; a steady torque holds the steady turn; the LQR stable from 1 to 9 m/s; a requested lean
reached; both mechanisms riding two laps at three speeds; the one-axis fall on an instant swap.

## Next

What a person can actually ride (the track may need scaling up). The 4D terms the linearization drops: a lean in y
and in w at once couples at second order, and a big lean isn't small. A twist actuator with real dynamics (a flywheel).
Then other vehicles: the w-cycle (a tricycle stable in your slice, balanced in w), then the bicycle. They want `walk()`'s
substepping, the track's Frenet frame and the basin as they are.
