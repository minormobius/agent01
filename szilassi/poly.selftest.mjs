#!/usr/bin/env node
// szilassi/poly.selftest.mjs — holds poly.js to every claim the page makes.
//
// It imports the exact module the browser loads. Run it before touching
// anything in this directory:
//
//     node szilassi/poly.selftest.mjs      # ~1 s
//
// scripts/preflight.mjs picks it up automatically for changed dirs.

import * as P from './poly.js';

let checks = 0, failures = 0;
const ok = (cond, what, detail = '') => {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL  ${what}${detail ? `  — ${detail}` : ''}`); }
};
const close = (a, b, tol, what) => ok(Math.abs(a - b) <= tol, what, `${a} vs ${b} (tol ${tol})`);
const section = (t) => console.log(`\n${t}`);

// The published face list, exactly as Grünbaum & Szilassi 2009 Table 3 prints
// it (1-based). poly.js's FACES must be this, re-oriented and nothing else.
const PUBLISHED_FACES = [
  [1, 2, 14, 10, 8, 6], [1, 6, 4, 3, 11, 13], [3, 5, 7, 8, 10, 11], [4, 6, 8, 7, 9, 12],
  [2, 5, 3, 4, 12, 14], [13, 9, 7, 5, 2, 1], [9, 13, 11, 10, 14, 12],
].map((f) => f.map((i) => i - 1));

const V = P.REFERENCE_VERTICES;
const sameCycle = (a, b) => {
  if (a.length !== b.length) return false;
  for (const dir of [b, b.slice().reverse()]) {
    for (let s = 0; s < dir.length; s++) {
      if (a.every((x, i) => x === dir[(i + s) % dir.length])) return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
section('the published solid');

ok(V.length === 14, '14 vertices');
ok(P.FACES.length === 7, '7 faces');
ok(P.FACES.every((f) => f.length === 6), 'every face a hexagon');
ok(P.EDGES.length === 21, '21 edges');
ok(14 - 21 + 7 === 0, 'Euler characteristic 0 — a torus');

P.FACES.forEach((f, i) => ok(sameCycle(f, PUBLISHED_FACES[i]), `face ${i + 1} is Table 3's face ${i + 1}`));
ok(P.orientFaces(PUBLISHED_FACES).every((f, i) => sameCycle(f, P.FACES[i])),
   'FACES is orientFaces() applied to the published list');

// every edge traversed once each way: the seven cycles orient the surface
{
  const dirs = new Set();
  let doubled = 0;
  for (const f of P.FACES) for (let i = 0; i < 6; i++) {
    const k = `${f[i]}>${f[(i + 1) % 6]}`;
    if (dirs.has(k)) doubled++;
    dirs.add(k);
  }
  ok(doubled === 0 && dirs.size === 42, 'each edge is traversed once in each direction (orientable, consistently)');
}

// degrees and the complete-adjacency property
{
  const deg = new Array(14).fill(0);
  for (const [a, b] of P.EDGES) { deg[a]++; deg[b]++; }
  ok(deg.every((d) => d === 3), 'every vertex has degree 3');
  const pairs = new Set(P.EDGES.map(([, , f, g]) => `${Math.min(f, g)}-${Math.max(f, g)}`));
  ok(pairs.size === 21, 'all 21 face pairs share an edge — every face touches every other');
  for (let f = 0; f < 7; f++) for (let g = 0; g < 7; g++) {
    if (f !== g) ok(P.PAIR_EDGE[f][g] !== null, `faces ${f + 1},${g + 1} have a shared edge recorded`);
  }
}

// VERTEX_PLANES is just "which three faces meet here" — re-derive it
{
  const vf = Array.from({ length: 14 }, () => []);
  P.FACES.forEach((f, i) => f.forEach((v) => vf[v].push(i)));
  vf.forEach((t, v) => {
    ok(t.length === 3, `vertex ${v + 1} lies on exactly 3 faces`);
    ok(t.slice().sort((a, b) => a - b).join() === P.VERTEX_PLANES[v].join(),
       `VERTEX_PLANES[${v}] matches the face cycles`);
  });
  ok(new Set(P.VERTEX_PLANES.map((t) => t.join())).size === 14, 'the 14 plane-triples are distinct');
}

// ---------------------------------------------------------------------------
section('the edge graph is the Heawood graph');
{
  const adj = Array.from({ length: 14 }, () => []);
  for (const [a, b] of P.EDGES) { adj[a].push(b); adj[b].push(a); }
  ok(adj.every((a) => a.length === 3), '3-regular');
  const col = new Array(14).fill(-1);
  col[0] = 0;
  const q = [0];
  let bipartite = true;
  while (q.length) {
    const u = q.shift();
    for (const w of adj[u]) {
      if (col[w] < 0) { col[w] = 1 - col[u]; q.push(w); }
      else if (col[w] === col[u]) bipartite = false;
    }
  }
  ok(bipartite, 'bipartite');
  ok(col.filter((c) => c === 0).length === 7, 'the two sides have 7 vertices each');
  let girth = Infinity;
  for (let s = 0; s < 14; s++) {
    const d = new Array(14).fill(-1), par = new Array(14).fill(-1);
    d[s] = 0;
    const Q = [s];
    while (Q.length) {
      const u = Q.shift();
      for (const w of adj[u]) {
        if (d[w] < 0) { d[w] = d[u] + 1; par[w] = u; Q.push(w); }
        else if (w !== par[u]) girth = Math.min(girth, d[u] + d[w] + 1);
      }
    }
  }
  ok(girth === 6, 'girth 6');
  // 14 vertices, 3-regular, girth 6 has exactly one solution: the Heawood graph
  ok(bipartite && girth === 6 && adj.every((a) => a.length === 3),
     'therefore the (3,6)-cage — the Heawood graph');
}

// ---------------------------------------------------------------------------
section('flatness, and the seven planes');
{
  ok(P.planarityResidual(V) < 1e-15, 'every published face is planar to machine precision',
     `${P.planarityResidual(V)}`);
  const back = P.verticesFromPlanes(P.REFERENCE_PLANES);
  ok(back !== null, 'the seven planes meet in 14 points');
  let worst = 0;
  back.forEach((p, i) => { worst = Math.max(worst, P.len(P.sub(p, V[i]))); });
  ok(worst < 1e-9, 'planes -> vertices returns Table 3 exactly', `worst ${worst}`);
  // and the other way round
  const again = P.planesFromVertices(back);
  let dp = 0;
  again.forEach((p, i) => p.forEach((x, k) => { dp = Math.max(dp, Math.abs(x - P.REFERENCE_PLANES[i][k])); }));
  ok(dp < 1e-9, 'vertices -> planes returns the same seven planes', `worst ${dp}`);
}

// ---------------------------------------------------------------------------
section('the 180° symmetry');
{
  let worst = 0;
  for (let v = 0; v < 14; v++) worst = Math.max(worst, P.len(P.sub(P.C2.rotate(V[v]), V[P.C2.vertexOf[v]])));
  ok(worst < 1e-12, 'a half-turn about the z-axis permutes the vertices as claimed', `worst ${worst}`);
  for (let f = 0; f < 7; f++) {
    const img = P.FACES[f].map((v) => P.C2.vertexOf[v]).sort((a, b) => a - b).join();
    ok(img === P.FACES[P.C2.faceOf[f]].slice().sort((a, b) => a - b).join(),
       `face ${f + 1} maps to face ${P.C2.faceOf[f] + 1}`);
  }
  ok(P.C2.faceOf[P.C2.fixedFace] === P.C2.fixedFace, 'exactly one face is left where it was');
  ok(P.C2.faceOf.filter((x, i) => x === i).length === 1, 'and it is the only one');
  ok(P.C2.vertexOf.every((x, i) => P.C2.vertexOf[x] === i), 'the vertex map is an involution');
  // the tilt bases are C2-equivariant, which is what makes symmetrize() a copy
  for (const i of [0, 1, 2]) {
    const j = P.C2.faceOf[i];
    for (const k of [0, 1]) {
      ok(P.len(P.sub(P.C2.rotate(P.TILT_BASIS[i][k]), P.TILT_BASIS[j][k])) < 1e-12,
         `tilt basis of face ${j + 1} is the mirror of face ${i + 1}'s`);
    }
  }
}

// ---------------------------------------------------------------------------
section('it is a solid, and the test that says so can say no');
{
  const r = P.inspect(V);
  ok(r.ok, 'the published solid is acoptic', r.reason);
  close(r.minDihedral, 48.8414, 1e-3, 'sharpest crease is 48.84°');
  ok(r.clearance > 0.038 && r.clearance < 0.039, 'closest corner-to-face approach is 0.0384 of the radius',
     `${r.clearance}`);

  // faces 1 and 2 reach past each other's planes without meeting: the cheap
  // "all on one side" test would call this a crossing, so it is not used.
  const planes = P.planesFromVertices(V);
  const m = P.facePairMeeting(V, planes, 0, 1, P.bounds(V).radius);
  ok(m.extra < 1e-9 && m.onEdge, 'faces 1 and 2 meet in their shared edge and nothing else');
  {
    const q = planes[0];
    const edge = P.PAIR_EDGE[0][1];
    const sides = P.FACES[1].filter((v) => v !== edge[0] && v !== edge[1])
      .map((v) => Math.sign(P.dot([q[0], q[1], q[2]], V[v]) - q[3]));
    ok(new Set(sides).size === 2, '...although face 2 does have corners on both sides of face 1\'s plane');
  }

  // and the verdict is not vacuous: push a face until the solid breaks
  let broke = false, lastGood = 0;
  for (let t = 0; t <= 0.6; t += 0.01) {
    const kn = P.ZERO_KNOBS();
    kn[0][2] = t;
    const vv = P.build(kn);
    const rr = vv ? P.inspect(vv) : { ok: false };
    if (rr.ok) lastGood = t; else { broke = true; break; }
  }
  ok(broke, 'sliding face 1 along its own normal eventually breaks the solid');
  ok(lastGood > 0.05 && lastGood < 0.25, 'and it survives a while first', `last good offset ${lastGood.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
section('flatness is free: the faces cannot stop being planar');
{
  let rng = 20260921 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  let worst = 0, built = 0, solids = 0;
  for (let i = 0; i < 400; i++) {
    const kn = P.ZERO_KNOBS().map(() => [(rnd() * 2 - 1) * 0.3, (rnd() * 2 - 1) * 0.3, (rnd() * 2 - 1) * 0.4]);
    const vv = P.build(kn);
    if (!vv) continue;
    built++;
    worst = Math.max(worst, P.planarityResidual(vv));
    if (P.inspect(vv).ok) solids++;
  }
  ok(built > 380, 'almost every knob setting still meets in 14 points', `${built}/400`);
  ok(worst < 1e-12, 'and every face of every one of them is exactly flat', `worst residual ${worst}`);
  ok(solids > 0 && solids < built,
     'some of them are solids and some are not — the acoptic region is a proper open piece of the family',
     `${solids}/${built} acoptic`);
}

// ---------------------------------------------------------------------------
section('degrees of freedom, measured');
{
  const free = P.degreesOfFreedom(P.ZERO_KNOBS());
  ok(free.knobs === 21, 'seven planes, three numbers each: 21 knobs');
  ok(free.moves === 21, 'all 21 move the solid independently — the knobs are not redundant');
  ok(free.rigid === 7, 'similarities of space contribute 7 (3 slide, 3 turn, 1 scale)');
  ok(free.rigidInsideMoves, 'and all 7 are reachable with the knobs, so they must be subtracted');
  ok(free.shapes === 14, 'leaving 14 genuine shape degrees of freedom');

  const sym = P.degreesOfFreedom(P.ZERO_KNOBS(), { symmetric: true });
  ok(sym.knobs === 10, 'with the half-turn locked, 10 knobs remain');
  ok(sym.moves === 10, 'all 10 independent');
  ok(sym.rigid === 3, 'and only 3 similarities keep the axis (slide along it, turn about it, scale)');
  ok(sym.shapes === 7, 'leaving 7 symmetric shape degrees of freedom');

  // the same counts away from the published point, so 14 is the dimension of
  // the family and not an accident of where we measured
  for (const preset of P.PRESETS) {
    const d = P.degreesOfFreedom(preset.knobs);
    ok(d && d.shapes === 14, `still 14 shape degrees of freedom at "${preset.name}"`, JSON.stringify(d));
  }
}

// ---------------------------------------------------------------------------
section('the symmetry lock');
{
  ok(P.isSymmetric(P.ZERO_KNOBS()), 'the published solid is symmetric');
  let rng = 7 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  for (let i = 0; i < 40; i++) {
    const kn = P.ZERO_KNOBS().map(() => [(rnd() * 2 - 1) * 0.2, (rnd() * 2 - 1) * 0.2, (rnd() * 2 - 1) * 0.3]);
    ok(!P.isSymmetric(kn), 'a random setting is not symmetric');
    const s = P.symmetrize(kn, Math.floor(rnd() * 7));
    ok(P.isSymmetric(s), 'symmetrize() produces a symmetric setting');
    const vv = P.build(s);
    if (!vv) continue;
    let worst = 0;
    for (let v = 0; v < 14; v++) worst = Math.max(worst, P.len(P.sub(P.C2.rotate(vv[v]), vv[P.C2.vertexOf[v]])));
    ok(worst < 1e-9 * P.bounds(vv).radius, 'and the solid it builds really does have the half-turn',
       `worst ${worst}`);
  }
}

// ---------------------------------------------------------------------------
section('presets, re-measured from their knobs');
for (const preset of P.PRESETS) {
  const vv = P.build(preset.knobs);
  ok(vv !== null, `"${preset.name}" builds`);
  if (!vv) continue;
  const r = P.inspect(vv);
  ok(r.ok, `"${preset.name}" is a solid`, r.reason);
  close(r.clearance, preset.clearance, 5e-4, `"${preset.name}" clearance is the ${preset.clearance} it claims`);
  close(r.minDihedral, preset.minDihedral, 0.05, `"${preset.name}" sharpest crease is the ${preset.minDihedral}° it claims`);
  ok(P.isSymmetric(preset.knobs) === preset.symmetric, `"${preset.name}" is ${preset.symmetric ? '' : 'not '}symmetric`);
  ok(P.planarityResidual(vv) < 1e-12, `"${preset.name}" has flat faces`);
}

// ---------------------------------------------------------------------------
section('what gets drawn is what was computed');
for (const preset of P.PRESETS) {
  const vv = P.build(preset.knobs);
  const planes = P.planesFromVertices(vv);
  const scale = P.bounds(vv).radius;
  P.FACES.forEach((face, f) => {
    const tris = P.triangulateFace(vv, face, planes[f]);
    ok(tris.length === 4, `${preset.id}: face ${f + 1} clips to 4 triangles`, `${tris.length}`);
    const n = [planes[f][0], planes[f][1], planes[f][2]];
    // the triangles tile the hexagon: areas add up, and none is wound backwards
    let tri = 0;
    for (const [a, b, c] of tris) {
      const cr = P.cross(P.sub(vv[b], vv[a]), P.sub(vv[c], vv[a]));
      ok(P.dot(cr, n) > 0, `${preset.id}: face ${f + 1} triangle faces outward`);
      tri += P.len(cr) / 2;
    }
    const { poly } = P.faceFrame(vv, face, planes[f]);
    let shoelace = 0;
    for (let i = 0; i < 6; i++) {
      const a = poly[i], b = poly[(i + 1) % 6];
      shoelace += a[0] * b[1] - b[0] * a[1];
    }
    close(tri, Math.abs(shoelace) / 2, 1e-6 * scale * scale,
          `${preset.id}: face ${f + 1} triangles have the hexagon's area`);
  });
}

// ---------------------------------------------------------------------------
console.log(`\n${failures ? 'FAILED' : 'PASS'} — ${checks - failures}/${checks} checks`);
process.exit(failures ? 1 : 0);
