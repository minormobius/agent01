// POST /markov-sample — exact i.i.d. samples from a 2-D Gaussian mixture.
//
// Body (JSON):
//   {
//     "components": [ { "mx":0, "my":0, "sx":1, "sy":1, "rot":0, "w":1 }, ... ],
//     "n": 1000,                 // sample count (default 1000, max 1,000,000)
//     "format": "json" | "csv"   // default "json"
//   }
// Each component is a Gaussian: centre (mx,my), axis std-devs (sx,sy), tilt `rot`
// radians, mixture weight `w`. A mixture is sampled EXACTLY — pick a component
// ∝ weight, draw from it — so the output is independent (i.i.d.), unlike MCMC.
//
// Companion to the /markov/ "metropolis" tab, which builds the same spec.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const MAX_N = 1_000_000;
const MAX_COMPONENTS = 500;

// Exact sampler — pure, exported for testing. `rng` defaults to Math.random.
export function sampleMixture(components, n, rng = Math.random) {
  const norm = components.map(c => ({
    mx: +c.mx || 0, my: +c.my || 0,
    sx: (c.sx ?? c.s ?? 1) > 0 ? +(c.sx ?? c.s ?? 1) : 1,
    sy: (c.sy ?? c.s ?? c.sx ?? 1) > 0 ? +(c.sy ?? c.s ?? c.sx ?? 1) : 1,
    rot: +c.rot || 0, w: Math.max(0, c.w == null ? 1 : +c.w),
  }));
  const total = norm.reduce((a, c) => a + c.w, 0) || 1;
  const cum = []; let s = 0;
  for (const c of norm) { s += c.w / total; cum.push(s); }
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out = new Array(n);
  for (let k = 0; k < n; k++) {
    const r = rng(); let ci = cum.length - 1;
    for (let i = 0; i < cum.length; i++) { if (r <= cum[i]) { ci = i; break; } }
    const c = norm[ci], a = gauss() * c.sx, b = gauss() * c.sy, co = Math.cos(c.rot), si = Math.sin(c.rot);
    out[k] = [c.mx + co * a - si * b, c.my + si * a + co * b];
  }
  return out;
}

function validate(spec) {
  if (!spec || typeof spec !== 'object') return 'body must be a JSON object';
  if (!Array.isArray(spec.components) || spec.components.length === 0) return 'components[] is required and non-empty';
  if (spec.components.length > MAX_COMPONENTS) return `too many components (max ${MAX_COMPONENTS})`;
  for (const c of spec.components) {
    if (!c || !isFinite(+c.mx) || !isFinite(+c.my)) return 'each component needs finite mx, my';
    const sx = c.sx ?? c.s, sy = c.sy ?? c.s;
    if (sx != null && !(+sx > 0)) return 'sx must be > 0';
    if (sy != null && !(+sy > 0)) return 'sy must be > 0';
    if (c.w != null && !(+c.w >= 0)) return 'w must be ≥ 0';
  }
  return null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestGet() {
  return json({
    service: 'markov-sample',
    method: 'POST',
    body: { components: [{ mx: 0, my: 0, sx: 1, sy: 1, rot: 0, w: 1 }], n: 1000, format: 'json | csv' },
    returns: 'exact i.i.d. samples from the 2-D Gaussian mixture',
    limits: { maxN: MAX_N, maxComponents: MAX_COMPONENTS },
    note: 'A Gaussian mixture is sampled exactly — no MCMC, no burn-in. Built for the /markov/ designer.',
  });
}

export async function onRequestPost({ request }) {
  let spec;
  try { spec = await request.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  const err = validate(spec);
  if (err) return json({ error: err }, 400);
  let n = Math.floor(+spec.n || 1000);
  if (!(n > 0)) n = 1000;
  if (n > MAX_N) n = MAX_N;
  const pts = sampleMixture(spec.components, n);
  const fmt = String(spec.format || 'json').toLowerCase();
  if (fmt === 'csv') {
    let out = 'x,y\n';
    for (const [x, y] of pts) out += x.toFixed(6) + ',' + y.toFixed(6) + '\n';
    return new Response(out, { headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="samples.csv"' } });
  }
  return json({ n, components: spec.components.length, samples: pts.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]) });
}
