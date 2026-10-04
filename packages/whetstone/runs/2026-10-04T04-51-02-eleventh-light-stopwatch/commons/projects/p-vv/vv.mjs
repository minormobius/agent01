// vv — requirements, verification, and earned value earned only by verification.
// ES module, no dependencies. Every place SPEC.md left open is marked DECISION and
// listed in README.md "Decisions".

const STRENGTHS = ['shall', 'should', 'may'];
const METHODS = ['test', 'analysis', 'inspection', 'demonstration'];
const ID_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortIds = (xs) => [...xs].sort();
const hasParent = (r) => r && r.parent !== null && r.parent !== undefined; // DECISION: null/undefined = top level

// ---------- dates ----------
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function dayNumber(s) {
  const m = DATE_RE.exec(String(s));
  if (!m) throw new Error(`bad date: ${JSON.stringify(s)}`);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3])
    throw new Error(`bad date: ${s}`);
  return Math.round(t / 86400000);
}
export function dateOf(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}
export const isDate = (s) => { try { dayNumber(s); return true; } catch { return false; } };
// "at <= asOf" compared as days; asOf undefined/null means everything counts.
const onOrBefore = (at, asOf) => asOf == null || dayNumber(at) <= dayNumber(asOf);

// ---------- M1 ----------
function childrenMap(reqs) {
  const m = new Map();
  for (const r of reqs) if (hasParent(r)) {
    if (!m.has(r.parent)) m.set(r.parent, []);
    m.get(r.parent).push(r);
  }
  return m;
}
// A leaf: no *other* requirement names it as parent (a self-parent alone doesn't make it a parent).
function leafFlags(reqs) {
  const namers = new Map(); // id -> indices that name it as parent
  reqs.forEach((r, i) => { if (hasParent(r)) { if (!namers.has(r.parent)) namers.set(r.parent, []); namers.get(r.parent).push(i); } });
  return reqs.map((r, i) => !(namers.get(r?.id) || []).some((j) => j !== i));
}
export function leaves(reqs) {
  const f = leafFlags(reqs);
  return reqs.filter((_, i) => f[i]);
}

export function load(list) {
  const reqs = Array.isArray(list) ? list : [];
  const out = new Set();
  const add = (id, code) => out.add(JSON.stringify([id, code]));
  const seen = new Set(), dup = new Set();
  const first = new Map(); // DECISION: with duplicate ids, the first occurrence defines the parent chain
  for (const r of reqs) {
    const id = r?.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) add(id, 'bad-id');
    if (seen.has(id)) { if (!dup.has(id)) { dup.add(id); add(id, 'duplicate-id'); } }
    else { seen.add(id); first.set(id, r); }
  }
  for (const r of reqs) if (hasParent(r) && !seen.has(r.parent)) add(r.id, 'unknown-parent');
  // cycles: walk parent pointers; colour 0 new, 1 on current path, 2 done
  const colour = new Map();
  for (const id of first.keys()) {
    if (colour.get(id)) continue;
    const path = []; let cur = id;
    while (cur !== undefined && first.has(cur) && !colour.get(cur)) {
      colour.set(cur, 1); path.push(cur);
      const p = first.get(cur); cur = hasParent(p) ? p.parent : undefined;
    }
    if (cur !== undefined && colour.get(cur) === 1) {
      for (let k = path.indexOf(cur); k < path.length; k++) add(path[k], 'cycle');
    }
    for (const x of path) colour.set(x, 2);
  }
  const leaf = leafFlags(reqs);
  reqs.forEach((r, i) => {
    if (!leaf[i]) return;
    if (!METHODS.includes(r?.method)) add(r?.id, 'bad-method');
    // DECISION: acceptance must be a string with something other than whitespace
    if (r?.strength === 'shall' && !(typeof r.acceptance === 'string' && r.acceptance.trim() !== '')) add(r?.id, 'missing-acceptance');
  });
  const problems = [...out].map((s) => JSON.parse(s)).map(([id, code]) => ({ id, code }));
  problems.sort((a, b) => cmp(String(a.id), String(b.id)) || cmp(a.code, b.code));
  return { reqs, problems };
}

