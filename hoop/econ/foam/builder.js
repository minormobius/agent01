// builder.js — the /econ/foam/ module Worker. Builds the foam city (≈5.5 s for the full 33k-chamber
// sector) OFF the render thread, bakes per-chamber colour layers + the route-ribbon geometry, and
// stays alive holding {city, society, metrics} to answer click inspections. The page only ever
// receives transferable typed arrays + small JSON — it never touches the model.
import { buildFoamCity, scoreFoamSociety } from '../society3d.js';
import { buildSociety, socialMetrics, scoreSociety, removeImpact, rollGenome, DEFAULT_GENOME, ROLES } from '../econ.js';

let city = null, society = null, metrics = null;

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const ROLE_RGB = Object.fromEntries(Object.entries(ROLES).map(([k, R]) => [k, hex(R.color)]));
const ROAD_RGB = [0.62, 0.66, 0.70], VOID_RGB = [0.055, 0.065, 0.085];

// one colour layer = Float32Array(3N), chamber i coloured by its owner under that lens
function bakeColors() {
  const N = city.chambers.length, places = city.places, owner = city.chamberOwner;
  const layers = { role: new Float32Array(3 * N), footprint: new Float32Array(3 * N), bridging: new Float32Array(3 * N), access: new Float32Array(3 * N) };
  const maxFp = Math.max(...places.map((p) => p.footprint));
  const bridge = new Map();                                  // placeId → bridging fraction
  for (const [pid, b] of metrics.bridging) if (b.members >= 2) bridge.set(pid, b.bridging);
  const hsl = (h, s, l) => {                                 // tiny hsl→rgb for the gradient lenses
    const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)];
  };
  const put = (L, i, c, m = 1) => { L[3 * i] = c[0] * m; L[3 * i + 1] = c[1] * m; L[3 * i + 2] = c[2] * m; };
  for (let i = 0; i < N; i++) {
    const o = owner[i];
    if (o === -1) { for (const k in layers) put(layers[k], i, ROAD_RGB); continue; }
    if (o < 0) { for (const k in layers) put(layers[k], i, VOID_RGB); continue; }
    const p = places[o];
    const lift = p.onRoad ? 1.18 : 1.0;                      // frontage reads a half-step brighter
    put(layers.role, i, ROLE_RGB[p.role] || [0.5, 0.5, 0.5], lift);
    const tf = Math.min(1, Math.log2(1 + p.footprint) / Math.log2(1 + maxFp));
    put(layers.footprint, i, hsl(210 - tf * 180, 0.3 + tf * 0.45, 0.16 + tf * 0.34), lift);
    if (p.role === 'dwell') put(layers.bridging, i, [0.086, 0.11, 0.16]);
    else if (!bridge.has(p.id)) put(layers.bridging, i, [0.075, 0.09, 0.11]);
    else { const v = bridge.get(p.id); put(layers.bridging, i, hsl(212 - v * 182, 0.34 + v * 0.38, 0.20 + v * 0.24)); }
    if (p.role === 'dwell' && isFinite(p.accessCost)) {      // green = the 15-minute dwelling, red = stranded
      const t = Math.max(0, Math.min(1, p.accessCost / 30));
      put(layers.access, i, hsl(120 - t * 120, 0.55, 0.30));
    } else put(layers.access, i, [0.10, 0.11, 0.13]);
  }
  return layers;
}

// the route as drawable line segments [x,y,z,r,g,b ×2 per seg] — foamview's drawRoute, ported:
// road ribbons (centreline + rails + rungs) through the chamber centres + ramp foot/head posts.
function bakeRoute() {
  const route = city.route; if (!route) return new Float32Array(0);
  const cs = city.chambers, c = city.foam.cell, Ri = 250, segs = [];
  const seg = (a, b, col) => segs.push(a[0], a[1], a[2], col[0], col[1], col[2], b[0], b[1], b[2], col[0], col[1], col[2]);
  const ribbon = (cells, col) => {
    const P = cells.map((i) => cs[i]), half = 0.3 * c, dim = col.map((v) => v * 0.55);
    for (let k = 0; k < P.length - 1; k++) {
      const a = P[k], b = P[k + 1];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const thm = (a.th + b.th) / 2, rx = Math.cos(thm), ry = Math.sin(thm);
      let lx = ry * dz, ly = -rx * dz, lz = rx * dy - ry * dx;
      const ll = Math.hypot(lx, ly, lz); if (ll < 0.3) { lx = 0; ly = 0; lz = 1; } else { lx /= ll; ly /= ll; lz /= ll; }
      seg([a.x, a.y, a.z], [b.x, b.y, b.z], col);
      seg([a.x + lx * half, a.y + ly * half, a.z + lz * half], [b.x + lx * half, b.y + ly * half, b.z + lz * half], dim);
      seg([a.x - lx * half, a.y - ly * half, a.z - lz * half], [b.x - lx * half, b.y - ly * half, b.z - lz * half], dim);
      seg([a.x + lx * half, a.y + ly * half, a.z + lz * half], [a.x - lx * half, a.y - ly * half, a.z - lz * half], dim);
    }
  };
  ribbon(route.A.cells, [1.0, 0.82, 0.48]); ribbon(route.B.cells, [1.0, 0.6, 0.84]);
  for (const rd of route.roads) ribbon(rd.cells, [0.5, 1.0, 0.69]);
  const post = (i) => { const q = cs[i], r0 = Ri + q.rad - 1.4 * c, r1 = Ri + q.rad + 1.4 * c, ct = Math.cos(q.th), st = Math.sin(q.th); seg([r0 * ct, r0 * st, q.z], [r1 * ct, r1 * st, q.z], [1, 1, 1]); };
  for (const L of [route.A, route.B]) { post(L.cells[0]); post(L.cells[L.cells.length - 1]); }
  return new Float32Array(segs);
}

