// over-render.js — the OVERWORLD renderer. Draws what makeOverworld() lays out: the terrain bands as a
// lit ground, then every plant as a SILHOUETTE keyed to its growth-form and coloured by its Galenic
// palette (paletteOf, shared with the garden plot). This is the "soul of the plant" at landscape scale —
// a broadleaf reads as a tree, a fennel as a feathery umbellifer, an aromatic as a grey-green mound, a
// reed as blue blades — without the plot's expensive foraging model. Canvas2D, camera-aware, fast enough
// to draw hundreds of plants a frame.
//
// Camera: { x, y, z } — world px at the top-left, and a zoom. drawOverworld culls to the viewport.

import { paletteOf } from '../garden/flora.js';
import { descriptorForOrganism, organismById, bandMeta } from './overworld.js';

// ── terrain tints: each band a lit ground colour (top = surface light, bottom = shade) ──
const BAND_TINT = {
  heath:   ['#b7a86a', '#8f8047'],   // dry warm scrub
  meadow:  ['#8fbf5e', '#5f9440'],   // bright herb-grass
  grove:   ['#6fae55', '#3f7a3a'],   // orchard green
  thicket: ['#4f7e46', '#2c5230'],   // dark wet wood
  fen:     ['#6e9a72', '#3f6a5c'],   // reedy muddy shallow
  benthic: ['#39627e', '#1d3c54'],   // open water
};
const SKY = ['#1a2531', '#0d1620'];

// palette + descriptor cache, keyed by organism id (static palette, computed once)
const _pal = {};
function palFor(orgId) {
  if (_pal[orgId]) return _pal[orgId];
  const o = organismById(orgId) || {};
  return (_pal[orgId] = paletteOf(descriptorForOrganism(o)));
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = clamp(((n >> 16) & 255) * f | 0, 0, 255), g = clamp(((n >> 8) & 255) * f | 0, 0, 255), b = clamp((n & 255) * f | 0, 0, 255); return `rgb(${r},${g},${b})`; }

