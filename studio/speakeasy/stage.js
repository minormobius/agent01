// stage.js — paper, scissors, pins: the cutout theatre's workshop.
//
// Everything on this stage is cut from coloured paper and pinned at the joints,
// after Picasso's designs for Parade (1917): flat planes, hard black edges, a
// shadow where one sheet lies over another, the grain of the paper in every
// colour. A PUPPET is a tree of parts; each part is a polygon hanging from a
// pin in its parent, and a pose is just an angle per pin.
//
// Stage units: the opening is 160 wide (x -80..80) and 100 tall (y 0..100,
// down), the boards at y = 86.

import { rng, hash } from '../lib/paint.js';

export const PAL = {
  ink: '#1b1816', cream: '#efe4cc', paper: '#e6d8b8', ochre: '#d39b3a', brick: '#b8432f', red: '#c9372c',
  deep: '#7a1f1a', cobalt: '#2c5aa0', night: '#15223f', navy: '#1d2e55', green: '#4e7a4a', grey: '#8d8f8c',
  slate: '#5b6477', pink: '#e2a79d', gold: '#e0b04a', tan: '#c9a46c', brown: '#6b4128', black: '#171412',
};

// ---- cutting: every edge a little uneven, as scissors leave it -----------------

/** Roughen a polygon's edges, deterministically from its seed. */
export function cut(poly, seed, amt = 0.18) {
  const r = rng(seed * 977 + 13);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push([a[0] + (r() - 0.5) * amt, a[1] + (r() - 0.5) * amt]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.floor(len / 2.2);
    for (let j = 1; j <= k; j++) {
      const f = j / (k + 1);
      out.push([a[0] + (b[0] - a[0]) * f + (r() - 0.5) * amt, a[1] + (b[1] - a[1]) * f + (r() - 0.5) * amt]);
    }
  }
  return out;
}

export function path(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
}

/** A sheet of paper: colour, then its grain, then a hard ink edge. */
export function sheet(ctx, poly, fill, { grain, edge = 0.28, edgeColor = PAL.ink, alpha = 1 } = {}) {
  path(ctx, poly);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fill();
  if (grain) { ctx.fillStyle = grain; ctx.globalAlpha = alpha * 0.5; ctx.fill(); ctx.globalAlpha = alpha; }
  if (edge > 0) { ctx.lineWidth = edge; ctx.strokeStyle = edgeColor; ctx.lineJoin = 'round'; ctx.stroke(); }
  ctx.globalAlpha = 1;
}

// ---- textures: paper grain, newsprint, wallpaper, brick ---------------------------

export function makeTextures() {
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
  const r = rng(1917);
  const grain = mk(128, 128, (x, w, h) => {
    const img = x.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = 128 + (r() * 38);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.97; img.data[i * 4 + 2] = v * 0.9; img.data[i * 4 + 3] = 70;
    }
    x.putImageData(img, 0, 0);
  });
  const news = mk(180, 180, (x, w, h) => {
    x.fillStyle = '#e8e0cc'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2a2622';
    x.font = 'bold 13px Georgia, serif'; x.fillText('LE JOURNAL', 6, 16);
    x.font = '6px Georgia, serif';
    const words = 'THE CITY NIGHT MONEY JAZZ HOTEL CELLAR RAID POLICE DAME HAT CARD DOWN BELOW STREET MANAGER'.split(' ');
    for (let y = 26; y < h; y += 7) {
      let xx = 4;
      while (xx < w - 10) { const wd = words[Math.floor((r() + 1) / 2 * words.length) % words.length]; x.fillText(wd.toLowerCase(), xx, y); xx += wd.length * 3.4 + 4; }
    }
  });
  const diamonds = mk(40, 40, (x, w, h) => {
    x.fillStyle = '#b8432f'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#7a1f1a';
    x.beginPath(); x.moveTo(20, 2); x.lineTo(34, 20); x.lineTo(20, 38); x.lineTo(6, 20); x.closePath(); x.fill();
    x.fillStyle = '#d39b3a'; x.fillRect(19, 19, 2, 2);
  });
  const deco = mk(48, 48, (x, w, h) => {
    x.fillStyle = '#d6b36a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#a57a2c'; x.lineWidth = 2;
    for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(24, 48, 10 + k * 9, Math.PI, 2 * Math.PI); x.stroke(); }
  });
  const brick = mk(64, 32, (x, w, h) => {
    x.fillStyle = '#4a2a22'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#6e3a2c';
    for (let row = 0; row < 4; row++) for (let c = -1; c < 4; c++) x.fillRect(c * 16 + (row % 2) * 8 + 1, row * 8 + 1, 14, 6);
  });
  return { grain, news, diamonds, deco, brick };
}

// ---- puppets -----------------------------------------------------------------------

/**
 * A part: `poly` in its own coordinates, the pin at (0, 0). Children hang at
 * `at` in this part's coordinates and turn by pose[child.name]. `back: true`
 * draws a child behind its parent (the far arm, the far leg).
 */
export function part(name, poly, fill, children = [], opt = {}) {
  return { name, poly: cut(poly, hash(name.length * 131, poly.length * 7, Math.round(poly[0][0] * 10)) * 1e6 | 0, opt.rough ?? 0.14), fill, children, ...opt };
}
export const at = (x, y, p) => ({ ...p, at: [x, y] });

/**
 * Draw a puppet at (x, y), `s` stage units per puppet unit, facing right (or
 * left when flip). pose: { [partName]: radians }, colours: { [partName]: fill }.
 */
export function drawPuppet(ctx, P, { x, y, s = 1, flip = false, pose = {}, colors = {}, tex, shadow = true, alpha = 1, detach } = {}) {
  const drawPart = (p, pass) => {
    ctx.save();
    if (p.at) ctx.translate(p.at[0], p.at[1]);
    const d = detach?.[p.name];
    if (d) { ctx.translate(d.x, d.y); ctx.rotate(d.r); }
    ctx.rotate(pose[p.name] || 0);
    for (const c of p.children) if (c.back) drawPart(c, pass);
    if (pass === 'shadow') {
      path(ctx, p.poly); ctx.fillStyle = 'rgba(20,12,8,0.28)'; ctx.fill();
    } else {
      const fill = colors[p.name] ?? p.fill;
      if (fill) sheet(ctx, p.poly, fill, { grain: tex?.grainPat, edge: p.edge ?? 0.26, alpha });
      if (p.deco) p.deco(ctx, pose, colors);
      if (p.pin) { ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(0, 0, 0.35, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const c of p.children) if (!c.back) drawPart(c, pass);
    ctx.restore();
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  if (shadow) { ctx.save(); ctx.translate(0.5, 0.7); drawPart(P, 'shadow'); ctx.restore(); }
  drawPart(P, 'paper');
  ctx.restore();
}

/** Every part's pin position in stage units, for the shattering at the raid. */
export function partPositions(P, { x, y, s = 1, flip = false, pose = {} }) {
  const out = [];
  const walk = (p, m) => {
    let [a, b, c, d, e, f] = m;
    if (p.at) { e += a * p.at[0] + c * p.at[1]; f += b * p.at[0] + d * p.at[1]; }
    const r = pose[p.name] || 0, cs = Math.cos(r), sn = Math.sin(r);
    const m2 = [a * cs + c * sn, b * cs + d * sn, -a * sn + c * cs, -b * sn + d * cs, e, f];
    out.push({ name: p.name, x: e, y: f });
    for (const ch of p.children) walk(ch, m2);
  };
  walk(P, [flip ? -s : s, 0, 0, s, x, y]);
  return out;
}
