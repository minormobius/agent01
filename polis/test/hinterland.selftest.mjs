// polis/test/hinterland.selftest.mjs — node selftest for the hinterland engine.
//   node polis/test/hinterland.selftest.mjs
// Exercises the reform invariants: determinism, the drowning rule (no phantom
// cities on the shelf), the civ-client contract (environment/tech/transport eras
// from the run above), transport-era founding waves, railroads, sea routes,
// commodities, and envelope nudging.

import { rollMappaWorld, selectRegion, makeSampler } from '../mappaWorld.js';
import { buildMesh } from '../mesh.js';
import { runChronicle } from '../chronicle.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const section = s => console.log('\n' + s);

const world = rollMappaWorld(7, { N: 900 });
const region = selectRegion(world);
const mesh = buildMesh(11, region, makeSampler(world, region));

section('standalone (deglaciation backbone)');
{
  const C = runChronicle(11, mesh, { ticks: 160, world });
  const C2 = runChronicle(11, mesh, { ticks: 160, world });
  ok(JSON.stringify(C.events) === JSON.stringify(C2.events), 'deterministic');
  ok(C.civMode === false, 'standalone mode flagged');
  // THE DROWNING RULE: at every tick, no town holds population while its cell is
  // under that tick's sea level (allow the drowning tick itself — pop is decaying)
  let phantom = 0;
  for (let k = 0; k < C.ticks; k++) for (const t of C.towns) {
    if (t.history[k] > 8 && mesh.cells[t.cell].elev < C.env[k].seaLevel && t.drowned >= 0 && k > t.drowned + 8) phantom++;
  }
  ok(phantom === 0, `no phantom cities on the shelf (${phantom} violations)`);
  ok(C.towns.every(t => t.commodity), 'every town exports a commodity');
  ok(C.transport && C.transport.length === C.ticks, 'transport era recorded per tick');
}

section('civ-client mode (the world above drives everything)');
{
  const civ = {
    ticks: 1000, tickYears: 2.5, preset: 'kurgan',
    pulse: { t: Array.from({ length: 50 }, (_, i) => i * 20), data: Array.from({ length: 50 }, (_, i) => (i > 15 && i < 30 ? 0.8 : 0)) },
    founderTech: { fire: 0, herding: 0, wheel: 200, sail: 420, masonry: 380, metallurgy: 450, mechanisation: 760 },
    envelope: Array.from({ length: 50 }, (_, i) => Math.max(0, Math.min(1000, (i - 5) * 40))),
  };
  const C = runChronicle(11, mesh, { ticks: 160, world, civ });
  ok(C.civMode === true, 'civ mode flagged');
  ok(C.env.every(e => e.seaLevel === 0 && e.ice === 0), 'no deglaciation arc in civ mode (sea at modern level)');
  ok(C.env.some(e => e.humidity < -0.2), 'kurgan pulse arrives as drying');
  ok(C.env.every((e, i) => i === 0 || e.tech >= C.env[i - 1].tech - 1e-9), 'tech clock monotone from founder unlocks');
  // transport eras from founderTech: wheel at frac .2, sail .42, rail .76
  ok(C.transport[Math.round(0.1 * 159)] === 0 && C.transport[Math.round(0.3 * 159)] === 1, 'walk → wheel at the founder unlock');
  ok(C.transport[Math.round(0.5 * 159)] === 2 && C.transport[159] === 3, 'sail and rail eras open on schedule');
  ok(C.rails.length > 0, `railroads generate in the industrial hinterland (${C.rails.length} lines)`);
  ok(C.rails.every(rl => Array.isArray(rl.path) && rl.path.length >= 2), 'rail alignments are real paths');
  ok(C.seaRoutes.length > 0, `sea routes open under sail (${C.seaRoutes.length})`);
  ok(C.events.some(e => e.type === 'era'), 'era-opening events recorded');
  ok(C.towns.some(t => t.wave > 0), 'era waves founded new towns beyond the walk lattice');
  ok(C.towns.some(t => t.railed), 'rail-connected towns marked');
  // no mechanisation → no rails
  const noRail = runChronicle(11, mesh, { ticks: 160, world, civ: { ...civ, founderTech: { fire: 0, wheel: 200, sail: 420 } } });
  ok(noRail.rails.length === 0, 'no mechanisation in founder history → no railroads');
  // envelope nudging changes the trajectory (client, not clamp)
  const noEnv = runChronicle(11, mesh, { ticks: 160, world, civ: { ...civ, envelope: null } });
  const tot = X => X.towns.reduce((s, t) => s + (t.history[120] || 0), 0);
  ok(tot(C) !== tot(noEnv), 'envelope nudging alters regional growth');
  const C2 = runChronicle(11, mesh, { ticks: 160, world, civ });
  ok(JSON.stringify(C.events) === JSON.stringify(C2.events) && tot(C) === tot(C2), 'civ mode deterministic');
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