// ── ground: fill the coarse band grid, lit + softened; water gets a shimmer band ──
function drawGround(ctx, W, H, world, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, SKY[0]); g.addColorStop(1, SKY[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const { cell, cols, rows, bands, bandKeys } = world, z = cam.z;
  const c = cell * z;
  const gx0 = Math.max(0, Math.floor(cam.x / cell)), gy0 = Math.max(0, Math.floor(cam.y / cell));
  const gx1 = Math.min(cols, Math.ceil((cam.x + W / z) / cell)), gy1 = Math.min(rows, Math.ceil((cam.y + H / z) / cell));
  for (let gy = gy0; gy < gy1; gy++) for (let gx = gx0; gx < gx1; gx++) {
    const key = bandKeys[bands[gy * cols + gx]]; const tint = BAND_TINT[key] || BAND_TINT.meadow;
    const sx = (gx * cell - cam.x) * z, sy = (gy * cell - cam.y) * z;
    // vertical lerp of the tint by row fraction, plus a hashed jitter so the ground isn't flat
    const t = gy / rows, jit = ((gx * 73 ^ gy * 179) & 7) / 7 * 0.08 - 0.04;
    ctx.fillStyle = shade(tint[0], (1 - t) * (1 + jit) + t * 0.72 + jit);
    ctx.fillRect(sx - 0.5, sy - 0.5, c + 1, c + 1);
  }
}

// ── the plant silhouettes, one per growth-form ──
function tree(ctx, x, y, hgt, foot, pal, conifer, seed) {
  const w = foot * 1.6, trunkH = hgt * (conifer ? 0.22 : 0.34), canopyH = hgt - trunkH;
  ctx.strokeStyle = pal.stem; ctx.lineWidth = Math.max(1.5, foot * 0.16); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - trunkH); ctx.stroke();
  if (conifer) {
    const tiers = 4; for (let i = 0; i < tiers; i++) {
      const ty = y - trunkH - (canopyH * i) / tiers, tw = w * (1 - i / (tiers + 0.5)) * 0.62, th = canopyH / tiers * 1.5;
      ctx.fillStyle = shade(pal.leaf, 0.9 + (i % 2) * 0.14);
      ctx.beginPath(); ctx.moveTo(x - tw, ty); ctx.lineTo(x, ty - th); ctx.lineTo(x + tw, ty); ctx.closePath(); ctx.fill();
    }
  } else {
    const cy = y - trunkH - canopyH * 0.42, r = w * 0.5;
    // a canopy of overlapping leaf-blobs (dappled), plus highlights
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + seed, rr = r * (0.5 + ((seed * (i + 3)) % 10) / 20);
      const bx = x + Math.cos(a) * r * 0.42, by = cy + Math.sin(a) * r * 0.32;
      ctx.fillStyle = shade(pal.leaf, 0.82 + (i % 3) * 0.12);
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = pal.leafHi;
    ctx.beginPath(); ctx.arc(x - r * 0.2, cy - r * 0.25, r * 0.4, 0, Math.PI * 2); ctx.fill();
  }
}
function tuft(ctx, x, y, hgt, foot, pal, blades, flower, seed) {
  ctx.strokeStyle = pal.leaf; ctx.lineWidth = Math.max(0.8, foot * 0.12); ctx.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    const t = blades === 1 ? 0.5 : i / (blades - 1), ang = (t - 0.5) * 1.5, len = hgt * (0.7 + ((seed * (i + 1)) % 7) / 20);
    ctx.strokeStyle = shade(pal.leaf, 0.85 + (i % 2) * 0.2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(ang) * len * 0.4, y - len * 0.6, x + Math.sin(ang) * len, y - len); ctx.stroke();
  }
  if (flower) { ctx.fillStyle = pal.flower; const fy = y - hgt * 0.9; ctx.beginPath(); ctx.arc(x, fy, Math.max(1.4, foot * 0.18), 0, Math.PI * 2); ctx.fill(); }
}
function grainSheaf(ctx, x, y, hgt, foot, pal, seed) {
  ctx.strokeStyle = shade(pal.stem, 1.05); ctx.lineWidth = Math.max(0.8, foot * 0.14); ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) { const dx = (i - 2) * foot * 0.28, h = hgt * (0.86 + ((seed * (i + 2)) % 6) / 30);
    ctx.beginPath(); ctx.moveTo(x + dx * 0.3, y); ctx.lineTo(x + dx, y - h); ctx.stroke();
    ctx.fillStyle = pal.flower; ctx.beginPath(); ctx.ellipse(x + dx, y - h, foot * 0.16, h * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
}
function reeds(ctx, x, y, hgt, foot, pal, seed) {
  ctx.strokeStyle = shade(pal.leaf, 0.95); ctx.lineWidth = Math.max(0.9, foot * 0.2); ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const dx = (i - 1.5) * foot * 0.4, h = hgt * (0.8 + ((seed * (i + 1)) % 8) / 24);
    ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.quadraticCurveTo(x + dx + foot * 0.3, y - h * 0.6, x + dx + foot * 0.5, y - h); ctx.stroke(); }
}
function moundShrub(ctx, x, y, hgt, foot, pal, flower, seed) {
  const r = foot * 0.95;
  for (let i = 0; i < 5; i++) { const a = seed + i, bx = x + Math.cos(a) * r * 0.4, by = y - hgt * 0.4 + Math.sin(a) * r * 0.24;
    ctx.fillStyle = shade(pal.leaf, 0.82 + (i % 2) * 0.18); ctx.beginPath(); ctx.arc(bx, by, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
  if (flower) { ctx.fillStyle = pal.flower; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (i - 1) * r * 0.4, y - hgt * 0.7, Math.max(1.2, foot * 0.12), 0, Math.PI * 2); ctx.fill(); } }
}
function rosette(ctx, x, y, foot, pal, seed) {
  ctx.strokeStyle = pal.leaf; ctx.lineWidth = Math.max(1, foot * 0.18); ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + seed, len = foot * (0.7 + ((seed * (i + 1)) % 5) / 14);
    ctx.strokeStyle = shade(pal.leaf, 0.8 + (i % 3) * 0.12);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5); ctx.stroke(); }
}
function fungusCap(ctx, x, y, foot, pal) {
  ctx.fillStyle = '#e9e0cf'; ctx.fillRect(x - foot * 0.12, y - foot * 0.5, foot * 0.24, foot * 0.5);
  ctx.fillStyle = pal.flower || '#c34f3a'; ctx.beginPath(); ctx.ellipse(x, y - foot * 0.5, foot * 0.5, foot * 0.34, 0, Math.PI, 0); ctx.fill();
}

