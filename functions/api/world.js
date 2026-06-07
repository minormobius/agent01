// GET /api/world?seed=<int>&n=<cells>
//
// Permissionless world API. Runs the same mappa engine (engine.js — pure, no
// deps) server-side in a Pages Function and returns a generated planet as JSON:
// per-cell points (lon/lat), elevation, biome, water class, plus rivers and the
// biome legend. CORS-open and edge-cached, so anyone can pull a world into their
// own viewer. Deterministic: same seed ⇒ same world.
//
// n is capped while the engine's triangulation is JS (O(n²)); the Rust/WASM
// kernel will lift the ceiling. Until then this favours reliability over detail.
import { generateWorld, BIOMES } from '../../mappa/engine.js';

const R2D = 180 / Math.PI;
const q = (x, p = 100) => Math.round(x * p) / p;

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  let seed = parseInt(url.searchParams.get('seed') ?? '1', 10);
  if (!Number.isFinite(seed)) seed = 1;
  let n = parseInt(url.searchParams.get('n') ?? '1500', 10);
  n = Math.max(500, Math.min(2200, Number.isFinite(n) ? n : 1500));

  let w;
  try { w = generateWorld(seed >>> 0, { N: n }); }
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

  return json({
    api: 'mappa.world/v1',
    meta: w.meta,
    biomes: BIOMES.map(b => ({ id: b.id, name: b.name, color: [b.h, b.s, b.l] })),
    n: w.N,
    schema: { points: '[lon,lat] degrees', elev: 'shore=0', water: '0 land / 1 ocean / 2 lake', rivers: '[lon,lat,lon,lat,flow]' },
    points, elev, biome, water, rivers,
  });
};

// CORS preflight
export const onRequestOptions = async () => new Response(null, { headers: cors() });

const cors = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
});
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400', ...cors() },
  });
}
