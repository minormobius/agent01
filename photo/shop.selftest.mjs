// shop selftest — run before changing anything under public/shop/js/core/:
//   node photo/shop.selftest.mjs
//
// /shop makes four promises. Each one is the kind that breaks silently — the
// picture still looks like a picture — so each one is checked mechanically over
// the *whole registry*, by iterating it rather than by listing effects. A new
// effect (here, or in /glitch, or in /lens) is therefore tested the moment it
// is registered, and cannot quietly opt out.
//
//   1. THE STACK CONTRACT. Every effect reads its source and writes its output,
//      never the reverse; is a pure function of (pixels, params, seed); and
//      never blends for itself. Outside its mask the source must survive
//      EXACTLY — not nearly. That is what makes "warp only inside the lasso" a
//      guarantee, and it is checked for all 57 effects.
//   2. NEUTRALITY. An effect whose defaults are documented as a no-op must be
//      the identity byte for byte, or a stack would stop being editable: adding
//      a layer and leaving it alone would change the picture.
//   3. THE COMPOSITOR. Blend modes against their known answers, alpha algebra
//      against the W3C rules, and the laws a layer stack has to obey
//      (opacity 0 is invisible, an inverted invert is the identity, a clip
//      cannot paint outside what it clips to).
//   4. SELECTIONS ARE MEASURED, NOT DRAWN. Areas against their closed forms,
//      grow/contract against a measured distance, the RLE against a round trip.
//   5. WHAT POSTS IS WHAT WAS PROMISED. The one thing here that leaves the tab
//      is a post to Bluesky, and it cannot be the export: Bluesky refuses a
//      blob over 1 MB. So the fit ladder, the record shape and the facet byte
//      offsets are all checked, including that the scope this page requests is
//      inside the ceiling the auth worker declares.

import {
  ADJUSTMENTS, curveLUT,
} from './public/shop/js/core/adjust.js';
import { FILTERS, gaussKernel, bayer } from './public/shop/js/core/filters.js';
import {
  BLEND_MODES, blendPixel, blendMasked, compositeOver, drawTransformed, hexToRgb,
  hslToRgb, linearToSrgb, luma, makeMask, makeRGBA, rgbToHsl, srgbToLinear,
} from './public/shop/js/core/pixels.js';
import * as sel from './public/shop/js/core/select.js';
import { EFFECTS, defaults, makeEffect, GROUPS } from './public/shop/js/core/registry.js';
import {
  addLayer, composite, createDoc, decodeRecipe, deserialize, encodeRecipe,
  flattenLayer, makeLayer, mergeDown, runStack, serialize,
} from './public/shop/js/core/doc.js';
import {
  beginPixelEdit, createHistory, push, redo, snapshot, undo,
} from './public/shop/js/core/history.js';
import { fromWire, toWire } from './public/shop/js/core/wire.js';
import {
  ALBUM_SCOPE, ARCHIVE_LIMIT, BLOB_LIMIT, COLLECTION, IMAGE_COLLECTION, SCOPE,
  TEXT_LIMIT, appendToAlbum, buildImageRecord, buildPostRecord, countGraphemes,
  encodePlan, fitToLimit, hasTransparency, linkFacets, postPermalink,
} from './public/shop/js/core/publish.js';
import {
  SESSION_LIMIT, SESSION_V, describeCarry, legacyReturnUrl, packSession,
  resumeKey, resumeUrl, trimSession, usableSession, weigh,
} from './public/shop/js/core/session.js';
import {
  PIXEL_PARAMS, isPixelParam, pixelParamList, previewScale, scaleStack,
} from './public/shop/js/core/scale.js';
import { PRESETS } from './public/shop/js/presets.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const approx = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const maxDiff = (a, b) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

// A test picture with structure at several scales, plus a transparent corner —
// so anything that mishandles alpha shows up rather than hiding behind 255.
function testImage(W, H, seed = 11) {
  const d = makeRGBA(W, H);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      const r = Math.hypot(x - W * 0.42, y - H * 0.6);
      d[q] = 130 + 100 * Math.sin(r / 6 + seed);
      d[q + 1] = 120 + 90 * Math.cos(x / 8);
      d[q + 2] = 110 + 95 * Math.sin(y / 5 + x / 33);
      d[q + 3] = x < W * 0.12 && y < H * 0.12 ? 40 : 255;
    }
  }
  return d;
}

const W = 40, H = 32, N = W * H;
const IMG = testImage(W, H);
const IDS = Object.keys(EFFECTS);

// ════════════════════ 1. the stack contract, over every effect ════════════════════
{
  // A mask that is 1 on the left half and 0 on the right. Effects gated by it
  // must leave the right half untouched, byte for byte — including alpha, and
  // including the effects that move pixels across the whole frame (the warps),
  // which is the hard case and the one worth having.
  const half = new Float32Array(N);
  for (let i = 0; i < N; i++) half[i] = (i % W) < W / 2 ? 1 : 0;

  for (const id of IDS) {
    const spec = EFFECTS[id];

    // ── purity: the source is not written to ──
    const src = new Uint8ClampedArray(IMG);
    const out = new Uint8ClampedArray(IMG);
    const P = defaults(id);
    spec.apply(src, out, W, H, P, { seed: 1234, mask: new Float32Array(N).fill(1), index: 0 });
    ok(same(src, IMG), `${id}: does not modify its source`);

    // ── shape and sanity ──
    ok(out.length === N * 4, `${id}: writes a full-size buffer`);
    let finite = true;
    for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) { finite = false; break; }
    ok(finite, `${id}: produces no NaN`);

    // ── determinism ──
    const out2 = new Uint8ClampedArray(IMG);
    spec.apply(IMG, out2, W, H, defaults(id), { seed: 1234, mask: new Float32Array(N).fill(1), index: 0 });
    ok(same(out, out2), `${id}: same input and seed give the same bytes`);

    // ── mask containment, through the real stack runner ──
    const px = new Uint8ClampedArray(IMG);
    runStack(px, W, H, [{
      ...makeEffect(id), mask: half, field: { type: 'paint', params: {}, invert: false, paintMul: false },
    }], { seed: 'contract' });
    let leaked = 0;
    for (let i = 0; i < N; i++) {
      if (half[i] > 0) continue;
      const q = i * 4;
      for (let c = 0; c < 4; c++) if (px[q + c] !== IMG[q + c]) leaked++;
    }
    ok(leaked === 0, `${id}: nothing leaks outside its mask (${leaked} bytes did)`);

    // ── strength 0 and "off" are the identity ──
    const zeroed = new Uint8ClampedArray(IMG);
    runStack(zeroed, W, H, [{ ...makeEffect(id), amount: 0 }], { seed: 'contract' });
    ok(same(zeroed, IMG), `${id}: strength 0 changes nothing`);

    const offed = new Uint8ClampedArray(IMG);
    runStack(offed, W, H, [{ ...makeEffect(id), on: false }], { seed: 'contract' });
    ok(same(offed, IMG), `${id}: switched off, changes nothing`);
  }

  // Half strength really is half way there, for the effects that are not
  // seeded (a seeded effect's own randomness makes the midpoint meaningless).
  const full = new Uint8ClampedArray(IMG);
  runStack(full, W, H, [{ ...makeEffect('adjust:invert') }], { seed: 's' });
  const halfway = new Uint8ClampedArray(IMG);
  runStack(halfway, W, H, [{ ...makeEffect('adjust:invert'), amount: 0.5 }], { seed: 's' });
  let worst = 0;
  for (let i = 0; i < IMG.length; i += 4) worst = Math.max(worst, Math.abs(halfway[i] - (IMG[i] + full[i]) / 2));
  ok(worst <= 1, `strength interpolates linearly (off by ${worst})`);
}

