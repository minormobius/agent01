// sprite.js — ISO CROP SPRITES. The vendored flora renderer draws botanically-shaped line art,
// which is right for the garden cross-section and unreadable at farm-game scale: from the top-down
// view every crop was a spindly wire. These are purpose-built farm sprites — chunky filled shapes,
// two-tone foliage with a highlight, a soil mound so a planting reads as PLANTED, and a fruit/
// flower pop as harvest nears — in the same flat-color language as the station huts.
//
// Identity still comes from the crop itself: silhouette from flora's growthForm (herb clump,
// stalk, grain sheaf, vine, shrub, rosette, reed, broadleaf) and every color from paletteOf,
// which keys off the crop's temperament and planet. Deterministic per (plant id, stage bucket):
// the same save renders the same field everywhere, and the iso raster cache stays valid.

import { descriptorForCrop, growthForm, paletteOf } from '../vendor/flora.js';
import { corrForCrop } from './render.js';

const _specs = new Map();   // cropId → { form, pal }
export function spriteSpec(crop) {
  if (!crop) return { form: 'herbClump', pal: paletteOf(descriptorForCrop({})) };
  let s = _specs.get(crop.id);
  if (!s) {
    const d = descriptorForCrop(crop, corrForCrop(crop));
    s = { form: growthForm(d), pal: paletteOf(d) };
    _specs.set(crop.id, s);
  }
  return s;
}

