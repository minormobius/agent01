// deco.js — "weird math" art-deco painterly device generator (the fixture look, take 2).
//
// The hand-drawn furniture read cluttered. This replaces literal silhouettes with MATH:
//   • SUPERFORMULA (Gielis) — a tiny genome {m,n1,n2,n3} → the whole deco vocabulary (rosettes,
//     stars, gears, fans) with k-fold symmetry. Variety from four numbers.
//   • VALUE-NOISE fBm FACETING — tessellate the body into a polar lattice and tint each facet by
//     fractal noise onto a tight ramp: painterly texture, but pure vector (renders in canvas + SVG).
//   • DECO LINEWORK — radial fluting, nested superformula rims, a central rosette, a sunburst.
//   • RESTRAINT — one role accent + gold on near-black. The limited palette IS the art-deco look.
//
// A "component" is one such medallion, sized to its room — the room's active part, painterly and
// symmetric, far calmer than scattered props. Pure, deterministic, zero-dep, node-testable.

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── value noise + fBm (seeded lattice; smoothstep interp) ───────────────────────────────────────
function vhash(ix, iy, s) { let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(s | 0, 0x9e3779b1)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = vhash(ix, iy, s), b = vhash(ix + 1, iy, s), c = vhash(ix, iy + 1, s), d = vhash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, oct = 4) { let amp = 0.5, f = 1, sum = 0, norm = 0; for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, (s + i * 131) | 0); norm += amp; amp *= 0.5; f *= 2; } return sum / norm; }

// ── superformula ────────────────────────────────────────────────────────────────────────────────
export function superR(th, m, n1, n2, n3) {
  const t1 = Math.pow(Math.abs(Math.cos(m * th / 4)), n2);
  const t2 = Math.pow(Math.abs(Math.sin(m * th / 4)), n3);
  const r = Math.pow(t1 + t2, -1 / n1);
  return clamp(r, 0.04, 8);
}
function sfNorm(m, n1, n2, n3) { let mx = 0; for (let i = 0; i < 240; i++) { const r = superR(i / 240 * TAU, m, n1, n2, n3); if (r > mx) mx = r; } return mx || 1; }

// ── colour (rgb), tight deco ramp from one accent + gold on near-black ──────────────────────────
const GROUND = [9, 11, 15], GOLD = [244, 191, 98], PALE = [244, 227, 184];
function hex2rgb(h) { const c = h.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const litRGB = (c, l) => `rgb(${(c[0] * l) | 0},${(c[1] * l) | 0},${(c[2] * l) | 0})`;
const goldS = (l, a) => `rgba(${(GOLD[0] * l) | 0},${(GOLD[1] * l) | 0},${(GOLD[2] * l) | 0},${a})`;
function rampStops(accent) { const a = hex2rgb(accent); return [mix(GROUND, a, 0.16), mix(GROUND, a, 0.5), a, mix(a, PALE, 0.6)]; }
function ramp(st, t) { t = clamp(t, 0, 1) * 3; const i = Math.min(2, Math.floor(t)); return mix(st[i], st[i + 1], t - i); }

// ── a device genome — the small bundle a seed mints (drives the deco variety) ───────────────────
const SYMS = [3, 4, 5, 6, 8];
export function deviceGenome(rng) {
  const k = SYMS[(rng() * SYMS.length) | 0];
  return {
    m: k, sym: k, n1: 0.3 + rng() * 1.5, n2: 0.4 + rng() * 2.4, n3: 0.4 + rng() * 2.4,
    rings: 5 + ((rng() * 3) | 0), sectors: k * (3 + ((rng() * 3) | 0)),
    rosM: SYMS[(rng() * SYMS.length) | 0], rosN1: 0.3 + rng() * 1.2,
    freq: 1.6 + rng() * 2.6, noiseSeed: (rng() * 1e9) >>> 0,
    flute: rng() > 0.35, sun: rng() > 0.6, rosette: rng() > 0.25, spin: (rng() - 0.5) * 0.5,
  };
}

// ── draw one art-deco painterly component at (cx,cy) radius R ────────────────────────────────────
export function drawDevice(ctx, cx, cy, R, g, { lit = 1, accent = '#e0772f' } = {}) {
  const st = rampStops(accent), norm = sfNorm(g.m, g.n1, g.n2, g.n3), spin = g.spin || 0;
  const SR = (th) => superR(th + spin, g.m, g.n1, g.n2, g.n3) / norm;
  const P = (r, th) => [cx + Math.cos(th) * r * SR(th) * R, cy + Math.sin(th) * r * SR(th) * R];
  const quad = (A, B, C, D, fill) => { ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  // 1. faceted painterly body — polar lattice scaled by the superformula, tinted by fBm
  for (let i = 0; i < g.rings; i++) for (let j = 0; j < g.sectors; j++) {
    const th0 = j / g.sectors * TAU, th1 = (j + 1) / g.sectors * TAU, r0 = i / g.rings, r1 = (i + 1) / g.rings;
    const cr = (r0 + r1) / 2, cth = (th0 + th1) / 2;
    const n = fbm(Math.cos(cth) * cr * g.freq + 4, Math.sin(cth) * cr * g.freq + 4, g.noiseSeed, 4);
    let col = ramp(st, n * 1.12);
    col = mix(col, [0, 0, 0], (1 - cr) * 0.14);           // a touch of depth toward the rim
    quad(P(r0, th0), P(r1, th0), P(r1, th1), P(r0, th1), litRGB(col, lit));
  }
  // 2. nested superformula rims (gold) — the deco frame
  const strokeRim = (rr, col, w) => { ctx.beginPath(); for (let i = 0; i <= 96; i++) { const th = i / 96 * TAU, p = P(rr, th); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.closePath(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  strokeRim(1.0, goldS(lit, 0.9), R * 0.02); strokeRim(0.64, goldS(lit, 0.5), R * 0.012);
  // 3. radial fluting — k-fold deco reeding
  if (g.flute) { ctx.lineWidth = R * 0.008; ctx.strokeStyle = goldS(lit, 0.3); for (let j = 0; j < g.sectors; j++) { const th = j / g.sectors * TAU, a = P(0.32, th), b = P(0.98, th); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
  // 4. sunburst rays from the focus
  if (g.sun) { ctx.lineWidth = R * 0.01; ctx.strokeStyle = goldS(lit, 0.22); for (let j = 0; j < g.sym * 2; j++) { const th = j / (g.sym * 2) * TAU + spin, a = P(0.0, th), b = P(0.6, th); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
  // 5. central rosette — a small k-fold superformula filled gold-accent
  if (g.rosette) {
    const rn = sfNorm(g.rosM, g.rosN1, g.n2, g.n3), rr = R * 0.24, a = hex2rgb(accent);
    ctx.beginPath(); for (let i = 0; i <= 96; i++) { const th = i / 96 * TAU; const r = superR(th, g.rosM, g.rosN1, g.n2, g.n3) / rn * rr; const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath();
    ctx.fillStyle = litRGB(mix(a, GOLD, 0.55), lit); ctx.fill(); ctx.strokeStyle = goldS(lit, 0.8); ctx.lineWidth = R * 0.012; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.06, 0, TAU); ctx.fillStyle = litRGB(mix(GROUND, a, 0.4), lit); ctx.fill();
  }
}

const DECO = { mulberry32, fbm, superR, deviceGenome, drawDevice };
if (typeof globalThis !== 'undefined') globalThis.DECO = DECO;
export default DECO;
