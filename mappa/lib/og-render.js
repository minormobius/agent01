// mappa/lib/og-render.js — render a generated world to a PNG link-card image.
//
// Server-side (Cloudflare Pages Function / node): a crawler unfurling a world
// permalink can't run the viewer, so we draw the planet here. An equirectangular
// biome raster of the whole globe — the "zoomed-out map" — encoded straight to PNG
// with no image library: nearest-cell sampling for the pixels, the platform's
// CompressionStream (or node:zlib) for the IDAT deflate. Pure + deterministic given
// the world; the output is content-addressed by the world config, so it edge-caches
// forever after the first render.

import { BIOMES } from '../engine.js';

// ---- HSL→RGB (biome palette is authored in HSL) -----------------------------
function hslRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

// ---- deflate (zlib stream) — platform CompressionStream, else node:zlib ------
async function deflate(bytes) {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  const z = await import(/* runtime-only */ 'node:' + 'zlib'); // computed specifier → bundlers leave it alone
  return new Uint8Array(z.deflateSync(bytes));
}

// ---- PNG chunk assembly (CRC32 + signature) ---------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function u32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
function chunk(type, data) {
  const t = new Uint8Array(4); for (let i = 0; i < 4; i++) t[i] = type.charCodeAt(i);
  const body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length);
  const crc = crc32(body);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length)); out.set(body, 4); out.set(u32(crc), 4 + body.length);
  return out;
}
function concat(arrs) { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; }

// ---- the render -------------------------------------------------------------
export async function renderWorldCard(world, opts = {}) {
  const width = opts.width || 1200, height = opts.height || 600;
  const N = world.N, V = world.V, B = world.biome, Wr = world.water, E = world.elev;

  // precompute per-biome RGB (with a little depth/relief shading folded in below)
  const baseRGB = BIOMES.map(b => hslRgb(b.h, b.s, b.l));

  // lon/lat bin index for nearest-cell lookup
  const BX = Math.max(24, Math.round(Math.sqrt(N) * 2)), BY = Math.max(12, Math.round(Math.sqrt(N)));
  const bins = new Array(BX * BY); for (let i = 0; i < bins.length; i++) bins[i] = [];
  const lonOf = p => Math.atan2(p[1], p[0]), latOf = p => Math.asin(Math.max(-1, Math.min(1, p[2])));
  for (let i = 0; i < N; i++) {
    let bx = Math.floor((lonOf(V[i]) / (2 * Math.PI) + 0.5) * BX); bx = ((bx % BX) + BX) % BX;
    let by = Math.floor((0.5 - latOf(V[i]) / Math.PI) * BY); by = Math.max(0, Math.min(BY - 1, by));
    bins[by * BX + bx].push(i);
  }
  const nearest = (vec, bx, by) => {
    let best = -1, bd = -2;
    for (let r = 0; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        const yy = by + dy; if (yy < 0 || yy >= BY) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring shell only
          const xx = ((bx + dx) % BX + BX) % BX;
          const cell = bins[yy * BX + xx];
          for (let k = 0; k < cell.length; k++) {
            const i = cell[k], d = vec[0] * V[i][0] + vec[1] * V[i][1] + vec[2] * V[i][2];
            if (d > bd) { bd = d; best = i; }
          }
        }
      }
      if (best >= 0 && r >= 1) break; // one ring past first hit is plenty
    }
    return best;
  };

  // raster: equirectangular (plate carrée), whole globe
  const px = new Uint8Array(width * height * 3);
  const LIGHT = [-0.42, 0.36, 0.83]; // gentle hillshade direction
  for (let y = 0; y < height; y++) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI, sl = Math.sin(lat), cl = Math.cos(lat);
    let by = Math.floor((0.5 - lat / Math.PI) * BY); by = Math.max(0, Math.min(BY - 1, by));
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
      let bx = Math.floor((lon / (2 * Math.PI) + 0.5) * BX); bx = ((bx % BX) + BX) % BX;
      const vec = [cl * Math.cos(lon), cl * Math.sin(lon), sl];
      const i = nearest(vec, bx, by);
      let r = 30, g = 40, b = 55;
      if (i >= 0) {
        const c = baseRGB[B[i]]; r = c[0]; g = c[1]; b = c[2];
        if (Wr[i] === 0) { // land: nudge lightness by elevation + a faint hillshade
          const nd = 0.86 + 0.20 * Math.max(0, vec[0] * LIGHT[0] + vec[1] * LIGHT[1] + vec[2] * LIGHT[2]);
          const lift = 1 + Math.min(0.35, E[i] * 0.5);
          r = Math.min(255, r * nd * lift); g = Math.min(255, g * nd * lift); b = Math.min(255, b * nd * lift);
        }
      }
      const o = (y * width + x) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b;
    }
  }

  // PNG: filter-byte-0 scanlines → zlib → IDAT
  const stride = width * 3, raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) { raw[y * (1 + stride)] = 0; raw.set(px.subarray(y * stride, y * stride + stride), y * (1 + stride) + 1); }
  const idat = await deflate(raw);
  const ihdr = concat([u32(width), u32(height), new Uint8Array([8, 2, 0, 0, 0])]); // 8-bit, colour type 2 (RGB)
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
}
