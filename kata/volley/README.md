# VOLLEY (a demo)

A game of orientation, at `kata.mino.mobi/volley/`: one archer on a 4D bicycle against the many, who live in a single
3D slice of the world.

## The idea

The arena is Lean's: its walled basin, whose floor is a 3D space (x, z, w). The many are 3D people. They stand, see
and shoot in the slice w = 0 and nowhere else. You ride and steer, and you see only your own 3D slice: ahead, across
and up. The many are in your slice only where it meets their world, so **finding them is the game**. Ride to where
they are and turn until your slice holds them. Then shoot.

- **Steering.** The stick asks for a lean (Lean's bicycle, two steering axes, an ideal rider). Left and right turn you
  the ordinary way. Up and down turn your heading, and with it your whole slice, into the direction you can't see.
- **You start beside their world,** 10 m ana, with your slice parallel to theirs. None of them is in it.
- **The red line** on the ground is where their world crosses your slice. The many are along it.
- **They see you only while your body cuts their slice** (|w| < 0.6 m). Their arrows never leave w = 0.
- **Your arrows fly in the slice you loose them in,** to the point you tap. Loosed across w, an arrow is in their
  world only at the end of its flight: it doesn't pass a bunker's walls, it arrives inside. Loosed from inside their
  world, the wall stops it.

## Playing

- **Steer** with the stick, WASD or the arrow keys.
- **Tap** one of the many you can see to loose an arrow. The bow solves the arc and leads a walking target. Its ring
  says what the shot would do: green lands, amber catches a wall, grey falls short.
- **Drag** the view to look round; pinch or scroll to zoom.
- You have five lives. Clear the field for the next wave. "demo" lets a bot ride and shoot.

## The instruments

Both are in your own frame.

- **Radar:** from above, across and ahead. The many are coloured by which side of your slice they are: white in it,
  teal ana of it, rose kata. The red line is their world where it crosses your slice. When it's missing, their world
  is parallel to your slice: turn ↕.
- **Ahead against the unseen:** ahead across, the direction you can't see up. Your slice is the horizontal line. Bring
  the many onto it.

The HUD gives your distance from their world and how many degrees your slice is off theirs.

## How it's built

- `js/game.js` (no DOM): the rules. Lean's bicycle, **imported** (`../../lean/js/dyn.js`, `bike.js`, `world.js`), is
  stepped with the lean the stick asks for (the "easy" rider: no falling). It is turned back near the rim and held
  inside it. Arrows are points under gravity; `arc()` treats x, z and w alike as "along the ground". Bunkers are five
  slabs each, ±0.3 m thick in w. Hits are swept segment tests in 4D. `offSlice()` is how far one of the many is out
  of your slice. `bot()` rides at the nearest, turns onto it and shoots.
- `js/main.js`: the page. It uses Lean's `Renderer` and world, with the camera in your frame (F, your c, up; N = your
  d). Lean's shader gained `props()` for this: figures as 4D balls and boxes as 4D slabs of one slice, cut by your
  slice like everything else, plus that slice's trace on the ground. It is off unless set, so Lean, TAILSPIN, Fall
  Line and WAKE draw as before.
- `test/volley.selftest.mjs` (about 1 s):
  - the arc lands;
  - none of them is in your slice at the start;
  - ↕ turns your slice into the unseen;
  - the rim holds;
  - the bunker shot from ana arrives, and from in their slice is stopped;
  - they shoot only while you're in their slice, with arrows that never leave w = 0;
  - the bot finds and clears a wave.

## How it got here

1. A shooting gallery on its own bare grid: the bike on rails, the many shown flattened. It worked, but it had none
   of Lean's arena.
2. The same, moved into Lean's arena. Still on rails, still shown to you.
3. This: you drive, you see only your slice, and the game is orientation.

## Honest limits

- It is a demo: waves 1–5 from one seed, no oracle, no levels.
- The bow aims for you once you've found them.
- The bicycle can't fall, and holds one speed.
- The bicycle is drawn pressed into your slice. Cut exactly, its lean into the unseen takes everything above the hubs
  out of the picture.
