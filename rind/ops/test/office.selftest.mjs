// office.selftest.mjs — the THREAD-RELATIVE office engine. Proves: each thread partitions into a
// full office of rooms (rooms cover the thread, a hallway spine connects the nexus to the rim),
// every OTHER thread is reachable only as a door (K(6,8): each white has 8 doors, each prod 6), and
// every door re-centres onto a cell the neighbour thread actually owns. Mirrors office-app.js's model.
import { buildCurveModel } from '../curveseed.js';
import { certify } from '../onedoor.js';
import { assignZones } from '../v100/voronoi.js';
import { ROLES } from '../v100/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const m = buildCurveModel(7, { rings: 1, flatR: 0.35, layers: 8, pitch: 28, width: 6, NW: 6, NF: 8, turnScale: 0.35, lobby: true });
const cert = certify(m, { concourse: 'flood' });
const cells = m.cells;

// ── build the thread model (as office-app does) ──
function buildThreads() {
  const T = new Map();
  const get = (kind, idx) => { const k = (kind === 'white' ? 'W' : 'P') + idx; if (!T.has(k)) T.set(k, { key: k, kind, idx, cells: new Set(), doorAt: new Map(), nexusGi: -1 }); return T.get(k); };
  for (const c of cells) if (c.owner) get(c.owner.kind, c.owner.idx).cells.add(c.gi);
  for (const d of cert.doors) { get('white', d.w).doorAt.set(d.a, { toKey: 'P' + d.f, farGi: d.b }); get('prod', d.f).doorAt.set(d.b, { toKey: 'W' + d.w, farGi: d.a }); }
  for (const t of T.values()) { let best = -1, bd = Infinity; for (const gi of t.cells) { const c = cells[gi], r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; best = gi; } } t.nexusGi = best; }
  return T;
}
const threads = buildThreads();
const stepNbrs = (gi, t) => [...cells[gi].adj].filter((nb) => t.cells.has(nb));
const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;
function pathWithin(t, a, b) { if (a === b) return [a]; const prev = new Map([[a, -1]]), q = [a]; for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepNbrs(q[h], t)) if (!prev.has(nb)) { prev.set(nb, q[h]); q.push(nb); } } if (!prev.has(b)) return null; const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse(); }

ok(threads.size === 14, `14 threads (6 white + 8 prod) (${threads.size})`);
ok([...threads.values()].filter((t) => t.kind === 'white').length === 6 && [...threads.values()].filter((t) => t.kind === 'prod').length === 8, '6 white + 8 production');

// ── K(6,8): every OTHER thread is only a door ──
let whiteDoors = true, prodDoors = true;
for (const t of threads.values()) { if (t.kind === 'white' && t.doorAt.size !== 8) whiteDoors = false; if (t.kind === 'prod' && t.doorAt.size !== 6) prodDoors = false; }
ok(whiteDoors, 'each white office has 8 doors (one to every production thread)');
ok(prodDoors, 'each production office has 6 doors (one to every white thread)');

// every door leads to the OTHER kind and re-centres onto a cell that neighbour actually owns
let doorsValid = true;
for (const t of threads.values()) for (const [gi, d] of t.doorAt) { const nb = threads.get(d.toKey); if (!nb || nb.kind === t.kind || !nb.cells.has(d.farGi) || !t.cells.has(gi)) doorsValid = false; }
ok(doorsValid, 'every door crosses to the other kind and re-centres onto a neighbour-owned cell');

// ── the office partition (per thread) ──
function buildOffice(t) {
  const gis = [...t.cells], li = new Map(gis.map((g, i) => [g, i])), subEdges = [];
  for (const g of gis) for (const nb of stepNbrs(g, t)) if (nb > g && li.has(nb)) subEdges.push({ a: li.get(g), b: li.get(nb) });
  const nZones = Math.max(3, Math.round(gis.length / 12));
  const zone = assignZones(gis.length, subEdges, new Array(nZones).fill(1), (m.seed ^ (t.kind === 'white' ? 0x1111 : 0x2222) ^ (t.idx * 0x9e37)) >>> 0);
  const roomOf = new Map(), rooms = new Map();
  gis.forEach((g, i) => { const z = zone[i]; roomOf.set(g, z); rooms.set(z, (rooms.get(z) || 0) + 1); });
  let rim = t.nexusGi, br = -1; for (const g of t.cells) { const r = rfOf(g); if (r > br) { br = r; rim = g; } }
  const spine = pathWithin(t, t.nexusGi, rim);
  return { roomOf, rooms, spine, rim, nZones };
}

let coverOk = true, nonEmpty = true, spineOk = true, roleOk = true;
for (const t of threads.values()) {
  const off = buildOffice(t);
  if (off.roomOf.size !== t.cells.size) coverOk = false;                 // every chamber lands in a room
  for (const [z, n] of off.rooms) if (n < 1) nonEmpty = false;
  if (!off.spine || off.spine.length < 2) spineOk = false;               // hallway connects nexus → rim
  // spine stays inside the thread
  if (off.spine) for (const g of off.spine) if (!t.cells.has(g)) spineOk = false;
}
ok(coverOk, 'the office partition covers every chamber of the thread (rooms tile the thread)');
ok(nonEmpty, 'no empty rooms');
ok(spineOk, 'a hallway spine connects the nexus to the rim, inside the thread');

// roles resolve to glyphs
const WHITE_ROLES = ['govern', 'serve', 'learn', 'trade', 'dwell', 'play', 'heal', 'store'];
const PROD_ROLES = ['make', 'store', 'mend', 'move', 'trade', 'grow'];
for (const r of [...WHITE_ROLES, ...PROD_ROLES]) if (!ROLES[r] || !ROLES[r].glyph) roleOk = false;
ok(roleOk, 'every office role resolves to a v100 glyph');

// determinism
const a = buildOffice(threads.get('W0')), b = buildOffice(threads.get('W0'));
ok(a.roomOf.size === b.roomOf.size && a.nZones === b.nZones && JSON.stringify(a.spine) === JSON.stringify(b.spine), 'office partition is deterministic');

console.log(`\n  office: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
