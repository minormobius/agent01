// npc.js — v090 RESIDENTS: the social web's people, actually walking it.
//
// v090 already lays the multiplex society (buildSociety in the page: who lives where, who works where,
// whose third place is where). This turns that abstract web into LIVING AGENTS: every person in a
// dwelling becomes a resident who commutes home → work → third-place → home along the real walk graph,
// carrying a SEED-STABLE sprite genome roled to their job (sprite-core's resident-role override). Pure +
// deterministic from the world; the page renders the sprites + gates them behind the fog, and a click
// hands the resident to the story engine.

import { buildGenome } from '../v3/sprite-core.js';
import { pathFind, globalOf } from '../v8/manager.js';

// roles that are workplaces / third-places (cousins of the econ verbs) — who a dwelling commutes to.
const WORKROLES = new Set(['make', 'mend', 'trade', 'grow', 'serve', 'heal', 'learn', 'store', 'move', 'govern', 'play', 'worship']);
const THIRDROLES = new Set(['worship', 'serve', 'play', 'learn']);

// The multiplex social web over every loaded chunk: each doored room is a node carrying its role/glyph,
// its door walk-node, and a STABLE gid (the door cell's global-lattice id → the story engine's feature
// key). A dwelling links to its nearest workplace ('work') and nearest third-place ('third'); a budget
// of the work links also carry a concrete walk-graph route (the ambient commute traffic). Pure.
export function buildSociety(world, walk) {
  const rooms = [];
  for (const ch of world.chunks) ch.rooms.forEach((r, ri) => {
    if (r.door < 0) return;
    const dcell = r.doorRoad >= 0 ? r.doorRoad : (r.cells[0] != null ? r.cells[0] : 0);
    rooms.push({ ch: ch.id, ri, x: r.x, y: r.y, role: r.role, glyph: r.glyph, domain: r.domain, people: r.people || [],
      doorG: globalOf(walk, ch.id, dcell), cellsG: r.cells.map((c) => globalOf(walk, ch.id, c)),
      gid: (ch.cells[dcell] && ch.cells[dcell].gid) || (ch.id + ':' + ri) });
  });
  const work = rooms.filter((o) => WORKROLES.has(o.role)), third = rooms.filter((o) => THIRDROLES.has(o.role));
  const nearest = (list, o) => { let b = null, bd = Infinity; for (const w of list) { if (w === o) continue; const d = (w.x - o.x) ** 2 + (w.y - o.y) ** 2; if (d < bd) { bd = d; b = w; } } return b; };
  const edges = [], routes = []; let budget = 70;
  for (const o of rooms) {
    if (o.role !== 'dwell') continue;
    const n = Math.max(1, o.people.length), w = nearest(work, o);
    if (w) { edges.push({ ax: o.x, ay: o.y, bx: w.x, by: w.y, kind: 'work', a: o, b: w }); if (budget-- > 0) { const p = pathFind(walk, o.doorG, w.doorG); if (p && p.length > 1) routes.push({ cells: p, w: n }); } }
    const t = nearest(third, o); if (t && t !== w) edges.push({ ax: o.x, ay: o.y, bx: t.x, by: t.y, kind: 'third', a: o, b: t });
  }
  return { rooms, edges, routes };
}


const TAU = Math.PI * 2;
function rngFor(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Chaikin corner-cutting so a resident CURVES through the concourse instead of hopping cell→cell.
function chaikin(pts, iters) { for (let it = 0; it < iters; it++) { if (pts.length < 3) break; const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } out.push(pts[pts.length - 1]); pts = out; } return pts; }
const DKEYS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
export function dirKey(dx, dy) { if (!dx && !dy) return 'S'; let k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); k = ((k % 8) + 8) % 8; return DKEYS[k]; }

