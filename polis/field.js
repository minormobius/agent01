// field.js — THE SETTLEMENT FIELD v3: one continuous Voronoi, grown by MITOSIS.
//
// v2 cheated three ways (the user caught all three): compute stayed on a frozen
// base lattice; refinement lived in a quadtree bolted onto it, so the grain
// boundary showed; and the resolution ceiling was picked, not earned. v3 is the
// honest construction:
//
//   ONE POINT SET, ONE DIAGRAM. The city is a single global Voronoi tessellation
//   over a live set of sites. Every tick, EVERY cell holds the power of MITOSIS:
//   if its PRODUCT — rent × area, the actual output of the location — exceeds the
//   division threshold, the site divides into three or four children and dies, and
//   THE ENTIRE MESH IS RE-TESSELLATED. There is no base lattice, no levels, no
//   grain boundary: children are ordinary sites in the one diagram, their cells
//   seamlessly bounded by whoever their neighbours now are. Division self-limits —
//   a child's area is a third of its parent's, so its product falls back below
//   threshold unless rent keeps climbing — so the fine grain of the core and the
//   coarse pasture of the edge EMERGE from the land market instead of being
//   chosen. All simulation (growth, lanes, perfusion, the market) runs on the
//   current mesh, at whatever resolution mitosis has minted where.
//
// Everything else carries over from v2: the three transport regimes (nucleus
// spokes → coverage capillaries → arterial flux), the bid-rent land market
// (Ricardo → von Thünen → Alonso) with demand-sized farms and the Sinclair
// development shadow, walls/sacks/spill as boundary conditions from civ.
// Deterministic: (siteSeed, ctx) → identical field anywhere. Node + browser.

import { mulberry32, hash2 } from './prng.js';
import { generateSet } from '../rite/names/engine.js';

const TAU = Math.PI * 2;

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, s, oct = 5) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, s + o * 197); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

// ---- tuning ---------------------------------------------------------------------
const BASE = 26;                 // initial loose lattice BASE×BASE (~115 m cells)
const URBAN_PER_KM2 = 24000;     // pre-mechanisation urban density (people/km²)
const URBAN_PER_KM2_MECH = 14000;// the machine age spreads out
const FEED_PER_KM2 = 2600;       // people one km² of farmland feeds
const REACH = 1;                 // coverage: lane hop-distance urban tissue tolerates
const DIVERSIFY_POP = 3800;      // regime 3 + industry bids open
const ECON_EVERY = 12;           // ticks between land-market passes
const SPLIT_PRODUCT = 0.011;     // km²·rent — the mitosis threshold (product, not size)
const SPLITS_PER_TICK = 48;      // bounded divisions per tick (highest product first)
const MAX_SITES = 4600;          // safety guard, far above emergent counts
const AGENT_SCALE = 25;          // one agent stands for ~25 people (the envelope ratio)
const AGENT_CAP = 900;           // representation bound (perf guard, not a story limit)

export const USE = { WILD: 0, FARM: 1, RES: 2, COM: 3, IND: 4 };
export const USE_NAME = ['wild', 'farm', 'residential', 'commercial', 'industrial'];

// ---- the tessellation, pure -----------------------------------------------------
// One global Voronoi over `live` (a subset of `sites`). Per site: clip the frame
// rect by the half-plane against each candidate neighbour, candidates gathered from
// a bucket grid in expanding rings until no farther site could cut the polygon.
// A candidate whose half-plane survives in the boundary IS a Voronoi neighbour —
// adjacency and geometry from the same clip, globally consistent, no seams by
// construction. Exported so the viewer can re-tessellate the alive-set of ANY tick:
// the mesh is time-indexed, and history scrubbing shows the diagram as it was.
export function computeVoronoi(sites, live, frame) {
  const half = frame / 2;
  const n = live.length;
  const gridN = Math.max(8, Math.ceil(Math.sqrt(n)));
  const bw = frame / gridN;
  const buckets = Array.from({ length: gridN * gridN }, () => []);
  for (const s of live) {
    const bx = Math.max(0, Math.min(gridN - 1, Math.floor((s.x + half) / bw)));
    const by = Math.max(0, Math.min(gridN - 1, Math.floor((s.y + half) / bw)));
    buckets[by * gridN + bx].push(s.id);
  }
  const polys = {}, areas = {}, nbrs = sites.map(() => null);
  for (const s of live) {
    let poly = [[-half, -half], [half, -half], [half, half], [-half, half]];
    const contrib = new Set();
    const bx0 = Math.max(0, Math.min(gridN - 1, Math.floor((s.x + half) / bw)));
    const by0 = Math.max(0, Math.min(gridN - 1, Math.floor((s.y + half) / bw)));
    const tryClip = (o) => {
      const mx = (s.x + o.x) / 2, my = (s.y + o.y) / 2;
      const nx = o.x - s.x, ny = o.y - s.y;
      const inside = (p) => (p[0] - mx) * nx + (p[1] - my) * ny <= 1e-12;
      let cut = false;
      const out = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) {
          cut = true;
          const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
          const t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        } else if (!ia) cut = true;
      }
      if (cut && out.length >= 3) { poly = out; contrib.add(o.id); }
    };
    const cand = [];
    for (let ring = 0; ring < gridN; ring++) {
      cand.length = 0;
      if (ring === 0) { for (const id of buckets[by0 * gridN + bx0]) if (id !== s.id) cand.push(id); }
      else {
        for (let d = -ring; d <= ring; d++) {
          for (const [bx, by] of [[bx0 + d, by0 - ring], [bx0 + d, by0 + ring], [bx0 - ring, by0 + d], [bx0 + ring, by0 + d]]) {
            if (bx < 0 || by < 0 || bx >= gridN || by >= gridN) continue;
            for (const id of buckets[by * gridN + bx]) cand.push(id);
          }
        }
      }
      cand.sort((a, b) => {
        const da = (sites[a].x - s.x) ** 2 + (sites[a].y - s.y) ** 2;
        const db = (sites[b].x - s.x) ** 2 + (sites[b].y - s.y) ** 2;
        return da - db || a - b;
      });
      for (const id of cand) tryClip(sites[id]);
      let rMax = 0;
      for (const p of poly) rMax = Math.max(rMax, Math.hypot(p[0] - s.x, p[1] - s.y));
      if (ring * bw > 2 * rMax + bw) break;
    }
    let A = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      A += a[0] * b[1] - b[0] * a[1];
    }
    areas[s.id] = Math.abs(A) / 2;
    polys[s.id] = poly.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]);
    nbrs[s.id] = [...contrib].sort((a, b) => a - b);
  }
  for (const s of live) for (const j of nbrs[s.id]) {
    if (nbrs[j] && !nbrs[j].includes(s.id)) nbrs[j].push(s.id);
  }
  for (const s of live) if (nbrs[s.id]) nbrs[s.id].sort((a, b) => a - b);
  return { polys, areas, nbrs };
}

