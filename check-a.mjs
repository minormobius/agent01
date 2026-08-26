import { interval } from './solution.mjs';

const EPS = 1e-10;

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok: ${msg}`);
}

function assertClose(a, b, tol = EPS, msg = '') {
  if (Math.abs(a - b) > tol) throw new Error(`FAIL: ${msg} (got ${a}, expected ${b}, diff ${Math.abs(a - b)})`);
  console.log(`  ok: ${msg} ≈ ${b}`);
}

console.log('=== check-a: estimator correctness ===\n');

console.log('--- boundary cases: x = 0 ---');
for (const n of [1, 2, 5, 10, 100]) {
  const r = interval(0, n, 0.05);
  assert(r.x === 0 && r.n === n && r.alpha === 0.05, `x=0,n=${n} returns correct metadata`);
  assert(r.point === 0, `x=0,n=${n} point = 0`);
  assert(r.lower === 0, `x=0,n=${n} lower = 0`);
  const expectedUpper = 1 - Math.pow(0.025, 1 / n);
  assertClose(r.upper, expectedUpper, 1e-12, `x=0,n=${n} upper = 1 - (0.025)^(1/n)`);
}

console.log('\n--- boundary cases: x = n ---');
for (const n of [1, 2, 5, 10, 100]) {
  const r = interval(n, n, 0.05);
  assert(r.x === n && r.n === n && r.alpha === 0.05, `x=n,n=${n} returns correct metadata`);
  assert(r.point === 1, `x=n,n=${n} point = 1`);
  assert(r.upper === 1, `x=n,n=${n} upper = 1`);
  const expectedLower = Math.pow(0.025, 1 / n);
  assertClose(r.lower, expectedLower, 1e-12, `x=n,n=${n} lower = (0.025)^(1/n)`);
}

console.log('\n--- interior cases: verify defining equations ---');
for (const [x, n, alpha] of [
  [1, 10, 0.05],
  [5, 10, 0.05],
  [3, 20, 0.1],
  [7, 50, 0.01],
  [25, 100, 0.05],
]) {
  const r = interval(x, n, alpha);
  console.log(`  x=${x}, n=${n}, alpha=${alpha}: lower=${r.lower.toFixed(6)}, upper=${r.upper.toFixed(6)}`);

  if (x > 0) {
    const fLower = (p) => {
      let sum = 0;
      let term = Math.pow(1 - p, n);
      for (let k = 0; k <= x - 1; k++) {
        sum += term;
        term *= (n - k) * p / ((k + 1) * (1 - p));
      }
      return sum - alpha / 2;
    };
    assertClose(fLower(r.lower), 0, 1e-8, `lower bound satisfies F(x-1; n, lower) = alpha/2`);
  }

  if (x < n) {
    const fUpper = (p) => {
      let sum = 0;
      let term = Math.pow(1 - p, n);
      for (let k = 0; k <= x; k++) {
        sum += term;
        term *= (n - k) * p / ((k + 1) * (1 - p));
      }
      return sum - (1 - alpha / 2);
    };
    assertClose(fUpper(r.upper), 0, 1e-8, `upper bound satisfies F(x; n, upper) = 1 - alpha/2`);
  }
}

console.log('\n--- symmetry: interval(x, n) vs interval(n-x, n) ---');
for (const [x, n, alpha] of [
  [2, 10, 0.05],
  [3, 20, 0.1],
  [12, 50, 0.01],
]) {
  const r1 = interval(x, n, alpha);
  const r2 = interval(n - x, n, alpha);
  assertClose(r1.lower, 1 - r2.upper, 1e-10, `lower(x) = 1 - upper(n-x)`);
  assertClose(r1.upper, 1 - r2.lower, 1e-10, `upper(x) = 1 - lower(n-x)`);
}

console.log('\n--- alpha symmetry: interval(x, n, alpha) width increases as alpha decreases ---');
const r005 = interval(5, 20, 0.05);
const r001 = interval(5, 20, 0.01);
assert(r001.lower < r005.lower, 'smaller alpha gives wider interval (lower)');
assert(r001.upper > r005.upper, 'smaller alpha gives wider interval (upper)');

console.log('\n--- return value structure ---');
const r = interval(3, 10, 0.05);
assert(typeof r.lower === 'number', 'lower is number');
assert(typeof r.upper === 'number', 'upper is number');
assert(typeof r.point === 'number', 'point is number');
assert(typeof r.x === 'number', 'x is number');
assert(typeof r.n === 'number', 'n is number');
assert(typeof r.alpha === 'number', 'alpha is number');
assert(Object.keys(r).length === 6, 'exactly 6 keys');

console.log('\n--- error handling ---');
try { interval(-1, 10); assert(false, 'should throw for x < 0'); } catch (e) { assert(e.message.includes('x must be in'), 'throws for x < 0'); }
try { interval(11, 10); assert(false, 'should throw for x > n'); } catch (e) { assert(e.message.includes('x must be in'), 'throws for x > n'); }
try { interval(5, 0); assert(false, 'should throw for n <= 0'); } catch (e) { assert(e.message.includes('n must be positive'), 'throws for n <= 0'); }
try { interval(5, 10, 0); assert(false, 'should throw for alpha <= 0'); } catch (e) { assert(e.message.includes('alpha must be in'), 'throws for alpha <= 0'); }
try { interval(5, 10, 1); assert(false, 'should throw for alpha >= 1'); } catch (e) { assert(e.message.includes('alpha must be in'), 'throws for alpha >= 1'); }

console.log('\n=== ALL CHECK-A TESTS PASSED ===');