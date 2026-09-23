#!/usr/bin/env node
// equivelar/poly.selftest.mjs — re-verifies the published certificate and
// holds poly.js to every claim the page makes.
//
// It imports the exact module the browser loads. Run it before touching
// anything in this directory:
//
//     node equivelar/poly.selftest.mjs      # ~2 s
//
// scripts/preflight.mjs picks it up automatically for changed dirs.
//
// The first half re-derives arXiv:2609.17700v1's certificate from the
// published integers alone. Every quantity involved stays below 2^53, so those
// checks are EXACT in double arithmetic — no tolerance is used anywhere in
// them, and the test asserts the magnitudes to prove it.

import * as P from './poly.js';

let checks = 0, failures = 0;
const ok = (cond, what, detail = '') => {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL  ${what}${detail ? `  — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);
const isExactInt = (x) => Number.isInteger(x) && Math.abs(x) < 2 ** 53;

// The paper's own tables, typed out again here from the PDF, so the module's
// copy has something independent to be compared against.
const PAPER_VERTICES = [
  [-72, 84, 18], [-36, 112, 102], [72, -84, 18], [36, -112, 102], [0, 300, 234], [-84, 48, -18],
  [9, 147, 207], [0, -300, 234], [84, -48, -18], [-112, -36, -102], [48, 84, 18], [-147, 9, -207],
  [-9, -147, 207], [84, 72, -18], [112, 36, -102], [-48, -84, 18], [147, -9, -207], [-18, 126, 144],
  [-126, -18, -144], [-300, 0, -234], [-84, -72, -18], [18, -126, 144], [126, 18, -144], [300, 0, -234],
];
const PAPER_WALKS = [
  [6, 10, 16, 22, 18, 7, 5, 1, 2], [9, 15, 11, 18, 22, 13, 8, 3, 4],
  [7, 5, 8, 3, 17, 23, 9, 15, 14], [13, 8, 5, 1, 12, 19, 6, 10, 21],
  [1, 2, 11, 18, 7, 14, 24, 20, 12], [3, 4, 16, 22, 13, 21, 20, 24, 17],
  [14, 24, 17, 23, 19, 6, 2, 11, 15], [10, 21, 20, 12, 19, 23, 9, 4, 16],
];
const PAPER_PLANES = [
  [21, 3, -10, -1440], [21, 3, 10, 1440], [3, 0, 1, 234], [3, 0, -1, -234],
  [0, 3, -1, 234], [0, 3, 1, -234], [3, -21, 10, -1440], [3, -21, -10, 1440],
];
const PAPER_SIGNS = [1, 1, -1, -1, -1, -1, 1, 1];
const key = (a) => a.slice().sort((x, y) => x - y).join(',');
const sameCycle = (a, b) => {
  if (a.length !== b.length) return false;
  for (const dir of [b, b.slice().reverse()]) {
    for (let s = 0; s < dir.length; s++) if (a.every((x, i) => x === dir[(i + s) % dir.length])) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
section('the module carries the paper\'s tables');
ok(JSON.stringify(P.REFERENCE_VERTICES) === JSON.stringify(PAPER_VERTICES), 'Table 1, verbatim');
ok(JSON.stringify(P.INTEGER_PLANES) === JSON.stringify(PAPER_PLANES), 'the eight plane equations, verbatim');
ok(P.PUBLISHED_FACES.every((f, i) => f.every((v, j) => v === PAPER_WALKS[i][j] - 1)), 'Table 2, verbatim');
{
  // FACES is the published list with exactly the four faces reversed that turn
  // the paper's inward orientation outward
  const reversed = P.FACES.map((f, i) => {
    if (f.every((v, j) => v === P.PUBLISHED_FACES[i][j])) return 0;
    const r = P.PUBLISHED_FACES[i].slice().reverse();
    return f.every((v, j) => v === r[j]) ? 1 : 2;
  });
  ok(reversed.every((x) => x < 2), 'FACES holds each published walk, forwards or backwards');
  ok(reversed.join(',') === '1,1,0,0,0,0,1,1', 'and reverses exactly F1, F2, F7, F8', reversed.join(','));
  ok(P.FACES.every((f, i) => sameCycle(f, P.PUBLISHED_FACES[i])), 'so every face is the published one');
}

// ---------------------------------------------------------------------------
section('the certificate, in exact integer arithmetic');
{
  let n = 0, worst = 0, allInt = true;
  for (let f = 0; f < 8; f++) {
    const [a, b, c, d] = PAPER_PLANES[f];
    for (const v of P.PUBLISHED_FACES[f]) {
      const r = a * PAPER_VERTICES[v][0] + b * PAPER_VERTICES[v][1] + c * PAPER_VERTICES[v][2] - d;
      if (!isExactInt(r)) allInt = false;
      worst = Math.max(worst, Math.abs(r));
      n++;
    }
  }
  ok(n === 72, '72 corner-face incidences');
  ok(allInt, 'every residual is an exact integer below 2^53 — no rounding can occur');
  ok(worst === 0, 'and every one of them is zero', `worst |residual| ${worst}`);
}
{
  // every corner is on exactly three planes, and those three give it back
  const det3 = (p, q, r) => {
    const A = PAPER_PLANES[p], B = PAPER_PLANES[q], C = PAPER_PLANES[r];
    return A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
  };
  let three = 0, indep = 0, recovered = 0, biggest = 0;
  for (let v = 0; v < 24; v++) {
    const on = [];
    for (let f = 0; f < 8; f++) {
      const [a, b, c, d] = PAPER_PLANES[f];
      if (a * PAPER_VERTICES[v][0] + b * PAPER_VERTICES[v][1] + c * PAPER_VERTICES[v][2] === d) on.push(f);
    }
    if (on.length === 3) three++; else continue;
    const [p, q, r] = on, D = det3(p, q, r);
    if (D !== 0) indep++;
    const col = (i) => {
      const M = [PAPER_PLANES[p], PAPER_PLANES[q], PAPER_PLANES[r]].map((x) => x.slice(0, 3));
      M[0][i] = PAPER_PLANES[p][3]; M[1][i] = PAPER_PLANES[q][3]; M[2][i] = PAPER_PLANES[r][3];
      return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
           + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    };
    if ([0, 1, 2].every((i) => { const num = col(i); biggest = Math.max(biggest, Math.abs(num)); return num === PAPER_VERTICES[v][i] * D; })) recovered++;
    ok(key(on) === key(P.VERTEX_PLANES[v]), `corner ${v + 1}'s plane triple matches the module`);
  }
  ok(three === 24, 'every corner lies on exactly three of the eight planes', `${three}/24`);
  ok(indep === 24, 'and those three always meet in a single point');
  ok(recovered === 24, 'Cramer\'s rule returns each corner exactly, over the integers', `${recovered}/24`);
  ok(isExactInt(biggest), 'with every determinant an exact integer', `largest ${biggest}`);
  ok(new Set(P.VERTEX_PLANES.map(key)).size === 24, 'the 24 plane triples are distinct');
}

