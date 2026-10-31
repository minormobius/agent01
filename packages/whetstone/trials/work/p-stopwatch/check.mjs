// The Stopwatch check. The lab plays the clinic: a simulated waiting room with a hidden true
// difference between the tablet's recorded wait and a stopwatch's, and one observer who can time
// one patient at a time, in arrival order, never knowing when a patient will be seen until timing
// them. The souls' study runs against many such clinics in a child process; it passes if it never
// cheats the observer, never asks past the manager's limit, and its intervals tell the truth.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const HARNESS = String.raw`
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cwd = process.cwd();
const out = {};
async function ms(k, fn) { try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e && e.message || e).slice(0, 200) }; } }

// ---- the clinic ----
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeClinic(seed, offset, { limit = 5 } = {}) {
  const R = prng(seed * 7919 + 13);
  const N = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const tri = (a, m, b) => { const u = R(), c = (m - a) / (b - a); return u < c ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m)); };
  const days = {}, seen = new Set(), violations = [];
  let asked = 0;
  const gen = (k) => {
    const pts = []; let t = 0; const rate = 7.53 / 420;
    for (;;) { t += -Math.log(1 - R()) / rate; if (t > 210) break;
      const w = tri(14, 34, 54);
      pts.push({ id: 'm' + k + 'p' + pts.length, arrive: Math.round(t * 10) / 10, w, sw: w + 0.5 * N(), tab: w + offset + 4 * N() }); }
    return pts;
  };
  const byId = {};
  const state = {};
  const clinic = {
    morning(k) {
      if (!Number.isInteger(k) || k < 1) { violations.push('bad morning ' + k); throw new Error('mornings are 1, 2, 3, ...'); }
      if (k > limit) { violations.push('past the limit'); throw new Error('the manager has given all the mornings she can'); }
      if (days[k]) { violations.push('morning twice'); throw new Error('morning ' + k + ' has already been'); }
      if (k !== asked + 1) { violations.push('out of order'); throw new Error('mornings come in order: next is ' + (asked + 1)); }
      asked = Math.max(asked, k);
      days[k] = gen(k); state[k] = { lastArrive: -Infinity, freeAt: -Infinity };
      for (const p of days[k]) byId[p.id] = { ...p, k };
      return days[k].map((p) => ({ id: p.id, arrive: p.arrive }));
    },
    time(id) {
      const p = byId[id];
      if (!p) { violations.push('unknown patient'); throw new Error('no such patient'); }
      const s = state[p.k];
      if (p.k !== asked) { violations.push('old morning'); throw new Error('that morning is over'); }
      if (seen.has(id)) { violations.push('timed twice'); throw new Error('already timed'); }
      if (p.arrive < s.lastArrive) { violations.push('out of order'); throw new Error('the observer cannot go back in time'); }
      if (p.arrive < s.freeAt) { violations.push('observer busy'); throw new Error('the observer is still watching someone else'); }
      // Busy until the patient is seen as the observer saw it: arrival plus their own stopwatch reading.
      seen.add(id); s.lastArrive = p.arrive; s.freeAt = p.arrive + p.sw;
      return p.sw;
    },
    tablet(id) { const p = byId[id]; if (!p) throw new Error('no such patient'); return p.tab; },
  };
  return { clinic, violations, mornings: () => asked };
}
const good = (r) => r && Number.isFinite(r.estimate) && Number.isFinite(r.lo) && Number.isFinite(r.hi) && r.lo <= r.estimate && r.estimate <= r.hi
  && ['tablet reads long', 'tablet reads true', 'tablet reads short', 'cannot tell'].includes(r.verdict) && typeof r.reason === 'string' && Number.isInteger(r.timed) && Number.isInteger(r.mornings);

const sw = await import(cwd + '/stopwatch.mjs').catch((e) => ({ __e: e.message }));

