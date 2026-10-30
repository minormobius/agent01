// Die faces as PNG, drawn in the Worker. Modulo, 2026-10-11.
// No renderer and no stored faces: a picture of each die is drawn from geometry (convex facets, filled with
// an analytic anti-aliased edge) and digits drawn as round-capped strokes, then packed as a PNG with
// CompressionStream('deflate'). One picture per roll, so every blob is referenced by the post that carries it
// and none of them is ever an orphan.

import { wire } from './polytopes.mjs';
const TAU = Math.PI * 2;
// 4-D dice (10-29): d5 d16 d24 d120 d600 are drawn as their solids' Coxeter-plane shadows, the cell on top lit.
// d8 stays the octahedron: the same numbers, and an ask for "d8" has always meant that die.
export const SIDES4 = [5, 16, 24, 120, 600];
export const SIDES = [4, 5, 6, 8, 10, 12, 16, 20, 24, 120, 600];
const COLOR = { 4: [196, 62, 58], 6: [236, 228, 210], 8: [120, 78, 168], 10: [32, 140, 136], 12: [222, 126, 40], 20: [52, 72, 170],
  5: [120, 200, 230], 16: [150, 220, 140], 24: [240, 190, 90], 120: [230, 130, 200], 600: [170, 170, 250] };
const BG = [24, 58, 48];

// digit strokes on a 0..1 x 0..1.6 box (y down); arcs are polylines
function arc(cx, cy, rx, ry, a0, a1, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}
const P = Math.PI;
const GLYPH = {
  0: [arc(0.5, 0.8, 0.42, 0.72, 0, TAU, 24)],
  1: [[[0.22, 0.32], [0.55, 0.08], [0.55, 1.52]], [[0.25, 1.52], [0.85, 1.52]]],
  2: [arc(0.5, 0.48, 0.38, 0.38, P * 1.05, P * 2.15, 12).concat([[0.12, 1.52], [0.9, 1.52]])],
  3: [arc(0.5, 0.43, 0.36, 0.35, P * 1.1, P * 2.5, 12), arc(0.5, 1.12, 0.4, 0.4, P * 1.5, P * 2.9, 12)],
  4: [[[0.68, 1.55], [0.68, 0.08], [0.08, 1.12], [0.95, 1.12]]],
  5: [[[0.86, 0.08], [0.2, 0.08], [0.14, 0.72]].concat(arc(0.5, 1.07, 0.42, 0.45, P * 1.22, P * 2.85, 14))],
  6: [arc(0.5, 1.1, 0.4, 0.42, 0, TAU, 18), [[0.1, 1.1], [0.15, 0.6]].concat(arc(0.55, 0.5, 0.4, 0.42, P, P * 1.75, 8))],
  7: [[[0.1, 0.08], [0.9, 0.08], [0.38, 1.55]]],
  8: [arc(0.5, 0.42, 0.33, 0.34, 0, TAU, 18), arc(0.5, 1.13, 0.4, 0.4, 0, TAU, 18)],
  9: [arc(0.5, 0.5, 0.4, 0.42, 0, TAU, 18), [[0.9, 0.5], [0.85, 1.0]].concat(arc(0.45, 1.1, 0.4, 0.42, 0, P * 0.75, 8))],
};

