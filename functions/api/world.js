// GET /api/world — pull a generated planet as JSON.
//
//   /api/world?seed=7&n=1800&radius=0.7&age=8&solar=1.1&water=22&ocean=65&plates=18&tilt=27
//
// Runs the dependency-free reference engine (mappa/engine.js) server-side and
// returns a complete, deterministic world: per-cell lon/lat, elevation, biome,
// water class, rivers, plate list + the full genome in `meta`. CORS-open and
// edge-cached, so anyone can permissionlessly pull a world into their own viewer.
//
// Determinism: same (seed + parameters + n) ⇒ same world, byte for byte. n is
// capped here because the reference engine's triangulation is JS O(n²); the
// browser viewer runs the Rust/WASM engine at much higher resolution.
import { generateWorld, BIOMES } from '../../mappa/engine.js';

const R2D = 180 / Math.PI;
const q = (x, p = 100) => Math.round(x * p) / p;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const has = k => url.searchParams.has(k);
  const num = (k, d) => { const v = parseFloat(url.searchParams.get(k)); return Number.isFinite(v) ? v : d; };

  let seed = parseInt(url.searchParams.get('seed') ?? '1', 10); if (!Number.isFinite(seed)) seed = 1;
  let n = clamp(Math.round(num('n', 1500)), 500, 2200);

  const opts = { N: n };
  if (has('ocean'))  opts.oceanFraction = clamp(num('ocean', 60) / 100, 0.20, 0.90); // % oceanic crust
  if (has('tilt'))   opts.axialTilt     = clamp(num('tilt', 23), 0, 45) * Math.PI / 180; // degrees
  if (has('water'))  opts.waterFrac     = clamp(num('water', 15) / 100, 0.02, 0.40); // % water volume
  if (has('plates')) opts.plateCount    = Math.round(clamp(num('plates', 16), 3, 60));
  if (has('solar'))  opts.solar         = clamp(num('solar', 1), 0.5, 1.8);  // stellar luminosity (1 = sun-like)
  if (has('radius')) opts.planetRadius  = clamp(num('radius', 1), 0.3, 3.0); // Earth radii
  if (has('age'))    opts.age           = Math.round(clamp(num('age', 4), 1, 20)); // geological epochs

  let w;
  try { w = generateWorld(seed >>> 0, opts); }
  catch (e) { return json({ error: 'generation failed', detail: String(e) }, 500); }

  const points = new Array(w.N), elev = new Array(w.N), biome = new Array(w.N), water = new Array(w.N);
  for (let i = 0; i < w.N; i++) {
    const v = w.V[i];
    points[i] = [q(Math.atan2(v[1], v[0]) * R2D), q(Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D)];
    elev[i] = q(w.elev[i], 1000); biome[i] = w.biome[i]; water[i] = w.water[i];
  }
  const rivers = w.rivers.map(r => {
    const a = r.a, b = r.b;
    return [q(Math.atan2(a[1], a[0]) * R2D), q(Math.asin(a[2]) * R2D),
            q(Math.atan2(b[1], b[0]) * R2D), q(Math.asin(b[2]) * R2D), Math.round(r.flow)];
  });
  const plates = w.plates.map(p => ({
    lon: q(Math.atan2(p.center[1], p.center[0]) * R2D), lat: q(Math.asin(p.center[2]) * R2D),
    oceanic: p.oceanic, speed: q(p.speed, 1000),
  }));

  return json({
    api: 'mappa.world/v1',
    meta: w.meta,            // seed + full genome: plateCount, oceanFraction, waterFrac, seaCoverage, axialTiltDeg, solar, planetRadius, age, ageSpan
    biomes: BIOMES.map(b => ({ id: b.id, name: b.name, color: [b.h, b.s, b.l] })),
    n: w.N,
    schema: { points: '[lon,lat] degrees', elev: 'shore=0, +land/−sea', water: '0 land / 1 ocean / 2 lake',
              rivers: '[lon,lat,lon,lat,flow] downstream segments', plates: 'Euler-pole plate centres' },
    points, elev, biome, water, rivers, plates,
  });
};

export const onRequestOptions = async () => new Response(null, { headers: cors() });
const cors = () => ({ 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' });
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400', ...cors() },
  });
}
