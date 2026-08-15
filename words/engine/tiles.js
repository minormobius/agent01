// The tile set: what letters exist, what they are worth, and how the bag is
// filled and drawn from.
//
// 100 tiles: 98 letters + 2 blanks. The distribution is the familiar English
// one — it is tuned to the same language our lexicon is, and rebalancing it
// would invalidate every intuition a player brings with them. The INNOVATION on
// this surface is in the board (engine/board.js), not the bag.

import { rngFrom, shuffle } from './rng.js';

export const BLANK = '?';

/** Point value per letter. Blanks are worth nothing, forever. */
export const VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  [BLANK]: 0,
};

/** How many of each tile are in a full bag. */
export const DISTRIBUTION = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
  [BLANK]: 2,
};

export const RACK_SIZE = 7;

/** Total tiles in a full bag (100). */
export const BAG_SIZE = Object.values(DISTRIBUTION).reduce((a, b) => a + b, 0);

/** Value of a single tile. A tile played from a blank is always worth 0. */
export function tileValue(tile) {
  return VALUES[tile] ?? 0;
}

/**
 * A full bag, shuffled deterministically from `seed`.
 * Tiles are drawn from the END of the array (pop), so the array doubles as the
 * draw order and the remaining count is just `bag.length`.
 */
export function newBag(seed) {
  const bag = [];
  for (const [tile, n] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < n; i++) bag.push(tile);
  }
  bag.sort(); // canonical pre-shuffle order, so the seed alone fixes the result
  return shuffle(bag, rngFrom(`${seed}:bag`));
}

/** Draw up to `n` tiles off the end of the bag. Mutates `bag`. */
export function draw(bag, n) {
  const out = [];
  for (let i = 0; i < n && bag.length; i++) out.push(bag.pop());
  return out;
}

/** Refill a rack to RACK_SIZE from the bag. Mutates both. */
export function refill(rack, bag) {
  rack.push(...draw(bag, RACK_SIZE - rack.length));
  return rack;
}

/**
 * Put `tiles` back and re-shuffle, keyed by the ply so two exchanges in one
 * game never produce the same bag order. Mutates and returns `bag`.
 */
export function returnToBag(bag, tiles, seed, ply) {
  bag.push(...tiles);
  bag.sort();
  return shuffle(bag, rngFrom(`${seed}:exchange:${ply}`));
}

/** Sum of the tiles left on a rack — the end-of-game adjustment. */
export function rackValue(rack) {
  return rack.reduce((sum, t) => sum + tileValue(t), 0);
}
