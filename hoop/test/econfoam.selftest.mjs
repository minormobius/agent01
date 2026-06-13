// econfoam.selftest.mjs — pins the /econ/foam/ WORKER CONTRACT (hoop/econ/foam/builder.js): the
// exact messages the page consumes, exercised headlessly by shimming the worker globals. The page
// itself is exercised by eye on deploy; everything it receives is proven here.
// Run: node hoop/test/econfoam.selftest.mjs

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── shim the DedicatedWorkerGlobalScope surface builder.js assigns to ──
const outbox = [];
globalThis.postMessage = (msg) => { outbox.push(msg); };
globalThis.onmessage = null;
await import('../econ/foam/builder.js');
ok(typeof globalThis.onmessage === 'function', 'builder.js installs its onmessage handler');
const send = (data) => globalThis.onmessage({ data });

// ── the build message → one `city` payload with everything the page renders ──
send({ type: 'build', seed: 1, n: 0, opt: { arcDeg: 6, axial: 10 } });
const city = outbox.find((m) => m.type === 'city');
ok(!!city && !outbox.some((m) => m.type === 'error'), 'build produces a city message, no error');
{
  ok(city.N > 8000, 'a dense sector (' + city.N + ' chambers)');
  ok(city.pos instanceof Float32Array && city.pos.length === 3 * city.N, 'instance positions: Float32Array(3N)');
  ok(city.owner instanceof Int32Array && city.owner.length === city.N, 'chamberOwner: Int32Array(N)');
  for (const k of ['role', 'footprint', 'bridging', 'access']) {
    const L = city.layers[k];
    ok(L instanceof Float32Array && L.length === 3 * city.N, 'colour layer "' + k + '": Float32Array(3N)');
    let okRange = true; for (let i = 0; i < L.length; i++) if (!(L[i] >= 0 && L[i] <= 1.2)) { okRange = false; break; }
    ok(okRange, 'colour layer "' + k + '" stays in displayable range');
  }
  ok(city.routeSegs instanceof Float32Array && city.routeSegs.length > 0 && city.routeSegs.length % 12 === 0, 'route ribbons: line segments (pos3+col3 ×2)');
  ok(Array.isArray(city.bill) && city.bill.length === city.stats.buildings, 'one glyph billboard per building');
  ok(city.bill.every((b) => isFinite(b.x) && isFinite(b.y) && isFinite(b.z) && b.g && b.fp >= 1), 'billboards carry world position, glyph, footprint');
  ok(city.bill.some((b) => b.road), 'some billboards mark road frontage');
  const s = city.stats;
  ok(s.buildings > 500 && s.row > 100 && s.closure > 0.9 && s.people > 300, 'stats: buildings, right-of-way, closure, people');
  ok(s.vitality >= 0 && s.vitality <= 100 && typeof s.tier === 'string', 'stats: blended vitality + tier');
  ok(s.access >= 0 && s.access <= 1 && typeof s.route === 'string', 'stats: access + a route summary line');
  ok(city.dims.Ri === 250 && city.dims.T === 50 && city.dims.Lx > 0 && city.dims.arcRad > 0, 'dims for the hull frame + camera');
  ok(city.genome.archetype === 'wild type', 'n=0 builds the wild-type genome');
  // owner values are coherent: -2 void, -1 right-of-way, else a real building index
  let bad = 0, roads = 0;
  for (let i = 0; i < city.N; i++) { const o = city.owner[i]; if (o === -1) roads++; else if (o < -2 || o >= s.buildings) bad++; }
  ok(bad === 0 && roads === s.row, 'owner indices are coherent (roads match right-of-way size)');
}

// ── road chambers paint road-grey in EVERY lens (the streets always read) ──
{
  const i = city.owner.indexOf(-1);
  ok(i >= 0, 'a right-of-way chamber exists');
  const grey = (L) => Math.abs(L[3 * i] - 0.62) < 0.01 && Math.abs(L[3 * i + 2] - 0.70) < 0.01;
  ok(grey(city.layers.role) && grey(city.layers.bridging) && grey(city.layers.access), 'right-of-way chambers are road-grey under every lens');
}

