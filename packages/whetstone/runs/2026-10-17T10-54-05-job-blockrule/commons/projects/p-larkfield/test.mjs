// node test.mjs — tests for mod.mjs and cli.mjs. Exit 1 on any failure.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseReports, parseResidents, weekOf, weekly, mutes, rings, fnv32, appealJudge, moderate,
} from './mod.mjs';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log(`FAIL ${name}\n  ${e.message.split('\n').join('\n  ')}`); }
}
const R = (date, reporter, reported, reason = 'x') => ({ date, reporter, reported, reason });
const P = (handle, joined, kind = 'human') => ({ handle, kind, joined });

// ---------- M1 ----------
t('M1 reports: plain, file order', () => {
  assert.deepEqual(parseReports('date,reporter,reported,reason\n2026-07-09,wren,tamsin,bad faith\n2026-07-01,a,b,spam\n'), [
    R('2026-07-09', 'wren', 'tamsin', 'bad faith'), R('2026-07-01', 'a', 'b', 'spam'),
  ]);
});
t('M1 reports: columns in another order', () => {
  assert.deepEqual(parseReports('reason,reported,date,reporter\nspam,b,2026-07-01,a'), [R('2026-07-01', 'a', 'b', 'spam')]);
});
t('M1 CRLF, blank lines, whitespace-only lines, no trailing newline', () => {
  const txt = 'handle,kind,joined\r\n\r\nharrow,human,2026-07-06\r\n   \r\nb0rrow,agent,2026-07-12\r\n\r\n';
  assert.deepEqual(parseResidents(txt), [P('harrow', '2026-07-06'), P('b0rrow', '2026-07-12', 'agent')]);
});
t('M1 residents: other column order, BOM', () => {
  assert.deepEqual(parseResidents('﻿joined,handle,kind\n2026-07-06,pell,human'), [P('pell', '2026-07-06')]);
});
t('M1 quoted reason with comma and quote', () => {
  const r = parseReports('date,reporter,reported,reason\n2026-07-01,a,b,"spam, again ""lol"""\n');
  assert.equal(r[0].reason, 'spam, again "lol"');
});
t('M1 CRLF after a quoted last field leaves no \\r', () => {
  const r = parseReports('date,reporter,reported,reason\r\n2026-07-01,a,b,"spam, again"\r\n2026-07-02,a,c,"x"\r\n');
  assert.deepEqual(r.map((x) => x.reason), ['spam, again', 'x']);
});
t('M1 header only / empty', () => {
  assert.deepEqual(parseReports('date,reporter,reported,reason\n'), []);
  assert.deepEqual(parseReports(''), []);
});

// ---------- M2 ----------
t('M2 weekOf boundaries', () => {
  const s = '2026-07-06';
  assert.equal(weekOf('2026-07-06', s), 1);
  assert.equal(weekOf('2026-07-12', s), 1); // day 6
  assert.equal(weekOf('2026-07-13', s), 2); // day 7
  assert.equal(weekOf('2026-07-19', s), 2);
  assert.equal(weekOf('2026-07-20', s), 3);
  assert.equal(weekOf('2026-12-31', '2026-12-25'), 1); // day 6
  assert.equal(weekOf('2027-01-01', '2026-12-25'), 2); // day 7, across the year
  assert.equal(weekOf('2027-01-01', '2026-12-31'), 1);
  assert.equal(weekOf('2024-03-01', '2024-02-23'), 2); // leap day counts
  assert.equal(weekOf('2026-03-30', '2026-03-23'), 2); // DST week elsewhere is irrelevant in UTC
});
t('M2 weekly: counts, distinct sorted reporters, only weeks/handles with reports', () => {
  const rs = [
    R('2026-07-06', 'zed', 'x'), R('2026-07-07', 'amy', 'x'), R('2026-07-08', 'zed', 'x'),
    R('2026-07-20', 'Bob', 'y'), R('2026-07-20', 'amy', 'y'),
  ];
  assert.deepEqual(weekly(rs, '2026-07-06'), {
    1: { x: { reports: 3, reporters: ['amy', 'zed'] } },
    3: { y: { reports: 2, reporters: ['Bob', 'amy'] } }, // code-unit order: 'B' < 'a'
  });
});

// ---------- M3 ----------
t('M3 threshold counts distinct people, not reports', () => {
  const rs = [];
  for (let i = 0; i < 10; i++) rs.push(R('2026-07-06', 'a', 'v'), R('2026-07-06', 'b', 'v'));
  assert.deepEqual(mutes(rs, '2026-07-06'), []);
  rs.push(R('2026-07-12', 'c', 'v'));
  assert.deepEqual(mutes(rs, '2026-07-06'), [{ week: 1, handle: 'v' }]);
  rs.push(R('2026-07-13', 'd', 'v')); // week 2: one reporter only
  assert.deepEqual(mutes(rs, '2026-07-06'), [{ week: 1, handle: 'v' }]);
});
t('M3 reporters do not carry across weeks', () => {
  const rs = [R('2026-07-12', 'a', 'v'), R('2026-07-12', 'b', 'v'), R('2026-07-13', 'c', 'v')];
  assert.deepEqual(mutes(rs, '2026-07-06'), []);
});
t('M3 minDistinct option and sort (week numeric, then handle)', () => {
  const rs = [];
  const add = (date, h) => ['a', 'b'].forEach((p) => rs.push(R(date, p, h)));
  add('2026-09-14', 'b'); add('2026-09-14', 'a'); add('2026-07-06', 'z'); add('2026-07-27', 'm');
  assert.deepEqual(mutes(rs, '2026-07-06', { minDistinct: 2 }).map((m) => `${m.week}:${m.handle}`), ['1:z', '4:m', '11:a', '11:b']);
  assert.deepEqual(mutes(rs, '2026-07-06', {}), []);
});

