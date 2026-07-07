// overworld.js — THE OVERWORLD KERNEL. The ship's outer grow-deck seen from above: a patch of the
// cylinder's inner surface where the whole curated ecology (over/ecology.js) grows WILD, across coherent
// terrain bands. This is the same flora the garden fixture grows — but here it's a landscape, not a plot:
// hundreds of plants scattered by a moisture+elevation field into meadows, groves, thickets, heath, reed
// fen and open water, each keeping the "soul of the plant" (its growth-form + Galenic palette) at a
// silhouette scale rather than the plot's full foraging model.
//
// PURE + DETERMINISM. No DOM. Everything derives from (seed): the terrain field, the scatter, the fauna.
// A given seed makes the same landscape on every machine — so an NPC's overworld (or a permalink) is
// stable, the same contract the ship engine and the garden hold. The renderer (over-render.js) only draws
// what makeOverworld() returns; the standalone /over page and the in-game ladder share this one kernel.
//
// THE TERRAIN THESIS, CARRIED UP. Lower decks read terrain from the foam; the overworld reads it from a
// field — but the idea is the same: terrain is defined by what grows on it. Two value-noise fields
// (elevation, moisture) → a band per point; each band draws from its own slice of the ecology palette
// (organismsInBand), so a wet hollow is reed fen and honeysuckle-thick grove, a dry rise is aromatic
// heath. The bands are the ecology's own BANDS, so the model that scores "does the farm close?" and the
// landscape you walk are the same taxonomy.

import { BANDS, ORGANISMS, organismsInBand } from './ecology.js';
import { growthForm } from '../garden/flora.js';