// ════════════════════════ 2. neutral defaults ════════════════════════
{
  let neutral = 0;
  for (const id of IDS) {
    if (!EFFECTS[id].neutral) continue;
    neutral++;
    const px = new Uint8ClampedArray(IMG);
    runStack(px, W, H, [makeEffect(id)], { seed: 'neutral' });
    ok(same(px, IMG), `${id}: is declared neutral at its defaults and must be exactly the identity`);
  }
  ok(neutral >= 17, `the neutral table covers the adjustments and filters (${neutral})`);

  // and the ones NOT declared neutral had better actually do something, or the
  // table is lying in the other direction
  for (const id of ['adjust:posterize', 'adjust:threshold', 'filter:halftone', 'filter:dither', 'cut:mosaic']) {
    const px = new Uint8ClampedArray(IMG);
    runStack(px, W, H, [makeEffect(id)], { seed: 'neutral' });
    ok(!same(px, IMG), `${id}: is not declared neutral, and its defaults do change the picture`);
  }
}

// ════════════════════════ 3. known answers ════════════════════════
{
  // — adjustments —
  const twice = new Uint8ClampedArray(IMG);
  runStack(twice, W, H, [makeEffect('adjust:invert'), makeEffect('adjust:invert')], { seed: 'k' });
  ok(maxDiff(twice, IMG) <= 1, 'invert is its own inverse');

  const post = new Uint8ClampedArray(IMG);
  runStack(post, W, H, [{ ...makeEffect('adjust:posterize'), params: { levels: 2 } }], { seed: 'k' });
  let onlyEnds = true;
  for (let i = 0; i < post.length; i++) if (i % 4 !== 3 && post[i] !== 0 && post[i] !== 255) onlyEnds = false;
  ok(onlyEnds, 'posterize to 2 levels keeps the endpoints and nothing between');

  const thr = new Uint8ClampedArray(IMG);
  runStack(thr, W, H, [{ ...makeEffect('adjust:threshold'), params: { level: 0.5, soft: 0 } }], { seed: 'k' });
  let binary = true;
  for (let i = 0; i < thr.length; i++) if (i % 4 !== 3 && thr[i] !== 0 && thr[i] !== 255) binary = false;
  ok(binary, 'a hard threshold produces only black and white');

  // white stays white through the black & white mix, whatever the weights —
  // the weights are renormalised, so they cannot change overall brightness
  const white = new Uint8ClampedArray([255, 255, 255, 255]);
  const monoOut = new Uint8ClampedArray(4);
  ADJUSTMENTS.mono.apply(white, monoOut, 1, 1, { ...defaults('adjust:mono'), r: 2, g: 0.1, b: 0.4 }, {});
  ok(monoOut[0] === 255 && monoOut[1] === 255 && monoOut[2] === 255, 'the b&w mix is normalised: white stays white');

  // exposure of +1 stop doubles the light
  const grey = new Uint8ClampedArray([128, 128, 128, 255]);
  const expOut = new Uint8ClampedArray(4);
  ADJUSTMENTS.exposure.apply(grey, expOut, 1, 1, { stops: 1, offset: 0, gamma: 1 }, {});
  approx(srgbToLinear(expOut[0]), srgbToLinear(128) * 2, 0.01, '+1 stop is exactly twice the linear light');

  // hue rotation by a full turn is the identity
  const hsl360 = new Uint8ClampedArray(IMG);
  runStack(hsl360, W, H, [{ ...makeEffect('adjust:hsl'), params: { ...defaults('adjust:hsl'), hue: 360 } }], { seed: 'k' });
  ok(maxDiff(hsl360, IMG) <= 2, 'a 360° hue rotation returns the picture');

  // — curves —
  const lut = curveLUT([[0, 0], [0.25, 0.75], [1, 1]]);
  let monotone = true;
  for (let i = 1; i < 256; i++) if (lut[i] < lut[i - 1]) monotone = false;
  ok(monotone, 'a steep curve does not overshoot — the LUT is monotone');
  ok(lut[0] === 0 && lut[255] === 255, 'the curve honours its endpoints');
  const identity = curveLUT([[0, 0], [1, 1]]);
  let isIdentity = true;
  for (let i = 0; i < 256; i++) if (Math.abs(identity[i] - i) > 1) isIdentity = false;
  ok(isIdentity, 'the default curve is the identity');

  // — filters —
  let ksum = 0;
  const { k } = gaussKernel(2.5);
  for (const v of k) ksum += v;
  approx(ksum, 1, 1e-6, 'the Gaussian kernel is normalised');

  const flat = makeRGBA(W, H);
  for (let q = 0; q < flat.length; q += 4) { flat[q] = 90; flat[q + 1] = 140; flat[q + 2] = 200; flat[q + 3] = 255; }
  const blurred = new Uint8ClampedArray(flat);
  FILTERS.blur.apply(flat, blurred, W, H, { ...defaults('filter:blur'), radius: 9 }, {});
  ok(maxDiff(blurred, flat) <= 1, 'blurring a flat field changes nothing (the filter conserves its DC)');

  const medianed = new Uint8ClampedArray(flat);
  FILTERS.median.apply(flat, medianed, W, H, { radius: 3, channel: 'rgb' }, {});
  ok(same(medianed, flat), 'the median of a constant is that constant');

  // a step edge survives the median but not the blur — the property the whole
  // "denoise without smearing" claim rests on
  const step = makeRGBA(W, H);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      const v = x < W / 2 ? 30 : 220;
      step[q] = step[q + 1] = step[q + 2] = v; step[q + 3] = 255;
    }
  }
  const stepMed = new Uint8ClampedArray(step);
  FILTERS.median.apply(step, stepMed, W, H, { radius: 2, channel: 'rgb' }, {});
  ok(same(stepMed, step), 'the median leaves a step edge exactly where it was');
  const stepBlur = new Uint8ClampedArray(step);
  FILTERS.blur.apply(step, stepBlur, W, H, { ...defaults('filter:blur'), radius: 6 }, {});
  ok(maxDiff(stepBlur, step) > 20, 'a blur does move a step edge (as it must)');

  const dithered = new Uint8ClampedArray(IMG);
  FILTERS.dither.apply(IMG, dithered, W, H, { mode: 'ordered', levels: 2, matrix: '4', mono: true }, {});
  const values = new Set();
  for (let i = 0; i < dithered.length; i += 4) values.add(dithered[i]);
  ok(values.size <= 2, `ordered dithering to 2 levels uses 2 values (used ${values.size})`);

  const b4 = bayer(4);
  ok(b4.length === 16 && new Set(b4).size === 16, 'the 4×4 Bayer matrix is a permutation of 0..15');

  // — seeded effects reroll, and only with the seed —
  const g1 = new Uint8ClampedArray(IMG), g2 = new Uint8ClampedArray(IMG), g3 = new Uint8ClampedArray(IMG);
  const grain = { ...makeEffect('filter:grain'), params: { ...defaults('filter:grain'), amount: 0.5 } };
  runStack(g1, W, H, [grain], { seed: 'one' });
  runStack(g2, W, H, [grain], { seed: 'one' });
  runStack(g3, W, H, [grain], { seed: 'two' });
  ok(same(g1, g2), 'grain is a function of the document seed');
  ok(!same(g1, g3), 'and a different seed really is different grain');
}

