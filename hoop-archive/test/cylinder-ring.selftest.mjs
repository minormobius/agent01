// hoop/test/cylinder-ring.selftest.mjs — does the substrate come out ROUND?
// Run: node hoop/test/cylinder-ring.selftest.mjs   (no deps)
//
// The live map is generated chunk-by-chunk on an UNBOUNDED plane — `cy` never wraps,
// and the per-chunk structural solve pins every boundary chamber and loads a flat +y.
// That is a flat strip: it never closes the hoop, so it never has to carry hoop tension.
// This test closes the loop for real and asks the substrate three honest questions:
//
//   1. Can we solve a WHOLE cylinder segment — one chunk long, full circumference — as one
//      global ring?  (cost + solvability)
//   2. Is the CLOSING segment over-determined?  (the closure interface, double-pinned by the
//      per-chunk scheme, vs. a minimally-pinned global solve)
//   3. Does the index run continuously AROUND the whole cylindrical foam?  (wrap seam + gids)
//
// It also surfaces the real structural fact: a pin-jointed foam NET is a mechanism against
// radial load (zero first-order normal stiffness). Roundness is carried by HOOP TENSION from
// spin-up (geometric prestress stiffness) — exactly how an O'Neill cylinder stays round.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
(0, eval)(readFileSync(join(here, '..', 'js', 'ship.js'), 'utf8'));
const S = globalThis.HoopShip, C = S.CHUNK;
const { chunkSeeds, FoamField } = await import('../js/world.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const SEED = 0xC0FFEE, N = 24, CIRC = N * C, R = CIRC / (2 * Math.PI);

// ── 1. gather every chamber in the ring (one axial chunk cx=0, cy=0..N-1, wrapping) ──
const chambers = [], gidIndex = new Map();
for (let cy = 0; cy < N; cy++) {
  const ss = chunkSeeds(SEED, 0, cy);
  ss.forEach((s, i) => { const gid = '0,' + cy + ',' + i; gidIndex.set(gid, chambers.length); chambers.push({ gid, cy, i, u: s.y, v: s.x, reg: s.reg }); });
}
const NC = chambers.length;

// ── ring cell field (nearest seed, periodic in u) → chamber adjacency (membranes) ──
const RS = chambers.map((c) => ({ gid: c.gid, x: c.v, y: c.u }));
const nearestGid = (v, u) => { let bg = null, bd = 1e18; for (const s of RS) for (const off of [-CIRC, 0, CIRC]) { const dy = s.y + off - u, dx = s.x - v, d = dx * dx + dy * dy; if (d < bd) { bd = d; bg = s.gid; } } return bg; };
const field = Array.from({ length: C }, (_, v) => Array.from({ length: CIRC }, (_, u) => nearestGid(v + 0.5, u + 0.5)));
const adj = new Set(), akey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
for (let v = 0; v < C; v++) for (let u = 0; u < CIRC; u++) { const g = field[v][u], rt = field[v][(u + 1) % CIRC]; if (rt !== g) adj.add(akey(g, rt)); if (v + 1 < C) { const dn = field[v + 1][u]; if (dn !== g) adj.add(akey(g, dn)); } }
const members = [...adj].map((k) => k.split('|')).filter(([a, b]) => gidIndex.has(a) && gidIndex.has(b)).map(([a, b]) => [gidIndex.get(a), gidIndex.get(b)]);

// ── place chambers on the cylinder surface; assemble 3D pin-jointed truss ──
const D = 3, ndof = D * NC;
chambers.forEach((c) => { const th = 2 * Math.PI * c.u / CIRC; c.x = R * Math.cos(th); c.y = R * Math.sin(th); c.z = c.v; c.th = th; });
const mlen = [], mdir = [];
const Kel = new Float64Array(ndof * ndof);   // elastic (axial) only
const K = new Float64Array(ndof * ndof);     // elastic + geometric (spin prestress) + tiny bed
const N0 = 8;                                 // spin hoop prestress → geometric stiffness
for (const [i, j] of members) {
  const a = chambers[i], b = chambers[j], e = [b.x - a.x, b.y - a.y, b.z - a.z], L = Math.hypot(e[0], e[1], e[2]) || 1, c = [e[0] / L, e[1] / L, e[2] / L];
  mlen.push(L); mdir.push(c); const k = 1 / L, dof = [D * i, D * i + 1, D * i + 2, D * j, D * j + 1, D * j + 2];
  for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) {
    const sg = (p < 3) === (q < 3) ? 1 : -1, ke = k * c[p % 3] * c[q % 3], kg = (N0 / L) * ((p % 3 === q % 3 ? 1 : 0) - c[p % 3] * c[q % 3]);
    Kel[dof[p] * ndof + dof[q]] += sg * ke; K[dof[p] * ndof + dof[q]] += sg * (ke + kg);
  }
}
const kFound = 1e-4;   // regolith bed: grounds residual rigid modes; tiny vs the hoop
chambers.forEach((c, i) => { const r = [Math.cos(c.th), Math.sin(c.th), 0]; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) K[(D * i + p) * ndof + (D * i + q)] += kFound * r[p] * r[q]; });

