// flora.js — THE FLORA KERNEL. A pure, seeded, deterministic PLANT MODEL for the garden plot: given a
// crop/reagent descriptor + a growth stage, it grows a structured botanical skeleton (stems, leaves,
// flowers, fruit, and ROOTS below the soil line) that the plot renderer draws at yarrow-grade detail.
//
// This is the plants-first foundation of the garden-generation project (NPCs grow their own gardens, so
// it must be a pure function of (descriptor, stage, seed) — reproducible, portable, no DOM). It is the
// botanical cousin of worship/lib/stalk-render.js: that draws one yarrow stalk lavishly; this GROWS the
// plant's geometry so the renderer can draw any plant lavishly.
//
// Two ideas make the garden legible instead of a green smear:
//   1. GROWTH-FORM — the plant's silhouette is one of nine forms (herb-clump, stalk, rosette, shrub,
//      broadleaf, conifer, reed, vine, fungus-cap, grain), inferred from the organism. A radish is a
//      leaf rosette over a swollen root; a reed is blades; fly agaric is a capped stalk. No two forms
//      read alike.
//   2. THE GALENIC PALETTE — an alch reagent's colour comes from its temperament (the correspondence):
//      hot·dry reads warm & silver-spiky (choler/Fire), cold·moist lush blue-green (phlegm/Water),
//      cold·dry grey & low (melancholy/Earth), hot·moist bright & open (blood/Air). So the physic bed
//      is a spectrum of temperaments — the appearance IS the alchemy. Its planet tints the flower.
//
// Coordinates: origin at the plant's base on the soil surface; +y UP (shoot), −y DOWN (root); x centred;
// all in normalized "plot units" (~[-0.5,0.5] x, [−0.5, 1.2] y) the renderer scales to pixels. Pure,
// node-tested (test/flora.selftest.mjs). No randomness beyond the seeded PRNG.

