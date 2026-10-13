// larkfield-ref.mjs — an independent reading of Larkfield SPEC.md, written without looking at
// mod.mjs's internals, plus a differential fuzzer against a project's mod.mjs.
//   node shelf/larkfield-ref.mjs <dir> [SEED] [COUNT]
// Compares weekOf, weekly, mutes (several minDistinct), rings (several option sets), appealJudge
// for every (week, handle) that has reports, moderate(), and the parsers on re-serialised CSV
// (shuffled columns, CRLF, blank lines, quoted fields). Exit 1 on any disagreement.
// Different technique on purpose: brute-force pair graph + DFS components, BigInt FNV,
// full sort for the judge, date arithmetic via string->Date per call. — Modulo
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const day = (d) => Math.round(new Date(d + 'T00:00:00Z').getTime() / 864e5);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const ref = {
  weekOf: (d, s) => Math.floor((day(d) - day(s)) / 7) + 1,
  weekly(reps, s) {
    const o = {};
    for (const r of reps) {
      const w = String(ref.weekOf(r.date, s));
      o[w] ??= {};
      o[w][r.reported] ??= { reports: 0, reporters: [] };
      o[w][r.reported].reports++;
      if (!o[w][r.reported].reporters.includes(r.reporter)) o[w][r.reported].reporters.push(r.reporter);
    }
    for (const w in o) for (const h in o[w]) o[w][h].reporters.sort(cmp);
    return o;
  },
  mutes(reps, s, { minDistinct = 3 } = {}) {
    const out = [];
    const W = ref.weekly(reps, s);
    for (const w in W) for (const h in W[w]) if (W[w][h].reporters.length >= minDistinct) out.push({ week: +w, handle: h });
    return out.sort((a, b) => a.week - b.week || cmp(a.handle, b.handle));
  },
  rings(reps, res, { minReports = 6, minOverlap = 0.8, joinedWithinDays = 1 } = {}) {
    const people = [...new Set(reps.map((r) => r.reporter))].sort(cmp);
    const n = (p) => reps.filter((r) => r.reporter === p).length;
    const T = (p) => new Set(reps.filter((r) => r.reporter === p).map((r) => r.reported));
    const J = (p) => { const x = res.find((q) => q.handle === p); return x ? day(x.joined) : null; };
    const ok = people.filter((p) => n(p) >= minReports && J(p) !== null);
    const adj = new Map(ok.map((p) => [p, []]));
    for (const a of ok) for (const b of ok) {
      if (a >= b) continue;
      if (Math.abs(J(a) - J(b)) > joinedWithinDays) continue;
      const A = T(a), B = T(b);
      const inter = [...A].filter((x) => B.has(x)).length;
      const uni = new Set([...A, ...B]).size;
      if (uni && inter / uni >= minOverlap) { adj.get(a).push(b); adj.get(b).push(a); }
    }
    const seen = new Set(), groups = [];
    for (const p of ok) {
      if (seen.has(p)) continue;
      const g = [], st = [p]; seen.add(p);
      while (st.length) { const x = st.pop(); g.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); st.push(y); } }
      if (g.length >= 2) groups.push(g.sort(cmp));
    }
    return groups.sort((a, b) => cmp(a[0], b[0]));
  },
  fnv32(str) {
    let h = 2166136261n;
    for (let i = 0; i < str.length; i++) { h ^= BigInt(str.charCodeAt(i)); h = (h * 16777619n) % 4294967296n; }
    return Number(h);
  },
  appealJudge({ handle, week, reporters = [] }, res, s) {
    const last = day(s) + 7 * week - 1;
    const firsts = res.filter((p, i) => res.findIndex((q) => q.handle === p.handle) === i);
    const el = firsts.filter((p) => p.handle !== handle && !reporters.includes(p.handle) && day(p.joined) <= last)
      .map((p) => [ref.fnv32(p.handle + ':' + handle + ':' + week), p.handle])
      .sort((a, b) => a[0] - b[0] || cmp(a[1], b[1]));
    return el.length ? el[0][1] : null;
  },
  moderate(reps, res, s) {
    const W = ref.weekly(reps, s);
    const ws = Object.keys(W).map(Number);
    const m = ref.mutes(reps, s);
    return {
      weeks: ws.length ? Math.max(...ws) : 0, mutes: m, rings: ref.rings(reps, res),
      judges: m.map(({ week, handle }) => ({ week, handle, judge: ref.appealJudge({ handle, week, reporters: W[week][handle].reporters }, res, s) })),
    };
  },
};

function rng(seed) { let x = seed >>> 0 || 1; return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296; }
const iso = (n) => new Date(n * 864e5).toISOString().slice(0, 10);