await ms('s1', async () => {
  let ok = true, why = '';
  for (let i = 1; i <= 20 && ok; i++) {
    const c = makeClinic(1000 + i, 3);
    let r; try { r = await sw.study(c.clinic, { seed: i, alpha: 0.05, maxMornings: 5 }); } catch (e) { ok = false; why = 'study threw: ' + e.message; break; }
    if (c.violations.length) { ok = false; why = c.violations[0]; }
    else if (!good(r)) { ok = false; why = 'malformed report'; }
    else if (c.mornings() > 5 || r.mornings > 5) { ok = false; why = 'more than five mornings'; }
  }
  // A manager who can only give three: the study must take no for an answer.
  const c3 = makeClinic(77, 5, { limit: 3 });
  try { const r = await sw.study(c3.clinic, { seed: 1, alpha: 0.05, maxMornings: 3 }); if (!good(r) || c3.mornings() > 3) { ok = false; why = 'asked past a limit of three'; } }
  catch (e) { ok = false; why = 'with three mornings: ' + e.message; }
  return { ok, why: ok ? '' : why };
});

await ms('s2', async () => {
  const R = prng(424242); let hit = 0, err = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const off = -3 + 15 * R();
    const c = makeClinic(5000 + i, off);
    const r = await sw.study(c.clinic, { seed: i + 1, alpha: 0.05, maxMornings: 5 });
    if (!good(r)) continue;
    n++; if (r.lo <= off && off <= r.hi) hit++; err += r.estimate - off;
  }
  const coverage = hit / Math.max(n, 1), bias = err / Math.max(n, 1);
  return { ok: n === 300 && coverage >= 0.90 && coverage <= 0.99 && Math.abs(bias) < 1 };
});

await ms('s3', async () => {
  let ok = true;
  for (let i = 0; i < 60; i++) {
    const c = makeClinic(9000 + i, [0, 1, 6, 12, -9][i % 5]);
    const r = await sw.study(c.clinic, { seed: i + 1, alpha: 0.05, maxMornings: 5 });
    const want = r.lo >= -2 && r.hi <= 2 ? 'tablet reads true' : r.lo > 0 ? 'tablet reads long' : r.hi < 0 ? 'tablet reads short' : 'cannot tell';
    if (r.verdict !== want) ok = false;
  }
  return { ok };
});

await ms('s4', async () => {
  const a = await sw.study(makeClinic(31337, 7).clinic, { seed: 9, alpha: 0.05, maxMornings: 5 });
  const b = await sw.study(makeClinic(31337, 7).clinic, { seed: 9, alpha: 0.05, maxMornings: 5 });
  return { ok: JSON.stringify(a) === JSON.stringify(b) };
});

await ms('h', async () => {
  const h = await import(cwd + '/harness.mjs');
  const { Resource } = await import(cwd + '/tools/des/des.mjs');
  const model = (sim) => {
    const desk = new Resource(sim, { capacity: 1 });
    for (let i = 0; i < 4; i++) sim.process(function* () { yield sim.timeout(i * 3); const r = desk.request(); yield r; sim.decide('serve', i); yield sim.timeout(5); desk.release(r); });
    sim.process(function* () { const v = yield sim.signal('call'); sim.decide('called', v); yield sim.timeout(1); sim.decide('after call', sim.now); });
  };
  const log = await h.record(model, { seed: 3, until: 40, scale: 2, injections: [{ at: 7, name: 'call', value: 'sick' }] });
  // replay may return its result or a promise of it: the milestone is about determinism, not
  // about whether the function is async (eleventh light: an async replay, right in every answer).
  const r1 = await h.replay(model, log, { seed: 3, until: 40 });
  const noisy = (sim) => { for (let i = 0; i < 12; i++) sim.schedule(i, () => sim.decide('coin', Math.random() < 0.5)); };
  const log2 = await h.record(noisy, { seed: 3, until: 20 });
  const r2 = await h.replay(noisy, log2, { seed: 3, until: 20 });
  return { h1: r1.ok === true && log.some((e) => e.kind === 'called'), h2: r2.ok === false };
});

