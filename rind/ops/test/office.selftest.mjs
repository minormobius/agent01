// office.selftest.mjs — the SEVEN-HEXAGON thread-office engine, LINE-OF-SIGHT edition (kernel:
// officeweave.js — the page drives the same module, so there is no app/test mirror to drift). Proves:
//   • the weave EXTENDED TO SEVEN HEXAGONS (aperture-7, hexScale √7) keeps the FULL onedoor
//     certificate — K(6,8)=48/48, 14/14 spirals continuous, every door at grade, one-door — while
//     every thread lands ~2.4× the chambers ("thicken everything up");
//   • the seven child hexagons are real DISTRICTS: a 7-way partition, all populated, the spawn in
//     the centre one, and every white thread spanning several;
//   • each thread partitions into a v101-style office: hall + traffic-sized walled rooms, one
//     door per room (a spanning tree rooted at the hall), MIN_ROOM bulldozed, a grand anchor at
//     the nexus, light baked per room — and the WALLED walk graph still reaches every chamber;
//   • CROSSING IS A NO-OP: one global walk graph (office walls + the 48 K-doors + the open
//     plazas) reaches every owned chamber; the plaza joins the same-kind threads with ZERO
//     K-doors (onedoor's door-free concourse, walked);
//   • SIGHT: the occlusion grid is rasterised from the same trimmed walls that are drawn — a
//     walled-off room is hidden, the room behind its own door is seen, and another thread
//     genuinely SPILLS INTO VIEW through a K-door gap.
import { buildOfficeWorld, OFFICE_DEFAULTS, HALL, WHITE_ROLES, PROD_ROLES, plazaRf } from '../officeweave.js';
import { GRAND_ROLES, MIN_ROOM, HUB_ROLES, QUIET_ROLES } from '../v101/rooms.js';
import { ROLES } from '../v100/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const world = buildOfficeWorld(7, { probes: 24 });
const { m, cert, cells, threads, districts } = world;

// ── the seven-hexagon extension keeps the whole certificate ──
ok(Math.abs(m.R / 320 - Math.sqrt(7)) < 1e-9, `the weave spans the aperture-7 hexagon (R = 320·√7, got ${m.R.toFixed(1)})`);
ok(cert.k48 && cert.doorCount === 48, `K(6,8) complete: 48/48 doors (${cert.doorCount})`);
ok(cert.spiralsContinuous, `all 14 spirals continuous (${cert.threadsContinuous}/${cert.threadCount})`);
ok(cert.steepDoors === 0, `zero-ladder: every door at grade (${cert.steepDoors} steep)`);
ok(cert.oneDoorOk && cert.measuredMax <= 1 && cert.unreachable === 0, `one-door holds at ×7 (measured max ${cert.measuredMax})`);

// thickened: median chambers per thread ≥ ~2× the single-hex weave's ≈230
const sizes = [...threads.values()].filter((t) => !t.synthetic).map((t) => t.cells.size).sort((a, b) => a - b);
ok(sizes[7] >= 450, `threads thickened: median ${sizes[7]} chambers (was ≈230 in the single hex)`);

// ── the seven districts ──
{
  const counts = new Array(7).fill(0);
  for (const c of cells) counts[districts.of[c.gi]]++;
  ok(counts.every((n) => n > 0), `all 7 districts populated (${counts.join('/')})`);
  ok(districts.of[world.spawnGi] === 0, 'the spawn (the white plaza) sits in the centre district');
  let spanOk = true;
  for (const t of threads.values()) { if (t.kind !== 'white' || t.synthetic) continue; const ds = new Set(); for (const gi of t.cells) ds.add(districts.of[gi]); if (ds.size < 3) spanOk = false; }
  ok(spanOk, 'every white thread spans ≥3 districts (the office crosses the flower)');
  ok(districts.hexes.length === 7 && districts.hexes.every((h) => h.length === 6), 'the district overlay is 7 child hexagons');
}

