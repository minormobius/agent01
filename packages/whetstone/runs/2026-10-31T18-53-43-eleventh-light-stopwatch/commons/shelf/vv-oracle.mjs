#!/usr/bin/env node
// node shelf/vv-oracle.mjs [vv.mjs] [cases] [seed]
// vv M1–M6 against a second build written from SPEC.md (+ README decisions D1–D15) alone, without
// reading vv.mjs. Different machinery on purpose: hand-rolled civil-date math (no Date), char-scan
// word matching (no regex), exact BigInt rationals for every TPM and earned-value number, an
// explicit DFS for cycles. Random requirement trees, links, evidence, measures, plans, actuals.
// Prints the first mismatches per function and exits 1 if there are any. (Morphyx)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [, , src = 'vv.mjs', casesArg = '3000', seedArg = '1'] = process.argv;
const vv = await import(pathToFileURL(resolve(src)).href);
const CASES = +casesArg;

// ---------- rng ----------
let s = (+seedArg >>> 0) || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- dates (Hinnant days_from_civil; no Date object) ----------
function days(str) {
  const y0 = +str.slice(0, 4), m = +str.slice(5, 7), d = +str.slice(8, 10);
  const y = m <= 2 ? y0 - 1 : y0, era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
function civil(z) {
  z += 719468; const era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9, y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const BASE = days('2027-02-20'); // spans a month end and (2028) a leap day
const date = (k) => civil(BASE + k);

// ---------- exact rationals ----------
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
class Q {
  constructor(n, d = 1n) { n = BigInt(n); d = BigInt(d); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; this.n = n / g; this.d = d / g; }
  add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Q(this.n * o.n, this.d * o.d); }
  div(o) { return new Q(this.n * o.d, this.d * o.n); }
  cmp(o) { const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  get zero() { return this.n === 0n; }
  num() { return Number(this.n) / Number(this.d); }
}
const q = (x) => new Q(x);
const qdiv = (a, b) => (b.zero ? null : a.div(b).num());

// ---------- M1 ----------
const isUp = (c) => c >= 'A' && c <= 'Z', isDig = (c) => c >= '0' && c <= '9';
function goodId(id) {
  if (typeof id !== 'string' || id === '') return false;
  const parts = id.split('-');
  if (!isUp(parts[0][0] || '')) return false;
  return parts.every((p) => p.length > 0 && [...p].every((c) => c.length === 1 && (isUp(c) || isDig(c))));
}
const METHODS = ['test', 'analysis', 'inspection', 'demonstration'];
const hasAcc = (a) => typeof a === 'string' && a.trim() !== '';
const parentOf = (r) => (r.parent === undefined ? null : r.parent);
function leafSet(list) {
  // SPEC: "no *other* requirement names as its parent": a self-parent doesn't unmake a leaf.
  return new Set(list.filter((r) => !list.some((o) => o !== r && parentOf(o) === r.id)).map((r) => r.id));
}
function oLoad(list) {
  const out = new Map(); const add = (id, code) => out.set(JSON.stringify([id, code]), { id, code });
  const ids = new Set(list.map((r) => r.id)); const leaves = leafSet(list);
  const seen = new Set(); const first = new Map();
  for (const r of list) {
    if (!goodId(r.id)) add(r.id, 'bad-id');
    if (seen.has(r.id)) add(r.id, 'duplicate-id'); else { seen.add(r.id); first.set(r.id, r); }
    const p = parentOf(r);
    if (p !== null && !ids.has(p)) add(r.id, 'unknown-parent');
    if (leaves.has(r.id)) {
      if (!METHODS.includes(r.method)) add(r.id, 'bad-method');
      if (r.strength === 'shall' && !hasAcc(r.acceptance)) add(r.id, 'missing-acceptance');
    }
  }
  // cycles: walk from every id; a node revisited within the current walk closes a cycle
  const onCycle = new Set(), done = new Set();
  for (const start of first.keys()) {
    const path = [], where = new Map(); let cur = start;
    while (cur !== null && first.has(cur) && !done.has(cur)) {
      if (where.has(cur)) { for (const x of path.slice(where.get(cur))) onCycle.add(x); break; }
      where.set(cur, path.length); path.push(cur); cur = parentOf(first.get(cur));
    }
    for (const x of path) done.add(x);
  }
  for (const id of onCycle) add(id, 'cycle');
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

const wordCh = (c) => c !== undefined && (isUp(c) || (c >= 'a' && c <= 'z') || isDig(c) || c === '_');
const lowerAscii = (t) => [...t].map((c) => (isUp(c) ? String.fromCharCode(c.charCodeAt(0) + 32) : c)).join('');
const WS = new Set([' ', '\t', '\n', '\r', '\f', '\v', ' ']);
// does the phrase (tokens separated by any run of whitespace) appear as a whole word?
function hasWord(text, phrase) {
  const t = lowerAscii(text), toks = phrase.split(' ');
  for (let i = 0; i < t.length; i++) {
    if (wordCh(t[i - 1]) && wordCh(t[i])) continue;
    let j = i, ok = true;
    for (let k = 0; k < toks.length && ok; k++) {
      if (k > 0) { const j0 = j; while (WS.has(t[j])) j++; if (j === j0) ok = false; }
      if (ok && t.startsWith(toks[k], j)) j += toks[k].length; else ok = false;
    }
    if (!ok) continue;
    const firstC = t[i], lastC = t[j - 1];
    if (wordCh(firstC) && wordCh(t[i - 1])) continue;
    if (wordCh(lastC) && wordCh(t[j])) continue;
    return true;
  }
  return false;
}
const VAGUE = ['fast', 'quickly', 'user-friendly', 'easy', 'robust', 'efficient', 'flexible', 'adequate', 'appropriate', 'as needed', 'state-of-the-art', 'etc'];
function oLint(r) {
  const t = typeof r.text === 'string' ? r.text : '', c = [];
  if (['tbd', 'tbc', 'tbr'].some((w) => hasWord(t, w))) c.push('tbd');
  if (VAGUE.some((w) => hasWord(t, w))) c.push('vague');
  if (lowerAscii(t).includes('and/or')) c.push('and-or');
  if (r.strength === 'shall' && !hasWord(t, 'shall')) c.push('no-shall');
  return c.sort();
}

// ---------- M2/M3 ----------
function oTrace(reqs, links) {
  const ids = new Set(reqs.map((r) => r.id)), vb = {}, ib = {};
  for (const r of reqs) { vb[r.id] = new Set(); ib[r.id] = new Set(); }
  links.forEach((l) => {
    if (!ids.has(l.to)) return;
    if (l.kind === 'verifies') vb[l.to].add(l.from); else if (l.kind === 'implements') ib[l.to].add(l.from);
  });
  const fin = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));
  const verifiedBy = fin(vb), implementedBy = fin(ib), lv = leafSet(reqs);
  return {
    verifiedBy, implementedBy,
    orphans: [...lv].filter((id) => verifiedBy[id].length === 0).sort(),
    dangling: links.map((l, i) => (ids.has(l.to) ? -1 : i)).filter((i) => i >= 0),
  };
}
function oLatest(evidence, asOf) {
  const best = new Map(); const cut = asOf === undefined ? Infinity : days(asOf);
  evidence.forEach((e, i) => {
    const d = days(e.at); if (d > cut) return;
    const b = best.get(e.check); if (!b || d >= b.d) best.set(e.check, { d, r: e.result });
  });
  return best;
}
function oStatus(reqs, links, evidence, asOf) {
  const { verifiedBy } = oTrace(reqs, links), lat = oLatest(evidence, asOf), lv = leafSet(reqs);
  const kids = new Map(); for (const r of reqs) { const p = parentOf(r); if (p !== null) (kids.get(p) || kids.set(p, []).get(p)).push(r); }
  const memo = {};
  const st = (id) => {
    if (id in memo) return memo[id];
    let v;
    if (lv.has(id)) {
      const rs = verifiedBy[id].map((c) => (lat.has(c) ? lat.get(c).r : undefined));
      const had = rs.filter((x) => x !== undefined);
      if (had.length === 0) v = 'unverified';
      else if (had.includes('fail')) v = 'failed';
      else if (rs.every((x) => x === 'pass')) v = 'verified';
      else v = 'partial';
    } else {
      let ch = kids.get(id); const sh = ch.filter((r) => r.strength === 'shall'); if (sh.length) ch = sh;
      const xs = ch.map((r) => st(r.id));
      v = xs.every((x) => x === 'verified') ? 'verified' : xs.includes('failed') ? 'failed' : xs.every((x) => x === 'unverified') ? 'unverified' : 'partial';
    }
    return (memo[id] = v);
  };
  const out = {}; for (const r of reqs) out[r.id] = st(r.id); return out;
}
function oCoverage(reqs, sm) {
  const c = { verified: 0, failed: 0, partial: 0, unverified: 0 }; const lv = leafSet(reqs);
  for (const id of lv) c[sm[id]]++;
  const total = lv.size; return { ...c, total, ratio: total ? c.verified / total : 0 };
}

// ---------- M4 (exact; values and thresholds are integers or halves) ----------
const toQ = (x) => { const n = Math.round(x * 2); if (n / 2 !== x) throw new Error('oracle needs halves: ' + x); return new Q(n, 2); };
function oTpm(m, asOf) {
  const cut = days(asOf); let pts = [];
  m.history.forEach((h) => { const d = days(h.at); if (d <= cut) pts.push({ d, v: h.value }); });
  const nul = { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null };
  if (!pts.length) return nul;
  let cur = pts[0]; for (const p of pts) if (p.d >= cur.d) cur = p;
  const T = toQ(m.threshold), V = toQ(cur.v), mx = m.direction === 'max';
  const margin = mx ? T.sub(V) : V.sub(T);
  const band = m.riskBand === undefined || m.riskBand === null ? toQ(Math.abs(m.threshold)).mul(new Q(1, 10)) : toQ(m.riskBand);
  const status = margin.cmp(q(0)) < 0 ? 'breached' : margin.cmp(band) < 0 ? 'at-risk' : 'met';
  const objectiveMet = m.objective === undefined || m.objective === null ? null : mx ? V.cmp(toQ(m.objective)) <= 0 : V.cmp(toQ(m.objective)) >= 0;
  let trend = null, slope = null, icpt = null; const x0 = Math.min(...pts.map((p) => p.d));
  if (pts.length >= 2) {
    const n = q(pts.length); let sx = q(0), sy = q(0), sxx = q(0), sxy = q(0);
    for (const p of pts) { const x = q(p.d - x0 + 1), y = toQ(p.v); sx = sx.add(x); sy = sy.add(y); sxx = sxx.add(x.mul(x)); sxy = sxy.add(x.mul(y)); }
    const den = n.mul(sxx).sub(sx.mul(sx));
    if (!den.zero) { slope = n.mul(sxy).sub(sx.mul(sy)).div(den); icpt = sy.sub(slope.mul(sx)).div(n); trend = slope.num(); }
  }
  let projectedBreach = null;
  if (status !== 'breached' && slope && (mx ? slope.n > 0n : slope.n < 0n)) {
    // line(x) = icpt + slope·x crosses T at x* = (T − icpt)/slope; want first integer x ≥ asOf with line strictly past T
    const xs = T.sub(icpt).div(slope); // past ⇔ x > x* in both directions (slope sign matches)
    let fl = xs.n / xs.d; if (xs.n < 0n && xs.n % xs.d !== 0n) fl -= 1n; // floor
    const first = Number(fl) + 1, a = cut - x0 + 1;
    const day = Math.max(first, a) + x0 - 1;
    projectedBreach = day > days('9999-12-31') ? null : civil(day); // D17
  }
  return { current: cur.v, margin: margin.num(), status, objectiveMet, trend, projectedBreach };
}

// ---------- M5 (exact) ----------
function oEarned(reqs, links, evidence, plan, actuals, asOf) {
  const sm = oStatus(reqs, links, evidence, asOf), wps = plan.workPackages;
  const cut = days(asOf), AC = {}; let acAll = q(0);
  for (const a of actuals) if (days(a.at) <= cut) { const h = toQ(a.hours); acAll = acAll.add(h); AC[a.wp] = (AC[a.wp] || q(0)).add(h); }
  if (!wps.length) return { BAC: 0, PV: 0, EV: 0, AC: acAll.num(), SV: 0, CV: -acAll.num(), SPI: null, CPI: qdiv(q(0), acAll), ES: 0, AT: null, SPIt: null, byWP: {} };
  const d0 = Math.min(...wps.map((w) => days(w.start))), dn = (x) => days(x) - d0 + 1;
  const lastDay = Math.max(...wps.map((w) => dn(w.finish)));
  const pvW = (w, d) => { const st = dn(w.start), f = dn(w.finish); let r = new Q(d - st + 1, f - st + 1); if (r.cmp(q(0)) < 0) r = q(0); if (r.cmp(q(1)) > 0) r = q(1); return q(w.budget).mul(r); };
  const PVd = (d) => (d <= 0 ? q(0) : wps.reduce((t, w) => t.add(pvW(w, d)), q(0)));
  const AT = dn(asOf); const byWP = {}; let PV = q(0), EV = q(0), BAC = q(0);
  for (const w of wps) {
    const pv = pvW(w, AT), k = w.reqs.filter((id) => sm[id] === 'verified').length;
    const ev = w.reqs.length ? q(w.budget).mul(new Q(k, w.reqs.length)) : q(0);
    byWP[w.id] = { PV: pv.num(), EV: ev.num(), AC: (AC[w.id] || q(0)).num() };
    PV = PV.add(pv); EV = EV.add(ev); BAC = BAC.add(q(w.budget));
  }
  let C = 0; for (let n = 0; n <= lastDay; n++) if (PVd(n).cmp(EV) <= 0) C = n;
  let ES = q(C);
  if (C + 1 <= lastDay && PVd(C + 1).cmp(PVd(C)) !== 0) ES = q(C).add(EV.sub(PVd(C)).div(PVd(C + 1).sub(PVd(C))));
  return { BAC: BAC.num(), PV: PV.num(), EV: EV.num(), AC: acAll.num(), SV: EV.sub(PV).num(), CV: EV.sub(acAll).num(), SPI: qdiv(EV, PV), CPI: qdiv(EV, acAll), ES: ES.num(), AT, SPIt: qdiv(ES, q(AT)), byWP };
}

// ---------- M6 (report, minus file reading) ----------
function oReport(d, asOf) {
  if (asOf === undefined) {
    const all = [...d.evidence.map((e) => e.at), ...d.actuals.map((a) => a.at), ...d.measures.flatMap((m) => m.history.map((h) => h.at))];
    if (!all.length) return { asOf: null }; // vv uses today; not compared
    asOf = civil(Math.max(...all.map(days)));
  }
  const lint = {}; for (const r of d.requirements) { const c = oLint(r); if (c.length) lint[r.id] = c; }
  const st = oStatus(d.requirements, d.links, d.evidence, asOf);
  return {
    asOf, problems: oLoad(d.requirements), lint, coverage: oCoverage(d.requirements, st),
    orphans: oTrace(d.requirements, d.links).orphans, status: st,
    tpms: Object.fromEntries(d.measures.map((m) => [m.id, oTpm(m, asOf)])),
    evm: d.plan ? oEarned(d.requirements, d.links, d.evidence, d.plan, d.actuals, asOf) : null,
  };
}

// ---------- generators ----------
const SEG = ['A', 'B', 'SYS', 'X1', 'R2D2', 'VV', 'M1'];
const BADID = ['a', 'A-', '-A', 'A--B', '1A', 'A_B', 'A b', 'Ä', 'AB-c', '', 'A-B-', 'A\n'];
const STR = ['shall', 'should', 'may'];
const WORDS = ['the', 'system', 'shall', 'SHALL', 'Shall', 'shallow', 'fast', 'Fast-moving', 'breakfast', 'quickly', 'quickly2', 'user-friendly', 'User_friendly', 'easy', 'easily', 'robust', 'efficient,', 'flexible.', 'adequate', '(appropriate)', 'as needed', 'as\tneeded', 'as  needed', 'asneeded', 'state-of-the-art', 'state of the art', 'etc', 'etc.', 'etcetera', 'TBD', 'tbd', 'TBDs', 'TBC', '[tbr]', 'and/or', 'AND/OR', 'and / or', 'é', '😀fast', 'fastétc', 'x_tbd', '-'];
const sentence = () => Array.from({ length: ri(0, 7) }, () => pick(WORDS)).join(pick([' ', ' ', '  ', '\n']));
function genReqs(clean) {
  const n = ri(1, 12), ids = [];
  while (ids.length < n) { const id = Array.from({ length: ri(1, 3) }, () => pick(SEG)).join('-'); if (!ids.includes(id)) ids.push(id); }
  const reqs = ids.map((id, i) => ({
    id, text: sentence(), parent: i && rnd() < 0.7 ? ids[ri(0, i - 1)] : (rnd() < 0.5 ? null : undefined),
    strength: pick(STR), method: rnd() < 0.9 ? pick(METHODS) : pick(['Test', 'review', undefined]),
    acceptance: pick(['ok', 'passes C-1', '', '  ', undefined, null, 'x']), rationale: 'r',
  }));
  for (const r of reqs) if (r.parent === undefined) delete r.parent;
  if (!clean) {
    for (let k = rnd() < 0.3 ? ri(1, 3) : 0; k > 0; k--) reqs.push({ ...pick(reqs), method: pick(['x', 'test']), acceptance: pick(['', 'y']) });
    if (rnd() < 0.3) { const r = pick(reqs); r.parent = pick(reqs).id; } // may close a cycle
    if (rnd() < 0.2) pick(reqs).parent = 'NOPE-' + ri(1, 3);
    if (rnd() < 0.2) pick(reqs).id = pick(BADID);
  } else if (rnd() < 0.2) pick(reqs).parent = 'GHOST'; // unknown parent is allowed in M2–M6
  return shuffle(reqs);
}
function genWorld() {
  const reqs = genReqs(true), checks = Array.from({ length: ri(1, 8) }, (_, i) => 'C-' + i);
  const links = Array.from({ length: ri(0, 20) }, () => ({
    from: rnd() < 0.8 ? pick(checks) : 'art' + ri(0, 2), to: rnd() < 0.9 ? pick(reqs).id : 'MISSING',
    kind: rnd() < 0.7 ? 'verifies' : 'implements',
  }));
  const evidence = Array.from({ length: ri(0, 25) }, () => ({ check: rnd() < 0.9 ? pick(checks) : 'C-X', result: rnd() < 0.75 ? 'pass' : 'fail', at: date(ri(0, 20)) }));
  return { reqs, links, evidence, asOf: date(ri(0, 22)) };
}
const half = (a, b) => ri(a * 2, b * 2) / 2;
function genMeasure() {
  const history = Array.from({ length: ri(0, 7) }, () => ({ at: date(ri(0, rnd() < 0.2 ? 1 : 30)), value: half(-20, 20) }));
  const m = { id: 'T', req: 'A', direction: pick(['max', 'min']), threshold: half(-15, 15), history };
  if (rnd() < 0.6) m.objective = half(-15, 15);
  if (rnd() < 0.4) m.riskBand = half(0, 5);
  return { m, asOf: date(ri(0, 40)) };
}
function genPlan(reqs) {
  const k = ri(0, 4), wps = [];
  for (let i = 0; i < k; i++) {
    const st = ri(0, 10), f = st + ri(0, 10);
    wps.push({ id: 'WP' + i, budget: ri(0, 5) * 10 + (rnd() < 0.3 ? 7 : 0), start: date(st), finish: date(f), reqs: Array.from({ length: ri(0, 4) }, () => (rnd() < 0.9 ? pick(reqs).id : 'NOT-A-REQ')) });
  }
  return { workPackages: wps };
}
const genActuals = (k) => Array.from({ length: ri(0, 8) }, () => ({ wp: rnd() < 0.85 ? 'WP' + ri(0, Math.max(0, k - 1)) : 'ELSEWHERE', hours: half(0, 12), at: date(ri(0, 22)) }));

// ---------- compare ----------
const close = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : false);
function same(a, b) {
  if (close(a, b)) return true;
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
}
const bad = {}; const show = 3;
function cmp(name, input, mine, theirs) {
  if (same(mine, theirs)) return;
  (bad[name] ||= []).push({ input, oracle: mine, vv: theirs });
}
const run = (f) => { try { return f(); } catch (e) { return { threw: e.message }; } };

