/* AMOEBA — remeshing the membrane (3D). The membrane is one closed triangle mesh, top, sides and underside alike; as it
   flows (a pseudopod pushes out, the rear draws in, the cell spreads on the floor) its triangles stretch and crowd. So,
   every few steps, the mesh is rebuilt where it needs it, by the operations of isotropic remeshing (Botsch & Kobbelt):

   - SPLIT every edge longer than 4/3 of the target length at its middle (the two triangles on it become four);
   - COLLAPSE every edge shorter than 4/5 of it (its two ends merge at the middle), unless that would pinch the surface
     (the ends must share exactly the two neighbours across the edge), fold a triangle over, or make a new long edge;
   - FLIP an edge to the other diagonal of its two triangles when that brings the vertices' neighbour counts nearer six,
     and doesn't fold the surface.

   The membrane's fields (the signalling's u and v) go with it: a new vertex takes the average of the edge's two ends, a
   merged one their average. Tangential smoothing (edge springs, in ./amoeba.js) then evens the points out. No DOM. */

const key = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);

/* the remesh, in place on plain arrays: P (array of [x, y, z]), F (array of [a, b, c]), fields (arrays of numbers per
   vertex). L: the target edge length. Returns the counts of each operation */
export function remeshArrays(P, F, fields, L, opts = {}) {
  const hi = (4 / 3) * L, lo = (4 / 5) * L, stats = { split: 0, collapse: 0, flip: 0 };
  const len = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1], P[a][2] - P[b][2]);
  const normal = (a, b, c) => { const u = [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]], v = [P[c][0] - P[a][0], P[c][1] - P[a][1], P[c][2] - P[a][2]]; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
  const unit = (n) => { const l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
  const edgeFaces = () => { const m = new Map(); F.forEach((f, k) => { if (!f) return; for (let j = 0; j < 3; j++) { const e = key(f[j], f[(j + 1) % 3]); const l = m.get(e); if (l) l.push(k); else m.set(e, [k]); } }); return m; };
  const third = (f, a, b) => f.find((x) => x !== a && x !== b);

  // SPLIT, in rounds of edges that share no triangle
  for (let round = 0; round < 6; round++) {
    const ef = edgeFaces(), long = [];
    for (const [e, fs] of ef) { if (fs.length !== 2) continue; const a = Math.floor(e / 1048576), b = e % 1048576, l = len(a, b); if (l > hi) long.push([l, a, b, fs]); }
    if (!long.length) break;
    long.sort((x, y) => y[0] - x[0]); const used = new Set(); let n = 0;
    for (const [, a, b, fs] of long) {
      if (fs.some((k) => used.has(k))) continue; fs.forEach((k) => used.add(k));
      const m = P.length; P.push([(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2, (P[a][2] + P[b][2]) / 2]); for (const f of fields) f.push((f[a] + f[b]) / 2);
      for (const k of fs) {
        // the triangle (…a…b…) in its own winding: replace it by two, through m, keeping the winding
        const f = F[k], ia = f.indexOf(a), ib = f.indexOf(b), c = third(f, a, b);
        const t1 = f.slice(), t2 = f.slice(); t1[ib] = m; t2[ia] = m; F[k] = t1; F.push(t2); void c;
      }
      n++; stats.split++;
    }
    if (!n) break;
  }

  // COLLAPSE, in rounds of edges whose neighbourhoods don't overlap
  for (let round = 0; round < 6; round++) {
    const vf = new Map(); F.forEach((f, k) => { if (!f) return; for (const v of f) { const l = vf.get(v); if (l) l.push(k); else vf.set(v, [k]); } });
    const nbr = (v) => { const s = new Set(); for (const k of vf.get(v) || []) if (F[k]) for (const x of F[k]) if (x !== v) s.add(x); return s; };
    const ef = edgeFaces(), short = [];
    for (const [e, fs] of ef) { if (fs.length !== 2) continue; const a = Math.floor(e / 1048576), b = e % 1048576, l = len(a, b); if (l < lo) short.push([l, a, b, fs]); }
    if (!short.length) break;
    short.sort((x, y) => x[0] - y[0]); const locked = new Set(); let n = 0;
    for (const [, a, b, fs] of short) {
      if (locked.has(a) || locked.has(b)) continue;
      const Na = nbr(a), Nb = nbr(b), common = [...Na].filter((x) => Nb.has(x));
      if (common.length !== 2) continue; // the link condition: only the two across the edge
      if (common.some((x) => nbr(x).size <= 3)) continue; // (don't leave a vertex with two neighbours)
      if (Na.size + Nb.size - 4 < 3) continue;
      const mid = [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2, (P[a][2] + P[b][2]) / 2];
      // the triangles round a and b that survive, with a or b moved to the middle: none may fold or grow a long edge
      const around = [...new Set([...(vf.get(a) || []), ...(vf.get(b) || [])])].filter((k) => !fs.includes(k) && F[k]);
      const before = around.map((k) => unit(normal(...F[k])));
      const save = [P[a], P[b]]; P[a] = mid; P[b] = mid; let ok = true;
      around.forEach((k, q) => { if (!ok) return; const f = F[k], after = unit(normal(...f)), o = before[q];
        if (o[0] * after[0] + o[1] * after[1] + o[2] * after[2] < 0.3) ok = false;
        for (const x of f) if (x !== a && x !== b && len(a, x) > hi) ok = false; });
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

  // FLIP, toward valence six
  for (let round = 0; round < 4; round++) {
    const val = new Map(); for (const f of F) if (f) for (let j = 0; j < 3; j++) { const e = key(f[j], f[(j + 1) % 3]); val.set(e, 1); }
    const deg = new Map(); for (const e of val.keys()) { const a = Math.floor(e / 1048576), b = e % 1048576; deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
    const ef = edgeFaces(), used = new Set(); let n = 0;
    for (const [e, fs] of ef) {
      if (fs.length !== 2 || fs.some((k) => used.has(k))) continue;
      const a = Math.floor(e / 1048576), b = e % 1048576, f1 = F[fs[0]], f2 = F[fs[1]], c = third(f1, a, b), d = third(f2, a, b);
      if (val.has(key(c, d))) continue;
      const dev = (x, k) => Math.abs((deg.get(x) || 0) + k - 6);
      const before = dev(a, 0) + dev(b, 0) + dev(c, 0) + dev(d, 0), after = dev(a, -1) + dev(b, -1) + dev(c, 1) + dev(d, 1);
      if (after >= before) continue;
      // the new triangles (c, d, ·) in the old winding: f1 = (a, b, c) in some rotation
      const r1 = f1.indexOf(a), w1 = f1[(r1 + 1) % 3] === b; // a→b in f1
      const n1 = w1 ? [a, d, c] : [a, c, d], n2 = w1 ? [b, c, d] : [b, d, c];
      const o1 = unit(normal(...f1)), o2 = unit(normal(...f2)), m1 = unit(normal(...n1)), m2 = unit(normal(...n2)), dt = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
      if (dt(m1, o1) < 0.5 || dt(m2, o2) < 0.5 || dt(m1, m2) < 0.3) continue;
      F[fs[0]] = n1; F[fs[1]] = n2; fs.forEach((k) => used.add(k));
      deg.set(a, deg.get(a) - 1); deg.set(b, deg.get(b) - 1); deg.set(c, deg.get(c) + 1); deg.set(d, deg.get(d) + 1); val.set(key(c, d), 1); val.delete(e);
      n++; stats.flip++;
    }
    if (!n) break;
  }
  void opts;
  return stats;
}

/* compact: drop dead vertices and faces, renumber. Returns { P, F, fields, map } as typed arrays */
export function compact(P, F, fields) {
  const map = new Int32Array(P.length).fill(-1); let nv = 0; P.forEach((p, i) => { if (p) map[i] = nv++; });
  const Pf = new Float64Array(nv * 3); P.forEach((p, i) => { if (p) { const j = map[i]; Pf[j * 3] = p[0]; Pf[j * 3 + 1] = p[1]; Pf[j * 3 + 2] = p[2]; } });
  const live = F.filter((f) => f), Ff = new Int32Array(live.length * 3); live.forEach((f, k) => { Ff[k * 3] = map[f[0]]; Ff[k * 3 + 1] = map[f[1]]; Ff[k * 3 + 2] = map[f[2]]; });
  const out = fields.map((f) => { const o = new Float64Array(nv); f.forEach((x, i) => { if (map[i] >= 0) o[map[i]] = x; }); return o; });
  return { P: Pf, F: Ff, fields: out, nv, nf: live.length };
}
