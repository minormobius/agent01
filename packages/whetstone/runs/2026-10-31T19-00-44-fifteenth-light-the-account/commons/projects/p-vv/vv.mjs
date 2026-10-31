// vv — requirements, verification and earned value. ES module, no dependencies.
// Every reading the spec leaves open is written down in README.md "Decisions" (D1…), and the
// comments below cite them. Change a decision there first, then here.

const STRENGTHS = ['shall', 'should', 'may'];
const METHODS = ['test', 'analysis', 'inspection', 'demonstration'];
const ID_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // code-unit order, never locale
const sortIds = (xs) => [...xs].sort();

// ---------- dates (UTC days) ----------
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function dayIndex(s) {
  const m = DATE_RE.exec(String(s));
  if (!m) throw new Error(`bad date: ${s}`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}
const LAST_DAY = Date.UTC(9999, 11, 31) / 86400000;
export function dateOf(i) { return new Date(i * 86400000).toISOString().slice(0, 10); }
// D2: an absent asOf means "no cutoff": every dated entry counts.
const within = (at, asOf) => asOf == null || dayIndex(at) <= dayIndex(asOf);

// ---------- M1 ----------
// D3 (+D21): r is a leaf unless some *other* requirement names r.id as its parent. A requirement
// whose parent is its own id (a one-member cycle) still counts as a leaf for load's leaf checks.
function namedBy(list) {
  const n = new Map(); // id → how many entries name it as parent
  for (const r of list) if (r && r.parent != null) n.set(r.parent, (n.get(r.parent) || 0) + 1);
  return n;
}
const isLeafIn = (n) => (r) => (n.get(r.id) || 0) - (r.parent != null && r.parent === r.id ? 1 : 0) === 0;
export function leaves(reqs) {
  return reqs.filter(isLeafIn(namedBy(reqs)));
}
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== ''; // D4: whitespace-only is empty

export function load(list) {
  const reqs = Array.isArray(list) ? list : [];
  const problems = new Map(); // key id\0code
  const add = (id, code) => problems.set(String(id) + '\u0000' + code, { id, code });
  const seen = new Set();
  const first = new Map(); // id → first requirement with it (D5: parent links follow the first)
  for (const r of reqs) {
    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) add(r.id, 'bad-id');
    if (seen.has(r.id)) add(r.id, 'duplicate-id');
    else { seen.add(r.id); first.set(r.id, r); }
  }
  for (const r of reqs) if (r.parent != null && !seen.has(r.parent)) add(r.id, 'unknown-parent');
  // cycles: walk parent chains over the first-occurrence map
  const state = new Map(); // id → 1 visiting, 2 done
  for (const start of first.keys()) {
    if (state.get(start) === 2) continue;
    const path = []; const pos = new Map();
    let cur = start;
    while (cur != null && first.has(cur) && state.get(cur) !== 2) {
      if (pos.has(cur)) { for (const id of path.slice(pos.get(cur))) add(id, 'cycle'); break; }
      pos.set(cur, path.length); path.push(cur);
      cur = first.get(cur).parent;
    }
    for (const id of path) state.set(id, 2);
  }
  const leaf = isLeafIn(namedBy(reqs));
  for (const r of reqs) {
    if (!leaf(r)) continue;
    if (!METHODS.includes(r.method)) add(r.id, 'bad-method');
    if (r.strength === 'shall' && !nonEmpty(r.acceptance)) add(r.id, 'missing-acceptance');
  }
  const out = [...problems.values()].sort((a, b) => cmp(String(a.id), String(b.id)) || cmp(a.code, b.code));
  return { reqs, problems: out };
}

// D6: "as words" = not preceded or followed by a letter, digit or underscore (JS \b).
const word = (w) => new RegExp('(?<![A-Za-z0-9_])' + w + '(?![A-Za-z0-9_])', 'i');
const TBD = word('(?:tbd|tbc|tbr)');
const VAGUE = word('(?:' + ['fast', 'quickly', 'user-friendly', 'easy', 'robust', 'efficient', 'flexible',
  'adequate', 'appropriate', 'as\\s+needed', 'state-of-the-art', 'etc'].join('|') + ')');
const SHALL = word('shall');
export function lint(req) {
  const t = typeof req?.text === 'string' ? req.text : '';
  const codes = [];
  if (TBD.test(t)) codes.push('tbd');
  if (VAGUE.test(t)) codes.push('vague');
  if (/and\/or/i.test(t)) codes.push('and-or');
  if (req?.strength === 'shall' && !SHALL.test(t)) codes.push('no-shall');
  return codes.sort();
}