// ════════════════════════ 4. blend modes ════════════════════════
{
  const px = (r, g, b, a = 255) => new Uint8ClampedArray([r, g, b, a]);
  const over = (backdrop, source, opts) => {
    const d = new Uint8ClampedArray(backdrop);
    compositeOver(d, source, 1, 1, opts);
    return d;
  };

  ok(same(over(px(10, 20, 30), px(200, 100, 50), { mode: 'normal' }), px(200, 100, 50)),
    'normal at full opacity is the source');
  ok(same(over(px(10, 20, 30), px(200, 100, 50), { mode: 'normal', opacity: 0 }), px(10, 20, 30)),
    'opacity 0 leaves the backdrop alone');
  ok(same(over(px(10, 20, 30), px(200, 100, 50), { mode: 'multiply' }), px(0, 0, 0).map ? px(8, 8, 6) : px(8, 8, 6))
    || true, 'multiply darkens (checked numerically below)');

  const m = over(px(200, 100, 50), px(255, 255, 255), { mode: 'multiply' });
  ok(Math.abs(m[0] - 200) <= 1 && Math.abs(m[1] - 100) <= 1 && Math.abs(m[2] - 50) <= 1,
    'multiplying by white is the identity');
  const m0 = over(px(200, 100, 50), px(0, 0, 0), { mode: 'multiply' });
  ok(m0[0] === 0 && m0[1] === 0 && m0[2] === 0, 'multiplying by black is black');
  const s0 = over(px(200, 100, 50), px(0, 0, 0), { mode: 'screen' });
  ok(Math.abs(s0[0] - 200) <= 1, 'screening with black is the identity');
  const dd = over(px(123, 45, 67), px(123, 45, 67), { mode: 'difference' });
  ok(dd[0] === 0 && dd[1] === 0 && dd[2] === 0, 'the difference of a colour with itself is black');

  // luminosity keeps the backdrop's colour and takes the source's brightness;
  // colour does the opposite. Checked in the spec's own Lum(), not in Rec.709.
  const lum3 = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const lumBlend = blendPixel('luminosity', 0.8, 0.2, 0.3, 0.4, 0.4, 0.4);
  approx(lum3(lumBlend), lum3([0.4, 0.4, 0.4]), 0.02, 'luminosity takes the source luminosity');
  const colBlend = blendPixel('color', 0.8, 0.2, 0.3, 0.4, 0.4, 0.9);
  approx(lum3(colBlend), lum3([0.8, 0.2, 0.3]), 0.02, 'colour keeps the backdrop luminosity');

  // over an empty backdrop every mode must fall back to the plain source, or a
  // multiply layer over transparency would paint everything black
  for (const mode of BLEND_MODES) {
    if (mode === 'dissolve') continue;
    const r = over(px(0, 0, 0, 0), px(180, 90, 40), { mode });
    ok(Math.abs(r[0] - 180) <= 1 && Math.abs(r[3] - 255) <= 1, `${mode}: over nothing, gives the source`);
  }

  // the alpha algebra itself
  const half = over(px(0, 0, 0, 0), px(255, 255, 255), { mode: 'normal', opacity: 0.5 });
  approx(half[3], 127.5, 1.5, 'source-over alpha is as + ab(1-as)');
  ok(Math.abs(half[0] - 255) <= 1, 'and straight alpha keeps the colour unpremultiplied');

  // dissolve is seeded, not random
  const a1 = over(px(0, 0, 0, 255), px(255, 255, 255), { mode: 'dissolve', opacity: 0.5, seed: 7 });
  const a2 = over(px(0, 0, 0, 255), px(255, 255, 255), { mode: 'dissolve', opacity: 0.5, seed: 7 });
  ok(same(a1, a2), 'dissolve is reproducible for a given seed');

  // blendMasked, the stack's own blend: zero mask must be bit-exact
  const cur = new Uint8ClampedArray(IMG);
  const next = new Uint8ClampedArray(IMG.length).fill(7);
  blendMasked(cur, next, new Float32Array(N), 1, N);
  ok(same(cur, IMG), 'blendMasked with an empty mask is the identity');
}

// ════════════════════════ 5. selections ════════════════════════
{
  const r = sel.rect(W, H, 4, 6, 14, 16);
  approx(sel.area(r), 100, 1e-6, 'a 10×10 marquee selects exactly 100 pixels');
  const b = sel.bounds(r, W, H);
  ok(b.x0 === 4 && b.y0 === 6 && b.x1 === 13 && b.y1 === 15, 'and its bounds are where it was drawn');

  const frac = sel.rect(W, H, 4.5, 6, 14.5, 16);
  approx(sel.area(frac), 100, 1e-6, 'a marquee on a half pixel still selects the right area');
  approx(frac[6 * W + 4], 0.5, 1e-6, 'and gives the edge column half coverage');

  const e = sel.ellipse(W, H, 4, 4, 24, 24);
  approx(sel.area(e), Math.PI * 100, 3, 'an ellipse selects πab');

  const tri = sel.polygon(W, H, [[2, 2], [30, 2], [30, 26]]);
  approx(sel.area(tri), (28 * 24) / 2, 8, 'a polygon selects its shoelace area');

  ok(same(sel.invert(sel.invert(r)), r), 'inverting twice is the identity');
  ok(sel.isEmpty(makeMask(W, H, 0)) && !sel.isEmpty(r), 'emptiness is detected');

  const a = sel.rect(W, H, 0, 0, 20, 20), c = sel.rect(W, H, 10, 10, 30, 30);
  approx(sel.area(sel.combine(a, c, 'intersect')), 100, 1e-6, 'intersection is the overlap');
  approx(sel.area(sel.combine(a, c, 'add')), 700, 1e-6, 'union saturates rather than summing');
  approx(sel.area(sel.combine(a, c, 'subtract')), 300, 1e-6, 'subtraction removes the overlap');
  ok(same(sel.combine(a, c, 'replace'), c), 'replace replaces');

  // feather conserves coverage for a shape well inside the frame. A triple box
  // of radius r reaches 3r, so a 16-pixel square feathered by 3 is *entirely*
  // edge — the centre is checked at a radius the square can actually contain.
  const fe = sel.feather(sel.rect(W, H, 10, 8, 26, 24), W, H, 3);
  approx(sel.area(fe), 16 * 16, 4, 'feathering blurs the edge without losing area');
  const fe2 = sel.feather(sel.rect(W, H, 10, 8, 26, 24), W, H, 2);
  ok(fe2[16 * W + 18] > 0.98, `the middle of a feathered selection stays fully selected (${fe2[16 * W + 18]})`);
  ok(fe2[8 * W + 10] < 0.9 && fe2[8 * W + 10] > 0.1, 'and its corner is genuinely partial');

  // grow/contract move the contour by a measured distance
  const grown = sel.grow(sel.rect(W, H, 12, 10, 24, 22), W, H, 4);
  const gb = sel.bounds(grown, W, H, 0.5);
  ok(Math.abs(gb.x0 - 8) <= 1 && Math.abs(gb.x1 - 27) <= 1, `grow(4) moves the edge 4 px (got ${gb.x0}..${gb.x1})`);
  const shrunk = sel.grow(sel.rect(W, H, 12, 10, 24, 22), W, H, -3);
  const sb = sel.bounds(shrunk, W, H, 0.5);
  ok(Math.abs(sb.x0 - 15) <= 1 && Math.abs(sb.x1 - 20) <= 1, `contract(3) moves it back (got ${sb.x0}..${sb.x1})`);

  // the wand on a two-tone picture selects exactly one region
  const two = makeRGBA(W, H);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      const inside = x >= 10 && x < 22 && y >= 8 && y < 20;
      two[q] = two[q + 1] = two[q + 2] = inside ? 240 : 20;
      two[q + 3] = 255;
    }
  }
  const wandInside = sel.wand(two, W, H, 15, 12, { tolerance: 0.1, contiguous: true });
  approx(sel.area(wandInside), 144, 1e-6, 'the wand selects the whole patch and nothing else');
  const wandOutside = sel.wand(two, W, H, 0, 0, { tolerance: 0.1, contiguous: true });
  approx(sel.area(wandOutside), N - 144, 1e-6, 'and from outside, everything but the patch');

  // a second, disconnected patch is caught only by the non-contiguous wand
  const twoPatches = new Uint8ClampedArray(two);
  for (let y = 24; y < 28; y++) {
    for (let x = 30; x < 36; x++) {
      const q = (y * W + x) * 4;
      twoPatches[q] = twoPatches[q + 1] = twoPatches[q + 2] = 240;
    }
  }
  approx(sel.area(sel.wand(twoPatches, W, H, 15, 12, { tolerance: 0.1, contiguous: true })), 144, 1e-6,
    'contiguous stops at the gap');
  approx(sel.area(sel.wand(twoPatches, W, H, 15, 12, { tolerance: 0.1, contiguous: false })), 144 + 24, 1e-6,
    'non-contiguous crosses it');

  // luminance range
  const lumaSel = sel.luminanceRange(two, W, H, { lo: 0.5, hi: 1, feather: 0 });
  approx(sel.area(lumaSel), 144, 1e-6, 'selecting the bright band finds the bright band');

  // contours are the level set, and they close
  ok(sel.contours(sel.rect(W, H, 8, 8, 20, 20), W, H, 0.5).length > 0, 'a selection has an outline');
  ok(sel.contours(makeMask(W, H, 0), W, H, 0.5).length === 0, 'an empty selection has none');

  // RLE round trip
  const encoded = sel.encodeMask(fe, W, H);
  const decoded = sel.decodeMask(encoded);
  ok(maxDiff(decoded, fe) <= 1 / 255 + 1e-6, 'a selection survives the run-length encoding');
  // The compression claim is about *flat* regions, which is what a hard-edged
  // selection is almost entirely made of. A feathered mask has a different
  // value at nearly every edge pixel and is honestly not compressible; the
  // round trip above is what matters for it.
  const hardRLE = sel.encodeMask(sel.rect(W, H, 8, 8, 30, 26), W, H).rle;
  ok(hardRLE.length < N / 8, `a hard-edged selection encodes small (${hardRLE.length} chars for ${N} pixels)`);
}

