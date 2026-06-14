// sprite.js — procedural, deterministic renderer for the item genome. TWO modes:
//
//   drawSprite(ctx, item) — the MAP sprite: the phylum's body-plan (a parametric PRIMITIVE),
//       tinted by material and MODULATED BY THE TRAIT GENES (mass→heft, tech→crispness/rivets,
//       ornament→filigree, complexity→parts, durability→outline, potency→edge glint).
//   drawGlyph(ctx, item)  — the INVENTORY glyph: the kingdom verb-glyph on a material chip, with
//       SIGNIFIERS for the characteristics (grade ring, tech pips, complexity dots, ornament spark,
//       provenance halo). The glyph is what it DOES; the signifiers say how good/old/wrought it is.
//
// The phenotype is a pure function of the genome ⇒ same item, same pixels, everywhere. NPC-SPRITES.md
// contract holds: 32×32 logical box, thin dark outline, flat material fill, no baked scene shadow.
// Pure w.r.t. ctx (only calls/sets — never reads), so it's headlessly testable.

import { PHYLA } from './taxa.js';

const OUTLINE = '#05060a', UNIT = 32;
const g0 = (item, t) => (item.genome && item.genome.genes ? item.genome.genes[t] : 0.5);

function shade(hex, amt) {
  const c = hex.replace('#', ''); const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
  let r = (n >> 16) & 255, gr = (n >> 8) & 255, b = n & 255;
  const f = (v) => (amt >= 0 ? Math.round(v + (255 - v) * amt) : Math.round(v * (1 + amt)));
  return `rgb(${f(r)},${f(gr)},${f(b)})`;
}
function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function fillStroke(ctx, fill, lw) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }

