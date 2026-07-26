// glass.js — the stained-glass projection of best fit.
//
// DOM-free on purpose: everything here is arithmetic over typed arrays, so
// `photo/glass.selftest.mjs` can import it under node and prove the maths.
// app.js owns the pixels-in, canvas-out side.
//
// WHAT "PROJECTION OF BEST FIT" MEANS HERE
// ----------------------------------------
// A glass panel can only hold one flat colour per piece. So fix a partition of
// the image into cells; the set of images that can be built from it is the
// linear subspace of functions constant on each cell. The closest member of
// that subspace to the photo — the orthogonal projection, in the least-squares
// sense — is the one whose value on each cell is that cell's *mean*. No search
// needed: the mean IS the minimiser of Σ‖pixel − c‖², and we take it in CIELAB
// so "closest" means closest to the eye rather than closest in bytes.
//
// That leaves one real choice: the partition. We pick it with SLIC (k-means in
// (L,a,b,x,y)), which grows cells that stop at colour boundaries while staying
// compact enough to cut — the same trade a glazier makes. Then the residual is
// reported honestly: R², RMSE and PSNR against the original, plus the extra
// error a real glass palette costs you when the mean colour isn't for sale.
//
// The cell boundaries become the lead came. They are extracted as a shared-arc
// planar graph (junction-split, simplified once, reused by both neighbours) so
// adjacent pieces cannot drift apart under simplification — no white cracks.

// ─────────────────────────────────────────────────────────── colour ──

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const XN = 0.95047, YN = 1.0, ZN = 1.08883;
const fwd = (t) => (t > 0.008856451679 ? Math.cbrt(t) : t * 7.787037037 + 0.137931034);

/** sRGB bytes → CIELAB (D65). */
export function srgbToLab(r, g, b) {
  const rl = LIN[r], gl = LIN[g], bl = LIN[b];
  const x = fwd((rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / XN);
  const y = fwd((rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / YN);
  const z = fwd((rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / ZN);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** CIELAB → sRGB bytes (clipped to gamut). */
export function labToSrgb(L, a, bb) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
  const inv = (t) => (t > 0.2068965517 ? t * t * t : (t - 0.137931034) / 7.787037037);
  const x = inv(fx) * XN, y = inv(fy) * YN, z = inv(fz) * ZN;
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
  let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);
  return [clamp255(gam(r) * 255), clamp255(gam(g) * 255), clamp255(gam(b) * 255)];
}

export const hexToRgb = (h) => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];

export const rgbToHex = (c) =>
  '#' + c.map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');

/** RGBA bytes → a flat Float32Array of [L,a,b] triples. */
export function rgbaToLab(rgba, W, H) {
  const lab = new Float32Array(W * H * 3);
  for (let i = 0, p = 0, q = 0; i < W * H; i++, p += 4, q += 3) {
    const t = srgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    lab[q] = t[0]; lab[q + 1] = t[1]; lab[q + 2] = t[2];
  }
  return lab;
}

// ───────────────────────────────────────────────────── glass palettes ──
//
// Real glass comes in a catalogue, not a colour picker. Snapping the fitted
// means onto one of these is a second projection — onto the sheets a glazier
// could actually buy — and the panel reports what that second projection costs.

export const PALETTES = {
  cathedral: {
    label: 'cathedral',
    note: 'the full antique range — the palette of a parish window',
    colors: ['#0f2a6b', '#1e3f9e', '#3f6fd0', '#6fb3e0', '#a8d4ea', '#17706e', '#2fa8a0',
      '#1f7a45', '#2f5d3a', '#7fa83c', '#c9d06a', '#f0c04a', '#d99a2b', '#b06a1e',
      '#7c1010', '#9e1b28', '#c8434a', '#d4657a', '#7a1236', '#4a2159', '#6b3fa0',
      '#efe0a8', '#f2f0e6', '#b9b3a4', '#6b4423', '#2b2b30'],
  },
  chartres: {
    label: 'chartres',
    note: 'cobalt and ruby, the twelfth-century pairing',
    colors: ['#0b1f57', '#12327f', '#1e4bb0', '#3f7ad4', '#8fc0e8', '#6b1016', '#8e1c24',
      '#b8353a', '#d0705f', '#c79a3a', '#e8cf86', '#1e5c46', '#2f8560', '#f0ead6', '#241f2e'],
  },
  grisaille: {
    label: 'grisaille',
    note: 'silver stain on white glass — greys, straws, ambers',
    colors: ['#f5f2e8', '#e6ddc8', '#d3c7a6', '#bfae84', '#a8946a', '#8c7a52', '#6f6144',
      '#544a38', '#3a352a', '#241f1a', '#c9ccc4', '#9ea69c'],
  },
  tiffany: {
    label: 'tiffany',
    note: 'opalescent favrile — milky pastels, iridescent greens',
    colors: ['#f7f3ec', '#efd9c2', '#e7b8a4', '#d98f86', '#b8748f', '#8f6f9e', '#6f86ad',
      '#7fb0a8', '#9dc48a', '#cfd98d', '#f0d67d', '#c98f4d', '#5f5a52'],
  },
};

/** Nearest palette entry to each cell, measured in Lab. Mutates `cells`. */
export function snapToPalette(cells, colors) {
  const pal = colors.map((c) => {
    const rgb = typeof c === 'string' ? hexToRgb(c) : c;
    return { rgb, lab: srgbToLab(rgb[0], rgb[1], rgb[2]) };
  });
  for (const cell of cells) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i].lab;
      const dL = cell.L - p[0], da = cell.a - p[1], db = cell.b - p[2];
      const d = dL * dL + da * da + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    cell.rgb = pal[best].rgb.slice();
    cell.snapped = pal[best].lab.slice();
  }
  return cells;
}

