// field.js — THE SETTLEMENT FIELD v2: the city proper's first layer. One founded
// site (a hinterland town / civ city) → the micro-terrain it sits on, the street
// fabric its economy writes onto the ground, and the LAND MARKET that sorts every
// cell's use — tick by tick, on an ADAPTIVE Voronoi mesh.
//
// v2 adds the two moves the first slice lacked:
//
//   TRUE VORONOI, RECURSIVE — cells are real Voronoi polygons (half-plane clipped
//   against their neighbours) on a quadtree of jittered sites. A cell whose PRODUCT
//   (the winning land-rent bid) crosses a threshold SUBDIVIDES into four jittered
//   children — resolution scales with local product, so the core refines into fine
//   grain while the periphery stays coarse. Splitting conserves capacity (4 children
//   carry ¼ each) and re-samples micro-relief at higher frequency: conditional
//   refinement, the same downscaling discipline one rung further down.
//
//   BID-RENT LAND USE — the theory linking real estate to production (Ricardo's
//   rent; von Thünen 1826; Alonso 1964): every land cell takes the use that bids
//   the most for its access. Commerce bids steepest on centrality, residence on
//   lane access, industry on the mill/port, and AGRICULTURE bids on fertility with
//   only weak distance decay — so FARMS RISE first (the foodweb feeding the town,
//   sized by actual demand pop/FARM_FEED) and are DISPLACED outward as urban bids
//   overtake them (Sinclair's fringe: the city's shadow converts the near farms
//   first). Displacement is an event; the rings are measurable.
//
// The three field regimes of v1 remain the transport story on top: nucleus spokes
// (Physarum star) → coverage capillaries (hypoxia) → arterial flux hierarchy.
// Everything is still a CLIENT of the levels above (envelope, era ticks, walls,
// sacks arrive as boundary conditions), and everything is deterministic:
// (siteSeed, ctx) → identical field on any machine.

import { mulberry32, hash2 } from './prng.js';

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
function fbm(x, y, s, oct = 4) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, s + o * 197); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

// ---- tuning ---------------------------------------------------------------------
const B = 40;               // base lattice B×B over the frame (level-0 cells ~75 m)
const MAXL = 2;             // two quarterings → finest cells ~19 m (the fine grain)
const PER0 = 320;           // people a level-0 URBAN cell holds (children carry ¼)
const PER0_MECH = 220;      // the machine age spreads out
const FARM_FEED = 260;      // people one level-0 farm cell feeds (the foodweb ratio)
const REACH = 1;            // coverage: max lane hop-distance urban tissue tolerates
const DIVERSIFY_POP = 3800; // regime 3 + industry bids open
const ECON_EVERY = 12;      // ticks between land-market passes
const SPLIT_RENT = 1.35;    // product threshold that triggers subdivision
const SPLITS_PER_PASS = 36; // bounded refinement per market pass (highest product first)

export const USE = { WILD: 0, FARM: 1, RES: 2, COM: 3, IND: 4 };
export const USE_NAME = ['wild', 'farm', 'residential', 'commercial', 'industrial'];