function drawPlant(ctx, p, sx, sy, z) {
  const pal = palFor(p.orgId), hgt = p.h * z, foot = Math.max(2, p.foot * z), seed = ((p.x * 13 + p.y * 7) | 0) % 100 / 12;
  // soft contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(sx, sy, foot * 0.8, foot * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  switch (p.form) {
    case 'broadleaf': tree(ctx, sx, sy, hgt, foot, pal, false, seed); break;
    case 'conifer':   tree(ctx, sx, sy, hgt, foot, pal, true, seed); break;
    case 'grain':     grainSheaf(ctx, sx, sy, hgt, foot, pal, seed); break;
    case 'reed':      reeds(ctx, sx, sy, hgt, foot, pal, seed); break;
    case 'shrub':     moundShrub(ctx, sx, sy, hgt, foot, pal, true, seed); break;
    case 'vine':      moundShrub(ctx, sx, sy, hgt * 0.7, foot, pal, false, seed); break;
    case 'rosette':   rosette(ctx, sx, sy, foot, pal, seed); break;
    case 'fungusCap': fungusCap(ctx, sx, sy, foot, pal); break;
    default:          tuft(ctx, sx, sy, hgt, foot, pal, p.form === 'stalk' ? 3 : 5, true, seed); break;   // herbClump / stalk
  }
}

// ── fauna glyphs (light): a swarm is a cluster of dots, a spider a legged blob, a bird a chevron ──
function drawFauna(ctx, f, sx, sy, z) {
  if (f.swarm) { ctx.fillStyle = 'rgba(240,220,120,0.9)'; for (let i = 0; i < 6; i++) { const a = f.x + i * 1.7, r = 6 * z; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r, sy + Math.sin(a * 1.3) * r * 0.7, Math.max(0.8, 1.2 * z), 0, Math.PI * 2); ctx.fill(); } return; }
  if (f.plan === 'quad' && (f.band === 'meadow' || f.band === 'heath' || f.band === 'grove' || f.band === 'thicket')) { // bird chevron aloft
    ctx.strokeStyle = 'rgba(30,30,36,0.7)'; ctx.lineWidth = Math.max(1, 1.4 * z); ctx.beginPath(); const w = 5 * z; ctx.moveTo(sx - w, sy - 8 * z); ctx.lineTo(sx, sy - 10 * z); ctx.lineTo(sx + w, sy - 8 * z); ctx.stroke(); return; }
  if (f.plan === 'poly') { // spider / insect — a legged dot
    ctx.strokeStyle = 'rgba(20,18,16,0.8)'; ctx.lineWidth = Math.max(0.6, 0.9 * z); const r = 3 * z;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; ctx.beginPath(); ctx.moveTo(sx - Math.cos(a) * r * 2, sy - Math.sin(a) * r); ctx.lineTo(sx + Math.cos(a) * r * 2, sy + Math.sin(a) * r); ctx.stroke(); }
    ctx.fillStyle = 'rgba(30,26,22,0.95)'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); return; }
  // default aquatic/other — a small ripple dot
  ctx.fillStyle = 'rgba(200,220,230,0.5)'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, 2 * z), 0, Math.PI * 2); ctx.fill();
}