// ──────────────────────────────────────────────────────────── the fit ──

/**
 * SLIC superpixels — k-means in (L,a,b,x,y). The partition the projection is
 * taken over: cells hug colour edges (small `compactness`) or stay glazier-
 * friendly and blocky (large `compactness`).
 */
export function slic(lab, W, H, { pieces = 600, compactness = 18, iterations = 10 } = {}) {
  const N = W * H;
  const S = Math.max(2, Math.sqrt(N / Math.max(1, pieces)));
  const nx = Math.max(1, Math.round(W / S));
  const ny = Math.max(1, Math.round(H / S));
  const k = nx * ny;

  // seeds on a grid, nudged off any edge they landed on
  const cL = new Float32Array(k), ca = new Float32Array(k), cb = new Float32Array(k);
  const cx = new Float32Array(k), cy = new Float32Array(k);
  for (let j = 0, i = 0; j < ny; j++) {
    for (let ii = 0; ii < nx; ii++, i++) {
      let px = Math.min(W - 1, Math.round((ii + 0.5) * W / nx));
      let py = Math.min(H - 1, Math.round((j + 0.5) * H / ny));
      let bestG = Infinity, bx = px, by = py;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = px + dx, y = py + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
          const g = gradient(lab, W, x, y);
          if (g < bestG) { bestG = g; bx = x; by = y; }
        }
      }
      px = bx; py = by;
      const q = (py * W + px) * 3;
      cL[i] = lab[q]; ca[i] = lab[q + 1]; cb[i] = lab[q + 2];
      cx[i] = px; cy[i] = py;
    }
  }

  const labels = new Int32Array(N).fill(-1);
  const dist = new Float32Array(N).fill(Infinity);
  const m2 = (compactness * compactness) / (S * S);

  const sumL = new Float64Array(k), sumA = new Float64Array(k), sumB = new Float64Array(k);
  const sumX = new Float64Array(k), sumY = new Float64Array(k), cnt = new Float64Array(k);

  for (let it = 0; it < iterations; it++) {
    dist.fill(Infinity);
    for (let i = 0; i < k; i++) {
      const x0 = Math.max(0, Math.floor(cx[i] - S)), x1 = Math.min(W - 1, Math.ceil(cx[i] + S));
      const y0 = Math.max(0, Math.floor(cy[i] - S)), y1 = Math.min(H - 1, Math.ceil(cy[i] + S));
      const kL = cL[i], kA = ca[i], kB = cb[i], kX = cx[i], kY = cy[i];
      for (let y = y0; y <= y1; y++) {
        const dy = y - kY, dy2 = dy * dy;
        for (let x = x0, p = y * W + x0, q = p * 3; x <= x1; x++, p++, q += 3) {
          const dL = lab[q] - kL, dA = lab[q + 1] - kA, dB = lab[q + 2] - kB;
          const dx = x - kX;
          const d = dL * dL + dA * dA + dB * dB + (dx * dx + dy2) * m2;
          if (d < dist[p]) { dist[p] = d; labels[p] = i; }
        }
      }
    }
    if (it === iterations - 1) break;
    sumL.fill(0); sumA.fill(0); sumB.fill(0); sumX.fill(0); sumY.fill(0); cnt.fill(0);
    for (let y = 0, p = 0; y < H; y++) {
      for (let x = 0; x < W; x++, p++) {
        const i = labels[p];
        if (i < 0) continue;
        const q = p * 3;
        sumL[i] += lab[q]; sumA[i] += lab[q + 1]; sumB[i] += lab[q + 2];
        sumX[i] += x; sumY[i] += y; cnt[i]++;
      }
    }
    for (let i = 0; i < k; i++) {
      if (!cnt[i]) continue;
      cL[i] = sumL[i] / cnt[i]; ca[i] = sumA[i] / cnt[i]; cb[i] = sumB[i] / cnt[i];
      cx[i] = sumX[i] / cnt[i]; cy[i] = sumY[i] / cnt[i];
    }
  }

  // stragglers: any pixel no seed window reached takes its predecessor's cell
  let last = 0;
  for (let p = 0; p < N; p++) {
    if (labels[p] < 0) labels[p] = last; else last = labels[p];
  }

  return enforceConnectivity(labels, W, H, k);
}

