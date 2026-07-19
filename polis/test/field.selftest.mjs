// field.selftest.mjs — node selftest for the settlement field (the city proper's
// first layer). No network, no UI:  node polis/test/field.selftest.mjs

import { growCity, defaultEnvelope, fieldDigest } from '../field.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const section = (s) => console.log('\n' + s);

const CTX = {
  engine: 'break-of-bulk', coastal: true, coastDir: 2.2, river: true, riverDir: 0.9,
  popSeries: defaultEnvelope(240, 16000), wallsAt: 70, sackTicks: [120, 178],
  eras: { wheelAt: 40, mechAt: 190 },
};

section('determinism');
{
  const a = growCity('7:Vylfstrand:412', CTX);
  const b = growCity('7:Vylfstrand:412', CTX);
  ok(fieldDigest(a) === fieldDigest(b), `same siteSeed ⇒ identical field (${fieldDigest(a)})`);
  const c = growCity('7:Vylfstrand:413', CTX);
  ok(fieldDigest(a) !== fieldDigest(c), 'different siteSeed ⇒ different field');
}

section('the three regimes');
{
  const f = growCity('7:Vylfstrand:412', CTX);
  // regime 1: spokes at tick 0 connect gates to the nucleus
  ok(f.lanes.some(l => l.at === 0), 'founding spokes laid at tick 0');
  ok(f.gates.length >= 3, `gates on the frame edge (${f.gates.length})`);
  // regime 2: coverage sprouts happened
  ok(f.meta.sprouts > 0, `hypoxia sprouts fired (${f.meta.sprouts})`);
  // regime 3: diversification anchors + a tier hierarchy
  ok(Array.isArray(f.anchors) && f.anchors.length >= 2, `district anchors placed (${(f.anchors || []).map(a => a.kind).join(',')})`);
  ok(f.lanes.some(l => l.tier === 3), 'arterial tier exists after diversification');
  ok(f.events.some(e => e.type === 'diversify'), 'diversification is an event');
}

section('growth is a client of the envelope');
{
  const f = growCity('7:Vylfstrand:412', CTX);
  const T = CTX.popSeries.length;
  // built blocks track the envelope: final count ≈ pop/perCell (mech density at the end)
  const expect = Math.ceil(CTX.popSeries[T - 1] / 95);
  ok(Math.abs(f.meta.builtCount - expect) <= expect * 0.35, `built blocks ≈ envelope target (${f.meta.builtCount} vs ~${expect})`);
  // builtAt ticks are within range and only ever look backward
  let mono = true;
  for (let i = 0; i < f.builtAt.length; i++) if (f.builtAt[i] >= T) mono = false;
  ok(mono, 'no block built after the run ends');
  // a smaller envelope grows a smaller town
  const small = growCity('7:Vylfstrand:412', { ...CTX, popSeries: defaultEnvelope(240, 2600), wallsAt: -1 });
  ok(small.meta.builtCount < f.meta.builtCount * 0.5, `smaller envelope ⇒ smaller town (${small.meta.builtCount} < ${f.meta.builtCount})`);
}

section('terrain discipline');
{
  const f = growCity('7:Vylfstrand:412', CTX);
  let wet = 0;
  for (let i = 0; i < f.builtAt.length; i++) if (f.builtAt[i] >= 0 && (f.water[i] || f.river[i])) wet++;
  ok(wet === 0, 'nothing is built on water or in the river');
  ok(f.river.some(v => v === 1), 'the river crosses the frame');
  ok(f.water.some(v => v === 1), 'the coastal frame has sea');
  ok(f.builtAt[f.nucleus] === 0, 'the nucleus is the first block');
}

section('walls, sacks, spill — boundary conditions from above');
{
  const f = growCity('7:Vylfstrand:412', CTX);
  ok(f.wall && f.wall.at >= CTX.wallsAt && f.wall.ring.length > 8, `walls rise on the civ tick (${f.wall && f.wall.at}, ${f.wall && f.wall.ring.length} blocks)`);
  const sacks = f.events.filter(e => e.type === 'sack');
  ok(sacks.length === CTX.sackTicks.length, `every civ sack lands (${sacks.length})`);
  let burned = 0;
  for (let i = 0; i < f.burnedAt.length; i++) if (f.burnedAt[i] >= 0) burned++;
  ok(burned > 0, `sacked quarters burned (${burned} blocks)`);
  ok(f.events.some(e => e.type === 'spill'), 'the town eventually spills its walls');
  const noWalls = growCity('7:Vylfstrand:412', { ...CTX, wallsAt: -1 });
  ok(!noWalls.wall, 'wallsAt=-1 ⇒ no wall (the city never fortified in civ)');
}

section('coverage invariant');
{
  const f = growCity('7:Vylfstrand:412', CTX);
  // every built block ends within REACH+2 lane-hops (the hypoxia solver did its job)
  const G = f.meta.G, N = G * G;
  const laneCell = new Uint8Array(N);
  for (const l of f.lanes) { laneCell[l.a] = 1; laneCell[l.b] = 1; }
  const hop = new Int32Array(N).fill(-1); const q = [];
  for (let i = 0; i < N; i++) if (laneCell[i]) { hop[i] = 0; q.push(i); }
  const nb = (i) => { const gx = i % G, gy = (i / G) | 0, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue; out.push(ny * G + nx); } return out; };
  for (let h = 0; h < q.length; h++) for (const v of nb(q[h])) if (hop[v] < 0 && !f.water[v]) { hop[v] = hop[q[h]] + 1; q.push(v); }
  let worst = 0;
  for (let i = 0; i < N; i++) if (f.builtAt[i] >= 0) worst = Math.max(worst, hop[i] < 0 ? 99 : hop[i]);
  ok(worst <= 5, `every built block within 5 lane-hops (worst ${worst})`);
}

section('engines site their nuclei differently');
{
  const base = { ...CTX, wallsAt: -1, sackTicks: [] };
  const nuc = {};
  for (const e of ['gateway', 'break-of-bulk', 'fortress', 'market']) nuc[e] = growCity('7:Enginetest:9', { ...base, engine: e }).nucleus;
  const distinct = new Set(Object.values(nuc)).size;
  ok(distinct >= 3, `engines pick distinct nuclei (${distinct}/4 distinct)`);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