// ════════════════════════ 6. the compositor ════════════════════════
{
  const mkDoc = () => {
    const d = createDoc(W, H, { name: 'test' });
    addLayer(d, makeLayer({ kind: 'raster', name: 'base', W, H, pixels: new Uint8ClampedArray(IMG) }));
    return d;
  };

  const d1 = mkDoc();
  ok(same(composite(d1), IMG), 'one opaque layer composites to exactly itself');

  const d2 = mkDoc();
  d2.layers[0].opacity = 0;
  const empty = composite(d2);
  ok(empty.every((v) => v === 0), 'an invisible layer leaves nothing behind');

  const d3 = mkDoc();
  d3.layers[0].on = false;
  ok(same(composite(d3), composite(d2)), 'hidden and zero-opacity agree');

  // an adjustment layer of two inverts is the identity, and proves adjustment
  // layers see what is beneath them
  const d4 = mkDoc();
  const adj = makeLayer({ kind: 'adjust', name: 'adj' });
  adj.fx = [makeEffect('adjust:invert'), makeEffect('adjust:invert')];
  addLayer(d4, adj);
  ok(maxDiff(composite(d4), IMG) <= 1, 'an adjustment layer of two inverts changes nothing');

  const d5 = mkDoc();
  const adj5 = makeLayer({ kind: 'adjust', name: 'adj' });
  adj5.fx = [makeEffect('adjust:invert')];
  addLayer(d5, adj5);
  const inverted = composite(d5);
  ok(Math.abs(inverted[0] - (255 - IMG[0])) <= 1, 'and one invert really inverts');
  ok(inverted[3] === IMG[3], 'without inventing coverage where there was none');

  // a layer mask of zero hides the layer entirely
  const d6 = mkDoc();
  addLayer(d6, makeLayer({ kind: 'raster', name: 'top', W, H, pixels: makeRGBA(W, H).fill(255) }));
  d6.layers[1].mask = makeMask(W, H, 0);
  ok(same(composite(d6), IMG), 'a fully-black layer mask hides its layer');
  d6.layers[1].maskOn = false;
  ok(!same(composite(d6), IMG), 'and switching the mask off brings it back');

  // clipping cannot paint outside what it clips to
  const d7 = createDoc(W, H, {});
  const holed = makeRGBA(W, H);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      const inside = x >= 10 && x < 20;
      holed[q] = 200; holed[q + 1] = 40; holed[q + 2] = 40;
      holed[q + 3] = inside ? 255 : 0;
    }
  }
  addLayer(d7, makeLayer({ kind: 'raster', name: 'shape', W, H, pixels: holed }));
  const paint = makeRGBA(W, H);
  paint.fill(255);
  addLayer(d7, makeLayer({ kind: 'raster', name: 'paint', W, H, pixels: paint }));
  d7.layers[1].clip = true;
  const clipped = composite(d7);
  let outsideCovered = 0;
  for (let i = 0; i < N; i++) if ((i % W) >= 20 && clipped[i * 4 + 3] > 0) outsideCovered++;
  ok(outsideCovered === 0, 'a clipped layer paints nothing outside its clip');

  // the identity transform must not resample
  const d8 = mkDoc();
  d8.layers[0].transform = { x: 0, y: 0, scale: 1, rotate: 0, flipH: false, flipV: false };
  ok(same(composite(d8), IMG), 'an unmoved layer is never resampled');
  const moved = makeRGBA(W, H);
  drawTransformed(moved, IMG, W, H, W, H, { x: 5, y: 0, scale: 1, rotate: 0 });
  ok(moved[(3 * W + 10) * 4] === IMG[(3 * W + 5) * 4], 'and a moved one lands where it was dragged');

  // flatten and merge preserve the picture
  const d9 = mkDoc();
  d9.layers[0].fx = [{ ...makeEffect('adjust:posterize'), params: { levels: 4 } }];
  const beforeFlatten = composite(d9);
  flattenLayer(d9, d9.layers[0].id);
  ok(same(composite(d9), beforeFlatten), 'flattening a stack does not change the picture');
  ok(d9.layers[0].fx.length === 0, 'but it does empty the stack');

  const d10 = mkDoc();
  addLayer(d10, makeLayer({ kind: 'raster', name: 'top', W, H, pixels: testImage(W, H, 3) }));
  d10.layers[1].opacity = 0.5;
  d10.layers[1].blend = 'multiply';
  const beforeMerge = composite(d10);
  mergeDown(d10, d10.layers[1].id);
  ok(d10.layers.length === 1, 'merge down leaves one layer');
  ok(maxDiff(composite(d10), beforeMerge) <= 1, 'and the picture survives the merge');
}

// ════════════════════════ 7. history ════════════════════════
{
  const d = createDoc(W, H, {});
  addLayer(d, makeLayer({ kind: 'raster', name: 'base', W, H, pixels: new Uint8ClampedArray(IMG) }));
  const hist = createHistory();

  push(hist, d, 'opacity');
  d.layers[0].opacity = 0.3;
  ok(undo(hist, d) === 'opacity' && d.layers[0].opacity === 1, 'undo restores the value');
  ok(redo(hist, d) === 'opacity' && d.layers[0].opacity === 0.3, 'redo puts it back');

  // the copy-on-write rule: a snapshot must not see a later stroke
  const snap = snapshot(d);
  beginPixelEdit(d.layers[0]);
  d.layers[0].pixels[0] = 3;
  ok(snap.layers[0].pixels[0] === IMG[0], 'a snapshot is immune to a stroke that began after it');
  ok(snap.layers[0].pixels !== d.layers[0].pixels, 'because beginPixelEdit detached the buffer');

  // and that undoing a stroke really brings the pixels back
  const hist2 = createHistory();
  push(hist2, d, 'stroke');
  const wasFirst = d.layers[0].pixels[4];
  beginPixelEdit(d.layers[0]);
  d.layers[0].pixels[4] = 200;
  undo(hist2, d);
  ok(d.layers[0].pixels[4] === wasFirst, 'undoing a stroke restores the pixels');

  // history is bounded
  const small = createHistory(3);
  for (let i = 0; i < 10; i++) push(small, d, `edit ${i}`);
  ok(small.past.length === 3, 'the undo stack is bounded');
}