// ── the thread model: K(6,8) first-person ──
ok(threads.size === 14, `the 14 real threads, no synthetic hub (${threads.size})`);
let whiteDoors = true, prodDoors = true, doorsValid = true;
for (const t of threads.values()) {
  if (t.kind === 'white' && t.doorAt.size !== 8) whiteDoors = false;
  if (t.kind === 'prod' && t.doorAt.size !== 6) prodDoors = false;
  for (const [gi, d] of t.doorAt) { const nb = threads.get(d.toKey); if (!nb || nb.kind === t.kind || !nb.cells.has(d.farGi) || !t.cells.has(gi)) doorsValid = false; }
}
ok(whiteDoors, 'each white office has 8 doors (one to every production thread)');
ok(prodDoors, 'each production office has 6 doors (one to every white thread)');
ok(doorsValid, 'every door crosses to the other kind and re-centres onto a neighbour-owned cell');

// ── the v101 office partition, per thread ──
let coverOk = true, minRoomOk = true, treeOk = true, reachOk = true, grandOk = true, litOk = true, roleOk = true, connOk = true;
const roleSizes = new Map();   // role → [cells counts] aggregated over all offices (for traffic sizing)
for (const t of threads.values()) {
  const off = world.office(t.key);
  // partition: every chamber is hall or exactly one room
  let covered = off.hall.size;
  for (const r of off.rooms) covered += r.cells.length;
  if (covered !== t.cells.size) coverOk = false;
  for (const r of off.rooms) {
    if (r.cells.length < MIN_ROOM) minRoomOk = false;
    (roleSizes.get(r.role) || roleSizes.set(r.role, []).get(r.role)).push(r.cells.length);
    // each room is one connected clump
    const set = new Set(r.cells), seen = new Set([r.cells[0]]), q = [r.cells[0]];
    for (let h = 0; h < q.length; h++) for (const nb of cells[q[h]].adj) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
    if (seen.size !== set.size) connOk = false;
    if (!ROLES[r.role] || !ROLES[r.role].glyph) roleOk = false;
    if ((off.lum.get(r.compGi) || 0) <= 0) litOk = false;
  }
  // doors form a spanning tree rooted at the hall: one door per room, all rooms reached
  if (off.doors.length !== off.rooms.length) treeOk = false;
  // the WALLED graph still reaches every chamber from the nexus
  const seen = new Set([t.nexusGi]), q = [t.nexusGi];
  for (let h = 0; h < q.length; h++) for (const nb of off.stepNbrs(q[h])) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  if (seen.size !== t.cells.size) reachOk = false;
  // grand anchor at the nexus end
  if (!t.synthetic) {
    const nc = cells[t.nexusGi];
    let anchor = null, ad = Infinity;
    for (const r of off.rooms) for (const g of r.cells) { const c = cells[g], d = (c.x - nc.x) ** 2 + (c.y - nc.y) ** 2; if (d < ad) { ad = d; anchor = r; } }
    if (!anchor || !anchor.grand) grandOk = false;
    else if (t.kind === 'white' && !GRAND_ROLES.includes(anchor.role)) grandOk = false;
    else if (t.kind === 'prod' && anchor.role !== 'make') grandOk = false;
  }
}
ok(coverOk, 'hall + rooms partition every chamber of each thread');
ok(connOk, 'every room is one connected clump');
ok(minRoomOk, `no room under MIN_ROOM = ${MIN_ROOM} chambers (v101 bulldozing)`);
ok(treeOk, 'doors form a spanning tree rooted at the hall (one door per room, all rooms reached)');
ok(reachOk, 'the WALLED walk graph reaches every chamber from the nexus');
ok(grandOk, 'the nexus room is the grand anchor (GRAND role on whites, the engine core on production)');
ok(litOk, 'every room component is lit (the baked pool reaches it)');
ok(roleOk, 'every office role resolves to a v100 glyph');

