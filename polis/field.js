// field.js — THE SETTLEMENT FIELD: the city proper's first layer. One founded site
// (a hinterland town / civ city) → the micro-terrain it sits on and the street
// fabric its economy writes onto the ground, tick by tick.
//
// This is the original THEORY.md §0 program finally cashed in — "the economy decides
// where current is injected; the city's form is the field-solve" — with the three
// forcing regimes run as a LIFE CYCLE over one lane graph:
//
//   regime 1 · NUCLEUS   — one engine, one sink: spoke routes from the area gates to
//                          the founding engine (Physarum star, compacted to
//                          least-cost routing — the μ-high tree limit).
//   regime 2 · COVERAGE  — the base multiplier spins up local services; the binding
//                          constraint flips to serve-everyone: perfusion BFS finds
//                          the worst-served built tissue and sprouts a capillary
//                          lane toward it (hoop/v7/foam.js's seize(), compacted).
//   regime 3 · DEMAND    — diversification: district anchors (market, seat, port,
//                          mill/industry) + gates form an O–D set; least-cost flux
//                          accumulates per edge and the arterial hierarchy is the
//                          superlevel set (hoop/paint/flux.js's idea, compacted).
//
// Everything above the terrain is a CLIENT of the levels above (civ → hinterland →
// city, causation downward only): the population envelope, the founder-tech era
// ticks, the walls tick and the sack ticks arrive as boundary conditions and are
// never invented here. The terrain below is re-derived one more time (mappa carries
// no truth below its cells; the hinterland none below its day's-walk mesh): coarse
// elevation is sampled from the level above and micro-relief is minted from the
// siteSeed — the same downscaling trick, one rung further down.
//
// Deterministic: (siteSeed, ctx) → identical field on any machine. No Date.now(),
// no unseeded randomness. Node + browser (attaches nothing; pure exports).

import { mulberry32, hash2 } from './prng.js';

const TAU = Math.PI * 2;

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}

// smoothed value noise + 4-octave fbm for the micro-relief (block-scale texture)
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, s) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * f, y * f, s + o * 197); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

// people one built block holds — the density constant that converts the population
// envelope (from above) into built area. Pre-modern blocks are crowded; the
// mechanised era spreads out (streetcar suburbs): density falls, area jumps.
const PER_CELL = 140;
const PER_CELL_MECH = 95;
const REACH = 2;            // coverage: max lane hop-distance any built cell tolerates
const DIVERSIFY_POP = 3800; // regime 3 opens (Thompson maturation ~ a real town)

