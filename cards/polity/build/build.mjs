// Bake raw/ (congress.json + wd-*.json + parties.json) into ../data/polity.json,
// the one columnar file the viewer loads. One row per (officeholder, statement).
// Usage: node build.mjs
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const raw = path.join(here, 'raw');
const NOW = 2026.85;

// ── party families: [key, name, color, wiki, regex] in pie order (left → right)
const FAM = [
  ['AA', 'Anti-Administration', '#6fbf6f', 'Anti-Administration party', /anti-administration/i],
  ['DR', 'Democratic-Republican', '#1f9e4a', 'Democratic-Republican Party', /democratic[- ]republican|jeffersonian|crawford/i],
  ['J', 'Jacksonian', '#5b84e8', 'Jacksonian democracy', /^jackson|jacksonian(?!.*anti)|^jackson democrat/i],
  ['D', 'Democratic', '#2d5fd6', 'Democratic Party (United States)', /democrat|dfl|democratic-farmer|nonpartisan league dem/i],
  ['S', 'Socialist & Labor', '#c2185b', 'Socialist Party of America', /socialist|labor|labour|farmer|american labor|communist/i],
  ['PO', 'Populist', '#8a8f2a', "People's Party (United States)", /populist|people|greenback|silver|readjuster|alliance|union labor/i],
  ['PR', 'Progressive', '#e08a1e', 'Progressive Party (United States, 1912)', /progressive|bull moose/i],
  ['FS', 'Free Soil & Liberty', '#b05fc9', 'Free Soil Party', /free soil|liberty|anti-monopoly|prohibition/i],
  ['I', 'Independent & other', '#8d8d8d', 'Independent politician', /independent|nonpartisan|non-partisan|green|libertarian|reform|conservative|liberal(?! republican)|union|coalition|law and order|opposition|nullifier|states rights|unconditional|constitution|american party|^other/i],
  ['KN', 'Know Nothing', '#7a4fa0', 'Know Nothing', /know[- ]nothing|native american|nativist|^american$/i],
  ['AM', 'Anti-Masonic', '#d4893f', 'Anti-Masonic Party', /anti[- ]?mason/i],
  ['W', 'Whig', '#e3b53b', 'Whig Party (United States)', /whig/i],
  ['NR', 'National Republican', '#cfa25a', 'National Republican Party', /national republican|adams|anti-jackson|anti jackson/i],
  ['F', 'Federalist', '#e8846a', 'Federalist Party', /federalist|pro-administration/i],
  ['R', 'Republican', '#d93a32', 'Republican Party (United States)', /republican|unionist|union party/i],
  ['U', 'Party not recorded', '#3c3c45', null, /^$/],
];
const famIdx = Object.fromEntries(FAM.map((f, i) => [f[0], i]));
const unknown = famIdx.U;
const partyCache = new Map();
function family(label) {
  if (!label) return unknown;
  if (partyCache.has(label)) return partyCache.get(label);
  let k = unknown;
  // order matters: specific before generic
  const tests = ['AA', 'DR', 'NR', 'AM', 'KN', 'FS', 'PR', 'S', 'PO', 'J', 'W', 'F', 'D', 'R', 'I'];
  if (/liberal republican/i.test(label)) k = famIdx.I;
  else if (/silver republican/i.test(label)) k = famIdx.PO;
  else for (const t of tests) if (FAM[famIdx[t]][4].test(label)) { k = famIdx[t]; break; }
  partyCache.set(label, k);
  return k;
}

const BODIES = [
  ['P', 'President', 'P'], ['V', 'Vice President', 'P'], ['G', 'Governor', 'G'],
  ['S', 'U.S. Senate', 'S'], ['H', 'U.S. House', 'H'], ['SS', 'State senate', 'SS'], ['SH', 'State house', 'SH'],
];
const bodyIdx = Object.fromEntries(BODIES.map((b, i) => [b[0], i]));

const yr = d => { if (!d) return null; const m = /^(-?\d{4})-(\d\d)-(\d\d)/.exec(d); if (!m) return null; return +m[1] + (+m[2] - 1) / 12 + (+m[3] - 1) / 365; };
const TYP = { P: 4, V: 4, G: 4, S: 6, H: 2, SS: 4, SH: 2 };

const people = [], pkey = new Map();
function person(key, name, wiki, born, qid) {
  if (pkey.has(key)) return pkey.get(key);
  const i = people.length; people.push([name || '?', wiki || '', born ? +born : 0, qid || '']); pkey.set(key, i); return i;
}
const states = [];
const stIdx = s => { let i = states.indexOf(s); if (i < 0) { states.push(s); i = states.length - 1; } return i; };
const T = { p: [], b: [], s: [], f: [], y0: [], y1: [], d: [], pl: [] };
const plabels = [], plIdx = new Map();
const pl = l => { l = l || 'Unknown'; if (!plIdx.has(l)) { plIdx.set(l, plabels.length); plabels.push(l); } return plIdx.get(l); };
function add(p, b, st, label, y0, y1, d) {
  if (y0 == null || y0 < 1600 || y0 > NOW + 1) return false;
  if (y1 == null || y1 < y0) y1 = Math.min(y0 + TYP[b], NOW);
  if (y1 - y0 > 60) y1 = y0 + 60;
  T.p.push(p); T.b.push(bodyIdx[b]); T.s.push(stIdx(st)); T.f.push(family(label)); T.pl.push(pl(label));
  T.y0.push(Math.round(y0 * 100) / 100); T.y1.push(Math.round(y1 * 100) / 100); T.d.push(d ?? '');
  return true;
}

