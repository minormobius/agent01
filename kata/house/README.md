# HOUSE

Walk through a four-dimensional room: [kata.mino.mobi/house/](https://kata.mino.mobi/house/).

The first building. A hinge is only as good as its door, and a door only as good as its room, so here is the room,
and you can go in and out of it.

## The room

It is a [CAD⁴ part](../cad4/#room) (`room` in `../cad4/js/parts.js`), a feature tree like the others:

- **The floor is a volume.** You can walk along x, z and w; y is up. The room is 4 across each way and 2.6 high.
- **Eight walls.** Six round the floor (two facing each floor direction), the floor itself and the ceiling. Each is a
  3D slab. A room is a hollow tesseract.
- **The doorway is a hole in three directions:** 2 high, 0.9 wide along z, 1.2 wide along w, through the +x wall.
- **The door** is a slab a little larger than the hole, lying on the wall's outer face, hung on a pin that is a plane
  (y–w) and swinging in x–z. CAD⁴ checks it clears the wall from 0° to 110°.
- **Two windows** (in the −x wall and the +w wall), and **a table on four legs**, at the corners of a tetrahedron: a
  3D floor needs four points to stand on.

## Walking

`js/walk.js` (no DOM). You are two balls, hips and head. You carry three floor directions: ahead, right, and the one
you can't see. Each step you turn, move, fall, and are pushed out of anything you are in along the distance
function's gradient, which is the way out of a wall in all four directions at once. The distance function is the
kernel's, compiled from the room's tree; the picture is the same tree compiled to GLSL. So what you see and what
stops you cannot disagree.

You see the 3D slice through your eye that holds ahead, right and up. The left pad walks; dragging looks round; the
right pad turns you toward the direction you can't see (it comes round in front of you and another leaves). ⊞ squares
you up to the room.

What tells you where you are, since one direction is always missing:

- the **caption**: which of ±x, ±z, ±w is ahead, right and unseen, and where you stand;
- the **map**: the floor's three directions, the room as a cube, the doorway, you, where you face, and dashed the
  unseen direction;
- the **walls**, tinted by the floor direction they face (x warm, z grey, w teal for ana and rose for kata), and the
  **floor**, chequered in all three directions so walking any of them changes it.

Things to try: stand at the doorway and step ana (Z or C, or turn and walk). The opening closes to wall while your
slice still shows the door standing open beside you. Turn a quarter into the unseen and the room's fourth pair of
walls is in front of you.

## Limits

A boolean's distance is only a lower bound, so a hole's cutter runs well past its wall; otherwise its end face stops
you in mid-air (this happened). No stairs, no step-up: anything taller than nothing stops your feet. The door pushes
you if it closes on you, and does not care. One room.

## Test

```bash
node kata/house/test/house.selftest.mjs   # ~1 s, 8 checks
```
