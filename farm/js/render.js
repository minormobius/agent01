// render.js — CANVAS GLUE. Thin layer between the farm save and the vendored hoop renderers: build a
// flora model per plant (cached by growth bucket so we don't re-forage every frame), hand them to
// bed-render's cross-section, and translate clicks back into bed coordinates. No game rules here.

import { buildPlant, descriptorForCrop } from '../vendor/flora.js';
import { renderBed, screenToBed, pickPlant } from '../vendor/bed-render.js';
import { soilProps } from '../vendor/soil.js';
import { findReagent } from '../vendor/alchemy.js';
import { bedKeepouts, cropById, growthOf } from './state.js';

const modelCache = new Map();   // `${plantId}:${bucket}` → flora model
const corrCache = new Map();    // cropId → correspondence | null

export function corrForCrop(crop) {
  if (!crop) return null;
  if (!corrCache.has(crop.id)) corrCache.set(crop.id, findReagent(crop.sciName) || findReagent(crop.common) || null);
  return corrCache.get(crop.id);
}

// the model for one plant at its current stage (bucketed to 5% so growth animates without thrash)
export function modelFor(plant, crop, stage) {
  const bucket = Math.min(20, Math.floor(stage * 20));
  const key = plant.id + ':' + plant.seedId + ':' + bucket;
  if (!modelCache.has(key)) {
    const d = descriptorForCrop(crop, corrForCrop(crop));
    modelCache.set(key, buildPlant(d, { stage: Math.max(0.06, stage), seed: (plant.id + plant.seedId).split('').reduce((a, c) => a + c.charCodeAt(0), 7) }));
    if (modelCache.size > 300) { const first = modelCache.keys().next().value; modelCache.delete(first); }
  }
  return modelCache.get(key);
}

// draw the whole bed; returns the items array (with idx) so the caller can hit-test clicks.
export function drawFarm(canvas, farm, ark, now, tendCounts = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const items = farm.bed.plants.map((p, i) => {
    const crop = cropById(ark, p.seedId);
    const g = growthOf(farm, p, crop, now, tendCounts[p.id] || 0);
    return { x: p.x, y: p.y, model: crop ? modelFor(p, crop, g.stage) : null, ready: g.ready, idx: i, plantId: p.id };
  });
  renderBed(ctx, w, h, {
    keepouts: bedKeepouts(farm.bed.seed),
    items,
    seed: farm.bed.seed,
    soil: soilProps(0.42, 0.34, 0.24, 0.34),
  });
  return items;
}

export function clickToBed(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return { mx: ev.clientX - r.left, my: ev.clientY - r.top, ...screenToBed(canvas.clientWidth, canvas.clientHeight, ev.clientX - r.left, ev.clientY - r.top) };
}

export function hitPlant(canvas, items, mx, my) {
  return pickPlant(canvas.clientWidth, canvas.clientHeight, items, mx, my);
}

export default { drawFarm, clickToBed, hitPlant, modelFor, corrForCrop };
