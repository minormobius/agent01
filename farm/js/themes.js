// themes.js — THE SKIN KERNEL. Pure, DOM-free, node-tested (test/themes.selftest.mjs).
//
// A skin is a complete look for the world: the iso ground palette (every tile kind, plus sky, fog
// and rim) and a few CSS accent variables for the chrome. Skins UNLOCK like everything else here —
// a live predicate over the save, rendered with the same ✓/✗ ladder as packs and techs — and the
// equipped skin is stored IN the plot record (`farm.skin`), so a visitor sees your farm wearing
// your skin: the look is part of the farm's public identity.
//
// Ground colors are { base:[r,g,b], amp } — the renderer adds its per-tile seeded variation r∈[0,1)
// as base + r*amp on each channel, which is what keeps tiles from banding. Every skin must define
// every KIND (themes.selftest enforces it), so the renderer never falls through to a default.

export const TILE_KINDS = ['meadow', 'soil', 'path', 'road', 'pond', 'stone', 'hill'];

export const SKINS = [
  {
    id: 'verdant', emoji: '🌿', name: 'Verdant', desc: 'the home look — green meadows, warm loam, living water',
    unlock: { label: 'yours from the start', test: () => true },
    ground: {
      sky: '#111608',
      meadow: { base: [52, 78, 42], amp: 12 },
      soil:   { base: [96, 68, 42], amp: 14 },
      path:   { base: [150, 132, 96], amp: 12 },
      road:   { base: [112, 106, 96], amp: 8 },
      pond:   { base: [40, 102, 140], amp: 10 },
      stone:  { base: [96, 68, 42], amp: 14 },
      hill:   { base: [76, 92, 54], amp: 10 },
      hillSkirtL: [52, 58, 40], hillSkirtR: [40, 46, 32],
      boulder: ['#7d766a', '#665f52'],
      furrow: 'rgba(0,0,0,0.18)',
      sheen: [190, 226, 240],
      rim: 'rgba(244,191,98,0.32)',
      survey: 'rgba(210,200,170,0.13)',
      fogSale: 'rgba(6,8,12,0.34)', fogFar: 'rgba(6,8,12,0.58)',
    },
    css: { '--gold': '#f7c66a', '--green': '#93e6a4', '--canvasline': '#2b2417' },
  },
  {
    id: 'harvest', emoji: '🍂', name: 'Harvest', desc: 'late September forever — stubble gold and cider light',
    unlock: { label: 'bring in 25 harvests', test: (f) => (f.stats && f.stats.harvests | 0) >= 25 },
    ground: {
      sky: '#171106',
      meadow: { base: [104, 82, 38], amp: 14 },
      soil:   { base: [112, 66, 34], amp: 14 },
      path:   { base: [170, 142, 96], amp: 12 },
      road:   { base: [122, 108, 88], amp: 8 },
      pond:   { base: [54, 92, 116], amp: 10 },
      stone:  { base: [112, 66, 34], amp: 14 },
      hill:   { base: [124, 100, 48], amp: 12 },
      hillSkirtL: [84, 66, 34], hillSkirtR: [66, 52, 28],
      boulder: ['#8a7a62', '#6e6050'],
      furrow: 'rgba(40,20,0,0.2)',
      sheen: [220, 220, 190],
      rim: 'rgba(255,196,90,0.4)',
      survey: 'rgba(230,200,150,0.14)',
      fogSale: 'rgba(12,8,4,0.34)', fogFar: 'rgba(12,8,4,0.58)',
    },
    css: { '--gold': '#ffbe55', '--green': '#d8c568', '--canvasline': '#332512' },
  },
  {
    id: 'seaside', emoji: '🌊', name: 'Seaside', desc: 'salt-grass, pale sand paths and honest blue water',
    unlock: { label: 'own 4 parcels', test: (f) => (f.parcels || []).length >= 4 },
    ground: {
      sky: '#0a1216',
      meadow: { base: [58, 96, 74], amp: 12 },
      soil:   { base: [110, 88, 60], amp: 12 },
      path:   { base: [184, 168, 132], amp: 10 },
      road:   { base: [124, 122, 114], amp: 8 },
      pond:   { base: [28, 118, 152], amp: 12 },
      stone:  { base: [110, 88, 60], amp: 12 },
      hill:   { base: [78, 104, 84], amp: 10 },
      hillSkirtL: [54, 70, 60], hillSkirtR: [42, 56, 48],
      boulder: ['#8b8d86', '#6d6f68'],
      furrow: 'rgba(0,10,10,0.18)',
      sheen: [200, 240, 250],
      rim: 'rgba(140,220,230,0.35)',
      survey: 'rgba(180,220,220,0.12)',
      fogSale: 'rgba(4,10,14,0.34)', fogFar: 'rgba(4,10,14,0.58)',
    },
    css: { '--gold': '#7fd4dc', '--green': '#9be6b4', '--canvasline': '#16282c' },
  },
  {
    id: 'umbra', emoji: '🕯️', name: 'Umbra', desc: 'the old muted earth — the farm as it looked before the light came in',
    unlock: { label: 'reach mine depth 12', test: (f) => (f.mine && f.mine.depth | 0) >= 12 },
    ground: {
      sky: '#0b0906',
      meadow: { base: [26, 34, 20], amp: 8 },
      soil:   { base: [56, 41, 26], amp: 14 },
      path:   { base: [96, 82, 58], amp: 12 },
      road:   { base: [72, 68, 62], amp: 8 },
      pond:   { base: [20, 52, 72], amp: 6 },
      stone:  { base: [56, 41, 26], amp: 14 },
      hill:   { base: [52, 56, 40], amp: 10 },
      hillSkirtL: [38, 40, 30], hillSkirtR: [30, 32, 24],
      boulder: ['#6b6455', '#575044'],
      furrow: 'rgba(0,0,0,0.22)',
      sheen: [180, 220, 235],
      rim: 'rgba(244,191,98,0.28)',
      survey: 'rgba(200,190,160,0.12)',
      fogSale: 'rgba(5,6,10,0.38)', fogFar: 'rgba(5,6,10,0.62)',
    },
    css: { '--gold': '#f4bf62', '--green': '#8fe0a0', '--canvasline': '#241d14' },
  },
  {
    id: 'rose', emoji: '🌸', name: 'Rose Dawn', desc: 'the alchemist’s hour — violet water and first-light soil',
    unlock: { label: 'brew a grade-A preparation', test: (f) => f.stats && (f.stats.bestGrade === 'A' || f.stats.bestGrade === 'S') },
    ground: {
      sky: '#150a12',
      meadow: { base: [78, 62, 74], amp: 12 },
      soil:   { base: [104, 64, 68], amp: 12 },
      path:   { base: [168, 128, 138], amp: 10 },
      road:   { base: [116, 100, 110], amp: 8 },
      pond:   { base: [74, 62, 136], amp: 12 },
      stone:  { base: [104, 64, 68], amp: 12 },
      hill:   { base: [96, 76, 92], amp: 10 },
      hillSkirtL: [66, 52, 64], hillSkirtR: [52, 40, 50],
      boulder: ['#8a7684', '#6c5a68'],
      furrow: 'rgba(20,0,20,0.2)',
      sheen: [230, 200, 240],
      rim: 'rgba(226,140,200,0.38)',
      survey: 'rgba(220,180,210,0.13)',
      fogSale: 'rgba(10,4,10,0.34)', fogFar: 'rgba(10,4,10,0.58)',
    },
    css: { '--gold': '#e89ac8', '--green': '#b8a0e8', '--canvasline': '#2b1826' },
  },
  {
    id: 'gilt', emoji: '👑', name: 'Gilt', desc: 'money looks good on you — lacquer black and beaten gold',
    unlock: { label: 'hold 1000◈ at once', test: (f) => (f.coins | 0) >= 1000 },
    ground: {
      sky: '#131006',
      meadow: { base: [74, 68, 38], amp: 12 },
      soil:   { base: [94, 76, 30], amp: 12 },
      path:   { base: [196, 164, 92], amp: 12 },
      road:   { base: [130, 118, 90], amp: 8 },
      pond:   { base: [58, 82, 96], amp: 8 },
      stone:  { base: [94, 76, 30], amp: 12 },
      hill:   { base: [104, 92, 46], amp: 10 },
      hillSkirtL: [70, 62, 32], hillSkirtR: [56, 50, 26],
      boulder: ['#948660', '#766a4c'],
      furrow: 'rgba(30,20,0,0.22)',
      sheen: [255, 236, 180],
      rim: 'rgba(255,214,110,0.5)',
      survey: 'rgba(240,210,140,0.16)',
      fogSale: 'rgba(10,8,2,0.34)', fogFar: 'rgba(10,8,2,0.58)',
    },
    css: { '--gold': '#ffd66e', '--green': '#e6d493', '--canvasline': '#3a2f14' },
  },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
export const skinUnlocked = (farm, id) => { const s = skinById(id); try { return !!s.unlock.test(farm); } catch (e) { return false; } };
export const currentSkin = (farm) => {
  const id = (farm && farm.skin) || 'verdant';
  return skinUnlocked(farm, id) ? skinById(id) : SKINS[0];   // a save claiming a skin it hasn't earned renders default
};

// equip — pure mutator in the house style (clone, guard, stamp)
export function setSkin(farm, id, now) {
  if (!SKINS.some((s) => s.id === id)) return { ok: false, reason: 'no such skin' };
  if (!skinUnlocked(farm, id)) return { ok: false, reason: 'not unlocked: ' + skinById(id).unlock.label };
  const next = JSON.parse(JSON.stringify(farm));
  next.skin = id;
  next.updatedAt = now;
  return { ok: true, farm: next, skin: skinById(id) };
}

// renderer helpers: the per-tile fill (base + seeded variation) and derived strings
export const groundFill = (g, kind, r) => {
  const c = g[kind];
  return `rgb(${c.base[0] + r * c.amp | 0},${c.base[1] + r * c.amp | 0},${c.base[2] + r * c.amp | 0})`;
};
export const rgba = (arr, a) => `rgba(${arr[0]},${arr[1]},${arr[2]},${a})`;

export default { SKINS, TILE_KINDS, skinById, skinUnlocked, currentSkin, setSkin, groundFill, rgba };
