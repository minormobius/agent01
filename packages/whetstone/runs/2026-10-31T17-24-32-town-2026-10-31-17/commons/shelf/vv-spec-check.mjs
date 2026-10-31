#!/usr/bin/env node
// node shelf/vv-spec-check.mjs [dir-with-vv.mjs=.] [seed=1] [count=400]
// An independent reading of vv SPEC.md (written without opening vv.mjs), plus
// hand-worked black-box checks and a differential fuzzer against <dir>/vv.mjs.
// TPM and EVM are worked in exact rational arithmetic (BigInt), so a float
// answer that lands on the wrong side of a boundary shows up as a disagreement.
// Exit 1 on any failure. — Morphyx
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

// ---------- exact rationals ----------
const bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
class Q {
  constructor(n, d = 1n) { if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; this.n = n / g; this.d = d / g; }
  static of(x) {
    if (x instanceof Q) return x;
    if (Number.isInteger(x)) return new Q(BigInt(x));
    const [s, e = '0'] = String(x).split(/e/i), ex = BigInt(e);
    const [i, f = ''] = s.split('.'); const q = new Q(BigInt(i + f), 10n ** BigInt(f.length));
    return ex >= 0n ? q.mul(new Q(10n ** ex)) : q.div(new Q(10n ** -ex));
  }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) { o = Q.of(o); return new Q(this.n * o.d, this.d * o.n); }
  cmp(o) { o = Q.of(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  isZero() { return this.n === 0n; }
  floor() { let q = this.n / this.d; if (this.n % this.d !== 0n && this.n < 0n) q -= 1n; return q; }
  num() { return Number(this.n) / Number(this.d); }
}
const Z = new Q(0n);

// ---------- the reading ----------
const ID = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;
const STR = ['shall', 'should', 'may'], MET = ['test', 'analysis', 'inspection', 'demonstration'];
const sortS = a => [...a].sort();
const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
const iso = n => new Date(n * 86400000).toISOString().slice(0, 10);
const hasParent = r => r.parent !== null && r.parent !== undefined;

function leafSet(list) {
  const named = new Map(); // parent id -> set of indices naming it
  list.forEach((r, i) => { if (hasParent(r)) { if (!named.has(r.parent)) named.set(r.parent, new Set()); named.get(r.parent).add(i); } });
  // leaf: no OTHER requirement names it as parent (self-parent alone stays a leaf)
  return list.map((r, i) => { const s = named.get(r.id); return !s || [...s].every(j => j === i); });
}

export function load(list) {
  const probs = [], ids = new Set(list.map(r => r.id)), seen = new Set(), dup = new Set();
  const leaf = leafSet(list);
  const par = new Map(); for (const r of list) if (!par.has(r.id)) par.set(r.id, hasParent(r) ? r.parent : null);
  list.forEach((r, i) => {
    if (typeof r.id !== 'string' || !ID.test(r.id)) probs.push({ id: r.id, code: 'bad-id' });
    if (seen.has(r.id)) { if (!dup.has(r.id)) { dup.add(r.id); probs.push({ id: r.id, code: 'duplicate-id' }); } } else seen.add(r.id);
    if (hasParent(r) && !ids.has(r.parent)) probs.push({ id: r.id, code: 'unknown-parent' });
    if (leaf[i] && !MET.includes(r.method)) probs.push({ id: r.id, code: 'bad-method' });
    if (leaf[i] && r.strength === 'shall' && !(typeof r.acceptance === 'string' && r.acceptance.trim() !== '')) probs.push({ id: r.id, code: 'missing-acceptance' });
  });
  const onCycle = new Set();
  for (const start of par.keys()) { // walk up; a node is on a cycle iff walking returns to it
    let x = par.get(start), steps = 0;
    while (x !== null && x !== undefined && par.has(x) && steps <= par.size) { if (x === start) { onCycle.add(start); break; } x = par.get(x); steps++; }
  }
  const cyc = new Set(); list.forEach(r => { if (onCycle.has(r.id) && !cyc.has(r.id)) { cyc.add(r.id); probs.push({ id: r.id, code: 'cycle' }); } });
  { const k = new Set(); for (let i = probs.length - 1; i >= 0; i--) { const key = probs[i].id + '\u0000' + probs[i].code; if (k.has(key)) probs.splice(i, 1); else k.add(key); } } // one {id,code} pair per id (decision: same as vv)
  probs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { reqs: list, problems: probs };
}

const VAGUE = ['fast', 'quickly', 'user-friendly', 'easy', 'robust', 'efficient', 'flexible', 'adequate', 'appropriate', 'as needed', 'state-of-the-art', 'etc'];
const word = w => new RegExp('(^|[^\\p{L}\\p{N}_])' + w.replace(/ /g, '\\s+') + '(?=$|[^\\p{L}\\p{N}_])', 'iu'); // whole word: not touching a letter, digit or _ (Unicode)
export function lint(req) {
  const t = typeof req.text === 'string' ? req.text : '', c = new Set();
  if (['tbd', 'tbc', 'tbr'].some(w => word(w).test(t))) c.add('tbd');
  if (VAGUE.some(w => word(w).test(t))) c.add('vague');
  if (/and\/or/i.test(t)) c.add('and-or');
  if (req.strength === 'shall' && !word('shall').test(t)) c.add('no-shall');
  return sortS(c);
}

export function trace(reqs, links) {
  const ids = new Set(reqs.map(r => r.id)), v = {}, im = {};
  for (const r of reqs) { v[r.id] = new Set(); im[r.id] = new Set(); }
  const dangling = [];
  links.forEach((l, i) => {
    if (!ids.has(l.to)) { dangling.push(i); return; }
    if (l.kind === 'verifies') v[l.to].add(l.from); else if (l.kind === 'implements') im[l.to].add(l.from);
  });
  const leaf = leafSet(reqs);
  const verifiedBy = {}, implementedBy = {};
  for (const r of reqs) { verifiedBy[r.id] = sortS(v[r.id]); implementedBy[r.id] = sortS(im[r.id]); }
  return { verifiedBy, implementedBy, orphans: sortS(reqs.filter((r, i) => leaf[i] && verifiedBy[r.id].length === 0).map(r => r.id)), dangling };
}

function latest(evidence, asOf) {
  const m = new Map(); // check -> {at, result}
  for (const e of evidence) {
    if (asOf !== undefined && e.at > asOf) continue;
    const p = m.get(e.check); if (!p || e.at >= p.at) m.set(e.check, e);
  }
  return m;
}
export function status(reqs, links, evidence, { asOf } = {}) {
  const { verifiedBy } = trace(reqs, links), lat = latest(evidence, asOf), leaf = leafSet(reqs);
  const kids = new Map(); reqs.forEach(r => { if (hasParent(r) && r.parent !== r.id) { if (!kids.has(r.parent)) kids.set(r.parent, []); kids.get(r.parent).push(r); } });
  const out = {}, byId = new Map(reqs.map((r, i) => [r.id, i]));
  const st = id => {
    if (id in out) return out[id];
    let s; const i = byId.get(id);
    if (leaf[i]) {
      const res = verifiedBy[id].map(c => lat.get(c)?.result).filter(x => x !== undefined);
      if (res.length === 0) s = 'unverified';
      else if (res.includes('fail')) s = 'failed';
      else if (res.length === verifiedBy[id].length && res.every(x => x === 'pass')) s = 'verified';
      else s = 'partial';
    } else {
      let ch = kids.get(id); const sh = ch.filter(c => c.strength === 'shall'); if (sh.length) ch = sh;
      const ss = ch.map(c => st(c.id));
      s = ss.every(x => x === 'verified') ? 'verified' : ss.includes('failed') ? 'failed' : ss.every(x => x === 'unverified') ? 'unverified' : 'partial';
    }
    return (out[id] = s);
  };
  for (const r of reqs) st(r.id);
  return out;
}
export function coverage(reqs, sm) {
  const leaf = leafSet(reqs), c = { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0 };
  reqs.forEach((r, i) => { if (leaf[i]) { c.total++; c[sm[r.id]]++; } });
  return { ...c, ratio: c.total ? c.verified / c.total : 0 };
}

// tpm, exact. Returns numbers (trend as float of the exact slope).
export function tpm(m, { asOf } = {}) {
  const h = m.history.map((p, i) => ({ ...p, i })).filter(p => asOf === undefined || p.at <= asOf);
  const nul = { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null };
  if (!h.length) return nul;
  let cur = h[0]; for (const p of h) if (p.at >= cur.at) cur = p; // latest date; later in list wins a tie
  const T = Q.of(m.threshold), V = Q.of(cur.value), max = m.direction === 'max';
  const margin = max ? T.sub(V) : V.sub(T);
  const band = m.riskBand === undefined || m.riskBand === null ? Q.of(Math.abs(m.threshold)).mul(new Q(1n, 10n)) : Q.of(m.riskBand);
  const st = margin.cmp(Z) < 0 ? 'breached' : margin.cmp(band) < 0 ? 'at-risk' : 'met';
  const objectiveMet = m.objective === undefined || m.objective === null ? null : (max ? V.cmp(Q.of(m.objective)) <= 0 : V.cmp(Q.of(m.objective)) >= 0);
  const d0 = Math.min(...h.map(p => day(p.at)));
  let trend = null, b = null, a = null;
  if (h.length >= 2) {
    const n = BigInt(h.length); let sx = Z, sy = Z, sxx = Z, sxy = Z;
    for (const p of h) { const x = Q.of(day(p.at) - d0), y = Q.of(p.value); sx = sx.add(x); sy = sy.add(y); sxx = sxx.add(x.mul(x)); sxy = sxy.add(x.mul(y)); }
    const den = sxx.mul(new Q(n)).sub(sx.mul(sx));
    if (!den.isZero()) { b = sxy.mul(new Q(n)).sub(sx.mul(sy)).div(den); a = sy.sub(b.mul(sx)).div(new Q(n)); trend = b.num(); }
  }
  let pb = null;
  if (st !== 'breached' && b && (max ? b.cmp(Z) > 0 : b.cmp(Z) < 0)) {
    const xA = BigInt(day(asOf ?? cur.at) - d0); // asOf undefined: from the latest point
    const cand = T.sub(a).div(b).floor() + 1n; // first integer strictly past
    pb = iso(d0 + Number(cand > xA ? cand : xA));
  }
  return { current: cur.value, margin: margin.num(), status: st, objectiveMet, trend, projectedBreach: pb };
}

export function earned(reqs, links, evidence, plan, actuals, { asOf } = {}) {
  const wps = plan.workPackages, base = Math.min(...wps.map(w => day(w.start)));
  const dn = s => day(s) - base + 1, sm = status(reqs, links, evidence, { asOf });
  const pvAt = (w, d) => { const s = dn(w.start), f = dn(w.finish); let r = new Q(BigInt(d - s + 1), BigInt(f - s + 1)); if (r.cmp(Z) < 0) r = Z; if (r.cmp(1) > 0) r = Q.of(1); return Q.of(w.budget).mul(r); };
  const PVd = d => wps.reduce((t, w) => t.add(pvAt(w, d)), Z);
  const AT = dn(asOf), byWP = {};
  let BAC = Z, PV = Z, EV = Z, AC = Z;
  for (const w of wps) {
    const pv = pvAt(w, AT), ev = w.reqs.length ? Q.of(w.budget).mul(new Q(BigInt(w.reqs.filter(r => sm[r] === 'verified').length), BigInt(w.reqs.length))) : Z;
    const ac = actuals.filter(a => a.wp === w.id && a.at <= asOf).reduce((t, a) => t.add(a.hours), Z);
    byWP[w.id] = { PV: pv.num(), EV: ev.num(), AC: ac.num() };
    BAC = BAC.add(w.budget); PV = PV.add(pv); EV = EV.add(ev);
  }
  for (const a of actuals) if (a.at <= asOf) AC = AC.add(a.hours);
  const N = Math.max(...wps.map(w => dn(w.finish)));
  let C = 0; for (let n = 1; n <= N; n++) if (PVd(n).cmp(EV) <= 0) C = n;
  let ES = Q.of(C);
  if (C + 1 <= N) { const lo = C === 0 ? Z : PVd(C), hi = PVd(C + 1); if (hi.cmp(lo) !== 0) ES = Q.of(C).add(EV.sub(lo).div(hi.sub(lo))); }
  const dv = (x, y) => (y.isZero() ? null : x.div(y).num());
  return { BAC: BAC.num(), PV: PV.num(), EV: EV.num(), AC: AC.num(), SV: EV.sub(PV).num(), CV: EV.sub(AC).num(), SPI: dv(EV, PV), CPI: dv(EV, AC), ES: ES.num(), AT, SPIt: AT === 0 ? null : ES.num() / AT, byWP };
}

// ---------- harness ----------
const dir = resolve(process.argv[2] ?? '.'), SEED = +(process.argv[3] ?? 1), COUNT = +(process.argv[4] ?? 400);
const vv = await import(pathToFileURL(join(dir, 'vv.mjs')).href);
let fails = 0, checks = 0;
const near = (a, b) => (a === null || b === null || typeof a !== 'number' || typeof b !== 'number') ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
function same(a, b) {
  if (typeof a === 'number' || typeof b === 'number') return near(a, b);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
}
function check(name, got, want, ctx) {
  checks++;
  let g; try { g = typeof got === 'function' ? got() : got; } catch (e) { g = 'THREW ' + e.message; }
  if (!same(g, want)) { if (++fails <= 25) console.log(`FAIL ${name}\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(g)}${ctx ? '\n  case ' + JSON.stringify(ctx) : ''}`); return false; }
  return true;
}
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o?.[k]]));