function gradient(lab, W, x, y) {
  const c = (x, y) => (y * W + x) * 3;
  const a = c(x - 1, y), b = c(x + 1, y), u = c(x, y - 1), d = c(x, y + 1);
  const gx = lab[a] - lab[b], gy = lab[u] - lab[d];
  const gxa = lab[a + 1] - lab[b + 1], gya = lab[u + 1] - lab[d + 1];
  const gxb = lab[a + 2] - lab[b + 2], gyb = lab[u + 2] - lab[d + 2];
  return gx * gx + gy * gy + gxa * gxa + gya * gya + gxb * gxb + gyb * gyb;
}

/**
 * A k-means label map can be disconnected — a cell may own two islands, which
 * a glazier cannot cut as one piece. Relabel connected components, folding the
 * slivers into whichever neighbour they touch. Returns consecutive labels.
 */
export function enforceConnectivity(labels, W, H, k) {
  const N = W * H;
  const out = new Int32Array(N).fill(-1);
  const minSize = Math.max(4, (N / Math.max(1, k)) >> 2);
  const queue = new Int32Array(N);
  const dx4 = [-1, 1, 0, 0], dy4 = [0, 0, -1, 1];
  let next = 0;

  for (let start = 0; start < N; start++) {
    if (out[start] >= 0) continue;
    const src = labels[start];
    const id = next;
    let head = 0, tail = 0;
    queue[tail++] = start; out[start] = id;
    let adj = -1;

    while (head < tail) {
      const p = queue[head++];
      const x = p % W, y = (p / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nxp = x + dx4[d], nyp = y + dy4[d];
        if (nxp < 0 || nyp < 0 || nxp >= W || nyp >= H) continue;
        const q = nyp * W + nxp;
        if (labels[q] === src) {
          if (out[q] < 0) { out[q] = id; queue[tail++] = q; }
        } else if (out[q] >= 0 && out[q] !== id) {
          adj = out[q];
        }
      }
    }

    if (tail < minSize && adj >= 0) {
      for (let i = 0; i < tail; i++) out[queue[i]] = adj;   // sliver joins its neighbour
    } else {
      next++;
    }
  }
  return { labels: out, count: next };
}

/**
 * The projection itself: per-cell mean in Lab, which is the least-squares
 * best constant on that cell. Also carries the residual sum of squares, so
 * fitStats() never has to walk the image twice.
 */
export function cellColors(labels, count, lab, W, H) {
  const sL = new Float64Array(count), sA = new Float64Array(count), sB = new Float64Array(count);
  const sX = new Float64Array(count), sY = new Float64Array(count), n = new Float64Array(count);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      const i = labels[p], q = p * 3;
      sL[i] += lab[q]; sA[i] += lab[q + 1]; sB[i] += lab[q + 2];
      sX[i] += x; sY[i] += y; n[i]++;
    }
  }
  const cells = [];
  for (let i = 0; i < count; i++) {
    const c = Math.max(1, n[i]);
    const L = sL[i] / c, a = sA[i] / c, b = sB[i] / c;
    cells.push({
      id: i, n: n[i], L, a, b,
      rgb: labToSrgb(L, a, b),
      cx: sX[i] / c, cy: sY[i] / c,
      rings: [],
    });
  }
  return cells;
}