// ── inspect: click → the building dossier ──
{
  outbox.length = 0;
  // a busy non-dwell building: the one with the most chambers that fronts the road
  let target = 0, bf = -1;
  for (let k = 0; k < city.bill.length; k++) if (city.bill[k].road && city.bill[k].fp > bf) { bf = city.bill[k].fp; target = k; }
  send({ type: 'inspect', placeId: target });
  const ins = outbox.find((m) => m.type === 'inspect');
  ok(!!ins && ins.placeId === target, 'inspect answers for the asked place');
  ok(typeof ins.head === 'string' && ins.head.includes('chambers'), 'the dossier heads with role + footprint');
  ok(ins.head.includes('ON THE ROAD'), 'road frontage is called out');
  ok(Array.isArray(ins.people), 'the dossier lists who is there');
  ok(ins.shock === null || (ins.shock.ties >= 0 && ins.shock.needsAtRisk >= 0), 'the two-web shock rides along for non-dwellings');
}

// ── a rolled genome reaches the worker too ──
{
  outbox.length = 0;
  send({ type: 'build', seed: 1, n: 42, opt: { arcDeg: 6, axial: 10 } });
  const c2 = outbox.find((m) => m.type === 'city');
  ok(!!c2 && c2.genome.archetype !== undefined && c2.genome.archetype !== 'wild type', 'n>0 rolls a genome (archetype: ' + (c2 && c2.genome.archetype) + ')');
  ok(c2.stats.buildings !== city.stats.buildings || c2.stats.people !== city.stats.people, 'the rolled genome builds a different town');
}

// ── shapes + the role-isolation lens payload ──
{
  ok(city.roleIdx instanceof Int8Array && city.roleIdx.length === city.N, 'a per-chamber role index ships (the role-isolation lens)');
  ok(Array.isArray(city.roles) && city.roles.length > 5, 'the role list ships with it');
  let coherent = true;
  for (let i = 0; i < city.N; i++) {
    const ri = city.roleIdx[i], o = city.owner[i];
    if (o === -1 && ri !== -1) coherent = false;
    if (o === -2 && ri !== -2) coherent = false;
    if (o >= 0 && (ri < 0 || ri >= city.roles.length)) coherent = false;
  }
  ok(coherent, 'roleIdx is coherent with the owner map (road/void/building)');
  ok(city.bill.every((b) => typeof b.role === 'string'), 'billboards carry their role (glyph filtering)');
  // a different SHAPE flows through: shallower shell, thicker axially
  outbox.length = 0;
  send({ type: 'build', seed: 1, n: 0, opt: { arcDeg: 5, T: 24, axial: 12 } });
  const cs = outbox.find((m) => m.type === 'city');
  ok(!!cs && cs.dims.T === 24 && cs.dims.Ri === 250, 'a custom foamslice shape flows through to the dims (T=' + (cs && cs.dims.T) + ')');
  ok(cs.N !== city.N, 'a different shape is a different foam');
}

// ── the GROWN build: foam first, one message per round, then the same city payload ──
{
  outbox.length = 0;
  send({ type: 'build', seed: 1, n: 0, grow: true, opt: { arcDeg: 5, axial: 8, iters: 3 } });
  ok(outbox[0] && outbox[0].type === 'foam' && outbox[0].pos instanceof Float32Array && outbox[0].pos.length === 3 * outbox[0].N, 'growth opens with the bare foam (positions first, so the page can watch)');
  const grows = outbox.filter((m) => m.type === 'grow');
  ok(grows.length === 3 && grows.every((m, i) => m.iter === i + 1 && m.total === 3), 'one grow message per reinforcement round, in order');
  ok(grows.every((m) => m.segs instanceof Float32Array && m.segs.length % 12 === 0), 'each round carries the flux field as drawable segments');
  ok(grows[2].segs.length > 0, 'the field has visible desire lines by the last round');
  const gc = outbox.find((m) => m.type === 'city');
  ok(!!gc && gc.stats.route.startsWith('EMERGENT'), 'the grown city reports its emergent network (' + (gc && gc.stats.route) + ')');
  ok(gc.routeSegs instanceof Float32Array && gc.routeSegs.length > 0, 'the emergent tier hierarchy ships as the route ribbons');
  let roads = 0; for (let i = 0; i < gc.N; i++) if (gc.owner[i] === -1) roads++;
  ok(roads === gc.stats.row && roads > 50, 'the grown right-of-way is carved into the owner map (' + roads + ' chambers)');
  ok(gc.stats.closure > 0.9 && gc.stats.vitality > 0, 'the grown city closes its supply web and scores');
}

console.log(`econfoam.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
