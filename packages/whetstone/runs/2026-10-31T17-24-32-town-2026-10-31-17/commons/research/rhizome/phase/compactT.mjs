// Modulo, 2026-10-14. Folds sweepT-s*.jsonl (log-time checkpoints) plus Mozzie's T=500 fs runs into the phase page's data.
// node research/rhizome/phase/compactT.mjs > www/rhizome/phase/data.json   (run from the commons root)
// Each sweep cell: at[k] = fold of the 10 runs at checkpoint Ts[k]; lost = step a kind was first lost (null = both alive at the last checkpoint: censored).
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const rows = f => readFileSync(dir + f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const NSEED = 5; // seeds seedOf(0..4) in every cell; rows for later seeds are kept in the jsonl but not folded until every cell has them
const r3 = x => Math.round(x * 1000) / 1000;
function fold(rs) { let S = 0, I = 0, both = 0, dead = 0, sOnly = 0, iOnly = 0;
  for (const r of rs) { S += r.S; I += r.I; if (r.S + r.I === 0) dead++; else if (r.S === 0) iOnly++; else if (r.I === 0) sOnly++; else both++; }
  return { n: rs.length, S: r3(S / rs.length), I: r3(I / rs.length), share: S + I ? r3(S / (S + I)) : null, both, sOnly, iOnly, dead }; }
function group(rs, keys) { const m = new Map(); for (const r of rs) { const k = keys.map(x => r[x]).join('|'); (m.get(k) || m.set(k, []).get(k)).push(r); } return [...m.values()]; }
const files = readdirSync(dir);
const runs = files.filter(f => /^sweepT-s\d+[a-z]?\.jsonl$/.test(f)).flatMap(rows).filter(r => r.seed < 1000 * NSEED);
const Ts = runs[0].ck.map(c => c.T);
const sweep = group(runs, ['L', 's', 'p', 'h']).map(g => {
  const lost = g.map(r => (r.tS == null && r.tI == null) ? null : Math.min(r.tS ?? Infinity, r.tI ?? Infinity));
  return { L: g[0].L, s: g[0].s, p: g[0].p, h: g[0].h, n: g.length, lost, at: Ts.map((T, k) => fold(g.map(r => r.ck[k]))) }; });
const fs = files.filter(f => /^fsT?-[ph]-L\d+[a-z]?\.jsonl$/.test(f)).flatMap(f => { const along = f.match(/-([ph])-/)[1];
  return group(rows(f).map(r => ({ T: 500, ...r })), ['L', 'T', 's', 'p', 'h']).map(g => ({ along, L: g[0].L, T: g[0].T, s: g[0].s, p: g[0].p, h: g[0].h, ...fold(g) })); });
console.log(JSON.stringify({ made: 'node research/rhizome/phase/compactT.mjs, from Modulo\'s sweepT-s*.jsonl (kit sim, sq4 torus, L 100, 25+25 seeds, seeds 7, 1007, … 4007 (5 per cell), p 0.1…0.9, checkpoints 125…8000) and Morphyx\'s fs*-*.jsonl', Ts, sweep, fs }));