/**
 * How good is the fit? R² is the share of the photo's colour variance the
 * panel reproduces; RMSE/PSNR are the same residual in familiar units. Both
 * the ideal projection (cell means) and the palette-snapped panel are scored,
 * because the gap between them is the price of real glass.
 */
export function fitStats(labels, cells, lab, W, H) {
  const N = W * H;
  let gL = 0, gA = 0, gB = 0;
  for (let q = 0; q < N * 3; q += 3) { gL += lab[q]; gA += lab[q + 1]; gB += lab[q + 2]; }
  gL /= N; gA /= N; gB /= N;

  let ssTot = 0, ssMean = 0, ssFinal = 0;
  for (let p = 0; p < N; p++) {
    const q = p * 3, cell = cells[labels[p]];
    const L = lab[q], a = lab[q + 1], b = lab[q + 2];
    ssTot += (L - gL) ** 2 + (a - gA) ** 2 + (b - gB) ** 2;
    ssMean += (L - cell.L) ** 2 + (a - cell.a) ** 2 + (b - cell.b) ** 2;
    const s = cell.snapped;
    ssFinal += s
      ? (L - s[0]) ** 2 + (a - s[1]) ** 2 + (b - s[2]) ** 2
      : (L - cell.L) ** 2 + (a - cell.a) ** 2 + (b - cell.b) ** 2;
  }

  const rmseLab = Math.sqrt(ssFinal / N);
  return {
    pixels: N,
    pieces: cells.length,
    r2: ssTot > 0 ? 1 - ssMean / ssTot : 1,          // the projection's own fit
    r2Final: ssTot > 0 ? 1 - ssFinal / ssTot : 1,    // after snapping to real glass
    rmseLab,
    deltaE: Math.sqrt(ssFinal / N),                   // mean ΔE76 magnitude
    paletteCost: Math.sqrt(Math.max(0, ssFinal - ssMean) / N),
  };
}

/** RMSE and PSNR in sRGB — the units people quote. */
export function pixelError(labels, cells, rgba, W, H) {
  const N = W * H;
  let se = 0;
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const c = cells[labels[p]].rgb;
    se += (rgba[i] - c[0]) ** 2 + (rgba[i + 1] - c[1]) ** 2 + (rgba[i + 2] - c[2]) ** 2;
  }
  const mse = se / (N * 3);
  return { rmse: Math.sqrt(mse), psnr: mse > 0 ? 10 * Math.log10(255 * 255 / mse) : Infinity };
}

// ────────────────────────────────────────────────────────── the leads ──
//
// Cell boundaries → polygons, on the lattice of pixel *corners*. The trap here
// is simplifying each cell's outline independently: two neighbours then round
// their shared edge differently and the panel opens up hairline cracks. So the
// boundary graph is cut at junctions (corners where three or more cells meet),
// each arc is simplified ONCE, and both neighbours reuse it — TopoJSON's trick.

const dirRight = (d) => [-d[1], d[0]];   // screen coords, y down: interior on the right

/**
 * Trace every cell as one or more closed rings of corner indices, sharing arcs
 * with its neighbours. Returns rings (per cell) and the deduplicated arc list.
 */
