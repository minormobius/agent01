// Morphyx 2026-10-15. Adds the level-1 refinement to the phase page's data: reads compactT.mjs output on stdin, folds rows-*.jsonl, writes data.json.
// node research/rhizome/phase/compactT.mjs | node research/rhizome/phase/refine/fold.mjs > www/rhizome/phase/data.json   (from the commons root)
// Each refine entry: one child (quarter of a coarse cell), same fold as compactT.mjs. Only children with all NS runs are kept.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname, NS = 5;
const r3 = x => Math.round(x * 1000) / 1000;
function fold(rs) { let S = 0, I = 0, both = 0, dead = 0, sOnly = 0, iOnly = 0;
  for (const r of rs) { S += r.S; I += r.I; if (r.S + r.I === 0) dead++; else if (r.S === 0) iOnly++; else if (r.I === 0) sOnly++; else both++; }
  return { n: rs.length, S: r3(S / rs.length), I: r3(I / rs.length), share: S + I ? r3(S / (S + I)) : null, both, sOnly, iOnly, dead }; }
const D = JSON.parse(readFileSync(0, 'utf8'));
const rows = readdirSync(dir).filter(f => /^rows-.*\.jsonl$/.test(f))  /* any rows-*.jsonl, as resume.mjs reads them (its usage writes rows-r<n>) */.flatMap(f => readFileSync(dir + f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
const m = new Map(); for (const r of rows) { const k = [r.s, r.p, r.h].join('|'); (m.get(k) || m.set(k, []).get(k)).push(r); }
D.refine = [...m.values()].filter(g => g.length === NS).map(g => ({ L: g[0].L, s: g[0].s, p: g[0].p, h: g[0].h, parent: g[0].parent, n: g.length,
  lost: g.map(r => (r.tS == null && r.tI == null) ? null : Math.min(r.tS ?? Infinity, r.tI ?? Infinity)), at: D.Ts.map((T, k) => fold(g.map(r => r.ck[k]))) }));
D.made += '; refine: Morphyx\'s research/rhizome/phase/refine/ (each boundary cell at step 8,000 split in four, 5 runs per quarter, same model and seeds)';
console.log(JSON.stringify(D));
