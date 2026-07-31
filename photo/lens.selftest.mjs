// lens selftest — run before changing public/lens/js/conformal.js:
//   node photo/lens.selftest.mjs
//
// This tool makes a mathematical claim about every effect it offers — that the
// conformal ones preserve angles exactly, that the lens ones cannot, and that
// the number on screen is the quasiconformal dilatation K = σ₁/σ₂ of whatever
// you have built. A warp that is slightly wrong still produces a pretty
// picture, so the claim has to be checked rather than trusted.
//
//   1. THE TAXONOMY — for every map in the registry, measure K by finite
//      differences straight off `pull` (independent of the tool's own
//      measurement code) and hold it to its declared kind. Maps labelled
//      conformal must come back K = 1; maps labelled lens must genuinely
//      shear somewhere, or the label is decoration; anticonformal must keep
//      K = 1 while reversing orientation.
//   2. KNOWN ANSWERS — inversion is an involution, Möbius takes circles to
//      circles, squeeze has K = sx/sy exactly, the rectilinear "lens" is a
//      plain zoom and therefore the one projection with K = 1, and every map
//      has an identity setting that must be the identity.
//   3. THE PLUMBING — the measurement agrees with the analytic answer, the
//      mip pyramid is a pyramid, the sampler with an empty stack returns the
//      photograph byte for byte, and recipes round trip.

