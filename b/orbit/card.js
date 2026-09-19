// orbit/card.js — the shareable picture.
//
// One canvas, 1080², drawn from the same ringLayout() the arena uses so the
// picture people post is the picture they played. Everything here is layout;
// the only rule worth stating is palm's, learned the hard way on its radar: THE
// HEADLINE GOES UNDER THE PLOT, never inside it. A score disc in the middle of
// this ring would sit exactly where the seed's own avatar belongs and would
// occlude the lines that carry the whole meaning.
//
// Avatars come through /api/orbit/av (see api.js): cdn.bsky.app sends no
// access-control-allow-origin at all, so a cross-origin avatar cannot be drawn
// onto a canvas you intend to read back. The proxy is same-origin, so it can.
// A failed load is a coloured disc with an initial — never a hole, and never a
// thrown exception that takes the copy button with it.

import { ringLayout } from './game.js';

export const SIZE = 1080;
const PALETTE = ['#1a82c4', '#8b0000', '#1f7a4d', '#b8860b', '#6b4fa0', '#c2571a', '#0f7b8a', '#a33b6b'];

/** A stable colour per account, so the same face is the same colour everywhere. */
export function tint(did) {
  let h = 0;
  for (let i = 0; i < String(did).length; i++) h = (h * 31 + String(did).charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const initial = (handle) => (String(handle || '?').replace(/^@/, '')[0] || '?').toUpperCase();

/** Route an avatar through the same-origin proxy so the canvas stays readable. */
export const proxied = (url) => (url ? `/api/orbit/av?u=${encodeURIComponent(url)}` : null);

/** Load an image, or resolve null. Never rejects — a missing face is not an error. */
export function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function disc(ctx, img, x, y, r, did, handle) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  else {
    ctx.fillStyle = tint(did);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(r * 1.05)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial(handle), x, y + r * 0.04);
  }
  ctx.restore();
}

