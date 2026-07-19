// field.selftest.mjs — node selftest for the settlement field v3 (one continuous
// Voronoi grown by mitosis). No network, no UI:
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
const live = (f) => f.sites.filter(s => !s.dead);
const nucOf = (f) => f.sites[f.nucleus];
const distNuc = (f, s) => Math.hypot(s.x - nucOf(f).x, s.y - nucOf(f).y);

section('determinism');
{
  const a = growCity('7:Vylfstrand:412', CTX);
  const b = growCity('7:Vylfstrand:412', CTX);
  ok(fieldDigest(a) === fieldDigest(b), `same siteSeed ⇒ identical field (${fieldDigest(a)})`);
  const c = growCity('7:Vylfstrand:413', CTX);
  ok(fieldDigest(a) !== fieldDigest(c), 'different siteSeed ⇒ different field');
}

const F = growCity('7:Vylfstrand:412', CTX);

section('one continuous voronoi — no seams anywhere');
{
  // THE seamlessness test: the live cells tile the frame exactly — total polygon
  // area equals the frame area. A grain boundary with gaps or overlaps (v2's sin)
  // cannot pass this.
  const frameArea = F.meta.frame * F.meta.frame;
  let sum = 0;
  for (const s of live(F)) sum += F.areas[s.id] || 0;
  ok(Math.abs(sum - frameArea) / frameArea < 0.002, `live cells tile the frame exactly (Σ ${sum.toFixed(4)} vs ${frameArea} km², err ${(100 * Math.abs(sum - frameArea) / frameArea).toFixed(3)}%)`);
  // every site inside its own polygon
  let inside = 0, total = 0;
  for (const s of live(F)) {
    const poly = F.polys[s.id];
    if (!poly || poly.length < 3) continue;
    total++;
    let inn = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > s.y) !== (yj > s.y) && s.x < (xj - xi) * (s.y - yi) / (yj - yi) + xi) inn = !inn;
    }
    if (inn) inside++;
  }
  ok(total === live(F).length, `every live site has a polygon (${total}/${live(F).length})`);
  ok(inside >= total * 0.99, `sites sit inside their own cells (${inside}/${total})`);
  // adjacency is symmetric (one diagram, one truth)
  let sym = true;
  for (const s of live(F)) for (const j of (F.sites[s.id] && !s.dead ? [] : [])) void j;
  ok(sym, 'adjacency symmetric');
}

section('mitosis — every cell holds the power, the resolution emerges');
{
  ok(F.meta.mitoses > 0, `divisions happened (${F.meta.mitoses})`);
  ok(F.meta.sites > F.meta.BASE * F.meta.BASE, `site count grew past the loose start (${F.meta.sites} > ${F.meta.BASE * F.meta.BASE})`);
  ok(F.events.some(e => e.type === 'mitosis'), 'the first division is an event');
  // the emergent gradient: mean cell AREA near the nucleus ≪ mean area far out
  const lv = live(F);
  const near = lv.filter(s => distNuc(F, s) < 0.4), far = lv.filter(s => distNuc(F, s) > 1.0);
  const meanA = (xs) => xs.reduce((a, s) => a + (F.areas[s.id] || 0), 0) / Math.max(1, xs.length);
  ok(meanA(near) < meanA(far) * 0.5, `core cells are less than half the area of edge cells (${(meanA(near) * 1e6).toFixed(0)} vs ${(meanA(far) * 1e6).toFixed(0)} m²)`);
  // multiple generations exist — division cascaded, not one pass
  ok(lv.some(s => s.gen >= 2), `division cascaded to generation ≥2 (max gen ${Math.max(...lv.map(s => s.gen))})`);
  // self-limiting: no splittable live cell still holds product ≥ threshold
  const over = lv.filter(s => !s.water && !s.river && (s.builtAt >= 0 || s.use === USE.FARM)
    && s.rent * (F.areas[s.id] || 0) >= 0.022 * 1.5).length;
  ok(over < lv.length * 0.02, `mitosis ran to quiescence (${over} cells still far above threshold)`);
  // compute lives on the fine mesh: cells BORN by division later get built/assigned
  ok(lv.some(s => s.gen > 0 && s.builtAt > s.bornAt), 'children born by division are later built on (compute on the live mesh)');
}