// ── seeded RNG (xmur3 → mulberry32), matching flora.js/garden.js so the whole grow stack shares one PRNG ──
function xmur3(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rngFor = (s) => mulberry32(xmur3(String(s))());
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ── deterministic value noise (a couple of octaves of hashed lattice + smooth interp) ──
function hash2(ix, iy, seed) { let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
function fbm(x, y, seed) { return vnoise(x, y, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, seed + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 19) * 0.1; }

// the surface bands the wild scatter can land in (physic is cultivated → folded into the beds, not wild;
// its herbs still appear because they also carry a wild band). Depth bands (chthonic) are under the soil,
// not shown from above; benthic shows as the open water at the bottom of a fen.
export const SURFACE_BANDS = ['heath', 'meadow', 'grove', 'thicket', 'fen', 'benthic'];

// bandAt — the terrain field → one band key. elevation carves water (benthic) → shallow (fen) → land;
// on land, moisture picks heath (dry) → meadow → grove → thicket (wet & dense). Deterministic per (x,y).
export function bandAt(x, y, seed, scale = 340) {
  const e = fbm(x / scale, y / scale, seed);              // elevation 0..1
  const m = fbm(x / (scale * 0.7) + 11, y / (scale * 0.7) + 5, seed + 101); // moisture 0..1
  if (e < 0.30) return 'benthic';                          // the lake bottom (open water)
  if (e < 0.40) return 'fen';                              // the reedy shallow margin
  if (m > 0.66) return 'thicket';
  if (m > 0.52) return 'grove';
  if (m > 0.34) return 'meadow';
  return 'heath';
}

// a descriptor a flora function (growthForm/paletteOf) can read, from an ecology organism.
export function descriptorForOrganism(o = {}) {
  return { name: o.common || o.id, sciName: o.sciName || '', crop: o.crop || null,
    qualities: o.qualities || null, planet: o.planet || null, edible: !!o.edible,
    reagentClass: o.reagentClass || null, kind: o.kind === 'producer' ? 'plant' : o.kind };
}

// per-form scatter footprint (world px radius at full size): trees claim space, herbs pack tight. This is
// the "give each plant a radius so they don't grow on top of each other" rule, at landscape scale.
const FORM_FOOT = { broadleaf: 46, conifer: 42, shrub: 20, vine: 22, reed: 10, grain: 9, stalk: 12, herbClump: 13, rosette: 12, fungusCap: 9 };
// per-form draw height (world px at full size) — trees tower, herbs are ankle-high.
const FORM_H = { broadleaf: 120, conifer: 128, shrub: 46, vine: 34, reed: 66, grain: 52, stalk: 50, herbClump: 30, rosette: 20, fungusCap: 20 };

// producers grouped by wild band (cached; the palette is static).
const _prodByBand = {};
function producersInBand(band) {
  if (_prodByBand[band]) return _prodByBand[band];
  const list = organismsInBand(band).filter((o) => o.kind === 'producer');
  return (_prodByBand[band] = list);
}

// makeOverworld(seed, opts) → the whole landscape, deterministically.
//   { seed, w, h, cell, bands:Uint8Array (coarse band grid), bandKeys, plants:[...], fauna:[...] }
// plants: { x, y, band, orgId, form, foot, h, size } — size is maturity 0.5..1 (wild stands are mature).
// fauna:  { x, y, orgId, plan, band, swarm } — light ambient life (bees over flowers, birds, a spider).
export function makeOverworld(seed = 1, { w = 1600, h = 1000, density = 1 } = {}) {
  const rng = rngFor('over:' + seed);
  seed = (seed >>> 0) || 1;

  // 1. coarse band grid (for the renderer's ground fill) — one band per `cell`×`cell` block.
  const cell = 32, cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const bands = new Uint8Array(cols * rows);
  const bandKeys = SURFACE_BANDS.slice();
  const bandIdx = Object.fromEntries(bandKeys.map((k, i) => [k, i]));
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const b = bandAt(gx * cell + cell / 2, gy * cell + cell / 2, seed);
    bands[gy * cols + gx] = bandIdx[b] ?? bandIdx.meadow;
  }
  const bandAtPx = (x, y) => bandKeys[bands[Math.min(rows - 1, Math.max(0, y / cell | 0)) * cols + Math.min(cols - 1, Math.max(0, x / cell | 0))]];

  // 2. scatter plants — jittered grid, trees first (big radius) then herbs, min-distance rejection so each
    //    plant keeps its footprint. Draw from the cell's band pool; skip water (benthic) — nothing grows on
    //    the open lake surface (its life is fauna: fish, mussels — placed below).
  const plants = [];
  const grid = 26 / Math.max(0.4, density);               // base scatter pitch (px)
  const placed = [];                                       // {x,y,r} for rejection
  const fits = (x, y, r) => { for (const p of placed) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < (p.r + r) * 0.55 * ((p.r + r) * 0.55)) return false; } return true; };
  // two passes: canopy (trees) sparse, then understory dense — so trees anchor and herbs infill around them.
  for (const pass of ['canopy', 'under']) {
    const step = pass === 'canopy' ? grid * 2.6 : grid;
    for (let y = step * 0.5; y < h; y += step) for (let x = step * 0.5; x < w; x += step) {
      const jx = x + (rng() - 0.5) * step * 0.9, jy = y + (rng() - 0.5) * step * 0.9;
      if (jx < 0 || jy < 0 || jx >= w || jy >= h) continue;
      const band = bandAtPx(jx, jy);
      if (band === 'benthic') continue;                    // open water — no rooted plants
      const pool = producersInBand(band);
      if (!pool.length) continue;
      const o = pool[(rng() * pool.length) | 0];
      const form = growthForm(descriptorForOrganism(o));
      const isTree = form === 'broadleaf' || form === 'conifer';
      if (pass === 'canopy' ? !isTree : isTree) continue;  // canopy pass places only trees; under-pass only non-trees
      const foot = (FORM_FOOT[form] || 14) * (0.8 + rng() * 0.5);
      if (!fits(jx, jy, foot)) continue;
      const size = 0.62 + rng() * 0.38;                    // wild stands run mature, with variation
      plants.push({ x: jx, y: jy, band, orgId: o.id, form, foot: Math.round(foot), h: Math.round((FORM_H[form] || 40) * size), size: +size.toFixed(3) });
      placed.push({ x: jx, y: jy, r: foot });
    }
  }
  // paint order: back-to-front by y (painter's algorithm), so nearer plants overlap farther ones.
  plants.sort((a, b) => a.y - b.y);

  // 3. light ambient fauna — a few readable creatures, drawn from the band's animal pool: bee swarms over
  //    flowering meadow/grove, a spider in the thicket, a bird or two, fish dots in the open water. Kept
  //    sparse — the plants are the point; the fauna are seasoning (and the sprite-pack hook for later).
  const fauna = [];
  const faunaTargets = Math.round((w * h) / 90000 * 3 * density);
  for (let i = 0; i < faunaTargets; i++) {
    const x = rng() * w, y = rng() * h, band = bandAtPx(x, y);
    const pool = organismsInBand(band).filter((o) => o.kind === 'animal');
    if (!pool.length) continue;
    const o = pool[(rng() * pool.length) | 0];
    fauna.push({ x, y, orgId: o.id, plan: o.plan || 'quad', band, swarm: !!o.swarm });
  }

  return { seed, w, h, cell, cols, rows, bands, bandKeys, plants, fauna };
}