// ---------- M4 ----------
const many = (reporter, targets, date = '2026-07-06') => targets.map((h) => R(date, reporter, h));
t('M4 simple pair, defaults', () => {
  const rs = [...many('q', ['a', 'b', 'c', 'd', 'e', 'f']), ...many('l', ['a', 'b', 'c', 'd', 'e', 'f'])];
  const ppl = [P('q', '2026-07-22'), P('l', '2026-07-22')];
  assert.deepEqual(rings(rs, ppl), [['l', 'q']]);
});
t('M4 minReports counts reports filed, including repeats', () => {
  const rs = [...many('q', ['a', 'a', 'a', 'b', 'b', 'b']), ...many('l', ['a', 'b', 'a', 'b', 'a', 'b'])];
  const ppl = [P('q', '2026-07-22'), P('l', '2026-07-22')];
  assert.deepEqual(rings(rs, ppl), [['l', 'q']]);
  assert.deepEqual(rings(rs.slice(1), ppl), []); // q has 5
});
t('M4 Jaccard exactly at minOverlap links; just below does not', () => {
  // A={a..e}, B={a..d}: 4/5 = 0.8
  const rs = [...many('p', ['a', 'b', 'c', 'd', 'e', 'e']), ...many('r', ['a', 'b', 'c', 'd', 'd', 'd'])];
  const ppl = [P('p', '2026-07-01'), P('r', '2026-07-01')];
  assert.deepEqual(rings(rs, ppl), [['p', 'r']]);
  // A={a..e}, B={a,b,c,d,f}: 4/6
  const rs2 = [...many('p', ['a', 'b', 'c', 'd', 'e', 'e']), ...many('r', ['a', 'b', 'c', 'd', 'f', 'f'])];
  assert.deepEqual(rings(rs2, ppl), []);
  assert.deepEqual(rings(rs2, ppl, { minOverlap: 0.6 }), [['p', 'r']]);
});
t('M4 join window is inclusive', () => {
  const rs = [...many('q', ['a', 'b', 'c', 'd', 'e', 'f']), ...many('l', ['a', 'b', 'c', 'd', 'e', 'f'])];
  assert.deepEqual(rings(rs, [P('q', '2026-07-22'), P('l', '2026-07-23')]), [['l', 'q']]);
  assert.deepEqual(rings(rs, [P('q', '2026-07-22'), P('l', '2026-07-24')]), []);
  assert.deepEqual(rings(rs, [P('q', '2026-07-22'), P('l', '2026-07-24')], { joinedWithinDays: 2 }), [['l', 'q']]);
  assert.deepEqual(rings(rs, [P('q', '2026-07-31'), P('l', '2026-08-01')]), [['l', 'q']]); // across a month
});
t('M4 groups are connected components (chain), sorted', () => {
  const T = ['a', 'b', 'c', 'd', 'e', 'f'];
  const rs = [...many('m', T), ...many('k', T), ...many('n', T), ...many('c2', T), ...many('b2', T)];
  const ppl = [P('m', '2026-07-01'), P('k', '2026-07-02'), P('n', '2026-07-03'), P('c2', '2026-08-01'), P('b2', '2026-08-02')];
  // m–k and k–n linked by date, m–n not: still one group.
  assert.deepEqual(rings(rs, ppl), [['b2', 'c2'], ['k', 'm', 'n']]);
});
t('M4 reporter missing from residents is not linked', () => {
  const T = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(rings([...many('q', T), ...many('l', T)], [P('q', '2026-07-22')]), []);
});

