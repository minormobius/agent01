// tjs/brut/blueprint.js — THE DRAWING OFFICE. Pure SVG-string renderers over a
// building from arch.js. No DOM, no measurement, no fetch: every function takes
// a building and returns a string, which is what makes them node-testable and
// what lets /brut/plan/ be a static page that draws a whole set on load.
//
// The drawings are not illustrations OF the model — they are the same data,
// projected. A plan is `levels[i].rooms`; an elevation is `facades` filtered by
// side; a section is `arch.section()`. If a bay moves in the 3D bench it moves
// here, because neither of them owns the bay.
//
// Conventions, the ones a drawing office would hold you to:
//   • Plans are drawn NORTH UP. North is −z, so screen-y grows with z.
//   • Elevations are named for the side you STAND ON, and handed correctly:
//     N reads right-to-left in x, S left-to-right, W in +z, E in −z.
//   • Nothing is dated. A seeded building has no issue date — the revision mark
//     is a hash of its parameters, which is the only thing that can change it.

import { rect as R, MODULES, section as archSection, schedule as archSchedule } from './arch.js';

export const PALETTES = {
  blueprint: {
    bg: '#0a1b2e', paper: '#0d2542', ink: '#cfe8ff', line: '#7fb4e0', faint: '#2d5a8a',
    accent: '#39d6c8', glass: '#4fd0e8', poche: '#173d63', core: '#20527f', text: '#9dc4e6',
  },
  print: {
    bg: '#ffffff', paper: '#ffffff', ink: '#111318', line: '#333940', faint: '#c2c8d0',
    accent: '#0d6f8f', glass: '#5aa9c4', poche: '#d9dee4', core: '#aeb6bf', text: '#4a525c',
  },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = (v) => Math.round(v * 100) / 100;

/* A world→sheet mapping that always fits, keeps the aspect, and centres. */
function fitter(x0, x1, y0, y1, W, H, pad) {
  const sw = (W - 2 * pad) / Math.max(1e-6, x1 - x0);
  const sh = (H - 2 * pad) / Math.max(1e-6, y1 - y0);
  const s = Math.min(sw, sh);
  const ox = pad + ((W - 2 * pad) - (x1 - x0) * s) / 2;
  const oy = pad + ((H - 2 * pad) - (y1 - y0) * s) / 2;
  return {
    s,
    X: (x) => n2(ox + (x - x0) * s),
    Y: (y) => n2(oy + (y - y0) * s),   // caller pre-flips for elevations
    L: (v) => n2(v * s),
  };
}

// A drawing scale a human recognises: 1:50, 1:100, 1:200, 1:500, 1:1000.
function nominalScale(pxPerMetre) {
  const mmPerMetre = pxPerMetre * (25.4 / 96);      // treat 1 px as 1/96 in
  const denom = 1000 / mmPerMetre;
  const ladder = [20, 50, 100, 200, 250, 500, 1000, 2000];
  let best = ladder[0];
  for (const c of ladder) if (Math.abs(Math.log(c / denom)) < Math.abs(Math.log(best / denom))) best = c;
  return '1:' + best;
}

// The revision mark: a short, stable hash of everything that defines the building.
export function revision(b) {
  const s = JSON.stringify(b.params);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

function defs(id, P) {
  return `<defs>
  <pattern id="${id}-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="6" stroke="${P.line}" stroke-width="1.1" opacity=".65"/>
  </pattern>
  <pattern id="${id}-poche" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <rect width="4" height="4" fill="${P.poche}"/>
    <line x1="0" y1="0" x2="0" y2="4" stroke="${P.core}" stroke-width="1.4"/>
  </pattern>
  <marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="${P.line}"/>
  </marker>
</defs>`;
}

const frame = (W, H, P, id, body, cls = '') =>
  `<svg class="bp ${cls}" viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">
${defs(id, P)}<rect width="${W}" height="${H}" fill="${P.paper}"/>
${body}
</svg>`;

const label = (x, y, t, P, size = 10, anchor = 'start', fill) =>
  `<text x="${n2(x)}" y="${n2(y)}" font-size="${size}" fill="${fill || P.text}" text-anchor="${anchor}">${esc(t)}</text>`;

/* ─────────────────────────────────  PLAN  ───────────────────────────────── */

export function planSVG(b, levelIndex, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 460, pad = opts.pad || 34;
  const id = (opts.id || 'p') + levelIndex;
  const L = b.levels[Math.max(0, Math.min(b.levels.length - 1, levelIndex))];
  const bx = plateBounds(b);
  const F = fitter(bx.x0, bx.x1, bx.z0, bx.z1, W, H - 26, pad);
  const out = [];

  // site / grid — the structural grid drawn faintly under everything, because a
  // brutalist plan is unreadable without the frame it obeys
  const bay = b.params.bay;
  for (let x = Math.ceil(bx.x0 / bay) * bay; x <= bx.x1; x += bay)
    out.push(`<line x1="${F.X(x)}" y1="${F.Y(bx.z0)}" x2="${F.X(x)}" y2="${F.Y(bx.z1)}" stroke="${P.faint}" stroke-width=".5" stroke-dasharray="2 4"/>`);
  for (let z = Math.ceil(bx.z0 / bay) * bay; z <= bx.z1; z += bay)
    out.push(`<line x1="${F.X(bx.x0)}" y1="${F.Y(z)}" x2="${F.X(bx.x1)}" y2="${F.Y(z)}" stroke="${P.faint}" stroke-width=".5" stroke-dasharray="2 4"/>`);

  // the plate outline — the cut line, drawn heaviest
  for (const wg of L.wings)
    out.push(box(F, wg, `fill="${P.bg}" fill-opacity=".55" stroke="${P.ink}" stroke-width="2.2"`));

  // circulation, tinted rather than outlined
  for (const c of L.corridors)
    out.push(box(F, c, `fill="${P.accent}" fill-opacity=".10" stroke="${P.accent}" stroke-width=".7" stroke-dasharray="5 3"`));

  // light wells: hatched holes in the slab
  for (const v of L.voids)
    out.push(box(F, v, `fill="url(#${id}-hatch)" stroke="${P.line}" stroke-width="1"`));

  // rooms
  const showRefs = opts.refs !== false;
  for (const r of L.rooms) {
    out.push(box(F, r, `fill="none" stroke="${P.line}" stroke-width="1.1"`));
    const w = F.L(r.w), h = F.L(r.d);
    if (showRefs && w > 30 && h > 15) {
      const size = Math.min(9, Math.max(6, h / 3.4));
      out.push(label(F.X(r.x), F.Y(r.z) - 1, fitText(r.program, w - 4, size), P, size, 'middle', P.ink));
      if (h > 27) out.push(label(F.X(r.x), F.Y(r.z) + 9, fitText(`${r.ref} · ${Math.round(r.area)}m²`, w - 4, 6.6), P, 6.6, 'middle'));
    }
  }

  // cores — poché, the way a real plan marks what you cannot walk through
  for (const c of L.cores) {
    out.push(box(F, c, `fill="url(#${id}-poche)" stroke="${P.ink}" stroke-width="1.6"`));
    if (F.L(c.w) > 26) out.push(label(F.X(c.x), F.Y(c.z) + 3, 'CORE', P, 7, 'middle', P.ink));
  }

  // columns
  for (const c of L.columns)
    out.push(`<rect x="${F.X(c.x) - 2.2}" y="${F.Y(c.z) - 2.2}" width="4.4" height="4.4" fill="${P.ink}"/>`);

  // section cut line A–A through z = 0
  const cz = opts.cutZ != null ? opts.cutZ : 0;
  out.push(`<line x1="${F.X(bx.x0) - 14}" y1="${F.Y(cz)}" x2="${F.X(bx.x1) + 14}" y2="${F.Y(cz)}" stroke="${P.accent}" stroke-width="1" stroke-dasharray="12 4 3 4"/>`);
  out.push(label(F.X(bx.x0) - 16, F.Y(cz) - 4, 'A', P, 9, 'end', P.accent));
  out.push(label(F.X(bx.x1) + 16, F.Y(cz) - 4, 'A', P, 9, 'start', P.accent));

  // north arrow (north is −z, so it points up the sheet) + overall dimension
  const nx = W - 26, ny = 40;
  out.push(`<line x1="${nx}" y1="${ny + 16}" x2="${nx}" y2="${ny - 14}" stroke="${P.line}" stroke-width="1.2" marker-end="url(#${id}-arrow)"/>`);
  out.push(label(nx, ny + 27, 'N', P, 9, 'middle', P.line));
  out.push(dimH(F, bx.x0, bx.x1, F.Y(bx.z1) + 16, P));
  out.push(dimV(F, bx.z0, bx.z1, F.X(bx.x0) - 16, P));

  out.push(label(pad - 12, H - 8, `${L.label}  ·  ${Math.round(L.gfa || 0)} m² GIA  ·  ${L.rooms.length} spaces`, P, 10, 'start', P.ink));
  out.push(label(W - pad + 12, H - 8, nominalScale(F.s) + ' @ sheet', P, 9, 'end'));
  return frame(W, H, P, id, out.join('\n'));
}

// Monospace, so a character is ~0.6 em: truncate to what the room can actually
// hold rather than letting a label bleed across the partition next door.
function fitText(t, px, size) {
  const max = Math.floor(px / (size * 0.6));
  if (max < 2) return '';
  return t.length <= max ? t : t.slice(0, Math.max(1, max - 1)) + '…';
}

function box(F, r, attrs) {
  return `<rect x="${F.X(R.x0(r))}" y="${F.Y(R.z0(r))}" width="${F.L(r.w)}" height="${F.L(r.d)}" ${attrs}/>`;
}

function plateBounds(b) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const L of b.levels) for (const wg of L.wings) {
    x0 = Math.min(x0, R.x0(wg)); x1 = Math.max(x1, R.x1(wg));
    z0 = Math.min(z0, R.z0(wg)); z1 = Math.max(z1, R.z1(wg));
  }
  const m = Math.max(2, (x1 - x0) * 0.04);
  return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
}