// Build the resident agents from the society the page already computed (rooms with door-graph nodes +
// the nearest work / third place per dwelling). One agent per named person; their route is the loop of
// door nodes [home, work, third]; their sprite is roled to their JOB.
export function buildResidents(world, walk, society, opts = {}) {
  const size = opts.size || 13, density = opts.density != null ? opts.density : 0.5;   // ~half the dwellers walk
  const byHome = new Map();
  for (const e of society.edges) {
    if (!e.a || e.a.role !== 'dwell') continue;
    let r = byHome.get(e.a); if (!r) byHome.set(e.a, r = { home: e.a, work: null, third: null });
    if (e.kind === 'work' && !r.work) r.work = e.b; else if (e.kind === 'third' && !r.third) r.third = e.b;
  }
  const agents = [];
  for (const { home, work, third } of byHome.values()) {
    const stops = [home, work, third].filter((s) => s && s.doorG != null && s.doorG >= 0);
    const route = stops.map((s) => s.doorG);
    if (route.length < 2) continue;                          // nowhere to commute
    const people = home.people && home.people.length ? home.people : ['someone'];
    people.forEach((name, i) => {
      const id = home.ch + '@' + Math.round(home.x) + ',' + Math.round(home.y) + '#' + i;
      if (rngFor('keep:' + id)() >= density) return;          // a deterministic coin thins the crowd
      const role = (work && work.role) || home.role;
      const rng = rngFor('hoop:' + id);
      const g0 = route[0], x = walk.pos[2 * g0], y = walk.pos[2 * g0 + 1];
      agents.push({ id, name, role, glyph: (work || home).glyph, featureKey: home.gid + '#' + i, homeKey: home, workKey: work, thirdKey: third,
        route, leg: 0, path: null, pts: null, prog: 0, dwellLeft: 200 + rng() * 1800, phase: 0, speed: 0.018 + rng() * 0.01,
        rng, genome: buildGenome('hoop-resident:' + id, { role, size }), x, y, dir: 'S' });
    });
  }
  return agents;
}

// Advance residents by `dtMs`. Only those within `radius` of (cx,cy) tick (the rest freeze cheaply); each
// glides along its current leg, then dwells, then plans the next leg with the walk-graph pathfinder.
export function stepResidents(agents, walk, dtMs, { cx = 0, cy = 0, radius = Infinity } = {}) {
  const r2 = radius * radius, dt = Math.min(dtMs, 80);       // clamp so a tab-switch doesn't teleport everyone
  for (const a of agents) {
    if ((a.x - cx) ** 2 + (a.y - cy) ** 2 > r2) continue;
    if (a.dwellLeft > 0) { a.dwellLeft -= dt; continue; }
    if (!a.pts) {                                            // plan the leg to the next stop
      const src = a.route[a.leg], dst = a.route[(a.leg + 1) % a.route.length];
      const p = src === dst ? null : pathFind(walk, src, dst);
      if (!p || p.length < 2) { a.leg = (a.leg + 1) % a.route.length; a.dwellLeft = 400 + a.rng() * 1200; continue; }
      a.pts = chaikin(p.map((n) => [walk.pos[2 * n], walk.pos[2 * n + 1]]), 2); a.prog = 0;
    }
    // arc-length advance along the polyline
    let step = a.speed * dt, i = a.prog | 0, ft = a.prog - i;
    while (step > 0 && i < a.pts.length - 1) {
      const A = a.pts[i], B = a.pts[i + 1], segLen = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-6, rem = segLen * (1 - ft);
      if (step < rem) { ft += step / segLen; step = 0; } else { step -= rem; i++; ft = 0; }
    }
    a.prog = i + ft;
    if (i >= a.pts.length - 1) {                             // arrived → dwell, then next leg
      const end = a.pts[a.pts.length - 1]; a.x = end[0]; a.y = end[1];
      a.pts = null; a.leg = (a.leg + 1) % a.route.length; a.dwellLeft = 1200 + a.rng() * 4000;
    } else {
      const A = a.pts[i], B = a.pts[i + 1], nx = A[0] + (B[0] - A[0]) * ft, ny = A[1] + (B[1] - A[1]) * ft;
      a.dir = dirKey(B[0] - A[0], B[1] - A[1]); a.phase = (a.phase + dt * 0.012) % 1e6; a.x = nx; a.y = ny;
    }
  }
  return agents;
}
