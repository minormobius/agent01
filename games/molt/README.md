# Molt: snake on the snake

Classic snake, played on the skin of a snake's body. Once you're 8 long you
can **molt**: you dive into your own body, and it becomes the next world.
A long, twisty snake makes a big, strange world. Each level down, food is
worth one more point.

## The world is a body

A snake's body, read from tail to head, is a word of turns: `S`, `L` or
`R`, one letter for each cell between the two ends. Turn every cell of the
body into a cube and glue consecutive cubes face to face. The world is the
**surface of that chain of cubes**, with every face cut into a 3 × 3 grid
(C = 3).

The surface is built from the word alone (`js/duct.js`), never from where
the cubes happen to sit in space. Two coils of a body that lay side by
side stay two separate walls, as they would on a real snake. So the
surface is always a sphere: a capsule with a cap at the head and one at
the tail.

What follows from that, and what the selftest checks on 131 bodies,
including coils and spirals whose flat layout overlaps itself:

- **The same size whatever the shape.** Every body cube shows exactly 4
  faces. A straight cube shows top, bottom and both side walls. A corner
  cube shows top, bottom and both *outer* walls, and no inner wall. So a
  body L long makes C²(4L + 2) cells. A bend only moves cells from the
  inside of the turn to the outside: the extra tiles land on the wide end.
- **Every cell is a square with four neighbours.** The curvature lives at
  the corners where cells meet. Where 3 squares meet (the outside of a
  bend, and each cap's cube corners) the surface curves +90°. Where 5 meet
  (the inside of a bend) it curves −90°. In a U-turn the two inside corners
  merge into one where 6 meet (−180°). The total is always 720°, the
  curvature of a sphere (V − E + F = 2).
- **Straight on comes back.** Go straight and you come back where you
  started: round the tube after 12 cells, or along it and over both caps
  after 2C(L + 1).

## Seeing it: the net

From outside a square tube you can only see one face at a time, and every
turn to the side would take you out of view. So while you play, the
surface around the head is **unfolded flat**, the way a cube's net lies
flat. The head's face sits in the middle, with its neighbours laid out
across the edges they share, and theirs beyond, out to the edge of the
screen (`js/view.js`).

- On a straight stretch you see the whole tube unrolled around you.
- Where the world curves, the net can't lie flat, and it shows it. A 90°
  gap opens at a cube's corner. A face that would overlap at the inside of
  a bend is left out until you get closer.
- The net is laid out again every time the head crosses onto another face.
  It keeps its orientation (parallel transport over the fold), so a
  direction on screen means the same thing on both sides of the fold.
  That's what keeps the controls classic snake on a world full of corners.

The molt is shown in 3D: the screen fades as you dive into your head, the
whole new world appears (the shape of the body you just left, every bend in
place), then the camera swoops down onto your head and the net fades back in.

## Playing

- **Steer:** arrow keys or WASD. Or swipe anywhere: a short swipe is
  enough, and you don't have to lift your finger between turns, so right
  then up in one gesture queues both turns. On touch screens there's also a
  thumb pad (`pad` toggles it). Turns queue two deep.
- **Molt:** M, or the MOLT button. It appears at length 8 and shows the
  next world's size and bends.
- You start each world at the middle of its head cap, crawling out over
  the head of the snake you were.
- Food grows you by one cell and is worth (depth + 1) points. The bigger
  the world, the more food there is.
- Haptics: a tap when you eat, a thump when you molt, a buzz when you bite.

## Files

- `js/duct.js`: word → surface. It builds faces, cells, neighbours, face
  links for unfolding, the curvature census, a drawing embedding (a duct
  0.72 wide down the middle of each body cell, so coils show a gap), and
  `wordOf` (body → word). No DOM.
- `js/game.js`: the rules. Steering by side, straight on by default,
  growth, food, death, and molting. No DOM.
- `js/view.js`: the net, the camera that follows the head, and the 3D
  reveal.
- `js/main.js`: the clock, input (keys, swipes, pad), the HUD, and the
  molt sequence.
- `test/molt.selftest.mjs`: 18 checks, under a second.

## Next

- Leaderboards: depth and score, through the board kit.
- A treadmill mode, where the parent keeps crawling while you're inside
  it, so rings appear at its head and vanish at its tail.
- Portals where the parent lay against itself.
- Climbing back out.