export function traceGeometry(labels, count, W, H, tolerance = 1.2) {
  const CW = W + 1;
  const corner = (x, y) => y * CW + x;

  // 1. directed boundary edges, interior on the right of travel
  const edgeFrom = [];   // per cell: Map<corner, number[] of edge ids>
  const eA = [], eB = [], eCell = [];
  for (let i = 0; i < count; i++) edgeFrom.push(new Map());
  const push = (cell, a, b) => {
    const id = eA.length;
    eA.push(a); eB.push(b); eCell.push(cell);
    const m = edgeFrom[cell];
    const list = m.get(a);
    if (list) list.push(id); else m.set(a, [id]);
  };

  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      const L = labels[p];
      if (y === 0 || labels[p - W] !== L) push(L, corner(x, y), corner(x + 1, y));
      if (x === W - 1 || labels[p + 1] !== L) push(L, corner(x + 1, y), corner(x + 1, y + 1));
      if (y === H - 1 || labels[p + W] !== L) push(L, corner(x + 1, y + 1), corner(x, y + 1));
      if (x === 0 || labels[p - 1] !== L) push(L, corner(x, y + 1), corner(x, y));
    }
  }

  // Undirected cracks, counted once each: a corner where exactly two meet is a
  // point on a lead, anything else is a junction where leads part company.
  const deg = new Int32Array(CW * (H + 1));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x <= W; x++) {
      const same = x > 0 && x < W && labels[y * W + x - 1] === labels[y * W + x];
      if (same) continue;
      deg[corner(x, y)]++; deg[corner(x, y + 1)]++;
    }
  }
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x < W; x++) {
      const same = y > 0 && y < H && labels[(y - 1) * W + x] === labels[y * W + x];
      if (same) continue;
      deg[corner(x, y)]++; deg[corner(x + 1, y)]++;
    }
  }
  const isJunction = (c) => deg[c] !== 2;
  const imageCorners = new Set([corner(0, 0), corner(W, 0), corner(0, H), corner(W, H)]);

  // 2. chain each cell's edges into closed rings
  const used = new Uint8Array(eA.length);
  const ringsPerCell = [];
  for (let i = 0; i < count; i++) ringsPerCell.push([]);

  for (let id = 0; id < eA.length; id++) {
    if (used[id]) continue;
    const cell = eCell[id];
    const ring = [eA[id]];
    let cur = id;
    used[cur] = 1;
    for (;;) {
      const at = eB[cur];
      ring.push(at);
      if (at === eA[id] && ring.length > 2) { ring.pop(); break; }
      const cand = (edgeFrom[cell].get(at) || []).filter((e) => !used[e]);
      if (!cand.length) break;
      cur = cand.length === 1 ? cand[0] : tightest(cur, cand, eA, eB, CW);
      used[cur] = 1;
    }
    ringsPerCell[cell].push(ring);
  }

  // 3. cut rings at junctions, simplify each arc once, reassemble
  const arcCache = new Map();
  const arcs = [];
  const simplifyArc = (pts) => {
    const key = arcKey(pts);
    const hit = arcCache.get(key);
    if (hit) return pts[0] === hit.pts[0] ? hit.simple : hit.simple.slice().reverse();
    const simple = simplify(pts.map((c) => [c % CW, (c / CW) | 0]), tolerance);
    const rec = { pts, simple };
    arcCache.set(key, rec);
    arcs.push(simple);
    return simple;
  };

  const out = [];
  for (let i = 0; i < count; i++) {
    const rings = [];
    for (const ring of ringsPerCell[i]) {
      if (ring.length < 3) continue;
      const cuts = [];
      for (let j = 0; j < ring.length; j++) {
        if (isJunction(ring[j]) || imageCorners.has(ring[j])) cuts.push(j);
      }
      // a ring with no junction (a cell fully enclosed by one neighbour) is cut
      // at its lowest corner index, which both neighbours agree on
      if (!cuts.length) cuts.push(ring.indexOf(Math.min(...ring)));

      const pts = [];
      for (let c = 0; c < cuts.length; c++) {
        const s = cuts[c], e = cuts[(c + 1) % cuts.length];
        // at least one step, so a ring with a single cut becomes one closed arc
        const seg = [ring[s]];
        for (let j = s; ;) {
          j = (j + 1) % ring.length;
          seg.push(ring[j]);
          if (j === e) break;
        }
        const simple = simplifyArc(seg);
        for (let j = 0; j < simple.length - 1; j++) pts.push(simple[j]);
      }
      if (pts.length >= 3) rings.push(pts);
    }
    out.push(rings);
  }
  return { rings: out, arcs, cornerStride: CW };
}