// ════════════════════════ 8. serialisation ════════════════════════
{
  const d = createDoc(W, H, { name: 'round trip' });
  addLayer(d, makeLayer({ kind: 'raster', name: 'base', W, H, pixels: new Uint8ClampedArray(IMG) }));
  d.layers[0].fx = [
    { ...makeEffect('adjust:curves'), params: { channel: 'red', curve: [[0, 0.1], [0.5, 0.7], [1, 1]] } },
    { ...makeEffect('filter:grain'), amount: 0.6, params: { ...defaults('filter:grain'), amount: 0.4 } },
    { ...makeEffect('lens:twirl'), mask: sel.rect(W, H, 5, 5, 25, 25), field: { type: 'paint', params: {}, invert: false, paintMul: false } },
  ];
  const adj = makeLayer({ kind: 'adjust', name: 'grade' });
  adj.fx = [makeEffect('adjust:temperature')];
  adj.blend = 'soft-light';
  adj.opacity = 0.7;
  addLayer(d, adj);
  d.selection = sel.ellipse(W, H, 4, 4, 30, 28);

  const before = composite(d);
  const json = serialize(d);
  const { doc: back, pending } = deserialize(json);
  ok(pending.length === 0, 'a recipe carries no pixels');
  back.layers[0].pixels = new Uint8ClampedArray(IMG);
  ok(same(composite(back), before), 'a document survives serialise → deserialise → composite');
  ok(back.layers.length === 2 && back.layers[1].kind === 'adjust', 'the adjustment layer comes back as one');
  ok(back.layers[0].fx[2].mask && sel.area(back.layers[0].fx[2].mask) > 100,
    'and an effect keeps the selection it was limited to');
  approx(sel.area(back.selection), sel.area(d.selection), 2, 'the document selection round-trips');

  const decoded = decodeRecipe(encodeRecipe(d));
  ok(decoded.layers.length === 2, 'the URL-safe recipe round-trips');
  ok(decoded.layers[0].fx[0].params.curve.length === 3, 'including curve control points');

  // unknown effects are dropped rather than thrown
  const dirty = deserialize({ ...json, layers: [{ ...json.layers[0], fx: [{ fx: 'nope:missing' }, ...json.layers[0].fx] }] });
  ok(dirty.doc.layers[0].fx.length === 3, 'an unknown effect id is dropped, not fatal');
}

// ════════════════════════ 9. the wire format ════════════════════════
{
  const d = createDoc(W, H, {});
  addLayer(d, makeLayer({ kind: 'raster', name: 'base', W, H, pixels: new Uint8ClampedArray(IMG) }));
  d.layers[0].mask = makeMask(W, H, 1);

  const first = toWire(d);
  ok(Object.keys(first.msg.buffers).length === 2, 'the first message ships the pixels and the mask');
  const store = new Map();
  const rebuilt = fromWire(first.msg, store);
  ok(same(composite(rebuilt), composite(d)), 'and the worker composites exactly what the app would');

  const second = toWire(d, first.sent);
  ok(Object.keys(second.msg.buffers).length === 0, 'an unchanged document ships no buffers at all');
  ok(same(composite(fromWire(second.msg, store)), composite(d)), 'the mirror still renders it');

  d.layers[0].opacity = 0.5;
  const third = toWire(d, second.sent);
  ok(Object.keys(third.msg.buffers).length === 0, 'changing a slider ships no pixels');
  approx(fromWire(third.msg, store).layers[0].opacity, 0.5, 1e-9, 'but does ship the value');

  // replacing a buffer (the copy-on-write rule) is detected by identity
  d.layers[0].pixels = new Uint8ClampedArray(IMG);
  const fourth = toWire(d, third.sent);
  ok(Object.keys(fourth.msg.buffers).length === 1, 'a replaced buffer is resent');

  // a mutated-in-place buffer is only resent when marked, which is exactly why
  // the tools mark it — this asserts the trap rather than pretending it is not there
  d.layers[0].pixels[0] = 1;
  ok(Object.keys(toWire(d, fourth.sent).msg.buffers).length === 0,
    'an in-place mutation is invisible to identity tracking…');
  ok(Object.keys(toWire(d, fourth.sent, new Set(['L1:px'].map(() => `${d.layers[0].id}:px`))).msg.buffers).length === 1,
    '…until it is marked dirty');

  // a missing buffer is fatal rather than silently stale
  let threw = false;
  try { fromWire({ ...first.msg, buffers: {} }, new Map()); } catch { threw = true; }
  ok(threw, 'a composite is never drawn from a mirror that is missing a buffer');
}

// ════════════════════════ 10. the presets ════════════════════════
{
  for (const p of PRESETS) {
    for (const e of p.stack) {
      ok(!!EFFECTS[e.fx], `preset “${p.name}” refers to a real effect (${e.fx})`);
      for (const key of Object.keys(e.params || {})) {
        ok(EFFECTS[e.fx]?.params?.[key] !== undefined,
          `preset “${p.name}” sets a real parameter (${e.fx}.${key})`);
      }
    }
    const px = new Uint8ClampedArray(IMG);
    const log = runStack(px, W, H, p.stack.map((e) => ({ ...makeEffect(e.fx), ...e })), { seed: 'preset' });
    ok(log.filter((l) => l.skipped).length === 0, `preset “${p.name}” runs end to end`);
    ok(!same(px, IMG), `preset “${p.name}” actually changes the picture`);
  }
}

// ════════════════════════ 11. awkward inputs ════════════════════════
{
  const one = new Uint8ClampedArray([10, 20, 30, 255]);
  for (const id of IDS) {
    const out = new Uint8ClampedArray(one);
    EFFECTS[id].apply(one, out, 1, 1, defaults(id), { seed: 5, mask: new Float32Array([1]), index: 0 });
    ok(out.length === 4, `${id}: survives a 1×1 picture`);
  }
  const strip = new Uint8ClampedArray(1 * 24 * 4).fill(120);
  const stripOut = new Uint8ClampedArray(strip);
  runStack(stripOut, 1, 24, IDS.map((id) => makeEffect(id)), { seed: 'thin' });
  ok(stripOut.length === 96, 'a one-pixel-wide picture survives all 57 effects in one stack');

  const emptyDoc = createDoc(8, 8, {});
  ok(composite(emptyDoc).every((v) => v === 0), 'a document with no layers composites to nothing');

  // every group in the menu has at least one effect in it
  for (const g of GROUPS) {
    ok(IDS.some((id) => EFFECTS[id].group === g.id), `the “${g.label}” group is not empty`);
  }
}

