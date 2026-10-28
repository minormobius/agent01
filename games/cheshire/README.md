# CHESHIRE

Project Cheshire: you're a 3D prisoner in a four-dimensional world, and your jailer is its cat. This directory is
being built cat first. **What's here now is the cat lab** (`index.html`): the cat alone, as you'd see it, one 3D slice
of it at a time.

## Why the Cheshire cat is a 4D cat

You see only the slice of the cat's world at your w. A connected 4D body can cut your space in separate pieces, so
its parts come and go on their own: a paw here, an ear floating over there. A step of a few centimetres along w takes
all of it out of your sight without it going anywhere. And whatever is last to cross your slice as it leaves is what
lingers: give it a grin that reaches further into w than the rest of it and you get the grin without the cat.

## The cat (`js/cat.js`, no DOM)

One parts list (capsules and ellipsoids in 4D, joined smoothly) is what the shader draws and the selftest measures.

- **Axes:** x forward, y up, z and w its two sideways directions. Gravity is along −y, so its floor is a 3D space.
- **Stance:** feet steady you only if they span the floor, so four must stand at the corners of a tetrahedron, not a
  rectangle. Front legs splay in z, hind legs in w: in your slice it seems to hover on two legs. The selftest checks
  the centre of mass stays over the tetrahedron through its idle.
- **Head:** round both ways sideways, so four ears (a pair across z, a pair across w), two eyes (across z only).
- **Grin:** its 3D shape extruded along w to 26 cm, past everything else, at full thickness. It stays when the cat
  has gone.
- **Idle:** breathing, and a tail that sways through w (it drifts in and out of your slice by itself).

## The five-legged cat (`pose(t, { legs: 5 })`, the lab's **5 legs**)

The cat as a 4D animal might be built to creep: two front legs across z, as before, and three hind legs round the hips
in the zw plane at 0°, 120°, 240° (`HIND5`). A side of that triangle along z, the front pair's direction, would lay four
feet in a plane when the fifth lifts (90°, 210°, 330° does), so the angles keep every side 30° or more off it. In your
slice it stands on three feet, two front and the hind one at 0°, with two hind feet off in w; at |w| ≈ 9 cm the other
two hind legs stand alone. Its tail stays up, for balance. Feet carry their names (`paws`, `pawNames`), and `lift`
takes names.

## The lab (`js/lab.js`, `js/main.js`)

WebGL2: a fragment shader marches rays through your slice (x, y, z at w = W) of the cat turned by a 4D rotation,
with only the parts that reach your slice uploaded. Off-slice feet show as rings on the floor, wider and fainter the
further off in w (teal ana, rose kata). Stripes run in all four directions and take the colour of their side of w.

Controls: your slice's w, sweep, a turn in any of the planes zw, xw, yw, xz, a quarter-turn button, idle on/off,
the rings on/off. A line under the cat says what of it is in your slice (`cut`, which the selftest proves never
misses a part). URL: `?legs=5&w=0.12&zw=90&yaw=90&pitch=5&dist=0.6&at=0.3,0.4,0&gait=five&phase=1`; `&shot` draws one still frame and
stops (for screenshots in software GL).

```bash
node games/cheshire/test/cheshire.selftest.mjs   # stance, a safe distance to march, slices, turns, shader = cat.js, balance, the walk (~19 s)
```

## Balance (`js/gait.js`, no DOM; `js/gaitui.js`, the panel)

Gravity pulls down, so the floor is a 3D space (x, z, w). Point feet hold a body up only while its centre of mass is
over the solid they span, and they span one only if they aren't all in a plane: four at least. Lift one of four and
three are left, a triangle, so **a 4D quadruped can never creep statically**: every step is a fall caught, as our
walking is. The panel judges six plans (stand on all; creep, each foot lifted alone with the body swaying first, by the
least sway (Dykstra's projections) that leaves the centre of mass 1 cm in; and each plan's alternating halves):

| plan | stands | creeps | alternating halves |
|---|---|---|---|
| the cat (front pair across z, hind across w) | 4.6 cm in | no: each lift leaves a triangle | trot: lines, 2 ways to tip |
| hips aligned (both pairs across z) | no: four in a plane | | |
| the cat, tail planted as a fifth foot | yes | yes, swaying ≤ 5.7 cm | |
| **the five-legged cat** (two in front across z, three behind round z and w) | 4.2 cm in | yes, swaying ≤ 3.0 cm, if no side of the hind triangle lies along z | |
| six legs (three round each hip) | yes | yes | threes: triangles, dynamic |
| eight legs (four round each hip) | yes | yes | fours: each half the cat's own stance, static |

The cat acts out its three (its four, its tail planted, and its five-legged form): it sways, lifts, and the floor shows the support (the feet's
solid cut by your slice, gold) and its centre of mass (gold, red when outside), both computed from the posed cat each
frame. `cat.js swayFor` finds the body sway that puts the posed cat's own centre of mass on target.

**The tail.** Tipping is a turn that includes up (xy, zy, wy), so every tipping turn is y ∧ h: one plane. A swung tail
pushes back in u ∧ v (where it points, where it moves). Held level it catches only forward tipping; raised θ, all three,
the sideways two at sin θ of the forward one (`tailReach`). So balance needs one tail, held up, and a tail used as a
foot gives that up. In the air, righting can need a double rotation (two planes at once), which no single u ∧ v is: one
tail can't, two could.

## Walking (`js/walk.js`, no DOM; the lab's **walk**)

A gait is a cycle in which the feet swing one group at a time; a foot down stays put while the body passes over it.
The five-legged cat walks a **wave gait**, one foot at a time (duty 0.85), statically balanced throughout: before each
swing the body sways (the least sway, `gait.js swayTo`) so its centre of mass is 1 cm inside the four feet down, and
moves straight to the next target, which keeps it inside the whole time (the support slides back as one solid). Its
longest stride is **11.2 cm, set by its front legs' reach, not by balance**; the lab walks it at 80%. Legs are solved
by inverse kinematics (`cat.js ik`, `rig`): elbows bend back, knees forward. The cat with four has no static gait (every
swing leaves three feet in a plane), so it trots on diagonal pairs, on a line, falling between steps: shown, not yet held
up (that needs dynamics).

It walks along its own forward, wherever that points: turn it a quarter in xw and it walks off into w, out of your
slice. **Turns pivot on its head** (`HEAD`), not its feet. **Three eyes** (`EYES`): two apart across z and a third
between them off in w, an equilateral triangle, so its stereo baselines span both sideways directions.

## Next

The cat is the thing to get right before anything else: shape, fur, the grin, how it moves (its turns in two planes
at once, a 4D righting reflex). Then the first room: hide and seek, the shadow lamp, its footsteps' 4D echo.