function ringStroke(ctx, x, y, r, colour, width) {
  ctx.beginPath();
  ctx.arc(x, y, r + width / 2, 0, Math.PI * 2);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Trim a string to fit `max` px at the current font, with an ellipsis. */
function fit(ctx, text, max) {
  let s = String(text || '');
  if (ctx.measureText(s).width <= max) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

/**
 * Draw the card.
 *
 * @param {object} m
 *   m.seed  { did, handle, displayName, img }
 *   m.ring  [{ did, handle, img, score }]  — already in closeness order
 *   m.score { correct, total, grade, label, pct, lift }
 *   m.dark  boolean
 */
export function drawCard(ctx, m) {
  const dark = !!m.dark;
  const bg = dark ? '#0d0d0d' : '#faf9f6';
  const ink = dark ? '#e8e8e8' : '#141414';
  const mute = dark ? '#8a8a8a' : '#77736c';
  const rule = dark ? '#2c2c2c' : '#d8d5cd';
  const sky = dark ? '#6ec1e4' : '#1a82c4';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2, cy = 495, R = 315;

  // a very faint well behind the ring, so the lines have something to sit on
  const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, R + 120);
  grad.addColorStop(0, dark ? 'rgba(110,193,228,.10)' : 'rgba(26,130,196,.07)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ── title ──
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = '600 64px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillText('orbit', 74, 116);
  ctx.fillStyle = sky;
  ctx.font = '600 64px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('◌', 74 + ctx.measureText('orbit').width - 8, 116);
  ctx.fillStyle = mute;
  ctx.font = '500 22px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText('THE CIRCLE OF CLOSENESS', 76, 152);

  ctx.textAlign = 'right';
  ctx.fillStyle = mute;
  ctx.font = '500 24px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText(fit(ctx, '@' + String(m.seed.handle || '').replace(/^@/, ''), 460), SIZE - 74, 116);
  ctx.font = '500 20px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText(`${m.ring.length} seats · ${m.score.total} cards`, SIZE - 74, 150);

  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(74, 184); ctx.lineTo(SIZE - 74, 184); ctx.stroke();

  // ── the ring ──
  const layout = ringLayout(m.ring.length, { radius: R });
  const maxScore = Math.max(1, ...m.ring.map((p) => p.score || 0));

  for (let i = 0; i < layout.length; i++) {
    const p = layout[i], person = m.ring[i];
    const x = cx + p.x, y = cy + p.y;
    // sqrt, not the raw ratio. One person routinely out-scores the rest of the
    // ring by an order of magnitude (measured: 537 against a next-best 78), and
    // a linear scale then draws eleven identical hairlines and one bar. sqrt
    // keeps the order exactly and makes the spread legible.
    const weight = Math.sqrt((person.score || 0) / maxScore);   // 0..1 closeness
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = sky;
    ctx.globalAlpha = 0.16 + 0.55 * weight;
    ctx.lineWidth = 2 + 9 * weight;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < layout.length; i++) {
    const p = layout[i], person = m.ring[i];
    const x = cx + p.x, y = cy + p.y, r = 44 * p.scale;
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.fill();
    disc(ctx, person.img, x, y, r, person.did, person.handle);
    ringStroke(ctx, x, y, r, rule, 3);
  }

  // the seed, in the middle and larger — this is where a score disc would have gone
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, 86, 0, Math.PI * 2); ctx.fill();
  disc(ctx, m.seed.img, cx, cy, 78, m.seed.did, m.seed.handle);
  ringStroke(ctx, cx, cy, 78, sky, 5);

  // ── the verdict, under the plot ──
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = '700 118px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillText(`${m.score.correct}/${m.score.total}`, cx, 955);

  ctx.font = '600 38px "Iowan Old Style", Palatino, Georgia, serif';
  ctx.fillStyle = sky;
  const g = `${m.score.grade} · ${m.score.label}`;
  ctx.fillText(fit(ctx, g, SIZE - 180), cx, 1006);

  // ── the link, unobtrusive ──
  ctx.textAlign = 'right';
  ctx.fillStyle = mute;
  ctx.font = '500 19px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText('b.mino.mobi/orbit', SIZE - 74, SIZE - 26);

  ctx.textAlign = 'left';
  ctx.fillStyle = mute;
  ctx.font = '500 19px ui-monospace, "SF Mono", Menlo, monospace';
  const pct = Math.round(m.score.pct * 100);
  const chance = Math.round(m.score.chance * 100);
  ctx.fillText(`${pct}% right · ${chance}% is blind guessing`, 74, SIZE - 26);

  return ctx.canvas;
}

/** Load every avatar, then draw. Returns the canvas. */
export async function renderCard(model, { dark = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const people = [model.seed, ...model.ring];
  const imgs = await Promise.all(people.map((p) => loadImage(proxied(p.avatar))));
  const withImgs = {
    ...model,
    dark,
    seed: { ...model.seed, img: imgs[0] },
    ring: model.ring.map((p, i) => ({ ...p, img: imgs[i + 1] })),
  };
  drawCard(canvas.getContext('2d'), withImgs);
  return canvas;
}

/** Alt text, because a picture of twelve faces and a number needs one. */
export function cardAlt(m) {
  const names = m.ring.map((p) => '@' + String(p.handle).replace(/^@/, '')).join(', ');
  return `An orbit card for @${String(m.seed.handle).replace(/^@/, '')}: their avatar at the centre of a ring of ${m.ring.length} accounts — ${names} — with the line to each one thickened by how much they interact. Score: ${m.score.correct} of ${m.score.total} posts attributed to the right author, graded ${m.score.grade}, ${m.score.label}.`;
}

/**
 * Put the card on the clipboard, falling back to a download.
 *
 * The ClipboardItem is constructed around the blob PROMISE rather than an
 * awaited blob: Safari revokes clipboard permission the moment the call stack
 * leaves the user gesture, so awaiting first and writing after is a permission
 * error on exactly the browser most likely to be used to post the picture.
 */
export async function copyCanvas(canvas, filename = 'orbit.png') {
  const blobOf = () => new Promise((res) => canvas.toBlob(res, 'image/png'));
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf() })]);
      return 'clipboard';
    }
  } catch { /* fall through to the download */ }
  const blob = await blobOf();
  if (!blob) throw new Error('could not render the card');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'download';
}