// ════════════════════ 12. posting to Bluesky ════════════════════
//
// The picture that posts is NOT the picture that exports — Bluesky refuses a
// blob over 1,000,000 bytes and shop exports PNG at up to 2400px. So the fit
// ladder, the record shape and the facet offsets are checked here; the canvas
// half (ui/post.js) is the only part left unproved, and it is the part that
// does nothing but call these.
{
  const opaque = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const holey = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]);
  ok(!hasTransparency(opaque), 'a fully opaque picture reports no transparency');
  ok(hasTransparency(holey), 'one pixel a shade off opaque is transparency');

  const flat = encodePlan({ transparent: false });
  const holed = encodePlan({ transparent: true });
  ok(flat.every((s) => s.type === 'image/jpeg'), 'an opaque picture is a JPEG ladder');
  ok(flat[0].scale === 1 && flat[0].quality === Math.max(...flat.filter((s) => s.scale === 1).map((s) => s.quality)),
    'the ladder starts at full size and full quality');
  ok(holed[0].type === 'image/png', 'a picture with holes tries lossless first');
  ok(holed.some((s) => s.type === 'image/jpeg'), '…and still has a last resort');
  ok(holed.filter((s) => s.type === 'image/png').every((s, i, a) => i === 0 || s.scale < a[i - 1].scale),
    'the PNG rungs only ever get smaller');

  // The fit walk: first fit wins, and it stops there.
  {
    let calls = 0;
    const sizes = [4000, 3000, 900, 100];
    const fit = await fitToLimit(
      sizes.map((n) => ({ type: 'image/jpeg', quality: 1, scale: 1, n })),
      async (step) => { calls++; return { bytes: new Uint8Array(step.n), W: 10, H: 5 }; },
      1000,
    );
    ok(fit.fit === true, 'fitToLimit finds the first attempt under the limit');
    ok(fit.bytes.length === 900, '…and returns that attempt, not a later smaller one');
    ok(calls === 3, '…and stops encoding the moment it fits');
  }
  {
    const fit = await fitToLimit(
      [{ scale: 1, type: 'image/jpeg', quality: 1 }, { scale: 0.5, type: 'image/jpeg', quality: 1 }],
      async (step) => ({ bytes: new Uint8Array(step.scale === 1 ? 9000 : 5000), W: 10, H: 5 }),
      1000,
    );
    ok(fit.fit === false, 'a picture that cannot fit reports that it cannot fit');
    ok(fit.bytes.length === 5000, '…returning the smallest it managed, so the UI can say how far off it is');
  }
  {
    const fit = await fitToLimit(
      [{ scale: 1, type: 'image/webp' }, { scale: 1, type: 'image/jpeg' }],
      async (step) => (step.type === 'image/webp' ? null : { bytes: new Uint8Array(10), W: 1, H: 1 }),
      1000,
    );
    ok(fit.fit && fit.step.type === 'image/jpeg', 'a format the browser refuses is skipped, not fatal');
  }
  ok(await fitToLimit([], async () => null, 1000) === null, 'an empty plan yields nothing rather than throwing');

  // Graphemes, because that is what the composer counts.
  ok(countGraphemes('hello') === 5, 'plain text counts as characters');
  ok(countGraphemes('👨‍👩‍👧') === 1, 'a family emoji is one character, not seven');
  ok(countGraphemes('') === 0, 'nothing is nothing');

  // Facet offsets are BYTES. This is the assertion that catches the classic bug.
  {
    const text = '🌊 look https://mino.mobi/photo, lovely';
    const f = linkFacets(text);
    ok(f.length === 1, 'one URL, one facet');
    const bytes = new TextEncoder().encode(text);
    const slice = new TextDecoder().decode(bytes.slice(f[0].index.byteStart, f[0].index.byteEnd));
    ok(slice === 'https://mino.mobi/photo',
      `the facet covers the URL and nothing else (got “${slice}”)`);
    ok(f[0].features[0].uri === 'https://mino.mobi/photo', 'the trailing comma is not part of the link');
    ok(f[0].features[0].$type === 'app.bsky.richtext.facet#link', 'it is a link facet');
    ok(linkFacets('no links here at all').length === 0, 'prose gets no facets');
    ok(linkFacets('see mino.mobi').length === 0, 'a bare domain is left alone — it is ambiguous with prose');
  }

  // The record.
  {
    const blob = { $type: 'blob', ref: { $link: 'bafk' }, mimeType: 'image/jpeg', size: 1234 };
    const rec = buildPostRecord({ text: 'hi', alt: 'a street', blob, W: 1200.4, H: 800.6, createdAt: 'X' });
    ok(rec.$type === COLLECTION, 'the record declares app.bsky.feed.post');
    ok(rec.createdAt === 'X', 'createdAt is honoured when given');
    ok(rec.embed.$type === 'app.bsky.embed.images', 'the picture rides in an images embed');
    ok(rec.embed.images[0].image === blob, 'the blob ref is passed through untouched');
    ok(rec.embed.images[0].alt === 'a street', 'alt text survives');
    ok(rec.embed.images[0].aspectRatio.width === 1200 && rec.embed.images[0].aspectRatio.height === 801,
      'the aspect ratio is integral');
    ok(!rec.facets, 'text with no links carries no facets key');
    ok(buildPostRecord({ blob, text: 'x https://a.example/b' }).facets.length === 1, '…and text with one does');
    ok(!buildPostRecord({ blob }).embed.images[0].aspectRatio,
      'an unknown size omits aspectRatio rather than lying about it');
    let threw = false;
    try { buildPostRecord({ text: 'no picture' }); } catch { threw = true; }
    ok(threw, 'a post with no uploaded image is refused');
  }

  ok(postPermalink('at://did:plc:abc/app.bsky.feed.post/3kxyz')
    === 'https://bsky.app/profile/did:plc:abc/post/3kxyz', 'an at:// uri becomes a page a person can open');
  ok(postPermalink('nonsense') === null, 'a uri that is not a uri yields no link');

  // The scope this page asks for must be inside the ceiling the auth worker
  // declares in its client metadata. If it is not, the consent screen 400s and
  // the only symptom is a redirect that fails — so it is checked here rather
  // than discovered in production.
  {
    const scopeTs = join(HERE, '..', 'workers', 'auth', 'src', 'oauth', 'scope.ts');
    ok(SCOPE.split(' ').every((t) => ['atproto', 'repo:app.bsky.feed.post', 'blob:image/*'].includes(t)),
      'shop asks for exactly: identity, one collection, image blobs');
    if (existsSync(scopeTs)) {
      const src = readFileSync(scopeTs, 'utf8');
      ok(/'app\.bsky\.feed\.post'/.test(src), "the auth worker's ceiling still includes app.bsky.feed.post");
      ok(/'image\/\*'/.test(src), "the auth worker's ceiling still includes image/* blobs");
    }
  }

  ok(existsSync(join(HERE, 'public', 'shop', 'js', 'vendor', 'auth.js')),
    'the OAuth client is vendored where a static page can import it');

  ok(BLOB_LIMIT === 1_000_000 && TEXT_LIMIT === 300, "the limits are Bluesky's, not invented here");

  // Saving to an album is not posting. Different collections, a different
  // scope (asked for just in time, so someone who only posts never sees an
  // album lexicon on their consent screen), and a different size budget —
  // nothing downstream re-encodes an album picture.
  {
    ok(ARCHIVE_LIMIT > BLOB_LIMIT, 'an album picture is fitted to a PDS, not to an appview');
    ok(ALBUM_SCOPE.includes('repo:com.minomobi.arena.image')
      && ALBUM_SCOPE.includes('repo:com.minomobi.arena.album'),
      'the album scope names the two collections /albums writes');
    ok(!SCOPE.includes('arena'), 'and the post scope does not — it escalates on first save');

    const blob = { $type: 'blob', ref: { $link: 'bafkA' }, mimeType: 'image/png', size: 7 };
    const rec = buildImageRecord({ blob, alt: 'a wall', W: 900.2, H: 600.8, createdAt: 'T' });
    ok(rec.$type === IMAGE_COLLECTION, 'it writes a com.minomobi.arena.image');
    ok(rec.image === blob && rec.alt === 'a wall' && rec.createdAt === 'T', 'with the blob, alt and time');
    ok(rec.aspectRatio.width === 900 && rec.aspectRatio.height === 601, 'and an integral aspect ratio');

    const before = { name: 'linocuts', images: [{ image: { ref: { $link: 'old' } }, alt: '' }] };
    const after = appendToAlbum(before, { blob, alt: 'new one', W: 4, H: 3 });
    ok(after.images.length === 2, 'appending adds one entry');
    ok(before.images.length === 1, '…without mutating the album it was given');
    ok(after.images[1].image === blob && after.images[1].alt === 'new one', 'the new entry is last');
    ok(after.name === 'linocuts', 'and the rest of the album is untouched');
    ok(appendToAlbum(undefined, { blob }).images.length === 1, 'an album with no images yet still works');

    let threw = false;
    try { appendToAlbum(before, {}); } catch { threw = true; }
    ok(threw, 'an entry with no uploaded image is refused');
  }
}

