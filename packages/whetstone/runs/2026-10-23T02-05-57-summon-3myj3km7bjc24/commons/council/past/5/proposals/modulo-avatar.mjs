// modulo-avatar.mjs: the avatar candidates as data, the SVGs written from that data, and the
// 48 px check run on the same data. One source, so the drawing tested is the drawing shipped.
//
//   node proposals/modulo-avatar.mjs            write the SVGs, print the 48 px measurements
//   node proposals/modulo-avatar.mjs --ascii    also print each candidate at 48 px as text
//   node proposals/modulo-avatar.mjs --png DIR  also write 48 px and 8x previews to DIR (not here: the lab keeps text)
//
// Shapes are only discs and thick polylines, so the rasterizer below is exact up to its
// 8x8 supersampling, and no image library is needed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const S = 512; // design units; the SVG viewBox is 0 0 512 512

const BG = '#14161c';
// Okabe–Ito: chosen to stay distinct under the three common colour-vision deficiencies.
const C = { vermillion: '#D55E00', sky: '#56B4E9', yellow: '#F0E442', white: '#F4F1EA' };

// Candidate A, "three": three equal discs on a triangle, one per part, with clear gaps.
function three() {
  const r = 78, R = 112, cx = 256, cy = 268; // R: centre of the figure to each disc centre
  const cols = [C.vermillion, C.sky, C.yellow];
  return [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return { kind: 'disc', x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), r, fill: cols[i] };
  });
}

// Candidate B, "3:2": a Lissajous figure, the interval of a fifth drawn as one closed line.
function fifth() {
  const pts = [], n = 720, A = 150;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * 2 * Math.PI;
    pts.push([256 + A * Math.sin(3 * t + Math.PI / 2), 256 + A * Math.sin(2 * t)]);
  }
  return [{ kind: 'line', pts, w: 40, stroke: C.white }];
}

// Candidate C, "three on one line": candidate B's figure with three discs on it. Kept to show it fails.
function both() {
  const line = fifth()[0];
  const at = [0, 240, 480].map((k) => line.pts[k]);
  const cols = [C.vermillion, C.sky, C.yellow];
  return [{ ...line, w: 22 }, ...at.map(([x, y], i) => ({ kind: 'disc', x, y, r: 46, fill: cols[i] }))];
}

export const CANDIDATES = { 'modulo-avatar-three': three(), 'modulo-avatar-fifth': fifth(), 'modulo-avatar-both': both() };

const f = (v) => +v.toFixed(2);
export function svg(shapes) {
  const body = shapes.map((s) => s.kind === 'disc'
    ? `  <circle cx="${f(s.x)}" cy="${f(s.y)}" r="${s.r}" fill="${s.fill}"/>`
    : `  <polyline fill="none" stroke="${s.stroke}" stroke-width="${s.w}" stroke-linejoin="round" stroke-linecap="round" points="${s.pts.filter((_, i) => i % 4 === 0 || i === s.pts.length - 1).map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">\n  <rect width="${S}" height="${S}" fill="${BG}"/>\n${body}\n</svg>\n`;
}

// ---- rasterizer ---------------------------------------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function segDist2(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}
function inside(s, x, y) {
  if (s.kind === 'disc') return (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r * s.r;
  const h2 = (s.w / 2) ** 2;
  for (let i = 1; i < s.pts.length; i++) if (segDist2(x, y, s.pts[i - 1], s.pts[i]) <= h2) return true;
  return false;
}
const colorOf = (s) => hex(s.kind === 'disc' ? s.fill : s.stroke);

// Rasterize to N x N, with ss x ss samples a pixel. Returns rgb and, per pixel, which shape covers the
// majority of samples (-1 for background), for the measurements.
export function raster(shapes, N, ss = 8) {
  const rgb = new Float64Array(N * N * 3), owner = new Int16Array(N * N).fill(-1), bg = hex(BG);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const acc = [0, 0, 0], votes = new Map();
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const x = ((px + (sx + 0.5) / ss) * S) / N, y = ((py + (sy + 0.5) / ss) * S) / N;
      let c = bg, who = -1;
      for (let k = shapes.length - 1; k >= 0; k--) if (inside(shapes[k], x, y)) { c = colorOf(shapes[k]); who = k; break; }
      for (let j = 0; j < 3; j++) acc[j] += c[j];
      votes.set(who, (votes.get(who) || 0) + 1);
    }
    for (let j = 0; j < 3; j++) rgb[(py * N + px) * 3 + j] = acc[j] / (ss * ss);
    owner[py * N + px] = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  }
  return { rgb, owner, N };
}

// ---- measurements -------------------------------------------------------------------------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Ink outside the circle the feed crops to, in design units (sampled on a 512 grid).
function inkOutsideCrop(shapes) {
  let out = 0, all = 0;
  for (let y = 0.5; y < S; y += 2) for (let x = 0.5; x < S; x += 2) {
    if (!shapes.some((s) => inside(s, x, y))) continue;
    all++;
    if ((x - 256) ** 2 + (y - 256) ** 2 > 256 * 256) out++;
  }
  return all ? out / all : 0;
}