// ── CHUNKED ROAM (the playable overworld) ─────────────────────────────────────────────────────────────
// makeOverworld() above is the whole-map STILL (the standalone /over page, the demo tour). The in-game
// overworld is instead ROAMED: an unbounded landscape streamed in CHUNKS around a walking player. A chunk
// is generated deterministically from (seed, cx, cy) — leave a chunk and return and it is byte-identical
// (roam-and-return), the same atproto/permalink contract the still-map holds. Terrain is the SAME global
// bandAt() field, so chunk seams are invisible. Ground is tiled with a VORONOI of a global jittered site
// grid (organic cells, seamless across chunks) instead of the still-map's square band grid.

export const CHUNK = 768;                 // world px per chunk edge
const SITE_PITCH = 132;                   // voronoi site spacing (world px)

// is a plant worth stopping to gather? (a reagent-herb, a crop, an edible) — the forage hook.
const gatherableOrg = (o) => !!(o && (o.harvestable || o.reagent || o.reagentClass || o.crop || o.edible));

// a GLOBAL jittered site grid → the same site for a given cell on every machine (so a chunk's voronoi
// meets its neighbour's exactly). Each site takes its band from the terrain field at its own position.
function siteFor(gi, gj, S) {
  const r = rngFor('site:' + S + ':' + gi + ':' + gj);
  const x = (gi + 0.5 + (r() - 0.5) * 0.72) * SITE_PITCH, y = (gj + 0.5 + (r() - 0.5) * 0.72) * SITE_PITCH;
  return { x, y, band: bandAt(x, y, S) };
}
// clip a convex polygon to the half-plane { p : nx·px + ny·py <= c } (Sutherland–Hodgman, one edge).
function clipHalf(poly, nx, ny, c) {
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0)) { const t = da / (da - db); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}
// voronoiCells(seed, x0, y0, size) → [{ band, poly:[[x,y]…], cx, cy }] partitioning the [x0,x0+size]² tile.
// Each site's cell is the tile rect clipped by the perpendicular bisector against every nearby site; the
// cells tile the chunk with no gaps or overlaps. Computed once per chunk (cached on the chunk), so drawing
// is just polygon fills — fast. Because sites are global + deterministic, cells match across chunk seams.
export function voronoiCells(seed, x0, y0, size, pitch = SITE_PITCH) {
  const S = (seed >>> 0) || 1;
  const gi0 = Math.floor((x0 - pitch) / pitch), gi1 = Math.ceil((x0 + size + pitch) / pitch);
  const gj0 = Math.floor((y0 - pitch) / pitch), gj1 = Math.ceil((y0 + size + pitch) / pitch);
  const sites = [];
  for (let gj = gj0; gj <= gj1; gj++) for (let gi = gi0; gi <= gi1; gi++) sites.push(siteFor(gi, gj, S));
  const rect = [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size]];
  const far2 = (2.6 * pitch) ** 2, cells = [];
  for (const s of sites) {
    if (s.x < x0 - pitch || s.x > x0 + size + pitch || s.y < y0 - pitch || s.y > y0 + size + pitch) continue;
    let poly = rect;
    for (const t of sites) {
      if (t === s) continue;
      const dx = t.x - s.x, dy = t.y - s.y; if (dx * dx + dy * dy > far2) continue;
      poly = clipHalf(poly, dx, dy, dx * (s.x + t.x) / 2 + dy * (s.y + t.y) / 2);
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) cells.push({ band: s.band, poly, cx: s.x, cy: s.y });
  }
  return cells;
}