// ── seeded PRNG (xmur3 → mulberry32, the repo's house family) ──
function xmur3(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rngFor = (s) => mulberry32(xmur3(String(s))());
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

// ── the Galenic palettes: temperament → colour language (from read/alch's four TEMPERAMENTS) ──
// stem/leaf/leafHi (lit edge)/flower defaults; a plant's planet overrides the flower accent below.
export const TEMPERAMENT_PALETTE = {
  'hot & dry':    { stem: '#8a6a3a', leaf: '#8fa06b', leafHi: '#c8d59a', flower: '#e6a13c', form: 'warm, silver-spiky (choler/Fire)' },
  'hot & moist':  { stem: '#5f7d3e', leaf: '#5fae52', leafHi: '#a6e08a', flower: '#e07aa0', form: 'bright & open (blood/Air)' },
  'cold & moist': { stem: '#4a7d63', leaf: '#4f9a86', leafHi: '#9fe0cf', flower: '#e8f0f6', form: 'lush blue-green (phlegm/Water)' },
  'cold & dry':   { stem: '#6a6f5a', leaf: '#7c8a72', leafHi: '#aab29a', flower: '#9a7fb0', form: 'grey & low (melancholy/Earth)' },
};
// planet → flower accent (the herb→planet bridge; the flower carries the ruling planet's colour)
export const PLANET_FLOWER = {
  Sun: '#f4c542', Moon: '#e8eef2', Mercury: '#c8d0d8', Venus: '#e78fb0', Mars: '#d9483b', Jupiter: '#5aa9e6', Saturn: '#7d6f86',
};
// non-alch crop palettes (staples/food have no correspondence — colour by crop kind)
const CROP_PALETTE = {
  grain:  { stem: '#c7a94e', leaf: '#b7b562', leafHi: '#e6d98a', flower: '#e8d27a' },
  legume: { stem: '#5f7d3e', leaf: '#63a256', leafHi: '#a6d68a', flower: '#f0f0f0' },
  root:   { stem: '#5f7d3e', leaf: '#6faa5a', leafHi: '#b6e090', flower: '#e9e6c0' },
  tuber:  { stem: '#5f7d3e', leaf: '#6faa5a', leafHi: '#b6e090', flower: '#f0c94a' },
  oil:    { stem: '#7d9a55', leaf: '#9ab06a', leafHi: '#d6e0a0', flower: '#f2e04a' },
  fruit:  { stem: '#6b4a2e', leaf: '#4f8a45', leafHi: '#9fd08a', flower: '#f6dfe8' },
  nut:    { stem: '#6b4a2e', leaf: '#4a7e42', leafHi: '#93c07e', flower: '#dfe0c0' },
  default:{ stem: '#5f7d3e', leaf: '#5fae52', leafHi: '#a6e08a', flower: '#eae4c6' },
};

// ── growth-form inference: an organism descriptor → one of nine silhouettes ──
// descriptor: { name, sciName?, kind?, guild?, qualities?, planet?, crop?, edible?, category?, reagentClass?, bands? }
const AROMATIC_SHRUB = /rue|wormwood|southernwood|lavender|hyssop|savin|sage|savory|rosemary|thyme|oregano/i;
const VINE = /gourd|melon|cucumber|pumpkin|squash|grape|hop/i;
const REEDY = /reed|cattail|rush|sedge|papyrus|iris|flag/i;
const EDIBLE_ROOTISH = /radish|parsnip|leek|onion|turnip|beet|carrot|garlic|celery/i;
export function growthForm(d) {
  const n = (d.name || '') + ' ' + (d.sciName || '');
  if (d.kind === 'fungus' || d.reagentClass === 'fungal') return 'fungusCap';
  if (/pine|conifer|spruce|fir|cedar/i.test(n)) return 'conifer';
  if (d.crop === 'fruit' || d.crop === 'nut') return 'broadleaf';        // any orchard tree
  if (d.crop === 'grain' || /barley|rye|wheat|oat|maize|sorghum/i.test(n)) return 'grain';
  if (d.crop === 'root' || d.crop === 'tuber' || (d.edible && EDIBLE_ROOTISH.test(n))) return 'rosette';  // roots BEFORE shrub
  if (VINE.test(n)) return 'vine';
  if (REEDY.test(n)) return 'reed';
  if (AROMATIC_SHRUB.test(n)) return 'shrub';                            // only the NAMED woody aromatics — not every hot·dry herb
  // the remaining soft physic herbs split by a stable per-plant roll: some clumps, some stalks
  return (rngFor(n + ':form')() < 0.4) ? 'stalk' : 'herbClump';
}

// the palette for a descriptor: correspondence first (alch reagents), else crop kind
export function paletteOf(d) {
  const base = (d.qualities && TEMPERAMENT_PALETTE[d.qualities]) || CROP_PALETTE[d.crop] || CROP_PALETTE.default;
  const flower = (d.planet && PLANET_FLOWER[d.planet]) || base.flower;
  return { stem: base.stem, leaf: base.leaf, leafHi: base.leafHi, flower, root: '#c9b48c' };
}

// ── the grower ──────────────────────────────────────────────────────────────────────────────────
// buildPlant(descriptor, { stage=1, seed=1 }) → the model the renderer draws (see header for shape).
export function buildPlant(d = {}, { stage = 1, seed = 1 } = {}) {
  stage = clamp01(stage);
  const form = growthForm(d);
  const pal = paletteOf(d);
  const R = rngFor((d.name || d.sciName || 'plant') + '#' + seed);
  const j = (amt) => (R() * 2 - 1) * amt;                       // symmetric jitter
  const flowering = stage > 0.55 && form !== 'reed' && form !== 'grain';
  const ripe = stage >= 0.95;
  const model = { id: d.id || null, name: d.name || d.sciName || 'plant', form, stage,
    stageLabel: stage < 0.15 ? 'sprout' : stage < 0.55 ? 'growing' : ripe ? 'ripe' : 'flowering',
    palette: pal, height: 0, spread: 0, rootDepth: 0,
    stems: [], leaves: [], flowers: [], fruits: [], roots: [], tuber: null, cap: null };

  // roots — every plant has them; depth/spread scale with stage. The below-soil half of the microscope.
  const rootDepth = model.rootDepth = lerp(0.05, form === 'rosette' ? 0.5 : form === 'broadleaf' || form === 'conifer' ? 0.7 : 0.35, stage);
  const rootN = 2 + Math.floor(R() * 3) + (form === 'broadleaf' ? 2 : 0);
  for (let i = 0; i < rootN; i++) {
    const a = lerp(-0.7, 0.7, i / Math.max(1, rootN - 1)) + j(0.15);
    model.roots.push({ x0: j(0.03), y0: 0, x1: Math.sin(a) * rootDepth * 0.8 + j(0.05), y1: -rootDepth * (0.6 + R() * 0.5), w0: 0.03, w1: 0.005 });
  }

  const H = (base, max) => (model.height = lerp(base, max, stage));
  const addStem = (x0, y0, x1, y1, w0, w1, bend) => model.stems.push({ x0, y0, x1, y1, w0, w1, bend: bend || 0 });
  const addLeaf = (x, y, len, wid, ang, side) => model.leaves.push({ x, y, len, wid, ang, curl: j(0.3), side });

  switch (form) {
    case 'fungusCap': {
      const h = H(0.06, 0.34), capR = lerp(0.04, 0.20, stage);
      addStem(0, 0, j(0.02), h, 0.05, 0.035, j(0.05));
      model.cap = { x: 0, y: h, r: capR, gills: 8 + Math.floor(R() * 8), warts: /amanita|agaric/i.test(model.name) };
      model.spread = capR * 2;
      break;
    }
    case 'broadleaf': case 'conifer': {
      const h = H(0.12, 1.15), trunkW = lerp(0.02, 0.09, stage);
      addStem(0, 0, j(0.03), h * 0.62, trunkW, trunkW * 0.6, j(0.04));   // trunk
      const tiers = form === 'conifer' ? 5 : 3, spread = model.spread = lerp(0.1, 0.62, stage);
      for (let t = 0; t < tiers; t++) {
        const ty = h * (0.55 + 0.4 * t / tiers), r = spread * (form === 'conifer' ? (1 - t / tiers) : (0.7 + 0.3 * R()));
        const nleaf = 10 + Math.floor(R() * 10);
        for (let i = 0; i < nleaf; i++) { const a = R() * Math.PI * 2; addLeaf(Math.cos(a) * r * R(), ty + Math.sin(a) * r * 0.5 * R(), lerp(0.04, 0.09, R()), 0.5, a, 0); }
      }
      if (ripe) { const nf = 3 + Math.floor(R() * 4); for (let i = 0; i < nf; i++) { const a = R() * Math.PI * 2; model.fruits.push({ x: Math.cos(a) * spread * 0.7, y: h * (0.6 + 0.3 * R()), r: lerp(0.02, 0.045, R()), ripe: true }); } }
      break;
    }
    case 'shrub': {
      const h = H(0.08, 0.42), nst = 3 + Math.floor(R() * 3); model.spread = lerp(0.08, 0.34, stage);
      for (let s = 0; s < nst; s++) { const lean = lerp(-0.28, 0.28, s / (nst - 1)) + j(0.06); addStem(j(0.03), 0, Math.sin(lean) * h * 0.7, h * (0.7 + 0.3 * R()), 0.02, 0.008, lean); }
      for (let i = 0; i < 14 + Math.floor(R() * 12); i++) { const sx = j(model.spread), sy = h * (0.3 + 0.65 * R()); addLeaf(sx, sy, lerp(0.03, 0.06, R()), 0.35, j(1.4), i % 2 ? 1 : -1); }
      if (flowering) for (let i = 0; i < 4 + Math.floor(R() * 6); i++) model.flowers.push({ x: j(model.spread * 0.9), y: h * (0.6 + 0.4 * R()), r: lerp(0.012, 0.024, R()), petals: 5, kind: 'floret' });
      break;
    }
    case 'reed': {
      const h = H(0.2, 1.0), nb = 4 + Math.floor(R() * 5); model.spread = 0.12;
      for (let b = 0; b < nb; b++) { const lean = j(0.18); addStem(j(0.06), 0, Math.sin(lean) * h * 0.5, h * (0.7 + 0.3 * R()), 0.012, 0.004, lean); }
      if (ripe) model.flowers.push({ x: j(0.03), y: h, r: 0.05, petals: 0, kind: 'spike' });   // a seed-head spike
      break;
    }
    case 'grain': {
      const h = H(0.18, 0.7), nb = 5 + Math.floor(R() * 6); model.spread = 0.14;
      for (let b = 0; b < nb; b++) { const lean = j(0.22); addStem(j(0.07), 0, Math.sin(lean) * h * 0.6, h * (0.75 + 0.25 * R()), 0.01, 0.004, lean); if (ripe) model.flowers.push({ x: Math.sin(lean) * h * 0.6, y: h * (0.8 + 0.2 * R()), r: 0.03, petals: 0, kind: 'ear' }); }
      break;
    }
    case 'vine': {
      const run = H(0.1, 0.5); model.spread = lerp(0.15, 0.7, stage);
      let px = 0, py = 0.02;
      const segs = 4 + Math.floor(stage * 6);
      for (let s = 0; s < segs; s++) { const nx = px + lerp(0.05, 0.14, R()) * (s % 2 ? 1 : -1), ny = py + j(0.03) + 0.01; addStem(px, py, nx, ny, 0.014, 0.01, j(0.2)); addLeaf(nx, ny, lerp(0.06, 0.11, R()), 0.8, j(1), s % 2 ? 1 : -1); px = nx; py = ny; }
      if (ripe) model.fruits.push({ x: px * 0.8, y: 0.02, r: lerp(0.05, 0.1, R()), ripe: true });   // the gourd/melon on the ground
      break;
    }
    case 'rosette': {   // leaf rosette over a swollen root — the microscope's payoff
      const h = H(0.06, 0.28); model.spread = lerp(0.08, 0.3, stage);
      const nl = 5 + Math.floor(R() * 4);
      for (let i = 0; i < nl; i++) { const a = -0.5 + i / (nl - 1); addLeaf(j(0.02), h * 0.1, lerp(0.08, 0.22, stage) * (0.8 + 0.3 * R()), 0.6, a * 1.4 + j(0.1), a < 0 ? -1 : 1); }
      model.tuber = { x: 0, y: -rootDepth * 0.5, r: lerp(0.02, 0.12, stage), kind: /onion|leek|garlic/i.test(model.name) ? 'bulb' : 'taproot' };
      if (flowering) model.flowers.push({ x: j(0.02), y: h * 1.4, r: 0.02, petals: 6, kind: 'umbel' });
      break;
    }
    case 'stalk': {
      const h = H(0.1, 0.7); model.spread = lerp(0.05, 0.2, stage);
      addStem(0, 0, j(0.04), h, 0.02, 0.008, j(0.1));
      const nl = 4 + Math.floor(stage * 6);
      for (let i = 0; i < nl; i++) { const y = h * (0.15 + 0.7 * i / nl); addLeaf(j(0.01), y, lerp(0.05, 0.11, stage) * (0.8 + 0.3 * R()), 0.4, (i % 2 ? 1 : -1) * lerp(0.6, 1.1, R()), i % 2 ? 1 : -1); }
      if (flowering) for (let i = 0; i < 3 + Math.floor(R() * 4); i++) model.flowers.push({ x: j(0.03), y: h * (0.9 + 0.12 * R()), r: lerp(0.014, 0.03, R()), petals: 5, kind: 'spike' });
      break;
    }
    default: {   // herbClump — several short stems, small leaves, tiny florets
      const h = H(0.06, 0.3), nst = 3 + Math.floor(R() * 4); model.spread = lerp(0.06, 0.26, stage);
      for (let s = 0; s < nst; s++) { const lean = lerp(-0.4, 0.4, s / (nst - 1)) + j(0.1); addStem(j(0.02), 0, Math.sin(lean) * h * 0.8, h * (0.7 + 0.3 * R()), 0.014, 0.006, lean); }
      for (let i = 0; i < 8 + Math.floor(R() * 8); i++) { const sx = j(model.spread), sy = h * (0.3 + 0.6 * R()); addLeaf(sx, sy, lerp(0.03, 0.055, R()), 0.4, j(1.3), i % 2 ? 1 : -1); }
      if (flowering) for (let i = 0; i < 3 + Math.floor(R() * 5); i++) model.flowers.push({ x: j(model.spread * 0.8), y: h * (0.6 + 0.4 * R()), r: lerp(0.01, 0.02, R()), petals: 5, kind: 'floret' });
    }
  }
  return model;
}

// a whole plot's worth of plants: descriptors[] + per-slot stage → an arrangement the renderer lays out.
// Deterministic from the plot seed; positions are jittered on a shallow grid so the bed reads planted.
export function buildPlotFlora(descriptors, { stages = [], seed = 1, cols = 3 } = {}) {
  const R = rngFor('plot#' + seed);
  return (descriptors || []).map((d, i) => {
    const st = stages[i] != null ? stages[i] : 1;
    const col = i % cols, row = Math.floor(i / cols);
    return { slot: i, col, row,
      x: (col + 0.5) / cols + (R() * 2 - 1) * 0.06,
      y: 0.35 + row * 0.42 + (R() * 2 - 1) * 0.04,
      plant: buildPlant(d, { stage: st, seed: seed * 131 + i }) };
  });
}

export default { TEMPERAMENT_PALETTE, PLANET_FLOWER, growthForm, paletteOf, buildPlant, buildPlotFlora };