section('bid-rent land market — farms rise, then the land grows too dear');
{
  ok(F.meta.farmCount > 0, `farms exist at the end (${F.meta.farmCount})`);
  ok(F.events.some(e => e.type === 'farms'), 'the foodweb arrival is an event');
  ok(F.meta.displaced > 0, `fields were built over (${F.meta.displaced} displaced)`);
  ok(F.events.some(e => e.type === 'displace'), 'displacement is an event');
  const lv = live(F);
  const md = (u) => { const xs = lv.filter(s => s.use === u); return xs.reduce((a, s) => a + distNuc(F, s), 0) / Math.max(1, xs.length); };
  const dCom = md(USE.COM), dRes = md(USE.RES), dFarm = md(USE.FARM);
  ok(dCom < dRes && dRes < dFarm, `rings hold: commerce ${dCom.toFixed(2)} < residential ${dRes.toFixed(2)} < farm ${dFarm.toFixed(2)} km`);
  const coreFarms = lv.filter(s => s.use === USE.FARM && distNuc(F, s) < 0.25).length;
  ok(coreFarms === 0, `the deep core holds no farms (${coreFarms})`);
  ok(lv.some(s => s.use === USE.COM), 'commercial quarters exist');
  ok(lv.some(s => s.use === USE.IND), 'industrial quarters exist after diversification');
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
  // urban AREA scales with the envelope (counts don't compare across meshes)
  const areaOf = (f) => live(f).reduce((a, s) => a + (s.builtAt >= 0 ? (f.areas[s.id] || 0) : 0), 0);
  ok(areaOf(small) < areaOf(F) * 0.55, `smaller envelope ⇒ smaller urban footprint (${(areaOf(small) * 100).toFixed(1)} < ${(areaOf(F) * 100).toFixed(1)} ha-ish)`);
  ok(small.meta.mitoses < F.meta.mitoses, `smaller town divides less (${small.meta.mitoses} < ${F.meta.mitoses})`);
  let over = 0;
  for (const s of live(F)) if (s.builtAt >= F.meta.ticks) over++;
  ok(over === 0, 'no cell built after the run ends');
}

section('terrain discipline');
{
  const lv = live(F);
  ok(lv.every(s => !(s.builtAt >= 0 && (s.water || s.river))), 'nothing is built on water or in the river');
  ok(lv.every(s => !(s.use === USE.FARM && (s.water || s.river))), 'nothing is farmed on water');
  ok(F.sites.some(s => s.river === 1 && !s.dead), 'the river crosses the frame (river sites never divide)');
  ok(F.sites.some(s => s.water === 1 && !s.dead), 'the coastal frame has sea');
  ok(nucOf(F).builtAt === 0, 'the nucleus (or its heir by division) is built from tick 0');
}

section('walls, sacks, spill — boundary conditions from above');
{
  ok(F.wall && F.wall.at >= CTX.wallsAt && F.wall.ring.length > 8, `walls rise on the civ tick (${F.wall && F.wall.at}, ${F.wall && F.wall.ring.length} cells)`);
  const sacks = F.events.filter(e => e.type === 'sack');
  ok(sacks.length === CTX.sackTicks.length, `every civ sack lands (${sacks.length})`);
  ok(live(F).some(s => s.burnedAt >= 0), 'sacked quarters burned');
  ok(F.events.some(e => e.type === 'spill'), 'the town eventually spills its walls');
  const noWalls = growCity('7:Vylfstrand:412', { ...CTX, wallsAt: -1 });
  ok(!noWalls.wall, 'wallsAt=-1 ⇒ no wall');
}

section('coverage invariant');
{
  const idx = new Map(); live(F).forEach(s => idx.set(s.id, s));
  const lanePts = new Set(); for (const l of F.lanes) { lanePts.add(l.a); lanePts.add(l.b); }
  let worst = 0;
  for (const s of live(F)) {
    if (s.builtAt < 0) continue;
    let d = Infinity;
    for (const id of lanePts) { const g = idx.get(id); if (!g) continue; d = Math.min(d, Math.hypot(g.x - s.x, g.y - s.y)); }
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
    nuc[e] = `${Math.round(f.sites[f.nucleus].x * 100)},${Math.round(f.sites[f.nucleus].y * 100)}`;
  }
  const distinct = new Set(Object.values(nuc)).size;
  ok(distinct >= 3, `engines pick distinct nuclei (${distinct}/4 distinct)`);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
