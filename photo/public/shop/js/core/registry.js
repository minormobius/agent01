// registry.js — one table of every manipulation /shop can perform, from a
// levels adjustment to a Droste spiral to a JPEG databend, all behind a single
// contract so the stack editor, the mask system and the selftest never have to
// know where an effect came from.
//
// THE CONTRACT
// ------------
//   apply(src, out, W, H, P, ctx)   read `src`, write `out`, return `out`
//
//   `out` arrives pre-filled with `src`. `P` is the full parameter block
//   (defaults merged with the layer's own). `ctx` carries `{ seed, mask, index }`.
//   **An effect must never blend for itself** — the stack blends its output
//   back through the mask, which is what makes "only inside the lasso" a
//   guarantee the selftest can check rather than a promise each effect keeps
//   by hand.
//
// WHY ADAPTERS AND NOT A REWRITE
// ------------------------------
// The neighbouring tools on this surface already hold the hard parts: /glitch
// has twelve seeded, mask-aware destroyers; /lens has fifteen warps with their
// conformality proved; /glass has the SLIC projection. Those files are imported
// as they stand and wrapped here. Nothing is copied. When /lens gains a map it
// appears in this registry on the next reload, and if /glitch changes an
// operator's maths, /shop changes with it — which is the point of them living
// in one repository.
//
// Namespaced ids (`adjust:levels`, `glitch:sort`, `lens:droste`) keep the four
// sources from colliding — both /glitch and this file have a `posterize`, and
// they are different operators with different parameters.

import { OPS as GLITCH_OPS } from '../../../glitch/js/glitch.js';
import { MAPS as LENS_MAPS } from '../../../lens/js/conformal.js';
import { render as lensRender, buildMips } from '../../../lens/js/conformal.js';
import { stainedGlass, PALETTES as GLASS_STOCK } from '../../../glass/js/glass.js';
import { ADJUSTMENTS } from './adjust.js';
import { FILTERS } from './filters.js';
import { hexToRgb, luma } from './pixels.js';

/** Menu order, and the only place group labels are written down. */
export const GROUPS = [
  { id: 'adjust', label: 'adjust', note: 'tone and colour, one pixel at a time' },
  { id: 'filter', label: 'filter', note: 'blur, sharpen, stylise — the ones that need neighbours' },
  { id: 'warp', label: 'warp', note: 'conformal maps, measured — from /lens' },
  { id: 'damage', label: 'damage', note: 'seeded, steerable glitch — from /glitch' },
  { id: 'cut', label: 'cut', note: 'piecewise-constant projections — from /glass' },
];

export const EFFECTS = {};

export function registerEffect(id, spec) {
  EFFECTS[id] = { id, ...spec };
  return EFFECTS[id];
}

/**
 * Effects that are exactly the identity at their default parameters — you can
 * add one to a stack and nothing happens until you move a slider. Kept as one
 * table because it is a claim about the whole registry, and `shop.selftest.mjs`
 * proves every line of it byte for byte. Anything absent is an effect whose
 * defaults deliberately *do* something (posterise, halftone, the glass cut);
 * for those the selftest checks the amount-zero path instead.
 */
const NEUTRAL = new Set([
  'adjust:exposure', 'adjust:levels', 'adjust:curves', 'adjust:contrast',
  'adjust:hsl', 'adjust:vibrance', 'adjust:temperature', 'adjust:mixer',
  'filter:blur', 'filter:sharpen', 'filter:clarity', 'filter:shadows',
  'filter:median', 'filter:grain', 'filter:vignette', 'filter:bloom',
  'filter:aberration',
]);

// ─────────────────────────────────────────────── native adjust + filter ──

for (const [key, spec] of Object.entries(ADJUSTMENTS)) {
  registerEffect(`adjust:${key}`, { ...spec, group: 'adjust' });
}
for (const [key, spec] of Object.entries(FILTERS)) {
  registerEffect(`filter:${key}`, { ...spec, group: 'filter' });
}

