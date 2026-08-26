import { interval } from './solution.mjs';

const EPS = 1e-12;

function binomPmf(x, n, p) {
  if (p === 0) return x === 0 ? 1 : 0;
  if (p === 1) return x === n ? 1 : 0;
  let logP = 0;
  for (let i = 1; i <= x; i++) logP += Math.log(n - x + i) - Math.log(i);
  logP += x * Math.log(p) + (n - x) * Math.log(1 - p);
  return Math.exp(logP);
}

function coverage(n, alpha, p) {
  let cov = 0;
  for (let x = 0; x <= n; x++) {
    const r = interval(x, n, alpha);
    if (r.lower - EPS <= p && p <= r.upper + EPS) {
      cov += binomPmf(x, n, p);
    }
  }
  return cov;
}

console.log('=== check-b: exact coverage property ===\n');

console.log('--- testing n = 5, alpha = 0.05 ---');
const n5 = 5;
const alpha = 0.05;
let minCov = Infinity;
let minCovP = 0;
const testPs = [];
for (let i = 0; i <= 1000; i++) testPs.push(i / 1000);
testPs.push(0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 0.999);

for (const p of testPs) {
  const cov = coverage(n5, alpha, p);
  if (cov < minCov) { minCov = cov; minCovP = p; }
  if (cov + EPS < 1 - alpha) {
    console.log(`  FAIL: p=${p.toFixed(3)}, coverage=${cov.toFixed(6)} < ${1-alpha}`);
    process.exit(1);
  }
}
console.log(`  minimum coverage: ${minCov.toFixed(6)} at p=${minCovP.toFixed(3)} (target >= ${1-alpha})`);
console.log(`  ok: coverage >= ${1-alpha} for all tested p`);

console.log('\n--- testing n = 10, alpha = 0.05 ---');
const n10 = 10;
minCov = Infinity; minCovP = 0;
for (const p of testPs) {
  const cov = coverage(n10, alpha, p);
  if (cov < minCov) { minCov = cov; minCovP = p; }
  if (cov + EPS < 1 - alpha) {
    console.log(`  FAIL: p=${p.toFixed(3)}, coverage=${cov.toFixed(6)} < ${1-alpha}`);
    process.exit(1);
  }
}
console.log(`  minimum coverage: ${minCov.toFixed(6)} at p=${minCovP.toFixed(3)} (target >= ${1-alpha})`);
console.log(`  ok: coverage >= ${1-alpha} for all tested p`);

console.log('\n--- testing n = 20, alpha = 0.05 ---');
const n20 = 20;
minCov = Infinity; minCovP = 0;
for (const p of testPs) {
  const cov = coverage(n20, alpha, p);
  if (cov < minCov) { minCov = cov; minCovP = p; }
  if (cov + EPS < 1 - alpha) {
    console.log(`  FAIL: p=${p.toFixed(3)}, coverage=${cov.toFixed(6)} < ${1-alpha}`);
    process.exit(1);
  }
}
console.log(`  minimum coverage: ${minCov.toFixed(6)} at p=${minCovP.toFixed(3)} (target >= ${1-alpha})`);
console.log(`  ok: coverage >= ${1-alpha} for all tested p`);

console.log('\n--- testing n = 50, alpha = 0.05 ---');
const n50 = 50;
minCov = Infinity; minCovP = 0;
const coarsePs = [];
for (let i = 0; i <= 200; i++) coarsePs.push(i / 200);
for (const p of coarsePs) {
  const cov = coverage(n50, alpha, p);
  if (cov < minCov) { minCov = cov; minCovP = p; }
  if (cov + EPS < 1 - alpha) {
    console.log(`  FAIL: p=${p.toFixed(3)}, coverage=${cov.toFixed(6)} < ${1-alpha}`);
    process.exit(1);
  }
}
console.log(`  minimum coverage: ${minCov.toFixed(6)} at p=${minCovP.toFixed(3)} (target >= ${1-alpha})`);
console.log(`  ok: coverage >= ${1-alpha} for all tested p`);

console.log('\n--- testing different alpha values ---');
for (const a of [0.1, 0.05, 0.01]) {
  minCov = Infinity; minCovP = 0;
  for (const p of testPs) {
    const cov = coverage(10, a, p);
    if (cov < minCov) { minCov = cov; minCovP = p; }
    if (cov + EPS < 1 - a) {
      console.log(`  FAIL: alpha=${a}, p=${p.toFixed(3)}, coverage=${cov.toFixed(6)} < ${1-a}`);
      process.exit(1);
    }
  }
  console.log(`  alpha=${a}: min coverage=${minCov.toFixed(6)} at p=${minCovP.toFixed(3)} (target >= ${1-a})`);
}

console.log('\n--- conservative property: coverage strictly > 1-alpha for some p ---');
let foundStrict = false;
for (const p of testPs) {
  const cov = coverage(10, 0.05, p);
  if (cov > 0.95 + 1e-6) { foundStrict = true; break; }
}
console.log(`  found strictly conservative coverage: ${foundStrict ? 'yes' : 'no (may be exact at some p)'}`);

console.log('\n=== ALL CHECK-B TESTS PASSED ===');