// Whole word / phrase: not preceded or followed by a letter, digit or underscore (Unicode-aware).
const word = (w) => new RegExp(`(?<![\\p{L}\\p{N}_])${w}(?![\\p{L}\\p{N}_])`, 'iu');
const TBD_RE = word('(?:tbd|tbc|tbr)');
const VAGUE = ['fast', 'quickly', 'user-friendly', 'easy', 'robust', 'efficient', 'flexible', 'adequate',
  'appropriate', 'as needed', 'state-of-the-art', 'etc'];
const VAGUE_RE = word(`(?:${VAGUE.map((v) => v.replace(/ /g, '\\s+')).join('|')})`);
const SHALL_RE = word('shall');
export function lint(req) {
  const text = typeof req?.text === 'string' ? req.text : '';
  const codes = [];
  if (/and\/or/i.test(text)) codes.push('and-or'); // DECISION: any case
  if (req?.strength === 'shall' && !SHALL_RE.test(text)) codes.push('no-shall'); // DECISION: any case
  if (TBD_RE.test(text)) codes.push('tbd');
  if (VAGUE_RE.test(text)) codes.push('vague');
  return codes.sort();
}

// ---------- M2 ----------
export function trace(reqs, links = []) {
  const ids = new Set(reqs.map((r) => r.id));
  const v = new Map(), im = new Map();
  for (const r of reqs) { v.set(r.id, new Set()); im.set(r.id, new Set()); }
  const dangling = [];
  links.forEach((l, i) => {
    if (!ids.has(l?.to)) { dangling.push(i); return; }
    if (l.kind === 'verifies') v.get(l.to).add(l.from);
    else if (l.kind === 'implements') im.get(l.to).add(l.from);
    // DECISION: a link of any other kind to a real requirement is ignored, not dangling
  });
  const verifiedBy = {}, implementedBy = {};
  for (const r of reqs) { verifiedBy[r.id] = sortIds(v.get(r.id)); implementedBy[r.id] = sortIds(im.get(r.id)); }
  const orphans = sortIds(new Set(leaves(reqs).filter((r) => verifiedBy[r.id].length === 0).map((r) => r.id)));
  return { verifiedBy, implementedBy, orphans, dangling };
}

// ---------- M3 ----------
export function latestResults(evidence = [], asOf) {
  const best = new Map(); // check -> { day, result }
  for (const e of evidence) {
    if (!e || !onOrBefore(e.at, asOf)) continue;
    const d = dayNumber(e.at), b = best.get(e.check);
    if (!b || d >= b.day) best.set(e.check, { day: d, result: e.result }); // later entry wins a tie
  }
  return best;
}

export function status(reqs, links = [], evidence = [], { asOf } = {}) {
  const { verifiedBy } = trace(reqs, links);
  const latest = latestResults(evidence, asOf);
  const kids = childrenMap(reqs);
  const memo = new Map();
  const of = (id) => {
    if (memo.has(id)) return memo.get(id);
    let s;
    const ch = (kids.get(id) || []).filter((c) => c.id !== id);
    if (ch.length === 0) {
      const res = verifiedBy[id].map((c) => latest.get(c)?.result).filter((x) => x !== undefined);
      if (res.length === 0) s = 'unverified';
      else if (res.some((x) => x === 'fail')) s = 'failed';
      // DECISION: any result other than 'pass' or 'fail' is ignored as no result
      else if (res.filter((x) => x === 'pass').length === verifiedBy[id].length) s = 'verified';
      else if (res.every((x) => x !== 'pass')) s = 'unverified';
      else s = 'partial';
    } else {
      const shall = ch.filter((c) => c.strength === 'shall');
      const sts = (shall.length ? shall : ch).map((c) => of(c.id));
      if (sts.every((x) => x === 'verified')) s = 'verified';
      else if (sts.some((x) => x === 'failed')) s = 'failed';
      else if (sts.every((x) => x === 'unverified')) s = 'unverified';
      else s = 'partial';
    }
    memo.set(id, s);
    return s;
  };
  const out = {};
  for (const r of reqs) out[r.id] = of(r.id);
  return out;
}