// a die's 2-D icon: facets (convex polygons) with a shade, and the face the number sits on (centre, height)
function shape(sides, cx, cy, R) {
  const ring = (n, r, rot) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rot + TAU * i / n), cy + r * Math.sin(rot + TAU * i / n)]);
  if (sides === 4) {
    const t = ring(3, R, -P / 2), c = [cx, cy + R * 0.12];
    return { facets: [[t[0], t[1], c, 1.0], [t[1], t[2], c, 0.72], [t[2], t[0], c, 0.86]].map((f) => ({ poly: f.slice(0, 3), shade: f[3] })), label: [cx, cy + R * 0.02, R * 0.42] };
  }
  if (sides === 6) {
    const s = R * 0.78;
    return { facets: [{ poly: [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]], shade: 1.0 }], pips: true, label: [cx, cy, s] };
  }
  if (sides === 8) {   // an octahedron face-on: a hexagon, the front face on alternate corners
    const h = ring(6, R, -P / 2);
    return { facets: [
      { poly: [h[0], h[1], h[2]], shade: 0.74 }, { poly: [h[2], h[3], h[4]], shade: 0.58 }, { poly: [h[4], h[5], h[0]], shade: 0.66 },
      { poly: [h[0], h[2], h[4]], shade: 1.0 }], label: [cx, cy + R * 0.1, R * 0.4] };
  }
  if (sides === 10) {
    const top = [cx, cy - R], l = [cx - R * 0.95, cy + R * 0.05], r = [cx + R * 0.95, cy + R * 0.05], b = [cx, cy + R * 0.42];
    const ll = [cx - R * 0.62, cy + R * 0.6], rr = [cx + R * 0.62, cy + R * 0.6], bot = [cx, cy + R * 0.88];
    return { facets: [
      { poly: [top, l, ll], shade: 0.66 }, { poly: [top, rr, r], shade: 0.74 },
      { poly: [ll, b, bot], shade: 0.56 }, { poly: [b, rr, bot], shade: 0.6 },
      { poly: [top, ll, b], shade: 0.9 }, { poly: [top, b, rr], shade: 0.9 },
      { poly: [top, [cx - R * 0.5, cy + R * 0.22], b, [cx + R * 0.5, cy + R * 0.22]], shade: 1.0 }], label: [cx, cy + R * 0.02, R * 0.36] };
  }
  if (sides === 12) {
    const o = ring(10, R, -P / 2), p = ring(5, R * 0.6, -P / 2);
    const fac = [{ poly: p, shade: 1.0 }];
    for (let i = 0; i < 5; i++) fac.push({ poly: [p[i], o[2 * i], o[2 * i + 1], o[(2 * i + 2) % 10], p[(i + 1) % 5]], shade: 0.58 + 0.08 * ((i * 3) % 5) });
    return { facets: fac, label: [cx, cy + R * 0.02, R * 0.4] };
  }
  const h = ring(6, R, -P / 2), t = ring(3, R * 0.62, -P / 2);   // d20
  const fac = [{ poly: t, shade: 1.0 }];
  for (let i = 0; i < 3; i++) {
    const a = t[i], b = t[(i + 1) % 3], v = h[2 * i + 1];
    fac.push({ poly: [a, v, b], shade: 0.78 - 0.07 * i });
    fac.push({ poly: [a, h[2 * i], v], shade: 0.6 + 0.05 * i });
    fac.push({ poly: [b, v, h[(2 * i + 2) % 6]], shade: 0.52 + 0.06 * i });
  }
  return { facets: fac, label: [cx, cy + R * 0.12, R * 0.38] };
}

// coverage of a convex polygon at a pixel (signed distance to the polygon, anti-aliased over 1 px)
function convexDist(poly, x, y) {
  let d = -Infinity, area = 0;
  for (let i = 0; i < poly.length; i++) { const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]; area += ax * by - bx * ay; }
  const s = area > 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const ex = bx - ax, ey = by - ay, L = Math.hypot(ex, ey) || 1;
    const dd = s * (ex * (y - ay) - ey * (x - ax)) / L;      // >0 outside this edge
    if (-dd > d) d = -dd;
  }
  return d;
}
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const segDist = (x, y, ax, ay, bx, by) => {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2));
  return Math.hypot(x - ax - t * ex, y - ay - t * ey);
};

