// misfortune/card.js — the 1200×630 card for a landed wedge (also the og image).
// Drawn on a canvas so the PNG you share is exactly what you saw.

export const CARD_W = 1200, CARD_H = 630;
const DISPLAY = '"Bungee", "Arial Black", Impact, sans-serif';
const BODY = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A four-point glint. */
function sparkle(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fffbe6';
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Gold lettering: dark outline, drop shadow, a vertical gold gradient, a glint line. */
function goldText(ctx, text, x, y, size) {
  ctx.font = `${size}px ${DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#2b0a00'; ctx.fillText(text, x + size * 0.06, y + size * 0.08);           // drop
  ctx.lineWidth = Math.max(4, size * 0.16); ctx.strokeStyle = '#3a0d00'; ctx.strokeText(text, x, y);
  const g = ctx.createLinearGradient(0, y - size * 0.85, 0, y + size * 0.1);
  g.addColorStop(0, '#fffbd1'); g.addColorStop(0.35, '#ffd84a'); g.addColorStop(0.55, '#f2a900');
  g.addColorStop(0.56, '#ffe27a'); g.addColorStop(1, '#b86e00');
  ctx.fillStyle = g; ctx.fillText(text, x, y);
}

/**
 * Draw the card for `wedge` on `canvas` (resized to 1200×630 × scale).
 * `wedge` may also be the title card: { id: 'title', kind: 'title', title, line }.
 */
export function drawCard(canvas, wedge, { scale = 1, colour = '#d7263d' } = {}) {
  canvas.width = CARD_W * scale; canvas.height = CARD_H * scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const R = rng(wedge.id);
  const W = CARD_W, H = CARD_H, cx = W / 2;

  // stage: a sunburst in the wedge's colour over deep purple
  ctx.fillStyle = '#1b0233'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(cx, H * 0.58);
  for (let k = 0; k < 28; k++) {
    ctx.rotate(Math.PI * 2 / 28);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, -900); ctx.lineTo(90, -900); ctx.closePath();
    ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)'; ctx.fill();
  }
  ctx.restore();
  const glow = ctx.createRadialGradient(cx, H * 0.55, 20, cx, H * 0.55, 620);
  glow.addColorStop(0, hexA(colour, 0.55)); glow.addColorStop(0.55, hexA(colour, 0.18)); glow.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // marquee frame with bulbs
  const inset = 22;
  ctx.lineWidth = 14; ctx.strokeStyle = '#7a4a00'; roundRect(ctx, inset, inset, W - 2 * inset, H - 2 * inset, 26); ctx.stroke();
  ctx.lineWidth = 8; ctx.strokeStyle = '#f2b81c'; roundRect(ctx, inset, inset, W - 2 * inset, H - 2 * inset, 26); ctx.stroke();
  const bulbs = perimeterPoints(inset, inset, W - 2 * inset, H - 2 * inset, 38);
  bulbs.forEach(([x, y], i) => {
    const lit = i % 2 === 0;
    const b = ctx.createRadialGradient(x, y, 0, x, y, lit ? 11 : 7);
    b.addColorStop(0, lit ? '#ffffff' : '#ffe9a8'); b.addColorStop(0.4, lit ? '#fff2b0' : '#c99a2e'); b.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = b; ctx.beginPath(); ctx.arc(x, y, lit ? 11 : 7, 0, Math.PI * 2); ctx.fill();
  });

  // header
  goldText(ctx, 'WHEEL OF MISFORTUNE', cx, 92, 40);
  ctx.font = `600 20px ${BODY}`; ctx.fillStyle = '#ffe9f0'; ctx.textAlign = 'center';
  ctx.fillText(wedge.kind === 'title' ? 'THE GAME SHOW FOR THE END TIMES' : 'THE WHEEL HAS SPOKEN · YOU LANDED ON', cx, 124);

  // headline: as big as fits in three lines
  // headline as big as fits in three lines AND leaves the announcer clear of
  // the stamp (which owns the bottom 120px)
  const maxW = W - 180, floor = wedge.kind === 'title' ? H - 70 : H - 128;
  ctx.font = `500 25px ${BODY}`;
  const body = wrap(ctx, wedge.line, W - 260).slice(0, 3);
  let size = 84, lines, lh, blockTop, bodyTop;
  for (; size > 30; size -= 4) {
    ctx.font = `${size}px ${DISPLAY}`;
    lines = wrap(ctx, wedge.title, maxW);
    lh = size * 1.08;
    blockTop = 160 + (3 - Math.min(3, lines.length)) * lh * 0.3;
    bodyTop = blockTop + size + (lines.length - 1) * lh + 48;
    const fits = lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW);
    if (fits && bodyTop + (body.length - 1) * 33 <= floor) break;
  }
  lines.forEach((l, i) => goldText(ctx, l, cx, blockTop + size + i * lh, size));

  // the announcer
  ctx.font = `500 25px ${BODY}`;
  ctx.fillStyle = '#fff7fb'; ctx.textAlign = 'center';
  body.forEach((l, i) => ctx.fillText(l, cx, bodyTop + i * 33));

  // stamp
  if (wedge.kind !== 'title') {
    const real = wedge.kind === 'real';
    const text = real ? `ALREADY HAPPENED · ${wedge.date.toUpperCase()}` : wedge.kind === 'special' ? 'HOUSE RULES' : 'NOT YET (PROBABLY)';
    ctx.save();
    ctx.translate(W - 250, H - 92); ctx.rotate(-0.07);
    ctx.font = `22px ${DISPLAY}`;
    const tw = ctx.measureText(text).width + 36;
    ctx.fillStyle = real ? 'rgba(200,16,46,0.92)' : 'rgba(255,255,255,0.92)';
    roundRect(ctx, -tw / 2, -24, tw, 44, 6); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = real ? '#ffd7dd' : '#1b0233'; roundRect(ctx, -tw / 2 + 5, -19, tw - 10, 34, 4); ctx.stroke();
    ctx.fillStyle = real ? '#fff' : '#1b0233'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, -1);
    ctx.restore();
    if (real) {
      ctx.font = `500 17px ${BODY}`; ctx.fillStyle = '#ffd9e2'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`source: ${wedge.source}`, W - 128, H - 42);
    }
  }
  ctx.font = `600 18px ${BODY}`; ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('mino.mobi/misfortune · satire. we laugh so we don’t cry', 70, H - 42);

  // glitter, last, over everything
  for (let i = 0; i < 70; i++) {
    const x = 40 + R() * (W - 80), y = 40 + R() * (H - 80);
    sparkle(ctx, x, y, 3 + R() * (R() < 0.15 ? 16 : 7), 0.35 + R() * 0.65);
  }
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function perimeterPoints(x, y, w, h, step) {
  const pts = [];
  for (let t = x + step / 2; t < x + w; t += step) pts.push([t, y], [t, y + h]);
  for (let t = y + step / 2; t < y + h; t += step) pts.push([x, t], [x + w, t]);
  return pts;
}
function hexA(hex, a) {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return `rgba(${v[0]},${v[1]},${v[2]},${a})`;
}