// ---------- M5 ----------
t('M5 fnv32 reference vectors', () => {
  assert.equal(fnv32(''), 2166136261);
  assert.equal(fnv32('a'), 0xe40c292c);
  assert.equal(fnv32('foobar'), 0xbf9cf968);
  // UTF-16 code units, not bytes: 'é' is one unit 0xE9
  let h = 2166136261; h = (h ^ 0xe9) >>> 0; h = Number((BigInt(h) * 16777619n) % 4294967296n);
  assert.equal(fnv32('é'), h);
});
// an independent judge: sort by (hash, handle) and take the first eligible
function refJudge({ handle, week, reporters }, residents, start) {
  const last = new Date(Date.parse(start + 'T00:00:00Z') + (7 * week - 1) * 86400000).toISOString().slice(0, 10);
  const ok = residents.filter((p) => p.handle !== handle && !reporters.includes(p.handle) && p.joined <= last);
  ok.sort((a, b) => fnv32(`${a.handle}:${handle}:${week}`) - fnv32(`${b.handle}:${handle}:${week}`) || (a.handle < b.handle ? -1 : 1));
  return ok.length ? ok[0].handle : null;
}
t('M5 excludes muted, reporters, and late joiners; joining on the last day is allowed', () => {
  const ppl = [P('v', '2026-07-01'), P('a', '2026-07-01'), P('b', '2026-07-01'), P('late', '2026-07-13'), P('edge', '2026-07-12')];
  const j = appealJudge({ handle: 'v', week: 1, reporters: ['a', 'b'] }, ppl, '2026-07-06');
  assert.equal(j, 'edge'); // the only eligible one: week 1 ends 07-12
  assert.equal(appealJudge({ handle: 'v', week: 1, reporters: ['a', 'b', 'edge'] }, ppl, '2026-07-06'), null);
  assert.equal(appealJudge({ handle: 'v', week: 2, reporters: ['a', 'b', 'edge'] }, ppl, '2026-07-06'), 'late');
});
t('M5 picks the lowest hash (agrees with an independent reference on random towns)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < 300; k++) {
    const n = 2 + Math.floor(rnd() * 12);
    const ppl = Array.from({ length: n }, (_, i) => P(`h${i}${rnd() < 0.3 ? 'é' : ''}`, `2026-07-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`));
    const handle = ppl[0].handle;
    const reporters = ppl.slice(1).filter(() => rnd() < 0.3).map((p) => p.handle);
    const week = 1 + Math.floor(rnd() * 4);
    const q = { handle, week, reporters };
    assert.equal(appealJudge(q, ppl, '2026-07-01'), refJudge(q, ppl, '2026-07-01'), JSON.stringify({ q, ppl }));
  }
});

// ---------- M6 and the town's own data ----------
const START = '2026-07-06';
const town = () => [parseReports(readFileSync('reports.csv', 'utf8')), parseResidents(readFileSync('residents.csv', 'utf8'))];
t('town: the two-account ring is found, and it mutes nobody', () => {
  const [rs, ppl] = town();
  assert.deepEqual(rings(rs, ppl), [['ledgerwick', 'quillon']]);
  assert.deepEqual(mutes(rs, START), [{ week: 4, handle: 'brassmoth' }, { week: 5, handle: 'brassmoth' }, { week: 6, handle: 'brassmoth' }]);
});
t('M6 cli output on town data', () => {
  const out = JSON.parse(execFileSync(process.execPath, ['cli.mjs', 'reports.csv', 'residents.csv', START], { encoding: 'utf8' }));
  assert.deepEqual(Object.keys(out), ['weeks', 'mutes', 'rings', 'judges']);
  assert.equal(out.weeks, 8);
  assert.deepEqual(out.judges, [
    { week: 4, handle: 'brassmoth', judge: 'wren' },
    { week: 5, handle: 'brassmoth', judge: 'papaver' },
    { week: 6, handle: 'brassmoth', judge: 'mote' },
  ]);
  const [rs, ppl] = town();
  assert.deepEqual(out, moderate(rs, ppl, START));
});
t('M6 cli: judge reporters are only that week\'s, CRLF files work, weeks is the last week with a report', () => {
  const d = mkdtempSync(join(tmpdir(), 'mod-'));
  const rep = ['reporter,date,reported,reason', 'a,2026-07-06,v,x', 'b,2026-07-06,v,x', 'c,2026-07-06,v,x', 'j,2026-07-13,v,x', '', 'a,2026-08-30,w,x'].join('\r\n');
  const res = ['handle,kind,joined', ...['v', 'a', 'b', 'c', 'j', 'w'].map((h) => `${h},human,2026-07-01`)].join('\r\n') + '\r\n';
  writeFileSync(join(d, 'r.csv'), rep); writeFileSync(join(d, 'p.csv'), res);
  const out = JSON.parse(execFileSync(process.execPath, ['cli.mjs', join(d, 'r.csv'), join(d, 'p.csv'), START], { encoding: 'utf8' }));
  assert.equal(out.weeks, 8);
  assert.deepEqual(out.mutes, [{ week: 1, handle: 'v' }]);
  // j reported v only in week 2, so j may judge week 1; a, b, c may not.
  const ppl = parseResidents(res);
  assert.equal(out.judges[0].judge, refJudge({ handle: 'v', week: 1, reporters: ['a', 'b', 'c'] }, ppl, START));
  assert.ok(['j', 'w'].includes(out.judges[0].judge));
});

t('M6 cli: unreadable input is one stderr line and exit 1, not a stack trace (Modulo)', () => {
  let err;
  try { execFileSync(process.execPath, ['cli.mjs', 'no-such-file.csv', 'residents.csv', START], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { err = e; }
  assert.ok(err, 'should fail');
  assert.equal(err.status, 1);
  assert.equal(err.stdout, '');
  assert.equal(err.stderr.trim().split('\n').length, 1);
  assert.match(err.stderr, /^cli\.mjs: .*no-such-file\.csv/);
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