// ────────────────────────────────────────────────────── /glitch adapter ──
//
// A straight pass-through: /glitch's operators already take exactly this
// signature and already read `ctx.mask`, because /shop's stack is the same idea
// its stack was built on. The async one (the real JPEG databender, which needs
// a browser encoder) is registered separately by the app — see codec-bridge.js.

for (const [key, spec] of Object.entries(GLITCH_OPS)) {
  if (spec.async) continue;
  registerEffect(`glitch:${key}`, {
    label: spec.label,
    note: spec.note,
    group: 'damage',
    params: spec.params,
    seeded: true,
    apply: spec.apply,
  });
}

// ──────────────────────────────────────────────────────── /lens adapter ──
//
// /lens warps the whole frame at once, so each map becomes an effect whose
// recipe holds exactly one map. `edge` decides what lies outside the picture;
// `void` leaves it transparent, which is the one that composites usefully in a
// layer stack — a warped layer over an unwarped one, with nothing invented at
// the border.
//
// Each warp builds its own mip pyramid. That is deliberate: the stack blends
// into the same buffer between steps, so a pyramid cached across steps would be
// a pyramid of the previous picture — the kind of stale-cache bug that shows up
// only when two warps are stacked, which is exactly when it would be used.

const EDGE_PARAM = {
  type: 'enum', options: ['clamp', 'mirror', 'tile', 'void'], def: 'void', label: 'outside the frame',
};

for (const [key, spec] of Object.entries(LENS_MAPS)) {
  registerEffect(`lens:${key}`, {
    label: spec.label,
    note: `${spec.note}\n\nDeclared ${spec.kind}; /lens measures and proves it.`,
    group: 'warp',
    kind: spec.kind,
    params: { ...spec.params, edge: EDGE_PARAM },
    apply(src, out, W, H, P) {
      const { edge, ...mapParams } = P;
      const mips = buildMips(src, W, H);
      const res = lensRender(src, W, H, W, H, {
        edge, bias: 0, ops: [{ map: key, on: true, params: mapParams }],
      }, { measure: false, mips });
      out.set(res.rgba);
      return out;
    },
  });
}

// ─────────────────────────────────────────────────────── /glass adapter ──

// 'none' keeps the projection exact — every piece its own mean colour. Naming a
// stock adds a *second* projection, onto glass a glazier can actually buy, and
// /glass is careful to report that extra error separately rather than folding
// it into the fit. Here it is simply a different picture, and the note says so.
const GLASS_PALETTES = ['none', ...Object.keys(GLASS_STOCK)];

registerEffect('cut:glass', {
  label: 'stained glass',
  note: 'The nearest picture buildable from flat pieces and lead: SLIC fits the pieces, each becomes its own mean colour in CIELAB — the orthogonal projection onto "constant on every piece", which is why no other flat cut of the same pieces is closer. From /glass, where the claim is proved.',
  group: 'cut',
  heavy: true,
  params: {
    pieces: { min: 20, max: 4000, step: 10, def: 500, label: 'pieces' },
    compactness: { min: 1, max: 60, step: 1, def: 18, label: 'compactness' },
    iterations: { min: 2, max: 20, step: 1, def: 8, label: 'iterations' },
    lead: { min: 0, max: 6, step: 1, def: 1, label: 'lead width' },
    leadColor: { type: 'color', def: '#141014', label: 'lead colour' },
    palette: { type: 'enum', options: GLASS_PALETTES, def: 'none', label: 'glass stock' },
  },
  apply(src, out, W, H, P) {
    const stock = GLASS_STOCK[P.palette]?.colors || null;
    const res = stainedGlass(src, W, H, {
      pieces: P.pieces, compactness: P.compactness, iterations: P.iterations,
      palette: stock,
    });
    const { labels, cells } = res;
    for (let i = 0, q = 0; i < W * H; i++, q += 4) {
      const c = cells[labels[i]];
      if (!c) continue;
      out[q] = c.rgb[0]; out[q + 1] = c.rgb[1]; out[q + 2] = c.rgb[2];
      out[q + 3] = src[q + 3];
    }
    if (P.lead > 0) {
      // Lead is drawn from the label map rather than from the traced arcs: at
      // pixel resolution the boundary IS the set of pixels with a differing
      // neighbour, and dilating that by the lead width gives the same line the
      // SVG stroke would, without re-rasterising a vector path.
      const [lr, lg, lb] = hexToRgb(P.leadColor);
      const edge = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const l = labels[i];
          if ((x < W - 1 && labels[i + 1] !== l) || (y < H - 1 && labels[i + W] !== l)) edge[i] = 1;
        }
      }
      const r = Math.max(0, (P.lead | 0) - 1);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!edge[y * W + x]) continue;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue;
              const q = (yy * W + xx) * 4;
              out[q] = lr; out[q + 1] = lg; out[q + 2] = lb;
            }
          }
        }
      }
    }
    return out;
  },
});

