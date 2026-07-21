// garden.js — the GROW half of the trade↔grow↔dwell triangle. Pure, no DOM, no LLM, data-injected
// (the ark is fetched by index.html and passed in, like food/nutrition.mjs). Deterministic, so a garden
// is the same on every machine and across atproto saves.
//
// MODEL (one bed, planted in CONTINUUM). A garden is a SINGLE BED — not a grid of slots — planted with
// many plants at free (x,y) positions in the bed's [0,1]² field. You PLANT a seed anywhere that's
// plantable: inside the bed margin, clear of the bed's KEEP-OUT ZONES (a trodden path, a pond, stones),
// and not crowding an existing plant (a minimum spacing, the footprint rule). A plant matures over its
// `growthDays` as resting in your dwelling advances the day; a ripe plant is HARVESTED for `yield` produce
// (into the pantry) + seed (to replant). The bed (plants + its seed for keep-out geometry) lives in the
// save. Keep-outs are DERIVED from the bed's seed (like the overworld's voronoi), so they aren't stored.

export const PLANTS_PER_BED = 16;          // the NPC-planted bed's target population
export const PLOTS_PER_GARDEN = PLANTS_PER_BED;   // legacy alias (older callers)
export const MIN_SPACING = 0.072;          // min normalized distance between two plants (footprint)
export const BED_MARGIN = 0.045;           // planting keeps this clear of the bed edge

export const cropById = (ark, id) => (ark && ark.cropIndex && ark.cropIndex[id]) || ((ark && ark.crops || []).find((c) => c.id === id)) || null;

// ── seeded RNG (mulberry32-ish), matching the rest of the grow stack ──
function rngFor(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// a fresh, empty bed (its seed fixes its keep-out layout for good).
export const emptyGarden = (seed = 1) => ({ seed: (seed >>> 0) || 1, plants: [], nextId: 0 });

// ── KEEP-OUT ZONES — derived from the bed's seed (a trodden path + a pond + a couple of stones) ──
// distance from point (px,py) to segment (a→b), all normalized.
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx, qy = ay + t * dy; return Math.hypot(px - qx, py - qy);
}
// bedKeepouts(seed) → { path:{pts,hw}, blobs:[{x,y,r,kind}] }. Deterministic; the same bed always has the
// same path, pond, and stones — so planting rules are stable across saves and machines.
export function bedKeepouts(seed) {
  const rng = rngFor(((seed >>> 0) || 1) ^ 0x9e37);
  // a winding path crossing the bed (left→right, gently waving), a strip you can't plant in.
  const y0 = 0.32 + rng() * 0.36, amp = 0.06 + rng() * 0.08, hw = 0.045 + rng() * 0.02;
  const pts = []; for (let i = 0; i <= 6; i++) { const x = i / 6; pts.push([x, clamp01(y0 + Math.sin(i * 0.9 + rng() * 0.5) * amp)]); }
  const blobs = [];
  // a pond in one corner-ish region
  blobs.push({ x: 0.16 + rng() * 0.16, y: 0.62 + rng() * 0.24, r: 0.1 + rng() * 0.05, kind: 'pond' });
  // one or two stones
  const stones = 1 + (rng() < 0.6 ? 1 : 0);
  for (let i = 0; i < stones; i++) blobs.push({ x: 0.55 + rng() * 0.36, y: 0.14 + rng() * 0.6, r: 0.045 + rng() * 0.035, kind: 'stone' });
  return { path: { pts, hw }, blobs };
}
// is (x,y) inside any keep-out zone?
export function inKeepout(keepouts, x, y) {
  if (!keepouts) return false;
  const { path, blobs } = keepouts;
  if (path && path.pts) for (let i = 0; i < path.pts.length - 1; i++) {
    const a = path.pts[i], b = path.pts[i + 1];
    if (distToSeg(x, y, a[0], a[1], b[0], b[1]) < path.hw) return true;
  }
  for (const bl of (blobs || [])) if ((x - bl.x) ** 2 + (y - bl.y) ** 2 < bl.r * bl.r) return true;
  return false;
}

// can a seed go in at (x,y)? inside the margin, clear of keep-outs, and not crowding an existing plant.
export function plantable(bed, x, y, keepouts) {
  if (!bed) return false;
  if (x < BED_MARGIN || x > 1 - BED_MARGIN || y < BED_MARGIN || y > 1 - BED_MARGIN) return false;
  if (inKeepout(keepouts || bedKeepouts(bed.seed), x, y)) return false;
  for (const p of bed.plants) if ((p.x - x) ** 2 + (p.y - y) ** 2 < MIN_SPACING * MIN_SPACING) return false;
  return true;
}

