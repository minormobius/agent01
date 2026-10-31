// assign.mjs — who works when, by POLICY.md: each day goes to whoever is furthest behind their
// fair share (weekend share on weekends), within cover, leave and rest. A greedy pass can paint
// itself into a corner, so it retries with seeded tie-breaking and keeps the first rota that
// meets every rule.
import { days, isWeekend } from './calendar.mjs';

export function makeRota(people, start, n) {
  const list = days(start, n);
  const weight = (p) => p.fte * list.filter((d) => !p.leave.has(d)).length / n;
  const W = people.reduce((s, p) => s + weight(p), 0);
  const wkN = list.filter(isWeekend).length;
  const share = new Map(people.map((p) => [p, 2 * n * weight(p) / W]));
  const wkShare = new Map(people.map((p) => [p, 2 * wkN * weight(p) / W]));
  for (let seed = 1; seed <= 400; seed++) {
    let s = seed;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const st = new Map(people.map((p) => [p, { all: 0, wk: 0, run: 0 }]));
    const rota = {};
    let ok = true;
    list.forEach((d, i) => {
      if (!ok) return;
      const wk = isWeekend(d);
      const behind = (p) => (wk ? wkShare.get(p) * 4 : 0) - (wk ? st.get(p).wk * 4 : 0)
        + share.get(p) * (i + 1) / n - st.get(p).all + R() * 0.6;
      const free = people.filter((p) => !p.leave.has(d) && st.get(p).run < 5).sort((a, b) => behind(b) - behind(a));
      const nurse = free.find((p) => p.role === 'nurse');
      const other = nurse && free.find((p) => p !== nurse);
      if (!other) { ok = false; return; }
      rota[d] = [nurse.name, other.name];
      for (const p of people) {
        const c = st.get(p);
        if (p === nurse || p === other) { c.all++; c.run++; if (wk) c.wk++; } else c.run = 0;
      }
    });
    if (ok && people.every((p) => Math.abs(st.get(p).all - share.get(p)) <= 2 && Math.abs(st.get(p).wk - wkShare.get(p)) <= 1.5)) return rota;
  }
  throw new Error('no rota meets the policy for this team and period');
}