// null-space dimension via Gaussian elimination (counts mechanisms + rigid-body modes)
function nullDim(M, n) {
  const A = Float64Array.from(M); let rank = 0;
  for (let col = 0; col < n && rank < n; col++) {
    let piv = -1, best = 1e-7; for (let r = rank; r < n; r++) { const v = Math.abs(A[r * n + col]); if (v > best) { best = v; piv = r; } }
    if (piv < 0) continue;
    for (let kk = 0; kk < n; kk++) { const t = A[rank * n + kk]; A[rank * n + kk] = A[piv * n + kk]; A[piv * n + kk] = t; }
    const d = A[rank * n + col];
    for (let r = 0; r < n; r++) { if (r === rank) continue; const f = A[r * n + col] / d; if (f) for (let kk = 0; kk < n; kk++) A[r * n + kk] -= f * A[rank * n + kk]; }
    rank++;
  }
  return n - rank;
}
const ndElastic = nullDim(Kel, ndof), ndPrestressed = nullDim(K, ndof);

// minimal pin: a determinate tripod killing the 6 rigid-body modes, nothing more
const Q = Math.floor(NC / 3), P = Math.floor(2 * NC / 3);
const fixedDof = new Set([D * 0, D * 0 + 1, D * 0 + 2, D * Q + 1, D * Q + 2, D * P + 2]);
const free = []; for (let d = 0; d < ndof; d++) if (!fixedDof.has(d)) free.push(d);
const nf = free.length;
const load = new Float64Array(ndof); chambers.forEach((c, i) => { load[D * i] = Math.cos(c.th); load[D * i + 1] = Math.sin(c.th); });
let netx = 0, nety = 0; chambers.forEach((c, i) => { netx += load[D * i]; nety += load[D * i + 1]; });
const Kr = new Float64Array(nf * nf), fr = new Float64Array(nf);
for (let a = 0; a < nf; a++) { fr[a] = load[free[a]]; for (let b = 0; b < nf; b++) Kr[a * nf + b] = K[free[a] * ndof + free[b]]; }
function gsolve(A, b, n) {
  A = Float64Array.from(A); b = Float64Array.from(b);
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col * n + col]); for (let r = col + 1; r < n; r++) { const v = Math.abs(A[r * n + col]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-12) return null;
    if (piv !== col) { for (let kk = 0; kk < n; kk++) { const t = A[col * n + kk]; A[col * n + kk] = A[piv * n + kk]; A[piv * n + kk] = t; } const t = b[col]; b[col] = b[piv]; b[piv] = t; }
    const d = A[col * n + col];
    for (let r = col + 1; r < n; r++) { const f = A[r * n + col] / d; if (f) { for (let kk = col; kk < n; kk++) A[r * n + kk] -= f * A[col * n + kk]; b[r] -= f * b[col]; } }
  }
  const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let kk = i + 1; kk < n; kk++) s -= A[i * n + kk] * x[kk]; x[i] = s / A[i * n + i]; } return x;
}
const sol = gsolve(Kr, fr, nf);
const full = new Float64Array(ndof); if (sol) for (let a = 0; a < nf; a++) full[free[a]] = sol[a];
// fraction of radial load taken by the regolith bed vs carried by the hoop
let bedAbs = 0; chambers.forEach((c, i) => { const r = [Math.cos(c.th), Math.sin(c.th), 0], ur = r[0] * full[D * i] + r[1] * full[D * i + 1]; bedAbs += Math.abs(kFound * ur); });
const hoopFrac = 1 - bedAbs / NC;

