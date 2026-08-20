// silk/test/fabric.selftest.mjs — the silk, before anything weaves with it.
//
// The fabric is the agent's memory, so a bug here is not a rendering artefact,
// it is the agent remembering something that never happened. What is proven:
//
//   1. tension only — the solver never pushes a slack thread apart
//   2. splitting conserves rest length, so an attachment neither slackens nor
//      tightens the line it lands on
//   3. a Chain resolves out-of-order attachments (the capture spiral cuts the
//      same radius it already cut on the way out)
//   4. snapping — two attachments a hair apart make ONE junction, because a
//      zero-length segment makes the constraint solver produce NaN
//   5. ray/polygon and convex hull, against hand-checked answers
//   6. pinned nodes never move, whatever is hung off them
//
// Run: node silk/test/fabric.selftest.mjs

import { Fabric, Chain, rayPolygon, convexHull, polygonArea, dist } from '../js/fabric.mjs';

let checks = 0;
let failures = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('\ngeometry');
{
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const east = rayPolygon(50, 50, 1, 0, sq);
  ok('ray east from centre hits x=100 at t=50', east && near(east.x, 100) && near(east.t, 50));
  const north = rayPolygon(50, 50, 0, -1, sq);
  ok('ray north hits y=0 at t=50', north && near(north.y, 0) && near(north.t, 50));
  const diag = rayPolygon(50, 50, 1, 1, sq);
  ok('ray SE hits the corner', diag && near(diag.x, 100) && near(diag.y, 100));
  ok('area of the unit square scales', near(polygonArea(sq), 10000));

  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
  const h = convexHull(pts);
  ok('hull discards the interior point', h.length === 4, `got ${h.length}`);
  ok('hull area is the full square', near(polygonArea(h), 100));
}

console.log('\ntension only');
{
  const f = new Fabric({ gravity: 0 });
  const a = f.node(0, 0, { pinned: true });
  const b = f.node(50, 0);
  const t = f.thread(a, b, 'radius', { rest: 100 });   // deliberately slack
  for (let i = 0; i < 40; i++) f.relax();
  ok('a slack thread exerts nothing', near(dist(a, b), 50, 1e-9), `length ${dist(a, b)}`);

  t.rest = 25;                                         // now over-long
  for (let i = 0; i < 300; i++) f.relax();
  ok('an over-long thread is pulled in', dist(a, b) < 26, `length ${dist(a, b).toFixed(3)}`);
  ok('the pinned end never moved', a.x === 0 && a.y === 0);
}

console.log('\nsplitting');
{
  const f = new Fabric({ gravity: 0 });
  const a = f.node(0, 0);
  const b = f.node(100, 0);
  const t = f.thread(a, b, 'radius');
  const restBefore = t.rest;
  const { node, second } = f.split(t, 0.25);
  ok('the new node lands at the parameter', near(node.x, 25) && near(node.y, 0));
  ok('rest length is conserved across the split', near(t.rest + second.rest, restBefore, 1e-9));
  ok('both halves keep the parent kind', t.kind === 'radius' && second.kind === 'radius');
  ok('the far end is now the second half\'s', second.b === b && t.b === node);
}

console.log('\nchains');
{
  const f = new Fabric({ gravity: 0 });
  const a = f.node(0, 0, { pinned: true });
  const b = f.node(300, 0, { pinned: true });
  const c = new Chain(f, a, b, 'radius');
  ok('a fresh chain is one link', c.links.length === 1 && near(c.length(), 300));

  // out of order, exactly as the two spirals arrive
  const n90 = c.attachAt(270);
  const n20 = c.attachAt(60);
  const n85 = c.attachAt(255);
  const n25 = c.attachAt(75);
  ok('four attachments, four splits', c.links.length === 5, `${c.links.length} links`);
  ok('nodes stay ordered along the chain',
    c.nodes.map((n) => n.x).every((x, i, xs) => i === 0 || x >= xs[i - 1]),
    c.nodes.map((n) => Math.round(n.x)).join(','));
  for (const [n, want] of [[n20, 60], [n25, 75], [n85, 255], [n90, 270]]) {
    ok(`attachment at ${want} landed there`, near(n.x, want, 1e-6), `at ${n.x}`);
  }
  ok('total length is unchanged by subdivision', near(c.length(), 300, 1e-9));
  ok('distanceTo agrees with where it was asked for', near(c.distanceTo(n85), 255, 1e-6));

  const again = c.attachAt(256, 5);
  ok('a near-duplicate attachment snaps to the existing junction', again === n85);
  ok('and makes no new link', c.links.length === 5);

  // no zero-length segments anywhere — this is what the snap exists to prevent
  const shortest = Math.min(...c.links.map((t) => f.len(t)));
  ok('no degenerate segment', shortest > 1e-3, `shortest ${shortest}`);
}

console.log('\nreclaim');
{
  const f = new Fabric({ gravity: 0 });
  const a = f.node(0, 0);
  const b = f.node(100, 0);
  const t = f.thread(a, b, 'aux');
  ok('laying spends silk', near(f.silkUsed, 100));
  f.cut(t, { reclaim: 0.85 });
  ok('eating it credits most of it back', near(f.silkUsed, 15));
  f.cut(t, { reclaim: 0.85 });
  ok('cutting twice credits once', near(f.silkUsed, 15));
  f.compact();
  ok('compact drops the dead thread', f.threads.length === 0);
}

console.log('\nstability under load');
{
  // a hub hung from four pinned corners by 24 radii, shaken hard
  const f = new Fabric({ gravity: 0.05 });
  const corners = [[0, 0], [400, 0], [400, 400], [0, 400]].map(([x, y]) => f.node(x, y, { pinned: true }));
  const rim = [];
  for (let i = 0; i < 4; i++) rim.push(new Chain(f, corners[i], corners[(i + 1) % 4], 'frame'));
  const hub = f.node(200, 200);
  for (let i = 0; i < 24; i++) {
    const side = rim[i % 4];
    f.thread(hub, side.attachAtParam((Math.floor(i / 4) + 0.5) / 6, 2), 'radius');
  }
  f.step(400, 6);
  const finite = f.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  ok('400 substeps leave every node finite', finite);
  ok('the hub stays inside the frame', hub.x > 1 && hub.x < 399 && hub.y > 1 && hub.y < 399,
    `hub at ${hub.x.toFixed(1)},${hub.y.toFixed(1)}`);
  ok('the pinned corners never moved',
    corners.every((c, i) => c.x === [0, 400, 400, 0][i] && c.y === [0, 0, 400, 400][i]));
}

console.log('');
if (failures) { console.log(`✗ fabric selftest: ${failures}/${checks} failing\n`); process.exit(1); }
console.log(`✓ fabric selftest passed (${checks} checks)\n`);