// makeChunk(seed, cx, cy, opts) → one deterministic chunk of the roamed overworld.
//   { cx, cy, x0, y0, chunk, plants:[…], fauna:[…], cells:[…] }  (plants/fauna in WORLD coords)
// plants: { id, x, y, band, orgId, form, foot, h, size, gather } — gather=true if worth foraging.
// fauna:  { id, x, y, orgId, plan, band, swarm, fight } — fight=true for a swarm/predator (a bee to fight).
export function makeChunk(seed, cx, cy, { chunk = CHUNK, density = 1 } = {}) {
  const S = (seed >>> 0) || 1, x0 = cx * chunk, y0 = cy * chunk;
  const rng = rngFor('over:' + S + ':' + cx + ':' + cy);
  const plants = [], placed = [];
  const grid = 30 / Math.max(0.4, density);
  const fits = (x, y, r) => { for (const p of placed) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < (p.r + r) * 0.55 * ((p.r + r) * 0.55)) return false; } return true; };
  for (const pass of ['canopy', 'under']) {
    const step = pass === 'canopy' ? grid * 2.6 : grid;
    for (let y = y0 + step * 0.5; y < y0 + chunk; y += step) for (let x = x0 + step * 0.5; x < x0 + chunk; x += step) {
      const jx = x + (rng() - 0.5) * step * 0.9, jy = y + (rng() - 0.5) * step * 0.9;
      if (jx < x0 || jx >= x0 + chunk || jy < y0 || jy >= y0 + chunk) continue;   // keep plants in-rect (no seam double-density)
      const band = bandAt(jx, jy, S);
      if (band === 'benthic') continue;
      const pool = producersInBand(band); if (!pool.length) continue;
      const o = pool[(rng() * pool.length) | 0];
      const form = growthForm(descriptorForOrganism(o));
      const isTree = form === 'broadleaf' || form === 'conifer';
      if (pass === 'canopy' ? !isTree : isTree) continue;
      const foot = (FORM_FOOT[form] || 14) * (0.8 + rng() * 0.5);
      if (!fits(jx, jy, foot)) continue;
      const size = 0.62 + rng() * 0.38;
      plants.push({ id: cx + ':' + cy + ':' + plants.length, x: jx, y: jy, band, orgId: o.id, form, foot: Math.round(foot), h: Math.round((FORM_H[form] || 40) * size), size: +size.toFixed(3), gather: gatherableOrg(o) });
      placed.push({ x: jx, y: jy, r: foot });
    }
  }
  plants.sort((a, b) => a.y - b.y);
  const fauna = [];
  const n = Math.round((chunk * chunk) / 90000 * 3 * density);
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * chunk, y = y0 + rng() * chunk, band = bandAt(x, y, S);
    const pool = organismsInBand(band).filter((o) => o.kind === 'animal');
    if (!pool.length) continue;
    const o = pool[(rng() * pool.length) | 0];
    fauna.push({ id: cx + ':' + cy + ':f' + fauna.length, x, y, orgId: o.id, plan: o.plan || 'quad', band, swarm: !!o.swarm, fight: !!(o.swarm || o.plan === 'poly') });
  }
  return { cx, cy, x0, y0, chunk, plants, fauna, cells: voronoiCells(S, x0, y0, chunk) };
}

// is a world point walkable? (open water is not — you skirt the lake, you don't stroll on it.)
export const isWater = (x, y, seed) => bandAt(x, y, (seed >>> 0) || 1) === 'benthic';

// tiny lookups the renderer + page share
export const bandMeta = (key) => BANDS[key] || null;
export const organismById = (() => { const m = Object.fromEntries(ORGANISMS.map((o) => [o.id, o])); return (id) => m[id] || null; })();

export default { SURFACE_BANDS, bandAt, makeOverworld, makeChunk, voronoiCells, isWater, CHUNK, descriptorForOrganism, bandMeta, organismById };