// ---- the field ------------------------------------------------------------------
// ctx as v1: { sampler, coastal, coastDir, river, riverDir, engine, popSeries,
//              wallsAt, sackTicks, eras:{wheelAt,mechAt}, gates }
export function growCity(siteSeed, ctx = {}) {
  const seed = xmur3(String(siteSeed))();
  const FRAME = ctx.frame || 3.0, half = FRAME / 2;
  const F = B << MAXL;                        // fine-bucket lattice (160×160)
  const coastal = !!ctx.coastal, coastDir = ctx.coastDir ?? 0;
  const hasRiver = ctx.river !== false, riverDir = ctx.riverDir ?? Math.PI * 0.3;
  const engine = ctx.engine || 'market';
  const pop = ctx.popSeries && ctx.popSeries.length ? ctx.popSeries : defaultEnvelope(240);
  const T = pop.length;
  const wallsAt = ctx.wallsAt ?? -1;
  const sackTicks = ctx.sackTicks || [];
  const eras = { wheelAt: 0, mechAt: Math.round(T * 0.8), ...(ctx.eras || {}) };
  const gates0 = ctx.gates || [0.3, Math.PI * 0.55, Math.PI * 1.05, Math.PI * 1.6];

  // -- leaves: the quadtree of jittered Voronoi sites ------------------------------
  // leaf: {id, level, qx, qy, x, y, elev, moist, water, river, builtAt, burnedAt,
  //        use, useAt, rent, splitAt}
  const leaves = [];
  const posOf = (level, qx, qy) => {
    const n = B << level, cw = FRAME / n;
    const jx = (hash2(qx, qy, seed ^ (level * 0x101)) - 0.5) * 0.8;
    const jy = (hash2(qx, qy, seed ^ (level * 0x101) ^ 0x77) - 0.5) * 0.8;
    return [(qx + 0.5 + jx) * cw - half, (qy + 0.5 + jy) * cw - half];
  };
  const terrainAt = (x, y, level) => {
    const base = ctx.sampler ? ctx.sampler(x, y) : { elev: 0.12 + 0.1 * fbm(x * 0.5 + 9, y * 0.5 + 9, seed ^ 0xa1), moist: 0.55 };
    // conditional refinement: children re-sample micro-relief at higher frequency
    let e = Math.max(0.01, base.elev) * 0.6
          + (fbm(x * 2.2 + 31, y * 2.2 + 31, seed ^ 0x3c) - 0.5) * 0.16
          + (level > 0 ? (fbm(x * (5 + 3 * level) + 57, y * (5 + 3 * level) + 57, seed ^ 0x9d) - 0.5) * 0.05 / level : 0);
    if (coastal) {
      const proj = x * Math.cos(coastDir) + y * Math.sin(coastDir);
      const t = (proj - half * 0.35) / (half * 0.3);
      if (t > 0) e -= Math.min(1, t) * (0.30 + Math.max(0, base.elev) * 0.6);
    }
    return { elev: e, moist: Math.min(1, Math.max(0, base.moist ?? 0.5)) };
  };
  function mkLeaf(level, qx, qy) {
    const [x, y] = posOf(level, qx, qy);
    const tr = terrainAt(x, y, level);
    const lf = { id: leaves.length, level, qx, qy, x, y, elev: tr.elev, moist: tr.moist,
                 water: tr.elev <= 0 ? 1 : 0, river: 0, builtAt: -1, burnedAt: -1,
                 use: USE.WILD, useAt: -1, rent: 0, splitAt: -1 };
    leaves.push(lf);
    return lf;
  }
  for (let qy = 0; qy < B; qy++) for (let qx = 0; qx < B; qx++) mkLeaf(0, qx, qy);

  // fine-bucket ownership → neighbour lists (rebuilt after splits)
  const owner = new Int32Array(F * F);
  let nbrs = [];
  function rebuildTopo() {
    for (const lf of leaves) {
      if (lf.dead) continue;
      const s = 1 << (MAXL - lf.level), fx = lf.qx * s, fy = lf.qy * s;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) owner[(fy + dy) * F + fx + dx] = lf.id;
    }
    nbrs = leaves.map(() => null);
    for (const lf of leaves) {
      if (lf.dead) continue;
      const set = new Set();
      const s = 1 << (MAXL - lf.level), fx = lf.qx * s, fy = lf.qy * s;
      for (let k = -1; k <= s; k++) {
        for (const [bx, by] of [[fx + k, fy - 1], [fx + k, fy + s], [fx - 1, fy + k], [fx + s, fy + k]]) {
          if (bx < 0 || by < 0 || bx >= F || by >= F) continue;
          const o = owner[by * F + bx];
          if (o !== lf.id && !leaves[o].dead) set.add(o);
        }
      }
      nbrs[lf.id] = [...set].sort((a, b) => a - b);
    }
  }
  rebuildTopo();
  const nb = (id) => nbrs[id] || [];

  // -- the river: carve on level-0 leaves; rivers/water never subdivide ------------
  if (hasRiver) {
    const enter = edgeLeafAt(riverDir + Math.PI), exit = edgeLeafAt(riverDir);
    let cur = enter, guard = 0;
    while (cur !== exit && guard++ < leaves.length) {
      const lf = leaves[cur];
      lf.river = 1; lf.elev = Math.min(lf.elev, 0.02 + guard * 0.0001);
      let best = -1, bv = Infinity;
      for (const j of nb(cur)) {
        const g = leaves[j];
        if (g.river) continue;
        const towards = Math.hypot(g.x - leaves[exit].x, g.y - leaves[exit].y);
        const v = towards * 1.6 + Math.max(0, g.elev) * 3 + hash2(j, guard, seed ^ 0x5e) * 0.25;
        if (v < bv) { bv = v; best = j; }
      }
      if (best < 0) break;
      cur = best;
      if (leaves[cur].water) break;
    }
  }
  function edgeLeafAt(bearing) {
    const tx = Math.cos(bearing), ty = Math.sin(bearing);
    let best = 0, bv = -Infinity;
    for (const lf of leaves) {
      if (lf.dead || lf.level !== 0) continue;
      if (lf.qx > 1 && lf.qy > 1 && lf.qx < B - 2 && lf.qy < B - 2) continue;
      const d = lf.x * tx + lf.y * ty;
      if (d > bv) { bv = d; best = lf.id; }
    }
    return best;
  }

  // -- the nucleus -----------------------------------------------------------------
  const prominence = (id) => { let s = 0, n = 0; for (const j of nb(id)) { s += leaves[j].elev; n++; } return n ? Math.max(0, leaves[id].elev - s / n) : 0; };
  const central = (lf) => 1 - Math.hypot(lf.x, lf.y) / half;
  const fertility = (lf) => lf.moist * Math.max(0, 1 - Math.max(0, lf.elev) * 2);
  let nucleus = -1; { let nv = -Infinity;
    for (const lf of leaves) {
      if (lf.water || lf.river) continue;
      let coastNb = 0, riverNb = 0;
      for (const j of nb(lf.id)) { if (leaves[j].water) coastNb = 1; if (leaves[j].river) riverNb = 1; }
      let v = central(lf) * 0.8 - Math.max(0, lf.elev) * 1.5;
      if (engine === 'gateway') v += 3 * coastNb + 1.2 * riverNb;
      else if (engine === 'break-of-bulk') v += 3 * riverNb - prominence(lf.id) * 4;
      else if (engine === 'fortress') v += prominence(lf.id) * 22;
      else if (engine === 'staple') v += Math.max(0, lf.elev) * 3 + fbm(lf.x * 3, lf.y * 3, seed ^ 0x11) * 2;
      else v += lf.moist * 1.4 + 0.6 * riverNb;
      if (v > nv) { nv = v; nucleus = lf.id; }
    }
  }

  // -- lanes on the leaf graph -----------------------------------------------------
  const laneSet = new Map();                   // "a:b" (a<b) -> {at, tier}
  const laneCell = new Set();
  const lkey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  function edgeCost(a, b, t) {
    const A = leaves[a], Bf = leaves[b];
    if (A.water || Bf.water) return Infinity;
    const len = Math.hypot(A.x - Bf.x, A.y - Bf.y);
    const slope = Math.abs(A.elev - Bf.elev) / Math.max(0.01, len);
    let c = len * (1 + 3.5 * slope);
    if (A.river !== Bf.river || (A.river && Bf.river)) c *= t >= eras.mechAt ? 1.6 : t >= eras.wheelAt ? 4 : 7;
    return c;
  }
  function route(src, dst, t) {
    const NL = leaves.length;
    const dist = new Float64Array(NL).fill(Infinity), prev = new Int32Array(NL).fill(-1), done = new Uint8Array(NL);
    dist[src] = 0;
    for (; ;) {
      let u = -1, uv = Infinity;
      for (let i = 0; i < NL; i++) if (!done[i] && dist[i] < uv && !leaves[i].dead) { uv = dist[i]; u = i; }
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
    laneHop = new Int32Array(leaves.length).fill(-1);
    const q = [];
    for (const id of laneCell) if (!leaves[id].dead) { laneHop[id] = 0; q.push(id); }
    for (let h = 0; h < q.length; h++) for (const v of nb(q[h])) if (laneHop[v] < 0 && !leaves[v].water) { laneHop[v] = laneHop[q[h]] + 1; q.push(v); }
  }

  const events = [];
  const ev = (t, type, note) => events.push({ t, type, note });

  // -- regime 1: spokes ------------------------------------------------------------
  const gates = [];
  for (const b of gates0) { const g = edgeLeafAt(b); if (!leaves[g].water) gates.push(g); }
  for (const g of gates) layLanes(route(g, nucleus, 0), 0);
  leaves[nucleus].builtAt = 0; leaves[nucleus].use = USE.COM; leaves[nucleus].useAt = 0;
  laneCell.add(nucleus);
  perfuse();
  ev(0, 'founded', `the ${engine} nucleus is staked; ${gates.length} routes thread in from the world`);

  // -- the land market: bid-rent over every land leaf ------------------------------
  // The theory made mechanism (Ricardo → von Thünen → Alonso): each use bids what
  // the location is worth to it; the cell goes to the highest bid; rent IS product.
  const capOf = (lf, t) => (t >= eras.mechAt ? PER0_MECH : PER0) / Math.pow(4, lf.level);
  let anchors = null, market = nucleus;
  let firstFarm = -1, displaced = 0, firstDisp = -1, splitCount = 0, sproutCount = 0;
  let spilled = false, wall = null;

  function bids(lf, t, dm) {
    // dm: km to the market anchor; hop: lane access; P: demand pressure from pop
    const hop = laneHop[lf.id] < 0 ? 9 : laneHop[lf.id];
    const P = Math.min(2.2, pop[t] / 6000);
    const farm = (0.28 + 0.9 * fertility(lf)) * (1 - 0.10 * dm);            // fertility, weak decay
    const res = P * (1.15 - 0.14 * hop) * (1 - 0.26 * dm);                  // access to town
    const com = P * 2.0 * Math.max(0, 1 - dm / 0.5) * (1 - 0.10 * hop);     // steep centrality
    let ind = 0;
    if (anchors) {
      let da = Infinity;
      for (const a of anchors) if (a.kind === 'mill' || a.kind === 'port') da = Math.min(da, Math.hypot(lf.x - leaves[a.cell].x, lf.y - leaves[a.cell].y));
      ind = P * 1.35 * Math.max(0, 1 - da / 0.9) * (1 - 0.08 * hop);
    }
    return [0.22, farm, res, com, ind];                                     // [wild floor, ...]
  }

  function marketPass(t) {
    const mx = leaves[market].x, my = leaves[market].y;
    // 1 — urban leaves re-sort by bid (commerce claims the core, industry its
    //     anchors); track the urban radius for the development shadow below
    let radSum = 0, radN = 0;
    for (const lf of leaves) {
      if (lf.dead || lf.water || lf.river) { if (!lf.dead) lf.rent = 0; continue; }
      const dm = Math.hypot(lf.x - mx, lf.y - my);
      const bid = bids(lf, t, dm);
      if (lf.builtAt >= 0) {
        radSum += dm; radN++;
        let u = USE.RES, bv = bid[USE.RES];
        if (bid[USE.COM] > bv) { u = USE.COM; bv = bid[USE.COM]; }
        if (bid[USE.IND] > bv) { u = USE.IND; bv = bid[USE.IND]; }
        if (lf.use !== u) { lf.use = u; lf.useAt = t; }
        lf.rent = bv;
      } else lf.rent = Math.max(...bid);
    }
    const urbanRad = radN ? radSum / radN : 0.1;
    // 2 — the foodweb: assign farms to meet demand, best farm-bid first, from the
    //     unbuilt land. Inside the DEVELOPMENT SHADOW (Sinclair 1967: the city's
    //     anticipated expansion), any cell an urban use outbids is withheld from
    //     farming — land-banked, waiting — so the near fringe empties before the
    //     city even arrives and the foodweb lives beyond the shadow.
    const shadow = urbanRad * 1.7 + 0.12;
    const farmable = [];
    for (const lf of leaves) {
      if (lf.dead || lf.water || lf.river || lf.builtAt >= 0) continue;
      const dm = Math.hypot(lf.x - mx, lf.y - my);
      const b = bids(lf, t, dm);
      if (dm < shadow && (b[USE.RES] > b[USE.FARM] || b[USE.COM] > b[USE.FARM])) continue;
      farmable.push([b[USE.FARM], lf]);
    }
    farmable.sort((p, q) => q[0] - p[0] || p[1].id - q[1].id);
    // area-correct accounting: a level-k farm cell feeds FARM_FEED/4^k people
    const wantFarm = new Set();
    let fedUnits = 0;                                    // in level-0 cell equivalents
    for (const [, lf] of farmable) {
      if (fedUnits * FARM_FEED >= pop[t]) break;
      wantFarm.add(lf.id); fedUnits += 1 / Math.pow(4, lf.level);
    }
    for (const lf of leaves) {
      if (lf.dead) continue;
      if (wantFarm.has(lf.id)) { if (lf.use !== USE.FARM) { lf.use = USE.FARM; lf.useAt = t; if (firstFarm < 0) { firstFarm = t; ev(t, 'farms', 'fields rise around the town — the foodweb takes the best land the market has not yet claimed'); } } }
      else if (lf.use === USE.FARM && lf.builtAt < 0) { lf.use = USE.WILD; lf.useAt = t; }
    }
    // 3 — SUBDIVISION: resolution scales with local product (rent). The map refines
    //     where the economy concentrates; water/rivers/wild never split.
    const cand = leaves.filter(lf => !lf.dead && !lf.water && !lf.river && lf.level < MAXL
      && lf.rent >= SPLIT_RENT && (lf.builtAt >= 0 || lf.use === USE.FARM))
      .sort((a, b2) => b2.rent - a.rent || a.id - b2.id)
      .slice(0, SPLITS_PER_PASS);
    if (cand.length) {
      for (const lf of cand) splitLeaf(lf, t);
      rebuildTopo(); perfuse();
      if (splitCount === cand.length) ev(t, 'subdivide', 'the core refines — the map grows finer where the product concentrates');
    }
  }

  function splitLeaf(lf, t) {
    lf.dead = true; lf.splitAt = t;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const ch = mkLeaf(lf.level + 1, lf.qx * 2 + dx, lf.qy * 2 + dy);
      ch.builtAt = lf.builtAt; ch.burnedAt = lf.burnedAt; ch.use = lf.use; ch.useAt = lf.useAt; ch.rent = lf.rent;
      ch.water = 0; ch.river = 0;               // splits never happen on water/river
      if (ch.elev <= 0) ch.elev = 0.02;         // refinement cannot mint sea inside the town
    }
    // lanes re-anchor: edges touching the parent migrate to the child nearest the far end
    const kids = leaves.slice(-4);
    const moves = [];
    for (const [key, val] of laneSet) {
      const [a, b] = key.split(':').map(Number);
      if (a !== lf.id && b !== lf.id) continue;
      const far = a === lf.id ? b : a;
      let best = kids[0], bv = Infinity;
      for (const k of kids) { const d = Math.hypot(k.x - leaves[far].x, k.y - leaves[far].y); if (d < bv) { bv = d; best = k; } }
      moves.push([key, lkey(best.id, far), val]);
    }
    for (const [oldK, newK, val] of moves) { laneSet.delete(oldK); if (!laneSet.has(newK)) laneSet.set(newK, val); }
    if (laneCell.has(lf.id)) { laneCell.delete(lf.id); for (const k of kids) laneCell.add(k.id); }
    if (nucleus === lf.id) nucleus = kids[0].id;
    if (market === lf.id) market = kids[0].id;
    if (anchors) for (const a of anchors) if (a.cell === lf.id) a.cell = kids[0].id;
    if (wall) wall.ring = wall.ring.map(id => id === lf.id ? kids[0].id : id);
    splitCount++;
  }

  // -- regime 3 anchors + flux -----------------------------------------------------
  function placeAnchors(t) {
    const out = [{ kind: 'market', cell: nucleus }];
    let seat = -1, sv = -Infinity;
    for (const lf of leaves) if (!lf.dead && lf.builtAt >= 0) { const v = prominence(lf.id) * 10 + central(lf); if (v > sv) { sv = v; seat = lf.id; } }
    if (seat >= 0) out.push({ kind: 'seat', cell: seat });
    if (coastal) { let port = -1, pv = -Infinity;
      for (const lf of leaves) { if (lf.dead || lf.water) continue; let cn = 0; for (const j of nb(lf.id)) if (leaves[j].water) cn = 1; if (!cn) continue; const v = central(lf) + (lf.builtAt >= 0 ? 1 : 0); if (v > pv) { pv = v; port = lf.id; } }
      if (port >= 0) out.push({ kind: 'port', cell: port }); }
    if (hasRiver) { let mill = -1, mv = -Infinity;
      // mills serve the town: head of water × proximity (a race nobody walks to is no mill)
      for (const lf of leaves) { if (lf.dead || !lf.river) continue; let s = 0; for (const j of nb(lf.id)) s += Math.abs(lf.elev - leaves[j].elev); const v = s * (0.35 + central(lf)); if (v > mv) { mv = v; mill = lf.id; } }
      if (mill >= 0) { let bank = -1, bv = Infinity; for (const j of nb(mill)) { const g = leaves[j]; if (!g.water && !g.river) { const d = Math.hypot(g.x, g.y); if (d < bv) { bv = d; bank = j; } } } if (bank >= 0) out.push({ kind: 'mill', cell: bank }); } }
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

  // -- the growth loop -------------------------------------------------------------
  const sackSet = new Set(sackTicks.map(t => Math.max(1, Math.min(T - 1, t))));
  let capacity = capOf(leaves[nucleus], 0);

  for (let t = 1; t < T; t++) {
    if (t % ECON_EVERY === 1 || t === 1) marketPass(t);

    if (wallsAt >= 0 && !wall && t >= wallsAt) {
      const ring = [];
      for (const lf of leaves) {
        if (lf.dead || lf.builtAt < 0) continue;
        for (const j of nb(lf.id)) if (leaves[j].builtAt < 0 && !leaves[j].water) { ring.push(lf.id); break; }
      }
      if (ring.length > 8) { wall = { at: t, ring, popAt: pop[t] }; ev(t, 'walls', `stone rings the town — ${ring.length} wall cells enclose ${Math.round(pop[t]).toLocaleString()} people`); }
    }
    if (sackSet.has(t)) {
      const bearing = hash2(t, 3, seed ^ 0x2f) * TAU;
      let burned = 0;
      const nx = leaves[nucleus].x, ny = leaves[nucleus].y;
      for (const lf of leaves) {
        if (lf.dead || lf.builtAt < 0 || lf.id === nucleus) continue;
        const ang = Math.atan2(lf.y - ny, lf.x - nx);
        let d = ang - bearing; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        if (Math.abs(d) < 0.55) { lf.burnedAt = t; burned++; }
      }
      ev(t, 'sack', `the city is sacked — a quarter burns (${burned} cells); the survivors rebuild on the ashes`);
    }
    if (!anchors && (pop[t] >= DIVERSIFY_POP || t >= eras.mechAt)) {
      anchors = placeAnchors(t);
      market = anchors[0].cell;
      fluxPass(anchors, t);
      ev(t, 'diversify', `the base diversifies — ${anchors.map(a => a.kind).join(', ')} anchor distinct quarters; industry begins to bid for land`);
    }
    if (anchors && t === eras.mechAt) { fluxPass(anchors, t); ev(t, 'mech', 'the machine age: bridges cheapen, blocks spread out, the flux re-solves'); }

    // urban expansion toward the envelope; growth into a farm IS displacement
    let guard = 0;
    while (capacity < pop[t] && guard++ < 400) {
      let best = null, bv = -Infinity;
      for (const lf of leaves) {
        if (lf.dead || lf.builtAt >= 0 || lf.water || lf.river) continue;
        let adjBuilt = 0; for (const j of nb(lf.id)) if (leaves[j].builtAt >= 0) adjBuilt++;
        if (!adjBuilt) continue;
        const hop = laneHop[lf.id] < 0 ? 9 : laneHop[lf.id];
        let v = adjBuilt * 0.3 + lf.rent * 0.9 - hop * 0.7 - Math.max(0, lf.elev) * 2.5
              + central(lf) * 0.4 + hash2(lf.id, t, seed ^ 0x66) * 0.25;
        if (wall && pop[t] < wall.popAt * 1.4 && wallOutside(lf)) v -= 2.2;
        if (v > bv) { bv = v; best = lf; }
      }
      if (!best) break;
      if (wall && wallOutside(best) && !spilled && pop[t] >= wall.popAt * 1.4) { spilled = true; ev(t, 'spill', 'the town spills its walls — extramural quarters take root past the fringe belt'); }
      if (best.use === USE.FARM) {
        displaced++;
        if (firstDisp < 0) { firstDisp = t; ev(t, 'displace', 'the land grows too dear to farm — the first fields are built over, and the foodweb shifts outward'); }
      }
      best.builtAt = t; best.use = USE.RES; best.useAt = t;
      capacity += capOf(best, t);
      const hop2 = laneHop[best.id] < 0 ? 9 : laneHop[best.id];
      if (hop2 > REACH) {
        let src = -1, sv = Infinity;
        for (const id of laneCell) { const g = leaves[id]; if (g.dead) continue; const d = Math.hypot(g.x - best.x, g.y - best.y); if (d < sv) { sv = d; src = id; } }
        if (src >= 0) { layLanes(route(src, best.id, t), t); sproutCount++; perfuse(); }
      }
    }
    if (t % 24 === 0) perfuse();
  }
  function wallOutside(lf) {
    if (!wall) return false;
    const nx = leaves[nucleus].x, ny = leaves[nucleus].y;
    const d = Math.hypot(lf.x - nx, lf.y - ny);
    let rs = 0, n = 0; for (const r of wall.ring) { const g = leaves[r]; if (!g.dead) { rs += Math.hypot(g.x - nx, g.y - ny); n++; } }
    return n ? d > (rs / n) * 1.02 : false;
  }

  // -- true Voronoi polygons (half-plane clip vs neighbours) -----------------------
  const polys = {};
  for (const lf of leaves) {
    if (lf.dead) continue;
    const n = B << lf.level, cw = FRAME / n;
    let poly = [
      [lf.x - cw * 1.3, lf.y - cw * 1.3], [lf.x + cw * 1.3, lf.y - cw * 1.3],
      [lf.x + cw * 1.3, lf.y + cw * 1.3], [lf.x - cw * 1.3, lf.y + cw * 1.3],
    ];
    for (const j of nb(lf.id)) {
      const g = leaves[j];
      const mx = (lf.x + g.x) / 2, my = (lf.y + g.y) / 2;
      const nx2 = g.x - lf.x, ny2 = g.y - lf.y;
      const inside = (p) => (p[0] - mx) * nx2 + (p[1] - my) * ny2 <= 0;
      const out = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) {
          const da = (a[0] - mx) * nx2 + (a[1] - my) * ny2, db = (b[0] - mx) * nx2 + (b[1] - my) * ny2;
          const s = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]);
        }
      }
      poly = out;
      if (poly.length < 3) break;
    }
    polys[lf.id] = poly.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]);
  }

  // -- output ----------------------------------------------------------------------
  const lanes = [];
  for (const [key, v] of laneSet) { const [a, b] = key.split(':').map(Number); if (!leaves[a].dead && !leaves[b].dead) lanes.push({ a, b, at: v.at, tier: v.tier }); }
  lanes.sort((x, y) => x.at - y.at || x.a - y.a || x.b - y.b);
  let builtCount = 0, farmCount = 0;
  for (const lf of leaves) if (!lf.dead) { if (lf.builtAt >= 0) builtCount++; if (lf.use === USE.FARM) farmCount++; }
  ev(T - 1, 'now', `${Math.round(pop[T - 1]).toLocaleString()} people · ${builtCount} urban cells · ${farmCount} farms · ${displaced} fields built over · ${splitCount} refinements`);
  return {
    meta: { siteSeed, seed, B, MAXL, frame: FRAME, ticks: T, engine, coastal, hasRiver, wallsAt, eras,
            builtCount, farmCount, displaced, splits: splitCount, sprouts: sproutCount, lanes: lanes.length,
            leaves: leaves.filter(l => !l.dead).length },
    leaves, polys, nucleus, gates, wall, anchors, lanes, events, pop,
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
  mix(f.meta.builtCount); mix(f.meta.lanes); mix(f.nucleus); mix(f.meta.splits); mix(f.meta.displaced);
  for (const lf of f.leaves) { if (lf.dead) continue; mix(lf.qx * 7919 + lf.qy); mix(lf.level); mix(lf.use); if (lf.builtAt >= 0) mix(lf.builtAt); }
  for (const l of f.lanes) { mix(l.a); mix(l.b); mix(l.at); mix(l.tier); }
  return ('0000000' + h.toString(16)).slice(-8);
}
