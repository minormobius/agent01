// o/render.js — draw the circle. The canvas IS the card: what you see is the
// PNG you share, domain printed on it.
import { rings } from './circle.js';

export const SIZE = 1200;
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const THEMES = {
  light: { bg: '#fbfaf7', ink: '#141414', muted: '#8a877f', guide: 'rgba(20,20,20,0.07)', ring: '#ffffff', ph: '#e7e4dc', accent: '#141414' },
  dark: { bg: '#111111', ink: '#f2f0eb', muted: '#8d8a83', guide: 'rgba(242,240,235,0.08)', ring: '#111111', ph: '#2a2a28', accent: '#f2f0eb' },
};

/** Load images in parallel; a failed or slow avatar becomes null (drawn as an initial). */
export function loadImages(urls, timeout = 6000) {
  return Promise.all(urls.map((u) => new Promise((res) => {
    if (!u) return res(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => res(null), timeout);
    img.onload = () => { clearTimeout(t); res(img); };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = u;
  })));
}

function face(ctx, img, p, T, label, ringW) {
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + ringW, 0, Math.PI * 2); ctx.fillStyle = T.ring; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.clip();
  if (img) ctx.drawImage(img, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  else {
    ctx.fillStyle = T.ph; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    ctx.fillStyle = T.muted; ctx.font = `600 ${Math.round(p.r * 0.9)}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((label || '?').replace(/^@/, '').slice(0, 1).toUpperCase(), p.x, p.y + p.r * 0.04);
  }
  ctx.restore();
}

/**
 * @param canvas
 * @param {{ centre, people, imgs: {centre, people[]}, days, inner, outer, theme }} d
 *   people: ranked, with .profile; only the first inner+outer+third are drawn.
 * @returns the geometry (for hit-testing on the page)
 */
export function draw(canvas, d) {
  const S = SIZE, T = THEMES[d.theme] || THEMES.light;
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  // the circle lives in a square above a band reserved for the type, so a
  // handle can never run into the bottom seats
  const BAND = 120, side = S - BAND, ox = (S - side) / 2, oy = 24;
  const raw = rings(side, d.inner, d.outer, d.third || 0);
  const shift = (p) => ({ ...p, x: p.x + ox, y: p.y + oy });
  const g = { centre: shift(raw.centre), inner: raw.inner.map(shift), outer: raw.outer.map(shift), third: raw.third.map(shift), guides: raw.guides };

  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = T.guide; ctx.lineWidth = 2;
  for (const r of g.guides) { ctx.beginPath(); ctx.arc(g.centre.x, g.centre.y, r, 0, Math.PI * 2); ctx.stroke(); }

  const seats = [...g.inner, ...g.outer, ...g.third];
  seats.forEach((p, i) => {
    const who = d.people[i];
    if (!who) {   // fewer people than seats: an empty seat, honestly empty
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.35, 0, Math.PI * 2); ctx.fillStyle = T.guide; ctx.fill();
      return;
    }
    face(ctx, d.imgs.people[i], p, T, who.profile?.handle, i < g.inner.length ? 5 : i < g.inner.length + g.outer.length ? 4 : 3);
  });
  // the centre, with a hairline ring in ink
  ctx.beginPath(); ctx.arc(g.centre.x, g.centre.y, g.centre.r + 9, 0, Math.PI * 2);
  ctx.strokeStyle = T.accent; ctx.lineWidth = 2.5; ctx.stroke();
  face(ctx, d.imgs.centre, g.centre, T, d.centre.handle, 6);

  // type: who, when, where
  const pad = 46;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = T.ink; ctx.textAlign = 'left';
  ctx.font = `600 34px ${FONT}`;
  const handle = '@' + d.centre.handle;
  let size = 34;
  while (ctx.measureText(handle).width > S * 0.55 && size > 20) { size -= 2; ctx.font = `600 ${size}px ${FONT}`; }
  ctx.fillText(handle, pad, S - pad - 30);  // in the band below the circle
  ctx.fillStyle = T.muted; ctx.font = `400 22px ${FONT}`;
  const shown = Math.min(d.people.length, seats.length);
  ctx.fillText(`closest ${shown} · last ${d.days} days`, pad, S - pad);
  ctx.textAlign = 'right'; ctx.fillStyle = T.ink; ctx.font = `600 30px ${FONT}`;
  ctx.fillText('o.mino.mobi', S - pad, S - pad);
  return g;
}
