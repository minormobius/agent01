// Oborny, Kun, Czárán & Bokros 2000 (Ecology 81:3291), reproduced with stated choices. Modulo, 10-14.
// The page and shelf/rhizome/oborny.mjs both run this file.
// Choices (the paper leaves some open; oborny2000.md):
//  W  w(q) = min(a(q), 0.9), a(q) = 0.1 + c q, c = (h - 0.1)/p.  Control 'linear': w = 0.1 + 0.8 q, no plateau.
//  R  per empty cell, each von Neumann neighbour mother tries with chance w (p. 3294, "the chance of reproduction for each
//     neighboring ramet is w(q)"); if several succeed, one wins with chance proportional to w. Settled by the text.
//  Q  integrator q = good/total over its genet (all ramets from one propagule, connected or not), computed at the start
//     of the step, and again after births for survival. Synchronous. (Our choice.)
//  S  every ramet, newborns included, survives with chance w. (Our choice.)
import { rng } from './perc.js';
export const CASES = { B:[0.5,2,0.9], A1:[0.25,2,0.9], A2:[0.5,1,0.9], A3:[0.5,2,0.8], C1:[0.75,2,0.9], C2:[0.5,5,0.9], C3:[0.5,2,1.0] };
export const L = 100;
const N = L * L;
const NB = new Int32Array(4 * N);
for (let i = 0; i < N; i++) { const r = (i / L) | 0, c = i % L;
  NB.set([((r + L - 1) % L) * L + c, ((r + 1) % L) * L + c, r * L + (c + L - 1) % L, r * L + (c + 1) % L], 4 * i); }

// gen[i]: 0 empty, 1..25 splitter genets, 26..50 integrator genets
export function sim(cs, seed, wmode = 'clamp') {
  const [p, s, h] = CASES[cs], c = (h - 0.1) / p, R = rng(seed);
  const wq = wmode === 'linear' ? q => 0.1 + 0.8 * q : q => Math.min(0.1 + c * q, 0.9);
  const nb = L / s, B = nb * nb, good = new Uint8Array(N), ord = Array.from({ length: B }, (_, i) => i);
  for (let i = B - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
  const G = Math.round(p * B);
  for (let k = 0; k < G; k++) { const bi = ord[k], br = (bi / nb) | 0, bc = bi % nb;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) good[(br * s + y) * L + bc * s + x] = 1; }
  const gen = new Uint8Array(N), cells = Array.from({ length: N }, (_, i) => i);
  for (let k = 0; k < 50; k++) { const j = k + Math.floor(R() * (N - k)); const t = cells[k]; cells[k] = cells[j]; cells[j] = t; gen[cells[k]] = k + 1; }
  const w = new Float64Array(N), nG = new Float64Array(51), nF = new Float64Array(51), next = new Uint8Array(N);
  const cand = new Uint8Array(4), cw = new Float64Array(4);
  const setW = () => { nG.fill(0); nF.fill(0);
    for (let i = 0; i < N; i++) if (gen[i]) { nG[gen[i]]++; nF[gen[i]] += good[i]; }
    for (let i = 0; i < N; i++) { const g = gen[i]; w[i] = !g ? 0 : g <= 25 ? wq(good[i]) : wq(nF[g] / nG[g]); } };
  let t = 0;
  function step() {
    setW(); next.set(gen);
    for (let i = 0; i < N; i++) { if (gen[i]) continue;
      let n = 0, tot = 0;
      for (let k = 0; k < 4; k++) { const j = NB[4 * i + k]; if (gen[j] && R() < w[j]) { cand[n] = gen[j]; cw[n] = w[j]; tot += w[j]; n++; } }
      if (n === 1) next[i] = cand[0];
      else if (n > 1) { let x = R() * tot, k = 0; while (k < n - 1 && x >= cw[k]) { x -= cw[k]; k++; } next[i] = cand[k]; } }
    gen.set(next); setW();
    for (let i = 0; i < N; i++) if (gen[i] && !(R() < w[i])) gen[i] = 0;
    t++;
  }
  function cover() { // % of the field: splitter/integrator on good/bad
    const o = { sg: 0, sb: 0, ig: 0, ib: 0 };
    for (let i = 0; i < N; i++) if (gen[i]) o[(gen[i] <= 25 ? 's' : 'i') + (good[i] ? 'g' : 'b')]++;
    for (const k in o) o[k] = o[k] * 100 / N;
    return o;
  }
  return { good, gen, step, cover, get t() { return t; } };
}
export function run(cs, seed, wmode = 'clamp', T = 500) { const m = sim(cs, seed, wmode); while (m.t < T) m.step(); return m.cover(); }
export const seedOf = r => 1000 * r + 7;
