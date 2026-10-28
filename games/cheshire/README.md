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

## The lab (`js/lab.js`, `js/main.js`)

WebGL2: a fragment shader marches rays through your slice (x, y, z at w = W) of the cat turned by a 4D rotation,
with only the parts that reach your slice uploaded. Off-slice feet show as rings on the floor, wider and fainter the
further off in w (teal ana, rose kata). Stripes run in all four directions and take the colour of their side of w.

Controls: your slice's w, sweep, a turn in any of the planes zw, xw, yw, xz, a quarter-turn button, idle on/off,
the rings on/off. A line under the cat says what of it is in your slice (`cut`, which the selftest proves never
misses a part). URL: `?w=0.12&zw=90&yaw=90&pitch=5&dist=0.6&at=0.3,0.4,0`; `&shot` draws one still frame and
stops (for screenshots in software GL).

```bash
node games/cheshire/test/cheshire.selftest.mjs   # stance, a safe distance to march, slices, turns, shader = cat.js (~13 s)
```

## Next

The cat is the thing to get right before anything else: shape, fur, the grin, how it moves (its turns in two planes
at once, a 4D righting reflex). Then the first room: hide and seek, the shadow lamp, its footsteps' 4D echo.