function dimH(F, a, b, y, P) {
  return `<g><line x1="${F.X(a)}" y1="${y}" x2="${F.X(b)}" y2="${y}" stroke="${P.faint}" stroke-width=".8"/>` +
    `<line x1="${F.X(a)}" y1="${y - 4}" x2="${F.X(a)}" y2="${y + 4}" stroke="${P.faint}"/>` +
    `<line x1="${F.X(b)}" y1="${y - 4}" x2="${F.X(b)}" y2="${y + 4}" stroke="${P.faint}"/>` +
    label((F.X(a) + F.X(b)) / 2, y - 5, `${(b - a).toFixed(1)} m`, P, 8, 'middle') + '</g>';
}
function dimV(F, a, b, x, P) {
  return `<g><line x1="${x}" y1="${F.Y(a)}" x2="${x}" y2="${F.Y(b)}" stroke="${P.faint}" stroke-width=".8"/>` +
    `<line x1="${x - 4}" y1="${F.Y(a)}" x2="${x + 4}" y2="${F.Y(a)}" stroke="${P.faint}"/>` +
    `<line x1="${x - 4}" y1="${F.Y(b)}" x2="${x + 4}" y2="${F.Y(b)}" stroke="${P.faint}"/>` +
    `<text x="${x - 5}" y="${(F.Y(a) + F.Y(b)) / 2}" font-size="8" fill="${P.text}" text-anchor="middle" transform="rotate(-90 ${x - 5} ${(F.Y(a) + F.Y(b)) / 2})">${(b - a).toFixed(1)} m</text></g>`;
}