// ── tiny color kit ──
function shade(hex, f) {   // f<1 darkens, f>1 lightens toward white
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f <= 1) { r *= f; g *= f; b *= f; }
  else { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const rnd = (h, i) => (((h ^ Math.imul(i + 1, 0x9e3779b9)) >>> 8) % 1000) / 1000;

// silhouette envelope per form: [height, halfWidth] in u at full growth. Markers and hitboxes
// key off THIS (isoPlantMetrics), so the tap target is the sprite you see.
const ENVELOPE = {
  herbClump: [0.34, 0.24], stalk: [0.55, 0.17], grain: [0.5, 0.2], vine: [0.52, 0.2],
  shrub: [0.6, 0.24], rosette: [0.24, 0.26], reed: [0.62, 0.16], broadleaf: [0.46, 0.2],
};
export function isoPlantMetrics(form, stage, u) {
  const [eh, ew] = ENVELOPE[form] || ENVELOPE.herbClump;
  const grow = 0.3 + 0.7 * Math.min(1, stage + 0.08);
  return { h: eh * grow * u, halfW: Math.max(14, ew * grow * u + 8) };
}

// ── the sprite. g: 2d context. (ax, ay) = base anchor on the soil. u = plot-unit px. ──
export function drawIsoPlant(g, { form, pal, stage, ripe, seed, u, ax, ay }) {
  const H = hash(seed || 'p');
  const grow = 0.3 + 0.7 * Math.min(1, stage + 0.08);   // sprites are born small, never invisible
  const s = u * grow;
  const lean = (rnd(H, 0) - 0.5) * 0.14;                 // each plant stands its own way
  const leafD = shade(pal.leaf, 0.72), leafM = pal.leaf, leafH = pal.leafHi;
  const line = 'rgba(20,24,14,0.4)';

  g.save();
  g.translate(ax, ay);
  g.lineJoin = 'round'; g.lineWidth = Math.max(1, u * 0.012);

  // the soil mound — the thing that says "planted", not "weed"
  g.fillStyle = 'rgba(58,44,28,0.85)';
  g.beginPath(); g.ellipse(0, 0, u * 0.16, u * 0.062, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(94,72,44,0.9)';
  g.beginPath(); g.ellipse(0, -u * 0.012, u * 0.13, u * 0.045, 0, 0, 7); g.fill();

  g.rotate(lean);

  const blob = (x, y, rx, ry, fill) => {
    g.fillStyle = fill; g.strokeStyle = line;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); g.stroke();
  };
  // a fat leaf: teardrop from (0,0) toward angle a
  const leaf = (x, y, a, len, wid, fill) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = fill; g.strokeStyle = line;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-wid, -len * 0.55, 0, -len);
    g.quadraticCurveTo(wid, -len * 0.55, 0, 0);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
  };
  const stem = (x0, y0, x1, y1, w) => {
    g.strokeStyle = pal.stem; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = Math.max(1, u * 0.012);
  };
  // the harvest pop: berries/blooms in the crop's own color, brighter when ripe
  const dots = (pts, r) => {
    if (stage < 0.72) return;
    const col = ripe ? shade(pal.flower, 1.25) : pal.flower;
    for (const [x, y] of pts) {
      g.fillStyle = col; g.strokeStyle = line;
      g.beginPath(); g.arc(x, y, r * (ripe ? 1.25 : 1), 0, 7); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, 7); g.fill();
    }
  };

  if (stage < 0.14) {   // the sprout: two fat cotyledons — unmistakably a young planting
    stem(0, 0, 0, -s * 0.1, u * 0.02);
    leaf(0, -s * 0.09, -0.9, s * 0.13, s * 0.05, leafM);
    leaf(0, -s * 0.09, 0.9, s * 0.13, s * 0.05, leafH);
    g.restore(); return;
  }

  switch (form) {
    case 'shrub': {   // woody trunk + a full round canopy
      stem(0, 0, 0, -s * 0.3, u * 0.035);
      stem(0, -s * 0.18, s * 0.1, -s * 0.32, u * 0.024);
      const cy = -s * 0.42;
      blob(-s * 0.11, cy + s * 0.05, s * 0.15, s * 0.12, leafD);
      blob(s * 0.11, cy + s * 0.04, s * 0.14, s * 0.11, leafM);
      blob(0, cy - s * 0.05, s * 0.16, s * 0.13, leafM);
      blob(-s * 0.04, cy - s * 0.08, s * 0.1, s * 0.08, leafH);
      dots([[-s * 0.1, cy], [s * 0.09, cy - s * 0.06], [s * 0.02, cy + s * 0.08], [-s * 0.14, cy - s * 0.07]], s * 0.035);
      break;
    }
    case 'stalk': {   // one proud stem, paired leaves, crown on top
      stem(0, 0, 0, -s * 0.44, u * 0.03);
      leaf(0, -s * 0.16, -1.15, s * 0.2, s * 0.06, leafM);
      leaf(0, -s * 0.22, 1.15, s * 0.19, s * 0.06, leafD);
      leaf(0, -s * 0.3, -1.0, s * 0.16, s * 0.05, leafH);
      leaf(0, -s * 0.36, 0.95, s * 0.14, s * 0.045, leafM);
      blob(0, -s * 0.48, s * 0.07, s * 0.06, leafH);
      dots([[0, -s * 0.5], [-s * 0.05, -s * 0.44], [s * 0.05, -s * 0.45]], s * 0.032);
      break;
    }
    case 'grain': {   // the sheaf: fanned stalks with heavy golden heads
      const gold = stage > 0.6 ? '#d9b13f' : leafM, goldHi = stage > 0.6 ? '#f0d276' : leafH;
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.16 + (rnd(H, i) - 0.5) * 0.06;
        const tx = Math.sin(a) * s * 0.34, ty = -Math.cos(a) * s * 0.42;
        stem(0, 0, tx, ty, u * 0.018);
        g.save(); g.translate(tx, ty); g.rotate(a);
        g.fillStyle = i % 2 ? gold : goldHi; g.strokeStyle = line;
        g.beginPath(); g.ellipse(0, -s * 0.05, s * 0.03, s * 0.075, 0, 0, 7); g.fill(); g.stroke();
        g.restore();
      }
      leaf(0, -s * 0.06, -1.3, s * 0.18, s * 0.045, leafD);
      leaf(0, -s * 0.08, 1.3, s * 0.16, s * 0.045, leafM);
      break;
    }
    case 'vine': {   // a pole and a winding vine hung with fruit
      g.strokeStyle = '#6a5136'; g.lineWidth = u * 0.025; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.46); g.stroke();
      g.strokeStyle = pal.stem; g.lineWidth = u * 0.022;
      g.beginPath(); g.moveTo(-s * 0.06, 0);
      g.bezierCurveTo(s * 0.14, -s * 0.14, -s * 0.14, -s * 0.3, s * 0.05, -s * 0.44);
      g.stroke(); g.lineWidth = Math.max(1, u * 0.012);
      leaf(-s * 0.05, -s * 0.1, -1.2, s * 0.14, s * 0.055, leafM);
      leaf(s * 0.06, -s * 0.2, 1.2, s * 0.14, s * 0.055, leafD);
      leaf(-s * 0.05, -s * 0.3, -1.1, s * 0.13, s * 0.05, leafH);
      leaf(s * 0.04, -s * 0.4, 1.0, s * 0.12, s * 0.045, leafM);
      dots([[s * 0.09, -s * 0.14], [-s * 0.09, -s * 0.26], [s * 0.08, -s * 0.36]], s * 0.042);
      break;
    }
    case 'rosette': {   // fat radial leaves — the lettuce/agave read
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.42 + (rnd(H, i) - 0.5) * 0.1;
        leaf(0, 0, a + Math.PI / 2, s * (0.2 + rnd(H, i + 9) * 0.06), s * 0.07, i % 2 ? leafM : leafD);
      }
      blob(0, -s * 0.05, s * 0.08, s * 0.055, leafH);
      dots([[0, -s * 0.07]], s * 0.035);
      break;
    }
    case 'reed': {   // tall water-edge reeds, cattail heads
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.1 + (rnd(H, i) - 0.5) * 0.05;
        const tx = Math.sin(a) * s * 0.2, ty = -Math.cos(a) * s * 0.5 - rnd(H, i + 4) * s * 0.06;
        stem(0, 0, tx, ty, u * 0.016);
        g.fillStyle = i % 2 ? '#7a5a38' : '#8a6a44'; g.strokeStyle = line;
        g.beginPath(); g.ellipse(tx, ty - s * 0.03, s * 0.022, s * 0.06, a, 0, 7); g.fill(); g.stroke();
      }
      leaf(0, -s * 0.04, -1.35, s * 0.2, s * 0.035, leafM);
      leaf(0, -s * 0.04, 1.35, s * 0.18, s * 0.035, leafD);
      break;
    }
    case 'broadleaf': {   // one grand fan leaf on a stout stem
      stem(0, 0, 0, -s * 0.2, u * 0.03);
      leaf(0, -s * 0.18, -0.5, s * 0.3, s * 0.12, leafD);
      leaf(0, -s * 0.18, 0.45, s * 0.28, s * 0.11, leafM);
      leaf(0, -s * 0.2, 0, s * 0.32, s * 0.12, leafH);
      dots([[0, -s * 0.16]], s * 0.04);
      break;
    }
    default: {   // herbClump — a generous cushion of foliage
      blob(-s * 0.12, -s * 0.07, s * 0.13, s * 0.1, leafD);
      blob(s * 0.11, -s * 0.06, s * 0.12, s * 0.095, leafM);
      blob(0, -s * 0.14, s * 0.14, s * 0.11, leafM);
      blob(-s * 0.03, -s * 0.18, s * 0.09, s * 0.07, leafH);
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.5 + (rnd(H, i) - 0.5) * 0.2;
        leaf(0, -s * 0.1, a, s * (0.16 + rnd(H, i + 3) * 0.05), s * 0.05, i % 2 ? leafH : leafM);
      }
      dots([[-s * 0.1, -s * 0.12], [s * 0.08, -s * 0.16], [0, -s * 0.22]], s * 0.032);
    }
  }
  g.restore();
}

export default { spriteSpec, drawIsoPlant, isoPlantMetrics };