// ── the parametric PRIMITIVES — all draw in a 0..32 box, centred, north = up ────────────────────
export const PRIMS = {
  // elongated implement: shaft + a head + a hilt; len/thickness/head/hilt come from phylum.p + genes
  long(ctx, item, P, lw) {
    const p = P.p, c = item.color, mass = g0(item, 'mass'), pot = g0(item, 'potency');
    const len = (p.len || 1), top = 16 - 12 * len, w = 1.4 + mass * 1.8;          // shaft half-extent + width
    const bot = p.hilt === 'none' ? 28 : 23;
    if (p.scroll) {                                                                // a rolled scroll, not a shaft
      poly(ctx, [[10, 8], [22, 8], [22, 24], [10, 24]]); fillStroke(ctx, shade(c, 0.25), lw);
      circle(ctx, 10, 8, 2.2); fillStroke(ctx, shade(c, 0.05), lw); circle(ctx, 10, 24, 2.2); fillStroke(ctx, shade(c, 0.05), lw);
      return;
    }
    // shaft
    ctx.fillStyle = c; ctx.fillRect(16 - w / 2, top + 2, w, bot - top - 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.8; ctx.strokeRect(16 - w / 2, top + 2, w, bot - top - 2);
    drawHead(ctx, p.head, c, top, w, lw);
    if (p.holes) { ctx.fillStyle = OUTLINE; for (let i = 0; i < 3; i++) circleFill(ctx, 16, top + 6 + i * 4, 0.7); }   // wind instrument
    if (p.hilt === 'grip') { ctx.fillStyle = '#2a221c'; ctx.fillRect(14.6, 23, 2.8, 6); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.7; ctx.strokeRect(14.6, 23, 2.8, 6);
      poly(ctx, [[11.5, 22], [20.5, 22], [19.5, 24], [12.5, 24]]); fillStroke(ctx, shade(c, -0.3), lw * 0.7); }
    else if (p.hilt === 'knob') { circle(ctx, 16, 28.5, 1.8); fillStroke(ctx, shade(c, -0.2), lw * 0.7); }
    if (p.edge && pot > 0.45) { ctx.strokeStyle = shade(c, 0.4 + pot * 0.4); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(16, top + 4); ctx.lineTo(16, bot - 2); ctx.stroke(); }
  },
  // a containing body, optional neck/mouth/lid; lantern & potion glow
  vessel(ctx, item, P, lw) {
    const p = P.p, c = item.color, belly = (p.belly || 1), squat = p.squat ? 0.8 : 1;
    const bw = 4.5 * belly, byTop = p.neck ? 12 : 8, byBot = 26 - (squat < 1 ? 2 : 0);
    if (p.bail) { ctx.strokeStyle = shade(c, -0.1); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(16, byTop - 2, 3.5, Math.PI, 0); ctx.stroke(); }
    if (p.neck) { const nw = 1.6 + (p.mouth || 0.5) * 2; ctx.fillStyle = c; ctx.fillRect(16 - nw / 2, byTop - 4 * p.neck, nw, 4 * p.neck + 1); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.8; ctx.strokeRect(16 - nw / 2, byTop - 4 * p.neck, nw, 4 * p.neck + 1); }
    poly(ctx, [[16 - bw * 0.7, byTop], [16 + bw * 0.7, byTop], [16 + bw, (byTop + byBot) / 2], [16 + bw * 0.8, byBot], [16 - bw * 0.8, byBot], [16 - bw, (byTop + byBot) / 2]]);
    fillStroke(ctx, c, lw);
    if (p.glass || p.potion || p.lantern) { ctx.globalAlpha = 0.55; ctx.fillStyle = shade(p.lantern ? '#f4bf62' : c, 0.4); poly(ctx, [[16 - bw * 0.5, byTop + 2], [16 + bw * 0.5, byTop + 2], [16 + bw * 0.4, byBot - 2], [16 - bw * 0.4, byBot - 2]]); ctx.fill(); ctx.globalAlpha = 1; }
    if (p.cork) { ctx.fillStyle = '#7a5230'; ctx.fillRect(15, byTop - 4 * (p.neck || 1) - 2, 2, 2.5); }
    if (p.lid) { ctx.fillStyle = shade(c, -0.25); ctx.fillRect(16 - bw * 0.75, byTop - 1.5, bw * 1.5, 2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.6; ctx.strokeRect(16 - bw * 0.75, byTop - 1.5, bw * 1.5, 2); }
  },
  // flat board / book / tablet / plate
  panel(ctx, item, P, lw) {
    const p = P.p, c = item.color, asp = p.aspect || 1, tech = g0(item, 'tech');
    let w = 18, h = 18; if (asp >= 1) w = 18 * Math.min(1.4, asp); else h = 20; w = Math.min(24, w); h = Math.min(24, h);
    const x = 16 - w / 2, y = 16 - h / 2;
    if (p.thin) { h = 4; const yy = 16 - h / 2; ctx.fillStyle = c; ctx.fillRect(x, yy, w, h); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.8; ctx.strokeRect(x, yy, w, h);
      if (p.marks) { ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = 0.6; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + (w / 6) * i, yy); ctx.lineTo(x + (w / 6) * i, yy + 2); ctx.stroke(); } }
      return; }
    if (p.book) { poly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); fillStroke(ctx, shade(c, -0.1), lw);
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.5; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = shade(c, -0.35); ctx.fillRect(15.2, y, 1.6, h);
      ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = 0.6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + 4, y + 5 + i * 4); ctx.lineTo(15, y + 5 + i * 4); ctx.stroke(); } return; }
    const rr = p.round ? 2 : 0;
    poly(ctx, [[x + rr, y], [x + w - rr, y], [x + w, y + rr], [x + w, y + h - rr], [x + w - rr, y + h], [x + rr, y + h], [x, y + h - rr], [x, y + rr]]);
    fillStroke(ctx, c, lw);
    if (p.studs) { ctx.fillStyle = shade(c, 0.4); const n = 3 + Math.round(tech * 3); for (let i = 0; i < n; i++) circleFill(ctx, x + 3 + (w - 6) * i / (n - 1 || 1), y + 3, 0.9), circleFill(ctx, x + 3 + (w - 6) * i / (n - 1 || 1), y + h - 3, 0.9); }
    if (p.tablet) { ctx.strokeStyle = shade(c, 0.25); ctx.lineWidth = 0.6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + 3, y + 5 + i * 4); ctx.lineTo(x + w - 3, y + 5 + i * 4); ctx.stroke(); } }
  },
  // round body: shield/ring/pendant/orb/gem/beacon/drum/ration
  disc(ctx, item, P, lw) {
    const p = P.p, c = item.color, pot = g0(item, 'potency');
    const r = p.small ? 6 : 9;
    if (p.chain) { ctx.strokeStyle = shade(c, 0.1); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(16, 11, 7, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); }
    const cy = p.chain ? 19 : 16;
    if (p.gem || p.facets) { poly(ctx, [[16, cy - r], [16 + r, cy], [16, cy + r], [16 - r, cy]]); fillStroke(ctx, c, lw);
      if (p.facets) { ctx.strokeStyle = shade(c, 0.4); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(16, cy - r); ctx.lineTo(16, cy + r); ctx.moveTo(16 - r, cy); ctx.lineTo(16 + r, cy); ctx.stroke(); }
      ctx.fillStyle = shade(c, 0.5); ctx.globalAlpha = 0.7; circleFill(ctx, 16 - r * 0.3, cy - r * 0.3, 1); ctx.globalAlpha = 1; return; }
    if (p.rays) { ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = 0.9; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(16 + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1)); ctx.lineTo(16 + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); ctx.stroke(); } }
    if (p.blob) { poly(ctx, [[10, 14], [15, 12], [21, 13], [23, 18], [20, 23], [13, 23], [9, 19]]); fillStroke(ctx, c, lw); return; }
    if (p.drum) { ctx.fillStyle = c; ctx.fillRect(16 - r, cy - r * 0.7, r * 2, r * 1.4); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.strokeRect(16 - r, cy - r * 0.7, r * 2, r * 1.4);
      ctx.strokeStyle = shade(c, 0.3); ctx.beginPath(); ctx.moveTo(16 - r, cy - r * 0.7); ctx.lineTo(16 - r, cy + r * 0.7); ctx.moveTo(16 + r, cy - r * 0.7); ctx.lineTo(16 + r, cy + r * 0.7); ctx.stroke(); return; }
    circle(ctx, 16, cy, r); fillStroke(ctx, c, lw);
    if (p.ring) { ctx.fillStyle = OUTLINE; circle(ctx, 16, cy, r * 0.5); ctx.fill(); ctx.fillStyle = '#070a0e'; }   // torus hole punched dark
    if (p.boss) { ctx.fillStyle = shade(c, 0.25); circle(ctx, 16, cy, r * 0.35); ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.6; ctx.stroke(); }
    if (p.orb || p.glow) { ctx.globalAlpha = 0.6; ctx.fillStyle = shade(c, 0.4 + pot * 0.3); circle(ctx, 16 - r * 0.3, cy - r * 0.3, r * 0.4); ctx.fill(); ctx.globalAlpha = 1; }
    if (p.rune) { ctx.fillStyle = shade(c, 0.45); for (let i = 0; i < 3; i++) circleFill(ctx, 16 - 2 + i * 2, cy, 0.7); }
  },
  // draped body with shoulders
  garment(ctx, item, P, lw) {
    const c = item.color, len = (P.p.length || 1);
    poly(ctx, [[16, 5], [22, 8], [25, 13], [22, 14], [21, 6 + 22 * len * 0.9], [11, 6 + 22 * len * 0.9], [10, 14], [7, 13], [10, 8]]);
    fillStroke(ctx, c, lw);
    ctx.fillStyle = shade(c, -0.3); poly(ctx, [[14, 6], [18, 6], [17, 10], [15, 10]]); ctx.fill();
    ctx.strokeStyle = shade(c, 0.25); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(16, 6 + 22 * len * 0.85); ctx.stroke();
  },
  // multi-part: a chest (box+lid) or a string instrument (body+neck)
  compound(ctx, item, P, lw) {
    const p = P.p, c = item.color;
    if (p.instrument === 'string') { circle(ctx, 16, 21, 6); fillStroke(ctx, c, lw);
      ctx.fillStyle = OUTLINE; circleFill(ctx, 16, 21, 1.6);
      ctx.fillStyle = shade(c, -0.2); ctx.fillRect(15, 6, 2, 11); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.7; ctx.strokeRect(15, 6, 2, 11);
      ctx.strokeStyle = shade(c, 0.4); ctx.lineWidth = 0.4; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(16 + i, 7); ctx.lineTo(16 + i, 26); ctx.stroke(); } return; }
    // chest
    poly(ctx, [[8, 14], [24, 14], [24, 26], [8, 26]]); fillStroke(ctx, shade(c, -0.05), lw);
    poly(ctx, [[8, 14], [24, 14], [22, 9], [10, 9]]); fillStroke(ctx, shade(c, 0.1), lw);             // lid
    ctx.fillStyle = shade(c, -0.4); ctx.fillRect(15, 13, 2, 4); ctx.fillStyle = '#f4bf62'; circleFill(ctx, 16, 18, 1);   // hasp + lock
  },
};
function circleFill(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function drawHead(ctx, head, c, top, w, lw) {
  switch (head) {
    case 'tip':    poly(ctx, [[16, top - 2], [16 + 2.2, top + 3], [16 + w / 2, top + 2], [16 - w / 2, top + 2], [16 - 2.2, top + 3]]); fillStroke(ctx, shade(c, 0.1), lw); break;
    case 'spike':  poly(ctx, [[16, top - 3], [16 + 1.6, top + 4], [16 - 1.6, top + 4]]); fillStroke(ctx, shade(c, 0.1), lw); break;
    case 'axe':    poly(ctx, [[16, top], [16 + 7, top - 1], [16 + 6, top + 6], [16, top + 5]]); fillStroke(ctx, shade(c, -0.1), lw); break;
    case 'hammer': ctx.fillStyle = shade(c, -0.05); ctx.fillRect(16 - 6, top, 12, 5); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.strokeRect(16 - 6, top, 12, 5); break;
    case 'chisel': ctx.fillStyle = shade(c, 0.1); ctx.fillRect(16 - 1.6, top - 1, 3.2, 4); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.7; ctx.strokeRect(16 - 1.6, top - 1, 3.2, 4); break;
    case 'orb':    circle(ctx, 16, top, 3.6); fillStroke(ctx, shade(c, 0.1), lw); ctx.fillStyle = shade(c, 0.5); ctx.globalAlpha = 0.7; circleFill(ctx, 14.8, top - 1, 1.1); ctx.globalAlpha = 1; break;
    case 'flame':  ctx.fillStyle = '#f4bf62'; ctx.globalAlpha = 0.85; poly(ctx, [[16, top - 4], [16 + 3, top + 2], [16 - 3, top + 2]]); ctx.fill(); ctx.globalAlpha = 1; break;
    case 'bell':   poly(ctx, [[16 - 1.5, top + 2], [16 + 1.5, top + 2], [16 + 4, top - 2], [16 - 4, top - 2]]); fillStroke(ctx, shade(c, 0.05), lw); break;
  }
}

// ── spike CUES — a gene at an extreme decorates the sprite (matches genome.js SPIKE.cue) ─────────
function drawCue(ctx, cue, item) {
  switch (cue) {
    case 'edge':     ctx.strokeStyle = '#fff7e0'; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(18, 5); ctx.lineTo(17, 11); ctx.stroke(); ctx.globalAlpha = 1; break;
    case 'bulk':     ctx.strokeStyle = shade(item.color, -0.45); ctx.lineWidth = 1.8; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(9, 16); ctx.lineTo(23, 16); ctx.stroke(); ctx.globalAlpha = 1; break;
    case 'crack':    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(15, 9); ctx.lineTo(17, 14); ctx.lineTo(15, 18); ctx.stroke(); break;
    case 'trim':     ctx.strokeStyle = '#f4bf62'; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.9; ctx.strokeRect(7.5, 7.5, 17, 17); ctx.globalAlpha = 1; break;
    case 'filigree': ctx.strokeStyle = shade(item.color, 0.5); ctx.lineWidth = 0.5; ctx.globalAlpha = 0.8; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; ctx.beginPath(); ctx.arc(16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 1.6, 0, Math.PI * 1.4); ctx.stroke(); } ctx.globalAlpha = 1; break;
    case 'gears':    ctx.strokeStyle = shade(item.color, 0.3); ctx.lineWidth = 0.6; circle(ctx, 24, 24, 2.2); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(24 + Math.cos(a) * 2.2, 24 + Math.sin(a) * 2.2); ctx.lineTo(24 + Math.cos(a) * 3, 24 + Math.sin(a) * 3); ctx.stroke(); } break;
    case 'rivet':    ctx.fillStyle = shade(item.color, 0.5); for (const [x, y] of [[8, 8], [24, 8], [8, 24], [24, 24]]) circleFill(ctx, x, y, 0.9); break;
    case 'patina':   ctx.fillStyle = '#5aa845'; ctx.globalAlpha = 0.16; ctx.fillRect(4, 4, 24, 24); ctx.globalAlpha = 1; break;
  }
}

