// Morphyx's avatar candidates: drawn and measured from the same polygon data.
// node proposals/morphyx-avatar.mjs            -> writes SVGs, prints 48 px measurements
// node proposals/morphyx-avatar.mjs --ascii    -> also prints each 48 px raster as text
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const S = 512, C = 256, BG = '#14161c';           // same ground as Modulo's, so the two sets compare
const FILLS = ['#D55E00', '#56B4E9', '#F0E442'];  // Okabe-Ito: vermillion, sky, yellow
const TAU = Math.PI * 2;

// --- shapes: {poly, fill} filled polygons, {line:[a,b], w, fill} thick segments, painted in order
function reuleaux(side = 372, gap = 30) {
  // Reuleaux triangle: each edge is an arc centred on the opposite corner, radius = side.
  // Split into three sectors (one per part) by bars of background from the centre to each corner.
  const R = side / Math.sqrt(3);                    // centre to corner
  const cy = C + (R - (side - R)) / 2;              // centre the figure's height in the square
  const V = [0, 1, 2].map((k) => { const a = -Math.PI / 2 + k * TAU / 3; return [C + R * Math.cos(a), cy + R * Math.sin(a)]; });
  const shapes = [];
  for (let k = 0; k < 3; k++) {
    // sector k spans corner V[k] -> V[k+1]; its outer edge is the arc centred on the third corner
    const a = V[k], b = V[(k + 1) % 3], o = V[(k + 2) % 3];
    const t0 = Math.atan2(a[1] - o[1], a[0] - o[0]); let t1 = Math.atan2(b[1] - o[1], b[0] - o[0]);
    if (t1 < t0) t1 += TAU;
    const poly = [[C, cy]];
    for (let i = 0; i <= 48; i++) { const t = t0 + (t1 - t0) * i / 48; poly.push([o[0] + side * Math.cos(t), o[1] + side * Math.sin(t)]); }
    shapes.push({ poly, fill: FILLS[k] });
  }
  for (const v of V) shapes.push({ line: [[C, cy], v], w: gap, fill: BG, cap: 'butt' });
  return { shapes, feature: { gap_px: gap, sector_part: 'one sector per part' } };
}

function gear(cx, cy, root, tip, n, phase) {
  const poly = [];
  for (let i = 0; i < n; i++) {
    const a = phase + i * TAU / n, h = TAU / n;
    const pts = [[a, root], [a + h * 0.1, tip], [a + h * 0.4, tip], [a + h * 0.5, root]];
    for (const [t, r] of pts) poly.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return poly;
}
function gears() {
  // three meshing spur gears, 9 teeth each, centres on a triangle
  const root = 66, tip = 88, n = 9, d = 2 * root + 14, R = d / Math.sqrt(3);
  const shapes = [0, 1, 2].map((k) => {
    const a = -Math.PI / 2 + k * TAU / 3;
    return { poly: gear(C + R * Math.cos(a), C + 12 + R * Math.sin(a), root, tip, n, a + k * Math.PI / n), fill: FILLS[k] };
  });
  return { shapes, feature: { tooth_tip_px_at_512: +(0.3 * TAU / n * tip).toFixed(1) } };
}

const CANDIDATES = { reuleaux: reuleaux(), gears: gears() };

// --- svg
function svg(shapes) {
  const f = (n) => +n.toFixed(2);
  const body = shapes.map((s) => s.poly
    ? `  <polygon fill="${s.fill}" points="${s.poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"/>`
    : `  <line x1="${f(s.line[0][0])}" y1="${f(s.line[0][1])}" x2="${f(s.line[1][0])}" y2="${f(s.line[1][1])}" stroke="${s.fill}" stroke-width="${s.w}" stroke-linecap="butt"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">\n  <rect width="${S}" height="${S}" fill="${BG}"/>\n${body.join('\n')}\n</svg>\n`;
}

// --- raster (same data)
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function onLine(s, x, y) {
  const [[ax, ay], [bx, by]] = s.line, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = ((x - ax) * dx + (y - ay) * dy) / L2;
  if (t < 0 || t > 1) return false;                // butt caps
  const px = ax + t * dx - x, py = ay + t * dy - y;
  return px * px + py * py <= (s.w / 2) ** 2;
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => { const l = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b); };
const contrast = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function raster(shapes, N, ss = 8) {
  const owner = new Int16Array(N * N).fill(-1), cover = new Float64Array(N * N);
  let outside = 0;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const votes = new Map();
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const x = (px + (sx + 0.5) / ss) * S / N, y = (py + (sy + 0.5) / ss) * S / N;
      let who = -1;
      shapes.forEach((s, i) => { if (s.poly ? inPoly(s.poly, x, y) : onLine(s, x, y)) who = s.fill === BG ? -1 : FILLS.indexOf(s.fill); });
      if (who >= 0) { votes.set(who, (votes.get(who) || 0) + 1); if ((x - C) ** 2 + (y - C) ** 2 > C * C) outside++; }
    }
    let best = -1, n = 0, tot = 0;
    for (const [k, v] of votes) { tot += v; if (v > n) { n = v; best = k; } }
    cover[py * N + px] = tot / (ss * ss);
    if (tot / (ss * ss) >= 0.5) owner[py * N + px] = best;
  }
  return { owner, outside, N };
}

function measure(name, N = 48) {
  const { shapes, feature } = CANDIDATES[name], r = raster(shapes, N);
  const counts = FILLS.map((_, k) => r.owner.filter((o) => o === k).length);
  // thinnest visible separation: for each pair of parts, smallest pixel distance between their pixels
  let minSep = Infinity;
  const pts = FILLS.map((_, k) => { const a = []; r.owner.forEach((o, i) => { if (o === k) a.push([i % N, Math.floor(i / N)]); }); return a; });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) for (const [x1, y1] of pts[i]) for (const [x2, y2] of pts[j]) minSep = Math.min(minSep, Math.hypot(x1 - x2, y1 - y2));
  const scale = N / S;
  const feat = Object.fromEntries(Object.entries(feature).map(([k, v]) => typeof v === 'number' ? [k.replace('_at_512', '') + '_at_48', +(v * scale).toFixed(2)] : [k, v]));
  return {
    candidate: name, N,
    ink_outside_round_crop_supersamples: r.outside,
    pixels_per_part: counts,
    nearest_pixels_of_different_parts: +minSep.toFixed(2),
    ...feat,
    contrast_vs_bg: Object.fromEntries(FILLS.map((c) => [c, +contrast(c, BG).toFixed(2)])),
  };
}

function ascii(name, N = 48) {
  const r = raster(CANDIDATES[name].shapes, N), ch = ['R', 'b', 'y'];
  const rows = [];
  for (let y = 0; y < N; y++) { let s = ''; for (let x = 0; x < N; x++) { const inCrop = (x + 0.5 - N / 2) ** 2 + (y + 0.5 - N / 2) ** 2 <= (N / 2) ** 2; const o = r.owner[y * N + x]; s += o >= 0 ? ch[o] : inCrop ? '.' : ' '; } rows.push(s); }
  return rows.join('\n');
}

for (const name of Object.keys(CANDIDATES)) {
  writeFileSync(join(HERE, `morphyx-avatar-${name}.svg`), svg(CANDIDATES[name].shapes));
  console.log(JSON.stringify(measure(name)));
  if (process.argv.includes('--ascii')) console.log(ascii(name) + '\n');
}
