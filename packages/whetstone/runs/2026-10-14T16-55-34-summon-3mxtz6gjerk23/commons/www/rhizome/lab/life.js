// The lab's life engine (Modulo, 2026-10-14). It is kit/clone.mjs sim() with the kinds pulled out:
// any number of genets (one per seed), each of a kind. Kinds 0-2 are the ones we have checked:
//   0 splitter    w = W(own)    own   = is this square good (0/1)
//   1 integrator  w = W(share)  share = good fraction over the whole genet (Oborny et al. 2000)
//   2 piece       w = W(piece)  piece = good fraction over the connected piece of the genet (kit/piece)
//   3 your own    grow and live are two formulas you write (see compile below)
// W(q) = min(0.1 + c q, 0.9), c = (h - 0.1)/p, or the 'linear' control 0.1 + 0.8 q.
// Same order of random numbers as clone.mjs and clone-piece.mjs, so kinds 0-2 give their digits exactly
// (research/rhizome/lab/twin.mjs checks this, with mutants).
import { rng } from '../kit/clone.mjs';

export const KINDS = ['splitter', 'integrator', 'piece', 'yours'];
export const NAMES = ['own', 'share', 'piece', 'size', 'good', 'crowd', 't', 'c', 'h', 'p', 'W'];
const FNS = ['min', 'max', 'abs', 'exp', 'log', 'sqrt', 'pow', 'floor'];
const OK = new Set([...NAMES, ...FNS]);

// A formula is arithmetic on the names above. Nothing else is accepted: no strings, no brackets,
// no names outside the list, so a formula in a shared link can't do anything but compute a number.
export function compile(src) {
  src = String(src).trim();
  if (!src) throw new Error('empty formula');
  if (src.length > 240) throw new Error('formula longer than 240 characters');
  if (!/^[0-9a-zA-Z_.+\-*/%()<>=!?:,&| ]*$/.test(src)) throw new Error('use numbers, names, + - * / % ( ) < > = ! ? : , & |');
  if (/[a-zA-Z_]\s*\./.test(src) || /=/.test(src.replace(/[<>!=]==?/g, ''))) throw new Error('no . after a name, and no assignment');
  for (const id of src.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []) if (!OK.has(id)) throw new Error(`unknown name "${id}"`);
  const f = new Function(...NAMES, ...FNS, `"use strict"; return +(${src});`);
  f(0, 0, 0, 1, 0, 0, 0, 1, 0.9, 0.5, q => q, ...FNS.map(k => Math[k])); // throws now on a syntax error
  return f;
}
const MF = FNS.map(k => Math[k]);
const clamp01 = x => x > 0 ? (x < 1 ? x : 1) : 0; // NaN -> 0

// ground: { graph, good, rock, p }. plant: [[cell, kind], ...], one genet each, ids 1.. in that order.
// opt: { seed, h, wmode, grow, live } (grow/live: formulas, needed only for kind 3)
export function life(ground, plant, opt = {}) {
  const G = ground.graph, N = G.N, off = G.off, NB = G.nb, good = ground.good, rock = ground.rock || new Uint8Array(N);
  const h = opt.h ?? 0.9, p = ground.p, c = (h - 0.1) / p, R = rng(opt.seed ?? 7);
  const W = opt.wmode === 'linear' ? q => 0.1 + 0.8 * q : q => Math.min(0.1 + c * q, 0.9);
  const K = plant.length, kind = new Uint8Array(K + 1), gen = new Int32Array(N);
  plant.forEach(([i, k], n) => { gen[i] = n + 1; kind[n + 1] = k; });
  const fg = kind.includes(3) ? compile(opt.grow ?? 'W(share)') : null, fl = kind.includes(3) ? compile(opt.live ?? 'W(share)') : null;
  const needPiece = kind.includes(2) || kind.includes(3);
  const wg = new Float64Array(N), ws = new Float64Array(N), nG = new Float64Array(K + 1), nF = new Float64Array(K + 1), next = new Int32Array(N);
  const comp = new Int32Array(N), stk = new Int32Array(N), cN = new Float64Array(N), cF = new Float64Array(N);
  const cand = new Int32Array(G.maxDeg), cw = new Float64Array(G.maxDeg);
  let t = 0;
  const setW = () => {
    nG.fill(0); nF.fill(0);
    for (let i = 0; i < N; i++) if (gen[i]) { nG[gen[i]]++; nF[gen[i]] += good[i]; }
    if (needPiece) { comp.fill(-1); let nc = 0;
      for (let i = 0; i < N; i++) { const g = gen[i]; if (!g || kind[g] < 2 || comp[i] >= 0) continue;
        let sp = 0, n = 0, f = 0; stk[sp++] = i; comp[i] = nc;
        while (sp) { const u = stk[--sp]; n++; f += good[u];
          for (let e = off[u]; e < off[u + 1]; e++) { const v = NB[e]; if (gen[v] === g && comp[v] < 0) { comp[v] = nc; stk[sp++] = v; } } }
        cN[nc] = n; cF[nc] = f; nc++; } }
    for (let i = 0; i < N; i++) { const g = gen[i];
      if (!g) { wg[i] = ws[i] = 0; continue; }
      const k = kind[g];
      if (k === 0) wg[i] = ws[i] = W(good[i]);
      else if (k === 1) wg[i] = ws[i] = W(nF[g] / nG[g]);
      else if (k === 2) wg[i] = ws[i] = W(cF[comp[i]] / cN[comp[i]]);
      else { let d = 0, gd = 0, cr = 0;
        for (let e = off[i]; e < off[i + 1]; e++) { const v = NB[e]; if (rock[v]) continue; d++; gd += good[v]; cr += gen[v] ? 1 : 0; }
        const a = [good[i], nF[g] / nG[g], cF[comp[i]] / cN[comp[i]], nG[g], d ? gd / d : 0, d ? cr / d : 0, t, c, h, p, W, ...MF];
        wg[i] = clamp01(fg(...a)); ws[i] = clamp01(fl(...a)); } } };
  function step() {
    setW(); next.set(gen);
    for (let i = 0; i < N; i++) { if (gen[i] || rock[i]) continue;
      let n = 0, tot = 0;
      for (let e = off[i]; e < off[i + 1]; e++) { const j = NB[e]; if (gen[j] && R() < wg[j]) { cand[n] = gen[j]; cw[n] = wg[j]; tot += wg[j]; n++; } }
      if (n === 1) next[i] = cand[0];
      else if (n > 1) { let x = R() * tot, k = 0; while (k < n - 1 && x >= cw[k]) { x -= cw[k]; k++; } next[i] = cand[k]; } }
    gen.set(next); setW();
    for (let i = 0; i < N; i++) if (gen[i] && !(R() < ws[i])) gen[i] = 0;
    t++;
  }
  function count() { // per kind: % of the field on good and on bad ground, and genets still alive
    const out = KINDS.map(() => ({ good: 0, bad: 0, genets: 0 })), seen = new Uint8Array(K + 1);
    for (let i = 0; i < N; i++) { const g = gen[i]; if (!g) continue; const o = out[kind[g]];
      if (good[i]) o.good++; else o.bad++; if (!seen[g]) { seen[g] = 1; o.genets++; } }
    for (const o of out) { o.good *= 100 / N; o.bad *= 100 / N; }
    return out;
  }
  return { gen, kind, step, count, get t() { return t; } };
}
