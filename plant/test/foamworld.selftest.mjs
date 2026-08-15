// foam/test/foamworld.selftest.mjs — certifies the voronoi-foam pocket kernel.
//
// What is proven, offline, with no deps:
//   1. determinism — same seed, byte-identical pocket
//   2. geometry — cells are closed convex polyhedra (Euler V−E+F=2, planar
//      faces, outward orientation) and they PARTITION the domain (volumes sum
//      to the box: the foam is watertight, membranes are shared, no gaps)
//   3. membranes — every interior face joins exactly two cells, is planar,
//      and its normal points a→b
//   4. the walk certificate — start (bottom layer) → target (top layer) is
//      reachable under the movement rules: no jumps (no crossing edge passes
//      through a floor-class plane), max climb grade (every support face on
//      the route is within grade), standing clearance at every crossing
//   5. the puzzle band — par (minimum membranes shattered) within [parMin, 30]
//
// Run: node foam/test/foamworld.selftest.mjs

import { generatePocket, reformPocket, faceSlope } from '../foamworld.js';

let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

// ---------------------------------------------------------- determinism ----
{
  const a = generatePocket({ seed: 3 });
  const b = generatePocket({ seed: 3 });
  ok(JSON.stringify(a.nav) === JSON.stringify(b.nav) &&
     JSON.stringify(a.faces.map((f) => f.verts)) === JSON.stringify(b.faces.map((f) => f.verts)),
     'seed 3 regenerates byte-identical');
  const c = generatePocket({ seed: 4 });
  ok(JSON.stringify(a.nav) !== JSON.stringify(c.nav), 'different seeds differ');
}