registerEffect('cut:mosaic', {
  label: 'mosaic (by tone)',
  note: 'The cheap cousin of the glass cut: quantise brightness into bands and flatten each band to its own mean colour. No SLIC, no geometry — but it runs at interactive speed on a full-size photograph, which the real cut does not.',
  group: 'cut',
  params: {
    bands: { min: 2, max: 32, step: 1, def: 8, label: 'bands' },
    saturate: { min: 0, max: 2, step: 0.01, def: 1, label: 'saturation' },
  },
  apply(src, out, W, H, P) {
    const n = Math.max(2, P.bands | 0);
    const N = W * H;
    const sum = new Float64Array(n * 3), count = new Float64Array(n);
    const band = new Uint8Array(N);
    for (let i = 0, q = 0; i < N; i++, q += 4) {
      const b = Math.min(n - 1, Math.floor((luma(src[q], src[q + 1], src[q + 2]) / 255) * n));
      band[i] = b;
      sum[b * 3] += src[q]; sum[b * 3 + 1] += src[q + 1]; sum[b * 3 + 2] += src[q + 2];
      count[b]++;
    }
    for (let i = 0, q = 0; i < N; i++, q += 4) {
      const b = band[i], k = count[b] || 1;
      const mr = sum[b * 3] / k, mg = sum[b * 3 + 1] / k, mb = sum[b * 3 + 2] / k;
      const y = luma(mr, mg, mb);
      out[q] = y + (mr - y) * P.saturate;
      out[q + 1] = y + (mg - y) * P.saturate;
      out[q + 2] = y + (mb - y) * P.saturate;
      out[q + 3] = src[q + 3];
    }
    return out;
  },
});

// ───────────────────────────────────────────────────────────── helpers ──

for (const id of NEUTRAL) if (EFFECTS[id]) EFFECTS[id].neutral = true;

/** Default parameter block, straight from the schema. */
export function defaults(id) {
  const spec = EFFECTS[id];
  if (!spec) return {};
  const P = {};
  for (const [k, d] of Object.entries(spec.params || {})) {
    P[k] = Array.isArray(d.def) ? d.def.map((v) => (Array.isArray(v) ? v.slice() : v)) : d.def;
  }
  return P;
}

/** A fresh stack entry for an effect. */
export function makeEffect(id) {
  return {
    fx: id,
    on: true,
    amount: 1,
    seed: 0,
    field: { type: 'all', params: {}, invert: false, paintMul: false },
    mask: null,
    params: defaults(id),
  };
}

export const effectsInGroup = (group) =>
  Object.values(EFFECTS).filter((e) => e.group === group);

export const effectLabel = (id) => EFFECTS[id]?.label || id;

/** Every id, grouped and in menu order — what the "add effect" menu is built from. */
export function catalogue() {
  return GROUPS.map((g) => ({ ...g, effects: effectsInGroup(g.id) }));
}