function drawFrame(ctx, item, gradeIdx) {
  ctx.strokeStyle = item.frame; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.strokeRect(2, 2, 28, 28); ctx.globalAlpha = 1;
  if (gradeIdx <= 0) return;
  ctx.strokeStyle = item.frame; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85; const L = 2 + gradeIdx;
  for (const [x, y, dx, dy] of [[2, 2, 1, 1], [30, 2, -1, 1], [2, 30, 1, -1], [30, 30, -1, -1]]) { ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
const GRADE_IDX = { junk: 0, meagre: 1, fair: 2, solid: 3, superb: 4, mythic: 5 };

// ── PUBLIC: the map sprite ──────────────────────────────────────────────────────────────────────
export function drawSprite(ctx, item, { x = 0, y = 0, size = 32, frame = true, bg = null } = {}) {
  const s = size / UNIT; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, UNIT, UNIT); }
  if (frame) drawFrame(ctx, item, GRADE_IDX[item.grade] ?? 0);
  const P = PHYLA[item.phylum] || { prim: 'long', p: {} };
  const lw = 0.7 + g0(item, 'durability') * 0.9;                 // sturdier ⇒ heavier outline
  (PRIMS[P.prim] || PRIMS.long)(ctx, item, P, lw);
  for (const cue of item.cues || []) drawCue(ctx, cue, item);
  ctx.restore();
}
export const drawItem = drawSprite;   // back-compat alias