// At a pinch point a cell offers several ways on; take the sharpest right turn
// so rings stay tight and nested rather than crossing themselves.
function tightest(prev, cand, eA, eB, CW) {
  const px = eB[prev] % CW - eA[prev] % CW;
  const py = ((eB[prev] / CW) | 0) - ((eA[prev] / CW) | 0);
  const r = dirRight([px, py]);
  let best = cand[0], bestScore = -Infinity;
  for (const e of cand) {
    const dx = eB[e] % CW - eA[e] % CW;
    const dy = ((eB[e] / CW) | 0) - ((eA[e] / CW) | 0);
    const score = dx * r[0] + dy * r[1] - 0.5 * (dx * px + dy * py < 0 ? 2 : 0);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

const arcKey = (pts) => {
  const a = pts.join(','), b = pts.slice().reverse().join(',');
  return a < b ? a : b;
};

/** Douglas–Peucker, iterative, endpoints preserved. */
export function simplify(points, tolerance) {
  if (points.length < 3 || tolerance <= 0) return points.map((p) => p.slice());
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e <= s + 1) continue;
    const [ax, ay] = points[s], [bx, by] = points[e];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1, farD = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      let d;
      if (len2 === 0) {
        d = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > farD) { farD = d; far = i; }
    }
    if (farD > tol2) {
      keep[far] = 1;
      stack.push([s, far], [far, e]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i].slice());
  return out;
}

// ─────────────────────────────────────────────────────────── top level ──

/**
 * The whole pipeline: RGBA in, cut panel out.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba  W*H*4 pixels
 * @param {object} opts  pieces, compactness, iterations, straightness, palette
 * @returns {{width,height,cells,arcs,labels,stats}} cells carry `rings`
 *          (arrays of [x,y] in image coordinates) and a flat `rgb`.
 */
export function stainedGlass(rgba, W, H, opts = {}) {
  const {
    pieces = 600, compactness = 18, iterations = 10, straightness = 1.2, palette = null,
  } = opts;

  const lab = rgbaToLab(rgba, W, H);
  const { labels, count } = slic(lab, W, H, { pieces, compactness, iterations });
  const cells = cellColors(labels, count, lab, W, H);
  if (palette && palette.length) snapToPalette(cells, palette);

  const stats = fitStats(labels, cells, lab, W, H);
  const geom = traceGeometry(labels, count, W, H, straightness);
  for (let i = 0; i < cells.length; i++) cells[i].rings = geom.rings[i];

  const err = pixelError(labels, cells, rgba, W, H);
  let leadLength = 0;
  for (const arc of geom.arcs) {
    for (let i = 1; i < arc.length; i++) {
      leadLength += Math.hypot(arc[i][0] - arc[i - 1][0], arc[i][1] - arc[i - 1][1]);
    }
  }

  return {
    width: W, height: H, cells, labels, arcs: geom.arcs,
    stats: { ...stats, ...err, leadLength, vertices: geom.arcs.reduce((s, a) => s + a.length, 0) },
  };
}

/**
 * The panel as SVG: one filled path per piece, one stroked path for the whole
 * lead network (arcs are shared, so the leads are drawn exactly once).
 */
export function toSVG(result, opts = {}) {
  const {
    scale = 1, lead = 2, leadColor = '#141014', background = '#0b0910', texture = true,
  } = opts;
  const W = result.width * scale, H = result.height * scale;
  const f = (v) => Math.round(v * scale * 100) / 100;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect width="${W}" height="${H}" fill="${background}"/>`,
  ];
  if (texture) {
    parts.push(
      '<defs><filter id="seedy" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>' +
      '<feColorMatrix in="n" type="saturate" values="0"/>' +
      '<feComponentTransfer><feFuncA type="linear" slope="0.14"/></feComponentTransfer>' +
      '</filter></defs>');
  }
  parts.push('<g>');
  for (const cell of result.cells) {
    if (!cell.rings.length) continue;
    const d = cell.rings
      .map((r) => 'M' + r.map((p) => `${f(p[0])},${f(p[1])}`).join('L') + 'Z')
      .join('');
    parts.push(`<path d="${d}" fill="${rgbToHex(cell.rgb)}" fill-rule="evenodd"/>`);
  }
  parts.push('</g>');
  if (texture) parts.push(`<rect width="${W}" height="${H}" filter="url(#seedy)" opacity="0.5"/>`);
  if (lead > 0) {
    const d = result.arcs
      .map((a) => 'M' + a.map((p) => `${f(p[0])},${f(p[1])}`).join('L'))
      .join('');
    parts.push(`<path d="${d}" fill="none" stroke="${leadColor}" stroke-width="${lead}" ` +
      'stroke-linecap="round" stroke-linejoin="round"/>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}
