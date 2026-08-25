/* tb-001 · check A — known answers.

   Effort A's acceptance test. The first version of this file graded the
   solution against a table of published values recalled from memory, and
   one entry was wrong: it asserted 0.2027 for the upper limit of 3/40,
   which would have failed a correct implementation. That is exactly the
   unsound assertion WP4 calls u, and a check that certifies the wrong
   answer is worse than no check.

   So the primary assertions here are the DEFINING EQUATIONS rather than
   any table. The Clopper-Pearson limits are defined by

       P(X <= x | p_upper) = alpha/2      P(X >= x | p_lower) = alpha/2

   and this file evaluates those with its own exact-integer binomial,
   which shares no code with the solution it grades. The table survives
   as a cross-check, with the bad entry corrected to the value the
   defining equation gives.

   Usage: node check-a.mjs [path-to-solution]   (default: ./reference.mjs) */
const path = process.argv[2] ?? './reference.mjs';
const { interval } = await import(new URL(path, import.meta.url).href);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  x ${m}`); } };
const near = (a, b, t, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= t, `${m} (got ${a}, want ${b}+-${t})`);

/* An independent binomial: exact integer coefficients via BigInt, so this
   check borrows nothing from the module under test. */
function choose(n, k) {
  let r = 1n;
  for (let i = 0n; i < BigInt(k); i++) r = (r * BigInt(n - Number(i))) / (i + 1n);
  return Number(r);
}
const pmf = (k, n, p) => choose(n, k) * p ** k * (1 - p) ** (n - k);
const lowTail = (p, x, n) => { let s = 0; for (let k = 0; k <= x; k++) s += pmf(k, n, p); return s; };
const upTail = (p, x, n) => { let s = 0; for (let k = x; k <= n; k++) s += pmf(k, n, p); return s; };

// ── the definition itself ──────────────────────────────────────────────
for (const [x, n] of [[1, 10], [3, 10], [5, 10], [9, 10], [2, 20], [10, 20], [3, 40], [17, 40]]) {
  const i = interval(x, n);
  if (x < n) near(lowTail(i.upper, x, n), 0.025, 1e-4, `${x}/${n}: P(X<=x | upper) is alpha/2`);
  if (x > 0) near(upTail(i.lower, x, n), 0.025, 1e-4, `${x}/${n}: P(X>=x | lower) is alpha/2`);
}
for (const [x, n, alpha] of [[4, 25, 0.10], [4, 25, 0.01]]) {
  const i = interval(x, n, alpha);
  near(lowTail(i.upper, x, n), alpha / 2, 1e-4, `${x}/${n} at alpha ${alpha}: upper satisfies the definition`);
  near(upTail(i.lower, x, n), alpha / 2, 1e-4, `${x}/${n} at alpha ${alpha}: lower satisfies the definition`);
}

// ── the two corners, in closed form, no special functions ──────────────
for (const n of [5, 10, 40]) {
  const a = 0.05 / 2;
  near(interval(0, n).upper, 1 - a ** (1 / n), 1e-6, `x=0 n=${n}: upper is 1-(alpha/2)^(1/n)`);
  ok(interval(0, n).lower === 0, `x=0 n=${n}: lower is exactly 0`);
  near(interval(n, n).lower, a ** (1 / n), 1e-6, `x=n n=${n}: lower is (alpha/2)^(1/n)`);
  ok(interval(n, n).upper === 1, `x=n n=${n}: upper is exactly 1`);
}

// ── the table, cross-checked, with the corrected 3/40 entry ────────────
const TABLE = [
  [1, 10, 0.0025, 0.4450], [5, 10, 0.1871, 0.8129], [9, 10, 0.5550, 0.9975],
  [2, 20, 0.0123, 0.3170], [10, 20, 0.2720, 0.7280], [3, 40, 0.0157, 0.2039],
];
for (const [x, n, lo, hi] of TABLE) {
  const i = interval(x, n);
  near(i.lower, lo, 5e-4, `${x}/${n}: lower against the table`);
  near(i.upper, hi, 5e-4, `${x}/${n}: upper against the table`);
}

// ── symmetry, ordering, containment ────────────────────────────────────
for (const [x, n] of [[3, 10], [7, 20], [1, 15]]) {
  const i = interval(x, n), j = interval(n - x, n);
  near(i.lower, 1 - j.upper, 1e-6, `${x}/${n}: lower mirrors the upper of ${n - x}/${n}`);
  near(i.upper, 1 - j.lower, 1e-6, `${x}/${n}: upper mirrors the lower of ${n - x}/${n}`);
}
for (const n of [7, 25]) {
  for (let x = 0; x <= n; x++) {
    const i = interval(x, n);
    ok(i.lower <= x / n + 1e-12 && x / n <= i.upper + 1e-12, `${x}/${n}: contains the point estimate`);
    ok(i.lower <= i.upper, `${x}/${n}: ordered`);
  }
}
for (const [x, n] of [[3, 20], [10, 30]]) {
  const wide = interval(x, n, 0.01), narrow = interval(x, n, 0.10);
  ok(wide.lower < narrow.lower && wide.upper > narrow.upper, `${x}/${n}: alpha 0.01 is wider than 0.10`);
}

// ── malformed arguments are refused rather than answered ───────────────
let threw = 0;
for (const bad of [[-1, 10], [11, 10], [1.5, 10], [1, 0], [1, 2.5]]) {
  try { interval(bad[0], bad[1]); } catch { threw++; }
}
try { interval(1, 10, 0); } catch { threw++; }
try { interval(1, 10, 1); } catch { threw++; }
ok(threw === 7, `every malformed argument is refused (${threw} of 7)`);

console.log(`${fail === 0 ? 'PASS' : 'FAIL'} check-a — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