// drawOverworld(ctx, W, H, world, cam) — the whole frame. cam = { x, y, z } (world px at TL + zoom).
export function drawOverworld(ctx, W, H, world, cam = { x: 0, y: 0, z: 1 }) {
  const z = cam.z || 1;
  drawGround(ctx, W, H, world, cam);
  // plants (already y-sorted back-to-front). cull to viewport with a margin for tall trees.
  for (const p of world.plants) {
    const sx = (p.x - cam.x) * z, sy = (p.y - cam.y) * z;
    if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + p.h * z + 40) continue;
    drawPlant(ctx, p, sx, sy, z);
  }
  for (const f of world.fauna) {
    const sx = (f.x - cam.x) * z, sy = (f.y - cam.y) * z;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    drawFauna(ctx, f, sx, sy, z);
  }
}

// ── THE ROAMED VIEW (roam.js) — voronoi ground + streamed chunk plants/fauna + the player ─────────────
// Same silhouettes as the still-map, but the ground is the chunk's VORONOI cells (organic patches) and a
// walking player `@` is drawn at world-centre. Only resident chunks within the viewport draw, so cost is
// bounded by what's on screen, not by the whole world — the fix for the "it's slooow" painting.
function drawVoronoiGround(ctx, W, H, roam, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, SKY[0]); g.addColorStop(1, SKY[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const z = cam.z;
  for (const c of roam.chunks.values()) {
    // cull whole chunks outside the viewport
    const sx0 = (c.x0 - cam.x) * z, sy0 = (c.y0 - cam.y) * z, sc = c.chunk * z;
    if (sx0 > W || sy0 > H || sx0 + sc < 0 || sy0 + sc < 0) continue;
    for (const cell of c.cells) {
      const tint = BAND_TINT[cell.band] || BAND_TINT.meadow;
      const t = ((cell.cy % 1200) / 1200); const jit = (((cell.cx | 0) * 73 ^ (cell.cy | 0) * 179) & 7) / 7 * 0.08 - 0.04;
      ctx.fillStyle = shade(tint[0], (1 - Math.min(1, t)) * (1 + jit) + Math.min(1, t) * 0.72 + jit);
      ctx.beginPath();
      const p0 = cell.poly[0]; ctx.moveTo((p0[0] - cam.x) * z, (p0[1] - cam.y) * z);
      for (let i = 1; i < cell.poly.length; i++) ctx.lineTo((cell.poly[i][0] - cam.x) * z, (cell.poly[i][1] - cam.y) * z);
      ctx.closePath(); ctx.fill();
    }
  }
}

// the player. If the host passes its rolled character sprite (opts.playerSprite — the SAME sprite the ship
// deck draws, so identity carries into the overworld), draw that over a lantern glow; else a hooded stand-in.
function drawPlayer(ctx, sx, sy, z, sprite) {
  const r = Math.max(7, 9 * z);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.28, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  if (sprite && sprite.width) {
    // the lantern (the player's true glow), then the rolled sprite standing over it — as on the ship deck
    ctx.save(); ctx.shadowColor = 'rgba(244,191,98,0.9)'; ctx.shadowBlur = r * 2.4;
    ctx.fillStyle = '#fff7e6'; ctx.beginPath(); ctx.arc(sx, sy, r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const h = Math.max(20, 26 * z), w = h * (sprite.width / sprite.height);
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, sx - w / 2, sy - h * 0.92, w, h);
    ctx.imageSmoothingEnabled = sm;
    return;
  }
  ctx.fillStyle = '#20242c'; ctx.strokeStyle = '#f4bf62'; ctx.lineWidth = Math.max(1.4, 1.8 * z);
  ctx.beginPath(); ctx.moveTo(sx, sy - r * 1.9); ctx.lineTo(sx + r * 0.8, sy); ctx.lineTo(sx - r * 0.8, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.arc(sx, sy - r * 1.9, r * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4bf62'; ctx.beginPath(); ctx.arc(sx, sy - r * 1.9, r * 0.5, 0, Math.PI * 2); ctx.stroke();
}

// drawRoam(ctx, W, H, roam, cam, opts) — the whole roamed frame. opts.forage / opts.encounter highlight
// the current interactable (a soft ring). The player sits wherever cam is centred (host keeps them centred).
export function drawRoam(ctx, W, H, roam, cam = { x: 0, y: 0, z: 1 }, opts = {}) {
  const z = cam.z || 1;
  drawVoronoiGround(ctx, W, H, roam, cam);
  // gather all in-view plants across resident chunks, y-sort globally, draw.
  const vis = [];
  for (const c of roam.chunks.values()) for (const p of c.plants) {
    const sx = (p.x - cam.x) * z, sy = (p.y - cam.y) * z;
    if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + p.h * z + 40) continue;
    vis.push(p);
  }
  vis.sort((a, b) => a.y - b.y);
  const hi = opts.forage;
  for (const p of vis) {
    const sx = (p.x - cam.x) * z, sy = (p.y - cam.y) * z;
    if (p.gather && !roam.gathered.has(p.id)) { // a faint forage glint
      ctx.fillStyle = (hi && hi.id === p.id) ? 'rgba(244,191,98,0.9)' : 'rgba(244,191,98,0.35)';
      ctx.beginPath(); ctx.arc(sx, sy - Math.max(3, 4 * z), Math.max(1.5, 2 * z), 0, Math.PI * 2); ctx.fill();
    }
    drawPlant(ctx, p, sx, sy, z);
  }
  const foe = opts.encounter;
  // an AIRBORNE flock (over/menace.js) replaces its static hive glyph — don't draw the swarm twice.
  const airborne = new Set((opts.menace || []).map((s) => s.faunaId));
  for (const c of roam.chunks.values()) for (const f of c.fauna) {
    if (roam.gathered.has('foe:' + f.id) || airborne.has(f.id)) continue;
    const sx = (f.x - cam.x) * z, sy = (f.y - cam.y) * z;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    if (f.fight && foe && foe.id === f.id) { ctx.strokeStyle = 'rgba(220,90,70,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, Math.max(10, 12 * z), 0, Math.PI * 2); ctx.stroke(); }
    drawFauna(ctx, f, sx, sy, z);
  }
  // the living menace: each boid a bee — a bright body with a smoked wing-blur behind its heading.
  // Aggro flocks run hot (gold), homing flocks cool off (paler, no ring).
  for (const s of (opts.menace || [])) {
    for (const b of s.boids) {
      const sx = (b.x - cam.x) * z, sy = (b.y - cam.y) * z;
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const v = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = s.aggro ? 'rgba(60,50,20,0.55)' : 'rgba(60,50,20,0.3)';
      ctx.lineWidth = Math.max(0.6, 0.8 * z);
      ctx.beginPath(); ctx.moveTo(sx - (b.vx / v) * 3.4 * z, sy - (b.vy / v) * 3.4 * z); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.fillStyle = s.aggro ? 'rgba(244,200,90,0.95)' : 'rgba(226,200,130,0.7)';
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.9, 1.3 * z), 0, Math.PI * 2); ctx.fill();
    }
    if (s.aggro) {   // the threat ring rides the flock centroid, not the hive
      const cx2 = (s.cx - cam.x) * z, cy2 = (s.cy - cam.y) * z;
      ctx.strokeStyle = 'rgba(220,90,70,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx2, cy2, Math.max(10, 13 * z), 0, Math.PI * 2); ctx.stroke();
    }
  }
  drawPlayer(ctx, (roam.player.x - cam.x) * z, (roam.player.y - cam.y) * z, z, opts.playerSprite);
}

export default { drawOverworld, drawRoam };
