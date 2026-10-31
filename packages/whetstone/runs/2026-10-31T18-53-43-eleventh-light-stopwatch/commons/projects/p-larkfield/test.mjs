// node test.mjs — each test names the SPEC clause it pins.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReports, parseResidents, weekOf, weekly, mutes, rings, fnv32, appealJudge } from './mod.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n ', e.message.split('\n').slice(0, 6).join('\n  ')); }
}
const R = (date, reporter, reported, reason = 'x') => ({ date, reporter, reported, reason });
const P = (handle, joined, kind = 'human') => ({ handle, kind, joined });

// M1
t('M1 reports: file order, fields', () => {
  assert.deepEqual(parseReports('date,reporter,reported,reason\n2026-07-09,wren,tamsin,bad faith\n2026-07-01,a,b,spam\n'),
    [R('2026-07-09', 'wren', 'tamsin', 'bad faith'), R('2026-07-01', 'a', 'b', 'spam')]);
});
t('M1 columns in any order (header decides)', () => {
  assert.deepEqual(parseReports('reason,reported,date,reporter\nspam,b,2026-07-01,a'), [R('2026-07-01', 'a', 'b', 'spam')]);
  assert.deepEqual(parseResidents('joined,handle,kind\n2026-07-06,harrow,human'), [P('harrow', '2026-07-06')]);
});
t('M1 CRLF and blank lines', () => {
  assert.deepEqual(parseResidents('handle,kind,joined\r\n\r\nharrow,human,2026-07-06\r\n\r\noboe,agent,2026-07-11\r\n'),
    [P('harrow', '2026-07-06'), P('oboe', '2026-07-11', 'agent')]);
});
t('M1 header only / empty', () => {
  assert.deepEqual(parseReports('date,reporter,reported,reason\n'), []);
  assert.deepEqual(parseReports(''), []);
});
t('M1 quoted reason with comma', () => {
  assert.deepEqual(parseReports('date,reporter,reported,reason\n2026-07-01,a,b,"spam, again"'), [R('2026-07-01', 'a', 'b', 'spam, again')]);
});
t('M1 sample files parse to their row counts', () => {
  const rp = parseReports(readFileSync(join(here, 'reports.csv'), 'utf8'));
  const rs = parseResidents(readFileSync(join(here, 'residents.csv'), 'utf8'));
  assert.equal(rp.length, 109); assert.equal(rs.length, 30);
  assert.ok(rp.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.reporter && r.reported));
});

// M2
t('M2 weekOf: days 0-6 week 1, 7-13 week 2', () => {
  const s = '2026-07-06';
  assert.equal(weekOf('2026-07-06', s), 1); assert.equal(weekOf('2026-07-12', s), 1);
  assert.equal(weekOf('2026-07-13', s), 2); assert.equal(weekOf('2026-07-19', s), 2);
  assert.equal(weekOf('2026-07-20', s), 3);
});
t('M2 weekOf across month/year/leap and DST dates', () => {
  assert.equal(weekOf('2028-03-01', '2028-02-23'), 2);   // leap day inside
  assert.equal(weekOf('2027-01-02', '2026-12-27'), 1);
  assert.equal(weekOf('2026-03-15', '2026-03-08'), 2);   // US DST weekend
  assert.equal(weekOf('2026-11-01', '2026-10-25'), 2);
});
t('M2 weekly: counts, distinct sorted reporters, only present weeks/handles', () => {
  const s = '2026-07-06';
  const w = weekly([R('2026-07-07', 'zed', 'x'), R('2026-07-08', 'amy', 'x'), R('2026-07-08', 'zed', 'x'), R('2026-07-21', 'amy', 'y')], s);
  assert.deepEqual(w, { 1: { x: { reports: 3, reporters: ['amy', 'zed'] } }, 3: { y: { reports: 1, reporters: ['amy'] } } });
  assert.deepEqual(Object.keys(w), ['1', '3']);
});