/* ──────────────────────────────  ELEVATION  ─────────────────────────────── */

// Which world axis runs left→right on each elevation, handed for a viewer
// standing on that side and looking at the building.
const HAND = {
  N: { axis: 'x', sign: -1, from: 'north' },
  S: { axis: 'x', sign: 1, from: 'south' },
  W: { axis: 'z', sign: 1, from: 'west' },
  E: { axis: 'z', sign: -1, from: 'east' },
};

export function elevationSVG(b, side, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 460, pad = opts.pad || 34;
  const id = (opts.id || 'e') + side;
  const hand = HAND[side];
  const bx = plateBounds(b);
  const uMin = hand.axis === 'x' ? bx.x0 : bx.z0, uMax = hand.axis === 'x' ? bx.x1 : bx.z1;
  const topY = b.height * 1.06;
  const F = fitter(0, uMax - uMin, 0, topY, W, H - 26, pad);
  // u (world) → sheet x, with the handedness applied
  const U = (v) => F.X(hand.sign > 0 ? v - uMin : uMax - v);
  const V = (y) => F.Y(topY - y);   // y=0 is the ground line, at the bottom of the sheet
  const out = [];

  // ground line
  out.push(`<line x1="${pad - 12}" y1="${V(0)}" x2="${W - pad + 12}" y2="${V(0)}" stroke="${P.ink}" stroke-width="2"/>`);

  // the plate silhouettes, level by level, so setbacks and cantilevers read
  for (const L of b.levels) {
    for (const wg of L.wings) {
      const a = hand.axis === 'x' ? R.x0(wg) : R.z0(wg), c = hand.axis === 'x' ? R.x1(wg) : R.z1(wg);
      const x0 = Math.min(U(a), U(c)), x1 = Math.max(U(a), U(c));
      out.push(`<rect x="${x0}" y="${V(L.y + L.h)}" width="${n2(x1 - x0)}" height="${n2(F.L(L.h))}" fill="${P.bg}" fill-opacity=".5" stroke="${P.faint}" stroke-width=".7"/>`);
    }
  }

  // the bays — the elevation proper. Only facades on this side, sorted so the
  // nearest plane draws last and reads on top.
  const faces = b.facades.filter((f) => f.side === side)
    .sort((a, c) => (a.level - c.level));
  for (const f of faces) {
    for (const bay of f.bays) {
      const u = hand.axis === 'x' ? bay.x : bay.z;
      const cxa = U(u - bay.w / 2), cxb = U(u + bay.w / 2);
      const x0 = Math.min(cxa, cxb), bw = Math.abs(cxb - cxa);
      out.push(bayGlyph(bay.module, x0, V(f.y + f.h), bw, F.L(f.h), P, id));
    }
  }

  // towers
  for (const t of b.towers) {
    const a = hand.axis === 'x' ? t.x - t.w / 2 : t.z - t.d / 2;
    const c = hand.axis === 'x' ? t.x + t.w / 2 : t.z + t.d / 2;
    const x0 = Math.min(U(a), U(c)), x1 = Math.max(U(a), U(c));
    out.push(`<rect x="${x0}" y="${V(t.h)}" width="${n2(x1 - x0)}" height="${n2(F.L(t.h))}" fill="${P.core}" fill-opacity=".55" stroke="${P.ink}" stroke-width="1.6"/>`);
  }

  // level datums, the storey heights spelled out down the left margin
  for (const L of b.levels) {
    out.push(`<line x1="${pad - 20}" y1="${V(L.y)}" x2="${W - pad + 6}" y2="${V(L.y)}" stroke="${P.faint}" stroke-width=".5" stroke-dasharray="3 5"/>`);
    if (F.L(L.h) > 9) out.push(label(pad - 22, V(L.y) - 2, `+${L.y.toFixed(1)}`, P, 7, 'end'));
  }

  out.push(label(pad - 12, H - 8, `Elevation from the ${hand.from}  ·  ${b.height.toFixed(1)} m to parapet`, P, 10, 'start', P.ink));
  out.push(label(W - pad + 12, H - 8, nominalScale(F.s) + ' @ sheet', P, 9, 'end'));
  return frame(W, H, P, id, out.join('\n'));
}