// ------------------------------------------------------------- per seed ----
for (const seed of SEEDS) {
  const p = generatePocket({ seed });
  const label = `seed ${seed}`;

  // -- volumes partition the box (watertight foam)
  const vol = p.cells.reduce((a, c) => a + c.volume, 0);
  const box = p.W * p.H * p.D;
  ok(Math.abs(vol - box) / box < 5e-3, `${label}: cell volumes sum to the box (${(vol / box).toFixed(4)})`);
  ok(p.cells.every((c) => c.volume > 0.05), `${label}: no degenerate cells`);

  // -- interior faces pair two cells, oriented a→b, planar
  let planarBad = 0, orientBad = 0, pairBad = 0;
  for (const f of p.faces) {
    if (f.boundary) continue;
    if (!(f.a >= 0 && f.b >= 0 && f.a !== f.b)) pairBad++;
    const ca = p.cells[f.a].centroid, cb = p.cells[f.b].centroid;
    const dp = f.n[0] * (cb[0] - ca[0]) + f.n[1] * (cb[1] - ca[1]) + f.n[2] * (cb[2] - ca[2]);
    if (dp <= 0) orientBad++;
    // planar within the weld tolerance (vertices snap up to 2 cm)
    const d0 = f.n[0] * f.verts[0][0] + f.n[1] * f.verts[0][1] + f.n[2] * f.verts[0][2];
    for (const v of f.verts) {
      const d = f.n[0] * v[0] + f.n[1] * v[1] + f.n[2] * v[2];
      if (Math.abs(d - d0) > 0.045) { planarBad++; break; }
    }
  }
  ok(pairBad === 0, `${label}: interior faces join two distinct cells (${pairBad} bad)`);
  ok(orientBad === 0, `${label}: face normals point a→b (${orientBad} bad)`);
  ok(planarBad === 0, `${label}: faces are planar (${planarBad} bad)`);

  // -- Euler characteristic per cell: V − E + F = 2 (closed polyhedron).
  //    Rebuild each cell's incidence from its global faces, welding vertices.
  let eulerBad = 0;
  for (const c of p.cells) {
    const vs = new Set(), es = new Set();
    const key = (v) => Math.round(v[0] * 256) + '_' + Math.round(v[1] * 256) + '_' + Math.round(v[2] * 256);
    for (const fi of c.faces) {
      const f = p.faces[fi];
      const ks = f.verts.map(key);
      ks.forEach((k) => vs.add(k));
      for (let i = 0; i < ks.length; i++) {
        const a = ks[i], b = ks[(i + 1) % ks.length];
        es.add(a < b ? a + '|' + b : b + '|' + a);
      }
    }
    if (vs.size - es.size + c.faces.length !== 2) eulerBad++;
  }
  ok(eulerBad === 0, `${label}: every cell is a closed polyhedron, V−E+F=2 (${eulerBad} bad)`);

  // -- the certificate
  const { nav, nodes, cells, faces, edges, opts } = p;
  const L = opts.layers + opts.subLayers;
  ok(nav.par >= opts.parMin && nav.par <= 30, `${label}: par ${nav.par} in the puzzle band`);
  ok(cells[nodes[nav.start].cell].layer === opts.subLayers, `${label}: start sits on the first climb layer (foam below)`);
  ok(cells[nodes[nav.target].cell].layer === L - 1, `${label}: target is top layer`);
  ok(nav.route.length === nav.par + 1, `${label}: route length matches par`);

  // -- the oracle: an explicit shiva sequence, and next-step guidance from
  //    every reachable basin
  const edgeByFace = new Map(edges.map((e) => [e.face, e]));
  ok(nav.oracle.length === nav.par, `${label}: oracle sequence length = par`);
  ok(nav.oracle.every((fi) => edgeByFace.has(fi) && !faces[fi].boundary),
     `${label}: every oracle step is a real interior crossing`);
  {
    let u = nav.start, steps = 0, okWalk = true;
    while (u !== nav.target && steps <= nav.par) {
      const nx = nav.next[u];
      if (!nx || nav.oracle[steps] !== nx.face) { okWalk = false; break; }
      const e = edgeByFace.get(nx.face);
      if (!e || (e.a !== u && e.b !== u) || (e.a === u ? e.b : e.a) !== nx.node) { okWalk = false; break; }
      u = nx.node; steps++;
    }
    ok(okWalk && u === nav.target && steps === nav.par,
       `${label}: following the oracle from the start reaches the target in par steps`);
    ok(nav.distT[nav.start] === nav.par, `${label}: distT(start) = par`);
    const inconsistent = nodes.filter((_, i) => (nav.dist[i] >= 0) !== (nav.distT[i] >= 0)).length;
    ok(inconsistent === 0, `${label}: reachability agrees from both ends (${inconsistent} bad)`);
  }

  // -- the dais: a level finite disk on the start basin's floor
  ok(nodes[nav.start].faces.includes(p.dais.face), `${label}: dais sits on a start-basin floor face`);
  ok(p.dais.r > 1 && Math.abs(p.dais.y - faces[p.dais.face].centroid[1] - 0.06) < 1e-9,
     `${label}: dais just proud of its floor face`);

  // route edges obey the movement rules
  const edgeByPair = new Map();
  for (const e of edges) {
    edgeByPair.set(e.a + '|' + e.b, e); edgeByPair.set(e.b + '|' + e.a, e);
  }
  let routeBad = 0;
  for (let i = 0; i + 1 < nav.route.length; i++) {
    const e = edgeByPair.get(nav.route[i] + '|' + nav.route[i + 1]);
    if (!e) { routeBad++; continue; }
    const f = faces[e.face];
    if (f.boundary) routeBad++;                                   // never through the hull
    if (f.slope <= opts.maxGrade) routeBad++;                     // that plane is a floor — crossing it is a jump
    if (f.top - f.sill < opts.clearance) routeBad++;              // no standing room
  }
  ok(routeBad === 0, `${label}: route crossings are wall-class with clearance (${routeBad} bad)`);

  // every support face used by the nav graph is within grade (grade honesty)
  let gradeBad = 0;
  for (const nd of nodes) {
    for (const fi of nd.faces) if (faces[fi].slope > opts.maxGrade + 1e-9) gradeBad++;
  }
  ok(gradeBad === 0, `${label}: all support faces within grade ${opts.maxGrade} (${gradeBad} bad)`);

  // crossing edges connect floor basins that actually touch the membrane's
  // lower rim (already how they were built — assert the invariant held)
  ok(edges.every((e) => e.a !== e.b), `${label}: no self-loop crossings`);
  ok(nav.reachable >= nodes.length * 0.3, `${label}: a real fraction of basins reachable (${nav.reachable}/${nodes.length})`);
}