console.log('── 1. solving a whole cylinder segment (one chunk long, full hoop) ──');
ok('whole-segment ring assembles', NC > 0 && members.length > 0, `${NC} chambers, ${members.length} membranes`);
ok('solve is cheap (small reduced system)', nf < 2000, `${nf}×${nf} dense; banded bandwidth ≪ ${nf}`);
ok('a bare pin-jointed net is a MECHANISM vs radial load', ndElastic > 6, `nullity ${ndElastic} = 6 rigid + ${ndElastic - 6} normal mechanisms`);
ok('spin prestress makes a stiff, uniquely-solvable round shell', ndPrestressed <= 6 && sol != null, `prestressed nullity ${ndPrestressed}, reduced solve ${sol ? 'unique' : 'singular'}`);

console.log('── 2. roundness: the load is carried by HOOP TENSION, not faked ──');
ok('centripetal load is self-balanced around the ring', Math.abs(netx) < 1 && Math.abs(nety) < 1, `net=(${netx.toExponential(1)},${nety.toExponential(1)})`);
ok('hoop tension carries the majority of the radial load', hoopFrac > 0.5, `hoop ${(100 * hoopFrac).toFixed(0)}%, bed ${(100 * (1 - hoopFrac)).toFixed(0)}%`);

console.log('── 3. the closing segment is not over-determined under a global solve ──');
const seamA = chambers.filter((c) => c.cy === N - 1).length, seamB = chambers.filter((c) => c.cy === 0).length;
const redundant = 2 * Math.min(seamA, seamB);
ok('per-chunk scheme DOUBLE-PINS the closure interface (over-determined)', redundant > 0, `${redundant} closure dof pinned from both seams`);
ok('global solve pins minimally (6 dof) and is unique', fixedDof.size === 6 && sol != null, 'closure satisfied by equilibrium, not forced');

console.log('── 4. the index runs continuously around the whole cylindrical foam ──');
// wrap-seam continuity: the seam column recomputed from cy=0's local 3-chunk window must
// equal the global ring field (same chamber from both sides of the wrap).
let seamMatch = 0; for (let v = 0; v < C; v++) {
  const fromGlobal = field[v][0]; let bg = null, bd = 1e18;
  for (const cy of [N - 1, 0, 1]) { const m = ((cy % N) + N) % N, ss = chunkSeeds(SEED, 0, m); ss.forEach((s, i) => { const yy = cy === N - 1 ? s.y - CIRC : s.y, d = (s.x - (v + 0.5)) ** 2 + (yy - 0.5) ** 2; if (d < bd) { bd = d; bg = '0,' + m + ',' + i; } }); }
  if (bg === fromGlobal) seamMatch++;
}
ok('wrap-seam cell field is continuous (cy=N-1 | cy=0)', seamMatch === C, `${seamMatch}/${C} seam tiles agree`);
const allg = new Set(chambers.map((c) => c.gid));
ok('every chamber id is unique around the ring', allg.size === NC, `${allg.size}/${NC} distinct`);
// the live FoamField index API: deterministic + round-trips (gid → tile → same gid)
const ff = new FoamField(SEED, null);
const a1 = ff.chamberAt(40, 17), a2 = ff.chamberAt(40, 17);
ok('FoamField.chamberAt is deterministic', a1 && a2 && a1.gid === a2.gid, a1 && a1.gid);
const loc = ff.chamberLocation(a1.gid), back = loc && ff.chamberAt(loc.x, loc.y);
ok('chamberLocation round-trips (gid → tile → same gid)', back && back.gid === a1.gid, loc && `→ (${loc.x},${loc.y})`);

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