// ---------------------------------------------------------------------------
section('a closed orientable surface of genus 3');
{
  const E = new Map();
  for (const w of PAPER_WALKS) for (let i = 0; i < 9; i++) {
    const a = w[i], b = w[(i + 1) % 9];
    const k = key([a, b]);
    E.set(k, (E.get(k) || 0) + 1);
  }
  ok(E.size === 36, '36 distinct edges', `${E.size}`);
  ok([...E.values()].every((x) => x === 2), 'each in exactly two faces');
  ok(P.EDGES.length === 36, 'and the module found the same 36');
  const deg = new Array(25).fill(0);
  for (const k of E.keys()) for (const v of k.split(',').map(Number)) deg[v]++;
  ok(deg.slice(1).every((d) => d === 3), 'every corner has three edges');
  ok(P.VERTEX_PLANES.every((t) => t.length === 3), 'and three faces');
  const chi = 24 - 36 + 8;
  ok(chi === -4, `V − E + F = ${chi}`);
  ok((2 - chi) / 2 === 3, `genus ${(2 - chi) / 2}`);
}
{
  const dirs = new Set();
  let clash = 0;
  PAPER_WALKS.forEach((w, i) => {
    const walk = PAPER_SIGNS[i] > 0 ? w : w.slice().reverse();
    for (let j = 0; j < 9; j++) {
      const k = `${walk[j]}>${walk[(j + 1) % 9]}`;
      if (dirs.has(k)) clash++;
      dirs.add(k);
    }
  });
  ok(clash === 0 && dirs.size === 72, 'the published sign vector (+,+,−,−,−,−,+,+) orients the surface');
  const V = P.volume(P.REFERENCE_VERTICES);
  ok(isExactInt(V * 6), 'the enclosed volume is an exact integer', `6V = ${V * 6}`);
  ok(Math.abs(V * 6) === 26732160, 'and 6V = 26 732 160', `${V * 6}`);
  ok(V > 0, 'positive with the module\'s orientation, so its normals point outwards');
}

