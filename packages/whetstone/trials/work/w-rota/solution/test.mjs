import { makeRota } from './lib/assign.mjs';
import { days, isWeekend } from './lib/calendar.mjs';
let bad = 0;
const ok = (name, cond) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
const team = [
  { name: 'Ana', role: 'nurse', fte: 1, leave: new Set() },
  { name: 'Bea', role: 'aide', fte: 1, leave: new Set(['2026-11-03']) },
  { name: 'Cy', role: 'nurse', fte: 1, leave: new Set() },
];
ok('seven days', days('2026-11-02', 7).length === 7);
ok('Saturday is a weekend', isWeekend('2026-11-07') && !isWeekend('2026-11-06'));
const r = makeRota(team, '2026-11-02', 7);
ok('two people a day', Object.values(r).every((d) => d.length === 2 && new Set(d).size === 2));
ok('a nurse every day', Object.values(r).every((d) => d.some((n) => team.find((p) => p.name === n).role === 'nurse')));
ok('leave is honoured', !r['2026-11-03'].includes('Bea'));
process.exit(bad ? 1 : 0);