export function coverage(reqs, statusMap) {
  const c = { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0, ratio: 0 };
  for (const r of leaves(reqs)) {
    const s = statusMap[r.id];
    if (s in c && s !== 'total' && s !== 'ratio') c[s]++;
    c.total++;
  }
  c.ratio = c.total ? c.verified / c.total : 0;
  return c;
}

// ---------- M4 ----------
// DECISION (Modulo, vv turn 3): M4 is computed in exact arithmetic. Every number is read as the
// decimal JSON would write for it (String(x), the shortest round-trip form; every finite double has
// one), scaled by 10^p to a BigInt, p being the most decimal places among the values that matter.
//   margin, band and status: integer differences and comparisons, so 18.7 − 17 = 1.7 is exactly the
//     default band 1.7 for T = 17 (met). Floats said 1.6999999999999993 < 1.7000000000000002, at-risk.
//   trend: D = nΣx² − (Σx)², N = nΣxY − ΣxΣY, slope = N ÷ (D·10^p). A true 0 is 0: floats said
//     −1e-16, which "fell toward" a min threshold and projected a breach in year 275760 (a throw).
//   projectedBreach: line(x)·10^p = (K + M·x) ÷ E, K = ΣY·D − N·Σx, M = n·N, E = n·D > 0; first x
//     strictly past T is floor((T·10^p·E − K) ÷ M) + 1 for both directions. No tolerance anywhere;
//     this replaces the 1e-9 tolerance of turn 2, which was right for people's decimals but wrong
//     for 17-digit ones (it called a line 1.6e-17 past T "on the line").
//   A breach after 9999-12-31 can't be written as YYYY-MM-DD, so it is null.
// Numbers reported (margin, trend) are the nearest double to the exact value.
const LAST_DAY = 2932896; // dayNumber('9999-12-31')
const NUM_RE = /^(-?)(\d*)(?:\.(\d+))?(?:e([+-]\d+))?$/;
function places(x) {
  const m = NUM_RE.exec(String(x));
  if (!m) throw new Error(`not a finite number: ${JSON.stringify(x)}`);
  return Math.max(0, (m[3] ? m[3].length : 0) - (m[4] ? Number(m[4]) : 0));
}
function scaled(x, p) {
  const m = NUM_RE.exec(String(x));
  const frac = m[3] || '', e = m[4] ? Number(m[4]) : 0;
  const shift = p + e - frac.length;
  const digits = BigInt((m[2] || '0') + frac) * (shift >= 0 ? 10n ** BigInt(shift) : 1n);
  const v = shift >= 0 ? digits : digits / 10n ** BigInt(-shift); // shift < 0 only for x's trailing zeros
  return m[1] ? -v : v;
}
const fdiv = (a, b) => { const q = a / b; return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q; };
const babs = (a) => (a < 0n ? -a : a);
// a ÷ b as the nearest double: the exact decimal to 25 significant digits, parsed by Number.
function ratio(a, b) {
  if (b < 0n) { a = -a; b = -b; }
  if (a === 0n) return 0;
  const neg = a < 0n; a = babs(a);
  let k = 0n; // scale so the integer quotient has ≥ 25 digits
  const need = 25 - (a / b).toString().length;
  if (need > 0) k = BigInt(need);
  const q = (a * 10n ** k) / b;
  const s = q.toString();
  return Number(`${neg ? '-' : ''}${s}e-${k}`);
}
export function tpm(measure, { asOf } = {}) {
  const hist = (measure.history || [])
    .map((h, i) => ({ ...h, i, day: dayNumber(h.at) }))
    .filter((h) => onOrBefore(h.at, asOf))
    .sort((a, b) => a.day - b.day || a.i - b.i);
  if (hist.length === 0)
    return { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null };
  const max = measure.direction === 'max';
  const T = measure.threshold, current = hist[hist.length - 1].value;
  const hasBand = measure.riskBand != null, hasObj = measure.objective != null;
  const p = Math.max(places(T), places(current), ...hist.map((h) => places(h.value)),
    hasBand ? places(measure.riskBand) : places(T) + 1, hasObj ? places(measure.objective) : 0);
  const S = 10n ** BigInt(p), TS = scaled(T, p), CS = scaled(current, p);
  const mS = max ? TS - CS : CS - TS;
  const bandS = hasBand ? scaled(measure.riskBand, p) : babs(TS) / 10n; // exact: p ≥ places(T) + 1
  const status = mS < 0n ? 'breached' : mS < bandS ? 'at-risk' : 'met';
  const margin = ratio(mS, S);
  let objectiveMet = null;
  if (hasObj) { const OS = scaled(measure.objective, p); objectiveMet = max ? CS <= OS : CS >= OS; }
  let trend = null, projectedBreach = null;
  if (hist.length >= 2) {
    const x0 = hist[0].day, n = BigInt(hist.length);
    let Sx = 0n, Sxx = 0n, SY = 0n, SxY = 0n;
    for (const h of hist) {
      const x = BigInt(h.day - x0), Y = scaled(h.value, p);
      Sx += x; Sxx += x * x; SY += Y; SxY += x * Y;
    }
    const D = n * Sxx - Sx * Sx;
    if (D !== 0n) { // DECISION: all points on one day → trend null
      const N = n * SxY - Sx * SY;
      trend = ratio(N, D * S);
      if (status !== 'breached' && (max ? N > 0n : N < 0n)) {
        const K = SY * D - N * Sx, M = n * N, E = n * D;
        // max: K + Mx > TS·E with M > 0; min: K + Mx < TS·E with M < 0. Both: x > (TS·E − K) ÷ M.
        let x = fdiv(TS * E - K, M) + 1n;
        const from = BigInt((asOf == null ? hist[hist.length - 1].day : dayNumber(asOf)) - x0);
        if (x < from) x = from;
        const day = BigInt(x0) + x;
        projectedBreach = day <= BigInt(LAST_DAY) ? dateOf(Number(day)) : null;
      }
    }
  }
  return { current, margin, status, objectiveMet, trend, projectedBreach };
}

