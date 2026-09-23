#!/usr/bin/env node
// cf.selftest.mjs — the wasm engine, checked from node against the published
// continued fractions. The Rust side has its own known-answer tests
// (engine/src/tests.rs); this one guards the seam the browser actually uses:
// the constants table in numbers.js, the ABI, and the .wasm committed here.
//
//   node henderhead/cf/cf.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromBytes } from './engine.js';
import { CONSTANTS, resolve, evaluate } from './numbers.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ✓ ${name}`);
};

const eng = fromBytes(readFileSync(join(here, 'cffourier.wasm')));

console.log('constants table — every declared head matches the engine');
for (const c of CONSTANTS) {
  const spec = resolve(c.id);
  const e = eng.setNumber(spec, 128);
  const got = e ? e.terms.slice(0, c.head.length) : null;
  ok(`${c.label} = [${c.head.join('; ')}…]`, got && got.every((v, i) => v === c.head[i]),
     got ? `got [${got.join(', ')}]` : 'engine refused the number');
}

console.log('\nthe frequencies are the convergent denominators');
{
  const e = eng.setNumber(resolve('355/113'));
  ok('355/113 → q = 1, 7, 113', JSON.stringify(e.qs) === JSON.stringify([1, 7, 113]), JSON.stringify(e.qs));
  const phi = eng.setNumber(resolve('phi'), 20);
  ok('φ → q = the Fibonacci numbers', JSON.stringify(phi.qs.slice(0, 8)) === JSON.stringify([1, 1, 2, 3, 5, 8, 13, 21]));
  ok('φ is exact and never terminates', phi.exact && !phi.terminated);
  ok('φ is periodic with period 1', phi.period && phi.period.length === 1);
  const pi = eng.setNumber(resolve('pi'));
  ok('π is flagged as a decimal, not as exact', !pi.exact);
  ok('40 digits vouch past anything drawable', eng.trustedQ(40) > 1e15);
}

console.log('\nonly the fractional part draws');
{
  const a = eng.setNumber(resolve('22/7')).qs;
  const b = eng.setNumber(resolve('43/7')).qs; // 22/7 + 3
  ok('22/7 and 43/7 have the same frequencies', JSON.stringify(a) === JSON.stringify(b));
}

console.log('\nthe curve');
{
  eng.setNumber(resolve('22/7'));
  const { n, xy, bbox, arc } = eng.build(2, 1, { perCycle: 32, floor: 8192 });
  ok('the floor applies when the frequencies are low', n === 8192, `n = ${n}`);
  // z(0) = 1 + 1/7
  ok('z(0) = 1 + 1/7', Math.abs(xy[0] - 8 / 7) < 1e-5 && Math.abs(xy[1]) < 1e-5, `${xy[0]}, ${xy[1]}`);
  ok('bbox contains the pen', bbox[0] <= xy[0] && xy[0] <= bbox[2]);
  ok('arc length beats the unit circle', arc > 2 * Math.PI, arc.toFixed(3));

  eng.setNumber(resolve('1/1'));
  const circle = eng.build(1, 1, { perCycle: 64, floor: 16384 });
  ok('one term is the unit circle', Math.abs(circle.arc - 2 * Math.PI) < 1e-6, circle.arc.toFixed(9));

  eng.setNumber(resolve('355/113'));
  const chain = eng.chain(3, 1, 0.4);
  ok('the chain starts at the origin', chain[0] === 0 && chain[1] === 0);
  ok('the chain has k+1 points', chain.length === 2 * 4, String(chain.length / 2));
  const pen = eng.build(3, 1, { t0: 0.4, t1: 0.4 + 1e-9, perCycle: 4 }).xy;
  ok('the chain ends on the curve', Math.abs(chain[6] - pen[0]) < 1e-4 && Math.abs(chain[7] - pen[1]) < 1e-4);
}

console.log('\nthe roughness ordering the thread describes');
{
  const arcOf = (name, k) => { eng.setNumber(resolve(name), 40); return eng.build(k, 1, { perCycle: 24, cap: 1 << 22 }).arc; };
  const phi = arcOf('phi', 9), e = arcOf('e', 9), pi = arcOf('pi', 9), l = arcOf('liouville', 9);
  ok('φ is rougher than e', phi > e, `${phi.toFixed(1)} vs ${e.toFixed(1)}`);
  ok('e is rougher than π', e > pi, `${e.toFixed(1)} vs ${pi.toFixed(1)}`);
  ok('Liouville’s constant is the smoothest of the four', l < pi, `${l.toFixed(3)} vs ${pi.toFixed(3)}`);
  // a colossal partial quotient sends q_k out of sight in one step, and every
  // term after it is far too small to move the pen: the picture is finished.
  const l7 = arcOf('liouville', 7), l12 = arcOf('liouville', 12);
  ok('L’s 999999999999 finishes the picture at seven terms',
     Math.abs(l7 - l12) < 1e-3, `${l7.toFixed(6)} vs ${l12.toFixed(6)}`);
  const p7 = arcOf('phi', 7), p12 = arcOf('phi', 12);
  ok('where φ is still visibly growing at twelve', p12 - p7 > 1, `${p7.toFixed(2)} vs ${p12.toFixed(2)}`);
}

console.log('\nthe overlay');
{
  const W = 96, H = 96;
  eng.planeInit(W, H, 0, 0, 24);
  const drawn = eng.planeAdd(1, 41, 200, 1, 4096);
  ok('40 curves drawn', drawn === 40, String(drawn));
  const px = eng.planePixels(W, H);
  const lit = px.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
  ok('the plane has something on it', lit > 500, `${lit} pixels`);
  ok('and a sane maximum', eng.planeMax() >= 2 && eng.planeMax() <= 40, String(eng.planeMax()));
  eng.planeInit(W, H, 0, 0, 24);
  ok('re-init clears it', eng.planePixels(W, H).every((v) => v === 0) && eng.planeCurves() === 0);
}

console.log('\nreading what people type');
{
  ok('a fraction reduces', resolve('10/4').p === 5n && resolve('10/4').q === 2n);
  ok('√ and sqrt() agree', resolve('√2').n === resolve('sqrt(2)').n);
  ok('(1+sqrt(5))/2 takes the exact route', resolve('(1+sqrt(5))/2').kind === 'surd');
  ok('a typed decimal is called exact', /^Exact\./.test(resolve('0.125').note));
  ok('a constant is not', /certain while q/.test(resolve('pi').note));
  ok('nonsense is refused', !!resolve('banana').error);
  ok('a zero denominator is refused', !!resolve('3/0').error);
  ok('the evaluator does arithmetic', Math.abs(evaluate('pi/4') - Math.PI / 4) < 1e-12);
  ok('and refuses what it cannot parse', evaluate('2 +') === null);
}

console.log(failed ? `\nFAILED — ${failed} check(s)` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
