// probe.mjs — fluoddity's phenotype layer, reused rather than reinvented.
//
// THIS IS THE POINT OF CHOOSING FLUODDITY. The hard part of "does the same
// system emerge?" is not running two simulations, it is having a measure of
// "the same" that we did not invent for the occasion and cannot tune after
// seeing the answer. Fluoddity already has one: `verdict` sorts a field into
// dead / sparse / frozen / boiling / blown out / alive, and `fitness` /
// `fitness2` score interestingness. The whole site leans on them — the hero,
// the torus, the gallery, `/space.html` — so they are load-bearing code that
// predates this experiment and is not ours to bend.
//
// `verdict`, `fitness`, `fitness2`, `vec` and `dist` below are COPIED
// VERBATIM from `fluoddity/descriptors.js`. They are pure — they take a plain
// descriptor object, not a canvas — so the copy is exact rather than adapted.
// `assertNoDrift` in the selftest compares them against the source file, so
// if fluoddity changes them, this fails loudly instead of quietly measuring
// something else. (fluoddity is owned by another branch; we read it, we never
// write it.)
//
// `readDescriptors` is the one thing that could NOT be copied: fluoddity's
// reads a canvas through `drawImage`, and there is no canvas here. It is
// reimplemented over a luminance buffer, computing the same four numbers.

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const PROBE = 64;

/** The same four numbers fluoddity's `readDescriptors` returns, from a buffer. */
export function readDescriptors(lum, prevLum) {
  const N = PROBE * PROBE;
  let lit = 0, blown = 0, motion = 0;
  for (let p = 0; p < N; p++) {
    const L = lum[p];
    if (L > 0.06) lit++;
    if (L > 0.92) blown++;
    if (prevLum) motion += Math.abs(L - prevLum[p]);
  }
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

// ---- verbatim from fluoddity/descriptors.js — do not edit, do not improve ---
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

export function fitness(v) {
  if (v.fill < 0.012) return 0;
  const fillT = bump(v.fill, 0.04, 0.55);
  const moveT = clamp01(v.motion / 0.003);
  const structT = v.struct * v.struct;
  const blowP = 1 - clamp01(v.blowout / 0.4);
  return fillT * (0.35 + 0.65 * moveT) * (0.2 + 0.8 * structT) * blowP;
}

export function vec(v) { return [clamp01(v.fill / 0.5), clamp01(v.motion / 0.02), v.struct, clamp01(v.blowout)]; }
export function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

export function fitness2(v1, v2) {
  const base = fitness(v2);
  if (!isFinite(base) || base <= 0) return base;
  const sustained = clamp01(v1.motion / 0.003) * clamp01(v2.motion / 0.003);
  return base * (0.85 + 0.15 * sustained);
}
// ---- end verbatim ----------------------------------------------------------

/**
 * Swarm order parameters — what the FIELD measure cannot see.
 *
 * Fluoddity's descriptors read the painted image, so two swarms that paint
 * similar pictures by different means score the same. These read the
 * particles directly, and they are the classical ones: polarization is
 * Vicsek's order parameter, milling catches a rotating ring that polarization
 * reports as disordered, and nearest-neighbour distance catches a swarm that
 * is aligned but dispersed.
 */
export function order(parts) {
  const n = parts.length;
  let sx = 0, sy = 0, cx = 0, cy = 0, speed = 0;
  for (const p of parts) {
    const s = Math.hypot(p.vx, p.vy) || 1e-9;
    sx += p.vx / s; sy += p.vy / s; cx += p.x; cy += p.y; speed += s;
  }
  const polarization = Math.hypot(sx, sy) / n;
  cx /= n; cy /= n;
  // Milling: mean normalised angular momentum about the swarm's centroid.
  let ang = 0;
  for (const p of parts) {
    const rx = p.x - cx, ry = p.y - cy, r = Math.hypot(rx, ry) || 1e-9;
    const s = Math.hypot(p.vx, p.vy) || 1e-9;
    ang += (rx * p.vy - ry * p.vx) / (r * s);
  }
  // Nearest-neighbour distance, on the torus. O(n²) and n is 256.
  let nn = 0;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let dx = Math.abs(parts[i].x - parts[j].x), dy = Math.abs(parts[i].y - parts[j].y);
      if (dx > 1) dx = 2 - dx;
      if (dy > 1) dy = 2 - dy;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    nn += Math.sqrt(best);
  }
  return { polarization, milling: Math.abs(ang) / n, nnDist: nn / n, meanSpeed: speed / n };
}