// ---------- M5 ----------
export function earned(reqs, links = [], evidence = [], plan, actuals = [], { asOf } = {}) {
  const wps = plan?.workPackages || [];
  const acts = (actuals || []);
  if (asOf == null) { // DECISION: default asOf = latest evidence/actual date, else the plan's start
    const ds = [...evidence.map((e) => e.at), ...acts.map((a) => a.at)].filter(isDate).sort();
    asOf = ds.length ? ds[ds.length - 1] : wps.length ? wps.map((w) => w.start).sort()[0] : undefined;
  }
  // DECISION (Morphyx, vv day 1 turn 4): M5 is exact, as M4 is. Budgets and the hours counted are
  // read as their shortest decimals and scaled by 10^p; every PV and EV fraction is put over one
  // denominator Dn = lcm(each package's day count, each package's requirement count). So PVd(n)·Dn·10^p
  // and EV·Dn·10^p are integers, and "PVd(n) ≤ EV" is an integer comparison. It replaces a
  // 1e-9·max(1,BAC) tolerance that was wrong both ways: one unverified 1e7 package made a real
  // 0.0001 overshoot "equal" (ES 9, truly 1), and budgets of 1e-10 were swallowed by the 1e-9 floor
  // (ES 2 with nothing verified, truly 0). Reported numbers are the nearest double to the exact value.
  const st = status(reqs, links, evidence, { asOf });
  const base = wps.length ? Math.min(...wps.map((w) => dayNumber(w.start))) : (asOf ? dayNumber(asOf) : 0);
  const dn = (s) => dayNumber(s) - base + 1;
  const counted = acts.filter((a) => a && onOrBefore(a.at, asOf));
  const p = Math.max(0, ...wps.map((w) => places(w.budget)), ...counted.map((a) => places(a.hours)));
  const S = 10n ** BigInt(p);
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  const shape = wps.map((w) => {
    const s = dn(w.start), len = dn(w.finish) - s + 1;
    const rs = w.reqs || [];
    // DECISION: a work package with no requirements can never earn (EV 0)
    // DECISION: finish before start: the whole budget lands on the start day (len treated as 1)
    return { w, s, len: len <= 0 ? 1 : len, B: scaled(w.budget, p), nr: rs.length, k: rs.filter((id) => st[id] === 'verified').length };
  });
  let Dn = 1n;
  for (const x of shape) for (const m of [x.len, x.nr]) if (m > 0) Dn = Dn / gcd(Dn, BigInt(m)) * BigInt(m);
  const pvI = (x, d) => x.B * BigInt(Math.min(x.len, Math.max(0, d - x.s + 1))) * (Dn / BigInt(x.len));
  const evI = (x) => (x.nr ? x.B * BigInt(x.k) * (Dn / BigInt(x.nr)) : 0n);
  const pvAt = (d) => shape.reduce((t, x) => t + pvI(x, d), 0n);
  const AT = asOf == null ? 0 : dn(asOf);
  const U = Dn * S; // one unit of money in the scaled integers
  const byWP = {}, acW = {};
  let BAC = 0n, PV = 0n, EV = 0n, AC = 0n;
  for (const x of shape) { BAC += x.B * Dn; PV += pvI(x, AT); EV += evI(x); acW[x.w.id] = 0n; }
  for (const a of counted) {
    const h = scaled(a.hours, p) * Dn;
    AC += h;
    if (a.wp in acW) acW[a.wp] += h; // DECISION: hours on unknown packages count only in project AC
  }
  for (const x of shape) byWP[x.w.id] = { PV: ratio(pvI(x, AT), U), EV: ratio(evI(x), U), AC: ratio(acW[x.w.id], U) };
  const div = (a, b) => (b === 0n ? null : ratio(a, b));
  // earned schedule over plan days 0..last finish
  const last = wps.length ? Math.max(...shape.map((x) => x.s + x.len - 1), ...shape.map((x) => x.s)) : 0;
  let C = 0;
  for (let n = 1; n <= last; n++) if (pvAt(n) <= EV) C = n;
  const pC = C === 0 ? 0n : pvAt(C);
  let esNum = BigInt(C), esDen = 1n; // ES = esNum ÷ esDen
  if (C + 1 <= last) { const pN = pvAt(C + 1); if (pN !== pC) { esDen = pN - pC; esNum = BigInt(C) * esDen + (EV - pC); } }
  return {
    BAC: ratio(BAC, U), PV: ratio(PV, U), EV: ratio(EV, U), AC: ratio(AC, U),
    SV: ratio(EV - PV, U), CV: ratio(EV - AC, U), SPI: div(EV, PV), CPI: div(EV, AC),
    ES: ratio(esNum, esDen), AT, SPIt: AT === 0 ? null : ratio(esNum, esDen * BigInt(AT)), byWP,
  };
}

// ---------- M6 ----------
export function report({ requirements = [], links = [], evidence = [], measures = [], plan = null, actuals = [] } = {}, { asOf, today } = {}) {
  if (asOf == null) {
    const ds = [...evidence.map((e) => e?.at), ...actuals.map((a) => a?.at),
      ...measures.flatMap((m) => (m.history || []).map((h) => h?.at))].filter(isDate).sort();
    asOf = ds.length ? ds[ds.length - 1] : (today || new Date().toISOString().slice(0, 10));
  }
  const { problems } = load(requirements);
  const lints = {};
  for (const r of requirements) { const c = lint(r); if (c.length) lints[r.id] = c; }
  const st = status(requirements, links, evidence, { asOf });
  const tpms = {};
  for (const m of measures) tpms[m.id] = tpm(m, { asOf });
  return {
    asOf, problems, lint: lints,
    coverage: coverage(requirements, st),
    orphans: trace(requirements, links).orphans,
    status: st, tpms,
    evm: plan ? earned(requirements, links, evidence, plan, actuals, { asOf }) : null,
  };
}

export { STRENGTHS, METHODS, ID_RE };