// v101 art genomes: every room carries a deco component (superformula genome + derived emit)
// and grows at least one wall lamp on its membrane
{
  let decoOk = true, lampOk = true;
  for (const t of threads.values()) {
    const off = world.office(t.key);
    for (const r of off.rooms) {
      if (!r.deco || !(r.deco.sym >= 3) || !(r.emit > 0 && r.emit <= 1)) decoOk = false;
      if (!r.lamps || !r.lamps.length || !r.lamps[0].model) lampOk = false;
    }
  }
  ok(decoOk, 'every room has a deco component genome with construction-derived emit');
  ok(lampOk, 'every room grows at least one wall lamp (v101 sconce/coral/crystal genome)');
}

// traffic sizing (v101): busy civic hubs claim more chambers than quiet rooms, in aggregate
{
  const mean = (roles) => { let s = 0, n = 0; for (const r of roles) for (const v of roleSizes.get(r) || []) { s += v; n++; } return n ? s / n : 0; };
  const hubMean = mean(HUB_ROLES.filter((r) => WHITE_ROLES.includes(r) || PROD_ROLES.includes(r)));
  const quietMean = mean(QUIET_ROLES.filter((r) => WHITE_ROLES.includes(r) || PROD_ROLES.includes(r)));
  ok(hubMean > quietMean, `traffic-sized rooms: hub roles avg ${hubMean.toFixed(1)} > quiet roles avg ${quietMean.toFixed(1)} chambers`);
}

// ── navigability: autopaths never trip a portal in passing ──
let navOk = true, reachedAll = true;
for (const t of threads.values()) {
  const off = world.office(t.key), gis = [...t.cells];
  const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y);
  const samples = [gis.reduce((bg, g) => rfOf(g) > rfOf(bg) ? g : bg, t.nexusGi), gis[(gis.length / 3) | 0], gis[(gis.length * 2 / 3) | 0], gis[gis.length - 1]];
  for (const dst of samples) {
    if (t.doorAt.has(dst)) continue;
    const pa = off.pathWithin(t.nexusGi, dst, true);
    const p = pa || off.pathWithin(t.nexusGi, dst, false);
    if (!p) { reachedAll = false; continue; }
    if (pa) for (const g of pa) if (t.doorAt.has(g)) navOk = false;
  }
}
ok(navOk, 'door-avoiding autopaths never pass THROUGH a portal (only end on one if it is the target)');
ok(reachedAll, 'every sampled office cell is reachable from the nexus');
{
  const t = threads.get('W0'), off = world.office('W0'), doorGi = [...t.doorAt.keys()][0];
  const p = off.pathWithin(t.nexusGi, doorGi, true);
  ok(p && p[p.length - 1] === doorGi, 'a walk targeting a door still ends on it (deliberate crossing works)');
}

// ── the GLOBAL walk graph: crossing is a no-op, and everything is walkable ──
{
  const owned = cells.filter((c) => c.owner).length;
  const seen = new Set([world.spawnGi]), q = [world.spawnGi];
  for (let h = 0; h < q.length; h++) for (const nb of world.walk.stepNbrs(q[h])) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  ok(seen.size === owned, `the global walk reaches every owned chamber (${seen.size}/${owned}; ${cells.length - owned} unowned offcuts excluded)`);
  // the PLAZA is the door-free same-kind concourse: from W0's nexus, never crossing a K-door,
  // every white nexus is reachable and no production chamber is ever touched — onedoor's white
  // concourse, now literally walked. Same for the production plaza on the lower stratum.
  const concourse = (startKey, kind) => {
    const s0 = threads.get(startKey).nexusGi, s = new Set([s0]), qq = [s0];
    for (let h = 0; h < qq.length; h++) for (const nb of cells[qq[h]].adj) {
      if (s.has(nb) || !world.walk.passable(qq[h], nb) || world.walk.kDoors.has(qq[h] + '|' + nb)) continue;
      s.add(nb); qq.push(nb);
    }
    let nex = 0, leaked = 0;
    for (const t of threads.values()) if (t.kind === kind && s.has(t.nexusGi)) nex++;
    for (const gi of s) if (cells[gi].owner.kind !== kind) leaked++;
    return { nex, leaked };
  };
  const wC = concourse('W0', 'white'), pC = concourse('P0', 'prod');
  ok(wC.nex === 6 && wC.leaked === 0, `the white plaza joins all 6 white nexuses with ZERO K-doors and no production leak (${wC.nex}/6, ${wC.leaked} leaked)`);
  ok(pC.nex === 8 && pC.leaked === 0, `the production plaza joins all 8 engine nexuses likewise (${pC.nex}/8, ${pC.leaked} leaked)`);
}