// plant `seedId` at (x,y) on `day` → a NEW bed (caller persists it). No-op copy if the spot isn't plantable.
export function plantAt(bed, x, y, seedId, day, keepouts) {
  const next = { seed: bed.seed, nextId: bed.nextId | 0, plants: bed.plants.slice() };
  if (!plantable(bed, x, y, keepouts)) return next;
  next.plants.push({ id: 'p' + next.nextId, x: +x.toFixed(4), y: +y.toFixed(4), seedId, day: day | 0 });
  next.nextId++;
  return next;
}

// growth of one plant: 0..1 stage, whether it's ready, days remaining. plant = { seedId, day }.
export function growth(plant, crop, day) {
  if (!plant || !crop) return { stage: 0, ready: false, daysLeft: 0 };
  const elapsed = Math.max(0, (day | 0) - (plant.day | 0));
  const need = Math.max(1, crop.growthDays | 0);
  const stage = Math.max(0, Math.min(1, elapsed / need));
  return { stage, ready: stage >= 1, daysLeft: Math.max(0, need - elapsed) };
}

// the indices of plants ready to harvest, given the ark + current day.
export function readyPlants(bed, ark, day) {
  const out = [];
  (bed && bed.plants || []).forEach((p, i) => { if (growth(p, cropById(ark, p.seedId), day).ready) out.push(i); });
  return out;
}

// harvest the plant at index `idx` if ready → { bed (plant removed), cropId, yield, seeds } or null. A
// harvest yields BOTH the ingredient (yield → pantry) AND seed (1–3, replant without a trade desk).
export function harvestPlant(bed, idx, ark, day) {
  const p = (bed && bed.plants || [])[idx]; if (!p) return null;
  const crop = cropById(ark, p.seedId); if (!crop) return null;
  if (!growth(p, crop, day).ready) return null;
  const plants = bed.plants.slice(); plants.splice(idx, 1);
  return { bed: { seed: bed.seed, nextId: bed.nextId | 0, plants }, cropId: crop.id, yield: crop.yield | 0, seeds: Math.max(1, Math.min(3, crop.yield | 0)) };
}

// the nearest plant to (x,y) within `reach` (normalized) → index, or -1 (for click-to-harvest / hover).
export function plantNear(bed, x, y, reach = MIN_SPACING) {
  let best = -1, bd = reach * reach;
  (bed && bed.plants || []).forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

// makeGarden — a random NPC-PLANTED bed (the first view a gardener tends): scatter ~count plants at
// plantable positions (rejection sampling, so they clear the keep-outs + each other), each planted at a
// staggered past DAY so the bed shows a natural mix of growth stages. Deterministic from (seed, day).
export function makeGarden(seed, ark, day = 0, { count = PLANTS_PER_BED } = {}) {
  const crops = (ark && ark.crops) || [];
  const bed = emptyGarden(seed);
  if (!crops.length) return bed;
  const rng = rngFor(bed.seed), keepouts = bedKeepouts(bed.seed);
  let tries = 0;
  while (bed.plants.length < count && tries < count * 40) {
    tries++;
    const x = BED_MARGIN + rng() * (1 - 2 * BED_MARGIN), y = BED_MARGIN + rng() * (1 - 2 * BED_MARGIN);
    if (!plantable(bed, x, y, keepouts)) continue;
    const crop = crops[Math.floor(rng() * crops.length)];
    const age = Math.floor(rng() * Math.max(1, (crop.growthDays | 0) * 1.35));   // staggered maturity
    bed.plants.push({ id: 'p' + bed.nextId, x: +x.toFixed(4), y: +y.toFixed(4), seedId: crop.id, day: (day | 0) - age });
    bed.nextId++;
  }
  return bed;
}

// a deterministic STARTER seed bag (so the garden is playable before the trade desk exists): pick `n`
// distinct crops from the ark by world seed, `each` seeds apiece. Favours faster crops so the first
// harvest comes quickly.
export function starterSeeds(worldSeed, ark, n = 3, each = 2) {
  const crops = (ark && ark.crops || []).slice().sort((a, b) => a.growthDays - b.growthDays || a.id.localeCompare(b.id));
  if (!crops.length) return {};
  const pool = crops.slice(0, Math.min(crops.length, 10));   // the fast tier
  const rng = rngFor(worldSeed);
  const bag = {}, used = new Set();
  for (let k = 0; k < n && used.size < pool.length; k++) {
    let i = Math.floor(rng() * pool.length), guard = 0;
    while (used.has(i) && guard++ < pool.length) i = (i + 1) % pool.length;
    used.add(i); bag[pool[i].id] = (bag[pool[i].id] || 0) + each;
  }
  return bag;
}