t('M2 weekOf does not depend on the process time zone', () => {
  const code = `import('./mod.mjs').then(m=>{const o=[];let d=Date.UTC(2026,0,1);for(let i=0;i<800;i++,d+=864e5){o.push(m.weekOf(new Date(d).toISOString().slice(0,10),'2026-01-01'))}console.log(o.join(','))})`;
  const want = Array.from({ length: 800 }, (_, i) => Math.floor(i / 7) + 1).join(',');
  for (const TZ of ['America/Chicago', 'Pacific/Chatham', 'Asia/Kolkata', 'Pacific/Kiritimati'])
    assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: here, env: { ...process.env, TZ }, encoding: 'utf8' }).trim(), want, TZ);
});

// M3
t('M3 mutes need distinct reporters, not reports', () => {
  const s = '2026-07-06';
  const rs = [R('2026-07-06', 'a', 'v'), R('2026-07-06', 'a', 'v'), R('2026-07-06', 'a', 'v'), R('2026-07-06', 'b', 'v')];
  assert.deepEqual(mutes(rs, s), []);
  assert.deepEqual(mutes(rs, s, { minDistinct: 2 }), [{ week: 1, handle: 'v' }]);
});
t('M3 distinct reporters counted per week, not across weeks', () => {
  const s = '2026-07-06';
  assert.deepEqual(mutes([R('2026-07-12', 'a', 'v'), R('2026-07-12', 'b', 'v'), R('2026-07-13', 'c', 'v')], s), []);
});
t('M3 sorted by week (numeric) then handle', () => {
  const s = '2026-07-06', rs = [];
  for (const [d, h] of [['2026-09-14', 'b'], ['2026-07-06', 'z'], ['2026-07-06', 'a'], ['2026-07-27', 'm']])
    for (const who of ['p', 'q', 'r']) rs.push(R(d, who, h));
  assert.deepEqual(mutes(rs, s).map(m => [m.week, m.handle]), [[1, 'a'], [1, 'z'], [4, 'm'], [11, 'b']]);
});

// M4
function ringData() {
  const rs = [];
  const T = ['t1', 't2', 't3', 't4', 't5'];
  for (const who of ['a', 'b']) for (const x of T) rs.push(R('2026-07-10', who, x));
  rs.push(R('2026-07-11', 'a', 't1')); rs.push(R('2026-07-11', 'b', 't6')); // a 6 reports {t1..t5}, b 6 reports {t1..t6}: J=5/6
  return rs;
}
t('M4 basic ring', () => {
  assert.deepEqual(rings(ringData(), [P('a', '2026-07-06'), P('b', '2026-07-07')]), [['a', 'b']]);
});
t('M4 joinedWithinDays is inclusive and checked', () => {
  assert.deepEqual(rings(ringData(), [P('a', '2026-07-06'), P('b', '2026-07-08')]), []);
  assert.deepEqual(rings(ringData(), [P('a', '2026-07-06'), P('b', '2026-07-08')], { joinedWithinDays: 2 }), [['a', 'b']]);
});
t('M4 minReports counts reports in total (repeats count), each side', () => {
  const res = [P('a', '2026-07-06'), P('b', '2026-07-06')];
  assert.deepEqual(rings(ringData(), res, { minReports: 7 }), []);
  const d = ringData().filter((r, i) => i !== 11); // b down to 5
  assert.deepEqual(rings(d, res), []);
});
t('M4 overlap threshold inclusive (J exactly 0.8)', () => {
  const rs = [];
  for (const x of ['t1', 't2', 't3', 't4']) { rs.push(R('2026-07-10', 'a', x)); rs.push(R('2026-07-10', 'b', x)); }
  rs.push(R('2026-07-10', 'a', 't5')); rs.push(R('2026-07-10', 'a', 't5'));
  rs.push(R('2026-07-10', 'b', 't1')); rs.push(R('2026-07-10', 'b', 't1')); // J=4/5
  const res = [P('a', '2026-07-06'), P('b', '2026-07-06')];
  assert.deepEqual(rings(rs, res), [['a', 'b']]);
  assert.deepEqual(rings(rs, res, { minOverlap: 0.81 }), []);
});
t('M4 connected groups (chain), sorted inside and by first handle', () => {
  // c-d linked and d-e linked, c-e not directly (joined 2 days apart)
  const rs = [];
  for (const who of ['c', 'd', 'e', 'x', 'y']) for (let i = 1; i <= 6; i++) rs.push(R('2026-07-10', who, (who < 'x' ? 't' : 'u') + i));
  const res = [P('e', '2026-07-08'), P('d', '2026-07-07'), P('c', '2026-07-06'), P('y', '2026-07-20'), P('x', '2026-07-20')];
  assert.deepEqual(rings(rs, res), [['c', 'd', 'e'], ['x', 'y']]);
});
t('M4 star: one hub linked to two who are not linked to each other', () => {
  const rs = [];
  for (const who of ['c', 'd', 'e']) for (let i = 1; i <= 6; i++) rs.push(R('2026-07-10', who, 't' + i));
  assert.deepEqual(rings(rs, [P('c', '2026-07-07'), P('d', '2026-07-06'), P('e', '2026-07-08')]), [['c', 'd', 'e']]);
});
t('M4 reporter missing from residents is never linked', () => {
  assert.deepEqual(rings(ringData(), [P('a', '2026-07-06')]), []);
});