// ── SIGHT: the occlusion grid is the drawn walls — walls hide, doors spill ──
{
  const S = world.sight;
  let doorSee = 0;
  for (const p of world.doorPts) { const a = cells[p.a], b = cells[p.b]; if (S.visible(a.x, a.y, b.x, b.y, a.z)) doorSee++; }
  ok(doorSee / world.doorPts.length > 0.85, `sight passes through the door gaps (${doorSee}/${world.doorPts.length})`);
  // from the hall threshold of W0's first door: the room behind its own door is (partly) seen…
  const off = world.office('W0'), d0 = off.doors[0];
  const hallCell = off.roomOf.get(d0.a) === HALL ? d0.a : d0.b;
  const roomId = off.roomOf.get(d0.a) === HALL ? off.roomOf.get(d0.b) : off.roomOf.get(d0.a);
  const room = off.rooms.find((r) => r.id === roomId), hc = cells[hallCell];
  let seenIn = 0; for (const g of room.cells) { const c = cells[g]; if (S.visible(hc.x, hc.y, c.x, c.y, hc.z)) seenIn++; }
  ok(seenIn > 0, `the room behind its door is seen through the gap (${seenIn}/${room.cells.length} chambers)`);
  // …while a walled-off room on the same level nearby stays hidden
  const sameLevel = (r) => Math.abs(cells[r.compGi].z - hc.z) < m.vpitch * 1.5;
  const other = off.rooms.find((r) => r.id !== roomId && sameLevel(r) && Math.hypot(r.cx - hc.x, r.cy - hc.y) > m.pitch * 4 && Math.hypot(r.cx - hc.x, r.cy - hc.y) < m.pitch * 8);
  if (other) {
    let leak = 0; for (const g of other.cells) { const c = cells[g]; if (S.visible(hc.x, hc.y, c.x, c.y, hc.z)) leak++; }
    ok(leak / other.cells.length <= 0.34, `a walled-off room nearby stays (mostly) hidden (${leak}/${other.cells.length} visible)`);
  }
  // and standing at a K-door, the OTHER THREAD spills into view through the gap
  const t0 = threads.get('W0'), [kGi, kd] = [...t0.doorAt.entries()][0], kc = cells[kGi], N = threads.get(kd.toKey);
  let spill = 0;
  for (const g of N.cells) { const c = cells[g]; if (Math.hypot(c.x - kc.x, c.y - kc.y) < m.pitch * 10 && S.visible(kc.x, kc.y, c.x, c.y, kc.z)) spill++; }
  ok(spill > 0, `another thread spills into view through its K-door (${spill} chambers of ${kd.toKey} in sight)`);
}

// ── determinism ──
{
  const w2 = buildOfficeWorld(7, { probes: 0 });
  const a = world.office('W0'), b = w2.office('W0');
  const sig = (off) => JSON.stringify({ rooms: off.rooms.map((r) => [r.role, r.cells.length, r.grand ? 1 : 0]), doors: off.doors.map((d) => [d.a, d.b]), spine: off.spinePath });
  ok(sig(a) === sig(b), 'the office partition is deterministic');
  ok(w2.cert.doorCount === cert.doorCount && w2.cells.length === cells.length, 'the world is deterministic');
  ok(w2.walls.length === world.walls.length && w2.doorPts.length === world.doorPts.length && w2.spawnGi === world.spawnGi, 'walls, door points and spawn are deterministic');
}

console.log(`\n  office (seven hexagons, v101): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