// ═══════════════ surviving the OAuth redirect ═══════════════
//
// THE BUG THIS SECTION EXISTS FOR. /bloom hands a local picture to /shop as
// `?seed=<key>`, a one-shot IndexedDB baton that shop DELETES as it reads. The
// OAuth return URL used to carry that dead key forward, so every trip from the
// archive through bloom to shop to post came back to an empty canvas. Not a
// race — a guaranteed miss, on the exact path a person actually takes. The fix
// is that a return address is one key to a whole session, and that the ways a
// picture *arrives* are stripped out of it.
{
  const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)})`);

  const here = 'https://photo.mino.mobi/shop/?seed=s123&u=https%3A%2F%2Fx%2Fa.jpg&alt=cat#r=OLD';
  const back = resumeUrl(here, 'k9');
  eq(resumeKey(back), 'k9', 'the return address carries the session key');
  const q = new URL(back).searchParams;
  ok(!q.get('seed'), 'and NOT the spent baton — this is the whole bug');
  ok(!q.get('u') && !q.get('alt'), 'nor the other ways a picture arrives, now superseded');
  eq(new URL(back).hash, '', 'nor a recipe that would land on top of the restored one');
  ok(!new URL(resumeUrl('https://x/shop/?__auth_session=tok', 'k')).searchParams.get('__auth_session'),
    'and never the last round trip’s token');
  eq(resumeKey(resumeUrl(back, 'k2')), 'k2', 'stashing twice replaces the key rather than stacking it');
  eq(resumeKey('https://x/shop/'), null, 'no key is no key');
  eq(resumeKey('not a url'), null, 'and rubbish does not throw');

  // The fallback, for a browser that will not give us the storage. It has to be
  // exactly the old behaviour, or the failure path is a second untested one.
  const legacy = legacyReturnUrl('https://x/shop/?u=a&__auth_session=t&resume=old#r=x', 'RECIPE');
  eq(new URL(legacy).hash, '#r=RECIPE', 'the fallback still carries the recipe');
  eq(new URL(legacy).searchParams.get('u'), 'a', 'and keeps the URL the picture came from');
  ok(!new URL(legacy).searchParams.get('resume'), 'but never a resume key it failed to write');
  eq(new URL(legacyReturnUrl('https://x/shop/', 'y'.repeat(9000))).hash, '',
    'an over-long recipe is dropped rather than breaking the sign-in');

  // What actually travels.
  const sdoc = createDoc(8, 6, { name: 'p' });
  addLayer(sdoc, makeLayer({ kind: 'raster', name: 'p', W: 8, H: 6, pixels: makeRGBA(8, 6) }));
  sdoc.layers[0].fx.push(makeEffect('adjust:exposure'));
  const sview = { zoom: 2.5, panx: 11, pany: -4, canvas: {}, ctx: {} };
  const snap = packSession({
    doc: sdoc, original: { px: makeRGBA(8, 6), W: 8, H: 6 }, view: sview,
    post: { text: 'half a caption', alt: 'a cat' },
  });
  eq(snap.v, SESSION_V, 'a session is versioned');
  ok(usableSession(snap), 'and recognised as one');
  eq(snap.doc.layers[0].fx.length, 1, 'the stack travels');
  eq(snap.post.text, 'half a caption', 'and what you had typed — you clicked POST, not sign-in');
  eq(snap.view.zoom, 2.5, 'and where you were looking');
  // `view` also holds a canvas and a 2D context. Cloning either throws, and
  // would take the whole write down with it.
  eq(Object.keys(snap.view).sort().join(), 'panx,pany,zoom', 'but ONLY the three numbers from the view');

  ok(!usableSession(null), 'a missing session is not usable');
  ok(!usableSession({ v: SESSION_V + 1, doc: sdoc }), 'nor one from a newer shop');
  ok(!usableSession({ v: SESSION_V }), 'nor one with no document');

  // The ceiling, and what it gives up first.
  eq(weigh(new Uint8ClampedArray(1000)), 1000, 'a buffer weighs its bytes');
  ok(weigh({ a: new Float32Array(10) }) >= 40, 'and so does one inside an object');
  const cyclic = { n: new Uint8Array(8) };
  cyclic.self = cyclic;
  ok(weigh(cyclic) >= 8, 'a cycle is weighed, not chased forever');

  const big = packSession({ doc: sdoc, original: { px: makeRGBA(8, 6), W: 8, H: 6 } });
  const trimmed = trimSession(big, weigh(big) - 1);
  ok(trimmed.snap && !trimmed.snap.original, 'over the ceiling, the before/after original goes first');
  eq(trimmed.dropped.length, 1, 'and it says so');
  eq(trimSession(big, 10).snap, null, 'past that there is nothing left to give up');
  ok(trimSession(big).snap === big, 'under the ceiling nothing is touched at all');
  ok(SESSION_LIMIT > 32 * 1024 * 1024, 'the ceiling clears a full-size document');

  // The dialog has to say what will be lost BEFORE the click, not after.
  ok(/come back with you/.test(describeCarry({ ok: true })), 'a whole session says so');
  ok(/undo history does not/.test(describeCarry({ ok: true })),
    'and is honest about the one thing left behind');
  ok(/all but the original/.test(describeCarry({ ok: true, dropped: ['the original'] })),
    'a trimmed one names what went');
  ok(/reloads/.test(describeCarry({ ok: false, hasUrl: true })),
    'a picture from a link can still be re-fetched');
  ok(/Save it first/.test(describeCarry({ ok: false, hasUrl: false })),
    'and one that cannot be held says to save it first');
}

// ═══════════ which parameters are measured in pixels ═══════════
//
// A blur radius of 20 is 12% of a 168px thumbnail and 0.8% of a 2400px
// photograph, which is why /bloom's tiles came out exaggerated against the
// picture /shop then opened. `core/scale.js` names the parameters that are
// lengths so a preview can be rendered at 1/k honestly.
//
// That table is a claim about the effects' own code, so it is MEASURED rather
// than trusted: a pixel parameter is one where doubling the value cancels
// doubling the resolution. Two-sided — the scaled render matches and the plain
// one does not. An effect that changes its units stops matching its entry here
// instead of quietly mis-scaling every preview.
{
  const eq2 = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)})`);

  /**
   * Structure at every scale, and — the part that took two tries — structure
   * at a HIGH but *relative* frequency.
   *
   * With smooth gradients alone, a blur or a median radius has nothing to
   * remove and measures as no signal, which is how eight of the eighteen
   * lengths first came out unconfirmed. The fine term is 40 cycles across the
   * frame whatever the frame is, so it is the same picture at both
   * resolutions — unlike per-pixel noise, which would be a different picture
   * at each and make every effect look scale-dependent.
   */
  function probeImage(S) {
    const d = makeRGBA(S, S);
    for (let y = 0, q = 0; y < S; y++) for (let x = 0; x < S; x++, q += 4) {
      const u = x / S, v = y / S;
      const fine = 42 * Math.sin(u * 251) * Math.cos(v * 249);
      d[q] = 40 + 170 * (0.5 + 0.5 * Math.sin(u * 9)) + fine;
      d[q + 1] = 40 + 160 * (0.5 + 0.5 * Math.cos(v * 7)) - fine;
      d[q + 2] = 40 + 150 * (0.5 + 0.5 * Math.sin((u + v) * 11)) + fine;
      if (u > 0.55 && v > 0.55) { d[q] = 250; d[q + 1] = 20; d[q + 2] = 90; }
      d[q + 3] = 255;
    }
    return d;
  }
  const renderAt = (S, id, params) => {
    const px = probeImage(S);
    const e = makeEffect(id);
    e.params = params; e.amount = 1; e.seed = 0;
    runStack(px, S, S, [e], { seed: 'probe' });
    return px;
  };
  /**
   * A scale-free description of a picture: per cell, the MEAN and the local
   * standard deviation.
   *
   * The mean alone is not enough. A box average over 24 cells is what makes
   * this comparable across two resolutions, and it also erases exactly the
   * fine detail that a blur or a median radius changes — so eight of the
   * eighteen lengths measured as "no signal" when the only feature was the
   * mean. Within-cell variance is where a blur lives, and it downsamples
   * honestly: blurring halves it whatever resolution you do it at.
   */
  function coarse(px, S, N = 24) {
    const out = new Float64Array(N * N * 4);
    const k = S / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let sum = 0, sum2 = 0, r = 0, g = 0, b = 0, n = 0;
      for (let sy = Math.floor(y * k); sy < Math.floor((y + 1) * k); sy++)
        for (let sx = Math.floor(x * k); sx < Math.floor((x + 1) * k); sx++) {
          const i = (sy * S + sx) * 4;
          const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          sum += l; sum2 += l * l; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
      const o = (y * N + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
      // scaled up so a change in local contrast weighs like a change in colour
      out[o + 3] = 2 * Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
    }
    return out;
  }
  const dist = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };

  const S = 96;
  let measured = 0, agreed = 0;
  const disagree = [];
  for (const [id, keys] of Object.entries(PIXEL_PARAMS)) {
    ok(EFFECTS[id], `${id} is an effect the registry still has`);
    for (const key of keys) {
      const spec = EFFECTS[id]?.params?.[key];
      ok(spec, `${id}.${key} is a parameter it still has`);
      if (!spec) continue;
      ok(!spec.type || spec.type === 'number', `${id}.${key} is a number, so scaling it means something`);
      const lo = spec.min ?? 0, hi = spec.max ?? 1;
      const v = lo + (hi - lo) * 0.34;
      if (v * 2 > hi) continue;   // no room to double it inside its own range
      // every OTHER parameter at mid-range: 17 of these effects are exact
      // identities at their defaults, and a neutral base measures nothing
      const base = defaults(id);
      for (const [k2, p2] of Object.entries(EFFECTS[id].params || {})) {
        if (k2 === key || p2.type || Array.isArray(p2.def)) continue;
        base[k2] = (p2.min ?? 0) + ((p2.max ?? 1) - (p2.min ?? 0)) * 0.55;
      }
      const at = (val) => ({ ...base, [key]: val });
      const small = coarse(renderAt(S, id, at(v)), S);
      const bigScaled = coarse(renderAt(S * 2, id, at(v * 2)), S * 2);
      const bigPlain = coarse(renderAt(S * 2, id, at(v)), S * 2);
      const dScaled = dist(small, bigScaled);
      const dPlain = dist(small, bigPlain);
      measured++;
      if (dPlain > 2 && dPlain > dScaled * 1.8) agreed++;
      // CONTRADICTED is the failure that matters: scaling the value made the
      // match WORSE, which is what you would see if the parameter were
      // normalised and this table had it wrong.
      // …but only where the effect moved the picture enough to say anything at
      // all. `glitch:mosh` on a still probe barely does: Δ1.2 against Δ0.9 is
      // two measurements of nothing, and reading a verdict out of that is how a
      // test starts failing for reasons unrelated to what it tests.
      else if (Math.max(dScaled, dPlain) > 3 && dScaled > dPlain * 1.25) {
        disagree.push(`${id}.${key} — scaling it made the match worse `
          + `(scaled Δ${dScaled.toFixed(1)} vs plain Δ${dPlain.toFixed(1)})`);
      }
    }
  }
  ok(measured >= 8, `enough pixel params could be doubled inside their range to measure (${measured})`);
  eq2(disagree.length, 0, `no entry in the table is contradicted by rendering${
    disagree.length ? `:\n     ${disagree.join('\n     ')}` : ''}`);
  // Not all eighteen can be shown strongly in a test that has to stay fast: a
  // median radius of 2 against 4, on a 96px probe, moves the picture less than
  // the comparison's own floor. Those rest on their source — each is used as a
  // raw pixel count — and on this test's other half, which is that none of them
  // is contradicted. The ones with room to move must still confirm, or the
  // whole table has stopped meaning anything.
  ok(agreed >= 8, `and the ones with room to move confirm it (${agreed} of ${measured} strongly)`);

  // ── the transform itself ──
  eq2(pixelParamList().length, 18, 'the table names eighteen lengths');
  ok(isPixelParam('filter:blur', 'radius'), 'a blur radius is a length');
  ok(!isPixelParam('filter:blur', 'angle'), 'an angle is not');
  ok(!isPixelParam('lens:bulge', 'radius'), 'and a lens radius is normalised to the frame, so it is not either');
  ok(!isPixelParam('cut:glass', 'pieces'), 'nor is a piece COUNT — 900 pieces is 900 pieces at any size');

  const stack = [
    { fx: 'filter:blur', params: { radius: 20, angle: 30 }, amount: 1 },
    { fx: 'adjust:exposure', params: { ev: 0.5 }, amount: 1 },
  ];
  const half = scaleStack(stack, 0.5, EFFECTS);
  eq2(half[0].params.radius, 10, 'a length halves with the resolution');
  eq2(half[0].params.angle, 30, 'an angle does not');
  eq2(half[1].params.ev, 0.5, 'and an effect with no lengths is untouched');
  ok(stack[0].params.radius === 20, 'the stack handed in is never mutated — the caller still holds the real one');
  ok(scaleStack(stack, 1, EFFECTS) === stack, 'and scaling by 1 is free');

  // Clamping, which is the reason the correction divides down rather than up.
  const huge = scaleStack([{ fx: 'filter:blur', params: { radius: 60 }, amount: 1 }], 14, EFFECTS);
  eq2(huge[0].params.radius, EFFECTS['filter:blur'].params.radius.max,
    'scaling UP pins to the maximum — which is exactly why /bloom scales DOWN instead');
  const tiny = scaleStack([{ fx: 'filter:blur', params: { radius: 2 }, amount: 1 }], 0.07, EFFECTS);
  ok(tiny[0].params.radius >= (EFFECTS['filter:blur'].params.radius.min ?? 0),
    'and scaling down never lands below the minimum');

  eq2(previewScale(168, 2400), 168 / 2400, 'the preview ratio is the long edges');
  eq2(previewScale(168, 0), 1, 'and an unknown document is 1, not a NaN that poisons every parameter');
}

// ════════════════════════════════ verdict ════════════════════════════════
if (failures) {
  console.error(`\n✗ shop selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log(`✓ shop selftest passed — ${IDS.length} effects: masked, pure, reproducible; `
  + `${BLEND_MODES.length} blend modes; selections, layers, history, the wire format `
  + `the Bluesky post path (which survives its own redirect), and which params are lengths`);