// ---- the field ------------------------------------------------------------------
// ctx (all optional; defaults give a standalone demo city):
//   sampler(x,y)->{elev,moist}  coarse terrain from the level above (local km coords)
//   coastal, coastDir           sea beyond ~35% of the frame toward coastDir (rad)
//   river, riverDir             a river crossing the frame, flowing toward riverDir
//   engine                      'gateway'|'break-of-bulk'|'staple'|'fortress'|'market'
//   popSeries                   population envelope; its length is the tick count
//   wallsAt                     tick walls rise (-1 never) — from the civ city
//   sackTicks                   ticks the city is sacked — from the civ city
//   eras { wheelAt, mechAt }    founder-tech unlock ticks (bridge cost, density, rail gate)
//   gates                       bearings (rad) of the routes to the outside world
export function growCity(siteSeed, ctx = {}) {
  const seedFn = xmur3(String(siteSeed));
  const seed = seedFn();
  const R = mulberry32(seed ^ 0x9e3779b9);

  const G = ctx.G || 64;                       // G×G jittered voronoi (block scale)
  const N = G * G;
  const FRAME = ctx.frame || 3.0;              // km across — a walkable city
  const cw = FRAME / G;
  const coastal = !!ctx.coastal, coastDir = ctx.coastDir ?? 0;
  const hasRiver = ctx.river !== false;
  const riverDir = ctx.riverDir ?? Math.PI * 0.3;
  const engine = ctx.engine || 'market';
  const pop = ctx.popSeries && ctx.popSeries.length ? ctx.popSeries : defaultEnvelope(240);
  const T = pop.length;
  const wallsAt = ctx.wallsAt ?? -1;
  const sackTicks = ctx.sackTicks || [];
  const eras = { wheelAt: 0, mechAt: Math.round(T * 0.8), ...(ctx.eras || {}) };
  const gates0 = ctx.gates || [0.3, Math.PI * 0.55, Math.PI * 1.05, Math.PI * 1.6];

  // -- terrain: coarse sample from above + micro-relief from the siteSeed ----------
  const px = new Float32Array(N), py = new Float32Array(N);
  const elev = new Float32Array(N), moist = new Float32Array(N);
  const water = new Uint8Array(N), river = new Uint8Array(N);
  const half = FRAME / 2;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const i = gy * G + gx;
    const jx = (hash2(gx, gy, seed) - 0.5) * 0.8, jy = (hash2(gx, gy, seed ^ 0x77) - 0.5) * 0.8;
    const x = (gx + 0.5 + jx) * cw - half, y = (gy + 0.5 + jy) * cw - half;
    px[i] = x; py[i] = y;
    const base = ctx.sampler ? ctx.sampler(x, y) : { elev: 0.12 + 0.1 * fbm(x * 0.5 + 9, y * 0.5 + 9, seed ^ 0xa1), moist: 0.55 };
    let e = Math.max(0.01, base.elev) * 0.6 + (fbm(x * 2.2 + 31, y * 2.2 + 31, seed ^ 0x3c) - 0.5) * 0.16;
    if (coastal) {                             // the sea claims the far side of the frame
      const proj = x * Math.cos(coastDir) + y * Math.sin(coastDir);
      const t = (proj - half * 0.35) / (half * 0.3);
      if (t > 0) e -= Math.min(1, t) * (0.30 + Math.max(0, base.elev) * 0.6);
    }
    elev[i] = e; moist[i] = Math.min(1, Math.max(0, base.moist ?? 0.5));
    if (e <= 0) water[i] = 1;
  }
  const nb = (i) => {                          // 8-neighbourhood on the jitter grid
    const gx = i % G, gy = (i / G) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
      out.push(ny * G + nx);
    }
    return out;
  };

  // -- the river: enters opposite riverDir, exits along it, prefers low ground -----
  if (hasRiver) {
    const enter = edgeCellAt(riverDir + Math.PI), exit = edgeCellAt(riverDir);
    let cur = enter, guard = 0;
    const exX = px[exit], exY = py[exit];
    while (cur !== exit && guard++ < N) {
      river[cur] = 1; elev[cur] = Math.min(elev[cur], 0.02 + guard * 0.0001);
      let best = -1, bv = Infinity;
      for (const j of nb(cur)) {
        if (river[j]) continue;
        const towards = Math.hypot(px[j] - exX, py[j] - exY);
        const v = towards * 1.6 + Math.max(0, elev[j]) * 3 + hash2(j, guard, seed ^ 0x5e) * 0.25;
        if (v < bv) { bv = v; best = j; }
      }
      if (best < 0) break;
      cur = best;
      if (water[cur]) break;                   // reached the sea — the mouth
    }
  }
  function edgeCellAt(bearing) {
    // frame-edge cell nearest the ray from centre at `bearing`
    const tx = Math.cos(bearing), ty = Math.sin(bearing);
    let best = 0, bv = -Infinity;
    for (let i = 0; i < N; i++) {
      const gx = i % G, gy = (i / G) | 0;
      if (gx > 1 && gy > 1 && gx < G - 2 && gy < G - 2) continue;
      const d = px[i] * tx + py[i] * ty;
      if (d > bv) { bv = d; best = i; }
    }
    return best;
  }

  // -- the nucleus: where the founding engine sits ---------------------------------
  const prominence = (i) => { let s = 0, n = 0; for (const j of nb(i)) { s += elev[j]; n++; } return n ? Math.max(0, elev[i] - s / n) : 0; };
  const central = (i) => 1 - Math.hypot(px[i], py[i]) / half;      // 1 centre → 0 edge
  let nucleus = -1, nv = -Infinity;
  for (let i = 0; i < N; i++) {
    if (water[i] || river[i]) continue;
    let coastNb = 0, riverNb = 0;
    for (const j of nb(i)) { if (water[j]) coastNb = 1; if (river[j]) riverNb = 1; }
    let v = central(i) * 0.8 - Math.max(0, elev[i]) * 1.5;
    if (engine === 'gateway') v += 3 * coastNb + 1.2 * riverNb;               // the harbour head
    else if (engine === 'break-of-bulk') v += 3 * riverNb - prominence(i) * 4; // the ford / lowest crossing
    else if (engine === 'fortress') v += prominence(i) * 22;                   // the citadel hill
    else if (engine === 'staple') v += Math.max(0, elev[i]) * 3 + fbm(px[i] * 3, py[i] * 3, seed ^ 0x11) * 2; // the adit
    else v += moist[i] * 1.4 + 0.6 * riverNb;                                  // the market cross
    if (v > nv) { nv = v; nucleus = i; }
  }

  // -- the lane graph --------------------------------------------------------------
  const laneAt = new Map();                    // edgeKey -> tick laid
  const laneTier = new Map();                  // edgeKey -> 1 lane | 2 connector | 3 arterial
  const ekey = (a, b) => a < b ? a * N + b : b * N + a;
  const isLane = (i) => laneCell[i] === 1;
  const laneCell = new Uint8Array(N);
  function edgeCost(a, b, t) {
    if (water[a] || water[b]) return Infinity;
    const len = Math.hypot(px[a] - px[b], py[a] - py[b]);
    const slope = Math.abs(elev[a] - elev[b]) / Math.max(0.01, len);
    let c = len * (1 + 3.5 * slope);
    if (river[a] !== river[b] || (river[a] && river[b]))
      c *= t >= eras.mechAt ? 1.6 : t >= eras.wheelAt ? 4 : 7;   // ferry → bridge → viaduct
    return c;
  }
  // dijkstra on the 8-grid (N ≤ 4096: array scan is fine and deterministic)
  const dist = new Float64Array(N), prev = new Int32Array(N), done = new Uint8Array(N);
  function route(src, dst, t) {
    dist.fill(Infinity); done.fill(0); dist[src] = 0; prev[src] = -1;
    for (; ;) {
      let u = -1, uv = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < uv) { uv = dist[i]; u = i; }
      if (u < 0 || u === dst) break;
      done[u] = 1;
      for (const v of nb(u)) {
        const c = edgeCost(u, v, t); if (!isFinite(c)) continue;
        const laid = laneAt.has(ekey(u, v));
        const nd = dist[u] + (laid ? c * 0.35 : c);      // existing lanes are cheap — reuse begets arterials
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    if (!isFinite(dist[dst])) return null;
    const path = []; let u = dst;
    while (u >= 0) { path.push(u); u = prev[u]; }
    return path.reverse();
  }
  function layLanes(path, t) {
    if (!path) return;
    for (let k = 1; k < path.length; k++) {
      const key = ekey(path[k - 1], path[k]);
      if (!laneAt.has(key)) { laneAt.set(key, t); laneTier.set(key, 1); }
      laneCell[path[k - 1]] = 1; laneCell[path[k]] = 1;
    }
  }

  // -- events (always a string in the ribbon — history grinds forward) ------------
  const events = [];
  const ev = (t, type, note) => events.push({ t, type, note });

  // -- regime 1: the star — gates route to the one place that matters --------------
  const gates = [];
  for (const b of gates0) { const g = edgeCellAt(b); if (!water[g]) gates.push(g); }
  for (const g of gates) layLanes(route(g, nucleus, 0), 0);
  ev(0, 'founded', `the ${engine} nucleus is staked; ${gates.length} routes thread in from the world`);

  // -- growth loop: envelope → built blocks, coverage sprouts, walls, sacks --------
  const builtAt = new Int32Array(N).fill(-1);
  const burnedAt = new Int32Array(N).fill(-1);
  builtAt[nucleus] = 0; laneCell[nucleus] = 1;
  let builtCount = 1;
  let wall = null;                             // { at, ring:[cellIds], popAt }
  let spilled = false, sproutCount = 0, anchors = null;
  const laneHop = new Int32Array(N);

  function perfuse() {                         // BFS hop-distance to the nearest lane
    laneHop.fill(-1);
    const q = [];
    for (let i = 0; i < N; i++) if (laneCell[i]) { laneHop[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of nb(u)) if (laneHop[v] < 0 && !water[v]) { laneHop[v] = laneHop[u] + 1; q.push(v); }
    }
  }
  perfuse();

  const sackSet = new Set(sackTicks.map(t => Math.max(1, Math.min(T - 1, t))));

  for (let t = 1; t < T; t++) {
    const perCell = t >= eras.mechAt ? PER_CELL_MECH : PER_CELL;
    const target = Math.min(N - 1, Math.ceil(pop[t] / perCell));

    // walls rise (a boundary condition from the civ city, not a local decision)
    if (wallsAt >= 0 && !wall && t >= wallsAt && builtCount > 8) {
      const ring = [];
      for (let i = 0; i < N; i++) {
        if (builtAt[i] < 0) continue;
        for (const j of nb(i)) if (builtAt[j] < 0 && !water[j]) { ring.push(i); break; }
      }
      wall = { at: t, ring, popAt: pop[t] };
      ev(t, 'walls', `stone rings the town — ${ring.length} wall blocks enclose ${Math.round(pop[t]).toLocaleString()} people`);
    }

    // sacks arrive from civ history: a wedge of the fabric burns (and rebuilds)
    if (sackSet.has(t)) {
      const bearing = hash2(t, 3, seed ^ 0x2f) * TAU;
      let burned = 0;
      for (let i = 0; i < N; i++) {
        if (builtAt[i] < 0 || i === nucleus) continue;
        const ang = Math.atan2(py[i] - py[nucleus], px[i] - px[nucleus]);
        let d = ang - bearing; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        if (Math.abs(d) < 0.55) { burnedAt[i] = t; burned++; }
      }
      ev(t, 'sack', `the city is sacked — a quarter burns (${burned} blocks); the survivors rebuild on the ashes`);
    }

    // regime 3 opens: anchors + flux → the arterial hierarchy
    if (!anchors && (pop[t] >= DIVERSIFY_POP || t >= eras.mechAt)) {
      anchors = placeAnchors(t);
      fluxPass(anchors, t);
      ev(t, 'diversify', `the base diversifies — ${anchors.map(a => a.kind).join(', ')} anchor distinct quarters; arterials thicken between them`);
    }
    if (anchors && t === eras.mechAt) {
      fluxPass(anchors, t);                    // the machine age re-weights the network
      ev(t, 'mech', 'the machine age: bridges cheapen, blocks spread out, the flux re-solves');
    }

    // coverage growth toward the envelope target
    let guard = 0;
    while (builtCount < target && guard++ < 300) {
      let best = -1, bv = -Infinity;
      for (let i = 0; i < N; i++) {
        if (builtAt[i] >= 0 || water[i] || river[i]) continue;
        let adjBuilt = 0; for (const j of nb(i)) if (builtAt[j] >= 0) adjBuilt++;
        if (!adjBuilt) continue;
        const hop = laneHop[i] < 0 ? 9 : laneHop[i];
        let v = adjBuilt * 0.35 - hop * 0.8 - Math.max(0, elev[i]) * 2.5 + moist[i] * 0.4
              + central(i) * 0.5 + hash2(i, t, seed ^ 0x66) * 0.3;
        if (wall && builtAt[i] < 0) {          // the fringe belt: crossing the wall is resisted
          const outside = !wall.ring.includes(i) && wallOutside(i);
          if (outside && pop[t] < wall.popAt * 1.4) v -= 2.2;
          else if (outside && !spilled) { spilled = true; ev(t, 'spill', 'the town spills its walls — extramural quarters take root past the fringe belt'); }
        }
        if (v > bv) { bv = v; best = i; }
      }
      if (best < 0) break;
      builtAt[best] = t; builtCount++;
      // hypoxia: tissue too far from a lane summons one (foam.js seize, compacted)
      if ((laneHop[best] < 0 ? 9 : laneHop[best]) > REACH) {
        let src = -1, sv = Infinity;
        for (let i = 0; i < N; i++) if (laneCell[i]) { const d = Math.hypot(px[i] - px[best], py[i] - py[best]); if (d < sv) { sv = d; src = i; } }
        if (src >= 0) { layLanes(route(src, best, t), t); sproutCount++; perfuse(); }
      }
    }
    if (t % 24 === 0) perfuse();               // keep the perfusion field honest
  }
  function wallOutside(i) {
    // outside = farther from nucleus than the ring's typical radius along this bearing
    if (!wall) return false;
    const d = Math.hypot(px[i] - px[nucleus], py[i] - py[nucleus]);
    let rs = 0; for (const r of wall.ring) rs += Math.hypot(px[r] - px[nucleus], py[r] - py[nucleus]);
    return d > (rs / Math.max(1, wall.ring.length)) * 1.02;
  }

  // -- regime 3 internals ----------------------------------------------------------
  function placeAnchors(t) {
    const out = [{ kind: 'market', cell: bestNear(nucleus, (i) => 1) }];
    let seat = -1, sv = -Infinity;
    for (let i = 0; i < N; i++) if (builtAt[i] >= 0) { const v = prominence(i) * 10 + central(i); if (v > sv) { sv = v; seat = i; } }
    if (seat >= 0) out.push({ kind: 'seat', cell: seat });
    if (coastal) { let port = -1, pv = -Infinity; for (let i = 0; i < N; i++) { if (water[i]) continue; let cn = 0; for (const j of nb(i)) if (water[j]) cn = 1; if (!cn) continue; const v = central(i) + (builtAt[i] >= 0 ? 1 : 0); if (v > pv) { pv = v; port = i; } } if (port >= 0) out.push({ kind: 'port', cell: port }); }
    if (hasRiver) { let mill = -1, mv = -Infinity; for (let i = 0; i < N; i++) { if (!river[i]) continue; let s = 0; for (const j of nb(i)) s += Math.abs(elev[i] - elev[j]); if (s > mv) { mv = s; mill = i; } } if (mill >= 0) { let bank = -1, bv2 = Infinity; for (const j of nb(mill)) if (!water[j] && !river[j]) { const d = Math.hypot(px[j], py[j]); if (d < bv2) { bv2 = d; bank = j; } } if (bank >= 0) out.push({ kind: 'mill', cell: bank }); } }
    return out;
  }
  function bestNear(c, score) {
    let best = c, bv = -Infinity;
    for (const j of nb(c)) if (!water[j] && !river[j]) { const v = score(j) + hash2(j, 7, seed) * 0.1; if (v > bv) { bv = v; best = j; } }
    return best;
  }
  function fluxPass(anch, t) {
    const flux = new Map();
    const nodes = [...anch.map(a => a.cell), ...gates];
    for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
      const path = route(nodes[a], nodes[b], t);
      if (!path) continue;
      layLanes(path, t);
      for (let k = 1; k < path.length; k++) { const key = ekey(path[k - 1], path[k]); flux.set(key, (flux.get(key) || 0) + 1); }
    }
    const vals = [...flux.values()].sort((x, y) => x - y);
    const q = (f) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * f))] : Infinity;
    const hi = q(0.75), mid = q(0.4);
    for (const [key, f] of flux) laneTier.set(key, f >= hi ? 3 : f >= mid ? 2 : Math.max(1, laneTier.get(key) || 1));
    perfuse();
  }

  // -- output ----------------------------------------------------------------------
  const lanes = [];
  for (const [key, at] of laneAt) lanes.push({ a: (key / N) | 0, b: key % N, at, tier: laneTier.get(key) || 1 });
  lanes.sort((x, y) => x.at - y.at || x.a - y.a || x.b - y.b);
  ev(T - 1, 'now', `${Math.round(pop[T - 1]).toLocaleString()} people · ${builtCount} blocks · ${lanes.length} lanes${wall ? ' · walled' : ''}${anchors ? ' · diversified' : ''}`);
  return {
    meta: { siteSeed, seed, G, frame: FRAME, ticks: T, engine, coastal, hasRiver, wallsAt, eras,
            builtCount, lanes: lanes.length, sprouts: sproutCount },
    px, py, elev, water, river, builtAt, burnedAt, nucleus, gates, wall, anchors, lanes, events, pop,
  };
}

// standalone demo envelope: a Gompertz-ish rise to a small city
export function defaultEnvelope(T, peak = 14000) {
  const out = [];
  for (let k = 0; k < T; k++) out.push(Math.max(6, Math.round(peak * Math.exp(-4.2 * Math.exp(-5.5 * k / T)))));
  return out;
}

// serialize the field for hashing / diffing in tests (order-stable)
export function fieldDigest(f) {
  let h = 2166136261 >>> 0;
  const mix = (n) => { h ^= n >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(f.meta.builtCount); mix(f.meta.lanes); mix(f.nucleus); mix(f.meta.sprouts);
  for (let i = 0; i < f.builtAt.length; i++) if (f.builtAt[i] >= 0) { mix(i); mix(f.builtAt[i]); }
  for (const l of f.lanes) { mix(l.a); mix(l.b); mix(l.at); mix(l.tier); }
  return ('0000000' + h.toString(16)).slice(-8);
}