// One bay, drawn as the module it is. `y` is the TOP of the bay in sheet coords.
function bayGlyph(mod, x, y, w, h, P, id) {
  const M = MODULES[mod];
  const g = [];
  const solid = `fill="${P.bg}" fill-opacity=".85" stroke="${P.line}" stroke-width=".9"`;
  const relief = M.depth > 0.5 ? 1 : 0;
  switch (mod) {
    case 'open':
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${P.faint}" stroke-width=".6" stroke-dasharray="3 3"/>`);
      break;
    case 'pier':
    case 'buttress': {
      const pw = Math.min(w, Math.max(3, w * 0.55));
      g.push(`<rect x="${n2(x + (w - pw) / 2)}" y="${y}" width="${n2(pw)}" height="${h}" fill="${P.poche}" stroke="${P.ink}" stroke-width="1.2"/>`);
      break;
    }
    case 'blank':
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${solid}/>`);
      // board-marking: the shuttering lines that are the whole point of béton brut
      for (let i = 1; i * 6 < h; i++)
        g.push(`<line x1="${x}" y1="${n2(y + i * 6)}" x2="${n2(x + w)}" y2="${n2(y + i * 6)}" stroke="${P.faint}" stroke-width=".4"/>`);
      break;
    case 'recess':
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${P.poche}" fill-opacity=".8" stroke="${P.line}" stroke-width=".8"/>`);
      g.push(`<rect x="${n2(x + w * 0.14)}" y="${n2(y + h * 0.1)}" width="${n2(w * 0.72)}" height="${n2(h * 0.8)}" fill="${P.bg}" fill-opacity=".7" stroke="none"/>`);
      break;
    case 'vent': {
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${solid}/>`);
      const n = Math.max(2, Math.floor(h / 5));
      for (let i = 1; i < n; i++)
        g.push(`<line x1="${n2(x + w * 0.12)}" y1="${n2(y + (i * h) / n)}" x2="${n2(x + w * 0.88)}" y2="${n2(y + (i * h) / n)}" stroke="${P.line}" stroke-width="1.1"/>`);
      break;
    }
    case 'brise': {
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${P.glass}" fill-opacity=".18" stroke="${P.line}" stroke-width=".8"/>`);
      const nv = Math.max(2, Math.round(w / 9)), nh = Math.max(2, Math.round(h / 9));
      for (let i = 1; i < nv; i++) g.push(`<line x1="${n2(x + (i * w) / nv)}" y1="${y}" x2="${n2(x + (i * w) / nv)}" y2="${n2(y + h)}" stroke="${P.line}" stroke-width=".8"/>`);
      for (let i = 1; i < nh; i++) g.push(`<line x1="${x}" y1="${n2(y + (i * h) / nh)}" x2="${n2(x + w)}" y2="${n2(y + (i * h) / nh)}" stroke="${P.line}" stroke-width=".8"/>`);
      break;
    }
    case 'oriel':
      g.push(`<rect x="${n2(x + w * 0.1)}" y="${n2(y + h * 0.07)}" width="${n2(w * 0.8)}" height="${n2(h * 0.86)}" fill="${P.bg}" fill-opacity=".9" stroke="${P.ink}" stroke-width="1.3"/>`);
      g.push(`<rect x="${n2(x + w * 0.2)}" y="${n2(y + h * 0.2)}" width="${n2(w * 0.6)}" height="${n2(h * 0.6)}" fill="${P.glass}" fill-opacity=".45" stroke="none"/>`);
      break;
    case 'balcony':
      g.push(`<rect x="${x}" y="${n2(y + h * 0.44)}" width="${w}" height="${n2(h * 0.56)}" ${solid}/>`);
      g.push(`<rect x="${x}" y="${n2(y + h * 0.12)}" width="${w}" height="${n2(h * 0.3)}" fill="${P.glass}" fill-opacity=".35" stroke="${P.line}" stroke-width=".7"/>`);
      g.push(`<line x1="${x}" y1="${n2(y + h * 0.44)}" x2="${n2(x + w)}" y2="${n2(y + h * 0.44)}" stroke="${P.ink}" stroke-width="1.6"/>`);
      break;
    case 'rose': {
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${solid}/>`);
      const r = Math.min(w, h) * 0.3;
      g.push(`<circle cx="${n2(x + w / 2)}" cy="${n2(y + h * 0.42)}" r="${n2(r)}" fill="${P.glass}" fill-opacity=".4" stroke="${P.ink}" stroke-width="1.2"/>`);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.push(`<line x1="${n2(x + w / 2)}" y1="${n2(y + h * 0.42)}" x2="${n2(x + w / 2 + Math.cos(a) * r)}" y2="${n2(y + h * 0.42 + Math.sin(a) * r)}" stroke="${P.line}" stroke-width=".6"/>`);
      }
      break;
    }
    case 'lancet':
    case 'slit':
    case 'band':
    default: {
      const gw = mod === 'band' ? w * 0.9 : w * (mod === 'lancet' ? 0.24 : 0.36);
      const gh = mod === 'band' ? h * 0.46 : h * 0.68;
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${solid}/>`);
      g.push(`<rect x="${n2(x + (w - gw) / 2)}" y="${n2(y + (h - gh) * 0.38)}" width="${n2(gw)}" height="${n2(gh)}" fill="${P.glass}" fill-opacity=".42" stroke="${P.ink}" stroke-width=".9"/>`);
      break;
    }
  }
  if (relief) g.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${n2(y + h)}" stroke="${P.ink}" stroke-width=".6" opacity=".7"/>`);
  return `<g data-module="${mod}">${g.join('')}</g>`;
}