// ── PUBLIC: the inventory glyph + characteristic signifiers ─────────────────────────────────────
export function drawGlyph(ctx, item, { x = 0, y = 0, size = 32, bg = null } = {}) {
  const s = size / UNIT; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, UNIT, UNIT); }
  const tech = g0(item, 'tech'), orn = g0(item, 'ornament'), cx = g0(item, 'complexity'), prov = g0(item, 'provenance');
  // provenance halo (storied items glow faintly)
  if (prov >= 0.75) { ctx.globalAlpha = 0.18; ctx.fillStyle = item.frame; circleFill(ctx, 16, 15, 13); ctx.globalAlpha = 1; }
  // material chip
  ctx.fillStyle = shade(item.color, -0.55); circle(ctx, 16, 15, 11); ctx.fill();
  ctx.strokeStyle = item.frame; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9; circle(ctx, 16, 15, 11); ctx.stroke(); ctx.globalAlpha = 1;   // grade ring
  ctx.fillStyle = shade(item.color, 0.05); ctx.globalAlpha = 0.5; circle(ctx, 16, 15, 9); ctx.fill(); ctx.globalAlpha = 1;               // material tint
  // the verb glyph
  ctx.fillStyle = item.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '14px ui-sans-serif, sans-serif';
  ctx.fillText(item.glyph, 16, 15.5);
  // signifiers: tech pips (bottom), complexity dots (right), ornament spark (top-right)
  const pips = 1 + Math.round(tech * 3);
  ctx.fillStyle = '#dfe7e2'; ctx.globalAlpha = 0.85; for (let i = 0; i < pips; i++) circleFill(ctx, 16 - (pips - 1) * 1.6 + i * 3.2, 28, 0.9); ctx.globalAlpha = 1;
  const dots = Math.round(cx * 3); ctx.fillStyle = item.accent; for (let i = 0; i < dots; i++) circleFill(ctx, 28.5, 11 + i * 2.4, 0.8);
  if (orn >= 0.7) { ctx.fillStyle = '#f4bf62'; ctx.font = '6px sans-serif'; ctx.fillText('✦', 26, 6); }
  ctx.restore();
}

const SPRITE = { drawSprite, drawGlyph, drawItem, PRIMS, shade };
if (typeof globalThis !== 'undefined') globalThis.SPRITE = SPRITE;
export default SPRITE;
