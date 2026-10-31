// policy.mjs — POLICY.md as code, for the check (never copied into the workspace). Returns the
// list of violations; empty means the rota follows the policy.
export function violations(people, dayList, rota, isWeekend) {
  const out = [];
  const by = Object.fromEntries(people.map((p) => [p.name, p]));
  const N = dayList.length;
  const weight = (p) => p.fte * dayList.filter((d) => !p.leave.has(d)).length / N;
  const W = people.reduce((s, p) => s + weight(p), 0);
  const wkDays = dayList.filter(isWeekend);
  const count = Object.fromEntries(people.map((p) => [p.name, { all: 0, wk: 0, run: 0 }]));
  for (const d of dayList) {
    const on = rota[d];
    if (!Array.isArray(on) || on.length !== 2 || new Set(on).size !== 2 || !on.every((n) => by[n])) { out.push(`${d}: not two known people`); continue; }
    if (!on.some((n) => by[n].role === 'nurse')) out.push(`${d}: no nurse`);
    for (const n of on) if (by[n].leave.has(d)) out.push(`${d}: ${n} on leave`);
    for (const p of people) {
      const c = count[p.name];
      if (on.includes(p.name)) { c.all++; if (isWeekend(d)) c.wk++; if (++c.run === 6) out.push(`${d}: ${p.name} sixth day in a row`); }
      else c.run = 0;
    }
  }
  if (Object.keys(rota).length !== N) out.push(`expected ${N} days, got ${Object.keys(rota).length}`);
  for (const p of people) {
    const share = 2 * N * weight(p) / W, wkShare = 2 * wkDays.length * weight(p) / W;
    if (Math.abs(count[p.name].all - share) > 2) out.push(`${p.name}: ${count[p.name].all} shifts, share ${share.toFixed(2)}`);
    if (Math.abs(count[p.name].wk - wkShare) > 1.5) out.push(`${p.name}: ${count[p.name].wk} weekend shifts, share ${wkShare.toFixed(2)}`);
  }
  return out;
}