// the drawable list for one die: layers of { kind, bbox, color, ... }
function layers(sides, value, cx, cy, R) {
  const sh = shape(sides, cx, cy, R), base = COLOR[sides], out = [];
  const dark = base.map((c) => c * 0.35), light = sides === 6;
  for (const f of sh.facets) {
    const col = base.map((c) => Math.min(255, c * f.shade));
    let poly = f.poly;
    if (f.round) { // rounded square: shrink, and grow the distance by the radius
      const r = f.round, [x0, y0] = poly[0], [x1, y1] = poly[2];
      poly = [[x0 + r, y0 + r], [x1 - r, y0 + r], [x1 - r, y1 - r], [x0 + r, y1 - r]];
      out.push({ kind: 'poly', poly, grow: r, col });
    } else out.push({ kind: 'poly', poly, grow: 0, col });
  }
  out.push({ kind: 'edges', polys: sh.facets.map((f) => f.poly), w: Math.max(1, R * 0.018), col: dark.map((c) => c + 10), skip: !!sh.pips });
  const ink = light ? [40, 34, 30] : [250, 246, 236];
  if (sh.pips) {
    const s = sh.label[2] * 0.55, pr = R * 0.12;
    const at = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[value];
    for (const [i, j] of at) out.push({ kind: 'dot', x: cx + i * s, y: cy + j * s, r: pr, col: value === 1 ? [190, 40, 40] : ink });
    return out;
  }
  const [lx, ly, lh] = sh.label, digits = String(value).split('').map(Number);
  const gh = lh, gw = gh / 1.6 * 0.95, gap = gw * 0.22, total = digits.length * gw + (digits.length - 1) * gap;
  const segs = [];
  digits.forEach((d, k) => {
    const ox = lx - total / 2 + k * (gw + gap), oy = ly - gh / 2;
    for (const line of GLYPH[d]) for (let i = 0; i + 1 < line.length; i++)
      segs.push([ox + line[i][0] * gw, oy + line[i][1] * gw, ox + line[i + 1][0] * gw, oy + line[i + 1][1] * gw]);
  });
  const w = gh * 0.075;
  out.push({ kind: 'strokes', segs, w: w + Math.max(1.2, R * 0.025), col: dark });   // outline
  out.push({ kind: 'strokes', segs, w, col: ink });
  if (value === 6 || value === 9) out.push({ kind: 'strokes', segs: [[lx - total / 2, ly + gh / 2 + w * 2.6, lx + total / 2, ly + gh / 2 + w * 2.6]], w: w * 0.8, col: ink });
  return out;
}

// a 4-D die: every edge thin and dim, the lit cell's edges bright, the number on a dark disc in the middle.
// Each layer is drawn into its own coverage buffer (max, not sum), so crossing edges don't pile up.
function wireDie(sides, value, cx, cy, R, x0, y0, tile, blend) {
  const { dim, lit } = wire(sides, value), base = COLOR[sides], many = dim.length > 300;
  const buf = new Float32Array(tile * tile);
  const pass = (segs, w, col, alpha) => {
    buf.fill(0);
    for (const [ax, ay, bx, by] of segs) {
      const X0 = cx + ax * R, Y0 = cy + ay * R, X1 = cx + bx * R, Y1 = cy + by * R, pad = w + 1.5;
      const i0 = Math.max(0, Math.floor(Math.min(X0, X1) - pad - x0)), i1 = Math.min(tile, Math.ceil(Math.max(X0, X1) + pad - x0));
      const j0 = Math.max(0, Math.floor(Math.min(Y0, Y1) - pad - y0)), j1 = Math.min(tile, Math.ceil(Math.max(Y0, Y1) + pad - y0));
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const a = clamp(w + 0.5 - segDist(x0 + i + 0.5, y0 + j + 0.5, X0, Y0, X1, Y1));
        if (a > buf[j * tile + i]) buf[j * tile + i] = a;
      }
    }
    for (let j = 0; j < tile; j++) for (let i = 0; i < tile; i++) if (buf[j * tile + i] > 0) blend(x0 + i, y0 + j, col, buf[j * tile + i] * alpha);
  };
  // a faint disc behind, so the die reads as a body
  for (let j = 0; j < tile; j++) for (let i = 0; i < tile; i++) {
    const d = Math.hypot(x0 + i + 0.5 - cx, y0 + j + 0.5 - cy);
    blend(x0 + i, y0 + j, base.map((c) => c * 0.22), clamp(R * 1.04 + 0.5 - d) * 0.9);
  }
  pass(dim, many ? 0.45 : 0.8, base.map((c) => c * 0.8), many ? 0.55 : 0.75);
  pass(lit, many ? 1.3 : 1.8, base.map((c) => Math.min(255, c * 0.35 + 170)), 1);
  const digits = String(value).split('').map(Number), gh = R * (digits.length > 2 ? 0.26 : 0.32);
  const gw = gh / 1.6 * 0.95, gap = gw * 0.22, total = digits.length * gw + (digits.length - 1) * gap;
  const br = Math.max(total, gh) * 0.5 + gh * 0.45;
  for (let j = 0; j < tile; j++) for (let i = 0; i < tile; i++) blend(x0 + i, y0 + j, [16, 20, 28], clamp(br + 0.5 - Math.hypot(x0 + i + 0.5 - cx, y0 + j + 0.5 - cy)) * 0.88);
  const segs = [];
  digits.forEach((d, k) => {
    const ox = cx - total / 2 + k * (gw + gap), oy = cy - gh / 2;
    for (const line of GLYPH[d]) for (let i = 0; i + 1 < line.length; i++) segs.push([ox + line[i][0] * gw, oy + line[i][1] * gw, ox + line[i + 1][0] * gw, oy + line[i + 1][1] * gw]);
  });
  pass(segs.map(([a, b, c, d]) => [(a - cx) / R, (b - cy) / R, (c - cx) / R, (d - cy) / R]), gh * 0.075, [250, 246, 236], 1);
}

