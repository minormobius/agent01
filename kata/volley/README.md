# VOLLEY (a demo)

One archer on a 4D bicycle against the many, at `kata.mino.mobi/volley/`. The many live in a single 3D slice of the
world, w = 0.

## The idea

The many are 3D people. They stand, see and shoot in their slice and nowhere else. The arena is Lean's: its walled
basin and its track, an oval (55 × 48 m) whose w swings ±10 m twice a lap. So you ride ana of them, then kata, and
four times a lap you ride through their world. Everything in the game follows from that:

- **They see you only while your body cuts their slice** (|w| < 0.6 m). The rest of the lap you don't exist for them.
- **Their arrows never leave w = 0,** so they can hit you only at a crossing.
- **Your arrows cross w.** One loosed from 10 m ana is in their slice only at the end of its flight. It doesn't pass
  their walls; it arrives inside them. A closed bunker (four walls and a roof in their 3D world) is open from ana.
- **The same shot from inside their slice is stopped by the wall.** An arrow from too far off, or with too little w,
  runs its last metres inside the slice and can still catch a wall. Get closer, or further out in w.

## Playing

Tap one of the many to loose an arrow. The bicycle rides itself, and the bow solves the arc, leading a walking target.
The ring over each of them says what a shot from here would do: green lands, amber catches a wall, grey falls short.
Drag to look round; pinch or scroll to zoom. You have five lives. Clear the field for the next wave, which has more
of them and more bunkers. "demo" lets a bot shoot.

## What you're looking at

- **Main view.** Lean's arena, drawn by Lean's renderer, from a camera riding behind you. The land is your own 3D
  slice (x, y, z at the bicycle's w), so the track narrows and ends ahead where it leaves your slice, and its kerbs
  say which way: teal ana, rose kata. The many, their bunkers, your bicycle and all arrows are drawn where they would
  be with w flattened away: a projection, so you can see what you are shooting at from outside their world. Bunkers
  are glass from outside and solid when you are in their slice.
- **Their world, from above.** Only what is in w = 0. You appear in it only at a gate, and your arrows only as they
  land.
- **From the side.** x across, w up. Their whole world is one line, the track loops out of it, and your arrows come
  down onto it.

## How it's built

- `js/game.js` (no DOM): the rules. The bicycle is Lean's, **imported** (`../../lean/js/dyn.js`: the Whipple
  benchmark in 4D, an LQR rider, pure pursuit; `bike.js` for its shapes), ridden by its autopilot. Arrows are points
  under gravity along −y. The bow's `arc()` treats x, z and w alike as "along the ground". Bunkers are five slabs
  each, with ±0.3 m of thickness in w. Hits are swept segment tests in 4D.
- `js/main.js`: the page. It draws with Lean's `Renderer` and world (**imported**: `../../lean/js/render.js`,
  `world.js`). Lean's shader gained `props()` for this: figures and boxes of one slice, flattened along the direction
  you can't see, off unless set, so Lean, TAILSPIN, Fall Line and WAKE draw as before. An overlay draws the arrows
  and rings. The game's coordinates have the basin's middle as origin and their slice at w = 0; `ORIGIN` and the
  ground height take them to Lean's world.
- The first cut had its own bare-grid shader and an ellipse track. It worked, but it had none of Lean's arena.
- `test/volley.selftest.mjs` (about 1 s): the arc lands on its mark; the bicycle laps and crosses four times a lap; the
  bunker shot from ana arrives and the same shot from in the slice is stopped; they never shoot while you're out of
  their slice and their arrows never leave w = 0; a bot clears a wave.

## Honest limits

- It is a demo: Lean's track, waves 1–5 from one seed, no oracle and no levels.
- The bicycle is on rails (its autopilot): you don't steer or choose when to cross.
- The bow aims for you. The skill is choosing whom, from where, and when.
- The arrow doesn't inherit the bicycle's velocity (the archer is taken to compensate).
- The bicycle is drawn flattened too. It leans a few degrees into w here, and cut exactly at its own w everything
  above the hubs fell out of the picture.
