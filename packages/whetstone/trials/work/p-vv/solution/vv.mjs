// vv.mjs — reference implementation of SPEC.md, for the lab's checker only.

const METHODS = ['test', 'analysis', 'inspection', 'demonstration'];
const ID = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;
const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const dateOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const leavesOf = (reqs) => {
  const parents = new Set(reqs.map((r) => r.parent).filter((p) => p != null));
  return reqs.filter((r) => !parents.has(r.id));
};

export function load(list) {
  const reqs = list;
  const seen = new Set(), probs = new Map();
  const add = (id, code) => probs.set(`${id}\u0000${code}`, { id, code });
  const ids = new Set(reqs.map((r) => r.id));
  for (const r of reqs) {
    if (!ID.test(String(r.id))) add(r.id, 'bad-id');
    if (seen.has(r.id)) add(r.id, 'duplicate-id');
    seen.add(r.id);
    if (r.parent != null && !ids.has(r.parent)) add(r.id, 'unknown-parent');
  }
  const parentOf = Object.fromEntries(reqs.map((r) => [r.id, r.parent]));
  for (const r of reqs) {
    const path = new Set(); let cur = r.id;
    while (cur != null && ids.has(cur) && !path.has(cur)) { path.add(cur); cur = parentOf[cur]; }
    if (cur === r.id) add(r.id, 'cycle');
  }
  for (const r of leavesOf(reqs)) {
    if (!METHODS.includes(r.method)) add(r.id, 'bad-method');
    if (r.strength === 'shall' && !(typeof r.acceptance === 'string' && r.acceptance.trim())) add(r.id, 'missing-acceptance');
  }
  const problems = [...probs.values()].sort((a, b) => byId(String(a.id), String(b.id)) || byId(a.code, b.code));
  return { reqs, problems };
}

const VAGUE = ['fast', 'quickly', 'user-friendly', 'easy', 'robust', 'efficient', 'flexible', 'adequate', 'appropriate', 'as needed', 'state-of-the-art', 'etc'];
const word = (w) => new RegExp(`(^|[^a-z0-9-])${w.replace(/[-/]/g, (c) => `\\${c}`)}([^a-z0-9-]|$)`, 'i');
export function lint(req) {
  const t = String(req.text || '');
  const out = new Set();
  if (/(^|[^a-z0-9])(tbd|tbc|tbr)([^a-z0-9]|$)/i.test(t)) out.add('tbd');
  if (VAGUE.some((v) => word(v).test(t))) out.add('vague');
  if (/and\/or/i.test(t)) out.add('and-or');
  if (req.strength === 'shall' && !/(^|[^a-z])shall([^a-z]|$)/i.test(t)) out.add('no-shall');
  return [...out].sort();
}

export function trace(reqs, links) {
  const ids = new Set(reqs.map((r) => r.id));
  const verifiedBy = Object.fromEntries(reqs.map((r) => [r.id, []]));
  const implementedBy = Object.fromEntries(reqs.map((r) => [r.id, []]));
  const dangling = [];
  links.forEach((l, i) => {
    if (!ids.has(l.to)) { dangling.push(i); return; }
    const m = l.kind === 'verifies' ? verifiedBy : l.kind === 'implements' ? implementedBy : null;
    if (m && !m[l.to].includes(l.from)) m[l.to].push(l.from);
  });
  for (const m of [verifiedBy, implementedBy]) for (const k of Object.keys(m)) m[k].sort(byId);
  const orphans = leavesOf(reqs).filter((r) => !verifiedBy[r.id].length).map((r) => r.id).sort(byId);
  return { verifiedBy, implementedBy, orphans, dangling };
}

export function status(reqs, links, evidence, { asOf } = {}) {
  const { verifiedBy } = trace(reqs, links);
  const latest = {};
  const lim = asOf ? day(asOf) : Infinity;
  evidence.forEach((e) => { if (day(e.at) <= lim) { const prev = latest[e.check]; if (!prev || day(e.at) >= day(prev.at)) latest[e.check] = e; } });
  const children = {};
  for (const r of reqs) if (r.parent != null) (children[r.parent] ||= []).push(r);
  const out = {};
  const visit = (r, stack = new Set()) => {
    if (out[r.id]) return out[r.id];
    if (stack.has(r.id)) return 'unverified';
    stack.add(r.id);
    const kids = children[r.id];
    let s;
    if (!kids) {
      const checks = verifiedBy[r.id] || [];
      const res = checks.map((c) => latest[c]?.result);
      if (!checks.length || res.every((x) => x === undefined)) s = 'unverified';
      else if (res.includes('fail')) s = 'failed';
      else if (res.every((x) => x === 'pass')) s = 'verified';
      else s = 'partial';
    } else {
      const shall = kids.filter((k) => k.strength === 'shall');
      const ks = (shall.length ? shall : kids).map((k) => visit(k, stack));
      if (ks.every((x) => x === 'verified')) s = 'verified';
      else if (ks.includes('failed')) s = 'failed';
      else if (ks.every((x) => x === 'unverified')) s = 'unverified';
      else s = 'partial';
    }
    stack.delete(r.id);
    out[r.id] = s;
    return s;
  };
  for (const r of reqs) visit(r);
  return out;
}

