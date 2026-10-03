// mod.mjs — the Larkfield moderation library (reference). See SPEC.md.
function rows(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split(',').map((s) => s.trim());
  return lines.map((l) => { const v = l.split(','); return Object.fromEntries(head.map((h, i) => [h, (v[i] ?? '').trim()])); });
}
export const parseReports = (t) => rows(t).map((r) => ({ date: r.date, reporter: r.reporter, reported: r.reported, reason: r.reason }));
export const parseResidents = (t) => rows(t).map((r) => ({ handle: r.handle, kind: r.kind, joined: r.joined }));
const day = (d) => Date.parse(`${d}T00:00:00Z`) / 86400000;
export const weekOf = (date, start) => Math.floor((day(date) - day(start)) / 7) + 1;
export function weekly(reports, start) {
  const out = {};
  for (const r of reports) {
    const w = String(weekOf(r.date, start));
    const h = ((out[w] ||= {})[r.reported] ||= { reports: 0, reporters: [] });
    h.reports++;
    if (!h.reporters.includes(r.reporter)) h.reporters.push(r.reporter);
  }
  for (const w of Object.values(out)) for (const h of Object.values(w)) h.reporters.sort();
  return out;
}
export function mutes(reports, start, { minDistinct = 3 } = {}) {
  const out = [];
  for (const [w, hs] of Object.entries(weekly(reports, start))) for (const [h, v] of Object.entries(hs)) if (v.reporters.length >= minDistinct) out.push({ week: Number(w), handle: h });
  return out.sort((a, b) => a.week - b.week || (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0));
}
export function rings(reports, residents, { minReports = 6, minOverlap = 0.8, joinedWithinDays = 1 } = {}) {
  const by = new Map();
  for (const r of reports) { const x = by.get(r.reporter) || { n: 0, t: new Set() }; x.n++; x.t.add(r.reported); by.set(r.reporter, x); }
  const joined = Object.fromEntries(residents.map((r) => [r.handle, r.joined]));
  const big = [...by].filter(([h, x]) => x.n >= minReports && joined[h]).map(([h]) => h).sort();
  const adj = new Map(big.map((h) => [h, []]));
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
    const A = by.get(big[i]).t, B = by.get(big[j]).t;
    const inter = [...A].filter((x) => B.has(x)).length, uni = new Set([...A, ...B]).size;
    if (inter / uni >= minOverlap && Math.abs(day(joined[big[i]]) - day(joined[big[j]])) <= joinedWithinDays) { adj.get(big[i]).push(big[j]); adj.get(big[j]).push(big[i]); }
  }
  const seen = new Set(), out = [];
  for (const h of big) {
    if (seen.has(h) || !adj.get(h).length) continue;
    const g = [], st = [h]; seen.add(h);
    while (st.length) { const x = st.pop(); g.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    out.push(g.sort());
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
export function fnv32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function appealJudge({ handle, week, reporters }, residents, start) {
  const end = start ? day(start) + week * 7 - 1 : Infinity;
  const ok = residents.filter((r) => r.handle !== handle && !reporters.includes(r.handle) && day(r.joined) <= end);
  if (!ok.length) return null;
  ok.sort((a, b) => fnv32(`${a.handle}:${handle}:${week}`) - fnv32(`${b.handle}:${handle}:${week}`) || (a.handle < b.handle ? -1 : 1));
  return ok[0].handle;
}
