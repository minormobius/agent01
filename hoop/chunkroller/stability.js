// chunkroller/stability.js — a MODEL behind the room distribution: score a role-mix's civic stability,
// and solve a biome's sliders toward it. Backs the hand-tuned biomes with the econ vitality oracle.
//
// The idea: a biome is a role distribution; some distributions reliably breed Thriving/Stable societies,
// others tip Fragile/Failing. We estimate that by SAMPLING synthetic rooms from the mix (no expensive
// foam solve) and running the real econ score over several seeds — mean vitality + how often it goes
// fragile. Then a hill-climb tunes the sliders for stability while keeping the biome's identity (its
// emphasized sliders stay above a floor). Pure + node-tested (stability.selftest.mjs).

import { ROLES, DOMAINS, vitalityTier } from '../v099/econ/econ.js';
import { scoreChunk } from './civic.js';
import { mixFromSliders, SLIDERS } from './biomes.js';

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// sample `n` synthetic rooms from a role-mix on a jittered grid — the fast stand-in for a solved chunk.
export function sampleRooms(roleMix, n, seed, W = 900, H = 600) {
  const rng = mulberry32((seed ^ 0xbeef) >>> 0);
  const tot = roleMix.reduce((s, m) => s + m[1], 0) || 1;
  const pick = () => { let r = rng() * tot; for (const [k, w] of roleMix) { r -= w; if (r <= 0) return k; } return 'dwell'; };
  const cols = Math.max(1, Math.round(Math.sqrt(n * W / H))), rows = Math.max(1, Math.ceil(n / cols));
  const dx = W / cols, dy = H / rows, rooms = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = (i / cols) | 0, role = pick(), R = ROLES[role] || {};
    const domain = R.dom ? DOMAINS[(rng() * DOMAINS.length) | 0].id : null;
    rooms.push({ role, domain, x: (c + 0.5) * dx + (rng() - 0.5) * dx * 0.6, y: (r + 0.5) * dy + (rng() - 0.5) * dy * 0.6, cells: [1] });
  }
  return rooms;
}

// evaluate a role-mix over several seeds → mean vitality, fragility (share Fragile/Failing), modeled tier.
export function evaluateMix(roleMix, { seeds = [1, 2, 3, 4, 5], n = 44 } = {}) {
  let v = 0, frag = 0; const tiers = {};
  for (const s of seeds) {
    const sc = scoreChunk(sampleRooms(roleMix, n, s), 900, 600, s);
    v += sc.vital.vitality; tiers[sc.vital.tier] = (tiers[sc.vital.tier] || 0) + 1;
    if (sc.vital.tier === 'Fragile' || sc.vital.tier === 'Failing') frag++;
  }
  const vitality = v / seeds.length;
  return { vitality, fragility: frag / seeds.length, tier: vitalityTier(Math.round(vitality)), tiers };
}

// the stability objective: high mean vitality, penalized for ever tipping fragile.
export function stabilityScore(roleMix, opts) { const e = evaluateMix(roleMix, opts); return e.vitality - 35 * e.fragility; }

// hill-climb the SLIDERS toward stability, keeping the biome's emphasized sliders (`theme`) above `floor`
// so the ward keeps its character. Deterministic from `seed`. Returns the tuned sliders + their evaluation.
export function solveStableSliders(baseSliders, { theme = [], iters = 70, seed = 1, floor = 1.3 } = {}) {
  const rng = mulberry32((seed ^ 0x5151) >>> 0);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const keys = SLIDERS.map((s) => s.key);
  let cur = { ...baseSliders }, curScore = stabilityScore(mixFromSliders(cur));
  for (let i = 0; i < iters; i++) {
    const cand = { ...cur }, k = keys[(rng() * keys.length) | 0], lo = theme.includes(k) ? floor : 0.2;
    cand[k] = clamp(cand[k] + (rng() - 0.5) * 0.8, lo, 3);
    const sc = stabilityScore(mixFromSliders(cand));
    if (sc > curScore) { cur = cand; curScore = sc; }
  }
  return { sliders: cur, score: curScore, ...evaluateMix(mixFromSliders(cur)) };
}

// the sliders a biome emphasizes (its identity) — those clearly above wild type, kept when stabilizing.
export function themeOf(sliders, thresh = 1.3) { return SLIDERS.map((s) => s.key).filter((k) => (sliders[k] || 1) >= thresh); }