for (let c = 0; c < CASES; c++) {
  const list = genReqs(rnd() < 0.3);
  cmp('load', list, oLoad(list), run(() => vv.load(list).problems));
  for (const r of list) cmp('lint', r, oLint(r), run(() => vv.lint(r)));
  const w = genWorld();
  cmp('trace', w, oTrace(w.reqs, w.links), run(() => vv.trace(w.reqs, w.links)));
  const sm = oStatus(w.reqs, w.links, w.evidence, w.asOf);
  cmp('status', w, sm, run(() => vv.status(w.reqs, w.links, w.evidence, { asOf: w.asOf })));
  cmp('coverage', w, oCoverage(w.reqs, sm), run(() => vv.coverage(w.reqs, sm)));
  const { m, asOf } = genMeasure();
  cmp('tpm', { m, asOf }, oTpm(m, asOf), run(() => vv.tpm(m, { asOf })));
  const plan = genPlan(w.reqs), actuals = genActuals(plan.workPackages.length);
  cmp('earned', { ...w, plan, actuals }, oEarned(w.reqs, w.links, w.evidence, plan, actuals, w.asOf),
    run(() => vv.earned(w.reqs, w.links, w.evidence, plan, actuals, { asOf: w.asOf })));
  // the report, with and without an explicit asOf (the default comes from evidence, actuals, measures)
  const measures = Array.from({ length: ri(0, 3) }, (_, i) => ({ ...genMeasure().m, id: 'T' + i }));
  const data = { requirements: w.reqs, links: w.links, evidence: w.evidence, measures, plan: rnd() < 0.8 ? plan : null, actuals };
  const explicit = rnd() < 0.5 ? w.asOf : undefined;
  const mine = oReport(data, explicit);
  if (mine.asOf !== null) cmp('report', { data, asOf: explicit }, mine, run(() => vv.report(data, { asOf: explicit })));
}

const names = ['load', 'lint', 'trace', 'status', 'coverage', 'tpm', 'earned', 'report'];
for (const n of names) {
  const b = bad[n] || [];
  console.log(`${n.padEnd(9)} ${b.length ? 'MISMATCH ' + b.length : 'ok'}`);
  for (const x of b.slice(0, show)) console.log(JSON.stringify(x));
}
process.exit(Object.keys(bad).length ? 1 : 0);
