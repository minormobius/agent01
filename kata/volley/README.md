# VOLLEY (a demo)

One archer on a 4D bicycle against the many, at `kata.mino.mobi/volley/`. The many live in a single 3D slice of the
world, w = 0.

## The idea

The many are 3D people. They stand, see and shoot in their slice and nowhere else. You ride a closed track that leaves
it: an ellipse in x–z (40 × 28 m) whose w is 9·sin t. Half a lap is ana of them, half kata, and twice a lap, at the
red gates, you ride through their world. Everything in the game follows from that:

- **They see you only while your body cuts their slice** (|w| < 0.6 m). The rest of the lap you don't exist for them.
- **Their arrows never leave w = 0,** so they can hit you only at a gate.
- **Your arrows cross w.** One loosed from 9 m ana is in their slice only at the end of its flight. It doesn't pass
  their walls; it arrives inside them. A closed bunker (four walls and a roof in their 3D world) is open from ana.
- **The same shot from inside their slice is stopped by the wall.** An arrow from too far off, or with too little w,
  runs its last metres inside the slice and can still catch a wall. Get closer, or further out in w.

## Playing

Tap one of the many to loose an arrow. The bicycle rides itself, and the bow solves the arc, leading a walking target.
The ring over each of them says what a shot from here would do: green lands, amber catches a wall, grey falls short.
Drag to look round; pinch or scroll to zoom. You have five lives. Clear the field for the next wave, which has more
of them and more bunkers. "demo" lets a bot shoot.

## What you're looking at

- **Main view.** The ground and your bicycle are your own 3D slice (the bicycle is cut at its own w). The many, their
  bunkers and all arrows are drawn where they would be with w flattened away: a projection, so you can see what you
  are shooting at from outside their world. The track's colour is its w: teal ana, rose kata, red at the gates.
  Bunkers are glass from outside and solid when you are in their slice.
- **Their world, from above.** Only what is in w = 0. You appear in it only at a gate, and your arrows only as they
  land.
- **From the side.** x across, w up. Their whole world is one line, the track loops out of it, and your arrows come
  down onto it.

## How it's built

- `js/game.js` (no DOM): the rules. The bicycle is Lean's, **imported** (`../../lean/js/dyn.js`: the Whipple
  benchmark in 4D, an LQR rider, pure pursuit; `bike.js` for its shapes), ridden by its autopilot. Arrows are points
  under gravity along −y. The bow's `arc()` treats x, z and w alike as "along the ground". Bunkers are five slabs
  each, with ±0.3 m of thickness in w. Hits are swept segment tests in 4D.
- `js/main.js`: the page. Its own small ray-march shader draws the bicycle's 4D shapes cut by your slice, the many,
  and the glass bunkers. An overlay draws the arrows and rings.
- `test/volley.selftest.mjs` (about 1 s): the arc lands on its mark; the bicycle laps and crosses twice a lap; the
  bunker shot from ana arrives and the same shot from in the slice is stopped; they never shoot while you're out of
  their slice and their arrows never leave w = 0; a bot clears a wave.

## Honest limits

- It is a demo: one track, waves 1–5 from one seed, no oracle and no levels.
- The bicycle is on rails (its autopilot): you don't steer or choose when to cross.
- The bow aims for you. The skill is choosing whom, from where, and when.
- The arrow doesn't inherit the bicycle's velocity (the archer is taken to compensate).
