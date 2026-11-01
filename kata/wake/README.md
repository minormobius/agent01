# WAKE

kata's boat. The Cheshire cat helms a boat across a four-dimensional lake. The water's surface is three-dimensional
(x, z and w, the ground every kata page shares), so a turn has a direction as well as a size, and a boat can heel two
ways. Round the buoys in order.

## Sailing

- **The stick (or WASD, or the arrows) is the rudder.** Right turns right, up turns **ana**, down **kata**. The turn it
  asks for grows with speed: the tightest is a 7 m radius, plus a little from the propeller's wash when you're slow.
- **The throttle** is the lever on the right (drag it; or E and Q, PageUp and PageDown), from 30% astern to full ahead.
- **The camera** rides behind the boat in its non-twisting frame, so up on the stick is always the direction your
  slice can't see.
- **Buoys.** The next is gold, the ones after red, the rounded grey. Pass within 3.5 m. A buoy is a 4D ball, so you
  see it only when it's within 0.9 m of your slice. Its **marker** is drawn wherever it is, with its distance, and how
  far it lies ana (teal) or kata (rose) when it's off your slice. An arrow at the edge points to one that's off screen.
- **The gauge** (bottom middle) is the plane across your bow, seen from astern: right is right, up is ana, and the
  line across the middle is your slice. It shows:
  - your rudder: the blue ring;
  - where the next buoy lies: the gold diamond, at the centre when it's dead ahead, at the rim when it's abeam;
  - your heel: the gold dot, red past 60%, where the rim is capsizing;
  - the boat's hulls: the circles, one bright when it's in your slice.
- **Capsize** and you're put back at the last buoy you rounded, throttle at 40%. **Boat** (button, or B) puts any boat
  on any course: no medal, just the time.

## The physics

- **Floating** (`js/boat.js`). Archimedes holds in any dimension. Each hull is a 4D capsule, every point within r of a
  segment, floating with its axis on the waterline. So the half under water has a half-3-ball for its section along its
  length and half a 4-ball at its ends. Its waterplane is a 3D solid: a disc along its length and a 3-ball at its ends.
  The selftest integrates both numerically.
- **Heel.** The heel is a 2-vector: up tilts toward e1 (across, in your slice) or e2 (across, into w). What rights the
  boat is the metacentric height GM = I/V − BG. Here I, the waterplane's second moment, is a **2×2 matrix** over the
  plane across the bow, and so is GM. So which way a boat falls is set by its shape:
  - **the triad**: three hulls in a triangle across both directions. I is the same every way, GM is 3.05 m every way.
    Steady.
  - **the catamaran**: two hulls side by side. GM is 9.2 m across but 0.03 m in w, so it's tender: a hard turn into w at
    speed lays it over. Its weight sits below the waterline (ballast). A round hull floating at its axis has its
    metacentre *at* the axis (BM = 3r/8, the depth of its buoyancy), so with its weight above the waterline nothing
    would hold it upright in w at all.
  - **the skiff**: one hull, ours, wide across and flat in w (five thin hulls side by side along e1). GM in w is
    −0.30 m. It can't float upright here: left alone it falls kata or ana in about a second and a half.
- **Turning heels the boat outward**: the water pulls the hulls inward, below the weight. The heel settles where
  u·ω·arm = g·GM·sin(heel) along the turn's direction; damping is 0.3 of critical.
- **The rudder** turns the heading toward any direction across the bow. The frame (T, e1, e2) is carried without
  twisting about T, as the bicycle's is.
- **Speed**: thrust, drag that gives the boat's top speed (6 m/s for the triad and skiff, 7 for the catamaran), and a
  little more drag in a turn. Touching the shallows stops the boat and backs it off.

## The wake (`js/wake.js`)

Kelvin's construction, one dimension up. Waves that keep pace with a boat moving at U in direction T have phase speed
U cos θ along their own direction n. Deep-water waves carry their energy at half their phase speed. So what the boat
stirred a time a ago has spread over a sphere: radius U a / 4, centred U a / 4 ahead of where it was stirred. Each such
sphere subtends asin(1/3) = 19.47° from where the boat is now, at every age. On our water those spheres are circles and
their envelope is Kelvin's 19.47° wedge. Here the envelope is a **cone** about the track, of the same half-angle. Your
slice cuts it: a V when you head along your slice, other conic sections when you head out of it.

The page remembers the boat's track every 0.3 s for 9.6 s. It draws each remembered sphere as a crest on the water:
- strongest where the sphere touches the cone (70.5° from its heading, Kelvin's cusp waves);
- weaker behind (the transverse waves);
- fading with age;
- stronger the faster the boat was going.

That's the construction drawn as it goes, not a solution of the water's equations: the crests' shape is stylised. The
cone's angle is not, and the selftest holds it to tan 19.47° in every direction across. The swell is four plane waves
on the 3D surface, each with the deep-water ω² = g k.

## Courses

- **The lake (`js/lake.js`)** is analytic: a valley 200 × 160 × 96 m flooded to y = 0, 3.5 m deep with a little
  lumpiness, beaches and walls past 0.84 of the way out, and islands as smooth domes. The physics and the oracle read it
  exactly. The shader reads it baked into Fall Line's heightfield texture (one sample a metre) and draws water over it.
- **A course** is written in its start's frame: `[ahead, right, ana]` metres from the lake's middle. So "ana" in a
  course means stick-up from the start.
- **The oracle (`js/oracle.js`)** helms the way a person on the page would. It steers for the next buoy with a rudder
  of 1.3 × the bearing off the bow, at full throttle. It eases to a third before a turn whose steady heel would pass
  0.45 of the way to capsizing, and turns no harder than 0.6 of the way. It has a reaction time τ it doesn't make up
  for. **Par** is its time at τ = 0.
- **The difficulty (/10)** is 10 × (0.25 timing + 0.3 w + 0.2 rudder + 0.25 heel):
  - **timing** = 1 − τ⋆/1.5 s;
  - **w** = half the share of turning into w, half how many directions across the bow it turned;
  - **rudder** = the share of time it held the rudder hard over;
  - **heel** = its biggest heel against capsizing.

  Boats are forgiving, so the scores run lower than TAILSPIN's.
- **Eight courses (`js/levels.js`)**, 0.7 → 4.3; **made courses (`js/gen.js`)** for any seed at easy, medium or hard.

## Testing

```bash
node kata/wake/test/wake.selftest.mjs   # ~3 s
```

It checks:
- the hydrostatics against numerical integration, and the round hull's neutral metacentre;
- which way each boat falls, the skiff capsizing alone, and the catamaran's w-turn;
- the boat's frame staying untwisted, the rudder and heel directions, and the shallows;
- Kelvin's cone (every sphere at asin 1/3, and the envelope's reach);
- every course sound, ridden, scored as stored and rising;
- the generator;
- the shader's array sizes.
