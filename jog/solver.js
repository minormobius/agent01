// jog/solver.js — the loop finder. No dependencies, no DOM.
//
// Runs three ways from one file:
//   - as a Web Worker (index.html starts it; it fetches Overpass itself so the
//     big JSON parse never touches the main thread),
//   - as a plain script (window.JogSolver), and
//   - under node (module.exports) for solver.selftest.mjs.
//
// The method, in one paragraph: a loop of length L that starts at S is drawn as
// a regular polygon with S as one vertex (triangle, square, pentagon) at a
// sweep of bearings. The other vertices are snapped to the street graph and
// joined leg by leg with A*, each leg penalised for reusing edges the earlier
// legs took, so the route comes back a different way rather than retracing.
// Out-and-back spurs at the joints are cut, the loop is measured, and the
// polygon is rescaled by target/measured and re-routed until it lands within
// tolerance. Everything that lands is scored (distance error, retraced share,
// roundness, how much is off-road) and near-duplicates are folded together.

(function (root) {
  'use strict';

  // -------------------------------------------------------------- tagging --
  // What a runner can use, and how much we'd rather not. Factor multiplies the
  // edge's length into its routing cost; it never changes the reported distance.
  const HIGHWAY = {
    footway: 0.85, path: 0.85, pedestrian: 0.85, track: 0.9, cycleway: 0.9,
    bridleway: 0.95, living_street: 0.95, residential: 1.0, service: 1.15,
    unclassified: 1.1, road: 1.1, tertiary: 1.2, tertiary_link: 1.2,
    secondary: 1.4, secondary_link: 1.4, primary: 1.8, primary_link: 1.8,
    steps: 2.0,
  };
  const OFFROAD = new Set(['footway', 'path', 'pedestrian', 'track', 'cycleway', 'bridleway']);
  const MIN_FACTOR = 0.65; // A* heuristic scale: must stay ≤ the cheapest factor after the trail bonus (0.85 × 0.8 = 0.68)

  function overpassQuery(lat, lon, radius) {
    const hw = Object.keys(HIGHWAY).join('|');
    return `[out:json][timeout:90];
way["highway"~"^(${hw})$"]["access"!~"^(private|no)$"]["foot"!~"^(no|private|use_sidepath)$"]["area"!="yes"]["service"!~"^(parking_aisle|driveway|drive-through)$"](around:${Math.round(radius)},${lat.toFixed(6)},${lon.toFixed(6)})->.w;
.w out body qt;
node(w.w);
out skel qt;`;
  }

  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  // --------------------------------------------------------------- geometry --
  const R = 6371008.8, RAD = Math.PI / 180;
  function hav(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * RAD, dLon = (lon2 - lon1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function offset(lat, lon, bearingDeg, dist) {
    const b = bearingDeg * RAD, d = dist / R, p1 = lat * RAD, l1 = lon * RAD;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 / RAD, l2 / RAD];
  }

  // ------------------------------------------------------------------ graph --
  // CSR adjacency. Edges are undirected; edge e is stored twice (u→v, v→u) and
  // both entries carry the same id so "have we run this already" is per street
  // segment, not per direction.
  function buildGraph(osm, prefs) {
    const trailBonus = prefs && prefs.trails ? 0.8 : 1;
    const nodeIdx = new Map();
    const lats = [], lons = [];
    for (const el of osm.elements) {
      if (el.type === 'node') { nodeIdx.set(el.id, lats.length); lats.push(el.lat); lons.push(el.lon); }
    }
    const eu = [], ev = [], elen = [], ecost = [], eoff = [];
    for (const el of osm.elements) {
      if (el.type !== 'way' || !el.nodes) continue;
      const t = el.tags || {};
      let f = HIGHWAY[t.highway];
      if (f == null) continue;
      const off = OFFROAD.has(t.highway);
      if (off) f *= trailBonus;
      // A big road with a mapped sidewalk is fine to run along.
      if (/^(primary|secondary|tertiary)/.test(t.highway) && /^(both|left|right|yes)$/.test(t.sidewalk || t['sidewalk:both'] || '')) f = Math.min(f, 1.1);
      if (t.foot === 'designated' || t.foot === 'yes') f = Math.min(f, 0.95);
      for (let i = 1; i < el.nodes.length; i++) {
        const u = nodeIdx.get(el.nodes[i - 1]), v = nodeIdx.get(el.nodes[i]);
        if (u == null || v == null || u === v) continue;
        const len = hav(lats[u], lons[u], lats[v], lons[v]);
        eu.push(u); ev.push(v); elen.push(len); ecost.push(len * f); eoff.push(off ? 1 : 0);
      }
    }
    const n = lats.length, m = eu.length;
    const deg = new Int32Array(n + 1);
    for (let e = 0; e < m; e++) { deg[eu[e] + 1]++; deg[ev[e] + 1]++; }
    for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    const start = deg, fill = Int32Array.from(deg);
    const to = new Int32Array(2 * m), eid = new Int32Array(2 * m);
    for (let e = 0; e < m; e++) {
      to[fill[eu[e]]] = ev[e]; eid[fill[eu[e]]++] = e;
      to[fill[ev[e]]] = eu[e]; eid[fill[ev[e]]++] = e;
    }
    const g = {
      n, m, lat: Float64Array.from(lats), lon: Float64Array.from(lons), start, to, eid,
      elen: Float64Array.from(elen), ecost: Float64Array.from(ecost), eoff: Uint8Array.from(eoff),
    };
    components(g);
    gridIndex(g);
    return g;
  }

  function components(g) {
    const comp = new Int32Array(g.n).fill(-1), sizes = [];
    const stack = new Int32Array(g.n);
    for (let s = 0; s < g.n; s++) {
      if (comp[s] !== -1 || g.start[s + 1] === g.start[s]) continue;
      const c = sizes.length; let sp = 0, size = 0;
      stack[sp++] = s; comp[s] = c;
      while (sp) {
        const u = stack[--sp]; size++;
        for (let k = g.start[u]; k < g.start[u + 1]; k++) {
          const v = g.to[k];
          if (comp[v] === -1) { comp[v] = c; stack[sp++] = v; }
        }
      }
      sizes.push(size);
    }
    g.comp = comp; g.compSize = sizes;
    g.bigComp = sizes.length ? Math.max(...sizes) : 0;
  }

  // ~150 m buckets for nearest-node queries.
  function gridIndex(g) {
    const cell = 150;
    let lat0 = 0, k = 0;
    for (let i = 0; i < g.n; i++) if (g.start[i + 1] > g.start[i]) { lat0 += g.lat[i]; k++; }
    lat0 = k ? lat0 / k : 0;
    const my = cell / (R * RAD), mx = my / Math.max(0.05, Math.cos(lat0 * RAD));
    const buckets = new Map();
    for (let i = 0; i < g.n; i++) {
      if (g.start[i + 1] === g.start[i]) continue;
      const key = Math.floor(g.lat[i] / my) * 1e6 + Math.floor(g.lon[i] / mx);
      let b = buckets.get(key); if (!b) buckets.set(key, (b = [])); b.push(i);
    }
    g.grid = { my, mx, buckets };
  }

  // Nearest node whose component is at least `minComp` nodes: a point in a
  // courtyard with three footpaths should snap to the city, not the courtyard.
  function nearest(g, lat, lon, minComp) {
    const { my, mx, buckets } = g.grid;
    const cy = Math.floor(lat / my), cx = Math.floor(lon / mx);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 200; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
        const b = buckets.get((cy + dy) * 1e6 + (cx + dx));
        if (!b) continue;
        for (const i of b) {
          if (g.compSize[g.comp[i]] < minComp) continue;
          const d = hav(lat, lon, g.lat[i], g.lon[i]);
          if (d < bd) { bd = d; best = i; }
        }
      }
      // ring r guarantees everything within r cells has been seen
      if (best >= 0 && bd < r * 150) break;
    }
    return best < 0 ? null : { node: best, dist: bd };
  }

  // -------------------------------------------------------------------- A* --
  function Router(g) {
    const gs = new Float64Array(g.n), prev = new Int32Array(g.n);
    const seen = new Int32Array(g.n), shut = new Int32Array(g.n);
    let stamp = 0;
    // binary heap of (f, node)
    let hf = new Float64Array(1024), hn = new Int32Array(1024), hl = 0;
    function push(f, v) {
      if (hl === hf.length) { const a = new Float64Array(hl * 2); a.set(hf); hf = a; const b = new Int32Array(hl * 2); b.set(hn); hn = b; }
      let i = hl++;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p; }
      hf[i] = f; hn[i] = v;
    }
    function pop() {
      const top = hn[0], lf = hf[--hl], ln = hn[hl];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= hl) break;
        if (c + 1 < hl && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hf[i] = hf[c]; hn[i] = hn[c]; i = c;
      }
      hf[i] = lf; hn[i] = ln;
      return top;
    }
    // used: Uint8Array per edge, how many times the loop so far has run it.
    // Each reuse multiplies the edge's cost by 5, 9, … — expensive enough to
    // send the way home down other streets, cheap enough that a lone bridge
    // is still crossed twice when it's the only way back.
    // Returns the node sequence a … b, or null if b is unreachable.
    return function route(a, b, used) {
      if (a === b) return [a];
      stamp++; hl = 0;
      const glat = g.lat[b], glon = g.lon[b];
      gs[a] = 0; prev[a] = -1; seen[a] = stamp;
      push(hav(g.lat[a], g.lon[a], glat, glon) * MIN_FACTOR, a);
      while (hl) {
        const u = pop();
        if (u === b) {
          const out = [];
          for (let x = b; x !== -1; x = prev[x]) out.push(x);
          return out.reverse();
        }
        if (shut[u] === stamp) continue;
        shut[u] = stamp;
        for (let k = g.start[u]; k < g.start[u + 1]; k++) {
          const v = g.to[k], e = g.eid[k];
          const c = gs[u] + g.ecost[e] * (1 + 4 * used[e]);
          if (seen[v] !== stamp || c < gs[v]) {
            seen[v] = stamp; gs[v] = c; prev[v] = u;
            push(c + hav(g.lat[v], g.lon[v], glat, glon) * MIN_FACTOR, v);
          }
        }
      }
      return null;
    };
  }

  function edgeBetween(g, u, v) {
    let best = -1, bl = Infinity;
    for (let k = g.start[u]; k < g.start[u + 1]; k++) {
      if (g.to[k] === v && g.elen[g.eid[k]] < bl) { bl = g.elen[g.eid[k]]; best = g.eid[k]; }
    }
    return best;
  }

  // Cut out-and-back spurs: u → v → u collapses to u. Repeats until stable,
  // so a whole dead-end street run to the end and back disappears.
  function cutSpurs(nodes) {
    const st = [];
    for (const x of nodes) {
      if (st.length >= 2 && st[st.length - 2] === x) st.pop();
      else st.push(x);
    }
    return st;
  }

  function measure(g, nodes, origin) {
    const edges = [];
    let len = 0, off = 0;
    const count = new Map();
    for (let i = 1; i < nodes.length; i++) {
      const e = edgeBetween(g, nodes[i - 1], nodes[i]);
      if (e < 0) return null;
      edges.push(e); len += g.elen[e]; if (g.eoff[e]) off += g.elen[e];
      count.set(e, (count.get(e) || 0) + 1);
    }
    let dup = 0;
    for (const e of edges) if (count.get(e) > 1) dup += g.elen[e];
    // Roundness: isoperimetric quotient of the polygon the loop traces, in a
    // local flat projection. A circle is 1, a square .79, an out-and-back 0.
    const ky = R * RAD, kx = ky * Math.cos(origin[0] * RAD);
    let area = 0;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i];
      const ax = (g.lon[a] - origin[1]) * kx, ay = (g.lat[a] - origin[0]) * ky;
      const bx = (g.lon[b] - origin[1]) * kx, by = (g.lat[b] - origin[0]) * ky;
      area += ax * by - bx * ay;
    }
    area = Math.abs(area) / 2;
    const round = len > 0 ? Math.min(1, (4 * Math.PI * area) / (len * len)) : 0;
    return { len, offroad: len ? off / len : 0, overlap: len ? dup / len : 0, round, edges: new Set(edges), edgeCount: count };
  }

  // ------------------------------------------------------------------ solve --
  // opts: { lat, lon, target (m), tol (fraction), trails (bool), max (count) }
  // onProgress(fraction, loopsSoFar) is optional.
  function solve(g, opts, onProgress) {
    const target = opts.target, tol = opts.tol || 0.1, maxOut = opts.max || 10;
    const minComp = Math.max(2, Math.min(500, Math.floor(g.bigComp * 0.2)));
    const s = nearest(g, opts.lat, opts.lon, minComp);
    if (!s) return { error: 'No runnable paths near that address.' };
    const S = s.node, origin = [g.lat[S], g.lon[S]];
    const route = Router(g);
    const used = new Uint8Array(g.m);

    // Sweep: polygon shape × bearing. Pentagons are the roundest; triangles
    // reach furthest from home and find the long straight runs.
    const plans = [];
    for (const sides of [3, 4, 5]) {
      const steps = sides === 3 ? 24 : sides === 4 ? 16 : 12;
      for (let i = 0; i < steps; i++) plans.push({ sides, bearing: (360 / steps) * i + (sides === 4 ? 11 : sides === 5 ? 4 : 0) });
    }
    let tau = 1.3; // road distance ÷ straight-line distance; learned as we go
    const found = [];
    let done = 0;
    for (const plan of plans) {
      // The first attempt is sized by the learned tau; each retry rescales
      // this plan's own polygon by how far the last one missed.
      let side = target / tau / plan.sides;
      for (let attempt = 0; attempt < 3; attempt++) {
        const loop = buildLoop(plan, side);
        if (!loop) break;
        found.push(loop);
        const ratio = loop.len / target;
        tau = Math.max(1.05, Math.min(2.5, tau * 0.8 + (loop.len / (side * plan.sides)) * 0.2));
        if (Math.abs(ratio - 1) <= tol / 2) break;
        side *= Math.max(0.5, Math.min(2, 1 / ratio));
      }
      done++;
      if (onProgress) onProgress(done / plans.length, found.filter((l) => Math.abs(l.len / target - 1) <= tol).length);
    }

    function buildLoop(plan, side) {
      // Vertices of a regular polygon walked counter-clockwise from S.
      const pts = [];
      let lat = origin[0], lon = origin[1];
      for (let i = 0; i < plan.sides - 1; i++) {
        [lat, lon] = offset(lat, lon, plan.bearing + i * (360 / plan.sides), side);
        pts.push([lat, lon]);
      }
      const way = [S];
      for (const p of pts) {
        const w = nearest(g, p[0], p[1], minComp);
        if (!w || g.comp[w.node] !== g.comp[S]) return null;
        if (w.node !== way[way.length - 1]) way.push(w.node);
      }
      way.push(S);
      if (way.length < 3) return null;
      used.fill(0);
      let nodes = [S];
      for (let i = 1; i < way.length; i++) {
        const seg = route(way[i - 1], way[i], used);
        if (!seg) return null;
        for (let j = 1; j < seg.length; j++) {
          const e = edgeBetween(g, seg[j - 1], seg[j]);
          if (used[e] < 255) used[e]++;
          nodes.push(seg[j]);
        }
      }
      nodes = cutSpurs(nodes);
      if (nodes.length < 4 || nodes[0] !== S || nodes[nodes.length - 1] !== S) return null;
      const m = measure(g, nodes, origin);
      if (!m || m.len < target * 0.3) return null;
      return { nodes, ...m, plan: { sides: plan.sides, bearing: plan.bearing } };
    }

    // Score and fold near-duplicates (same streets, maybe the other way round).
    for (const l of found) {
      const err = Math.abs(l.len / target - 1);
      l.err = err;
      l.score = err * 4 + l.overlap * 1.6 + (1 - l.round) * 0.35 - l.offroad * (opts.trails ? 0.5 : 0.15);
    }
    let pool = found.filter((l) => l.err <= tol);
    const close = pool.length === 0;
    if (close) pool = found.slice();
    pool.sort((a, b) => a.score - b.score);
    const keep = [];
    for (const l of pool) {
      let dupOf = false;
      for (const k of keep) {
        let inter = 0;
        for (const e of l.edges) if (k.edges.has(e)) inter++;
        if (inter / Math.min(l.edges.size, k.edges.size) > 0.6) { dupOf = true; break; }
      }
      if (!dupOf) keep.push(l);
      if (keep.length >= maxOut) break;
    }
    return {
      start: { lat: origin[0], lon: origin[1], snapped: s.dist },
      tried: found.length,
      approximate: close,
      loops: keep.map((l) => ({
        len: l.len, err: l.err, overlap: l.overlap, offroad: l.offroad, round: l.round,
        sides: l.plan.sides, bearing: l.plan.bearing,
        coords: l.nodes.map((i) => [+g.lat[i].toFixed(6), +g.lon[i].toFixed(6)]),
      })),
    };
  }

  async function fetchOverpass(lat, lon, radius, signal) {
    const body = 'data=' + encodeURIComponent(overpassQuery(lat, lon, radius));
    let lastErr;
    for (const url of OVERPASS) {
      try {
        const r = await fetch(url, { method: 'POST', body, signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!r.ok) { lastErr = new Error(`${new URL(url).host} answered ${r.status}`); continue; }
        return await r.json();
      } catch (e) { if (signal && signal.aborted) throw e; lastErr = e; }
    }
    throw lastErr || new Error('Overpass unreachable');
  }

  // How far out to fetch. A loop of length L rarely strays further than ~L/3
  // from home; 0.42·L leaves room for the polygon's far corner plus snapping.
  function fetchRadius(target) { return Math.max(800, target * 0.42); }

  const api = { HIGHWAY, buildGraph, solve, nearest, cutSpurs, hav, offset, overpassQuery, fetchOverpass, fetchRadius };

  // ----------------------------------------------------------------- worker --
  if (typeof importScripts === 'function' && typeof self !== 'undefined' && typeof window === 'undefined') {
    let cache = null; // { lat, lon, radius, trails, g }
    self.onmessage = async (ev) => {
      const { id, lat, lon, target, tol, trails } = ev.data;
      const post = (m) => self.postMessage({ id, ...m });
      try {
        const radius = fetchRadius(target);
        let g;
        if (cache && cache.trails === trails && cache.radius >= radius && hav(lat, lon, cache.lat, cache.lon) < 30) {
          g = cache.g;
        } else {
          post({ stage: 'fetch', note: `Downloading paths within ${(radius / 1000).toFixed(1)} km…` });
          const osm = await fetchOverpass(lat, lon, radius);
          post({ stage: 'graph', note: `Building a graph from ${osm.elements.length.toLocaleString()} map elements…` });
          g = buildGraph(osm, { trails });
          cache = { lat, lon, radius, trails, g };
        }
        if (!g.m) { post({ stage: 'error', error: 'No runnable paths found around that address.' }); return; }
        post({ stage: 'solve', note: `Searching ${g.m.toLocaleString()} path segments…`, progress: 0 });
        const res = solve(g, { lat, lon, target, tol, trails, max: 12 }, (p, n) => post({ stage: 'solve', progress: p, count: n }));
        post({ stage: 'done', result: res });
      } catch (e) {
        post({ stage: 'error', error: String(e && e.message || e) });
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JogSolver = api;
})(typeof self !== 'undefined' ? self : this);
