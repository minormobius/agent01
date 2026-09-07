/* tb-001 · check B — the coverage property.

   Effort B's acceptance test, and it grades a property rather than a
   value. An interval procedure is correct when it covers the true rate
   at least (1 - alpha) of the time, whatever that rate is. For the
   binomial that is checkable EXACTLY, by summing over every outcome
   rather than simulating:

       coverage(p) = SUM over x of  [ lower(x) <= p <= upper(x) ] * pmf(x)

   Clopper-Pearson is conservative, so coverage should sit at or above
   the nominal level everywhere and be strictly above it almost
   everywhere. Both halves matter: an interval that is always [0, 1]
   would pass the first and fail the second.

   This check shares no code with the module it grades.

   Usage: node check-b.mjs [path-to-solution]   (default: ./reference.mjs) */
const path = process.argv[2] ?? './reference.mjs';
const { interval } = await import(new URL(path, import.meta.url).href);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  x ${m}`); } };

function choose(n, k) {
  let r = 1n;
  for (let i = 0n; i < BigInt(k); i++) r = (r * BigInt(n - Number(i))) / (i + 1n);
  return Number(r);
}
const pmf = (k, n, p) => (p === 0 ? (k === 0 ? 1 : 0) : p === 1 ? (k === n ? 1 : 0)
  : choose(n, k) * p ** k * (1 - p) ** (n - k));

/* The intervals depend on (x, n, alpha) and not on p, so computing them
   inside the p sweep recomputed each one two hundred times. Cached per
   (n, alpha), which is a property of the check rather than of the
   solution and so changes no verdict. */
const cache = new Map();
function limits(n, alpha) {
  const key = `${n}:${alpha}`;
  if (!cache.has(key)) {
    const rows = [];
    for (let x = 0; x <= n; x++) rows.push(interval(x, n, alpha));
    cache.set(key, rows);
  }
  return cache.get(key);
}

function coverage(p, n, alpha) {
  let c = 0;
  for (const i of limits(n, alpha)) {
    if (!Number.isFinite(i.lower) || !Number.isFinite(i.upper)) return NaN;
    if (p >= i.lower && p <= i.upper) c += pmf(i.x, n, p);
  }
  return c;
}

// ── nominal coverage is never undershot ────────────────────────────────
for (const [n, alpha] of [[5, 0.05], [10, 0.05], [20, 0.05], [10, 0.10], [15, 0.01]]) {
  let worst = 2, worstAt = null, checked = 0;
  for (let p = 0.005; p < 1; p += 0.005) {
    const c = coverage(p, n, alpha);
    checked++;
    if (!(c >= 0)) { worst = NaN; worstAt = p; break; }
    if (c < worst) { worst = c; worstAt = p; }
  }
  ok(checked > 190, `n=${n} alpha=${alpha}: the grid is fine enough to mean something`);
  ok(Number.isFinite(worst) && worst >= 1 - alpha - 1e-9,
    `n=${n} alpha=${alpha}: worst coverage ${Number.isFinite(worst) ? worst.toFixed(4) : worst} at p=${worstAt} is at or above ${1 - alpha}`);
}

// ── and the interval is not trivially wide ─────────────────────────────
for (const [n, alpha] of [[10, 0.05], [20, 0.05]]) {
  let above = 0, total = 0;
  for (let p = 0.05; p < 1; p += 0.01) {
    total++;
    if (coverage(p, n, alpha) > 1 - alpha + 0.001) above++;
  }
  ok(above / total > 0.9, `n=${n}: conservative almost everywhere (${above}/${total})`);
  // a procedure returning [0,1] everywhere would pass coverage and fail this
  const widths = [];
  for (let x = 0; x <= n; x++) { const i = interval(x, n, alpha); widths.push(i.upper - i.lower); }
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  ok(mean < 0.75, `n=${n}: mean width ${mean.toFixed(3)} is under 0.75, so it is not the trivial interval`);
  ok(Math.min(...widths) > 0, `n=${n}: no interval is a point`);
}

// ── width shrinks as n grows, at a fixed rate ──────────────────────────
{
  const w = [10, 20, 40, 80].map((n) => {
    const i = interval(Math.round(0.3 * n), n, 0.05);
    return i.upper - i.lower;
  });
  ok(w.every((x, i) => i === 0 || x < w[i - 1]), `width falls with n (${w.map((x) => x.toFixed(3)).join(' > ')})`);
  ok(w[3] < w[0] / 2, 'and roughly halves over an eightfold increase in n');
}

// ── the corners cover too, which is where naive procedures fail ────────
for (const n of [5, 10, 30]) {
  const lo = coverage(1e-6, n, 0.05);
  const hi = coverage(1 - 1e-6, n, 0.05);
  ok(lo >= 0.95, `n=${n}: covers a rate near 0 (${lo.toFixed(4)})`);
  ok(hi >= 0.95, `n=${n}: covers a rate near 1 (${hi.toFixed(4)})`);
}

console.log(`${fail === 0 ? 'PASS' : 'FAIL'} check-b — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
