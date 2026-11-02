# SQUID

Jet through an open four-dimensional sea with no down. The view comes from your heading: your slice is the heading and
two directions across it (right, up), and **ana** is the third direction across, the one you can't see.

## Swimming

- **JET** (hold, or space) pulses your mantle: squeeze and refill, about once a second. The jet pushes you along your
  heading.
- **The funnel aims the turn**, three ways: the **stick** (or WASD, the arrows) aims it right, left, up and down; the
  **lever** (or R F, E Q) aims it **ana** and **kata**. Our squid has two directions to turn in; this one has three. The
  funnel turns you harder the harder the jet, and the fins give a little turning without it.
- **Arms** (button, or X). Your twelve arms trail like an arrow's feathers and keep you straight. Folded, you're faster
  (5.3 m/s against 3.8), and the **Munk moment** takes over: a long body moving at an angle is turned further
  broadside, so your heading runs away from your course unless you fly it. The HUD's **slip** is the angle between
  heading and velocity.
- **Roll is ignored** (for now, at our peril). In 4D a body can roll in three planes across its heading. Here the frame
  is carried without twisting: it only ever turns in planes that contain the heading.

## The sea

- **Jellies:** 200 big glowing 4D balls, 4 to 14 m across, in a sea 120 m in radius. Your slice cuts each in a ball
  that shrinks as you move off its centre in w, and is gone once you're more than its radius away. A jelly up to 30 m
  out of your slice shows as a **halo**, teal ana and rose kata. A slice through the middle cuts about two dozen, with
  80 more glowing nearby.
- **Eight giants,** 18 m across, at ±70 m along x, y, z and w, each axis its own colour: a compass.
- **The light** is a 4D direction, partly ana. The water is brighter toward it, and the HUD says how far ana or kata of
  your slice it lies, so as you turn into w the brightness moves.
- **Plankton:** the dots within a metre of your slice, for a sense of motion.

**The chase:** swim into eight jellies in order. The next is gold (a ring, or an arrow when it's off screen), with its
distance and how far ana or kata it lies. **The gauge** shows the funnel's aim (blue ring, and the mark on the ana/kata
bar) and the next jelly's bearing (gold diamond, and the gold mark on the bar). 🎲 makes a new sea.

## The model (`js/squid.js`, no DOM)

A game model, not a fluid simulation: each force is the right shape, its size tuned to fly.

| term | form |
|---|---|
| thrust | 2T sin²(2πft) along the heading, while held |
| drag | k_a\|v_F\|v_F along the heading (more with the arms spread), k_c\|v_⊥\|v_⊥ across |
| turning (ω, a 3-vector: how fast the heading tips toward right, up and ana) | funnel (vector·thrust + fin) × aim |
| Munk moment | − munk · v_F · v_⊥ |
| arms | + arms · spread · \|v\| · v_⊥ |
| damping | − damp · ω |

The frame turns in the single plane of the heading and ŵ = Σωᵢeᵢ each step: exactly no roll.

## Testing

```bash
node kata/squid/test/squid.selftest.mjs   # < 1 s
```

It checks:
- **The frame:** stays orthonormal, with no roll (the across-directions never turn among themselves: 1e-14).
- **Steering:** the funnel turns the heading right, up or ana alone, 78° in 1.5 s, and held ana it loops round to head
  straight into w.
- **Stability:** knocked off line, a folded squid runs 29° off its velocity while a spread one settles to 0.2°, and
  folded is faster.
- **The sea:** 200 jellies and 8 giants, apart and clear of the start; a slice through the middle cuts at least 20,
  with 60 more within 30 m. The chase's first jelly lies in your starting slice.