function build({ seed, n, opt }) {
  const genome = n > 0 ? rollGenome(n) : DEFAULT_GENOME;
  city = buildFoamCity({ ...(opt || {}), seed, genome });
  society = buildSociety(city, { seed, genome });
  metrics = socialMetrics(city, society);
  const score = scoreFoamSociety(city, scoreSociety(city, society, metrics));
  const N = city.chambers.length;
  const pos = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) { const q = city.chambers[i]; pos[3 * i] = q.x; pos[3 * i + 1] = q.y; pos[3 * i + 2] = q.z; }
  const owner = Int32Array.from(city.chamberOwner);
  const layers = bakeColors(), routeSegs = bakeRoute();
  // building billboards: centroid world position + glyph + a world-space radius for LOD gating
  const bill = city.places.map((p) => { const r = 250 + p.rad; return { x: r * Math.cos(p.th), y: r * Math.sin(p.th), z: p.zax, g: p.glyph, fp: p.footprint, road: !!p.onRoad }; });
  const m = (u) => Math.round(u * 20);
  const route = city.route;
  postMessage({
    type: 'city', seed, n, genome: { archetype: genome.archetype || 'wild type' },
    N, pos, owner, layers, routeSegs, bill,
    dims: { Ri: 250, T: 50, cell: city.foam.cell, Lx: city.foam.Lx, arcRad: city.foam.arcRad },
    stats: {
      buildings: city.places.length, row: city.rightOfWay.size, voids: city.voids,
      closure: city.closure, access: city.access, people: society.people.length,
      avgHats: society.avgHats, vitality: score.vitality, tier: score.tier,
      route: route ? `ramp A ${route.A.turns.toFixed(1)} turns · ${route.roads.length} roads · ramp B ${route.B.turns.toFixed(1)} turns · climbs ${m(Math.abs(route.A.climb))} m` : 'none found',
    },
  }, [pos.buffer, owner.buffer, layers.role.buffer, layers.footprint.buffer, layers.bridging.buffer, layers.access.buffer, routeSegs.buffer]);
}

function inspect(placeId) {
  const p = city.places[placeId]; if (!p) return;
  const mem = society.placeMembers.get(p.id) || [];
  const hatStr = (q) => q.hats.map((h) => (h.kind === 'work' ? h.role + (h.domain ? '·' + h.domain : '') : h.kind)).join(', ');
  const lines = mem.slice(0, 6).map((i) => `· ${society.people[i].name}: ${hatStr(society.people[i])}`);
  const b = metrics.bridging.get(p.id);
  const imp = p.role !== 'dwell' ? removeImpact(city, society, metrics, p.id) : null;
  postMessage({
    type: 'inspect', placeId,
    head: `${p.glyph} ${p.role}${p.domain ? '·' + p.domain : ''} — ${p.footprint} chambers · ${mem.length} ${mem.length === 1 ? 'person' : 'people'}${p.onRoad ? ' · ON THE ROAD' : ''}`,
    weave: (b && b.members >= 2) ? { v: b.bridging, label: b.bridging > 0.7 ? 'a BRIDGE (strangers meet)' : b.bridging < 0.35 ? 'a BOND (tight circle)' : 'mixed' } : null,
    people: lines, shock: imp,
    access: p.role === 'dwell' && isFinite(p.accessCost) ? p.accessCost : null,
  });
}

onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'build') build(msg);
    else if (msg.type === 'inspect') inspect(msg.placeId);
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
