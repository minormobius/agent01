/* KATABASIS's levels: caves carved from rock, voxel by voxel, by a recipe (balls, boxes, tubes in 4D), so
   each is a few lines rather than a 4D drawing. Coordinates are voxels; you start upright, which is: right
   +x, up +y, forward +z, and w the way you can't see. A voxel is a quarter of your height.
   Every level carries its par (the fewest flips) and what it's about, and the selftest proves both: the
   solver finds the par exactly; a level that needs flips can't be done on foot; one about turning can't be
   walked in the slice you start in; and one about w takes more flips without standing on a wall in w. */
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
  L("round", "A wall across the hall, and no way round it in the slice you're in. In w it stops short: turn and twist till w swings into view, and walk round.",
    [34, 16, 18, 22], [6, 3, 7, 13],
    (c) => {
      c.box([3, 2, 3, 3], [31, 14, 15, 20]); // a long hall, thick in w
      c.box([15, 0, 0, 9], [19, 16, 18, 22], 1); // a wall across it, but only from w = 9 on
      c.box([24, 2, 7, 4], [27, 3, 10, 7], 2); // the crystal, low in w, on the floor beyond the wall
    }, 0, "turning"),
  L("wall", "The crystal is high on the far wall. Flip AHEAD: that wall becomes your floor.",
    [24, 28, 24, 14], [10, 3, 6, 5],
    (c) => {
      c.box([3, 2, 3, 2], [21, 26, 21, 12]); // a tall hall
      c.box([9, 20, 20, 6], [12, 22, 21, 8], 2); // the crystal, on the far wall, high up
    }, 1, "flipping"),
  L("kata", "The crystal is on the wall you can't see, down in w, far from every other. Turn and twist till you face it and flip AHEAD, or just flip KATA.",
    [26, 18, 26, 18], [6, 3, 6, 9],
    (c) => {
      c.box([3, 2, 3, 2], [23, 16, 23, 16]); // a room, as deep in w as it's wide
      c.box([12, 8, 12, 2], [14, 10, 14, 3], 2); // the crystal, on the kata wall, in the middle of it
    }, 1, "w"),
  L("ceiling", "The crystal hangs from the middle of the ceiling. No one flip puts the ceiling under you.",
    [26, 26, 26, 16], [6, 3, 6, 6],
    (c) => {
      c.box([3, 2, 3, 2], [23, 23, 23, 14]); // a hall
      c.box([12, 22, 12, 7], [14, 23, 14, 9], 2); // the crystal, on the ceiling, far from every wall
    }, 2, "flipping"),
  L("shaft", "The crystal is up a shaft too narrow to flip in. Only one wall runs on into it, and it's in w.",
    [26, 34, 26, 18], [6, 3, 6, 9],
    (c) => {
      c.box([3, 2, 3, 2], [23, 20, 23, 15]); // a hall
      c.box([11, 20, 11, 11], [15, 32, 15, 15]); // a shaft up from the ceiling, flush with the ana wall
      c.box([12, 30, 12, 13], [14, 32, 14, 15], 2); // the crystal, at the top
    }, 1, "w"),
];

export function build(level) {
  const c = new Cave(...level.dims);
  level.build(c);
  c.erode(level.name.length * 7919 + level.dims.reduce((a, b) => a * 31 + b, 0)); // weathered, the same way every time
  return { cave: c, start: { c: level.start.slice(), o: 0 } };
}