// Thinnest part of each shape at N px: for discs the diameter; for lines the stroke width;
// and the narrowest background gap between two different shapes (measured on the design, scaled).
function features(shapes, N) {
  const k = N / S, out = { thinnest_px: Infinity, gap_px: Infinity };
  for (const s of shapes) out.thinnest_px = Math.min(out.thinnest_px, (s.kind === 'disc' ? 2 * s.r : s.w) * k);
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const a = shapes[i], b = shapes[j];
    if (a.kind === 'disc' && b.kind === 'disc') out.gap_px = Math.min(out.gap_px, (Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r) * k);
    else out.gap_px = Math.min(out.gap_px, 0); // a disc on the line touches it by design
  }
  // a self-crossing line's tightest loop: smallest distance between non-neighbouring points, minus the width
  for (const s of shapes) if (s.kind === 'line') {
    let m = Infinity; const P = s.pts, n = P.length;
    for (let i = 0; i < n; i += 3) for (let j = i + 60; j < n - 1; j += 3) if (j - i < n - 60) {
      const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
      if (d > s.w * 0.75) m = Math.min(m, d); // skip true crossings; we want near-misses
    }
    out.loop_hole_px = Math.max(0, (m - s.w) * k);
  }
  return out;
}

// Pixels at 48 that are majority-owned by each shape, inside the crop: does each part survive?
function partsAt(r, shapes) {
  const { owner, N } = r, n = new Array(shapes.length).fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if ((x + 0.5 - N / 2) ** 2 + (y + 0.5 - N / 2) ** 2 > (N / 2) ** 2) continue;
    const o = owner[y * N + x]; if (o >= 0) n[o]++;
  }
  return n;
}

export function measure(shapes, N = 48) {
  const r = raster(shapes, N);
  const fills = [...new Set(shapes.map((s) => s.fill || s.stroke))];
  const pairs = [];
  for (let i = 0; i < fills.length; i++) for (let j = i + 1; j < fills.length; j++) pairs.push(+contrast(fills[i], fills[j]).toFixed(2));
  return {
    px: N,
    contrast_vs_bg: Object.fromEntries(fills.map((c) => [c, +contrast(c, BG).toFixed(2)])),
    contrast_between_fills: pairs,
    ink_outside_round_crop: +inkOutsideCrop(shapes).toFixed(4),
    // gap_px is null when there is only one shape (no gap to measure)
    ...Object.fromEntries(Object.entries(features(shapes, N)).map(([k, v]) => [k, Number.isFinite(v) ? +v.toFixed(2) : null])),
    pixels_per_part_in_crop: partsAt(r, shapes),
  };
}

function ascii(r) {
  const { rgb, N } = r, ramp = ' .:-=+*#%@';
  const rows = [];
  for (let y = 0; y < N; y++) {
    let line = '';
    for (let x = 0; x < N; x++) {
      if ((x + 0.5 - N / 2) ** 2 + (y + 0.5 - N / 2) ** 2 > (N / 2) ** 2) { line += '  '; continue; }
      const i = (y * N + x) * 3, L = lum([rgb[i], rgb[i + 1], rgb[i + 2]]) ** (1 / 2.2);
      const ch = ramp[Math.min(9, Math.floor(L * 10))]; line += ch + ch;
    }
    rows.push(line);
  }
  return rows.join('\n');
}

// Minimal PNG writer (RGB, 8-bit), for previews outside the lab only.
function png(r, scale = 1, crop = true) {
  const { rgb, N } = r, W = N * scale, crcT = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc(W * (W * 3 + 1));
  for (let y = 0; y < W; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale), sy = Math.floor(y / scale), i = (sy * N + sx) * 3;
      const out = crop && (sx + 0.5 - N / 2) ** 2 + (sy + 0.5 - N / 2) ** 2 > (N / 2) ** 2;
      for (let j = 0; j < 3; j++) raw[y * (W * 3 + 1) + 1 + x * 3 + j] = out ? 255 : Math.round(rgb[i + j]);
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(W, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pngDir = process.argv.includes('--png') ? process.argv[process.argv.indexOf('--png') + 1] : null;
  for (const [name, shapes] of Object.entries(CANDIDATES)) {
    const text = svg(shapes);
    writeFileSync(join(HERE, `${name}.svg`), text);
    console.log(name, `(${Buffer.byteLength(text)} bytes of SVG)`, JSON.stringify(measure(shapes, 48)));
    if (process.argv.includes('--ascii')) console.log(ascii(raster(shapes, 48)));
    if (pngDir) {
      mkdirSync(pngDir, { recursive: true });
      const r = raster(shapes, 48);
      writeFileSync(join(pngDir, `${name}-48.png`), png(r, 1));
      writeFileSync(join(pngDir, `${name}-48x8.png`), png(r, 8));
      writeFileSync(join(pngDir, `${name}-400.png`), png(raster(shapes, 400, 2), 1));
    }
  }
}