// ---------- M2 ----------
export function trace(reqs, links) {
  const ids = new Set(reqs.map((r) => r.id));
  const v = new Map(), im = new Map();
  for (const id of ids) { v.set(id, new Set()); im.set(id, new Set()); }
  const dangling = [];
  (links || []).forEach((l, i) => {
    if (!ids.has(l.to)) { dangling.push(i); return; }
    if (l.kind === 'verifies') v.get(l.to).add(l.from);
    else if (l.kind === 'implements') im.get(l.to).add(l.from);
  });
  const verifiedBy = {}, implementedBy = {};
  for (const id of ids) { verifiedBy[id] = sortIds(v.get(id)); implementedBy[id] = sortIds(im.get(id)); }
  const orphans = sortIds(new Set(leaves(reqs).filter((r) => verifiedBy[r.id].length === 0).map((r) => r.id)));
  return { verifiedBy, implementedBy, orphans, dangling };
}

// ---------- M3 ----------
export function latestResults(evidence, asOf) {
  const best = new Map(); // check → { day, result }
  for (const e of evidence || []) {
    if (!within(e.at, asOf)) continue;
    const d = dayIndex(e.at), b = best.get(e.check);
    if (!b || d >= b.day) best.set(e.check, { day: d, result: e.result }); // later entry wins a tie
  }
  return best;
}
export function status(reqs, links, evidence, { asOf } = {}) {
  const { verifiedBy } = trace(reqs, links);
  const res = latestResults(evidence, asOf);
  const byId = new Map(); for (const r of reqs) if (!byId.has(r.id)) byId.set(r.id, r);
  const kids = new Map();
  for (const r of byId.values()) if (r.parent != null && byId.has(r.parent)) {
    if (!kids.has(r.parent)) kids.set(r.parent, []);
    kids.get(r.parent).push(r);
  }
  // D18: the spec never hands status a cycle, but a real project's CLI can. Members of a parent
  // cycle have no defined status: they are 'unverified' and the walk stops there (no stack overflow).
  const onCycle = new Set(load(reqs).problems.filter((p) => p.code === 'cycle').map((p) => p.id));
  const out = {};
  const of = (id) => {
    if (out[id]) return out[id];
    if (onCycle.has(id)) return (out[id] = 'unverified');
    const ch = kids.get(id);
    let s;
    if (!ch) {
      const rs = verifiedBy[id].map((c) => res.get(c)?.result).filter((x) => x != null);
      if (rs.length === 0) s = 'unverified';
      else if (rs.includes('fail')) s = 'failed';
      else if (rs.length === verifiedBy[id].length && rs.every((x) => x === 'pass')) s = 'verified';
      else s = 'partial'; // D7: a result other than pass/fail counts as "no result" → partial
    } else {
      const shall = ch.filter((c) => c.strength === 'shall');
      const ss = (shall.length ? shall : ch).map((c) => of(c.id));
      if (ss.every((x) => x === 'verified')) s = 'verified';
      else if (ss.includes('failed')) s = 'failed';
      else if (ss.every((x) => x === 'unverified')) s = 'unverified';
      else s = 'partial';
    }
    return (out[id] = s);
  };
  for (const id of byId.keys()) of(id);
  return out;
}
export function coverage(reqs, statusMap) {
  const c = { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0, ratio: 0 };
  const seen = new Set();
  for (const r of leaves(reqs)) {
    if (seen.has(r.id)) continue; seen.add(r.id);
    const s = statusMap[r.id] || 'unverified';
    c[s] = (c[s] || 0) + 1; c.total++;
  }
  c.ratio = c.total ? c.verified / c.total : 0;
  return c;
}

// ---------- M4 ----------
export function tpm(m, { asOf } = {}) {
  const h = (m.history || []).map((p, i) => ({ d: dayIndex(p.at), v: p.value, i }))
    .filter((p, k) => within(m.history[k].at, asOf))
    .sort((a, b) => a.d - b.d || a.i - b.i); // D8: latest by date, later entry wins a tie
  const nulls = { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null };
  if (!h.length) return nulls;
  const T = m.threshold, max = m.direction === 'max';
  const band = m.riskBand ?? Math.abs(T) * 0.1;
  const current = h[h.length - 1].v;
  const margin = max ? T - current : current - T;
  const st = margin < 0 ? 'breached' : margin < band ? 'at-risk' : 'met';
  const objectiveMet = m.objective == null ? null : max ? current <= m.objective : current >= m.objective;
  let trend = null, a = 0;
  const d0 = h[0].d;
  if (h.length >= 2) {
    const n = h.length, xs = h.map((p) => p.d - d0), ys = h.map((p) => p.v);
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    let sxx = 0, sxy = 0;
    for (let k = 0; k < n; k++) { sxx += (xs[k] - mx) ** 2; sxy += (xs[k] - mx) * (ys[k] - my); }
    if (sxx > 0) { trend = sxy / sxx; a = my - trend * mx; } // D9: all points on one day → null
  }
  let projectedBreach = null;
  if (st !== 'breached' && trend != null && (max ? trend > 0 : trend < 0)) {
    // D16: "past" is strict; a line within 1e-9 × max(1, |T|) of T is on it, not past (float noise).
    // D17: the crossing is found in closed form, then settled by a few unit steps. A crossing after
    // 9999-12-31 can't be written as YYYY-MM-DD (and a float-noise slope puts it there), so → null.
    const eps = 1e-9 * Math.max(1, Math.abs(T));
    const past = (x) => (max ? a + trend * x - T > eps : T - (a + trend * x) > eps);
    const xAs = (asOf != null ? dayIndex(asOf) : h[h.length - 1].d) - d0;
    const xStar = (T - a) / trend;
    if (Number.isFinite(xStar)) {
      let x = Math.max(xAs, Math.floor(xStar) - 2);
      for (let k = 0; k < 8 && !past(x); k++) x++;
      while (x > xAs && past(x - 1)) x--;
      if (past(x) && d0 + x <= LAST_DAY) projectedBreach = dateOf(d0 + x);
    }
  }
  return { current, margin, status: st, objectiveMet, trend, projectedBreach };
}

