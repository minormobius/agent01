#!/usr/bin/env node
// node shelf/town-oracle.mjs [mod.mjs] [cases] [seed]
// Random towns vs an implementation of SPEC.md M1–M6 written from the spec's text alone
// (no code shared with mod.mjs: different date math, BFS components instead of union-find,
// sort-based judge choice). Each town is written as CSV with shuffled columns, CRLF or LF,
// blank lines, an extra column, and is pushed through parse → weekly → mutes → rings →
// appealJudge → report(). Small handle pools and short date spans force ties, thresholds hit
// exactly, chains of linked reporters, and late joiners. Exit 1 on any mismatch. (Morphyx)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { deepStrictEqual } from 'node:assert';

const modPath = resolve(process.argv[2] || 'mod.mjs');
const CASES = +(process.argv[3] || 400);
let seed = +(process.argv[4] || 12345);
const M = await import(pathToFileURL(modPath).href);

const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- reference, from SPEC text ----
const ms = d => new Date(d + 'T00:00:00Z').getTime();
const addDays = (d, n) => new Date(ms(d) + n * 864e5).toISOString().slice(0, 10);
const refWeek = (d, s) => Math.floor(Math.round((ms(d) - ms(s)) / 864e5) / 7) + 1;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function refWeekly(reps, start) {
  const out = {};
  const weeks = [...new Set(reps.map(r => refWeek(r.date, start)))].sort((a, b) => a - b);
  for (const w of weeks) {
    const these = reps.filter(r => refWeek(r.date, start) === w);
    const hs = [...new Set(these.map(r => r.reported))].sort(cmp);
    out[w] = {};
    for (const h of hs) {
      const mine = these.filter(r => r.reported === h);
      out[w][h] = { reports: mine.length, reporters: [...new Set(mine.map(r => r.reporter))].sort(cmp) };
    }
  }
  return out;
}
function refMutes(reps, start, k = 3) {
  const w = refWeekly(reps, start), out = [];
  for (const wk of Object.keys(w).map(Number).sort((a, b) => a - b))
    for (const h of Object.keys(w[wk]).sort(cmp))
      if (w[wk][h].reporters.length >= k) out.push({ week: wk, handle: h });
  return out;
}
function refRings(reps, res, { minReports = 6, minOverlap = 0.8, joinedWithinDays = 1 } = {}) {
  const joined = {};
  for (const p of res) joined[p.handle] = p.joined;
  const reporters = [...new Set(reps.map(r => r.reporter))].sort(cmp);
  const n = h => reps.filter(r => r.reporter === h).length;
  const T = h => new Set(reps.filter(r => r.reporter === h).map(r => r.reported));
  const link = (a, b) => {
    if (n(a) < minReports || n(b) < minReports) return false;
    if (!(a in joined) || !(b in joined)) return false;
    if (Math.abs(ms(joined[a]) - ms(joined[b])) / 864e5 > joinedWithinDays) return false;
    const A = T(a), B = T(b), U = new Set([...A, ...B]);
    const I = [...A].filter(x => B.has(x)).length;
    return I / U.size >= minOverlap;
  };
  const adj = new Map(reporters.map(h => [h, []]));
  for (const a of reporters) for (const b of reporters) if (a < b && link(a, b)) { adj.get(a).push(b); adj.get(b).push(a); }
  const seen = new Set(), groups = [];
  for (const h of reporters) {
    if (seen.has(h) || adj.get(h).length === 0) continue;
    const g = [], st = [h]; seen.add(h);
    while (st.length) { const x = st.pop(); g.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    groups.push(g.sort(cmp));
  }
  return groups.sort((x, y) => cmp(x[0], y[0]));
}
function refFnv(s) {
  let h = 0x811c9dc5n;
  for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 16777619n) % 4294967296n; }
  return Number(h);
}
function refJudge({ handle, week, reporters = [] }, res, start) {
  const last = addDays(start, 7 * week - 1);
  const el = res.filter(p => p.handle !== handle && !reporters.includes(p.handle) && p.joined <= last)
    .map(p => [refFnv(p.handle + ':' + handle + ':' + week), p.handle])
    .sort((a, b) => a[0] - b[0] || cmp(a[1], b[1]));
  return el.length ? el[0][1] : null;
}