// ---------------------------------------------------------------------------
section('every pair of faces shares an edge — and eight pairs share two');
{
  let ones = 0, twos = 0, other = 0, total = 0;
  for (let f = 0; f < 8; f++) for (let g = f + 1; g < 8; g++) {
    const k = P.PAIR_EDGES[f][g].length;
    total += k;
    if (k === 1) ones++; else if (k === 2) twos++; else other++;
  }
  ok(ones + twos === 28 && other === 0, 'all 28 face pairs are adjacent — the dual simple graph is K8');
  ok(ones === 20, '20 pairs share exactly one edge', `${ones}`);
  ok(twos === 8, '8 pairs share two', `${twos}`);
  ok(total === 36, 'which accounts for every one of the 36 edges', `${total}`);
  ok(P.OVERARCHING.length === 8, 'OVERARCHING lists the eight');
  ok(P.OVERARCHING.map(([f, g]) => `F${f + 1}F${g + 1}`).join(' ')
     === 'F1F4 F1F5 F2F3 F2F6 F3F7 F4F8 F5F7 F6F8', 'and they are the pairs the paper prints',
     P.OVERARCHING.map(([f, g]) => `F${f + 1}F${g + 1}`).join(' '));
  // the classical count rules 8 out, which is why those eight pairs matter
  const h = (f) => ((f - 4) * (f - 3)) / 12;
  ok(!Number.isInteger(h(8)), 'the one-edge-per-pair formula h = (f−4)(f−3)/12 has no answer at f = 8',
     `h(8) = ${h(8)}`);
  ok(Number.isInteger(h(4)) && Number.isInteger(h(7)) && Number.isInteger(h(12)),
     'while it does at f = 4, 7 and 12', `${h(4)}, ${h(7)}, ${h(12)}`);
  // both edges of an overarching pair lie on the line where the two planes cross
  let onLine = 0;
  for (const [f, g] of P.OVERARCHING) {
    const A = P.REFERENCE_PLANES[f], B = P.REFERENCE_PLANES[g];
    const scale = P.bounds(P.REFERENCE_VERTICES).radius;
    const vs = P.PAIR_EDGES[f][g].flat();
    if (vs.every((v) => Math.abs(P.dot(A.n, P.REFERENCE_VERTICES[v]) - A.d) < 1e-9 * scale
                     && Math.abs(P.dot(B.n, P.REFERENCE_VERTICES[v]) - B.d) < 1e-9 * scale)) onLine++;
  }
  ok(onLine === 8, 'and both edges of each such pair lie on the one line where its two planes cross');
}

