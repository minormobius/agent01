// morphyx-cover.mjs — sizing for "Cover": who gets called when someone rings in sick.
// node proposals/morphyx-cover.mjs [years=300] [seed=1]
// One des model per year. Unit: minutes. Every number below is an ASSUMPTION, named, not data.
import { Sim, Resource } from '../tools/des/des.mjs';

const YEARS = +(process.argv[2] ?? 300), SEED0 = +(process.argv[3] ?? 1);
const DAY = 1440, SHIFT = 480, DAYS = 364, PERIOD = 28, RUN_CAP = 5;
const STAFF = [ // role, chance of saying yes when called (assumed; the clinic would know)
  { id: 'N0', role: 'N', yes: 0.9 }, { id: 'N1', role: 'N', yes: 0.7 }, { id: 'N2', role: 'N', yes: 0.5 }, { id: 'N3', role: 'N', yes: 0.3 },
  { id: 'A0', role: 'A', yes: 0.9 }, { id: 'A1', role: 'A', yes: 0.7 }, { id: 'A2', role: 'A', yes: 0.5 }, { id: 'A3', role: 'A', yes: 0.3 },
];
const SICK_P = 0.012, CALL_MEAN = 7; // daily chance a healthy person falls sick (episodes 1+geom(.5) days); minutes per call

export const RULES = {
  habit:        { lawful: false, order: 'list' },   // call the reliable ones first, don't count days
  habitLawful:  { lawful: true,  order: 'list' },   // same, but never break the run cap
  leastCovered: { lawful: true,  order: 'covers' }, // fewest covers this period first, lottery ties
  leastAsked:   { lawful: true,  order: 'asks' },   // fewest calls received this period first (a "no" still counts)
};

export function year(ruleName, seed) {
  const rule = RULES[ruleName], sim = new Sim({ seed }), desk = new Resource(sim, { capacity: 1 });
  // planned rota: each person 4 on / 4 off, staggered so two of each role work every day (runs of 4; cap 5)
  const on = (i, d, sh) => Math.floor((d + 2 * i + sh) / 4) % 2 === 0;
  const planned = (d, role, sh) => [0, 1, 2, 3].filter(i => on(i, d, sh)).map(i => role + i);
  const duty = Array.from({ length: DAYS }, (_, d) => ({ N: planned(d, 'N', 0), A: planned(d, 'A', 1) }));
  const sickUntil = {}, covers = {}, asks = {}, per = {};
  for (const s of STAFF) { sickUntil[s.id] = -1; covers[s.id] = 0; asks[s.id] = 0; }
  const out = { calls: 0, covered: 0, uncovered: 0, unlawful: 0, maxPeriodSpread: 0 };
  const works = (p, d) => d >= 0 && d < DAYS && (duty[d].N.includes(p) || duty[d].A.includes(p));
  const runIf = (p, d) => { let n = 1; for (let k = d - 1; works(p, k); k--) n++; for (let k = d + 1; works(p, k); k++) n++; return n; };
  const cnt = (kind, d, p) => per[`${kind}:${Math.floor(d / PERIOD)}:${p}`] ?? 0;
  const bump = (kind, d, p) => { per[`${kind}:${Math.floor(d / PERIOD)}:${p}`] = cnt(kind, d, p) + 1; };

  function* sickCall(d, role, who) {
    out.calls++;
    const req = desk.request(); yield req;              // one coordinator, one phone
    let cands = STAFF.filter(s => s.role === role && s.id !== who && sickUntil[s.id] < d && !works(s.id, d));
    if (rule.lawful) cands = cands.filter(s => runIf(s.id, d) <= RUN_CAP);
    const lot = new Map(cands.map(s => [s.id, sim.random()]));
    if (rule.order !== 'list') cands.sort((a, b) => cnt(rule.order, d, a.id) - cnt(rule.order, d, b.id) || lot.get(a.id) - lot.get(b.id));
    let got = null;
    for (const s of cands) {
      if (sim.now >= d * DAY + SHIFT) break;             // shift has started: too late
      yield sim.timeout(sim.exponential(1 / CALL_MEAN));
      asks[s.id]++; bump('asks', d, s.id);
      if (sim.random() < s.yes && sim.now < d * DAY + SHIFT) { got = s.id; break; }
    }
    desk.release(req);
    const slot = duty[d][role].indexOf(who);
    if (!got) { duty[d][role][slot] = null; out.uncovered++; return; }
    if (runIf(got, d) > RUN_CAP) out.unlawful++;
    duty[d][role][slot] = got; covers[got]++; bump('covers', d, got); out.covered++;
  }

  sim.process(function* clinic() {
    for (let d = 0; d < DAYS; d++) {
      for (const s of STAFF) if (sickUntil[s.id] < d && sim.random() < SICK_P) {
        let len = 1; while (sim.random() < 0.5) len++;
        sickUntil[s.id] = d + len - 1;
      }
      const ring = d * DAY + SHIFT - sim.uniform(30, 150);
      yield sim.timeout(ring - sim.now);
      for (const role of ['N', 'A']) for (const p of [...duty[d][role]]) if (p && sickUntil[p] >= d) sim.process(sickCall, d, role, p);
      yield sim.timeout((d + 1) * DAY - sim.now);
    }
  });
  sim.run();
  return { ...out, covers, asks };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`${YEARS} seeded years per rule (seeds ${SEED0}..${SEED0 + YEARS - 1}); 4 nurses + 4 aides, two of each a day, 4-on/4-off.\n`);
  console.log('rule          calls  uncov%  unlawful/yr   covers/yr N0..N3 | A0..A3          asked/yr N0..N3 | A0..A3');
  for (const name of Object.keys(RULES)) {
    const ys = Array.from({ length: YEARS }, (_, i) => year(name, SEED0 + i));
    const m = (f) => sum(ys.map(f)) / YEARS, f1 = (x) => x.toFixed(1).padStart(5);
    const cv = STAFF.map(s => f1(m(y => y.covers[s.id]))), ak = STAFF.map(s => f1(m(y => y.asks[s.id])));
    console.log(`${name.padEnd(13)} ${f1(m(y => y.calls))}  ${(100 * m(y => y.uncovered) / m(y => y.calls)).toFixed(1).padStart(5)}  ${m(y => y.unlawful).toFixed(2).padStart(11)}   ${cv.slice(0, 4).join('')} |${cv.slice(4).join('')}    ${ak.slice(0, 4).join('')} |${ak.slice(4).join('')}`);
  }
}
