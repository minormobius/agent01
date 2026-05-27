// Shared, deterministic descriptors for a rendered Fluoddity field — the
// machine-readable "phenotype" used by the playground HUD and the breeder lab.
// Read off a 64² GPU-downsample of the source canvas (drawImage); no model.

const PROBE = 64;
const _cv = document.createElement('canvas'); _cv.width = _cv.height = PROBE;
const _ctx = _cv.getContext('2d', { willReadFrequently: true });

export const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

// Reads from a square source (already cropped to the field). Pass the previous
// frame's `lum` array to get motion; pass null on the first read.
export function readDescriptors(srcCanvas, prevLum) {
  _ctx.drawImage(srcCanvas, 0, 0, PROBE, PROBE);
  const d = _ctx.getImageData(0, 0, PROBE, PROBE).data;
  const N = PROBE * PROBE;
  const lum = new Float32Array(N);
  let lit = 0, blown = 0, motion = 0;
  for (let i = 0, p = 0; p < N; i += 4, p++) {
    const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    lum[p] = L;
    if (L > 0.06) lit++;
    if (L > 0.92) blown++;
    if (prevLum) motion += Math.abs(L - prevLum[p]);
  }
  // lag-1 spatial coherence (Pearson corr of right + down neighbors)
  let np = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = 0; y < PROBE; y++) {
    for (let x = 0; x < PROBE; x++) {
      const i = y * PROBE + x, a = lum[i];
      if (x + 1 < PROBE) { const b = lum[i + 1]; np++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
      if (y + 1 < PROBE) { const b = lum[i + PROBE]; np++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
    }
  }
  const denom = Math.sqrt((np * saa - sa * sa) * (np * sbb - sb * sb));
  const struct = denom > 1e-6 ? clamp01((np * sab - sa * sb) / denom) : 1;
  return { fill: lit / N, blowout: blown / N, motion: prevLum ? motion / N : 0, struct, lum };
}

export const VIT_COLOR = { 'settling…': '#8b909c', 'dead': '#e0556b', 'blown out': '#e08a3c', 'frozen': '#e0c23c', 'sparse': '#c7d23c', 'boiling': '#ff6b3d', 'alive': '#38e1c0' };

export function verdict(v, warming) {
  if (warming) return 'settling…';
  if (v.fill < 0.012) return 'dead';
  if (v.blowout > 0.4) return 'blown out';
  if (v.motion < 0.0015 && v.fill > 0.03) return 'frozen';
  if (v.fill < 0.05) return 'sparse';
  if (v.struct < 0.5) return 'boiling';
  return 'alive';
}

function bump(x, lo, hi) { const c = (lo + hi) / 2, w = (hi - lo) / 2; const t = (x - c) / w; return Math.exp(-0.9 * t * t); }

// Scalar "interestingness" used as the deterministic fitness: a structured,
// moving, healthily-covered organism scores high; dead / sparse / boiling /
// blown-out ones score low.
export function fitness(v) {
  if (v.fill < 0.012) return 0;
  const fillT = bump(v.fill, 0.04, 0.55);
  const moveT = clamp01(v.motion / 0.003);
  const structT = v.struct * v.struct;
  const blowP = 1 - clamp01(v.blowout / 0.4);
  return fillT * (0.35 + 0.65 * moveT) * (0.2 + 0.8 * structT) * blowP;
}

// Normalized phenotype vector for novelty / phase-space distance.
export function vec(v) { return [clamp01(v.fill / 0.5), clamp01(v.motion / 0.02), v.struct, clamp01(v.blowout)]; }
export function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