// M5
t('M5 fnv32 known vectors', () => {
  assert.equal(fnv32(''), 0x811c9dc5); assert.equal(fnv32('a'), 0xe40c292c); assert.equal(fnv32('foobar'), 0xbf9cf968);
});
t('M5 fnv32 uses UTF-16 code units, unsigned', () => {
  // by hand: one unit 0x00e9, and a surrogate pair hashes as two units
  let h = (0x811c9dc5 ^ 0xe9) >>> 0; h = Number((BigInt(h) * 16777619n) & 0xffffffffn);
  assert.equal(fnv32('é'), h);
  let g = 2166136261n; for (const u of [0xd83d, 0xde00]) { g ^= BigInt(u); g = (g * 16777619n) & 0xffffffffn; }
  assert.equal(fnv32('😀'), Number(g));
  for (const s of ['x', 'brassmoth', 'zz:yy:9']) assert.ok(fnv32(s) >= 0 && fnv32(s) <= 0xffffffff && Number.isInteger(fnv32(s)));
});
function slowJudge({ handle, week, reporters }, residents, start) {
  const last = new Date(Date.parse(start + 'T00:00:00Z') + (7 * week - 1) * 864e5).toISOString().slice(0, 10);
  const el = residents.filter(p => p.handle !== handle && !reporters.includes(p.handle) && p.joined <= last);
  el.sort((a, b) => fnv32(a.handle + ':' + handle + ':' + week) - fnv32(b.handle + ':' + handle + ':' + week) || (a.handle < b.handle ? -1 : 1));
  return el.length ? el[0].handle : null;
}
t('M5 judge: excludes muted, reporters, late joiners; lowest hash', () => {
  const res = parseResidents(readFileSync(join(here, 'residents.csv'), 'utf8'));
  const s = '2026-07-06';
  for (let week = 1; week <= 9; week++) for (const p of res) {
    const reps = res.filter(q => fnv32(q.handle + week) % 3 === 0).map(q => q.handle);
    const j = appealJudge({ handle: p.handle, week, reporters: reps }, res, s);
    assert.equal(j, slowJudge({ handle: p.handle, week, reporters: reps }, res, s));
    if (j !== null) { assert.notEqual(j, p.handle); assert.ok(!reps.includes(j)); }
  }
});
t('M5 joined on the last day of the week is eligible; the day after is not', () => {
  const s = '2026-07-06'; // week 2 last day 2026-07-19
  assert.equal(appealJudge({ handle: 'v', week: 2, reporters: [] }, [P('v', '2026-07-06'), P('j', '2026-07-19')], s), 'j');
  assert.equal(appealJudge({ handle: 'v', week: 2, reporters: [] }, [P('v', '2026-07-06'), P('j', '2026-07-20')], s), null);
});
t('M5 null when nobody eligible', () => {
  assert.equal(appealJudge({ handle: 'v', week: 1, reporters: ['a'] }, [P('v', '2026-07-06'), P('a', '2026-07-06')], '2026-07-06'), null);
});
t('M5 picks the minimum hash among several', () => {
  const res = ['k1', 'k2', 'k3', 'k4', 'k5'].map(h => P(h, '2026-07-06'));
  const best = res.map(p => p.handle).sort((a, b) => fnv32(a + ':v:3') - fnv32(b + ':v:3'))[0];
  assert.equal(appealJudge({ handle: 'v', week: 3, reporters: [] }, res, '2026-07-06'), best);
});

