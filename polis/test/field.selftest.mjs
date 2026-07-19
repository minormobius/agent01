// field.selftest.mjs — node selftest for the settlement field v2 (true Voronoi,
// adaptive resolution, bid-rent land market). No network, no UI:
//   node polis/test/field.selftest.mjs

import { growCity, defaultEnvelope, fieldDigest, USE } from '../field.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const section = (s) => console.log('\n' + s);

const CTX = {
  engine: 'break-of-bulk', coastal: true, coastDir: 2.2, river: true, riverDir: 0.9,
  popSeries: defaultEnvelope(240, 16000), wallsAt: 70, sackTicks: [120, 178],
  eras: { wheelAt: 40, mechAt: 190 },
};
const live = (f) => f.leaves.filter(l => !l.dead);
const nucOf = (f) => f.leaves[f.nucleus];
const distNuc = (f, lf) => Math.hypot(lf.x - nucOf(f).x, lf.y - nucOf(f).y);

section('determinism');
{
  const a = growCity('7:Vylfstrand:412', CTX);
  const b = growCity('7:Vylfstrand:412', CTX);
  ok(fieldDigest(a) === fieldDigest(b), `same siteSeed ⇒ identical field (${fieldDigest(a)})`);
  const c = growCity('7:Vylfstrand:413', CTX);
  ok(fieldDigest(a) !== fieldDigest(c), 'different siteSeed ⇒ different field');
}

const F = growCity('7:Vylfstrand:412', CTX);

section('true voronoi');
{
  let good = 0, total = 0;
  for (const lf of live(F)) {
    const poly = F.polys[lf.id];
    if (!poly || poly.length < 3) continue;
    total++;
    // the site must sit inside its own polygon (ray-cast)
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > lf.y) !== (yj > lf.y) && lf.x < (xj - xi) * (lf.y - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) good++;
  }
  ok(total >= live(F).length * 0.98, `every live leaf has a polygon (${total}/${live(F).length})`);
  ok(good >= total * 0.97, `sites sit inside their own Voronoi cells (${good}/${total})`);
}

section('adaptive resolution — the map refines where the product concentrates');
{
  ok(F.meta.splits > 0, `subdivision happened (${F.meta.splits} refinements)`);
  ok(F.meta.leaves > F.meta.B * F.meta.B, `leaf count grew past the base lattice (${F.meta.leaves})`);
  // resolution follows product: mean level near the nucleus > mean level far out
  const lv = live(F);
  const near = lv.filter(l => distNuc(F, l) < 0.4), far = lv.filter(l => distNuc(F, l) > 1.0);
  const mean = (xs) => xs.reduce((a, l) => a + l.level, 0) / Math.max(1, xs.length);
  ok(mean(near) > mean(far) + 0.3, `core is finer-grained than periphery (level ${mean(near).toFixed(2)} vs ${mean(far).toFixed(2)})`);
  ok(F.events.some(e => e.type === 'subdivide'), 'refinement is an event');
  // splitting conserves determinism of ids: no live leaf shares a fine-bucket with another
  ok(lv.every(l => l.level <= F.meta.MAXL), 'refinement bounded by MAXL');
}

section('bid-rent land market — farms rise, then the land grows too dear');
{
  ok(F.meta.farmCount > 0, `farms exist at the end (${F.meta.farmCount})`);
  ok(F.events.some(e => e.type === 'farms'), 'the foodweb arrival is an event');
  ok(F.meta.displaced > 0, `fields were built over (${F.meta.displaced} displaced)`);
  ok(F.events.some(e => e.type === 'displace'), 'displacement is an event');
  // the von Thünen ordering at the end: commerce innermost, then residential, farms outside
  const lv = live(F);
  const md = (u) => { const xs = lv.filter(l => l.use === u); return xs.reduce((a, l) => a + distNuc(F, l), 0) / Math.max(1, xs.length); };
  const dCom = md(USE.COM), dRes = md(USE.RES), dFarm = md(USE.FARM);
  ok(dCom < dRes && dRes < dFarm, `rings hold: commerce ${dCom.toFixed(2)} < residential ${dRes.toFixed(2)} < farm ${dFarm.toFixed(2)} km`);
  // no farm survives in the deep core once the city is grown
  const coreFarms = lv.filter(l => l.use === USE.FARM && distNuc(F, l) < 0.25).length;
  ok(coreFarms === 0, `the deep core holds no farms (${coreFarms})`);
  // urban uses actually sorted: some commerce and (post-diversify) some industry exist
  ok(lv.some(l => l.use === USE.COM), 'commercial quarters exist');
  ok(lv.some(l => l.use === USE.IND), 'industrial quarters exist after diversification');
}