// ---------------------------------------------------------------------------
section('the symmetry is a rotary reflection, not a rotation');
{
  const at = new Map(P.REFERENCE_VERTICES.map((p, i) => [p.join(','), i]));
  ok(P.REFERENCE_VERTICES.every((p) => at.has(P.S4.map(p).join(','))),
     'T(x, y, z) = (y, −x, −z) permutes the 24 corners');
  let p = P.S4.vertexOf.slice(), order = 0;
  for (let n = 1; n <= 8; n++) {
    if (p.every((x, i) => x === i)) { order = n; break; }
    p = p.map((x) => P.S4.vertexOf[x]);
  }
  ok(order === 4, `T has order ${order}, so ⟨T⟩ is cyclic of order 4`);
  const det = 0 * (0 * -1 - 0 * 0) - 1 * (-1 * -1 - 0 * 0) + 0 * 0;
  ok(det === -1, 'but its determinant is −1: a four-fold ROTARY REFLECTION, S₄, not a rotation');
  ok(P.S4.improper === true, 'and the module says so');
  // T² is the honest half-turn about the axis
  const sq = (v) => P.S4.map(P.S4.map(v));
  ok([[1, 2, 3], [5, -7, 11]].every((v) => sq(v).every((x, i) => x === [-v[0], -v[1], v[2]][i])),
     'T² is the plain half-turn about the z-axis');
  // face action, and orientation reversed on every face
  const cyc = [];
  const seen = new Set();
  for (let f = 0; f < 8; f++) {
    if (seen.has(f)) continue;
    const o = [];
    let x = f;
    while (!seen.has(x)) { seen.add(x); o.push(x); x = P.S4.faceOf[x]; }
    if (o.length > 1) cyc.push(`(${o.map((y) => `F${y + 1}`).join(' ')})`);
  }
  ok(cyc.join('') === '(F1 F7 F2 F8)(F3 F6 F4 F5)', 'its action on the faces is the paper\'s', cyc.join(''));
  ok(P.S4.orbits.length === 2 && P.S4.orbits.every((o) => o.length === 4), 'two orbits of four');
  let reversedAll = 0;
  for (let f = 0; f < 8; f++) {
    const img = P.FACES[f].map((v) => P.S4.vertexOf[v]);
    const target = P.FACES[P.S4.faceOf[f]];
    const fwd = (() => { for (let s = 0; s < 9; s++) if (img.every((x, i) => x === target[(i + s) % 9])) return true; return false; })();
    const rev = (() => { const r = target.slice().reverse(); for (let s = 0; s < 9; s++) if (img.every((x, i) => x === r[(i + s) % 9])) return true; return false; })();
    if (rev && !fwd) reversedAll++;
  }
  ok(reversedAll === 8, 'and it reverses the walk of all eight faces, as an improper map must');
  // the outward normals are carried correctly, which is what makes the lock work
  let worst = 0;
  for (let f = 0; f < 8; f++) {
    worst = Math.max(worst, P.len(P.sub(P.S4.map(P.REFERENCE_PLANES[f].n), P.REFERENCE_PLANES[P.S4.faceOf[f]].n)));
    worst = Math.max(worst, Math.abs(P.REFERENCE_PLANES[f].d - P.REFERENCE_PLANES[P.S4.faceOf[f]].d) / 100);
  }
  ok(worst < 1e-12, 'T carries each outward normal to the next face\'s, keeping the offset', `${worst}`);
}

