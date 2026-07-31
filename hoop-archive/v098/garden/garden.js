// garden.js — the GROW half of the trade↔grow↔dwell triangle. Pure, no DOM, no LLM, data-injected
// (the ark is fetched by index.html and passed in, like food/nutrition.mjs). Deterministic, so a garden
// is the same on every machine and across atproto saves.
//
// MODEL (sleep-driven). A garden fixture has PLOTS_PER_GARDEN slots. You PLANT a seed into a slot on a
// given DAY; the crop matures over its `growthDays`; resting in your dwelling advances the day, so the
// garden grows while you live. When a plot is ready you HARVEST it for `yield` units of produce into your
// pantry (eat raw now; the kitchen will cook it into recipes later). Plots and pantry live in the save.

export const PLOTS_PER_GARDEN = 6;

export const cropById = (ark, id) => (ark && ark.cropIndex && ark.cropIndex[id]) || ((ark && ark.crops || []).find((c) => c.id === id)) || null;

// a fresh, empty garden (all slots open).
export const emptyGarden = () => new Array(PLOTS_PER_GARDEN).fill(null);

// growth of one plot: 0..1 stage, whether it's ready, and days remaining. plot = { seedId, day }.
export function growth(plot, crop, day) {
  if (!plot || !crop) return { stage: 0, ready: false, daysLeft: 0 };
  const elapsed = Math.max(0, (day | 0) - (plot.day | 0));
  const need = Math.max(1, crop.growthDays | 0);
  const stage = Math.max(0, Math.min(1, elapsed / need));
  return { stage, ready: stage >= 1, daysLeft: Math.max(0, need - elapsed) };
}

// plant `seedId` into `slot` on `day` — returns a NEW plots array (caller persists it). Slot must be open.
export function plant(plots, slot, seedId, day) {
  const next = (plots || emptyGarden()).slice();
  if (slot < 0 || slot >= next.length || next[slot]) return next;   // occupied / out of range → no-op copy
  next[slot] = { seedId, day: day | 0 };
  return next;
}

// the slots whose crop is ready to harvest, given the ark + current day.
export function readySlots(plots, ark, day) {
  const out = [];
  (plots || []).forEach((p, i) => { if (p && growth(p, cropById(ark, p.seedId), day).ready) out.push(i); });
  return out;
}

// harvest `slot` if ready → { plots (slot cleared), cropId, yield } or null (not ready / empty).
export function harvest(plots, slot, ark, day) {
  const p = (plots || [])[slot]; if (!p) return null;
  const crop = cropById(ark, p.seedId); if (!crop) return null;
  if (!growth(p, crop, day).ready) return null;
  const next = plots.slice(); next[slot] = null;
  return { plots: next, cropId: crop.id, yield: crop.yield | 0 };
}

// a deterministic STARTER seed bag (so the garden is playable before the trade desk exists): pick `n`
// distinct crops from the ark by world seed, `each` seeds apiece. Favours faster crops so the first
// harvest comes quickly.
export function starterSeeds(worldSeed, ark, n = 3, each = 2) {
  const crops = (ark && ark.crops || []).slice().sort((a, b) => a.growthDays - b.growthDays || a.id.localeCompare(b.id));
  if (!crops.length) return {};
  const pool = crops.slice(0, Math.min(crops.length, 10));   // the fast tier
  let s = (worldSeed >>> 0) || 1;
  const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const bag = {}, used = new Set();
  for (let k = 0; k < n && used.size < pool.length; k++) {
    let i = Math.floor(rng() * pool.length), guard = 0;
    while (used.has(i) && guard++ < pool.length) i = (i + 1) % pool.length;
    used.add(i); bag[pool[i].id] = (bag[pool[i].id] || 0) + each;
  }
  return bag;
}