import {
  MAPS, defaults, makeLayer, buildField, measure, scaleOf, buildMips, sample, render,
  normalise, encodeRecipe, decodeRecipe,
} from './public/lens/js/conformal.js';

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } }
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`); }
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/**
 * K measured directly off a map's pullback, by central differences. Deliberately
 * NOT the tool's analyse() — this is the independent check that analyse() is
 * then held against.
 */
function dilatationAt(map, P, x, y, h = 1e-4) {
  const a = [0, 0], b = [0, 0], c = [0, 0], d = [0, 0];
  map.pull(x + h, y, P, a); map.pull(x - h, y, P, b);
  map.pull(x, y + h, P, c); map.pull(x, y - h, P, d);
  const ux = (a[0] - b[0]) / (2 * h), vx = (a[1] - b[1]) / (2 * h);
  const uy = (c[0] - d[0]) / (2 * h), vy = (c[1] - d[1]) / (2 * h);
  const det = ux * vy - uy * vx;
  const fro = ux * ux + uy * uy + vx * vx + vy * vy;
  const disc = Math.max(0, fro * fro - 4 * det * det);
  const s1 = Math.sqrt(Math.max(0, (fro + Math.sqrt(disc)) / 2));
  const s2 = Math.sqrt(Math.max(0, (fro - Math.sqrt(disc)) / 2));
  return { K: s2 > 1e-12 ? s1 / s2 : Infinity, det, s1, s2 };
}

/** A ring of sample points, skipping a disc around any singular centre. */
function samplePoints(skipR = 0) {
  const pts = [];
  for (let i = 0; i < 17; i++) {
    for (let j = 0; j < 17; j++) {
      const x = -1.2 + (2.4 * i) / 16, y = -1.2 + (2.4 * j) / 16;
      if (Math.hypot(x, y) < skipR) continue;
      pts.push([x, y]);
    }
  }
  return pts;
}

// Where each map is allowed to misbehave: a radius round its critical point,
// and whether it has branch seams that a finite difference will straddle.
const QUIRKS = {
  power: { skip: 0.25, seams: true },
  spiral: { skip: 0.25, seams: true },
  droste: { skip: 0.1, seams: true },
  invert: { skip: 0.25 },
  joukowsky: { skip: 0.25 },
  kaleido: { skip: 0.15, seams: true },
  twirl: { skip: 0.05 },
  pinch: { skip: 0.05 },
  fisheye: { skip: 0.02 },
  polar: { skip: 0.1, seams: true },
};

// ═════════════════════ 1. every map keeps its word ═════════════════════
{
  for (const [id, map] of Object.entries(MAPS)) {
    const q = QUIRKS[id] || {};
    const P = defaults(id);
    const pts = samplePoints(q.skip || 0);
    const Ks = [], dets = [];
    for (const [x, y] of pts) {
      const m = dilatationAt(map, P, x, y);
      if (!Number.isFinite(m.K) || m.s1 < 1e-8) continue;    // a genuine critical point
      Ks.push(m.K); dets.push(m.det);
    }
    ok(Ks.length > 100, `${id}: enough usable sample points (${Ks.length})`);

    const med = median(Ks);
    const within = Ks.filter((k) => k < 1.02).length / Ks.length;

    if (map.kind === 'conformal') {
      approx(med, 1, 1e-3, `${id}: declared conformal, median K`);
      ok(within > (q.seams ? 0.93 : 0.999),
        `${id}: declared conformal, ${(within * 100).toFixed(1)}% of points have K < 1.02`);
      const forward = dets.filter((d) => d > 0).length / dets.length;
      ok(forward > (q.seams ? 0.93 : 0.999),
        `${id}: conformal maps preserve orientation (${(forward * 100).toFixed(1)}%)`);
    } else if (map.kind === 'anticonformal') {
      approx(med, 1, 1e-3, `${id}: declared anticonformal, median K is still 1`);
      const flipped = dets.filter((d) => d < 0).length / dets.length;
      ok(flipped > 0.3 && flipped < 0.7,
        `${id}: reverses orientation on about half the plane (${(flipped * 100).toFixed(0)}%)`);
    } else {
      // A "lens" map must EARN the label: somewhere it has to shear.
      const worst = Math.max(...Ks);
      ok(worst > 1.05, `${id}: declared non-conformal, and really does shear (worst K ${worst.toFixed(3)})`);
    }
  }
}

// ═══════════════════════ 2. known answers ═══════════════════════

// every map has an identity setting, and it must be exactly the identity
{
  const IDENTITY = {
    sphere: { pitch: 0, yaw: 0, roll: 0, zoom: 1 },
    bulge: { strength: 0, radius: 1, cx: 0, cy: 0 },
    power: { p: 1, rotate: 0, cx: 0, cy: 0 },
    spiral: { twist: 0, zoom: 1, cx: 0, cy: 0 },
    wave: { amplitude: 0, frequency: 3, angle: 0, phase: 0 },
    mirror: { amplitude: 0, frequency: 2, angle: 0, phase: 0, taper: 0 },
    pinch: { strength: 0, radius: 1, cx: 0, cy: 0 },
    twirl: { angle: 0, radius: 1, cx: 0, cy: 0 },
    squeeze: { sx: 1, sy: 1, rotate: 0 },
    joukowsky: { c: 0, zoom: 1, rotate: 0 },
  };
  ok(!('kaleido' in IDENTITY), 'kaleido is a mirror fold and has no identity setting — not tested for one');
  const out = [0, 0];
  for (const [id, P] of Object.entries(IDENTITY)) {
    let worst = 0;
    for (const [x, y] of samplePoints(0.2)) {
      MAPS[id].pull(x, y, { ...defaults(id), ...P }, out);
      worst = Math.max(worst, Math.hypot(out[0] - x, out[1] - y));
    }
    ok(worst < 1e-6, `${id}: its identity setting is the identity (worst drift ${worst.toExponential(1)})`);
  }
}

// inversion is its own inverse, and fixes its circle
{
  const P = { ...defaults('invert'), radius: 0.6, cx: 0, cy: 0 };
  const a = [0, 0], b = [0, 0];
  let worst = 0;
  for (const [x, y] of samplePoints(0.2)) {
    MAPS.invert.pull(x, y, P, a);
    MAPS.invert.pull(a[0], a[1], P, b);
    worst = Math.max(worst, Math.hypot(b[0] - x, b[1] - y));
  }
  ok(worst < 1e-9, `inversion is an involution (worst ${worst.toExponential(1)})`);

  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2;
    MAPS.invert.pull(0.6 * Math.cos(th), 0.6 * Math.sin(th), P, a);
    approx(Math.hypot(a[0], a[1]), 0.6, 1e-9, 'inversion fixes its own circle');
  }
}

// a Möbius map takes circles to circles — fit one to the image and check
{
  const P = { ...defaults('bulge'), strength: 0.6, radius: 1, cx: 0, cy: 0 };
  const pts = [];
  const out = [0, 0];
  for (let i = 0; i < 64; i++) {
    const th = (i / 64) * Math.PI * 2;
    MAPS.bulge.pull(0.4 + 0.3 * Math.cos(th), 0.2 + 0.3 * Math.sin(th), P, out);
    pts.push([out[0], out[1]]);
  }
  // algebraic circle fit: x² + y² + Dx + Ey + F = 0
  let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, Sxz = 0, Syz = 0, Sz = 0, n = pts.length;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y;
    Sxz += x * z; Syz += y * z; Sz += z;
  }
  const A = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]];
  const rhs = [-Sxz, -Syz, -Sz];
  const sol = solve3(A, rhs);
  const cx = -sol[0] / 2, cy = -sol[1] / 2;
  const r = Math.sqrt(Math.max(0, cx * cx + cy * cy - sol[2]));
  let worst = 0;
  for (const [x, y] of pts) worst = Math.max(worst, Math.abs(Math.hypot(x - cx, y - cy) - r));
  ok(worst < 1e-6, `möbius takes circles to circles (worst radial error ${worst.toExponential(1)})`);
}

function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c || Math.abs(M[c][c]) < 1e-15) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

// squeeze has an exactly known dilatation — the ratio of its two scales
{
  for (const [sx, sy] of [[2, 1], [1, 3], [1.5, 0.5]]) {
    const P = { ...defaults('squeeze'), sx, sy, rotate: 0 };
    const m = dilatationAt(MAPS.squeeze, P, 0.3, -0.2);
    approx(m.K, Math.max(sx, sy) / Math.min(sx, sy), 1e-6, `squeeze ${sx}:${sy} has K = the scale ratio`);
  }
}

// THE POINT OF THE WHOLE TOOL: among the lens projections, only the
// rectilinear one is a plain zoom, and it alone has K = 1.
{
  // Inside the rim, at a moderate field. Past about 180° the source photograph's
  // own rectilinear stretch — tan θ, heading for infinity at the horizon —
  // dominates every ratio and the comparison stops being about the projection.
  const worstK = {};
  for (const proj of MAPS.fisheye.params.projection.options) {
    const P = { ...defaults('fisheye'), projection: proj, fov: 120 };
    let w = 1;
    for (const [x, y] of samplePoints(0.05)) {
      if (Math.hypot(x, y) > 0.9) continue;
      const m = dilatationAt(MAPS.fisheye, P, x, y);
      if (Number.isFinite(m.K)) w = Math.max(w, m.K);
    }
    worstK[proj] = w;
  }
  approx(worstK.rectilinear, 1, 1e-3, 'rectilinear re-projection is a plain zoom, so K = 1');
  for (const proj of ['stereographic', 'equidistant', 'equisolid', 'orthographic']) {
    ok(worstK[proj] > 1.05, `${proj} projection must shear (K up to ${worstK[proj].toFixed(2)})`);
  }
  ok(worstK.stereographic < worstK.equidistant
    && worstK.equidistant < worstK.equisolid
    && worstK.equisolid < worstK.orthographic,
    'and they shear in the textbook order: stereographic < equidistant < equisolid < orthographic '
    + `(${worstK.stereographic.toFixed(2)} < ${worstK.equidistant.toFixed(2)} `
    + `< ${worstK.equisolid.toFixed(2)} < ${worstK.orthographic.toFixed(2)})`);
}

// droste folds every radius into its annulus — that is what makes it repeat
{
  const P = { ...defaults('droste'), inner: 0.25, outer: 1, turns: 1, zoom: 1, rotate: 0 };
  const out = [0, 0];
  let inside = 0, total = 0;
  for (const [x, y] of samplePoints(0.05)) {
    MAPS.droste.pull(x, y, P, out);
    const r = Math.hypot(out[0], out[1]);
    total++;
    if (r >= 0.25 - 1e-6 && r <= 1 + 1e-6) inside++;
  }
  ok(inside === total, `droste always samples inside its ring (${inside}/${total})`);
}

// the little planet at zoom 1 is a Möbius transform: rotating the sphere by
// 360° must come back to where it started
{
  const P = { ...defaults('sphere'), pitch: 360, yaw: 0, roll: 0, zoom: 1 };
  const out = [0, 0];
  let worst = 0;
  for (const [x, y] of samplePoints(0.2)) {
    MAPS.sphere.pull(x, y, P, out);
    worst = Math.max(worst, Math.hypot(out[0] - x, out[1] - y));
  }
  ok(worst < 1e-6, `a full turn of the sphere is the identity (worst ${worst.toExponential(1)})`);
}

// ═══════════════════ 3. the measurement and the sampler ═══════════════════

// measure() must agree with the analytic answer on a known map
{
  const W = 96, H = 96, unit = 48;
  const squeeze = normalise({ ops: [{ map: 'squeeze', on: true, params: { sx: 2, sy: 1, rotate: 0 } }] });
  const m = measure(squeeze, W, H, unit);
  approx(median(Array.from(m.K)), 2, 1e-3, 'the measurement finds K = 2 for a 2:1 squeeze');
  ok(m.stats.worstK >= 1.99, 'and reports it as the worst case');
  ok(m.stats.flipped === 0, 'and sees no orientation flip');

  const sphere = normalise({ ops: [{ map: 'sphere', on: true, params: { pitch: 90, yaw: 20, roll: 0, zoom: 1 } }] });
  const ms = measure(sphere, W, H, unit);
  ok(ms.stats.conformalFraction > 0.999,
    `a sphere rotation measures conformal everywhere it can be measured (${(ms.stats.conformalFraction * 100).toFixed(2)}%)`);
  ok(ms.stats.worstK < 1.01, `and nowhere shears (worst K ${ms.stats.worstK.toFixed(5)})`);

  // the kaleidoscope: dilatation 1, orientation reversed on half the sectors
  const kal = normalise({ ops: [{ map: 'kaleido', on: true, params: { ...defaults('kaleido'), sectors: 6 } }] });
  const mk = measure(kal, W, H, unit);
  ok(mk.stats.conformalFraction > 0.97, 'the kaleidoscope keeps K = 1');
  ok(mk.stats.flipped > 0.3 && mk.stats.flipped < 0.7,
    `and flips orientation on about half the picture (${(mk.stats.flipped * 100).toFixed(0)}%)`);

  // the coarse grid is a grid, and finer measurement agrees with coarser
  ok(m.cw === Math.ceil(W / m.step) && m.ch === Math.ceil(H / m.step), 'the measurement grid covers the frame');
  const fine = measure(squeeze, W, H, unit, { step: 1 });
  approx(fine.stats.meanK, m.stats.meanK, 1e-6, 'measuring more finely gives the same answer');

  // scaleOf is what drives the mip level: a 2× zoom-out must read 2 source
  // pixels per output pixel
  const zoomOut = normalise({ view: { zoom: 0.5, rotate: 0, panx: 0, pany: 0 }, ops: [] });
  const f = buildField(W, H, zoomOut);
  const sc = scaleOf(f.field, W, H, f.unit);
  approx(sc[Math.floor(W * H / 2 + W / 2)], 2, 1e-3, 'the mip scale reads 2 source pixels per output pixel at half zoom');
}

// the mip pyramid is a pyramid, and preserves a flat colour exactly
{
  const W = 64, H = 48;
  const flat = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { flat[i * 4] = 30; flat[i * 4 + 1] = 200; flat[i * 4 + 2] = 90; flat[i * 4 + 3] = 255; }
  const mips = buildMips(flat, W, H);
  ok(mips.length > 4, `the pyramid has levels (${mips.length})`);
  ok(mips[0].W === W && mips[0].H === H, 'level 0 is the source');
  for (let i = 1; i < mips.length; i++) {
    ok(mips[i].W === Math.max(1, mips[i - 1].W >> 1), `level ${i} halves the width`);
    ok(mips[i].data.every((v, j) => (j % 4 === 0 ? v === 30 : j % 4 === 1 ? v === 200 : j % 4 === 2 ? v === 90 : v === 255)),
      `level ${i} keeps a flat colour flat`);
  }
}

// an empty stack must return the photograph, byte for byte
{
  const W = 70, H = 50;
  const src = new Uint8ClampedArray(W * H * 4);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      src[q] = (x * 3) & 255; src[q + 1] = (y * 5) & 255; src[q + 2] = (x + y) & 255; src[q + 3] = 255;
    }
  }
  const out = render(src, W, H, W, H, normalise({ ops: [] })).rgba;
  let worst = 0;
  for (let i = 0; i < src.length; i++) worst = Math.max(worst, Math.abs(src[i] - out[i]));
  ok(worst === 0, `the identity pipeline is bit-exact (worst byte difference ${worst})`);

  const muted = render(src, W, H, W, H,
    normalise({ ops: [{ map: 'twirl', on: false, params: { angle: 300 } }] })).rgba;
  ok(muted.every((v, i) => v === src[i]), 'a muted layer changes nothing');
}

// edge modes do what they say at the boundary
{
  const W = 8, H = 8;
  const src = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    src[i * 4] = (i % W) * 30; src[i * 4 + 1] = 0; src[i * 4 + 2] = 0; src[i * 4 + 3] = 255;
  }
  const mips = buildMips(src, W, H);
  const field = new Float32Array(2);   // one pixel, far off to the right
  field[0] = 3.5; field[1] = 0;
  const scale = new Float32Array([1]);
  const clamp = sample(mips, field, scale, 1, 1, { edge: 'clamp' });
  const voided = sample(mips, field, scale, 1, 1, { edge: 'void' });
  const tiled = sample(mips, field, scale, 1, 1, { edge: 'tile' });
  ok(clamp[3] === 255 && clamp[0] === src[(W - 1) * 4], 'clamp holds the edge pixel');
  ok(voided[3] === 0, 'void leaves it transparent');
  ok(tiled[3] === 255, 'tile wraps back into the picture');
}

// a real warp on a real-ish photograph: no NaNs, no dead output
{
  const W = 120, H = 90;
  const src = new Uint8ClampedArray(W * H * 4);
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      src[q] = 120 + 100 * Math.sin(x / 7); src[q + 1] = 120 + 100 * Math.cos(y / 5);
      src[q + 2] = 90 + 80 * Math.sin((x + y) / 9); src[q + 3] = 255;
    }
  }
  for (const id of Object.keys(MAPS)) {
    const r = render(src, W, H, W, H, normalise({ ops: [makeLayer(id)] }));
    ok(r.rgba.length === W * H * 4, `${id}: renders a full frame`);
    ok(r.rgba.every((v) => Number.isFinite(v) && v >= 0 && v <= 255), `${id}: every byte is a byte`);
    ok(Number.isFinite(r.stats.meanK) || r.stats.meanK === Infinity, `${id}: reports a dilatation`);
    let changed = 0;
    for (let i = 0; i < r.rgba.length; i += 4) if (r.rgba[i] !== src[i]) changed++;
    ok(changed > W * H * 0.05, `${id}: actually warps the picture (${((changed / (W * H)) * 100).toFixed(0)}% of pixels)`);
  }

  // a stack composes, and order matters
  const a = render(src, W, H, W, H, normalise({ ops: [makeLayer('spiral'), makeLayer('bulge')] })).rgba;
  const b = render(src, W, H, W, H, normalise({ ops: [makeLayer('bulge'), makeLayer('spiral')] })).rgba;
  ok(!a.every((v, i) => v === b[i]), 'the stack is a pipeline: order changes the result');

  // and a stack of conformal maps is still conformal — the whole reason to compose
  const both = render(src, W, H, W, H, normalise({
    ops: [
      { ...makeLayer('sphere'), params: { ...defaults('sphere'), pitch: 60 } },
      makeLayer('bulge'),
      { ...makeLayer('wave'), params: { ...defaults('wave'), amplitude: 0.08, frequency: 2 } },
    ],
  }));
  ok(both.stats.conformalFraction > 0.97,
    `conformal ∘ conformal ∘ conformal is conformal (${(both.stats.conformalFraction * 100).toFixed(1)}% `
    + `of measurable pixels; ${(both.stats.unmeasurable * 100).toFixed(1)}% beyond measurement)`);
}

// recipes round trip
{
  const recipe = {
    edge: 'mirror', bias: 0.5, view: { zoom: 1.3, rotate: 20, panx: 0.1, pany: -0.2 },
    ops: [makeLayer('droste'), { ...makeLayer('fisheye'), on: false }],
  };
  const round = decodeRecipe(encodeRecipe(recipe));
  ok(JSON.stringify(round) === JSON.stringify(normalise(recipe)), 'a recipe survives encode → decode');
  ok(!/[^A-Za-z0-9_-]/.test(encodeRecipe(recipe)), 'the encoding is URL-safe');
  const dirty = normalise({ ops: [{ map: 'nope' }, { map: 'twirl', params: { angle: 90 } }] });
  ok(dirty.ops.length === 1, 'unknown maps are dropped');
  ok(dirty.ops[0].params.radius === defaults('twirl').radius, 'missing parameters fall back to defaults');
  ok(dirty.edge === 'clamp' && dirty.view.zoom === 1, 'a recipe always has a frame');
}

// awkward sizes
{
  const one = new Uint8ClampedArray([10, 20, 30, 255]);
  for (const id of Object.keys(MAPS)) {
    ok(render(one, 1, 1, 1, 1, normalise({ ops: [makeLayer(id)] })).rgba.length === 4, `${id}: survives 1×1`);
  }
  const strip = new Uint8ClampedArray(40 * 4).fill(90);
  ok(render(strip, 40, 1, 40, 1, normalise({ ops: Object.keys(MAPS).map(makeLayer) })).rgba.length === 160,
    'a one-pixel-tall image survives every map at once');
}

// ══════════════════════════════ verdict ══════════════════════════════
if (failures) {
  console.error(`\n✗ lens selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
const kinds = Object.values(MAPS).reduce((m, v) => ({ ...m, [v.kind]: (m[v.kind] || 0) + 1 }), {});
console.log(`✓ lens selftest passed — ${Object.keys(MAPS).length} maps `
  + `(${kinds.conformal} conformal, ${kinds.anticonformal} anticonformal, ${kinds.lens} lens), `
  + 'each measured against its claim');
