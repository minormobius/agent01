/* KATABASIS's levels: caves carved from rock, voxel by voxel, by a recipe (balls, boxes, tubes in 4D), so
   each is a few lines rather than a 4D drawing. Coordinates are voxels; you start upright, which is: right
   +x, up +y, forward +z, and w the way you can't see. A voxel is a quarter of your height.
   Every level carries its par (the fewest flips) and what it's about, and the selftest proves both: the
   solver finds the par exactly, and a level that says it needs flips can't be done on foot. */
import { Cave } from "./cave.js";

const L = (name, line, dims, start, build, par, needs) => ({ name, line, dims, start, build, par, needs });
export const LEVELS = [
  L("down", "Walk. You step up a voxel without thinking, and drop as far as you like.",
    [24, 30, 56, 8], [10, 21, 6, 3],
    (c) => {
      c.box([6, 20, 3, 2], [16, 27, 13, 6]); // the mouth
      // a passage that winds down, ledge by ledge
      for (let i = 0; i < 9; i++) c.box([6 + (i % 2), 19 - 2 * i, 11 + 4 * i, 2], [16 + (i % 2), 26 - 2 * i, 17 + 4 * i, 6]);
      c.box([5, 2, 46, 2], [19, 12, 54, 6]); // the bottom
      c.box([11, 2, 50, 3], [13, 4, 52, 5], 2); // the crystal, on the floor
    }, 0, "walking"),
  L("wall", "The crystal is high on the far wall. Flip AHEAD: that wall becomes your floor.",
    [24, 28, 24, 14], [10, 3, 6, 5],
    (c) => {
      c.box([3, 2, 3, 2], [21, 26, 21, 12]); // a tall hall
      c.box([9, 20, 20, 6], [12, 22, 21, 8], 2); // the crystal, on the far wall, high up
    }, 1, "flipping"),
  L("kata", "The crystal is somewhere you can't see: down in w. Flip KATA, and w is your up and down.",
    [24, 16, 24, 20], [10, 3, 10, 9],
    (c) => {
      c.box([3, 2, 3, 6], [21, 13, 21, 18]); // a room, thick in w
      c.box([8, 3, 12, 1], [12, 9, 16, 6]); // a pit, in w: under the room's kata wall
      c.box([9, 4, 13, 1], [11, 6, 15, 2], 2); // the crystal, at the bottom of it
    }, 1, "w"),
  L("ceiling", "The crystal hangs from the middle of the ceiling. No one flip puts the ceiling under you.",
    [26, 26, 26, 16], [6, 3, 6, 6],
    (c) => {
      c.box([3, 2, 3, 2], [23, 23, 23, 14]); // a hall
      c.box([12, 22, 12, 7], [14, 23, 14, 9], 2); // the crystal, on the ceiling, far from every wall
    }, 2, "flipping"),
  L("under", "A wall you can't get round, in the slice you're in. In w it stops short. Go round it there.",
    [34, 16, 18, 22], [6, 3, 7, 13],
    (c) => {
      c.box([3, 2, 3, 3], [31, 14, 15, 20]); // a long hall, thick in w
      c.box([15, 0, 0, 9], [19, 16, 18, 22], 1); // a wall across it, but only from w = 9 on: under it, in w, there's a way
      c.box([24, 2, 7, 4], [27, 3, 10, 7], 2); // the crystal, low in w, on the floor beyond the wall
    }, 2, "w"),
];

export function build(level) {
  const c = new Cave(...level.dims);
  level.build(c);
  c.erode(level.name.length * 7919 + level.dims.reduce((a, b) => a * 31 + b, 0)); // weathered, the same way every time
  return { cave: c, start: { c: level.start.slice(), o: 0 } };
}
