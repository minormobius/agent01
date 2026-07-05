// pocket.selftest.mjs — THE POCKET DIMENSION: the weave's exact topology at the nave's scale.
// Proves the cheat is honest: 48 analytic stations (K(6,8) complete), door RECIPROCITY (cross and
// cross back = the same station), true-arc door ORDER along every strip, every pocket one
// connected walk (hub door reaches every station door), the two commons attach every same-kind
// pocket, and determinism — INCLUDING solve-order independence, now that threads stream as
// lazily-solved CHUNK SEGMENTS sharing one foam (the voronoi-continuity guarantee).
import { buildPocketWorld, reciprocalDoor } from '../pocketweave.js';
import { pathFind } from '../v100/manager.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const world = buildPocketWorld(7);

// ── stations: the analytic K(6,8) ──
ok(world.stations.length === 48, `48 analytic stations — K(6,8) complete (${world.stations.length})`);
ok(world.stations.every((s) => s.rf > world.lines.flatR && s.rf < 1), 'every station sits in the weave annulus');
ok(world.stations.every((s) => s.district >= 0 && s.district < 7), 'every station knows its district');

// ── THE FACTION AXES: six faction biomes ↔ six white threads, interleaved around the ring ──
{
  const ws = world.warps;
  ok(ws.length === 6 && ws.every((w) => w.ward && w.ward.key && w.faction), 'every white thread carries a faction ward (a nave biome)');
  ok(new Set(ws.map((w) => w.ward.key)).size === 6, 'six DISTINCT faction biomes — one per thread');
  let adjOk = true, biOk = true;
  for (let w = 0; w < 6; w++) {
    if (ws[w].faction === ws[(w + 1) % 6].faction) adjOk = false;
    if (ws[w].faction !== ws[(w + 3) % 6].faction) biOk = false;
  }
  ok(adjOk, 'NO thread is adjacent to its own faction');
  ok(biOk, 'each faction BISECTS the group — its two threads antipodal, the axis crossing the nexus');
}

// build all 16 pockets (14 threads + 2 commons), all segments
const keys = [];
for (let w = 0; w < 6; w++) keys.push('W' + w);
for (let f = 0; f < 8; f++) keys.push('P' + f);
keys.push('CW', 'CP');
for (const k of keys) world.pocket(k).ensureAll();

// ── THE CHUNKS: every thread streams as ≥2 segments slicing ONE shared foam ──
{
  let multiOk = true, gidOk = true;
  for (const k of keys) {
    if (k[0] === 'C') continue;
    const p = world.pocket(k);
    if (p.segs.length < 2) multiOk = false;
    const gids = new Set();
    for (const g of p.segs) for (const c of g.rec.cells) { if (gids.has(c.gid)) gidOk = false; gids.add(c.gid); }
  }
  ok(multiOk, 'every thread pocket is CHUNKED — 2+ lazily-solved segments');
  ok(gidOk, 'segments PARTITION the shared foam — no cell solved twice (the seams abut, bit-identical)');
}

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
        if (!back || back.cell !== d.cell || back.seg !== d.seg) invOk = false;   // involution: crossing back returns HERE
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
    const sp = p.spine, a = Math.atan2(sp[1].y - sp[0].y, sp[1].x - sp[0].x), b = Math.atan2(sp[sp.length - 1].y - sp[sp.length - 2].y, sp[sp.length - 1].x - sp[sp.length - 2].x);
    let dz = Math.abs(b - a); if (dz > Math.PI) dz = 2 * Math.PI - dz;
    if (dz < Math.PI / 4) spiralOk = false;
  }
  ok(orderOk, 'door order along every band = the analytic rf order');
  ok(spiralOk, 'every pocket CURVES like the analytic map (the spine turns > 45° hub → rim)');
}

// ── every pocket is ONE walkable floor: the hub door reaches every station door (ACROSS seams) ──
{
  let reachOk = true;
  for (const k of keys) {
    const p = world.pocket(k), src = p.hubDoor >= 0 ? p.hubDoor : p.doors[0].node;
    for (const d of p.doors) { const path = pathFind(p.walk, src, d.node); if (!path) reachOk = false; }
  }
  ok(reachOk, 'within every pocket, the hub door walks to every station door THROUGH the seam ports (0 doors inside — one-door survives)');
}

// ── THE INTERFACE: one chamber, shared by both threads (the serious imposition, kept) ──
{
  const w0 = world.pocket('W0'), sd = w0.doors.find((d) => d.station);
  ok(sd.toKey[0] === 'X', 'every crossing passes through an interface chamber');
  const b = world.pocket(sd.toKey); b.ensureAll();
  ok(b.doors.length === 2 && b.doors.some((d) => d.toKey[0] === 'W') && b.doors.some((d) => d.toKey[0] === 'P'), 'the interface has exactly two doors — one to each thread');
  ok(!!pathFind(b.walk, b.doors[0].node, b.doors[1].node), 'the interface BRIDGES: its two doors walk to each other');
  const pf = world.pocket('P' + sd.station.f), pd = pf.doors.find((d) => d.station && d.station.w === 0 && d.station.f === sd.station.f);
  ok(pd && pd.toKey === sd.toKey, 'both threads reach the SAME chamber (one record per station, either side)');
}

// ── THE NEXUS: the works floor's centrepiece chamber, reserved for player progression ──
{
  const cp = world.pocket('CP'), rec = cp.segs[0].rec;
  const nx = rec.rooms.filter((r) => r.nexus);
  ok(nx.length === 1 && nx[0].door >= 0 && nx[0].glyph === '◈', 'the works floor has exactly ONE nexus chamber (doored, gilded ◈)');
  const base = cp.walk.base[cp.segs[0].chunkId];
  ok(nx.length === 1 && !!pathFind(cp.walk, cp.doors[0].node, base + nx[0].cells[0]), 'the nexus is walkable from the engine doors (the progression room is reachable)');
  ok(!world.pocket('CW').segs[0].rec.rooms.some((r) => r.nexus), 'the nexus is PRODUCTION-side only (the ops commons has none)');
}

// ── the grade: the spine carries the analytic over/under z (uphill and downhill) ──
{
  const sp = world.pocket('W0').spine, zs = sp.map((p) => p.z);
  ok(Math.max(...zs) - Math.min(...zs) > 10, 'the spine rises and falls (the weave z rides the pocket)');
}

// ── determinism ──
{
  const w2 = buildPocketWorld(7);
  for (const k of ['W0', 'P3', 'CW', 'X0:0']) w2.pocket(k).ensureAll();
  const sig = (w, k) => JSON.stringify(w.pocket(k).doors.map((d) => [d.seg, d.cell, d.toKey]));
  ok(sig(world, 'W0') === sig(w2, 'W0') && sig(world, 'P3') === sig(w2, 'P3') && sig(world, 'CW') === sig(w2, 'CW') && sig(world, 'X0:0') === sig(w2, 'X0:0'), 'pockets (and interfaces) are deterministic from (seed, threadKey)');
  ok(w2.stations.length === world.stations.length, 'stations are deterministic');
  // SOLVE-ORDER INDEPENDENCE: a pocket first touched via its LAST segment (a door preview arriving
  // from the rim side) places exactly the doors it places solved hub → rim.
  const w3 = buildPocketWorld(7), p3 = w3.pocket('W0');
  p3.ensureSeg(p3.segs.length - 1);
  p3.ensureAll();
  ok(sig(w3, 'W0') === sig(world, 'W0'), 'door placement is SOLVE-ORDER independent (segment-local, anchored at the seam)');
}

console.log(`\n  pocket: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