// --- hand-worked black-box checks (each worked on paper from SPEC.md) ---
const R = (id, parent = null, x = {}) => ({ id, text: 'It shall work.', parent, strength: 'shall', method: 'test', acceptance: 'ok', rationale: '', ...x });
check('M1 bad-id set', vv.load([R('a'), R('A-'), R('A--B'), R('1A'), R('A-1-B2'), R('AB_C')]).problems,
  [{ id: '1A', code: 'bad-id' }, { id: 'A-', code: 'bad-id' }, { id: 'A--B', code: 'bad-id' }, { id: 'AB_C', code: 'bad-id' }, { id: 'a', code: 'bad-id' }]);
check('M1 duplicate once', vv.load([R('A'), R('A'), R('A')]).problems, [{ id: 'A', code: 'duplicate-id' }]);
check('M1 cycle tail not reported', vv.load([R('T', 'U'), R('U', 'V'), R('V', 'U')]).problems, [{ id: 'U', code: 'cycle' }, { id: 'V', code: 'cycle' }]);
check('M1 self-parent cycle, and a leaf', vv.load([R('S', 'S', { method: 'x' })]).problems, [{ id: 'S', code: 'bad-method' }, { id: 'S', code: 'cycle' }]);
check('M1 parent exempt from leaf rules', vv.load([R('P', null, { method: 'nope', acceptance: '' }), R('P-1', 'P')]).problems, []);
check('M1 should with no acceptance ok', vv.load([R('A', null, { strength: 'should', acceptance: '' })]).problems, []);
check('M1 unknown parent', vv.load([R('A', 'Z')]).problems, [{ id: 'A', code: 'unknown-parent' }]);
check('M1 reqs as given', (() => { const l = [R('B'), R('A')]; return vv.load(l).reqs === l || same(vv.load(l).reqs, l); })(), true);
const L = (text, strength = 'should') => vv.lint({ text, strength });
check('lint word boundary', L('The steadfast clock'), []);
check('lint etc.', L('pumps, valves, etc.'), ['vague']);
check('lint state-of-the-art', L('a State-Of-The-Art pump'), ['vague']);
check('lint as needed', L('refill as needed'), ['vague']);
check('lint tbd any case', L('limit is Tbd'), ['tbd']);
check('lint tbd inside word', L('TBDX holds'), []);
check('lint all', L('TBR: fast and/or cheap', 'shall'), ['and-or', 'no-shall', 'tbd', 'vague']);
check('lint shallow is not shall', L('a shallow tank', 'shall'), ['no-shall']);
check('lint shall present', L('It shall hold.', 'shall'), []);
check('lint distinct', L('fast, easy, robust'), ['vague']);
const tr = vv.trace([R('P'), R('A', 'P'), R('B', 'P')], [{ from: 'T2', to: 'A', kind: 'verifies' }, { from: 'T1', to: 'A', kind: 'verifies' }, { from: 'T1', to: 'A', kind: 'verifies' }, { from: 'x.mjs', to: 'B', kind: 'implements' }, { from: 'T9', to: 'Q', kind: 'verifies' }, { from: 'y', to: 'Q2', kind: 'implements' }]);
check('M2 trace', tr, { verifiedBy: { P: [], A: ['T1', 'T2'], B: [] }, implementedBy: { P: [], A: [], B: ['x.mjs'] }, orphans: ['B'], dangling: [4, 5] });
{ // M3
  const reqs = [R('P'), R('A', 'P'), R('B', 'P'), R('C', 'P', { strength: 'should' })];
  const links = [{ from: 'TA1', to: 'A', kind: 'verifies' }, { from: 'TA2', to: 'A', kind: 'verifies' }, { from: 'TB', to: 'B', kind: 'verifies' }, { from: 'TC', to: 'C', kind: 'verifies' }];
  const ev = [{ check: 'TA1', result: 'fail', at: '2026-01-01' }, { check: 'TA1', result: 'pass', at: '2026-01-02' }, { check: 'TA2', result: 'pass', at: '2026-01-02' },
    { check: 'TB', result: 'pass', at: '2026-01-03' }, { check: 'TB', result: 'fail', at: '2026-01-03' }, { check: 'TC', result: 'fail', at: '2026-01-01' }];
  check('M3 asOf 01-01', vv.status(reqs, links, ev, { asOf: '2026-01-01' }), { P: 'failed', A: 'failed', B: 'unverified', C: 'failed' });
  check('M3 asOf 01-02 (C is should: ignored)', vv.status(reqs, links, ev, { asOf: '2026-01-02' }), { P: 'partial', A: 'verified', B: 'unverified', C: 'failed' });
  check('M3 tie: later entry wins', vv.status(reqs, links, ev, { asOf: '2026-01-03' }), { P: 'failed', A: 'verified', B: 'failed', C: 'failed' });
  const ev2 = [{ check: 'TA1', result: 'pass', at: '2026-01-01' }];
  check('M3 partial leaf', vv.status(reqs, links, ev2, { asOf: '2026-01-05' }).A, 'partial');
  check('M3 coverage', vv.coverage(reqs, { P: 'partial', A: 'verified', B: 'unverified', C: 'failed' }), { verified: 1, failed: 1, partial: 0, unverified: 1, total: 3, ratio: 1 / 3 });
  check('M3 coverage empty', vv.coverage([], {}), { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0, ratio: 0 });
}
{ // M4, worked by hand
  const m = { id: 'M', req: 'A', direction: 'max', threshold: 100, objective: 80, history: [{ at: '2026-01-01', value: 70 }, { at: '2026-01-03', value: 80 }, { at: '2026-01-05', value: 90 }] };
  // slope 5/day, line 70+5x, past 100 strictly at x=7 (105>100; x=6 is exactly 100) -> 01-08
  check('M4 max rising', vv.tpm(m, { asOf: '2026-01-05' }), { current: 90, margin: 10, status: 'met', objectiveMet: false, trend: 5, projectedBreach: '2026-01-08' });
  check('M4 band edge: margin == band is met', vv.tpm({ ...m, riskBand: 10 }, { asOf: '2026-01-05' }).status, 'met');
  // (Modulo, vv turn 3, from this file's fuzzer at seed 3) decimal tie: 18.7 − 17 = 1.7 = 10% of 17 → met;
  // floats give 1.6999999999999993 < 1.7000000000000002
  check('M4 band edge in decimals', vv.tpm({ id: 'D', req: 'P', direction: 'min', threshold: 17, history: [{ at: '2026-03-05', value: 18.7 }] }, {}).status, 'met');
  check('M4 asOf cuts history', vv.tpm(m, { asOf: '2026-01-02' }), { current: 70, margin: 30, status: 'met', objectiveMet: true, trend: null, projectedBreach: null });
  check('M4 nothing yet', vv.tpm(m, { asOf: '2025-12-31' }), { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null });
  const n = { id: 'N', req: 'A', direction: 'min', threshold: 20, objective: 30, history: [{ at: '2026-01-01', value: 40 }, { at: '2026-01-02', value: 36 }] };
  // slope -4, line 40-4x: x=5 -> 20 (not under), x=6 -> 16 -> 01-07; band 2
  check('M4 min falling', vv.tpm(n, { asOf: '2026-01-02' }), { current: 36, margin: 16, status: 'met', objectiveMet: true, trend: -4, projectedBreach: '2026-01-07' });
  check('M4 breached gives no projection', vv.tpm({ ...n, threshold: 37 }, { asOf: '2026-01-02' }).projectedBreach, null);
  check('M4 trend away gives none', vv.tpm({ ...n, direction: 'max', threshold: 50 }, { asOf: '2026-01-02' }).projectedBreach, null);
  // line already past at asOf while current not breached: 0,0,30 at days 0,1,2: slope 15, a=-5; threshold 26: x=3 -> 40, but at asOf x=2 line=25.  Use asOf later than last point:
  check('M4 already past at asOf -> asOf', vv.tpm({ id: 'K', req: 'A', direction: 'max', threshold: 50, history: [{ at: '2026-01-01', value: 0 }, { at: '2026-01-02', value: 10 }] }, { asOf: '2026-01-20' }).projectedBreach, '2026-01-20');
  // exact landing that floats miss: 12.5 - 0.75x is exactly 8 at x=6 (03-11), computes as 7.999...
  check('M4 exact landing, float-hostile', vv.tpm({ id: 'F', req: 'A', direction: 'min', threshold: 8, history: [{ at: '2026-03-07', value: 11 }, { at: '2026-03-05', value: 2 }, { at: '2026-03-05', value: 23 }] }, { asOf: '2026-03-10' }).projectedBreach, '2026-03-12');
  // negative threshold: band = 10% of |T| = 2; max, T=-20, current -21.5 -> margin 1.5 < 2 at-risk
  check('M4 negative threshold band', vv.tpm({ id: 'G', req: 'A', direction: 'max', threshold: -20, history: [{ at: '2026-01-01', value: -21.5 }] }, { asOf: '2026-01-01' }).status, 'at-risk');
  check('M4 at-risk', vv.tpm({ ...n, history: [{ at: '2026-01-01', value: 21 }] }, { asOf: '2026-01-02' }).status, 'at-risk');
}
{ // M5, worked by hand: WP A 01-01..01-04 budget 8 (2/day), WP B 01-03..01-04 budget 4 (2/day)
  const reqs = [R('X'), R('Y'), R('Z')];
  const links = [{ from: 'TX', to: 'X', kind: 'verifies' }, { from: 'TY', to: 'Y', kind: 'verifies' }, { from: 'TZ', to: 'Z', kind: 'verifies' }];
  const ev = [{ check: 'TX', result: 'pass', at: '2026-01-02' }, { check: 'TY', result: 'fail', at: '2026-01-02' }, { check: 'TZ', result: 'pass', at: '2026-01-03' }];
  const plan = { workPackages: [{ id: 'A', budget: 8, start: '2026-01-01', finish: '2026-01-04', reqs: ['X', 'Y'] }, { id: 'B', budget: 4, start: '2026-01-03', finish: '2026-01-04', reqs: ['Z'] }] };
  const act = [{ wp: 'A', hours: 3, at: '2026-01-02' }, { wp: 'B', hours: 5, at: '2026-01-04' }];
  // asOf 01-03 (day 3): PV A=6, B=2 -> 8. EV A=4, B=4 -> 8. AC=3. PVd: 0,2,4,8,12. C=3 (8<=8), ES=3+0/4=3. SPIt=1
  check('M5 day 3', vv.earned(reqs, links, ev, plan, act, { asOf: '2026-01-03' }),
    { BAC: 12, PV: 8, EV: 8, AC: 3, SV: 0, CV: 5, SPI: 1, CPI: 8 / 3, ES: 3, AT: 3, SPIt: 1, byWP: { A: { PV: 6, EV: 4, AC: 3 }, B: { PV: 2, EV: 4, AC: 0 } } });
  // asOf 01-02 (day 2): EV A=4, B=0 -> 4. PV=4. C=2 (PVd 4<=4). ES=2. AT 2.
  check('M5 day 2', pick(vv.earned(reqs, links, ev, plan, act, { asOf: '2026-01-02' }), ['PV', 'EV', 'ES', 'SPIt']), { PV: 4, EV: 4, ES: 2, SPIt: 1 });
  // asOf 01-01: EV 0, PV 2, C=0, ES = 0 + 0/2 = 0; AC 0 -> CPI null
  check('M5 day 1', pick(vv.earned(reqs, links, ev, plan, act, { asOf: '2026-01-01' }), ['PV', 'EV', 'AC', 'CPI', 'ES', 'AT', 'SPIt']), { PV: 2, EV: 0, AC: 0, CPI: null, ES: 0, AT: 1, SPIt: 0 });
  // all verified, late: EV 12 = BAC; C = 4 (last plan day), no day 5 -> ES 4; asOf 01-10 AT 10
  const ev3 = [...ev, { check: 'TY', result: 'pass', at: '2026-01-09' }];
  check('M5 done late', pick(vv.earned(reqs, links, ev3, plan, act, { asOf: '2026-01-10' }), ['EV', 'PV', 'ES', 'AT', 'SPIt']), { EV: 12, PV: 12, ES: 4, AT: 10, SPIt: 0.4 });
  // interpolation: EV 5 on day 3: C=2 (PVd(2)=4<=5, PVd(3)=8>5) ES = 2 + 1/4
  const ev4 = [{ check: 'TZ', result: 'pass', at: '2026-01-01' }, { check: 'TX', result: 'pass', at: '2026-01-01' }, { check: 'TY', result: 'fail', at: '2026-01-01' }];
  const p4 = { workPackages: [plan.workPackages[0], { ...plan.workPackages[1], budget: 1 }] };
  // EV = A 4 + B 1 = 5; PVd with B budget 1: day1 2, day2 4, day3 6.5, day4 9 -> C=2, ES=2+(5-4)/(6.5-4)=2.4
  check('M5 interpolated ES', vv.earned(reqs, links, ev4, p4, [], { asOf: '2026-01-03' }).ES, 2.4);
  // turn 4: a flat stretch 0.0001 above EV, under a 1e7 package that hasn't started. EV = 1 (X verified),
  // PVd(1) = 1, PVd(2..9) = 1.0001 → C = 1, ES = 1. A tolerance scaled to BAC calls 1.0001 "≤ 1" and says 9.
  const pBig = { workPackages: [{ id: 'A', budget: 1, start: '2026-01-01', finish: '2026-01-01', reqs: ['X'] }, { id: 'B', budget: 0.0001, start: '2026-01-02', finish: '2026-01-02', reqs: ['Y'] }, { id: 'C', budget: 1e7, start: '2026-01-10', finish: '2026-01-10', reqs: ['Z'] }] };
  check('M5 flat stretch just above EV', pick(vv.earned(reqs, links, [{ check: 'TX', result: 'pass', at: '2026-01-01' }], pBig, [], { asOf: '2026-01-05' }), ['EV', 'ES', 'SPIt']), { EV: 1, ES: 1, SPIt: 0.2 });
}
// --- M6: CLI ---
{
  const d = mkdtempSync(join(tmpdir(), 'vvsc-'));
  const w = (f, o) => writeFileSync(join(d, f), JSON.stringify(o));
  w('requirements.json', [R('A', null, { text: 'fast' }), R('B')]);
  w('links.json', [{ from: 'T', to: 'A', kind: 'verifies' }]);
  w('evidence.json', [{ check: 'T', result: 'pass', at: '2026-02-01' }]);
  w('measures.json', [{ id: 'M', req: 'A', direction: 'max', threshold: 10, history: [{ at: '2026-02-03', value: 1 }] }]);
  w('actuals.json', [{ wp: 'W', hours: 2, at: '2026-02-02' }]);
  const run = (...a) => JSON.parse(execFileSync(process.execPath, [join(dir, 'cli.mjs'), d, ...a], { encoding: 'utf8' }));
  let o = run();
  check('M6 keys', Object.keys(o).sort(), ['asOf', 'coverage', 'evm', 'lint', 'orphans', 'problems', 'status', 'tpms']);
  check('M6 asOf = latest across evidence, actuals, measures', o.asOf, '2026-02-03');
  check('M6 lint only non-empty', o.lint, { A: ['no-shall', 'vague'] });
  check('M6 evm null without plan', o.evm, null);
  check('M6 orphans', o.orphans, ['B']);
  check('M6 tpms', o.tpms.M?.current, 1);
  w('plan.json', { workPackages: [{ id: 'W', budget: 2, start: '2026-02-01', finish: '2026-02-02', reqs: ['A', 'B'] }] });
  o = run('--as-of', '2026-02-01');
  check('M6 --as-of', [o.asOf, o.evm?.EV, o.evm?.PV, o.evm?.AC], ['2026-02-01', 1, 1, 0]);
  rmSync(join(d, 'evidence.json')); rmSync(join(d, 'actuals.json')); rmSync(join(d, 'measures.json'));
  o = run();
  check('M6 no dates -> today', o.asOf, new Date().toISOString().slice(0, 10));
  rmSync(d, { recursive: true });
}
const handFails = fails;