// ---------------------------------------------------------------------------
section('flatness, and the eight planes');
{
  ok(P.planarityResidual(P.REFERENCE_VERTICES) < 1e-15, 'every face is planar to machine precision',
     `${P.planarityResidual(P.REFERENCE_VERTICES)}`);
  const back = P.verticesFromPlanes(P.REFERENCE_PLANES);
  ok(back !== null, 'the eight planes meet in 24 points');
  let worst = 0;
  back.forEach((p, i) => { worst = Math.max(worst, P.len(P.sub(p, P.REFERENCE_VERTICES[i]))); });
  ok(worst < 1e-9, 'planes → corners returns Table 1', `worst ${worst}`);
  // flatness survives any deformation, because the planes ARE the model
  let rng = 20260922 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  const R0 = P.bounds(P.REFERENCE_VERTICES).radius;
  let built = 0, sane = 0, flat = 0, solids = 0, blown = 0, worstFlat = 0;
  for (let i = 0; i < 300; i++) {
    const kn = P.ZERO_KNOBS().map(() => [(rnd() * 2 - 1) * 0.05, (rnd() * 2 - 1) * 0.05, (rnd() * 2 - 1) * 0.05]);
    const v = P.build(kn);
    if (!v) continue;
    built++;
    // a knob setting can drive a plane triple towards dependence, which throws
    // its corner off to thousands of times the size; those are the ones where
    // double arithmetic starts to cancel, and they are counted separately
    if (P.bounds(v).radius > 10 * R0) { blown++; continue; }
    sane++;
    const r = P.planarityResidual(v);
    worstFlat = Math.max(worstFlat, r);
    if (r < 1e-12) flat++;
    if (P.inspect(v).ok) solids++;
  }
  ok(built > 280, 'almost every knob setting still meets in 24 points', `${built}/300`);
  ok(flat === sane, 'and every face of every one that stayed a recognisable size is exactly flat',
     `${flat}/${sane}, worst residual ${worstFlat.toExponential(2)}`);
  ok(blown > 0 && blown < 30, 'a handful drove a corner off towards infinity instead', `${blown}/${built}`);
  ok(solids > 0 && solids < sane, 'some are solids and some are not', `${solids}/${sane}`);
  ok(solids / sane < 0.5,
     'and the acoptic region is TIGHT — a nudge a twentieth of the radius breaks it more often than not',
     `${solids}/${sane} survived`);
}

