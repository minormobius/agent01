/* Shared test harness for Orb: loads the engine (plain IIFEs on globalThis.ORB)
   and builds the control meshes the analysis compares the sphere against. */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadOrb() {
  for (const f of ["prng", "sphere", "torus", "rules", "solve"]) await import(path.join(here, `../js/${f}.js`));
  return globalThis.ORB;
}

/* Tori, not rectangles: no edges or corners, so the only difference from the
   sphere is the neighbourhood itself. */
export function squareTorus(w, h, diag = true) {
  const nbrs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ns = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!diag && dx && dy) continue;
      ns.push(((y + dy + h) % h) * w + ((x + dx + w) % w));
    }
    nbrs.push(ns);
  }
  return { n: w * h, nbrs };
}

export function hexTorus(w, h) { // axial coordinates, w and h even
  const nbrs = [], D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++)
    nbrs.push(D.map(([dq, dr]) => ((r + dr + h) % h) * w + ((q + dq + w) % w)));
  return { n: w * h, nbrs };
}