// M6
function cli(...args) { return JSON.parse(execFileSync(process.execPath, [join(here, 'cli.mjs'), ...args], { encoding: 'utf8' })); }
t('M6 CLI shape and consistency on a tiny town', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lark-'));
  const rp = join(dir, 'r.csv'), rs = join(dir, 's.csv');
  writeFileSync(rp, 'reporter,date,reported,reason\r\n2026-07-06,a,v,x\r\n'.replace('2026-07-06,a', 'a,2026-07-06') +
    'b,2026-07-07,v,x\r\nc,2026-07-08,v,x\r\nc,2026-07-22,w,x\r\n');
  writeFileSync(rs, 'handle,kind,joined\na,human,2026-07-06\nb,human,2026-07-06\nc,agent,2026-07-06\nv,human,2026-07-06\nj,human,2026-07-06\nlate,human,2026-07-13\n');
  const o = cli(rp, rs, '2026-07-06');
  assert.deepEqual(Object.keys(o), ['weeks', 'mutes', 'rings', 'judges']);
  assert.equal(o.weeks, 3);
  assert.deepEqual(o.mutes, [{ week: 1, handle: 'v' }]);
  assert.deepEqual(o.rings, []);
  assert.deepEqual(o.judges, [{ week: 1, handle: 'v', judge: 'j' }]);
});
t('M6 CLI passes that week\'s reporters to the judge', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lark-'));
  const names = Array.from({ length: 10 }, (_, i) => 'r' + i);
  const order = [...names].sort((a, b) => fnv32(a + ':v:2') - fnv32(b + ':v:2'));
  const reps = order.slice(0, 3); // the three a judge would otherwise pick first
  writeFileSync(join(dir, 'r.csv'), 'date,reporter,reported,reason\n' + reps.map(r => `2026-07-14,${r},v,x`).join('\n') + `\n2026-07-06,${order[3]},v,x\n`);
  writeFileSync(join(dir, 's.csv'), 'handle,kind,joined\nv,human,2026-07-06\n' + names.map(n => `${n},human,2026-07-06`).join('\n'));
  const o = cli(join(dir, 'r.csv'), join(dir, 's.csv'), '2026-07-06');
  assert.deepEqual(o.judges, [{ week: 2, handle: 'v', judge: order[3] }]); // order[3] reported in week 1, not 2: still eligible
});
t('M6 CLI on the sample matches the library', () => {
  const o = cli(join(here, 'reports.csv'), join(here, 'residents.csv'), '2026-07-06');
  const rp = parseReports(readFileSync(join(here, 'reports.csv'), 'utf8'));
  const rs = parseResidents(readFileSync(join(here, 'residents.csv'), 'utf8'));
  assert.deepEqual(o.mutes, mutes(rp, '2026-07-06'));
  assert.deepEqual(o.rings, rings(rp, rs));
  const w = weekly(rp, '2026-07-06');
  assert.equal(o.weeks, Math.max(...Object.keys(w).map(Number)));
  assert.deepEqual(o.judges.map(j => j.judge), o.mutes.map(m => slowJudge({ ...m, reporters: w[m.week][m.handle].reporters }, rs, '2026-07-06')));
  assert.deepEqual(o.rings, [['ledgerwick', 'quillon']]);
});

t('M2/M3 a handle named __proto__ is counted like any other', () => {
  const rp = ['a', 'b', 'c'].map(r => ({ date: '2026-07-07', reporter: r, reported: '__proto__', reason: '' }));
  const w = weekly(rp, '2026-07-06');
  assert.deepEqual(Object.keys(w['1']), ['__proto__']);
  assert.equal(w['1']['__proto__'].reports, 3);
  assert.deepEqual(mutes(rp, '2026-07-06'), [{ week: 1, handle: '__proto__' }]);
});
t('oracle: 200 random towns agree with a from-the-spec reimplementation', () => {
  // Skipped where the shelf isn't (mutate.mjs temp dirs, a copied-out mod.mjs).
  if (!existsSync(join(here, 'shelf', 'town-oracle.mjs'))) return;
  const r = spawnSync(process.execPath, [join(here, 'shelf', 'town-oracle.mjs'), join(here, 'mod.mjs'), '200', '7'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
