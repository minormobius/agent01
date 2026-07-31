// bodyplan.js — the EQUIPPED-FIGURE substrate. A body plan is a set of REGIONS (convex polygons on a
// normalised 0..1 Vitruvian box) each owning an equip SLOT and an anchor. The page draws the figure as
// STAINED GLASS: every region is shattered into Voronoi shards (lead-came borders), tinted by whatever
// item is equipped into its slot. This file is the HOOK the user asked for — alternate body plans
// (two heads, wheels-for-legs, a shoulder cannon) are just new entries in BODY_PLANS with extra
// regions/slots; the tiler and the renderer consume any plan unchanged.
//
// Pure geometry + data: node-testable (shards are polygons, inside their region, > 0 per region).

import { clipCell } from './paint/voronoi.js';

// ── SLOTS — where an item can sit on a body. Plans expose a subset; alt plans add their own. ──────
export const SLOTS = {
  head:     { label: 'Head' },
  body:     { label: 'Body' },
  mainhand: { label: 'Main hand' },
  offhand:  { label: 'Off hand' },
  legs:     { label: 'Legs' },
  trinket:  { label: 'Worn' },
  mount:    { label: 'Mount' },      // shoulder cannon / back-rig — present only on plans that have it
};

// item KINGDOM → default slot; PHYLUM overrides where a kingdom spans slots (a shield ≠ a breastplate).
const SLOT_BY_KINGDOM = { strike: 'mainhand', craft: 'mainhand', ward: 'body', channel: 'mainhand', light: 'head', adorn: 'trinket', hold: 'trinket', lore: 'trinket', sustain: 'trinket', sound: 'offhand' };
const SLOT_BY_PHYLUM = { shield: 'offhand', worn: 'body', plate: 'body', focus: 'offhand', rod: 'mainhand', band: 'head', pendant: 'trinket', key: 'trinket' };
export function slotForItem(item) {
  if (!item) return 'trinket';
  return SLOT_BY_PHYLUM[item.phylum] || SLOT_BY_KINGDOM[item.kingdom] || 'trinket';
}

// ── BODY PLANS — the registry. Coordinates in a 0..1 box (x→right, y→down). Regions must be convex. ─
// `region.slot` ties a region to an equip slot; `anchor` is where the equipped item glyph rides.
// `tint` is the resting stained-glass hue (used when the slot is empty).
function humanoid() {
  return {
    id: 'humanoid', label: 'Humanoid',
    regions: [
      { id: 'head',  slot: 'head',     tint: '#5570d8', poly: [[.42, .04], [.58, .04], [.60, .17], [.50, .21], [.40, .17]], anchor: [.50, .11] },
      { id: 'torso', slot: 'body',     tint: '#7fd8d0', poly: [[.40, .24], [.60, .24], [.63, .50], [.50, .54], [.37, .50]], anchor: [.50, .38] },
      { id: 'rarm',  slot: 'mainhand', tint: '#cf3b3b', poly: [[.60, .25], [.78, .30], [.84, .42], [.74, .45], [.61, .38]], anchor: [.81, .40] },
      { id: 'larm',  slot: 'offhand',  tint: '#b39bd8', poly: [[.40, .25], [.22, .30], [.16, .42], [.26, .45], [.39, .38]], anchor: [.19, .40] },
      { id: 'rleg',  slot: 'legs',     tint: '#e0772f', poly: [[.50, .54], [.60, .52], [.58, .82], [.50, .92], [.49, .60]], anchor: [.55, .74] },
      { id: 'lleg',  slot: 'legs',     tint: '#e0772f', poly: [[.50, .54], [.40, .52], [.42, .82], [.50, .92], [.51, .60]], anchor: [.45, .74] },
      { id: 'heart', slot: 'trinket',  tint: '#f4bf62', poly: [[.46, .30], [.54, .30], [.55, .40], [.50, .43], [.45, .40]], anchor: [.50, .35] },
    ],
  };
}
export const BODY_PLANS = { humanoid: humanoid() };
export const defaultPlan = () => BODY_PLANS.humanoid;

// scaffold for alternate plans — extend, don't fork. e.g. registerPlan('quadruped', {...}) or add a
// 'mount' region for a shoulder cannon. The tiler/renderer read whatever regions/slots you declare.
export function registerPlan(id, plan) { BODY_PLANS[id] = { id, ...plan }; return BODY_PLANS[id]; }

// ── GEOMETRY ──────────────────────────────────────────────────────────────────────────────────
const centroidOf = (pts) => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };
function regionEdges(region) {           // inward-oriented half-planes (works for any convex region)
  const v = region.poly, c = centroidOf(v), edges = [];
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length]; let nx = -(b[1] - a[1]), ny = (b[0] - a[0]);
    if ((c[0] - a[0]) * nx + (c[1] - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
    edges.push({ ax: a[0], ay: a[1], nx, ny });
  }
  return edges;
}
const inRegion = (x, y, edges) => edges.every((e) => (x - e.ax) * e.nx + (y - e.ay) * e.ny >= -1e-9);
function clipToRegion(poly, edges) {     // Sutherland–Hodgman against each inward half-plane
  for (const e of edges) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[0] - e.ax) * e.nx + (a[1] - e.ay) * e.ny, db = (b[0] - e.ax) * e.nx + (b[1] - e.ay) * e.ny;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    poly = out; if (poly.length < 3) return poly;
  }
  return poly;
}
function bboxOf(pts) { let x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return { x0, y0, x1, y1 }; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── THE STAINED-GLASS TILER — region → Voronoi shards clipped to the region (the lead-came cells). ─
// `density` ≈ shards per region; each shard carries its region id + slot so the renderer can tint it.
export function glassTiling(plan, seed = 1, density = 7) {
  const rng = mulberry32((seed >>> 0) || 1), shards = [];
  for (const region of plan.regions) {
    const edges = regionEdges(region), bb = bboxOf(region.poly);
    const area = (bb.x1 - bb.x0) * (bb.y1 - bb.y0);
    const k = Math.max(2, Math.round(density * Math.sqrt(area) * 3.2));
    const seeds = [];
    let guard = 0;
    while (seeds.length < k && guard++ < k * 40) {
      const x = bb.x0 + rng() * (bb.x1 - bb.x0), y = bb.y0 + rng() * (bb.y1 - bb.y0);
      if (inRegion(x, y, edges)) seeds.push({ x, y });
    }
    for (const s of seeds) {
      let cell = clipCell(s, seeds.filter((o) => o !== s), 1.0);
      cell = clipToRegion(cell, edges);
      if (cell.length >= 3) shards.push({ region: region.id, slot: region.slot, seed: [s.x, s.y], poly: cell });
    }
  }
  return shards;
}

// ── EQUIP — auto-fit the best in-slot item from a pack onto a plan. Returns { slot: item }. ───────
export function autoEquip(plan, pack = []) {
  const slots = new Set(plan.regions.map((r) => r.slot)), equipped = {};
  for (const it of pack) {
    const sl = slotForItem(it); if (!slots.has(sl)) continue;
    if (!equipped[sl] || (it.worth || 0) > (equipped[sl].worth || 0)) equipped[sl] = it;
  }
  return equipped;
}

export default { BODY_PLANS, SLOTS, slotForItem, glassTiling, autoEquip, defaultPlan, registerPlan };
