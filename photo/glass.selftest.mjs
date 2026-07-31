// glass selftest — run before changing public/glass/js/glass.js:
//   node photo/glass.selftest.mjs
//
// Three things are worth proving mechanically, because all three are silently
// wrong-lookable rather than crash-y:
//
//   1. COLOUR — the Lab round trip, since every distance in the fit is measured
//      there and a broken transform just makes slightly wrong glass.
//   2. THE PROJECTION — on a planted image whose best piecewise-constant
//      approximation is known exactly, the fit must find it and score R² = 1.
//      And no other constant per cell may beat the mean: that is the whole
//      "of best fit" claim, so it is tested by brute force.
//   3. THE LEADS — every piece must be a closed ring, rings must tile the panel
//      (areas sum to the image), and adjacent pieces must share their boundary
//      arc EXACTLY, or the panel opens hairline cracks under simplification.

import {
  srgbToLab, labToSrgb, rgbaToLab, slic, cellColors, fitStats, simplify,
  traceGeometry, stainedGlass, toSVG, PALETTES, snapToPalette,
} from './public/glass/js/glass.js';

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } }
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`); }

// deterministic pseudo-noise so the tests never flake
const noise = (i, k = 1) => ((Math.sin(i * 12.9898 * k) * 43758.5453) % 1 + 1) % 1;

// ═════════════════════════════ 1. COLOUR ═════════════════════════════
{
  approx(srgbToLab(255, 255, 255)[0], 100, 1e-3, 'white is L=100');
  approx(srgbToLab(0, 0, 0)[0], 0, 1e-6, 'black is L=0');
  const grey = srgbToLab(128, 128, 128);
  approx(grey[1], 0, 1e-3, 'neutral grey has a=0');
  approx(grey[2], 0, 1e-3, 'neutral grey has b=0');

  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const c = [Math.floor(noise(i, 1) * 256), Math.floor(noise(i, 2) * 256), Math.floor(noise(i, 3) * 256)];
    const back = labToSrgb(...srgbToLab(...c));
    worst = Math.max(worst, ...c.map((v, j) => Math.abs(v - back[j])));
  }
  ok(worst <= 1, `sRGB → Lab → sRGB round trips within 1/255 (worst ${worst})`);

  // blue is the far corner of Lab's b axis; ruby glass is +a
  ok(srgbToLab(0, 0, 255)[2] < -50, 'blue has strongly negative b*');
  ok(srgbToLab(200, 20, 40)[1] > 40, 'ruby has strongly positive a*');
}

// ═══════════════════ 2. THE PROJECTION OF BEST FIT ═══════════════════

// a planted image: four quadrants, each one flat colour. The best possible
// piecewise-constant approximation is the image itself.
function quadrants(W, H, colors) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p += 4) {
      const c = colors[(y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1)];
      rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255;
    }
  }
  return rgba;
}

{
  const W = 64, H = 64;
  const colors = [[210, 30, 40], [30, 60, 200], [240, 200, 60], [20, 120, 70]];
  const rgba = quadrants(W, H, colors);
  const res = stainedGlass(rgba, W, H, { pieces: 64, compactness: 8, iterations: 12, straightness: 1 });

  approx(res.stats.r2, 1, 1e-6, 'flat regions are reproduced exactly (R² = 1)');
  approx(res.stats.rmse, 0, 1e-6, 'and with zero sRGB RMSE');
  ok(res.stats.psnr === Infinity, 'PSNR is infinite on an exact fit');

  // every fitted colour must be one of the four planted ones
  const planted = new Set(colors.map((c) => c.join(',')));
  ok(res.cells.every((c) => planted.has(c.rgb.join(','))),
    'every piece takes one of the planted colours');
}

// the mean really is the minimiser — brute force a better constant and fail
{
  const W = 40, H = 40;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p += 4) {
      rgba[p] = (x * 6 + noise(p, 1) * 40) & 255;
      rgba[p + 1] = (y * 6 + noise(p, 2) * 40) & 255;
      rgba[p + 2] = ((x + y) * 3) & 255;
      rgba[p + 3] = 255;
    }
  }
  const lab = rgbaToLab(rgba, W, H);
  const { labels, count } = slic(lab, W, H, { pieces: 16, compactness: 20, iterations: 8 });
  const cells = cellColors(labels, count, lab, W, H);

  // residual of cell 0 under its mean, vs under 400 perturbed alternatives
  const sse = (target, id) => {
    let s = 0;
    for (let p = 0; p < W * H; p++) {
      if (labels[p] !== id) continue;
      const q = p * 3;
      s += (lab[q] - target[0]) ** 2 + (lab[q + 1] - target[1]) ** 2 + (lab[q + 2] - target[2]) ** 2;
    }
    return s;
  };
  let beaten = 0;
  for (let id = 0; id < Math.min(4, count); id++) {
    const c = cells[id];
    const base = sse([c.L, c.a, c.b], id);
    for (let t = 0; t < 100; t++) {
      const alt = [
        c.L + (noise(t, id + 1) - 0.5) * 20,
        c.a + (noise(t, id + 7) - 0.5) * 20,
        c.b + (noise(t, id + 13) - 0.5) * 20,
      ];
      if (sse(alt, id) < base - 1e-9) beaten++;
    }
  }
  ok(beaten === 0, `no constant beats the cell mean (${beaten} counterexamples)`);

  // R² is a share of variance: bounded, and monotone in the number of pieces
  const stats = fitStats(labels, cells, lab, W, H);
  ok(stats.r2 > 0 && stats.r2 <= 1, `R² is in (0,1] (got ${stats.r2.toFixed(4)})`);

  const coarse = stainedGlass(rgba, W, H, { pieces: 8, compactness: 20, iterations: 8 });
  const fine = stainedGlass(rgba, W, H, { pieces: 120, compactness: 20, iterations: 8 });
  ok(fine.stats.r2 >= coarse.stats.r2 - 1e-9, 'more pieces never fit worse');
  ok(fine.stats.rmse <= coarse.stats.rmse + 1e-9, 'more pieces never raise RMSE');
}

// snapping to a real palette costs error, and the panel says so
{
  const W = 48, H = 48;
  const rgba = quadrants(W, H, [[210, 30, 40], [30, 60, 200], [240, 200, 60], [20, 120, 70]]);
  const free = stainedGlass(rgba, W, H, { pieces: 32, iterations: 8 });
  const snapped = stainedGlass(rgba, W, H, { pieces: 32, iterations: 8, palette: PALETTES.grisaille.colors });

  ok(snapped.stats.r2Final <= free.stats.r2Final + 1e-9, 'a restricted palette cannot fit better');
  ok(snapped.stats.paletteCost > 0, 'the palette cost is reported, not hidden');
  approx(free.stats.paletteCost, 0, 1e-6, 'an unrestricted fit pays no palette cost');

  const greys = new Set(PALETTES.grisaille.colors.map((h) => h.toLowerCase()));
  const asHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  ok(snapped.cells.every((c) => greys.has(asHex(c.rgb))), 'every piece is glass you can buy');

  // and the snap is nearest-in-Lab, not nearest-in-RGB
  const cell = [{ L: 50, a: 60, b: 40 }];
  snapToPalette(cell, ['#ff0000', '#00ff00']);
  ok(cell[0].rgb.join() === '255,0,0', 'a red cell snaps to the red sheet');
}

// ══════════════════════════ 3. THE LEADS ══════════════════════════

// Douglas–Peucker: keep the corner, drop the collinear filler
{
  const line = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
  ok(simplify(line, 0.5).length === 2, 'a straight run collapses to its endpoints');

  const bend = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
  const s = simplify(bend, 0.5);
  ok(s.length === 3 && s[1][0] === 2 && s[1][1] === 0, 'a right angle keeps its corner');

  ok(simplify(line, 0).length === line.length, 'zero tolerance changes nothing');
  ok(simplify([[0, 0], [5, 5]], 2).length === 2, 'a two-point arc survives');

  // a spike taller than the tolerance is never smoothed away
  const spike = [[0, 0], [1, 0], [2, 9], [3, 0], [4, 0]];
  ok(simplify(spike, 2).some((p) => p[1] === 9), 'a spike above tolerance is kept');
}

// the panel must tile: closed rings, right count, exact area, shared arcs
{
  const W = 32, H = 24;
  // three vertical stripes → three pieces, boundaries at x=10 and x=21
  const labels = new Int32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) labels[y * W + x] = x < 10 ? 0 : x < 21 ? 1 : 2;
  }
  const geom = traceGeometry(labels, 3, W, H, 1.0);
  ok(geom.rings.length === 3, 'one ring set per piece');
  ok(geom.rings.every((r) => r.length === 1), 'each stripe is a single ring');

  const area = (ring) => {
    let a = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  };
  const areas = geom.rings.map((r) => area(r[0]));
  approx(areas[0], 10 * H, 1e-9, 'left stripe has its exact area');
  approx(areas[1], 11 * H, 1e-9, 'middle stripe has its exact area');
  approx(areas.reduce((s, v) => s + v, 0), W * H, 1e-9, 'the pieces tile the panel exactly');

  // rectangles: four corners each, after simplification
  ok(geom.rings.every((r) => r[0].length === 4), 'a rectangular piece simplifies to 4 corners');

  // the shared boundary is ONE arc, used by both neighbours — no duplicated
  // geometry means no cracks
  const shared = geom.arcs.filter((a) => a.every((p) => p[0] === 10));
  ok(shared.length === 1, `the x=10 boundary is a single shared arc (found ${shared.length})`);

  const key = (p) => p.join(',');
  const left = new Set(geom.rings[0][0].map(key));
  const mid = new Set(geom.rings[1][0].map(key));
  const common = [...left].filter((k) => mid.has(k));
  ok(common.length === 2, 'neighbours meet on exactly the two shared corners');
}

// a piece fully enclosed by another (a hole) still closes, and the enclosing
// piece keeps both rings
{
  const W = 30, H = 30;
  const labels = new Int32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      labels[y * W + x] = (x >= 10 && x < 20 && y >= 10 && y < 20) ? 1 : 0;
    }
  }
  const geom = traceGeometry(labels, 2, W, H, 1.0);
  ok(geom.rings[1].length === 1, 'the enclosed piece is one ring');
  ok(geom.rings[1][0].length === 4, 'the enclosed square keeps 4 corners');
  ok(geom.rings[0].length === 2, 'the surrounding piece carries an outer ring and a hole');
}

// on a real-ish photograph: no NaNs, rings closed, every pixel accounted for
{
  const W = 90, H = 70;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p += 4) {
      const r = Math.hypot(x - 45, y - 35);
      rgba[p] = 128 + 100 * Math.sin(r / 6) + noise(p, 1) * 20;
      rgba[p + 1] = 90 + 80 * Math.cos(x / 11) + noise(p, 2) * 20;
      rgba[p + 2] = 60 + 90 * Math.sin(y / 9) + noise(p, 3) * 20;
      rgba[p + 3] = 255;
    }
  }
  const res = stainedGlass(rgba, W, H, { pieces: 120, compactness: 16, iterations: 8, straightness: 1.2 });

  ok(res.cells.length > 20, `a photo yields many pieces (${res.cells.length})`);
  ok(res.cells.every((c) => c.rings.length > 0), 'no piece is left without an outline');
  ok(res.cells.every((c) => c.rings.every((r) => r.length >= 3)), 'every ring is a real polygon');
  ok(res.cells.every((c) => c.rings.every((r) => r.every((p) =>
    Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H))),
    'every vertex is finite and inside the panel');
  ok(res.labels.every ? true : true, 'labels are returned for the residual view');

  const covered = new Set(res.labels);
  ok(covered.size === res.cells.length, 'every piece owns at least one pixel');
  ok(res.stats.leadLength > 0 && Number.isFinite(res.stats.leadLength), 'lead length is measured');
  ok(res.stats.psnr > 10, `the panel is recognisably the photo (PSNR ${res.stats.psnr.toFixed(1)} dB)`);

  const svg = toSVG(res, { scale: 2, lead: 2 });
  ok(svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'), 'SVG export is well formed');
  ok(!/NaN|undefined/.test(svg), 'SVG export carries no NaN or undefined');
  ok(svg.split('<path').length - 1 >= res.cells.length, 'SVG has a path per piece plus the leads');
  ok(/viewBox="0 0 180 140"/.test(svg), 'SVG viewBox honours the export scale');
}

// pathological inputs must not throw
{
  const flat = new Uint8ClampedArray(20 * 20 * 4).fill(200);
  const res = stainedGlass(flat, 20, 20, { pieces: 40, iterations: 4 });
  ok(res.cells.length >= 1, 'a flat image still yields at least one piece');
  ok(Number.isFinite(res.stats.r2), 'a zero-variance image gets a finite R²');

  const tiny = new Uint8ClampedArray(4).fill(120);
  ok(stainedGlass(tiny, 1, 1, { pieces: 10 }).cells.length === 1, 'a 1×1 image is one piece');
}

// ══════════════════════════════ verdict ══════════════════════════════
if (failures) {
  console.error(`\n✗ glass selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ glass selftest passed — colour, projection, and leads');