/* ───────────────────────────────  SECTION  ──────────────────────────────── */

export function sectionSVG(b, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 460, pad = opts.pad || 34;
  const id = opts.id || 'sec';
  const cutZ = opts.cutZ != null ? opts.cutZ : 0;
  const S = archSection(b, cutZ);
  const bx = plateBounds(b);
  const topY = b.height * 1.06;
  const F = fitter(bx.x0, bx.x1, 0, topY, W, H - 26, pad);
  const V = (y) => F.Y(topY - y);   // y=0 is the ground line, at the bottom of the sheet
  const out = [];

  out.push(`<line x1="${pad - 14}" y1="${V(0)}" x2="${W - pad + 14}" y2="${V(0)}" stroke="${P.ink}" stroke-width="2"/>`);
  // ground poché
  out.push(`<rect x="${pad - 14}" y="${V(0)}" width="${n2(W - 2 * pad + 28)}" height="10" fill="url(#${id}-hatch)" opacity=".6"/>`);

  for (const row of S.rows) {
    for (const [x0, x1] of row.spans) {
      // the storey volume, then the slab cut heavy — that is what a section IS
      out.push(`<rect x="${F.X(x0)}" y="${V(row.y + row.h)}" width="${n2(F.L(x1 - x0))}" height="${n2(F.L(row.h))}" fill="${P.bg}" fill-opacity=".8" stroke="${P.line}" stroke-width=".9"/>`);
      out.push(`<rect x="${F.X(x0)}" y="${V(row.y + 0.42)}" width="${n2(F.L(x1 - x0))}" height="${n2(Math.max(2, F.L(0.42)))}" fill="${P.ink}"/>`);
    }
    out.push(`<line x1="${pad - 22}" y1="${V(row.y)}" x2="${W - pad + 8}" y2="${V(row.y)}" stroke="${P.faint}" stroke-width=".4" stroke-dasharray="3 5"/>`);
    if (F.L(row.h) > 10) out.push(label(pad - 24, V(row.y) - 2, `+${row.y.toFixed(1)}`, P, 7, 'end'));
  }

  // cores cut through — the shaft that makes the section legible
  for (const c of b.cores) {
    if (cutZ < c.z - c.d / 2 || cutZ > c.z + c.d / 2) continue;
    const top = b.levels[b.levels.length - 1];
    out.push(`<rect x="${F.X(c.x - c.w / 2)}" y="${V(top.y + top.h)}" width="${n2(F.L(c.w))}" height="${n2(F.L(top.y + top.h))}" fill="url(#${id}-poche)" fill-opacity=".55" stroke="${P.ink}" stroke-width="1.4"/>`);
  }
  for (const t of S.towers) {
    out.push(`<rect x="${F.X(t.x0)}" y="${V(t.h)}" width="${n2(F.L(t.x1 - t.x0))}" height="${n2(F.L(t.h))}" fill="${P.core}" fill-opacity=".6" stroke="${P.ink}" stroke-width="1.5"/>`);
  }

  out.push(dimV2(F, V, 0, b.height, W - pad + 16, P));
  out.push(label(pad - 12, H - 8, `Section A–A  ·  cut at z = ${S.cutZ.toFixed(1)} m`, P, 10, 'start', P.ink));
  out.push(label(W - pad + 12, H - 8, nominalScale(F.s) + ' @ sheet', P, 9, 'end'));
  return frame(W, H, P, id, out.join('\n'));
}