await ms('f', async () => {
  const fresh = await import(cwd + '/fresh.mjs');
  const vv = await import(cwd + '/tools/vv/vv.mjs');
  const d = mkdtempSync(join(tmpdir(), 'fresh-'));
  const files = { 'a.mjs': 'export const a = 1;\n', 'b.mjs': 'export const b = 2;\n', 'c.mjs': 'export const c = 3;\n' };
  for (const [k, v] of Object.entries(files)) writeFileSync(join(d, k), v);
  const read = (p) => readFileSync(join(d, p), 'utf8');
  const reqs = ['R-A', 'R-B', 'R-C'].map((id) => ({ id, text: id + ' shall hold.', parent: null, strength: 'shall', method: 'test', acceptance: 'x' }));
  const links = [{ from: 'ca', to: 'R-A', kind: 'verifies' }, { from: 'cb', to: 'R-B', kind: 'verifies' }, { from: 'cc', to: 'R-C', kind: 'verifies' },
    { from: 'a.mjs', to: 'R-A', kind: 'implements' }, { from: 'b.mjs', to: 'R-B', kind: 'implements' }, { from: 'c.mjs', to: 'R-B', kind: 'implements' }, { from: 'c.mjs', to: 'R-C', kind: 'implements' }];
  const ev = ['ca', 'cb', 'cc'].map((check) => fresh.stamp({ check, result: 'pass', at: '2026-10-04' }, links, read));
  const untouched = fresh.filter(ev, links, read).map((e) => e.check);
  writeFileSync(join(d, 'c.mjs'), 'export const c = 4;\n');
  const after = fresh.filter(ev, links, read).map((e) => e.check);
  const st = vv.status(reqs, links, fresh.filter(ev, links, read), { asOf: '2026-10-04' });
  return { untouched: untouched.sort(), after: after.sort(), status: [st['R-A'], st['R-B'], st['R-C']] };
});

console.log(JSON.stringify(out));
`;

const node = (cwd, args, timeout = 300000) => {
  try { return { ok: true, out: execFileSync('node', args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') }; }
};
export function evaluate(dir) {
  const h = join(mkdtempSync(join(tmpdir(), 'sw-')), 'harness.mjs');
  writeFileSync(h, HARNESS);
  try { return JSON.parse(node(dir, [h]).out); } catch { return {}; }
}

function selfMeasure(dir) {
  const tests = node(dir, ['test.mjs']).ok;
  if (!tests || !existsSync(join(dir, 'evidence.json'))) return { ok: false, tests, why: 'test.mjs failed or wrote no evidence.json' };
  let r; try { r = JSON.parse(node(dir, ['tools/vv/cli.mjs', '.']).out); } catch { return { ok: false, tests, why: 'tools/vv/cli.mjs . printed no JSON' }; }
  const len = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').length : 0);
  const ok = (r.problems || []).length === 0 && (r.coverage?.ratio ?? 0) >= 0.8 && (r.coverage?.total ?? 0) >= 8 && len('README.md') > 600 && len('LETTER.md') > 400;
  return { ok, tests, problems: (r.problems || []).length, ratio: r.coverage?.ratio ?? null, leaves: r.coverage?.total ?? 0, readme: len('README.md'), letter: len('LETTER.md') };
}

export default async function check(dir) {
  const g = evaluate(dir);
  const pass = {
    H1: g.h?.h1 === true, H2: g.h?.h2 === true,
    S1: g.s1?.ok === true, S2: g.s2?.ok === true, S3: g.s3?.ok === true, S4: g.s4?.ok === true,
    F1: JSON.stringify(g.f) === JSON.stringify({ untouched: ['ca', 'cb', 'cc'], after: ['ca'], status: ['verified', 'unverified', 'unverified'] }),
  };
  const v1 = Object.values(pass).every(Boolean) ? selfMeasure(dir) : { ok: false, why: 'measured last, once the rest pass' };
  pass.V1 = v1.ok === true;
  const passed = Object.keys(pass).filter((k) => pass[k]);
  const why = (k, x) => (x?.error ? `${k}: ${x.error}` : x?.why ? `${k}: ${x.why}` : k);
  return {
    pass: passed.length === 8,
    detail: { milestones: `${passed.length}/8`, passed, self: v1,
      failing: Object.keys(pass).filter((k) => !pass[k]).map((k) => why(k, { H1: g.h, H2: g.h, S1: g.s1, S2: g.s2, S3: g.s3, S4: g.s4, F1: g.f, V1: v1 }[k])) },
    progress: passed.length / 8,
  };
}
