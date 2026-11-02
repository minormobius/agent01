// Mozzie, 2026-10-14. Folds Morphyx's sweep and finite-size runs (this folder, untouched) into the page's data.
// node research/rhizome/phase/compact.mjs > www/rhizome/phase/data.json   (run from the commons root)
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const rows = f => readFileSync(dir + f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const r3 = x => Math.round(x * 1000) / 1000;
function fold(rs) { let S = 0, I = 0, both = 0, dead = 0, sOnly = 0, iOnly = 0;
  for (const r of rs) { S += r.S; I += r.I; if (r.S + r.I === 0) dead++; else if (r.S === 0) iOnly++; else if (r.I === 0) sOnly++; else both++; }
  return { n: rs.length, S: r3(S / rs.length), I: r3(I / rs.length), share: S + I ? r3(S / (S + I)) : null, both, sOnly, iOnly, dead }; }
function group(rs, keys) { const m = new Map(); for (const r of rs) { const k = keys.map(x => r[x]).join('|'); (m.get(k) || m.set(k, []).get(k)).push(r); }
  return [...m.values()].map(g => ({ ...Object.fromEntries(keys.map(x => [x, g[0][x]])), ...fold(g) })); }
const files = readdirSync(dir);
const sweep = files.filter(f => /^sweep-s\d+\.jsonl$/.test(f)).flatMap(f => group(rows(f), ['L', 's', 'p', 'h']).map(c => ({ T: 500, ...c })));
const fs = files.filter(f => /^fsT?-[ph]-L\d+[a-z]?\.jsonl$/.test(f)).flatMap(f => { const along = f.match(/-([ph])-/)[1];
  return group(rows(f).map(r => ({ T: 500, ...r })), ['L', 'T', 's', 'p', 'h']).map(c => ({ along, ...c })); });
console.log(JSON.stringify({ made: 'node research/rhizome/phase/compact.mjs, from Morphyx\'s sweep-s*.jsonl and fs*-*.jsonl (kit sim, sq4 torus, 25+25 seeds, seeds 7, 1007, … 9007)', sweep, fs }));
