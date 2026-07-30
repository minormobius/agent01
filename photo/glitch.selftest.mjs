// glitch selftest — run before changing public/glitch/js/glitch.js:
//   node photo/glitch.selftest.mjs
//
// The promise this tool makes is that the glitch is *deterministic and
// steerable*. Both halves are mechanically checkable, and both are the kind of
// thing that breaks silently — a stray Math.random() or an operator that
// forgets its mask still produces a picture, just not the same one twice.
//
//   1. DETERMINISM — every operator, run twice with the same seed, must give
//      byte-identical output; with a different seed, different output; and the
//      source pixels must never be touched.
//   2. STEERABILITY — outside the mask, the image must be EXACTLY the source.
//      Not nearly. This is what makes "sort only the sky" a promise.
//   3. KNOWN ANSWERS — the pieces with a right answer (the sort, the DCT, the
//      fields, the recipe round trip) are checked against it.

import {
  OPS, FIELDS, makeField, defaults, defaultField, makeLayer, render,
  encodeRecipe, decodeRecipe, normalise, dct8x8, idct8x8, hash32, rand, fbm, seedOf,
} from './public/glitch/js/glitch.js';

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } }
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`); }
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// a deterministic test picture with structure at several scales
function testImage(W, H, seed = 7) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      const r = Math.hypot(x - W * 0.4, y - H * 0.55);
      d[q] = 128 + 90 * Math.sin(r / 7) + 20 * rand(seed, x, y);
      d[q + 1] = 100 + 80 * Math.cos(x / 9) + 20 * rand(seed + 1, x, y);
      d[q + 2] = 90 + 90 * Math.sin(y / 6 + x / 40);
      d[q + 3] = 255;
    }
  }
  return d;
}

const W = 64, H = 48;
const IMG = testImage(W, H);
const ALL_OPS = Object.keys(OPS);

// ══════════════════════ 0. the seeded primitives ══════════════════════
{
  ok(hash32(1, 2, 3) === hash32(1, 2, 3), 'hash32 is a function of its arguments');
  ok(hash32(1, 2, 3) !== hash32(1, 2, 4), 'hash32 separates neighbouring coordinates');
  ok(seedOf('abc') === seedOf('abc') && seedOf('abc') !== seedOf('abd'), 'seedOf is stable and distinct');

  let lo = 1, hi = 0, sum = 0;
  for (let i = 0; i < 4000; i++) { const v = rand(99, i, 0); lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; }
  ok(lo >= 0 && hi < 1, 'rand stays in [0,1)');
  approx(sum / 4000, 0.5, 0.02, 'rand is roughly uniform');

  let nlo = 1, nhi = 0;
  for (let i = 0; i < 500; i++) { const v = fbm(3, i * 0.37, i * 0.11, 3); nlo = Math.min(nlo, v); nhi = Math.max(nhi, v); }
  ok(nlo >= 0 && nhi <= 1, 'fbm stays in [0,1]');
  ok(fbm(3, 1.5, 2.5, 3) === fbm(3, 1.5, 2.5, 3), 'fbm is position-addressed, not stateful');
}

// ══════════════════════ 1. determinism, every op ══════════════════════
{
  // ops whose behaviour is genuinely seed-driven; the rest are closed-form and
  // are expected to ignore the seed entirely
  const SEEDED = ['unfilter', 'slice', 'blocks', 'bits', 'vhs'];

  for (const op of ALL_OPS) {
    const layer = makeLayer(op);
    if (op === 'bits') layer.params.grain = 0.4;          // make the seed matter
    const recipe = { seed: 'alpha', ops: [layer] };

    const a = render(IMG, W, H, recipe).rgba;
    const b = render(IMG, W, H, recipe).rgba;
    ok(same(a, b), `${op}: same seed → identical bytes`);

    ok(same(IMG, testImage(W, H)), `${op}: the source image is left untouched`);

    const c = render(IMG, W, H, { seed: 'beta', ops: [layer] }).rgba;
    if (SEEDED.includes(op)) ok(!same(a, c), `${op}: a different seed → a different picture`);
    else ok(same(a, c), `${op}: closed-form op ignores the seed`);

    ok(!same(a, IMG), `${op}: actually does something at full strength`);

    const off = render(IMG, W, H, { seed: 'alpha', ops: [{ ...layer, amount: 0 }] }).rgba;
    ok(same(off, IMG), `${op}: amount 0 is the identity`);

    const skipped = render(IMG, W, H, { seed: 'alpha', ops: [{ ...layer, on: false }] }).rgba;
    ok(same(skipped, IMG), `${op}: disabled layers do nothing`);

    ok(a.every((v) => Number.isFinite(v) && v >= 0 && v <= 255), `${op}: every byte is a byte`);
  }
}

// ═══════════════════ 2. steerability: the mask holds ═══════════════════
{
  // a hard-edged field: the left half only, no feather anywhere
  const field = { type: 'bands', params: { count: 1, duty: 0.5, angle: 0, phase: 0, soft: 0 }, invert: false, paintMul: false };
  const mask = makeField(field, IMG, W, H, 1);
  ok(mask[0] === 1 && mask[W - 1] === 0, 'the test field really is left-on / right-off');

  for (const op of ALL_OPS) {
    const layer = { ...makeLayer(op), field };
    const outp = render(IMG, W, H, { seed: 'gamma', ops: [layer] }).rgba;
    let leaked = 0, changed = 0;
    for (let i = 0; i < W * H; i++) {
      const q = i * 4;
      const diff = outp[q] !== IMG[q] || outp[q + 1] !== IMG[q + 1] || outp[q + 2] !== IMG[q + 2];
      if (mask[i] === 0 && diff) leaked++;
      if (mask[i] === 1 && diff) changed++;
    }
    ok(leaked === 0, `${op}: nothing changes outside the mask (${leaked} pixels leaked)`);
    ok(changed > 0, `${op}: something changes inside it`);
  }

  // painted masks multiply into any field
  const paint = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) paint[i] = i % W < 8 ? 1 : 0;
  const combined = makeField({ type: 'bands', params: { count: 1, duty: 0.5, soft: 0, angle: 0, phase: 0 }, paintMul: true }, IMG, W, H, 1, paint);
  ok(combined[0] === 1, 'paint × field keeps what both allow');
  ok(combined[20] === 0, 'paint × field drops what the paint excludes');
  ok(makeField({ type: 'paint' }, IMG, W, H, 1, paint)[3] === 1, 'the paint layer can be the field itself');
  ok(makeField({ type: 'paint' }, IMG, W, H, 1, null).every((v) => v === 0), 'no paint means no effect, not everything');
}

// ═══════════════════════ 3. the fields themselves ═══════════════════════
{
  for (const type of Object.keys(FIELDS)) {
    const f = makeField(defaultField(type), IMG, W, H, 5);
    ok(f.length === W * H, `${type}: field covers the image`);
    ok(f.every((v) => v >= 0 && v <= 1), `${type}: field stays in 0..1`);
    const inv = makeField({ ...defaultField(type), invert: true }, IMG, W, H, 5);
    let worst = 0;
    for (let i = 0; i < f.length; i++) worst = Math.max(worst, Math.abs(1 - f[i] - inv[i]));
    approx(worst, 0, 1e-6, `${type}: invert is exactly 1 − field`);
  }

  ok(makeField(defaultField('all'), IMG, W, H, 1).every((v) => v === 1), 'everywhere means everywhere');

  // bands: the duty cycle is the fraction switched on
  const bands = makeField({ type: 'bands', params: { count: 4, duty: 0.25, angle: 0, phase: 0, soft: 0 } }, IMG, W, H, 1);
  const on = bands.reduce((s, v) => s + v, 0) / bands.length;
  approx(on, 0.25, 0.03, 'a 25% duty cycle switches on a quarter of the image');

  // radial: hot in the middle, cold in the corner
  const rad = makeField({ type: 'radial', params: { cx: 0.5, cy: 0.5, radius: 0.5, feather: 0.2 } }, IMG, W, H, 1);
  ok(rad[(H >> 1) * W + (W >> 1)] > 0.95, 'radial field is on at its centre');
  ok(rad[0] < 0.05, 'radial field is off in the corner');

  // gradient: monotone along its axis
  const grad = makeField({ type: 'gradient', params: { angle: 0, lo: 0, hi: 1 } }, IMG, W, H, 1);
  let monotone = true;
  for (let x = 1; x < W; x++) if (grad[x] < grad[x - 1] - 1e-6) monotone = false;
  ok(monotone, 'a horizontal ramp increases left to right');

  // luma: a planted bright square is selected, the dark ground is not
  const flat = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const bright = (i % W) > W / 2;
    flat[i * 4] = flat[i * 4 + 1] = flat[i * 4 + 2] = bright ? 230 : 20;
    flat[i * 4 + 3] = 255;
  }
  const lum = makeField({ type: 'luma', params: { lo: 0.6, hi: 1 } }, flat, W, H, 1);
  ok(lum[W - 1] === 1 && lum[0] === 0, 'the brightness field selects the bright half only');

  // edges: an edge scores higher than flat ground
  const edge = makeField({ type: 'edges', params: { gain: 3, spread: 0 } }, flat, W, H, 1);
  const mid = Math.floor(W / 2);
  ok(edge[10 * W + mid] > edge[10 * W + 2], 'the edge field finds the edge');
}

// ═══════════════════════ 4. known answers ═══════════════════════

// pixel sort: with the threshold wide open, a row comes back sorted
{
  const w = 32, h = 2;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      const v = Math.floor(rand(11, x, y) * 256);
      d[q] = d[q + 1] = d[q + 2] = v; d[q + 3] = 255;
    }
  }
  const layer = makeLayer('sort');
  Object.assign(layer.params, { axis: 'rows', key: 'brightness', lo: 0, hi: 1, maxRun: 1000, reverse: false });
  const outp = render(d, w, h, { seed: 's', ops: [layer] }).rgba;
  let sorted = true;
  for (let x = 1; x < w; x++) if (outp[(x) * 4] < outp[(x - 1) * 4]) sorted = false;
  ok(sorted, 'a fully-thresholded row comes back in ascending order');

  const asMultiset = (row) => Array.from({ length: w }, (_, x) => row[x * 4]).sort((a, b) => a - b).join();
  ok(asMultiset(outp) === asMultiset(d), 'sorting moves pixels, it does not invent them');

  layer.params.reverse = true;
  const rev = render(d, w, h, { seed: 's', ops: [layer] }).rgba;
  let desc = true;
  for (let x = 1; x < w; x++) if (rev[x * 4] > rev[(x - 1) * 4]) desc = false;
  ok(desc, 'reverse sorts the other way');

  // a short max-run leaves the row unsorted overall but still a permutation
  layer.params.reverse = false; layer.params.maxRun = 4;
  const runs = render(d, w, h, { seed: 's', ops: [layer] }).rgba;
  ok(asMultiset(runs) === asMultiset(d), 'bounded runs still only permute');
}

// DCT: round trip, and the DC coefficient is the block mean
{
  const blk = new Float32Array(64), co = new Float32Array(64), back = new Float32Array(64);
  for (let i = 0; i < 64; i++) blk[i] = rand(4, i, 0) * 200 - 100;
  dct8x8(blk, co); idct8x8(co, back);
  let worst = 0;
  for (let i = 0; i < 64; i++) worst = Math.max(worst, Math.abs(blk[i] - back[i]));
  approx(worst, 0, 1e-3, 'the 8×8 DCT round trips');

  const flat = new Float32Array(64).fill(50);
  dct8x8(flat, co);
  approx(co[0], 50 * 8, 1e-3, 'DC is the block mean × 8');
  let acHigh = 0;
  for (let i = 1; i < 64; i++) acHigh = Math.max(acHigh, Math.abs(co[i]));
  approx(acHigh, 0, 1e-3, 'a flat block has no AC energy');
}

// the predictor operator is the identity when no line is chosen
{
  const layer = makeLayer('unfilter');
  layer.params.rate = 0;
  const outp = render(IMG, W, H, { seed: 'z', ops: [layer] }).rgba;
  ok(same(outp, IMG), 'no affected lines means no change');
}

// ═══════════════════════ 5. stacks compose ═══════════════════════
{
  const a = makeLayer('shift'), b = makeLayer('slice');
  const ab = render(IMG, W, H, { seed: 'k', ops: [a, b] }).rgba;
  const ba = render(IMG, W, H, { seed: 'k', ops: [b, a] }).rgba;
  ok(!same(ab, ba), 'order matters — the stack is a pipeline, not a set');

  // Each layer's seed is derived from its position, so two copies of the same
  // operator in one stack don't glitch identically. That makes stack-splitting
  // exact only for the closed-form operators — which is what this checks.
  const c1 = makeLayer('shift'), c2 = makeLayer('ntsc');
  const both = render(IMG, W, H, { seed: 'k', ops: [c1, c2] }).rgba;
  const split = render(render(IMG, W, H, { seed: 'k', ops: [c1] }).rgba, W, H, { seed: 'k', ops: [c2] });
  ok(same(split.rgba, both), 'a closed-form stack equals its layers run in turn');

  const big = { seed: 'k', ops: ALL_OPS.map((op) => makeLayer(op)) };
  const full = render(IMG, W, H, big);
  ok(full.rgba.length === W * H * 4, 'every operator in one stack still yields an image');
  ok(same(full.rgba, render(IMG, W, H, big).rgba), 'a twelve-deep stack is still deterministic');
  ok(full.log.length === ALL_OPS.length, 'the log accounts for every layer');
}

// ═══════════════════════ 6. the recipe round trips ═══════════════════════
{
  const recipe = {
    seed: 'chartreuse',
    ops: [
      { ...makeLayer('sort'), amount: 0.6, field: { type: 'luma', params: { lo: 0.2, hi: 0.9 }, invert: true, paintMul: false } },
      makeLayer('ntsc'),
    ],
  };
  const round = decodeRecipe(encodeRecipe(recipe));
  ok(JSON.stringify(round) === JSON.stringify(normalise(recipe)), 'a recipe survives encode → decode');
  ok(!/[^A-Za-z0-9_-]/.test(encodeRecipe(recipe)), 'the encoding is URL-safe');
  ok(same(render(IMG, W, H, recipe).rgba, render(IMG, W, H, round).rgba),
    'and the decoded recipe paints the same picture');

  const dirty = normalise({ seed: 'x', ops: [{ op: 'nope' }, { op: 'sort', params: { lo: 0.4 } }] });
  ok(dirty.ops.length === 1, 'unknown operators are dropped, not thrown');
  ok(dirty.ops[0].params.hi === defaults('sort').hi, 'missing parameters fall back to defaults');
  ok(dirty.ops[0].params.lo === 0.4, 'given parameters are kept');
  ok(normalise({ ops: [] }).seed === 'glitch', 'a recipe always has a seed');

  // a recipe with a wild seed string still runs
  ok(render(IMG, W, H, { seed: '🌀 天 42', ops: [makeLayer('vhs')] }).rgba.length === W * H * 4,
    'unicode seeds are fine');
}

// ═══════════════════════ 7. awkward images ═══════════════════════
{
  const one = new Uint8ClampedArray([10, 20, 30, 255]);
  for (const op of ALL_OPS) {
    const r = render(one, 1, 1, { seed: 'q', ops: [makeLayer(op)] });
    ok(r.rgba.length === 4, `${op}: survives a 1×1 image`);
  }
  const strip = new Uint8ClampedArray(1 * 40 * 4).fill(120);
  ok(render(strip, 1, 40, { seed: 'q', ops: ALL_OPS.map(makeLayer) }).rgba.length === 160,
    'a one-pixel-wide image survives the whole stack');
  ok(render(IMG, W, H, { seed: 'q', ops: [] }).rgba.length === W * H * 4, 'an empty stack is the identity');
  ok(same(render(IMG, W, H, { seed: 'q', ops: [] }).rgba, IMG), 'and really returns the source');
}

// ══════════════════════════════ verdict ══════════════════════════════
if (failures) {
  console.error(`\n✗ glitch selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log(`✓ glitch selftest passed — ${ALL_OPS.length} operators: deterministic, masked, reproducible`);
