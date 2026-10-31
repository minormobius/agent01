import { fnv32, weekOf } from './mod.mjs';
let bad = 0;
const eq = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); };
eq('fnv32 of empty', fnv32(''), 2166136261);
eq('fnv32 of a', fnv32('a'), 0xe40c292c);
eq('week 1 starts on the start date', weekOf('2026-07-06', '2026-07-06'), 1);
eq('day 7 is week 2', weekOf('2026-07-13', '2026-07-06'), 2);
process.exit(bad ? 1 : 0);
