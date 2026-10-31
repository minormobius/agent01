import { mean, linfit } from './lib/stats.mjs';
import { deltas } from './lib/reduce.mjs';
let bad = 0;
const near = (name, got, want, tol = 1e-9) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${got}, want ${want}`}`);
};
near('mean', mean([1, 2, 3, 6]), 3);
const f = linfit([0, 1, 2], [1, 3, 5]);
near('linfit slope', f.b, 2);
near('linfit intercept', f.a, 1);
const cyc = [{ t: 0, kind: 'std', a: 100, b: 50 }, { t: 10, kind: 'std', a: 100, b: 50 }, { t: 5, kind: 'sample', a: 100, b: 50.05 }];
near('delta against a flat standard', deltas(cyc)[0], 1);
process.exit(bad ? 1 : 0);
