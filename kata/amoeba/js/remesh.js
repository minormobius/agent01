/* AMOEBA — remeshing the membrane, in 3D and 4D. The membrane is one closed mesh, top, sides and underside alike:
   triangles in 3D, tetrahedra in 4D (its membrane is a 3-dimensional surface). As it flows (a pseudopod pushes out, the
   rear draws in, the cell spreads on the floor) its facets stretch and crowd. So, every few steps, the mesh is rebuilt
   where it needs it, by the operations of isotropic remeshing (Botsch & Kobbelt), made for any dimension:

   - SPLIT every edge longer than 1.5 × the target length (its halves, 0.75, stay clear of the collapse threshold, or
     the remesher undoes its own work) at its middle: every facet on the edge becomes two (in 3D the
     edge has two triangles on it; in 4D a whole ring of tetrahedra);
   - COLLAPSE every edge shorter than 0.6 × it (its two ends merge at the middle), unless that would pinch the surface,
     fold a facet over, or make a new long edge. Pinching is the LINK CONDITION: whatever the two ends' neighbourhoods
     share (vertices, edges, in 4D triangles) must belong to the edge's own neighbourhood. In 3D that is "the ends share
     only the two vertices across the edge"; in 4D it needs checking at every level;
   - FLIP (3D) an edge to the other diagonal of its two triangles when that brings the neighbour counts nearer six.

   The membrane's fields (the signalling's u and v) go with it: a new vertex takes the average of the edge's two ends, a
   merged one their average. Tangential smoothing (edge springs, in ./amoeba.js) then evens the points out. No DOM. */

const key = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
const sKey = (arr) => arr.slice().sort((x, y) => x - y).join(",");

