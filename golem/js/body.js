// golem — body-level readings over a creature's cubes. Everything here is
// computed FROM per-cube local state (votes, beliefs, positions); nothing
// feeds back into the NCA. Pure module, node-testable (body.selftest.mjs).

import { GRID, NC, NEIGHBORS } from './nca.js';

// Lattice (a0,a1,a2) -> world. binvox arrays are [x][z][y] and ShapeNet is
// y-up, so lattice axis2 is world-up. Same convention as tjs/cube.
export function latticeToWorld(cell) {
  const a0 = Math.floor(cell / (GRID * GRID));
  const a1 = Math.floor(cell / GRID) % GRID;
  const a2 = cell % GRID;
  const h = (GRID - 1) / 2;
  return [a0 - h, a2 - h, a1 - h]; // x, y(up), z
}

// Connected components over face adjacency. structure: Uint8Array(NCELLS).
// Returns an array of arrays of cell indices (largest first).
export function components(structure) {
  const seen = new Uint8Array(structure.length);
  const comps = [];
  const stack = [];
  for (let s = 0; s < structure.length; s++) {
    if (!structure[s] || seen[s]) continue;
    const comp = [];
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      for (let d = 1; d < 7; d++) {
        const n = NEIGHBORS[c * 7 + d];
        if (n >= 0 && structure[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

// Body readings of one creature (all its live cells).
// Returns { votes, lead, consensus, entropy, centroid, forward, minY, contact }
//  - votes: Float32Array(NC) vote fractions
//  - lead: winning class index; consensus: its fraction
//  - entropy: mean per-cube belief entropy, normalized to [0,1]
//  - centroid: [x,y,z] world (lattice-frame) center of mass
//  - forward: [x,0,z] unit — dominant horizontal axis (travel direction)
//  - minY: lowest cube world y; contact: cells within 0.5 of it (the "feet")
export function bodyStats(nca) {
  const live = nca.live, n = live.length;
  const votes = new Float32Array(NC);
  let entropy = 0;
  let cx = 0, cy = 0, cz = 0;
  let minY = Infinity;
  const pos = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const cell = live[i];
    votes[nca.vote(cell)]++;
    const p = nca.probs(cell);
    let e = 0;
    for (let k = 0; k < NC; k++) if (p[k] > 1e-9) e -= p[k] * Math.log(p[k]);
    entropy += e / Math.log(NC);
    const w = latticeToWorld(cell);
    pos[i * 3] = w[0]; pos[i * 3 + 1] = w[1]; pos[i * 3 + 2] = w[2];
    cx += w[0]; cy += w[1]; cz += w[2];
    if (w[1] < minY) minY = w[1];
  }
  if (n === 0) {
    return { votes, lead: 0, consensus: 0, entropy: 1, centroid: [0, 0, 0], forward: [1, 0, 0], minY: 0, contact: [] };
  }
  cx /= n; cy /= n; cz /= n;
  entropy /= n;
  let lead = 0;
  for (let k = 1; k < NC; k++) if (votes[k] > votes[lead]) lead = k;
  const consensus = votes[lead] / n;
  for (let k = 0; k < NC; k++) votes[k] /= n;

  // Dominant horizontal axis: power iteration on the 2x2 XZ covariance.
  let sxx = 0, sxz = 0, szz = 0;
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
  }
  let vx = 1, vz = 0.123; // slight asymmetry so a tie still converges
  for (let it = 0; it < 24; it++) {
    const nx = sxx * vx + sxz * vz, nz = sxz * vx + szz * vz;
    const m = Math.hypot(nx, nz) || 1;
    vx = nx / m; vz = nz / m;
  }
  if (vx < 0) { vx = -vx; vz = -vz; } // canonical sign

  const contact = [];
  let radius = 1;
  for (let i = 0; i < n; i++) {
    if (pos[i * 3 + 1] < minY + 0.5) contact.push(live[i]);
    const rr = Math.hypot(pos[i * 3] - cx, pos[i * 3 + 2] - cz);
    if (rr > radius) radius = rr;
  }
  return { votes, lead, consensus, entropy, centroid: [cx, cy, cz], forward: [vx, 0, vz], minY, contact, radius };
}
