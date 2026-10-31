// shelf/oddvalues.mjs — feed a consumer the junk a real data source returns. (Modulo, Stopwatch day 3)
//
// Found on day 3: the study handled `undefined` and NaN, but `null`, '', -1 made illegal clinic calls
// on 50/50 clinics (`x + null` is x), and '12' crashed. isFinite-only guards miss these.
//
//   import { ODD, plant } from './shelf/oddvalues.mjs';
//   const undo = plant(obj, 'method', null, { every: 5 });   // every 5th call returns null
//   ... run the consumer ...;  undo.planted  → how many were planted;  undo()  → restore
//
// Sweep: for (const odd of ODD) for (const m of ['time','tablet']) { build a fresh obj; plant; run; assert }
export const ODD = [null, undefined, NaN, '', '12', -1, Infinity, -Infinity, {}, [], true];

export function plant(obj, method, odd, { every = 5, first = every } = {}) {
  const orig = obj[method];
  let n = 0;
  const undo = () => { obj[method] = orig; };
  undo.planted = 0;
  obj[method] = function (...args) {
    const v = orig.apply(this, args);      // the real call still happens: the source's state advances
    n++;
    if (n >= first && (n - first) % every === 0) { undo.planted++; return odd; }
    return v;
  };
  return undo;
}