function town(R) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  const names = ['a', 'b', 'B', 'ab', 'é', 'Zed', 'zed', 'a-1', 'q q', 'x,y', 'say "hi"', 'ß', '\u{1F600}', 'm', 'n', 'o'];
  const N = 3 + Math.floor(R() * 12);
  const hs = [...new Set(Array.from({ length: N }, () => pick(names)))];
  const s0 = day('2026-07-06');
  const res = hs.map((h) => ({ handle: h, kind: pick(['human', 'agent']), joined: iso(s0 + Math.floor(R() * 30) - 3) }));
  if (R() < 0.2) res.push({ handle: pick(hs), kind: 'human', joined: iso(s0 + 40) }); // duplicate row
  const reporters = R() < 0.3 ? [...hs, 'ghost'] : hs;
  const reps = [];
  const M = Math.floor(R() * 80);
  const span = R() < 0.3 ? 120 : 50; // >63 days reaches week 10, where string-sorted weeks break
  // a ring sometimes: two or three accounts reporting the same targets
  const ring = R() < 0.5 ? [pick(hs), pick(hs), pick(hs)].slice(0, 2 + (R() < 0.4)) : [];
  for (let i = 0; i < M; i++) {
    const date = iso(s0 + Math.floor(R() * span) - 2);
    const tgt = pick(hs);
    if (ring.length && R() < 0.4) for (const r of ring) reps.push({ date, reporter: r, reported: tgt, reason: 'spam' });
    else reps.push({ date, reporter: pick(reporters), reported: tgt, reason: pick(['spam', 'off topic', 'a, b']) });
  }
  return { reps, res, start: R() < 0.8 ? '2026-07-06' : iso(s0 + Math.floor(R() * 10) - 5) };
}

function toCsv(rows, cols, R) {
  const q = (v) => (/[",\r\n]/.test(v) || /^\s|\s$/.test(v) || R() < 0.1 ? '"' + v.replace(/"/g, '""') + '"' : v);
  const eol = R() < 0.5 ? '\r\n' : '\n';
  const order = [...cols].sort(() => R() - 0.5);
  const lines = [order.map((c) => (R() < 0.3 ? c.toUpperCase() : c)).join(',')];
  for (const r of rows) { lines.push(order.map((c) => q(r[c])).join(',')); if (R() < 0.1) lines.push(''); }
  return (R() < 0.2 ? '﻿' : '') + lines.join(eol) + (R() < 0.5 ? eol : '');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir = '.', seed = '1', count = '500'] = process.argv.slice(2);
  const M = await import(pathToFileURL(resolve(dir, 'mod.mjs')).href);
  const R = rng(+seed);
  let bad = 0, checks = 0;
  const eq = (name, got, want, ctx) => {
    checks++;
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) { if (bad++ < 8) console.log(`DIFF ${name}\n  got  ${g}\n  want ${w}\n  ctx  ${JSON.stringify(ctx).slice(0, 600)}`); }
  };
  for (let t = 0; t < +count; t++) {
    const { reps, res, start } = town(R);
    const ctx = { reps, res, start };
    const P = M.parseReports(toCsv(reps, ['date', 'reporter', 'reported', 'reason'], R));
    eq('parseReports', P, reps, ctx);
    eq('parseResidents', M.parseResidents(toCsv(res, ['handle', 'kind', 'joined'], R)), res, ctx);
    for (const r of reps) eq('weekOf', M.weekOf(r.date, start), ref.weekOf(r.date, start), r);
    eq('weekly', M.weekly(reps, start), ref.weekly(reps, start), ctx);
    for (const k of [1, 2, 3, 4]) eq('mutes' + k, M.mutes(reps, start, { minDistinct: k }), ref.mutes(reps, start, { minDistinct: k }), ctx);
    eq('mutes', M.mutes(reps, start), ref.mutes(reps, start), ctx);
    for (const o of [undefined, { minReports: 2, minOverlap: 0.5, joinedWithinDays: 3 }, { minReports: 1, minOverlap: 1, joinedWithinDays: 0 }, { minReports: 4, minOverlap: 0.34, joinedWithinDays: 10 }])
      eq('rings' + JSON.stringify(o ?? {}), M.rings(reps, res, o), ref.rings(reps, res, o), ctx);
    const W = ref.weekly(reps, start);
    for (const w in W) for (const h in W[w]) for (const rs of [W[w][h].reporters, []])
      eq('appealJudge', M.appealJudge({ handle: h, week: +w, reporters: rs }, res, start), ref.appealJudge({ handle: h, week: +w, reporters: rs }, res, start), { h, w });
    eq('moderate', M.moderate(reps, res, start), ref.moderate(reps, res, start), ctx);
  }
  for (const s of ['', 'a', 'foobar', 'é', '\u{1F600}', 'judge:handle:3']) eq('fnv32 ' + JSON.stringify(s), M.fnv32(s), ref.fnv32(s), s);
  console.log(`${checks} checks, ${bad} disagreements (seed ${seed}, ${count} towns)`);
  process.exit(bad ? 1 : 0);
}