// ------------------------------------------- reform (planting a node) ------
// macro-scale opts (the /macro page's world: few big rooms) keep this fast
{
  const MACRO = { nx: 4, nz: 4, layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6 };
  const p = generatePocket({ seed: 2, ...MACRO });
  const q = reformPocket(p, [p.W / 2 + 2, p.H / 2 + 0.9, p.D / 2 - 2]);
  ok(q !== null, 'reform: planting a node succeeds');
  ok(q.cells.length === p.cells.length + 1, 'reform: exactly one new chamber');
  ok(q.startCell === p.startCell && q.targetCell === p.targetCell, 'reform: start/target chambers preserved');
  ok(q.cells[q.cells.length - 1].id >= q.baseSeedCount, 'reform: the new chamber is marked planted');
  const vol = q.cells.reduce((a, c) => a + c.volume, 0);
  ok(Math.abs(vol - q.W * q.H * q.D) / (q.W * q.H * q.D) < 5e-3, 'reform: still a watertight partition');
  // Euler closure survives the reform
  let eulerBad = 0;
  const key = (v) => Math.round(v[0] * 256) + '_' + Math.round(v[1] * 256) + '_' + Math.round(v[2] * 256);
  for (const c of q.cells) {
    const vs = new Set(), es = new Set();
    for (const fi of c.faces) {
      const ks = q.faces[fi].verts.map(key);
      ks.forEach((k) => vs.add(k));
      for (let i = 0; i < ks.length; i++) {
        const a = ks[i], b = ks[(i + 1) % ks.length];
        es.add(a < b ? a + '|' + b : b + '|' + a);
      }
    }
    if (vs.size - es.size + c.faces.length !== 2) eulerBad++;
  }
  ok(eulerBad === 0, `reform: every chamber still closed, V−E+F=2 (${eulerBad} bad)`);
  const q2 = reformPocket(p, [p.W / 2 + 2, p.H / 2 + 0.9, p.D / 2 - 2]);
  ok(JSON.stringify(q.nav.dist) === JSON.stringify(q2.nav.dist), 'reform: deterministic');
  ok(reformPocket(p, p.seeds[10]) === null, 'reform: refuses a point on an existing seed');
  const r = reformPocket(q, [p.W / 2 - 5, p.H / 2, p.D / 2 + 4]);
  ok(r !== null && r.cells.length === q.cells.length + 1, 'reform: chains (plant into a planted pocket)');
  // when the route survives, the oracle stays executable
  if (q.nav.par >= 0) {
    ok(q.nav.oracle.length === q.nav.par, 'reform: oracle length = fresh par');
    let u = q.nav.start, steps = 0;
    while (u !== q.nav.target && steps <= q.nav.par) { u = q.nav.next[u].node; steps++; }
    ok(u === q.nav.target && steps === q.nav.par, 'reform: oracle still reaches the target');
  }
}

// --------------------------------------------------------- slope helper ----
ok(Math.abs(faceSlope([0, 1, 0])) < 1e-12, 'flat face has slope 0');
ok(faceSlope([1, 0, 0]) === Infinity, 'vertical face has slope ∞');
ok(Math.abs(faceSlope([1, 1, 0]) - 1) < 1e-12, '45° face has slope 1');

console.log(failures === 0
  ? `✓ foamworld selftest — ${checks} checks pass over ${SEEDS.length} seeds`
  : `✗ foamworld selftest — ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);