function dimV2(F, V, a, b, x, P) {
  return `<g><line x1="${x}" y1="${V(a)}" x2="${x}" y2="${V(b)}" stroke="${P.faint}" stroke-width=".8"/>` +
    `<line x1="${x - 4}" y1="${V(a)}" x2="${x + 4}" y2="${V(a)}" stroke="${P.faint}"/>` +
    `<line x1="${x - 4}" y1="${V(b)}" x2="${x + 4}" y2="${V(b)}" stroke="${P.faint}"/>` +
    `<text x="${x + 9}" y="${(V(a) + V(b)) / 2}" font-size="8" fill="${P.text}" text-anchor="middle" transform="rotate(-90 ${x + 9} ${(V(a) + V(b)) / 2})">${(b - a).toFixed(1)} m overall</text></g>`;
}

/* ────────────────────────────  TITLE BLOCK  ─────────────────────────────── */

export function titleBlockSVG(b, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 250;
  const id = opts.id || 'tb';
  const p = b.params, S = b.stats;
  const out = [];
  const rows = [
    ['SEED', p.seed],
    ['TYPE', b.typologyLabel],
    ['MASSING', `${p.massing} · ${p.shape}${p.symmetric ? ' · symmetric' : ''}`],
    ['GRID', `${p.bay.toFixed(2)} m · ${p.bx}×${p.bz} bays`],
    ['STOREYS', `${S.levels} @ ${p.floorH.toFixed(2)} m`],
    ['HEIGHT', `${S.height.toFixed(1)} m`],
    ['FOOTPRINT', `${Math.round(S.footprint)} m²`],
    ['GIA', `${Math.round(S.gfa).toLocaleString('en-GB')} m²`],
    ['PLOT RATIO', S.plotRatio.toFixed(2)],
    ['SPACES', String(S.rooms)],
    ['GLAZED', `${S.glazedRatio.toFixed(1)} % of envelope`],
    ['RHYTHM', p.rhythm.map((m) => MODULES[m].label).join(' · ')],
    ['CORES', `${S.cores} core${S.cores === 1 ? '' : 's'} · ${S.towers} tower${S.towers === 1 ? '' : 's'}`],
    ['REV', revision(b)],
  ];
  out.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${P.ink}" stroke-width="1.6"/>`);
  out.push(label(14, 26, 'BRUT · PROCEDURAL ARCHITECTURE', P, 12, 'start', P.accent));
  out.push(`<line x1="8" y1="36" x2="${W - 8}" y2="36" stroke="${P.line}" stroke-width=".9"/>`);
  const colW = (W - 24) / 2;
  rows.forEach((r, i) => {
    const col = i < Math.ceil(rows.length / 2) ? 0 : 1;
    const k = i - col * Math.ceil(rows.length / 2);
    const y = 56 + k * 17, x = 14 + col * colW;
    out.push(label(x, y, r[0], P, 8, 'start', P.text));
    out.push(label(x + 78, y, r[1], P, 9.5, 'start', P.ink));
  });
  return frame(W, H, P, id, out.join('\n'), 'title');
}