export function growCity(siteSeed, ctx = {}) {
  const seed = xmur3(String(siteSeed))();
  const FRAME = ctx.frame || 3.0, half = FRAME / 2;
  const coastal = !!ctx.coastal, coastDir = ctx.coastDir ?? 0;
  const hasRiver = ctx.river !== false, riverDir = ctx.riverDir ?? Math.PI * 0.3;
  const engine = ctx.engine || 'market';
  const pop = ctx.popSeries && ctx.popSeries.length ? ctx.popSeries : defaultEnvelope(240);
  const T = pop.length;
  const wallsAt = ctx.wallsAt ?? -1;
  const sackTicks = ctx.sackTicks || [];
  const eras = { wheelAt: 0, mechAt: Math.round(T * 0.8), ...(ctx.eras || {}) };
  const gates0 = ctx.gates || [0.3, Math.PI * 0.55, Math.PI * 1.05, Math.PI * 1.6];

  // -- sites: the one live point set ----------------------------------------------
  // site: {id, x, y, gen, elev, moist, water, river, builtAt, burnedAt, use, useAt,
  //        rent, bornAt, dead}
  const sites = [];
  const terrainAt = (x, y, gen) => {
    const base = ctx.sampler ? ctx.sampler(x, y) : { elev: 0.12 + 0.1 * fbm(x * 0.5 + 9, y * 0.5 + 9, seed ^ 0xa1), moist: 0.55 };
    // deeper generations sample deeper octaves — conditional refinement by position
    let e = Math.max(0.01, base.elev) * 0.6 + (fbm(x * 2.2 + 31, y * 2.2 + 31, seed ^ 0x3c, 4 + Math.min(3, gen)) - 0.5) * 0.16;
    if (coastal) {
      const proj = x * Math.cos(coastDir) + y * Math.sin(coastDir);
      const t = (proj - half * 0.35) / (half * 0.3);
      if (t > 0) e -= Math.min(1, t) * (0.30 + Math.max(0, base.elev) * 0.6);
    }
    return { elev: e, moist: Math.min(1, Math.max(0, base.moist ?? 0.5)) };
  };
  function mkSite(x, y, gen, bornAt) {
    x = Math.max(-half + 1e-4, Math.min(half - 1e-4, x));
    y = Math.max(-half + 1e-4, Math.min(half - 1e-4, y));
    const tr = terrainAt(x, y, gen);
    const s = { id: sites.length, x, y, gen, elev: tr.elev, moist: tr.moist,
                water: tr.elev <= 0 ? 1 : 0, river: 0, builtAt: -1, burnedAt: -1,
                use: USE.WILD, useAt: -1, rent: 0, bornAt, diedAt: -1, parent: -1,
                hist: [[bornAt, USE.WILD]], rentHist: [], dead: false };
    sites.push(s);
    return s;
  }
  // every use change is history — the viewer replays the field as it was
  const setUse = (s, u, t) => { if (s.use !== u) { s.use = u; s.useAt = t; s.hist.push([t, u]); } };
  for (let gy = 0; gy < BASE; gy++) for (let gx = 0; gx < BASE; gx++) {
    const cw = FRAME / BASE;
    const jx = (hash2(gx, gy, seed) - 0.5) * 0.8, jy = (hash2(gx, gy, seed ^ 0x77) - 0.5) * 0.8;
    mkSite((gx + 0.5 + jx) * cw - half, (gy + 0.5 + jy) * cw - half, 0, 0);
  }

  // -- the tessellation: one global Voronoi, recomputed WHOLE -----------------------
  let polys = {}, areas = {}, nbrs = [];
  function tessellate() {
    const v = computeVoronoi(sites, sites.filter(s => !s.dead), FRAME);
    polys = v.polys; areas = v.areas; nbrs = v.nbrs;
  }
  tessellate();
  const nb = (id) => nbrs[id] || [];

  // -- the river: carve on the initial mesh; river/water sites never divide --------
  if (hasRiver) {
    const enter = edgeSiteAt(riverDir + Math.PI), exit = edgeSiteAt(riverDir);
    let cur = enter, guard = 0;
    while (cur !== exit && guard++ < sites.length) {
      const s = sites[cur];
      s.river = 1; s.elev = Math.min(s.elev, 0.02 + guard * 0.0001);
      let best = -1, bv = Infinity;
      for (const j of nb(cur)) {
        const g = sites[j];
        if (g.river) continue;
        const towards = Math.hypot(g.x - sites[exit].x, g.y - sites[exit].y);
        const v = towards * 1.6 + Math.max(0, g.elev) * 3 + hash2(j, guard, seed ^ 0x5e) * 0.25;
        if (v < bv) { bv = v; best = j; }
      }
      if (best < 0) break;
      cur = best;
      if (sites[cur].water) break;
    }
  }
  function edgeSiteAt(bearing) {
    const tx = Math.cos(bearing), ty = Math.sin(bearing);
    let best = 0, bv = -Infinity;
    for (const s of sites) {
      if (s.dead) continue;
      const edge = Math.max(Math.abs(s.x), Math.abs(s.y)) > half - FRAME / BASE * 1.6;
      if (!edge) continue;
      const d = s.x * tx + s.y * ty;
      if (d > bv) { bv = d; best = s.id; }
    }
    return best;
  }

  // -- the nucleus -----------------------------------------------------------------
  const prominence = (id) => { let s = 0, n = 0; for (const j of nb(id)) { s += sites[j].elev; n++; } return n ? Math.max(0, sites[id].elev - s / n) : 0; };
  const central = (s) => 1 - Math.hypot(s.x, s.y) / half;
  const fertility = (s) => s.moist * Math.max(0, 1 - Math.max(0, s.elev) * 2);
  let nucleus = -1; { let nv = -Infinity;
    for (const s of sites) {
      if (s.dead || s.water || s.river) continue;
      let coastNb = 0, riverNb = 0;
      for (const j of nb(s.id)) { if (sites[j].water) coastNb = 1; if (sites[j].river) riverNb = 1; }
      let v = central(s) * 0.8 - Math.max(0, s.elev) * 1.5;
      if (engine === 'gateway') v += 3 * coastNb + 1.2 * riverNb;
      else if (engine === 'break-of-bulk') v += 3 * riverNb - prominence(s.id) * 4;
      else if (engine === 'fortress') v += prominence(s.id) * 22;
      else if (engine === 'staple') v += Math.max(0, s.elev) * 3 + fbm(s.x * 3, s.y * 3, seed ^ 0x11) * 2;
      else v += s.moist * 1.4 + 0.6 * riverNb;
      if (v > nv) { nv = v; nucleus = s.id; }
    }
  }

  // -- lanes -----------------------------------------------------------------------
  const laneSet = new Map();                   // "a:b" -> {at, tier}
  const laneLog = [];                          // retired segments: {a,b,at,tier,removedAt}
  const laneCell = new Set();
  const lkey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  function edgeCost(a, b, t) {
    const A = sites[a], Bs = sites[b];
    if (A.water || Bs.water) return Infinity;
    const len = Math.hypot(A.x - Bs.x, A.y - Bs.y);
    const slope = Math.abs(A.elev - Bs.elev) / Math.max(0.01, len);
    let c = len * (1 + 3.5 * slope);
    if (A.river !== Bs.river || (A.river && Bs.river)) c *= t >= eras.mechAt ? 1.6 : t >= eras.wheelAt ? 4 : 7;
    return c;
  }
  function route(src, dst, t) {
    const NL = sites.length;
    const dist = new Float64Array(NL).fill(Infinity), prev = new Int32Array(NL).fill(-1), done = new Uint8Array(NL);
    dist[src] = 0;
    for (; ;) {
      let u = -1, uv = Infinity;
      for (let i = 0; i < NL; i++) if (!done[i] && dist[i] < uv && !sites[i].dead) { uv = dist[i]; u = i; }
      if (u < 0 || u === dst) break;
      done[u] = 1;
      for (const v of nb(u)) {
        const c = edgeCost(u, v, t); if (!isFinite(c)) continue;
        const nd = dist[u] + (laneSet.has(lkey(u, v)) ? c * 0.35 : c);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    if (prev[dst] < 0 && src !== dst) return null;
    const path = []; let u = dst;
    while (u >= 0) { path.push(u); u = prev[u]; }
    return path.reverse();
  }
  function layLanes(path, t) {
    if (!path) return;
    for (let k = 1; k < path.length; k++) {
      const key = lkey(path[k - 1], path[k]);
      if (!laneSet.has(key)) laneSet.set(key, { at: t, tier: 1 });
      laneCell.add(path[k - 1]); laneCell.add(path[k]);
    }
  }
  let laneHop = new Int32Array(0);
  function perfuse() {
    laneHop = new Int32Array(sites.length).fill(-1);
    const q = [];
    for (const id of laneCell) if (!sites[id].dead) { laneHop[id] = 0; q.push(id); }
    for (let h = 0; h < q.length; h++) for (const v of nb(q[h])) if (laneHop[v] < 0 && !sites[v].water) { laneHop[v] = laneHop[q[h]] + 1; q.push(v); }
  }

  const events = [];
  const ev = (t, type, note) => events.push({ t, type, note });

  // -- regime 1: spokes ------------------------------------------------------------
  const gates = [];
  for (const b of gates0) { const g = edgeSiteAt(b); if (!sites[g].water) gates.push(g); }
  for (const g of gates) layLanes(route(g, nucleus, 0), 0);
  sites[nucleus].builtAt = 0; setUse(sites[nucleus], USE.COM, 0);
  laneCell.add(nucleus);
  perfuse();
  ev(0, 'founded', `the ${engine} nucleus is staked; ${gates.length} routes thread in from the world`);

  // -- the land market -------------------------------------------------------------
  let anchors = null, market = nucleus;
  let firstFarm = -1, displaced = 0, firstDisp = -1, mitoses = 0, sproutCount = 0;
  const meshTicks = [];                        // ticks the point set changed (mesh epochs)
  let spilled = false, wall = null, firstMitosis = -1;

  // -- AGENTS + ORGS: the people the envelope stands for ---------------------------
  // One agent ≈ AGENT_SCALE people. Agents hold a home tile (chosen by rent +
  // commute — the Alonso trade-off made discrete), may work for an org, arrive by
  // birth or through a GATE (immigration), and reconsider their homes as the
  // market moves (intracity movement, historied). Occupancy feeds BACK into the
  // land market: crowded tiles bid higher, empty quarters cool — so mitosis is
  // now driven partly by actual people, not rent formula alone.
  const agents = [];   // {id, bornT, origin, gate, home, homeHist, work, notable, name}
  const orgs = [];     // {id, kind, label, seat, foundedT, founder, vertical, shape, workers}
  const occNow = new Map();                    // tile id → resident agents now
  const pack = ctx.namePack || ['norse', 'hellenic', 'romance', 'slavic', 'brythonic', 'desertic', 'steppe', 'frankish'][seed % 8];
  let folk = null, folkIdx = 0;                // notable-name pool, minted lazily
  const nextName = () => {
    if (!folk) { try { folk = generateSet({ seed: String(siteSeed) + ':folk', culture: pack, setting: 'classical', kind: 'full', count: 96 }).names; } catch { folk = []; } }
    return folk.length ? folk[folkIdx++ % folk.length] : 'a notable citizen';
  };
  const capacityOf = (id, t) => Math.max(1, Math.floor((areas[id] || 0) * (t >= eras.mechAt ? URBAN_PER_KM2_MECH : URBAN_PER_KM2) / AGENT_SCALE));
  const occOf = (id) => occNow.get(id) || 0;
  const moveOcc = (from, to) => { if (from >= 0) occNow.set(from, Math.max(0, occOf(from) - 1)); if (to >= 0) occNow.set(to, occOf(to) + 1); };
  let firstImm = -1;

  function chooseHome(t, workSeat, currentHome) {
    let best = -1, bv = -Infinity;
    for (const s of sites) {
      if (s.dead || s.builtAt < 0 || s.builtAt > t || s.water || s.river) continue;
      const cap = capacityOf(s.id, t), o = occOf(s.id);
      if (o >= cap * 1.2 && s.id !== currentHome) continue;
      const dw = workSeat >= 0 ? Math.hypot(s.x - sites[workSeat].x, s.y - sites[workSeat].y) : 0;
      const dn = Math.hypot(s.x - sites[nucleus].x, s.y - sites[nucleus].y);
      let v = -s.rent - 2.0 * dw - 0.25 * dn - 0.4 * (o / cap)
            + (useAtTick(s) === USE.RES ? 0.3 : 0)
            + hash2(s.id, t * 7 + 1, seed ^ 0x99) * 0.2;
      if (s.id === currentHome) v += 0.5;      // moving costs something (stickiness)
      if (v > bv) { bv = v; best = s.id; }
    }
    return best;
  }
  const useAtTick = (s) => s.use;              // current use (the loop is at "now")

  function spawnAgent(t) {
    const id = agents.length;
    const origin = id < 4 ? 'founder' : hash2(id, t, seed ^ 0xa7) < 0.5 ? 'immigrant' : 'growth';
    const gate = origin === 'immigrant' && gates.length ? gates[(id * 7 + t) % gates.length] : -1;
    // work: the org with the fewest hands (if any exist yet)
    let work = -1;
    if (orgs.length) { let mn = Infinity; for (const o of orgs) if (o.workers < mn) { mn = o.workers; work = o.id; } }
    const home = chooseHome(t, work >= 0 ? orgs[work].seat : -1, -1);
    if (home < 0) return false;
    const notable = id % 16 === 0;
    const a = { id, bornT: t, origin, gate, home, homeHist: [[t, home]], work,
                notable, name: notable ? nextName() : null };
    agents.push(a); moveOcc(-1, home);
    if (work >= 0) orgs[work].workers++;
    if (origin === 'immigrant' && firstImm < 0) { firstImm = t; ev(t, 'immigrant', 'strangers come through the gates — the city begins to draw people from the world beyond'); }
    return true;
  }

  function agentStep(t) {
    const target = Math.min(AGENT_CAP, Math.round(pop[t] / AGENT_SCALE));
    let guard = 0;
    while (agents.length < target && guard++ < 40) { if (!spawnAgent(t)) break; }
    // intracity movement: on market ticks a slice of the city reconsiders its rent
    if (t % ECON_EVERY === 1 && t > 1) {
      for (const a of agents) {
        if (hash2(a.id, t, seed ^ 0xb3) >= 0.12) continue;
        const to = chooseHome(t, a.work >= 0 ? orgs[a.work].seat : -1, a.home);
        if (to >= 0 && to !== a.home) { moveOcc(a.home, to); a.home = to; a.homeHist.push([t, to]); }
      }
    }
  }

  const ORG_SPEC = {                            // kind → display + rite/org address shape
    court:   { label: 'the court',          vertical: 'feudal',   shape: 'tall' },
    guild:   { label: 'the traders guild',  vertical: 'corp',     shape: 'flat' },
    harbor:  { label: 'the harbor company', vertical: 'corp',     shape: 'pyramid' },
    mill:    { label: 'the mill',           vertical: 'corp',     shape: 'pyramid' },
    works:   { label: 'the ironworks',      vertical: 'corp',     shape: 'tall' },
  };
  function foundOrg(kind, seat, t) {
    if (seat < 0 || sites[seat].dead) return;
    const spec = ORG_SPEC[kind];
    const id = orgs.length;
    // the founder is a named notable, housed near the seat
    const home = chooseHome(t, seat, -1);
    const aid = agents.length;
    const founder = { id: aid, bornT: t, origin: 'immigrant', gate: gates[0] ?? -1, home: home >= 0 ? home : seat,
                      homeHist: [[t, home >= 0 ? home : seat]], work: id, notable: true, name: nextName() };
    agents.push(founder); moveOcc(-1, founder.home);
    orgs.push({ id, kind, label: spec.label, seat, foundedT: t, founder: aid,
                vertical: spec.vertical, shape: spec.shape, workers: 1 });
    // idle hands take the new work
    let hired = 0;
    for (const a of agents) { if (a.work < 0 && hired < 8) { a.work = id; hired++; } }
    orgs[id].workers += hired;
    ev(t, 'org', `${founder.name} founds ${spec.label} — ${hired + 1} hands take its work`);
  }

  function bids(s, t, dm) {
    const hop = laneHop[s.id] < 0 ? 9 : laneHop[s.id];
    const P = Math.min(2.2, pop[t] / 6000);
    const farm = (0.28 + 0.9 * fertility(s)) * (1 - 0.10 * dm);
    const res = P * (1.15 - 0.14 * hop) * (1 - 0.26 * dm);
    const com = P * 2.0 * Math.max(0, 1 - dm / 0.5) * (1 - 0.10 * hop);
    let ind = 0;
    if (anchors) {
      let da = Infinity;
      for (const a of anchors) if (a.kind === 'mill' || a.kind === 'port') da = Math.min(da, Math.hypot(s.x - sites[a.cell].x, s.y - sites[a.cell].y));
      ind = P * 1.35 * Math.max(0, 1 - da / 0.9) * (1 - 0.08 * hop);
    }
    return [0.22, farm, res, com, ind];
  }

  function marketPass(t) {
    const mx = sites[market].x, my = sites[market].y;
    // NEIGHBOUR COUPLING: agglomeration spillover. A tile's rent is lifted by what
    // its neighbours were worth last pass — externalities cross cell boundaries, so
    // division fronts propagate contagiously tile-to-tile (the fractal engine).
    const prevRent = sites.map(s => s.rent);
    let radSum = 0, radN = 0;
    for (const s of sites) {
      if (s.dead || s.water || s.river) { if (!s.dead) s.rent = 0; continue; }
      const dm = Math.hypot(s.x - mx, s.y - my);
      const bid = bids(s, t, dm);
      let spill = 0, spillN = 0;
      for (const j of nb(s.id)) { if (!sites[j].dead && !sites[j].water) { spill += prevRent[j]; spillN++; } }
      spill = spillN ? 0.22 * (spill / spillN) : 0;
      // OCCUPANCY FEEDBACK: crowding bids rent up (the people, not just the formula,
      // now drive land value — and therefore mitosis). A tile at capacity adds ~40%.
      const cap = capacityOf(s.id, t), crowd = cap ? Math.min(1.5, occOf(s.id) / cap) : 0;
      const occTerm = 0.4 * crowd;
      if (s.builtAt >= 0) {
        radSum += dm; radN++;
        let u = USE.RES, bv = bid[USE.RES];
        if (bid[USE.COM] > bv) { u = USE.COM; bv = bid[USE.COM]; }
        if (bid[USE.IND] > bv) { u = USE.IND; bv = bid[USE.IND]; }
        setUse(s, u, t);
        s.rent = bv + spill + occTerm;
      } else s.rent = Math.max(...bid) + spill * 0.5;
      s.rentHist.push([t, +s.rent.toFixed(3)]);
    }
    const urbanRad = radN ? radSum / radN : 0.1;
    // the foodweb under the development shadow (Sinclair)
    const shadow = urbanRad * 1.7 + 0.12;
    const farmable = [];
    for (const s of sites) {
      if (s.dead || s.water || s.river || s.builtAt >= 0) continue;
      const dm = Math.hypot(s.x - mx, s.y - my);
      const b = bids(s, t, dm);
      if (dm < shadow && (b[USE.RES] > b[USE.FARM] || b[USE.COM] > b[USE.FARM])) continue;
      farmable.push([b[USE.FARM], s]);
    }
    farmable.sort((p, q) => q[0] - p[0] || p[1].id - q[1].id);
    const wantFarm = new Set();
    let fedKm2 = 0;
    for (const [, s] of farmable) {
      if (fedKm2 * FEED_PER_KM2 >= pop[t]) break;
      wantFarm.add(s.id); fedKm2 += areas[s.id] || 0;
    }
    for (const s of sites) {
      if (s.dead) continue;
      if (wantFarm.has(s.id)) { if (s.use !== USE.FARM) { setUse(s, USE.FARM, t); if (firstFarm < 0) { firstFarm = t; ev(t, 'farms', 'fields rise around the town — the foodweb takes the best land the market has not yet claimed'); } } }
      else if (s.use === USE.FARM && s.builtAt < 0) setUse(s, USE.WILD, t);
    }
  }

  // -- MITOSIS: every tick, every cell may divide ----------------------------------
  // product = rent × area. Division replaces the site with 3–4 children placed
  // inside its cell; the WHOLE mesh then re-tessellates, so children are ordinary
  // sites in the one diagram and no seam exists. Self-limiting: children carry
  // ~⅓ the area, so product drops below threshold unless rent keeps rising.
  function mitosis(t) {
    const cand = sites.filter(s => !s.dead && !s.water && !s.river
      && (s.builtAt >= 0 || s.use === USE.FARM)
      && s.rent * (areas[s.id] || 0) >= SPLIT_PRODUCT)
      .sort((a, b) => b.rent * areas[b.id] - a.rent * areas[a.id] || a.id - b.id)
      .slice(0, SPLITS_PER_TICK);
    const liveCount = sites.filter(s => !s.dead).length;
    if (!cand.length || liveCount + cand.length * 4 > MAX_SITES) return false;
    for (const s of cand) {
      const k = 3 + (hash2(s.id, t, seed ^ 0x4d) < 0.5 ? 0 : 1);   // three or four
      const r = Math.sqrt((areas[s.id] || 0) / Math.PI) * 0.52;
      const rot = hash2(s.id, t, seed ^ 0x8a) * TAU;
      s.dead = true; s.diedAt = t;
      const kids = [];
      for (let c = 0; c < k; c++) {
        const ang = rot + c * TAU / k;
        const ch = mkSite(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r, s.gen + 1, t);
        ch.builtAt = s.builtAt; ch.burnedAt = s.burnedAt; ch.use = s.use; ch.useAt = s.useAt; ch.rent = s.rent;
        ch.parent = s.id; ch.hist = [[t, s.use]]; ch.rentHist = [[t, +s.rent.toFixed(3)]];
        ch.water = 0; ch.river = 0;
        if (ch.elev <= 0) ch.elev = 0.02;      // division cannot mint sea inside the town
        kids.push(ch);
      }
      // lanes re-anchor to the child nearest the far end
      const moves = [];
      for (const [key, val] of laneSet) {
        const [a, b] = key.split(':').map(Number);
        if (a !== s.id && b !== s.id) continue;
        const far = a === s.id ? b : a;
        let best = kids[0], bv = Infinity;
        for (const ch of kids) { const d = Math.hypot(ch.x - sites[far].x, ch.y - sites[far].y); if (d < bv) { bv = d; best = ch; } }
        moves.push([key, lkey(best.id, far), val]);
      }
      for (const [oldK, newK, val] of moves) {
        // the old segment retires into the log so history renders it until t
        // (zero-lifetime segments — born and retired the same tick — are noise)
        const [oa, ob] = oldK.split(':').map(Number);
        if (val.at < t) laneLog.push({ a: oa, b: ob, at: val.at, tier: val.tier, removedAt: t });
        laneSet.delete(oldK);
        if (!laneSet.has(newK)) laneSet.set(newK, { at: t, tier: val.tier });
      }
      if (laneCell.has(s.id)) { laneCell.delete(s.id); for (const ch of kids) laneCell.add(ch.id); }
      if (nucleus === s.id) nucleus = kids[0].id;
      if (market === s.id) market = kids[0].id;
      if (anchors) for (const a of anchors) if (a.cell === s.id) a.cell = kids[0].id;
      if (wall) wall.ring = wall.ring.map(id => id === s.id ? kids[0].id : id);
      // residents of a divided tile land in its children (round-robin, historied)
      if (occOf(s.id) > 0) {
        let k2 = 0;
        for (const a of agents) {
          if (a.home !== s.id) continue;
          const ch = kids[k2++ % kids.length];
          moveOcc(a.home, ch.id); a.home = ch.id; a.homeHist.push([t, ch.id]);
        }
        occNow.delete(s.id);
      }
      for (const o of orgs) if (o.seat === s.id) o.seat = kids[0].id;
      mitoses++;
    }
    if (firstMitosis < 0) { firstMitosis = t; ev(t, 'mitosis', 'the first cell divides — where the product runs high the map itself grows finer'); }
    meshTicks.push(t);                          // a new mesh epoch for the history scrub
    tessellate();                               // THE WHOLE MESH, every division tick
    perfuse();
    return true;
  }

  // -- regime 3 --------------------------------------------------------------------
  function placeAnchors(t) {
    const out = [{ kind: 'market', cell: nucleus }];
    let seat = -1, sv = -Infinity;
    for (const s of sites) if (!s.dead && s.builtAt >= 0) { const v = prominence(s.id) * 10 + central(s); if (v > sv) { sv = v; seat = s.id; } }
    if (seat >= 0) out.push({ kind: 'seat', cell: seat });
    if (coastal) { let port = -1, pv = -Infinity;
      for (const s of sites) { if (s.dead || s.water) continue; let cn = 0; for (const j of nb(s.id)) if (sites[j].water) cn = 1; if (!cn) continue; const v = central(s) + (s.builtAt >= 0 ? 1 : 0); if (v > pv) { pv = v; port = s.id; } }
      if (port >= 0) out.push({ kind: 'port', cell: port }); }
    if (hasRiver) { let mill = -1, mv = -Infinity;
      for (const s of sites) { if (s.dead || !s.river) continue; let sl = 0; for (const j of nb(s.id)) sl += Math.abs(s.elev - sites[j].elev); const v = sl * (0.35 + central(s)); if (v > mv) { mv = v; mill = s.id; } }
      if (mill >= 0) { let bank = -1, bv = Infinity; for (const j of nb(mill)) { const g = sites[j]; if (!g.water && !g.river) { const d = Math.hypot(g.x, g.y); if (d < bv) { bv = d; bank = j; } } } if (bank >= 0) out.push({ kind: 'mill', cell: bank }); } }
    return out;
  }
  function fluxPass(anch, t) {
    const flux = new Map();
    const nodes = [...anch.map(a => a.cell), ...gates];
    for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
      const path = route(nodes[a], nodes[b], t);
      if (!path) continue;
      layLanes(path, t);
      for (let k = 1; k < path.length; k++) { const key = lkey(path[k - 1], path[k]); flux.set(key, (flux.get(key) || 0) + 1); }
    }
    const vals = [...flux.values()].sort((x, y) => x - y);
    const q = (f) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * f))] : Infinity;
    const hi = q(0.75), mid = q(0.4);
    for (const [key, f] of flux) { const l = laneSet.get(key); if (l) l.tier = f >= hi ? 3 : f >= mid ? 2 : Math.max(1, l.tier); }
    perfuse();
  }

  // -- the growth loop: all compute on the CURRENT mesh ----------------------------
  const sackSet = new Set(sackTicks.map(t => Math.max(1, Math.min(T - 1, t))));
  let capacity = 0;
  const capOf = (s, t) => (t >= eras.mechAt ? URBAN_PER_KM2_MECH : URBAN_PER_KM2) * (areas[s.id] || 0);
  capacity = capOf(sites[nucleus], 0);

  for (let t = 1; t < T; t++) {
    if (t % ECON_EVERY === 1 || t === 1) marketPass(t);
    mitosis(t);                                 // every tick, every cell

    if (wallsAt >= 0 && !wall && t >= wallsAt) {
      const ring = [];
      for (const s of sites) {
        if (s.dead || s.builtAt < 0) continue;
        for (const j of nb(s.id)) if (sites[j].builtAt < 0 && !sites[j].water) { ring.push(s.id); break; }
      }
      if (ring.length > 8) { wall = { at: t, ring, popAt: pop[t] }; ev(t, 'walls', `stone rings the town — ${ring.length} wall cells enclose ${Math.round(pop[t]).toLocaleString()} people`); }
    }
    if (sackSet.has(t)) {
      const bearing = hash2(t, 3, seed ^ 0x2f) * TAU;
      let burned = 0;
      const nx = sites[nucleus].x, ny = sites[nucleus].y;
      for (const s of sites) {
        if (s.dead || s.builtAt < 0 || s.id === nucleus) continue;
        const ang = Math.atan2(s.y - ny, s.x - nx);
        let d = ang - bearing; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        if (Math.abs(d) < 0.55) { s.burnedAt = t; burned++; }
      }
      ev(t, 'sack', `the city is sacked — a quarter burns (${burned} cells); the survivors rebuild on the ashes`);
    }
    // the founding institution: as soon as the nucleus is built, the engine's own
    // org stands up (a court/guild/harbor/mill), housing its founder and first hands
    if (orgs.length === 0 && sites[nucleus].builtAt >= 0) {
      const k = engine === 'gateway' ? 'harbor' : engine === 'fortress' ? 'court' : engine === 'staple' ? 'works' : engine === 'break-of-bulk' ? 'guild' : 'guild';
      foundOrg(k, nucleus, t);
    }
    if (!anchors && (pop[t] >= DIVERSIFY_POP || t >= eras.mechAt)) {
      anchors = placeAnchors(t);
      market = anchors[0].cell;
      fluxPass(anchors, t);
      // each new quarter gets its institution — the district-scale orgs
      for (const a of anchors) {
        if (a.kind === 'market' || orgs.some(o => o.seat === a.cell)) continue;
        foundOrg(a.kind === 'seat' ? 'court' : a.kind === 'port' ? 'harbor' : a.kind === 'mill' ? 'mill' : 'guild', a.cell, t);
      }
      ev(t, 'diversify', `the base diversifies — ${anchors.map(a => a.kind).join(', ')} anchor distinct quarters; industry begins to bid for land`);
    }
    if (anchors && t === eras.mechAt) {
      fluxPass(anchors, t);
      // the machine age raises the ironworks near the mill if a river is here
      const millA = anchors.find(a => a.kind === 'mill');
      if (millA && !orgs.some(o => o.kind === 'works')) foundOrg('works', millA.cell, t);
      ev(t, 'mech', 'the machine age: bridges cheapen, blocks spread out, the flux re-solves');
    }

    // urban expansion toward the envelope (area-based capacity on the live mesh)
    let guard = 0;
    while (capacity < pop[t] && guard++ < 500) {
      let best = null, bv = -Infinity;
      for (const s of sites) {
        if (s.dead || s.builtAt >= 0 || s.water || s.river) continue;
        let adjBuilt = 0; for (const j of nb(s.id)) if (sites[j].builtAt >= 0) adjBuilt++;
        if (!adjBuilt) continue;
        const hop = laneHop[s.id] < 0 ? 9 : laneHop[s.id];
        let v = adjBuilt * 0.3 + s.rent * 0.9 - hop * 0.7 - Math.max(0, s.elev) * 2.5
              + central(s) * 0.4 + hash2(s.id, t, seed ^ 0x66) * 0.25;
        if (wall && pop[t] < wall.popAt * 1.4 && wallOutside(s)) v -= 2.2;
        if (v > bv) { bv = v; best = s; }
      }
      if (!best) break;
      if (wall && wallOutside(best) && !spilled && pop[t] >= wall.popAt * 1.4) { spilled = true; ev(t, 'spill', 'the town spills its walls — extramural quarters take root past the fringe belt'); }
      if (best.use === USE.FARM) {
        displaced++;
        if (firstDisp < 0) { firstDisp = t; ev(t, 'displace', 'the land grows too dear to farm — the first fields are built over, and the foodweb shifts outward'); }
      }
      best.builtAt = t; setUse(best, USE.RES, t);
      capacity += capOf(best, t);
      // hypoxia by METRIC distance — hop counts mean nothing across mixed grain
      let src = -1, sv = Infinity;
      for (const id of laneCell) { const g = sites[id]; if (g.dead) continue; const d = Math.hypot(g.x - best.x, g.y - best.y); if (d < sv) { sv = d; src = id; } }
      if (src >= 0 && sv > 0.12) { layLanes(route(src, best.id, t), t); sproutCount++; perfuse(); }
    }
    agentStep(t);                               // people arrive, settle, and move
    if (t % 24 === 0) perfuse();
  }
  function wallOutside(s) {
    if (!wall) return false;
    const nx = sites[nucleus].x, ny = sites[nucleus].y;
    const d = Math.hypot(s.x - nx, s.y - ny);
    let rs = 0, n = 0; for (const r of wall.ring) { const g = sites[r]; if (!g.dead) { rs += Math.hypot(g.x - nx, g.y - ny); n++; } }
    return n ? d > (rs / n) * 1.02 : false;
  }

  // -- output ----------------------------------------------------------------------
  const lanes = [];
  for (const [key, v] of laneSet) { const [a, b] = key.split(':').map(Number); if (!sites[a].dead && !sites[b].dead) lanes.push({ a, b, at: v.at, tier: v.tier, removedAt: -1 }); }
  for (const l of laneLog) lanes.push(l);      // retired segments render for their lifetime
  lanes.sort((x, y) => x.at - y.at || x.a - y.a || x.b - y.b);
  let builtCount = 0, farmCount = 0, liveCount = 0;
  for (const s of sites) if (!s.dead) { liveCount++; if (s.builtAt >= 0) builtCount++; if (s.use === USE.FARM) farmCount++; }
  const notables = agents.filter(a => a.notable).length;
  const immigrants = agents.filter(a => a.origin === 'immigrant').length;
  ev(T - 1, 'now', `${Math.round(pop[T - 1]).toLocaleString()} people · ${agents.length} agents (${notables} notable, ${immigrants} come from away) · ${orgs.length} institutions · ${builtCount} urban cells`);
  // orgs carry a rite/org address (world:seat:cell — the suite-wide siteSeed shape)
  const worldStr = String(siteSeed).split(':')[0] || '7';
  const orgsOut = orgs.map(o => ({
    id: o.id, kind: o.kind, label: o.label, seat: o.seat, foundedT: o.foundedT,
    founder: o.founder, founderName: agents[o.founder] ? agents[o.founder].name : null,
    workers: o.workers, vertical: o.vertical, shape: o.shape,
    orgSeed: `${worldStr}:${meta_place(siteSeed)}:${o.seat}:${o.kind}${o.id}`, namePack: pack,
  }));
  function meta_place(ss) { const parts = String(ss).split(':'); return parts[1] || 'polis'; }
  return {
    meta: { siteSeed, seed, BASE, frame: FRAME, ticks: T, engine, coastal, hasRiver, wallsAt, eras,
            builtCount, farmCount, displaced, mitoses, sprouts: sproutCount, lanes: lanes.length,
            sites: liveCount, meshTicks, agents: agents.length, notables, immigrants, orgs: orgs.length, namePack: pack },
    sites, polys, areas, nucleus, gates, wall, anchors, lanes, events, pop,
    agents, orgs: orgsOut,
  };
}

export function defaultEnvelope(T, peak = 14000) {
  const out = [];
  for (let k = 0; k < T; k++) out.push(Math.max(6, Math.round(peak * Math.exp(-4.2 * Math.exp(-5.5 * k / T)))));
  return out;
}

export function fieldDigest(f) {
  let h = 2166136261 >>> 0;
  const mix = (n) => { h ^= n >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(f.meta.builtCount); mix(f.meta.lanes); mix(f.nucleus); mix(f.meta.mitoses); mix(f.meta.displaced);
  mix(f.meta.agents); mix(f.meta.orgs); mix(f.meta.immigrants);
  for (const s of f.sites) { if (s.dead) continue; mix(Math.round((s.x + 10) * 1e4)); mix(Math.round((s.y + 10) * 1e4)); mix(s.use); if (s.builtAt >= 0) mix(s.builtAt); }
  for (const l of f.lanes) { mix(l.a); mix(l.b); mix(l.at); mix(l.tier); }
  for (const a of f.agents) { mix(a.home < 0 ? 0 : a.home); mix(a.bornT); mix(a.work < 0 ? 999 : a.work); }
  return ('0000000' + h.toString(16)).slice(-8);
}