// draw dice: list of { sides, value } in a grid; returns { width, height, rgb }
export function draw(dice, tile = 220) {
  const n = dice.length, cols = Math.min(n, 5), rows = Math.ceil(n / 5);
  const W = cols * tile, H = rows * tile, rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 1 - 0.18 * Math.hypot((x - W / 2) / W, (y - H / 2) / H);
    const o = (y * W + x) * 3; rgb[o] = BG[0] * v; rgb[o + 1] = BG[1] * v; rgb[o + 2] = BG[2] * v;
  }
  const blend = (x, y, col, a) => {
    if (a <= 0) return; const o = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) rgb[o + c] = rgb[o + c] + (col[c] - rgb[o + c]) * a;
  };
  dice.forEach(({ sides, value }, i) => {
    const cx = (i % 5) * tile + tile / 2, cy = Math.floor(i / 5) * tile + tile / 2, R = tile * 0.42;
    const x0 = Math.floor(cx - tile / 2), y0 = Math.floor(cy - tile / 2);
    // soft shadow
    for (let y = y0; y < y0 + tile; y++) for (let x = x0; x < x0 + tile; x++) {
      const d = Math.hypot((x - cx - R * 0.08) / (R * 1.02), (y - cy - R * 0.14) / (R * 0.98));
      blend(x, y, [0, 0, 0], 0.35 * clamp((1.05 - d) * 4));
    }
    if (SIDES4.includes(sides)) { wireDie(sides, value, cx, cy, R, x0, y0, tile, blend); return; }
    for (const L of layers(sides, value, cx, cy, R)) {
      const pts = L.kind === 'poly' ? L.poly : L.kind === 'dot' ? [[L.x, L.y]] : L.kind === 'strokes' ? L.segs.flatMap((q) => [[q[0], q[1]], [q[2], q[3]]]) : L.polys.flat();
      const pad = (L.grow || L.r || L.w || 0) + 2;
      const bx0 = Math.max(x0, Math.floor(Math.min(...pts.map((q) => q[0])) - pad)), bx1 = Math.min(x0 + tile, Math.ceil(Math.max(...pts.map((q) => q[0])) + pad));
      const by0 = Math.max(y0, Math.floor(Math.min(...pts.map((q) => q[1])) - pad)), by1 = Math.min(y0 + tile, Math.ceil(Math.max(...pts.map((q) => q[1])) + pad));
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let a = 0;
        if (L.kind === 'poly') a = clamp(0.5 - (convexDist(L.poly, px, py) - L.grow));
        else if (L.kind === 'dot') a = clamp(L.r + 0.5 - Math.hypot(px - L.x, py - L.y));
        else if (L.kind === 'strokes') { let d = Infinity; for (const s of L.segs) { const e = segDist(px, py, ...s); if (e < d) d = e; } a = clamp(L.w + 0.5 - d); }
        else if (L.kind === 'edges' && !L.skip) {
          let d = Infinity;
          for (const p of L.polys) for (let k = 0; k < p.length; k++) { const e = segDist(px, py, ...p[k], ...p[(k + 1) % p.length]); if (e < d) d = e; }
          a = clamp(L.w + 0.5 - d) * 0.9;
        }
        blend(x, y, L.col, a);
      }
    }
  });
  return { width: W, height: H, rgb };
}

// --- PNG ----------------------------------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export async function png({ width, height, rgb }) {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1); }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export async function dicePng(dice) { const img = draw(dice); return { bytes: await png(img), width: img.width, height: img.height }; }
