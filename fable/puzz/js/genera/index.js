// The genus registry. Adding a puzzle type to the whole site — generator,
// solver, difficulty grading, gallery, player — is one import + one line here.
import { binairo } from './binairo.js';
import { nonogram } from './nonogram.js';

export const GENERA = [binairo, nonogram];

export const GENERA_BY_ID = Object.fromEntries(GENERA.map((g) => [g.id, g]));

// Relative weight each genus gets in the seed→genus roll for the open atlas.
export const GENUS_WEIGHTS = {
  binairo: 5,
  nonogram: 5,
};