/* a facet's normal, unnormalised (the generalised cross product), from its d points */
function normalOf(d, pts) {
  const [p0] = pts, e = pts.slice(1).map((p) => p.map((x, c) => x - p0[c]));
  if (d === 3) { const [u, v] = e; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
  const [u, v, w] = e, m = (i, j) => v[i] * w[j] - v[j] * w[i];
  return [u[1] * m(2, 3) - u[2] * m(1, 3) + u[3] * m(1, 2), -(u[0] * m(2, 3) - u[2] * m(0, 3) + u[3] * m(0, 2)), u[0] * m(1, 3) - u[1] * m(0, 3) + u[3] * m(0, 1), -(u[0] * m(1, 2) - u[1] * m(0, 2) + u[2] * m(0, 1))];
}
const subsets = (arr) => { const out = []; for (let m = 1; m < 1 << arr.length; m++) { const s = []; for (let j = 0; j < arr.length; j++) if (m & (1 << j)) s.push(arr[j]); out.push(s); } return out; };

/* the remesh, in place on plain arrays: P (array of points, d coordinates each), F (array of facets, d vertex indices
   each), fields (arrays of numbers per vertex). L: the target edge length. Returns the counts of each operation */
export function remeshArrays(P, F, fields, L, opts = {}) {
  const d = opts.d || P.find((p) => p).length, hi = 1.5 * L, lo = 0.6 * L, rounds = opts.rounds || (d === 3 ? 6 : 2), stats = { split: 0, collapse: 0, flip: 0 };
  const len = (a, b) => { let q = 0; for (let c = 0; c < d; c++) q += (P[a][c] - P[b][c]) ** 2; return Math.sqrt(q); };
  const unit = (n) => { const l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
  const dot = (x, y) => x.reduce((s, v, c) => s + v * y[c], 0);
  const nrm = (f) => unit(normalOf(d, f.map((i) => P[i])));
  const edgeFaces = () => { const m = new Map(); F.forEach((f, k) => { if (!f) return; for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) { const e = key(f[i], f[j]); const l = m.get(e); if (l) l.push(k); else m.set(e, [k]); } }); return m; };

  const T = opts.prof, tick = (k, t0) => { if (T) T[k] = (T[k] || 0) + performance.now() - t0; };
  let t0 = performance.now();
  // SPLIT, in rounds of edges that share no facet
  for (let round = 0; round < rounds; round++) {
    const ef = edgeFaces(), long = [];
    for (const [e, fs] of ef) { const a = Math.floor(e / 1048576), b = e % 1048576, l = len(a, b); if (l > hi) long.push([l, a, b, fs]); }
    if (!long.length) break;
    long.sort((x, y) => y[0] - x[0]); const used = new Set(); let n = 0;
    for (const [, a, b, fs] of long) {
      if (fs.some((k) => used.has(k))) continue; fs.forEach((k) => used.add(k));
      const m = P.length; P.push(P[a].map((x, c) => (x + P[b][c]) / 2)); for (const f of fields) f.push((f[a] + f[b]) / 2);
      // each facet on the edge becomes two through m: one with b replaced by m, one with a (in place, so its orientation
      // is kept)
      for (const k of fs) { const f = F[k], ia = f.indexOf(a), ib = f.indexOf(b), t1 = f.slice(), t2 = f.slice(); t1[ib] = m; t2[ia] = m; F[k] = t1; F.push(t2); }
      n++; stats.split++;
    }
    if (!n) break;
  }

  tick("split", t0); t0 = performance.now();
  // COLLAPSE, in rounds of edges whose neighbourhoods don't overlap
  for (let round = 0; round < rounds; round++) {
    const vf = new Map(); F.forEach((f, k) => { if (!f) return; for (const v of f) { const l = vf.get(v); if (l) l.push(k); else vf.set(v, [k]); } });
    const nbr = (v) => { const s = new Set(); for (const k of vf.get(v) || []) if (F[k]) for (const x of F[k]) if (x !== v) s.add(x); return s; };
    const ef = edgeFaces(), short = [];
    for (const [e, fs] of ef) { const a = Math.floor(e / 1048576), b = e % 1048576, l = len(a, b); if (l < lo) short.push([l, a, b, fs]); }
    if (!short.length) break;
    short.sort((x, y) => x[0] - y[0]); const locked = new Set(); let n = 0;
    for (const [, a, b, fs] of short) {
      if (locked.has(a) || locked.has(b) || fs.some((k) => !F[k])) continue;
      const Na = nbr(a), Nb = nbr(b);
      // the link condition, Lk(a) ∩ Lk(b) ⊆ Lk(ab), level by level, cheapest first. Vertices: the ends may share only
      // the vertices across the edge
      const across = new Set(); for (const k of fs) for (const x of F[k]) if (x !== a && x !== b) across.add(x);
      let ok = true; for (const x of Na) if (x !== b && Nb.has(x) && !across.has(x)) { ok = false; break; }
      if (!ok) continue;
      // edges (pairs that make a triangle with a and with b) must be edges across the edge; in 4D also no triangle may
      // make a tetrahedron with both
      if (d === 4) {
        const pairs = (v) => { const s = new Set(); for (const k of vf.get(v) || []) { const f = F[k]; if (!f || f.includes(v === a ? b : a)) continue; const r = f.filter((x) => x !== v); for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) s.add(key(r[i], r[j])); } return s; };
        const Pa2 = pairs(a), Pb2 = pairs(b), Pab = new Set(); for (const k of fs) { const r = F[k].filter((x) => x !== a && x !== b); Pab.add(key(r[0], r[1])); }
        for (const e of Pa2) if (Pb2.has(e) && !Pab.has(e)) { ok = false; break; }
        if (!ok) continue;
        const trip = (v) => { const s = new Set(); for (const k of vf.get(v) || []) { const f = F[k]; if (!f || f.includes(v === a ? b : a)) continue; s.add(sKey(f.filter((x) => x !== v))); } return s; };
        const Ta = trip(a), Tb = trip(b); for (const t of Ta) if (Tb.has(t)) { ok = false; break; }
        if (!ok) continue;
      } else {
        // (3D: a common edge x–y with triangles a x y and b x y would pinch)
        const pairs = (v) => { const s = new Set(); for (const k of vf.get(v) || []) { const f = F[k]; if (!f || f.includes(v === a ? b : a)) continue; const r = f.filter((x) => x !== v); s.add(key(r[0], r[1])); } return s; };
        const Pa2 = pairs(a), Pb2 = pairs(b); for (const e of Pa2) if (Pb2.has(e)) { ok = false; break; }
        if (!ok) continue;
      }
      // (and no vertex across the edge left with too few neighbours to be a surface)
      if ([...across].some((x) => nbr(x).size <= d)) continue;
      if (Na.size + Nb.size - across.size - 2 < d) continue;
      // the facets round a and b that survive, with both moved to the middle: none may fold or grow a long edge
      const mid = P[a].map((x, c) => (x + P[b][c]) / 2);
      const around = [...new Set([...(vf.get(a) || []), ...(vf.get(b) || [])])].filter((k) => !fs.includes(k) && F[k]);
      const before = around.map((k) => nrm(F[k]));
      const save = [P[a], P[b]]; P[a] = mid; P[b] = mid;
      around.forEach((k, q) => { if (!ok) return; const f = F[k]; if (dot(before[q], nrm(f)) < 0.3) ok = false; for (const x of f) if (x !== a && x !== b && len(a, x) > hi) ok = false; });
      if (!ok) { P[a] = save[0]; P[b] = save[1]; continue; }
      // merge b into a
      for (const f of fields) f[a] = (f[a] + f[b]) / 2;
      for (const k of fs) F[k] = null;
      for (const k of vf.get(b) || []) { if (!F[k]) continue; F[k] = F[k].map((x) => (x === b ? a : x)); }
      for (const x of [a, b, ...Na, ...Nb]) locked.add(x);
      P[b] = null; n++; stats.collapse++;
    }
    if (!n) break;
  }

  tick("collapse", t0); t0 = performance.now();
  // FLIP (3D), toward valence six
  if (d === 3) for (let round = 0; round < 4; round++) {
    const third = (f, a, b) => f.find((x) => x !== a && x !== b);
    const val = new Map(); for (const f of F) if (f) for (let j = 0; j < 3; j++) val.set(key(f[j], f[(j + 1) % 3]), 1);
    const deg = new Map(); for (const e of val.keys()) { const a = Math.floor(e / 1048576), b = e % 1048576; deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
    const ef = edgeFaces(), used = new Set(); let n = 0;
    for (const [e, fs] of ef) {
      if (fs.length !== 2 || fs.some((k) => used.has(k))) continue;
      const a = Math.floor(e / 1048576), b = e % 1048576, f1 = F[fs[0]], f2 = F[fs[1]], c = third(f1, a, b), dd = third(f2, a, b);
      if (val.has(key(c, dd))) continue;
      const dev = (x, k) => Math.abs((deg.get(x) || 0) + k - 6);
      if (dev(a, -1) + dev(b, -1) + dev(c, 1) + dev(dd, 1) >= dev(a, 0) + dev(b, 0) + dev(c, 0) + dev(dd, 0)) continue;
      const r1 = f1.indexOf(a), w1 = f1[(r1 + 1) % 3] === b, n1 = w1 ? [a, dd, c] : [a, c, dd], n2 = w1 ? [b, c, dd] : [b, dd, c];
      const o1 = nrm(f1), o2 = nrm(f2), m1 = nrm(n1), m2 = nrm(n2);
      if (dot(m1, o1) < 0.5 || dot(m2, o2) < 0.5 || dot(m1, m2) < 0.3) continue;
      F[fs[0]] = n1; F[fs[1]] = n2; fs.forEach((k) => used.add(k));
      deg.set(a, deg.get(a) - 1); deg.set(b, deg.get(b) - 1); deg.set(c, deg.get(c) + 1); deg.set(dd, deg.get(dd) + 1); val.set(key(c, dd), 1); val.delete(e);
      n++; stats.flip++;
    }
    if (!n) break;
  }
  tick("flip", t0);
  return stats;
}

/* compact: drop dead vertices and facets, renumber. Returns { P, F, fields, nv, nf } as typed arrays */
export function compact(P, F, fields, d = 3) {
  const map = new Int32Array(P.length).fill(-1); let nv = 0; P.forEach((p, i) => { if (p) map[i] = nv++; });
  const Pf = new Float64Array(nv * d); P.forEach((p, i) => { if (p) { const j = map[i]; for (let c = 0; c < d; c++) Pf[j * d + c] = p[c]; } });
  const live = F.filter((f) => f), Ff = new Int32Array(live.length * d); live.forEach((f, k) => { for (let j = 0; j < d; j++) Ff[k * d + j] = map[f[j]]; });
  const out = fields.map((f) => { const o = new Float64Array(nv); f.forEach((x, i) => { if (map[i] >= 0) o[map[i]] = x; }); return o; });
  return { P: Pf, F: Ff, fields: out, nv, nf: live.length };
}
