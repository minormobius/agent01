// pocket.selftest.mjs — THE POCKET DIMENSION: the weave's exact topology at the nave's scale.
// Proves the cheat is honest: 48 analytic stations (K(6,8) complete), door RECIPROCITY (cross and
// cross back = the same station), true-arc door ORDER along every strip, every pocket one
// connected walk (hub door reaches every station door), the two commons attach every same-kind
// pocket, and determinism.
import { buildPocketWorld, reciprocalDoor } from '../pocketweave.js';
import { pathFind } from '../v100/manager.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const world = buildPocketWorld(7);

// ── stations: the analytic K(6,8) ──
ok(world.stations.length === 48, `48 analytic stations — K(6,8) complete (${world.stations.length})`);
ok(world.stations.every((s) => s.rf > world.lines.flatR && s.rf < 1), 'every station sits in the weave annulus');
ok(world.stations.every((s) => s.district >= 0 && s.district < 7), 'every station knows its district');

// build all 16 pockets (14 threads + 2 commons)
const keys = [];
for (let w = 0; w < 6; w++) keys.push('W' + w);
for (let f = 0; f < 8; f++) keys.push('P' + f);
keys.push('CW', 'CP');
for (const k of keys) world.pocket(k);

// ── door counts: K(6,8) first-person + the hub door ──
let whiteOk = true, prodOk = true;
for (const k of keys) {
  const p = world.pocket(k);
  const st = p.doors.filter((d) => d.station).length;
  if (k[0] === 'W' && k !== 'CW' && (st !== 8 || p.hubDoor < 0)) whiteOk = false;
  if (k[0] === 'P' && k !== 'CP' && (st !== 6 || p.hubDoor < 0)) prodOk = false;
}
ok(whiteOk, 'every white pocket: 8 station doors (one per engine) + the commons door');
ok(prodOk, 'every engine pocket: 6 station doors (one per white) + the commons door');
ok(world.pocket('CW').doors.length === 6 && world.pocket('CP').doors.length === 8, 'the commons attach 6 white / 8 engine pockets');

// ── reciprocity: cross, and cross back — the same station both ways ──
{
  let recOk = true, invOk = true;
  for (const k of keys) {
    const p = world.pocket(k);
    for (const d of p.doors) {
      const r = reciprocalDoor(world, k, d);
      if (!r) { recOk = false; continue; }
      if (d.station) {
        if (!r.station || r.station.w !== d.station.w || r.station.f !== d.station.f) recOk = false;
        const back = reciprocalDoor(world, d.toKey, r);
        if (!back || back.cell !== d.cell) invOk = false;   // involution: crossing back returns HERE
      }
    }
  }
  ok(recOk, 'every station door has its reciprocal (the same crossing, seen from the other thread)');
  ok(invOk, 'crossing is an involution: cross then cross back = the door you left');
}

// ── the spiral is honest: doors in analytic rf order along the band, each ON its side (parity) ──
{
  let orderOk = true, spiralOk = true;
  for (const k of keys) {
    if (k[0] === 'C') continue;
    const p = world.pocket(k), st = p.doors.filter((d) => d.station);
    for (let i = 1; i < st.length; i++) if (st[i].station.rf < st[i - 1].station.rf - 1e-9) orderOk = false;
    // the band genuinely curves: the spine's heading turns by more than a quarter-turn end to end
    const sp = p.rec._spine, a = Math.atan2(sp[1].y - sp[0].y, sp[1].x - sp[0].x), b = Math.atan2(sp[sp.length - 1].y - sp[sp.length - 2].y, sp[sp.length - 1].x - sp[sp.length - 2].x);
    let dz = Math.abs(b - a); if (dz > Math.PI) dz = 2 * Math.PI - dz;
    if (dz < Math.PI / 4) spiralOk = false;
  }
  ok(orderOk, 'door order along every band = the analytic rf order');
  ok(spiralOk, 'every pocket CURVES like the analytic map (the spine turns > 45° hub → rim)');
}

// ── every pocket is ONE walkable floor: the hub door reaches every station door ──
{
  let reachOk = true;
  for (const k of keys) {
    const p = world.pocket(k), src = p.hubDoor >= 0 ? p.hubDoor : p.doors[0].node;
    for (const d of p.doors) { const path = pathFind(p.walk, src, d.node); if (!path) reachOk = false; }
  }
  ok(reachOk, 'within every pocket, the hub door walks to every station door (0 doors inside — one-door survives)');
}

// ── determinism ──
{
  const w2 = buildPocketWorld(7);
  for (const k of ['W0', 'P3', 'CW']) w2.pocket(k);
  const sig = (w, k) => JSON.stringify(w.pocket(k).doors.map((d) => [d.cell, d.toKey]));
  ok(sig(world, 'W0') === sig(w2, 'W0') && sig(world, 'P3') === sig(w2, 'P3') && sig(world, 'CW') === sig(w2, 'CW'), 'pockets are deterministic from (seed, threadKey)');
  ok(w2.stations.length === world.stations.length, 'stations are deterministic');
}

console.log(`\n  pocket: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