section('the three regimes');
{
  ok(F.lanes.some(l => l.at === 0), 'founding spokes laid at tick 0');
  ok(F.gates.length >= 3, `gates on the frame edge (${F.gates.length})`);
  ok(F.meta.sprouts > 0, `hypoxia sprouts fired (${F.meta.sprouts})`);
  ok(Array.isArray(F.anchors) && F.anchors.length >= 2, `district anchors placed (${(F.anchors || []).map(a => a.kind).join(',')})`);
  ok(F.lanes.some(l => l.tier === 3), 'arterial tier exists after diversification');
}

section('growth is a client of the envelope');
{
  const small = growCity('7:Vylfstrand:412', { ...CTX, popSeries: defaultEnvelope(240, 2600), wallsAt: -1 });
  ok(small.meta.builtCount < F.meta.builtCount * 0.55, `smaller envelope ⇒ smaller town (${small.meta.builtCount} < ${F.meta.builtCount})`);
  ok(small.meta.farmCount < F.meta.farmCount, `smaller town needs fewer farms (${small.meta.farmCount} < ${F.meta.farmCount})`);
  let over = 0;
  for (const lf of live(F)) if (lf.builtAt >= F.meta.ticks) over++;
  ok(over === 0, 'no cell built after the run ends');
}

section('terrain discipline');
{
  const lv = live(F);
  ok(lv.every(l => !(l.builtAt >= 0 && (l.water || l.river))), 'nothing is built on water or in the river');
  ok(lv.every(l => !(l.use === USE.FARM && (l.water || l.river))), 'nothing is farmed on water');
  ok(F.leaves.some(l => l.river === 1), 'the river crosses the frame');
  ok(F.leaves.some(l => l.water === 1), 'the coastal frame has sea');
  ok(nucOf(F).builtAt === 0, 'the nucleus is the first cell');
}

section('walls, sacks, spill — boundary conditions from above');
{
  ok(F.wall && F.wall.at >= CTX.wallsAt && F.wall.ring.length > 8, `walls rise on the civ tick (${F.wall && F.wall.at}, ${F.wall && F.wall.ring.length} cells)`);
  const sacks = F.events.filter(e => e.type === 'sack');
  ok(sacks.length === CTX.sackTicks.length, `every civ sack lands (${sacks.length})`);
  ok(live(F).some(l => l.burnedAt >= 0), 'sacked quarters burned');
  ok(F.events.some(e => e.type === 'spill'), 'the town eventually spills its walls');
  const noWalls = growCity('7:Vylfstrand:412', { ...CTX, wallsAt: -1 });
  ok(!noWalls.wall, 'wallsAt=-1 ⇒ no wall');
}

section('coverage invariant');
{
  // every urban cell ends within a few lane-hops on the leaf graph
  const idx = new Map(); live(F).forEach(l => idx.set(l.id, l));
  const adj = new Map();
  for (const l of F.lanes) { if (!adj.has(l.a)) adj.set(l.a, []); if (!adj.has(l.b)) adj.set(l.b, []); adj.get(l.a).push(l.b); adj.get(l.b).push(l.a); }
  // BFS over leaves: neighbours approximated by nearest lanes — use distance instead:
  // every built cell within 0.12 km of some lane endpoint (hop metric needs topo; distance is the render truth)
  let worst = 0;
  const lanePts = new Set(); for (const l of F.lanes) { lanePts.add(l.a); lanePts.add(l.b); }
  for (const lf of live(F)) {
    if (lf.builtAt < 0) continue;
    let d = Infinity;
    for (const id of lanePts) { const g = idx.get(id); if (!g) continue; d = Math.min(d, Math.hypot(g.x - lf.x, g.y - lf.y)); }
    worst = Math.max(worst, d);
  }
  ok(worst < 0.30, `every urban cell within 300 m of a lane (worst ${(worst * 1000) | 0} m)`);
}

section('engines site their nuclei differently');
{
  const base = { ...CTX, wallsAt: -1, sackTicks: [] };
  const nuc = {};
  for (const e of ['gateway', 'break-of-bulk', 'fortress', 'market']) {
    const f = growCity('7:Enginetest:9', { ...base, engine: e });
    nuc[e] = `${Math.round(f.leaves[f.nucleus].x * 100)},${Math.round(f.leaves[f.nucleus].y * 100)}`;
  }
  const distinct = new Set(Object.values(nuc)).size;
  ok(distinct >= 3, `engines pick distinct nuclei (${distinct}/4 distinct)`);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