// ---------- M5 ----------
const div = (a, b) => (b === 0 ? null : a / b);
export function earned(reqs, links, evidence, plan, actuals, { asOf } = {}) {
  const wps = plan?.workPackages || [];
  const st = status(reqs, links, evidence, { asOf });
  if (!wps.length) {
    const AC = (actuals || []).filter((a) => within(a.at, asOf)).reduce((s, a) => s + a.hours, 0);
    return { BAC: 0, PV: 0, EV: 0, AC, SV: 0, CV: -AC, SPI: null, CPI: div(0, AC), ES: 0, AT: null, SPIt: null, byWP: {} };
  }
  const origin = Math.min(...wps.map((w) => dayIndex(w.start)));
  const dn = (s) => dayIndex(s) - origin + 1;
  const W = wps.map((w) => ({ w, s: dn(w.start), f: dn(w.finish) }));
  const pvOn = (x, d) => x.w.budget * Math.min(1, Math.max(0, (d - x.s + 1) / (x.f - x.s + 1)));
  const PVd = (d) => (d <= 0 ? 0 : W.reduce((s, x) => s + pvOn(x, d), 0));
  const lastDay = Math.max(...W.map((x) => x.f));
  const AT = asOf != null ? dn(asOf) : null;
  const byWP = {};
  let BAC = 0, PV = 0, EV = 0, AC = 0;
  for (const x of W) {
    const rs = x.w.reqs || [];
    const ev = rs.length ? (x.w.budget * rs.filter((id) => st[id] === 'verified').length) / rs.length : 0; // D10
    const pv = AT == null ? x.w.budget : pvOn(x, AT);
    byWP[x.w.id] = { PV: pv, EV: ev, AC: 0 };
    BAC += x.w.budget; PV += pv; EV += ev;
  }
  for (const a of actuals || []) {
    if (!within(a.at, asOf)) continue;
    AC += a.hours; // D11: hours booked to an unknown work package still count in project AC
    if (byWP[a.wp]) byWP[a.wp].AC += a.hours;
  }
  // earned schedule; D12: ≤ with a 1e-9 relative tolerance so EV = PV exactly isn't lost to rounding
  const eps = 1e-9 * Math.max(1, Math.abs(BAC));
  let C = 0;
  for (let n = 1; n <= lastDay; n++) { if (PVd(n) <= EV + eps) C = n; else break; }
  let ES = C;
  if (C + 1 <= lastDay) {
    const lo = PVd(C), hi = PVd(C + 1);
    if (hi !== lo) ES = C + (EV - lo) / (hi - lo);
  }
  return { BAC, PV, EV, AC, SV: EV - PV, CV: EV - AC, SPI: div(EV, PV), CPI: div(EV, AC),
    ES, AT, SPIt: AT == null ? null : div(ES, AT), byWP };
}

// ---------- M6 ----------
export function latestDate(evidence, actuals, measures) {
  let best = null;
  const see = (at) => { if (at != null && DATE_RE.test(at) && (best == null || at > best)) best = at; };
  for (const e of evidence || []) see(e.at);
  for (const a of actuals || []) see(a.at);
  for (const m of measures || []) for (const p of m.history || []) see(p.at);
  return best;
}
export function report({ requirements = [], links = [], evidence = [], measures = [], plan = null, actuals = [] }, { asOf } = {}) {
  asOf = asOf ?? latestDate(evidence, actuals, measures) ?? new Date().toISOString().slice(0, 10);
  const { problems } = load(requirements);
  const lints = {};
  for (const r of requirements) { const c = lint(r); if (c.length) lints[r.id] = c; }
  const st = status(requirements, links, evidence, { asOf });
  const tpms = {};
  for (const m of measures) tpms[m.id] = tpm(m, { asOf });
  return {
    asOf, problems, lint: lints, coverage: coverage(requirements, st), orphans: trace(requirements, links).orphans,
    status: st, tpms, evm: plan ? earned(requirements, links, evidence, plan, actuals, { asOf }) : null,
  };
}
export { STRENGTHS, METHODS };