// ---------------------------------------------------------------------------
section('it is a solid, checked two ways');
{
  const V = P.REFERENCE_VERTICES;
  const scale = P.bounds(V).radius;
  const r = P.inspect(V);
  ok(r.ok, 'the published realization is acoptic', r.reason);
  ok(r.clearance > 0.04 && r.clearance < 0.042, 'the closest edge-to-face approach is 4.1% of the radius',
     `${r.clearance}`);
  // the eight nonagons are simple, and not one of them is convex
  const planes = P.planesFromVertices(V);
  let simple = 0, convex = 0;
  for (let f = 0; f < 8; f++) {
    if (P.simplePolygon(V, P.FACES[f], planes[f], scale).ok) simple++;
    const { poly } = P.faceFrame(V, P.FACES[f], planes[f]);
    const turns = new Set();
    for (let i = 0; i < 9; i++) {
      const a = poly[i], b = poly[(i + 1) % 9], c = poly[(i + 2) % 9];
      turns.add(Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])));
    }
    if (turns.size === 1) convex++;
  }
  ok(simple === 8, 'all eight nonagons are simple', `${simple}/8`);
  ok(convex === 0, 'and not one is convex — which is why the line walk must handle several stretches per face',
     `${convex} convex`);

  // exact bookkeeping from the shipped test
  let worstExtra = 0, worstMissing = 0;
  for (let f = 0; f < 8; f++) for (let g = f + 1; g < 8; g++) {
    const m = P.facePairMeeting(V, planes, f, g, scale);
    worstExtra = Math.max(worstExtra, m.extra);
    worstMissing = Math.max(worstMissing, m.missing);
  }
  ok(worstExtra < 1e-9, 'no pair of faces meets anywhere beyond its shared edge(s)', `${worstExtra}`);
  ok(worstMissing < 1e-9, 'and no pair has come apart along one', `${worstMissing}`);

  // ---- a second opinion, computed a completely different way --------------
  // Walk each pair's line by brute force: sample it densely, and demand that a
  // point inside BOTH faces is always on one of the shared edges, and that
  // every point of a shared edge is inside both. No interval bookkeeping.
  let sampled = 0, wrong = 0;
  for (let f = 0; f < 8; f++) for (let g = f + 1; g < 8; g++) {
    const A = planes[f], B = planes[g];
    const u = P.unit(P.cross(A.n, B.n));
    const c = P.dot(A.n, B.n), den = 1 - c * c;
    const x0 = P.add(P.mul(A.n, (A.d - B.d * c) / den), P.mul(B.n, (B.d - A.d * c) / den));
    const frA = P.faceFrame(V, P.FACES[f], A), frB = P.faceFrame(V, P.FACES[g], B);
    const tOf = (p) => P.dot(P.sub(p, x0), u);
    const seg = P.PAIR_EDGES[f][g].map(([a, b]) => [tOf(V[a]), tOf(V[b])].sort((x, y) => x - y));
    const lo = Math.min(...P.FACES[f].concat(P.FACES[g]).map((v) => tOf(V[v]))) - scale * 0.05;
    const hi = Math.max(...P.FACES[f].concat(P.FACES[g]).map((v) => tOf(V[v]))) + scale * 0.05;
    const tol = 1e-6 * scale;
    for (let i = 0; i <= 1200; i++) {
      const t = lo + ((hi - lo) * i) / 1200;
      const p = P.add(x0, P.mul(u, t));
      const inBoth = P.pointInPolygon(frA.to2d(p), frA.poly, tol) && P.pointInPolygon(frB.to2d(p), frB.poly, tol);
      const onShared = seg.some(([a, b]) => t >= a - tol && t <= b + tol);
      sampled++;
      if (inBoth !== onShared) wrong++;
    }
    // and along the shared edges themselves
    for (const [a, b] of seg) for (let i = 0; i <= 60; i++) {
      const t = a + ((b - a) * i) / 60;
      const p = P.add(x0, P.mul(u, t));
      sampled++;
      if (!(P.pointInPolygon(frA.to2d(p), frA.poly, tol) && P.pointInPolygon(frB.to2d(p), frB.poly, tol))) wrong++;
    }
  }
  ok(sampled > 30000, 'the second opinion sampled the 28 crossing lines densely', `${sampled} points`);
  ok(wrong === 0, 'and agreed at every point: two faces touch exactly where the walks say', `${wrong} disagreements`);

  // no edge pierces a face it shares no corner with
  let pierce = 0;
  for (const [a, b] of P.EDGES) for (let f = 0; f < 8; f++) {
    if (P.FACES[f].includes(a) || P.FACES[f].includes(b)) continue;
    const { n, d } = planes[f];
    const sa = P.dot(n, V[a]) - d, sb = P.dot(n, V[b]) - d;
    if (Math.abs(sa) < 1e-9 * scale || Math.abs(sb) < 1e-9 * scale || (sa > 0) === (sb > 0)) continue;
    const x = P.add(V[a], P.mul(P.sub(V[b], V[a]), sa / (sa - sb)));
    const fr = P.faceFrame(V, P.FACES[f], planes[f]);
    if (P.pointInPolygon(fr.to2d(x), fr.poly, 0)) pierce++;
  }
  ok(pierce === 0, 'and no edge pierces a face it shares no corner with', `${pierce}`);

  // the verdict is not vacuous
  let broke = false, lastGood = 0;
  for (let t = 0; t <= 0.8; t += 0.01) {
    const kn = P.ZERO_KNOBS();
    kn[0][2] = t;
    const v = P.build(kn);
    if (v && P.inspect(v).ok) lastGood = t; else { broke = true; break; }
  }
  ok(broke, 'sliding face 1 along its own normal eventually breaks the solid');
  ok(lastGood > 0.02 && lastGood < 0.5, 'and it survives a while first', `last good slide ${lastGood.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
section('degrees of freedom, measured');
{
  const free = P.degreesOfFreedom(P.ZERO_KNOBS());
  ok(free.knobs === 24, 'eight planes, three numbers each: 24 knobs');
  ok(free.moves === 24, 'all 24 move the solid independently');
  ok(free.rigid === 7, 'the similarities of space contribute 7');
  ok(free.rigidInsideMoves, 'and all 7 are reachable, so they must be subtracted');
  ok(free.shapes === 17, 'leaving 17 shape degrees of freedom — three more than the seven-faced cousin has',
     `${free.shapes}`);

  const sym = P.degreesOfFreedom(P.ZERO_KNOBS(), { symmetric: true });
  ok(sym.knobs === 6, 'with the rotary reflection locked, two planes are free: 6 knobs');
  ok(sym.rigid === 2, 'and only 2 similarities keep its fixed point where it is (a turn about the axis, and scale)',
     `${sym.rigid}`);
  ok(sym.shapes === 4, 'leaving 4 symmetric shape degrees of freedom', `${sym.shapes}`);
}

// ---------------------------------------------------------------------------
section('the symmetry lock');
{
  ok(P.isSymmetric(P.ZERO_KNOBS()), 'the published solid is symmetric');
  let rng = 606 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  for (let i = 0; i < 40; i++) {
    const kn = P.ZERO_KNOBS().map(() => [(rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.2]);
    ok(!P.isSymmetric(kn), 'a random setting is not');
    const s = P.symmetrize(kn, Math.floor(rnd() * 8));
    ok(P.isSymmetric(s), 'symmetrize() produces a symmetric setting');
    const v = P.build(s);
    if (!v) continue;
    let worst = 0;
    for (let x = 0; x < 24; x++) worst = Math.max(worst, P.len(P.sub(P.S4.map(v[x]), v[P.S4.vertexOf[x]])));
    ok(worst < 1e-9 * P.bounds(v).radius,
       'and the solid it builds really does have the rotary reflection', `${worst}`);
  }
  // the sign flip is load-bearing: a plain copy does NOT keep the symmetry
  const kn = P.ZERO_KNOBS();
  kn[0] = [0.06, -0.04, 0.05];
  const naive = kn.map((k) => k.slice());
  for (const i of P.S4.orbits[0]) naive[i] = kn[0].slice();
  const v1 = P.build(naive), v2 = P.build(P.symmetrize(kn, 0));
  const asym = (v) => { let w = 0; for (let x = 0; x < 24; x++) w = Math.max(w, P.len(P.sub(P.S4.map(v[x]), v[P.S4.vertexOf[x]]))); return w / P.bounds(v).radius; };
  ok(v1 && v2 && asym(v1) > 1e-3, 'copying the tilts round the orbit unchanged breaks the symmetry',
     v1 ? `${asym(v1).toExponential(2)}` : 'no build');
  ok(v2 && asym(v2) < 1e-12, 'while flipping their sign at every step keeps it', v2 ? `${asym(v2).toExponential(2)}` : 'no build');
}

// ---------------------------------------------------------------------------
section('what gets drawn is what was computed');
{
  const V = P.REFERENCE_VERTICES;
  const planes = P.planesFromVertices(V);
  const scale = P.bounds(V).radius;
  P.FACES.forEach((face, f) => {
    const tris = P.triangulateFace(V, face, planes[f]);
    // a nonagon gives 7 triangles, less any the clipper found to have no area
    ok(tris.length >= 6 && tris.length <= 7, `face ${f + 1} clips to ${tris.length} triangles`);
    let area = 0;
    for (const [a, b, c] of tris) {
      const cr = P.cross(P.sub(V[b], V[a]), P.sub(V[c], V[a]));
      ok(P.dot(cr, planes[f].n) > 0, `face ${f + 1} triangle faces outward`);
      area += P.len(cr) / 2;
    }
    const { poly } = P.faceFrame(V, face, planes[f]);
    let shoelace = 0;
    for (let i = 0; i < 9; i++) {
      const a = poly[i], b = poly[(i + 1) % 9];
      shoelace += a[0] * b[1] - b[0] * a[1];
    }
    ok(Math.abs(area - Math.abs(shoelace) / 2) < 1e-6 * scale * scale,
       `face ${f + 1}'s triangles have the nonagon's area`);
  });
  ok(P.FACE_COLOURS.length === 8, 'eight colours, because every face touches every other');
  ok(new Set(P.FACE_COLOURS).size === 8, 'and they are all different');
}

// ---------------------------------------------------------------------------
console.log(`\n${failures ? 'FAILED' : 'PASS'} — ${checks - failures}/${checks} checks`);
process.exit(failures ? 1 : 0);