// ── Congress (authoritative for H/S)
const cong = JSON.parse(fs.readFileSync(path.join(raw, 'congress.json')));
const congQ = new Set();
for (const L of cong) {
  const p = person('c:' + L.bio, L.name, L.wiki, L.born, L.qid);
  if (L.qid) { congQ.add(L.qid); pkey.set('q:' + L.qid, p); }
  for (const t of L.terms) add(p, t.b, t.st, t.p === 'Democrat' ? 'Democratic' : t.p, yr(t.s), yr(t.e), t.b === 'H' ? (t.d == null ? '' : t.d <= 0 ? 'AL' : t.d) : '');
}

// ── Wikidata positions
const plab = JSON.parse(fs.readFileSync(path.join(raw, 'parties.json')));
const termInfo = fs.existsSync(path.join(raw, 'terms.json')) ? JSON.parse(fs.readFileSync(path.join(raw, 'terms.json'))) : {};
function termSpan(ids) {
  let a = null, b = null;
  for (const t of ids || []) {
    const I = termInfo[t]; if (!I) continue;
    let s = yr(I.s), e = yr(I.e);
    const m = /\b(1[6-9]\d\d|20\d\d)(?:\s*[-\u2013]\s*(1[6-9]\d\d|20\d\d|\d\d))?/.exec(I.l || '');
    if (s == null && m) s = +m[1];
    if (e == null && m && m[2]) e = +(m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]) + 1;
    if (s == null && I.pt) s = yr(I.pt);
    if (s != null && (a == null || s < a)) a = s;
    if (e != null && (b == null || e > b)) b = e;
  }
  return [a, b];
}
const positions = JSON.parse(fs.readFileSync(path.join(here, 'positions.json')));
let dropped = 0, kept = 0;
for (const pos of positions) {
  const f = path.join(raw, `wd-${pos.q}.json`);
  if (!fs.existsSync(f)) { console.warn('missing', pos.q); continue; }
  const W = JSON.parse(fs.readFileSync(f));
  for (const s of W.stmts) {
    const P = W.people[s.p];
    const pi = person('q:' + s.p, P.name, P.wiki, P.born, s.p);
    const [ta, tb] = termSpan(s.t);
    let y0 = yr(s.s) ?? yr(s.ts) ?? ta, y1 = yr(s.e) ?? yr(s.te) ?? tb;
    if (y1 != null && y0 != null && y1 <= y0) y1 = null;
    if (y0 == null && y1 != null) y0 = y1 - TYP[pos.b];
    let party = s.g ? plab[s.g]?.l : null;
    if (!party) {
      const ps = W.parties[s.p] || [];
      const at = y0 ?? 0;
      const hit = ps.find(x => (yr(x.s) ?? -1e9) <= at + 0.5 && at <= (yr(x.e) ?? 1e9)) || (ps.length ? ps[ps.length - 1] : null);
      party = hit ? plab[hit.q]?.l : null;
    }
    const d = s.d ? '' : '';
    if (add(pi, pos.b, pos.st, party, y0, y1, d)) kept++; else dropped++;
  }
}
// collapse duplicate presidents/VP/governor statements (same person, body, state, overlapping)
console.log('wikidata stmts kept', kept, 'dropped (undated)', dropped);

// ── report families
const fc = new Array(FAM.length).fill(0);
for (const f of T.f) fc[f]++;
console.log(FAM.map((f, i) => f[0] + ':' + fc[i]).join(' '));
const unk = {};
T.pl.forEach((l, i) => { if (T.f[i] === famIdx.I || T.f[i] === unknown) unk[plabels[l]] = (unk[plabels[l]] || 0) + 1; });
console.log('I/U labels:', Object.entries(unk).sort((a, b) => b[1] - a[1]).slice(0, 40));

// drop people with no placed term, remap
const used = new Int32Array(people.length).fill(-1); let nu = 0;
for (const p of T.p) if (used[p] < 0) used[p] = nu++;
const kept2 = new Array(nu); people.forEach((p, i) => { if (used[i] >= 0) kept2[used[i]] = p; });
T.p = T.p.map(p => used[p]); people.length = 0; people.push(...kept2);

const out = {
  built: new Date().toISOString().slice(0, 10),
  sources: ['unitedstates/congress-legislators (CC0)', 'Wikidata (CC0)'],
  families: FAM.map(f => ({ k: f[0], name: f[1], color: f[2], wiki: f[3] })),
  bodies: BODIES.map(b => ({ k: b[0], name: b[1] })),
  states, partyLabels: plabels,
  people: { n: people.map(p => p[0]), w: people.map(p => p[1] === p[0] ? '=' : p[1]), b: people.map(p => p[2]), q: people.map(p => p[3]) },
  terms: T,
};
fs.writeFileSync(path.join(here, '..', 'data', 'polity.json'), JSON.stringify(out));
console.log('people', people.length, 'terms', T.p.length, 'bytes', fs.statSync(path.join(here, '..', 'data', 'polity.json')).size);
