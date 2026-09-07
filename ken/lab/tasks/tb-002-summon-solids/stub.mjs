/* tb-002 · the do-nothing stub. NOT a mutant and not a solution: it is the
   floor arm. A check an empty implementation passes measures nothing. */
export const SOLIDS = {};
export const SOLID_NAMES = [];
export function constellation(solid, opts = {}) {
  const centre = opts.centre ?? [0, 0, 0];
  return { solid, centre, neighbours: [], seeds: [centre], extent: 0, r: opts.r ?? 1.6, aniso: opts.aniso ?? 2.2, rotate: opts.rotate ?? 0 };
}
export function bisectors() { return []; }
export function verify() { return { ok: true, maxNormalErrorDeg: 0, distanceSpread: 0, inradius: 0, faces: 0 }; }
export function clearanceNeeded() { return 0; }