export function coverage(reqs, statusMap) {
  const c = { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0 };
  for (const r of leavesOf(reqs)) { c[statusMap[r.id] || 'unverified']++; c.total++; }
  return { ...c, ratio: c.total ? c.verified / c.total : 0 };
}

export function tpm(m, { asOf } = {}) {
  const lim = asOf ? day(asOf) : Infinity;
  const h = (m.history || []).filter((p) => day(p.at) <= lim).slice().sort((a, b) => day(a.at) - day(b.at));
  if (!h.length) return { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null };
  const current = h[h.length - 1].value;
  const max = m.direction === 'max';
  const margin = max ? m.threshold - current : current - m.threshold;
  const band = m.riskBand ?? 0.1 * Math.abs(m.threshold);
  const status = margin < 0 ? 'breached' : margin < band ? 'at-risk' : 'met';
  const objectiveMet = m.objective == null ? null : max ? current <= m.objective : current >= m.objective;
  let trend = null, projectedBreach = null;
  if (h.length >= 2) {
    const d0 = day(h[0].at);
    const xs = h.map((p) => day(p.at) - d0), ys = h.map((p) => p.value);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    trend = sxx ? sxy / sxx : 0;
    const a = my - trend * mx;
    if (status !== 'breached' && ((max && trend > 0) || (!max && trend < 0))) {
      const xStart = (asOf ? day(asOf) : day(h[h.length - 1].at)) - d0;
      const xCross = (m.threshold - a) / trend;
      // first whole day x >= xStart where the line is strictly past the threshold
      let x = Math.max(xStart, Math.floor(xCross));
      const past = (xx) => (max ? a + trend * xx > m.threshold : a + trend * xx < m.threshold);
      while (!past(x)) x++;
      projectedBreach = dateOf(d0 + x);
    }
  }
  return { current, margin, status, objectiveMet, trend, projectedBreach };
}

export function earned(reqs, links, evidence, plan, actuals = [], { asOf } = {}) {
  const wps = plan?.workPackages || [];
  if (!wps.length) return null;
  const st = status(reqs, links, evidence, { asOf });
  const d1 = Math.min(...wps.map((w) => day(w.start)));
  const dn = (d) => day(d) - d1 + 1;
  const last = Math.max(...wps.map((w) => dn(w.finish)));
  const pvWp = (w, n) => { const s = dn(w.start), f = dn(w.finish); return w.budget * Math.min(1, Math.max(0, (n - s + 1) / (f - s + 1))); };
  const PVd = (n) => (n <= 0 ? 0 : wps.reduce((a, w) => a + pvWp(w, n), 0));
  const AT = dn(asOf);
  const lim = day(asOf);
  const byWP = {};
  let PV = 0, EV = 0, AC = 0, BAC = 0;
  for (const w of wps) {
    const pv = pvWp(w, AT);
    const ev = w.reqs.length ? w.budget * w.reqs.filter((r) => st[r] === 'verified').length / w.reqs.length : 0;
    const ac = actuals.filter((a) => a.wp === w.id && day(a.at) <= lim).reduce((s, a) => s + a.hours, 0);
    byWP[w.id] = { PV: pv, EV: ev, AC: ac };
    PV += pv; EV += ev; AC += ac; BAC += w.budget;
  }
  let C = 0;
  for (let n = 0; n <= last; n++) if (PVd(n) <= EV) C = n;
  const ES = C + 1 > last || PVd(C + 1) === PVd(C) ? C : C + (EV - PVd(C)) / (PVd(C + 1) - PVd(C));
  return { BAC, PV, EV, AC, SV: EV - PV, CV: EV - AC, SPI: PV ? EV / PV : null, CPI: AC ? EV / AC : null, ES, AT, SPIt: AT ? ES / AT : null, byWP };
}