// --- differential fuzz ---
let s = SEED >>> 0 || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), ch = a => a[Math.floor(rnd() * a.length)];
const D0 = day('2026-03-01'), dt = k => iso(D0 + k);
const IDS = ['A', 'B', 'C', 'A-1', 'A-2', 'B-1', 'C-1-2', 'Z9', 'a', 'A-', 'AB_C', '9A'];
const WORDS = ['the', 'pump', 'shall', 'SHALL', 'shallow', 'fast', 'breakfast', 'fast-track', 'quickly', 'user-friendly', 'easy', 'easygoing', 'robust', 'non-robust', 'efficient',
  'flexible', 'adequate', 'appropriate', 'as needed', 'needed', 'state-of-the-art', 'etc', 'etc.', 'etcetera', 'TBD', 'tbc', 'TbR', 'TBDs', 'and/or', 'AND/OR', 'and', 'or', '(fast)', 'x_fast', 'éfast', 'fastñ', 'as\tneeded', 'TBD—soon'];
const mkReqs = (k, uniq = true) => {
  const pool = uniq ? [...IDS.slice(0, 8)].sort(() => rnd() - 0.5).slice(0, k) : Array.from({ length: k }, () => ch(IDS));
  return pool.map(id => ({ id, text: Array.from({ length: ri(0, 5) }, () => ch(WORDS)).join(' '), parent: null, strength: ch([...STR, 'must']),
    method: rnd() < 0.85 ? ch(MET) : ch(['Test', '', undefined]), acceptance: ch(['ok', '', '  ', undefined, 'x']), rationale: '' }));
};
const tree = k => { // acyclic, unique, valid ids
  const ids = ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W'].slice(0, k);
  return ids.map((id, i) => ({ id, text: 'x shall', parent: i && rnd() < 0.7 ? ids[ri(0, i - 1)] : null, strength: ch(STR), method: 'test', acceptance: 'ok', rationale: '' }));
};
let fz = 0;
for (let it = 0; it < COUNT; it++) {
  // M1 unique ids with parents (cycles allowed)
  const a = mkReqs(ri(1, 8)); a.forEach(r => { const u = rnd(); r.parent = u < 0.4 ? null : u < 0.9 ? ch(a).id : ch(['NOPE', 'b']); });
  if (!check('fuzz load', () => vv.load(a).problems, load(a).problems, a)) fz++;
  // M1 duplicates, no parents
  const b = mkReqs(ri(1, 8), false);
  if (!check('fuzz load dup', () => vv.load(b).problems, load(b).problems, b)) fz++;
  for (const r of a) if (!check('fuzz lint', () => vv.lint(r), lint(r), r)) fz++;
  // M2/M3
  const t = tree(ri(1, 8)), checks_ = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
  const links = Array.from({ length: ri(0, 10) }, () => ({ from: ch(checks_), to: rnd() < 0.9 ? ch(t).id : 'GONE', kind: rnd() < 0.8 ? 'verifies' : 'implements' }));
  const ev = Array.from({ length: ri(0, 12) }, () => ({ check: ch(checks_), result: rnd() < 0.7 ? 'pass' : 'fail', at: dt(ri(0, 6)) }));
  const asOf = dt(ri(-1, 7));
  if (!check('fuzz trace', () => vv.trace(t, links), trace(t, links), { t, links })) fz++;
  const sm = status(t, links, ev, { asOf });
  if (!check('fuzz status', () => vv.status(t, links, ev, { asOf }), sm, { t, links, ev, asOf })) fz++;
  if (!check('fuzz coverage', () => vv.coverage(t, sm), coverage(t, sm), { t, sm })) fz++;
  // M4: unsorted history, date ties, integer and one-decimal values
  const H = Array.from({ length: ri(0, 6) }, () => ({ at: dt(ri(0, 9)), value: rnd() < 0.7 ? ri(0, 40) : ri(0, 400) / 10 }));
  const m = { id: 'M', req: 'P', direction: ch(['max', 'min']), threshold: rnd() < 0.2 ? -ri(5, 35) : ri(5, 35), history: H };
  if (rnd() < 0.5) m.objective = ri(5, 35); if (rnd() < 0.4) m.riskBand = ri(0, 6);
  const mAs = dt(ri(0, 12));
  if (!check('fuzz tpm', () => vv.tpm(m, { asOf: mAs }), tpm(m, { asOf: mAs }), { m, asOf: mAs })) fz++;
  // M5
  // budgets: integers, people's decimals (0.1, 2.35), and now and then a huge or tiny one; gaps
  // between packages give flat stretches of PVd, where a tolerance moves C a long way (turn 4)
  const bud = () => { const u = rnd(); return u < 0.4 ? ri(0, 12) : u < 0.8 ? ri(0, 1200) / ch([10, 100]) : u < 0.9 ? ri(1, 9) * 10 ** ri(6, 9) : ri(1, 9) / 10 ** ri(9, 12); };
  const nw = ri(1, 5), wps = Array.from({ length: nw }, (_, i) => { const st = ri(0, 12); return { id: 'W' + i, budget: bud(), start: dt(st), finish: dt(st + ri(0, 6)), reqs: Array.from({ length: ri(0, 3) }, () => ch(t).id) }; });
  const act = Array.from({ length: ri(0, 5) }, () => ({ wp: ch(wps).id, hours: rnd() < 0.5 ? ri(0, 8) : ri(0, 80) / 10, at: dt(ri(0, 14)) }));
  const eAs = dt(ri(-1, 16)), plan = { workPackages: wps };
  if (!check('fuzz earned', () => vv.earned(t, links, ev, plan, act, { asOf: eAs }), earned(t, links, ev, plan, act, { asOf: eAs }), { t, links, ev, plan, act, asOf: eAs })) fz++;
}
console.log(`${checks - fails}/${checks} checks agree (hand-worked failures ${handFails}, fuzz disagreements ${fz}; seed ${SEED}, ${COUNT} rounds)`);
process.exit(fails ? 1 : 0);