// ---- random towns ----
const NAMES = ['ada', 'bo', 'cy', 'Dee', 'eli', 'fé', 'gus', 'hal', 'ivy', 'jo', 'kit', 'lu', 'Mo', 'ned', 'oz', 'pip', 'q-7', 'ré', '😀x', 'zed'];
function town() {
  const start = addDays('2025-12-20', Math.floor(rnd() * 30));
  const people = shuffle(NAMES).slice(0, 4 + Math.floor(rnd() * 14));
  const res = people.map(h => ({ handle: h, kind: pick(['human', 'agent']), joined: addDays(start, Math.floor(rnd() * 3 * (rnd() < 0.5 ? 1 : 12))) }));
  const reps = [];
  const nr = Math.floor(rnd() * 90);
  const span = 1 + Math.floor(rnd() * 50);
  // a ring: a few reporters hitting the same small target set
  const ring = shuffle(people).slice(0, 2 + Math.floor(rnd() * 3));
  const targets = shuffle(people).slice(0, 2 + Math.floor(rnd() * 4));
  for (let i = 0; i < nr; i++) {
    const r = rnd() < 0.5 ? pick(ring) : pick(people);
    const t = rnd() < 0.5 ? pick(targets) : pick(people);
    reps.push({ date: addDays(start, Math.floor(rnd() * span) - (rnd() < 0.05 ? 3 : 0)), reporter: r, reported: t, reason: pick(['spam', 'bad faith', 'x, y', 'a "q"']) });
  }
  return { start, res, reps };
}
function csv(rows, cols) {
  const order = shuffle([...cols, ...(rnd() < 0.3 ? ['extra'] : [])]);
  const nl = rnd() < 0.5 ? '\r\n' : '\n';
  const cell = v => (/[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const lines = [order.join(',')];
  for (const r of rows) { lines.push(order.map(c => cell(c === 'extra' ? 'zz' : r[c])).join(',')); if (rnd() < 0.05) lines.push(''); }
  return lines.join(nl) + (rnd() < 0.5 ? nl : '');
}

let bad = 0;
const check = (what, got, exp, c) => {
  try { deepStrictEqual(got, exp); } catch {
    if (bad++ < 5) console.log(`MISMATCH case ${c} ${what}\n  got ${JSON.stringify(got)}\n  exp ${JSON.stringify(exp)}`);
  }
};
for (let c = 0; c < CASES; c++) {
  const { start, res, reps } = town();
  const R = M.parseReports(csv(reps, ['date', 'reporter', 'reported', 'reason']));
  const P = M.parseResidents(csv(res, ['handle', 'kind', 'joined']));
  check('parseReports', R, reps, c);
  check('parseResidents', P, res, c);
  for (const r of reps.slice(0, 5)) check('weekOf', M.weekOf(r.date, start), refWeek(r.date, start), c);
  check('weekly', M.weekly(reps, start), refWeekly(reps, start), c);
  const k = 1 + Math.floor(rnd() * 4);
  check('mutes k=' + k, M.mutes(reps, start, { minDistinct: k }), refMutes(reps, start, k), c);
  check('mutes default', M.mutes(reps, start), refMutes(reps, start), c);
  const opt = { minReports: 1 + Math.floor(rnd() * 8), minOverlap: pick([0.5, 0.6, 2 / 3, 0.75, 0.8, 1]), joinedWithinDays: pick([0, 1, 2, 5]) };
  check('rings ' + JSON.stringify(opt), M.rings(reps, res, opt), refRings(reps, res, opt), c);
  check('rings default', M.rings(reps, res), refRings(reps, res), c);
  const W = refWeekly(reps, start);
  for (const m of refMutes(reps, start, 2)) {
    const a = { handle: m.handle, week: m.week, reporters: W[m.week][m.handle].reporters };
    check('appealJudge', M.appealJudge(a, res, start), refJudge(a, res, start), c);
  }
  if (M.report) {
    const mu = refMutes(reps, start);
    const wk = Object.keys(W).map(Number);
    check('report', M.report(reps, res, start), {
      weeks: wk.length ? Math.max(...wk) : 0, mutes: mu, rings: refRings(reps, res),
      judges: mu.map(m => ({ week: m.week, handle: m.handle, judge: refJudge({ handle: m.handle, week: m.week, reporters: W[m.week][m.handle].reporters }, res, start) })),
    }, c);
  }
}
for (const s of ['', 'a', 'foobar', 'é', '😀', 'judge:handle:12']) check('fnv32 ' + JSON.stringify(s), M.fnv32(s), refFnv(s), -1);
console.log(bad ? `${bad} mismatches over ${CASES} towns` : `OK: ${CASES} towns, no mismatch`);
process.exit(bad ? 1 : 0);
