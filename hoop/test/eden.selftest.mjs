// eden.selftest.mjs — the biosphere generator's invariants (hoop/over/eden.js). Pure, no DOM.
//   node hoop/test/eden.selftest.mjs
import { makeEden, segDist } from '../over/eden.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const E = makeEden(7);
const TILE = E.TILE;

// gather every lake + its streams across a swath of tiles
const lakes = [], streams = [];
for (let az = 0; az < 6; az++) for (let ax = 0; ax < 6; ax++) { const f = E.featuresFor(az, ax); for (const l of f.lakes) if (!lakes.find((q) => q.cx === l.cx && q.cy === l.cy)) lakes.push(l); for (const s of f.streams) streams.push(s); }
ok('lakes are generated (mega-scale)', lakes.length >= 4 && lakes.every((l) => l.r > TILE * 0.4));

// 1. NO ORPHAN WATER — every stream terminates INSIDE its lake (it feeds a controlled surface)
{
  let drained = 0; for (const st of streams) { const end = st.pts[st.pts.length - 1]; if (E.lakeAt(end[0], end[1])) drained++; }
  ok('every stream drains into a lake', streams.length > 0 && drained === streams.length);
}

// 2. streams WIND — path length is well over the straight-line source→mouth distance
{
  let windy = 0; for (const st of streams) { const a = st.pts[0], b = st.pts[st.pts.length - 1]; let len = 0; for (let i = 1; i < st.pts.length; i++) len += Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]); if (len > Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.15) windy++; }
  ok('streams meander (not straight)', windy >= streams.length * 0.6);
}

// 3. NO ANOMALOUS LAKES — water only exists at a placed lake or a stream draining to one
{
  let anomalies = 0, sampled = 0;
  for (let t = 0; t < 1500; t++) { const x = (t * 53.3) % (TILE * 6), y = (t * 97.7) % (TILE * 6); if (E.lakeAt(x, y)) { sampled++; if (!E.lakesNear(x, y).length) anomalies++; } }
  ok('all lake-water belongs to a placed lake', sampled > 50 && anomalies === 0);
}

// 4. FOREST DENSITY GRADIENT — trees are denser in high-wetness ground than in low (a real field, not a palette)
{
  const trees = []; for (let az = 0; az < 3; az++) for (let ax = 0; ax < 3; ax++) for (const t of E.tileTrees(az, ax)) trees.push(t);
  ok('a forest is generated', trees.length > 400);
  ok('no tree stands in water', trees.every((t) => !E.inWater(t[0], t[1])));
  const wet = trees.filter((t) => E.wetness(t[0], t[1]) > 0.62).length, dry = trees.filter((t) => E.wetness(t[0], t[1]) < 0.38).length;
  const wetArea = []; let wa = 0, da = 0;   // estimate area of each band to compare DENSITY, not raw count
  for (let i = 0; i < 4000; i++) { const x = (i * 31.1) % (TILE * 3), y = (i * 71.3) % (TILE * 3); const w = E.wetness(x, y); if (w > 0.62) wa++; else if (w < 0.38) da++; }
  const wetDensity = wet / Math.max(1, wa), dryDensity = dry / Math.max(1, da);
  ok('canopy denser in wet ground than dry', wetDensity > dryDensity * 1.25);
  // variable spacing: nearest-neighbour distance is smaller in wet than dry
  const nn = (sub) => { let s = 0, n = 0; for (let i = 0; i < sub.length; i += 7) { let bd = Infinity; for (const u of sub) { if (u === sub[i]) continue; const d = (u[0] - sub[i][0]) ** 2 + (u[1] - sub[i][1]) ** 2; if (d < bd) bd = d; } if (isFinite(bd)) { s += Math.sqrt(bd); n++; } } return n ? s / n : 0; };
  const nnWet = nn(trees.filter((t) => E.wetness(t[0], t[1]) > 0.62)), nnDry = nn(trees.filter((t) => E.wetness(t[0], t[1]) < 0.38));
  ok('trunk spacing tighter where denser (Voronoi seed gradient)', nnWet > 0 && nnDry > 0 && nnWet < nnDry);
}

// 5. PASSAGE — water blocks, a bridge lets you cross, trees block
{
  // find a stream, test a point ON it (blocked) vs at a bridge (passable)
  const st = streams.find((s) => s.pts.length > 40);
  const mid = st.pts[20];
  ok('mid-stream is impassable', !E.passable(mid[0], mid[1]) || E.bridgesNear(mid[0], mid[1], 30).some((b) => (b.x - mid[0]) ** 2 + (b.y - mid[1]) ** 2 < 400));
  let bridges = []; for (let az = 0; az < 6 && !bridges.length; az++) for (let ax = 0; ax < 6 && !bridges.length; ax++) { const b = E.featuresFor(az, ax).bridges; if (b.length) bridges = b; }
  ok('bridges exist on streams', bridges.length > 0);
  if (bridges.length) ok('a bridge tile is passable despite the water', E.passable(bridges[0].x, bridges[0].y));
  // a lake centre is always water → impassable
  ok('a lake centre is impassable', !E.passable(lakes[0].cx, lakes[0].cy));
}

// 6. determinism + spawn-on-land
{
  const A = makeEden(7), B = makeEden(7);
  ok('same seed ⇒ same lakes', JSON.stringify(A.featuresFor(2, 2).lakes.map((l) => [l.cx | 0, l.cy | 0])) === JSON.stringify(B.featuresFor(2, 2).lakes.map((l) => [l.cx | 0, l.cy | 0])));
  ok('spawn lands on passable ground', A.passable(A.spawn().gx, A.spawn().gy));
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
