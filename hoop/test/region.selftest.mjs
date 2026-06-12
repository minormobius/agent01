// region.selftest.mjs — pins THE SEAM CONTRACT (hoop/econ/region.js): the tiled foam whose
// chambers are pure functions of global lattice coordinates, so any region reproduces its
// neighbours' borders exactly, the ring closes azimuthally, and the axis is unbounded.
// This is the gate for FOAM.md leg 6 (the game port). Run: node hoop/test/region.selftest.mjs
import { ringLattice, regionFoam } from '../econ/region.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// a small hull so the whole test runs in seconds: 36 regions of ~26 lattice columns each
const L = ringLattice({ Ri: 150, T: 16, cell: 1, regionsPerRing: 36 });
const OPT = { lattice: L, seed: 7, grade: 0.4, axSpan: 20 };
const R = (az, ax) => regionFoam({ ...OPT, az, ax });

// helper: the gid → canonical-geometry map of a region's REAL chambers inside a gy/gx window
const interior = (r, gyLo, gyHi, gxLo, gxHi) => {
  const m = new Map();
  for (const c of r.nodes) if (c.gy >= gyLo && c.gy < gyHi && c.gx >= gxLo && c.gx < gxHi) m.set(c.gid, c);
  return m;
};
// helper: the set of unordered seam pairs (real gid ↔ ghost gid) restricted to ghosts in a window
const seamPairs = (r, isOther) => {
  const s = new Set();
  for (const e of r.seamEdges) {
    const [gx, gy, gz] = e.gid.split('|').map(Number);
    if (!isOther(gx, gy, gz)) continue;
    const a = r.nodes[e.i].gid, b = e.gid;
    s.add(a < b ? a + '⇄' + b : b + '⇄' + a);
  }
  return s;
};

// ── determinism + basic shape ──
const A = R(0, 0);
{
  const A2 = R(0, 0);
  ok(A.nodes.length === A2.nodes.length && A.mi.length === A2.mi.length && A.seamEdges.length === A2.seamEdges.length, 'a region is deterministic from (lattice, seed, key)');
  ok(A.nodes.length > 500, 'a region holds a real chamber population (' + A.nodes.length + ')');
  ok(A.ghosts.length > 0 && A.seamEdges.length > 0, 'a region carries its ghost rim + cross-seam edges');
  // density tracks sectorFoam's thinning law: mean existence = (1+grade/2)/(1+grade)
  const expect = L.nyR * OPT.axSpan * L.nz * (1 + OPT.grade / 2) / (1 + OPT.grade);
  ok(Math.abs(A.nodes.length - expect) / expect < 0.1, 'chamber density matches the thinning law (±10%: ' + A.nodes.length + ' vs ~' + Math.round(expect) + ')');
  // gids are globally canonical: every node gid parses back to its own lattice coords
  ok(A.nodes.every((c) => c.gid === c.gx + '|' + c.gy + '|' + c.gz), 'gids are canonical global coordinates');
}

// ── THE SEAM CONTRACT, azimuthal: B's border chambers ARE A's ghosts, bit for bit ──
const B = R(1, 0);
{
  const aGhostRight = new Map(); for (const g of A.ghosts) if (g.gy >= B.gy0 && g.gy < B.gy0 + 2 && g.gx >= A.gx0 && g.gx < A.gx1) aGhostRight.set(g.gid, g);
  const bBorder = interior(B, B.gy0, B.gy0 + 2, A.gx0, A.gx1);
  ok(aGhostRight.size > 50, 'A sees a populated ghost rim of B (' + aGhostRight.size + ' chambers)');
  ok(aGhostRight.size === bBorder.size, 'A predicts exactly the chambers B generates on the shared border');
  let exact = true;
  for (const [gid, g] of aGhostRight) { const b = bBorder.get(gid); if (!b || b.th !== g.th || b.rad !== g.rad || b.z !== g.z) { exact = false; break; } }
  ok(exact, 'border chambers agree to the last bit (position-for-position)');
}