/* ─────────────────────────  ROOM SCHEDULE (table)  ──────────────────────── */

export function scheduleSVG(b, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const rowsIn = archSchedule(b);
  const W = opts.width || 640;
  const H = 44 + rowsIn.length * 16 + 10;
  const id = opts.id || 'sch';
  const total = rowsIn.reduce((s, r) => s + r.area, 0) || 1;
  const out = [`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${P.ink}" stroke-width="1.6"/>`];
  out.push(label(14, 24, 'SCHEDULE OF ACCOMMODATION', P, 10, 'start', P.accent));
  out.push(`<line x1="8" y1="32" x2="${W - 8}" y2="32" stroke="${P.line}" stroke-width=".9"/>`);
  rowsIn.forEach((r, i) => {
    const y = 48 + i * 16;
    out.push(label(14, y, r.program, P, 9, 'start', P.ink));
    out.push(label(W * 0.56, y, String(r.count), P, 9, 'end'));
    out.push(label(W * 0.72, y, `${Math.round(r.area).toLocaleString('en-GB')} m²`, P, 9, 'end'));
    const bw = (W * 0.24) * (r.area / total);
    out.push(`<rect x="${n2(W * 0.74)}" y="${n2(y - 7)}" width="${n2(Math.max(1, bw))}" height="8" fill="${P.accent}" opacity=".55"/>`);
  });
  return frame(W, H, P, id, out.join('\n'), 'schedule');
}

/* ──────────────────────────────  FULL SHEET  ────────────────────────────── */
//
// Everything a set needs, in one string: the general arrangement plans, four
// elevations, the section, the schedule and the title block. The page uses the
// pieces; this exists so a whole set can be produced (and tested) headless.

export function sheetSVG(b, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const w = opts.width || 640;
  const parts = [titleBlockSVG(b, { ...opts, palette: P, width: w, height: 260 })];
  for (let i = 0; i < b.levels.length; i++) parts.push(planSVG(b, i, { ...opts, palette: P, width: w }));
  for (const s of ['N', 'E', 'S', 'W']) parts.push(elevationSVG(b, s, { ...opts, palette: P, width: w }));
  parts.push(sectionSVG(b, { ...opts, palette: P, width: w }));
  parts.push(scheduleSVG(b, { ...opts, palette: P, width: w }));
  return parts.join('\n');
}