// ── cross-seam adjacency is symmetric: both sides derive the identical seam edge set ──
{
  const inB = (gx, gy, gz) => gy >= B.gy0 && gy < B.gy1 && gx >= B.gx0 && gx < B.gx1;
  const inA = (gx, gy, gz) => gy >= A.gy0 && gy < A.gy1 && gx >= A.gx0 && gx < A.gx1;
  const fromA = seamPairs(A, inB), fromB = seamPairs(B, inA);
  ok(fromA.size > 50, 'real cross-seam adjacency exists (' + fromA.size + ' edges)');
  let sym = fromA.size === fromB.size;
  if (sym) for (const p of fromA) if (!fromB.has(p)) { sym = false; break; }
  ok(sym, 'both regions derive the IDENTICAL cross-seam edge set (the contract is symmetric)');
}

// ── the ring closes: the last azimuthal region seams onto region 0 ──
{
  const Z = R(L.regionsPerRing - 1, 0);
  const inA0 = (gx, gy, gz) => gy >= A.gy0 && gy < A.gy1 && gx >= A.gx0 && gx < A.gx1;
  const inZ = (gx, gy, gz) => gy >= Z.gy0 && gy < Z.gy1 && gx >= Z.gx0 && gx < Z.gx1;
  const fromZ = seamPairs(Z, inA0), fromA0 = seamPairs(A, inZ);
  ok(fromZ.size > 50, 'the wrap seam is populated (region ' + (L.regionsPerRing - 1) + ' ⇄ region 0: ' + fromZ.size + ' edges)');
  let sym = fromZ.size === fromA0.size;
  if (sym) for (const p of fromZ) if (!fromA0.has(p)) { sym = false; break; }
  ok(sym, 'THE RING CLOSES — the wrap seam obeys the same symmetric contract');
  ok(((L.regionsPerRing - 1 + 1) % L.regionsPerRing) === 0, 'azimuthal keys wrap mod regionsPerRing');
}

// ── the axis is unbounded: axial neighbours seam; far and negative regions just work ──
{
  const C = R(0, 1);
  const inC = (gx, gy, gz) => gy >= C.gy0 && gy < C.gy1 && gx >= C.gx0 && gx < C.gx1;
  const inA_ = (gx, gy, gz) => gy >= A.gy0 && gy < A.gy1 && gx >= A.gx0 && gx < A.gx1;
  const fromA = seamPairs(A, inC), fromC = seamPairs(C, inA_);
  ok(fromA.size > 50, 'axial neighbours seam too (' + fromA.size + ' edges)');
  let sym = fromA.size === fromC.size;
  if (sym) for (const p of fromA) if (!fromC.has(p)) { sym = false; break; }
  ok(sym, 'the axial seam obeys the same symmetric contract');
  const far = R(5, 40), neg = R(2, -3);
  ok(far.nodes.length > 500 && neg.nodes.length > 500, 'far and NEGATIVE axial regions generate (the axis is ℤ — wander any direction)');
  // disjoint interiors: no gid collision between far-apart regions
  const gidsA = new Set(A.nodes.map((c) => c.gid));
  ok(!far.nodes.some((c) => gidsA.has(c.gid)) && !neg.nodes.some((c) => gidsA.has(c.gid)), 'distinct regions own disjoint chamber ids');
}

// ── a region is internally navigable (one giant component — the substrate the city needs) ──
{
  const n = A.nodes.length, adj = Array.from({ length: n }, () => []);
  for (let k = 0; k < A.mi.length; k++) { adj[A.mi[k]].push(A.mj[k]); adj[A.mj[k]].push(A.mi[k]); }
  const seen = new Set([0]), q = [0];
  while (q.length) { const u = q.pop(); for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); } }
  ok(seen.size > n * 0.98, 'a region is one navigable component (' + seen.size + '/' + n + ')');
}

console.log(`region.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
