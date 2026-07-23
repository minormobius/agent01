/* ─────────────────────────────────────────────────────────────────────
   reality.js — the screener that "makes it real".

   The generator (engine.js) produces synthetic conjectures that carry an
   EXECUTABLE spec (`conj.check`). This module actually runs / analyses that
   spec and returns a verdict, so the machine can DISCARD the false and trivial
   and surface only survivors:

     refuted       — a brute-force search found a counterexample (it is false)
     trivial-false — provably false by structure (reducible form, fixed divisor…)
     trivial-true  — provably true by structure (Dirichlet, type collapse…)
     known         — matches a real open problem already in the index
     candidate     — survived: well-posed, non-trivial, no counterexample found

   Pure + deterministic (fixed budgets). Attaches to globalThis so engine.js and
   the node selftests can use it. No Date.now()/Math.random().

   Honesty: a "candidate" is NOT proven open. It means "survived this screen".
   The prime-form path is rigorous about triviality (Bunyakovsky conditions);
   the ∀-integer and iteration paths are empirical (unrefuted up to a bound).
   ───────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  // ── integer helpers ──────────────────────────────────────────────────
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
  function isSquare(n) { if (n < 0) return false; const r = Math.round(Math.sqrt(n)); for (let d = -1; d <= 1; d++) if ((r + d) * (r + d) === n) return true; return false; }
  function isPowerOfTwo(n) { if (n < 1 || !Number.isInteger(n)) return false; while (n % 2 === 0) n /= 2; return n === 1; }
  function digitSum(n) { n = Math.abs(n); let s = 0; while (n) { s += n % 10; n = Math.floor(n / 10); } return s; }
  function digitProduct(n) { n = Math.abs(n); let p = 1; if (n === 0) return 0; while (n) { p *= n % 10; n = Math.floor(n / 10); } return p; }
  function reverseDigits(n) { n = Math.abs(n); let r = 0; while (n) { r = r * 10 + n % 10; n = Math.floor(n / 10); } return r; }
  function factorMap(n) { n = Math.abs(n); const f = {}; for (let p = 2; p * p <= n; p++) { while (n % p === 0) { f[p] = (f[p] || 0) + 1; n /= p; } } if (n > 1) f[n] = (f[n] || 0) + 1; return f; }
  function numDivisors(n) { if (n <= 1) return n === 1 ? 1 : 0; const f = factorMap(n); let d = 1; for (const p in f) d *= f[p] + 1; return d; }
  function sigma(n) { if (n < 1) return 0; const f = factorMap(n); let s = 1; for (const p in f) { const pp = +p; s *= (Math.pow(pp, f[p] + 1) - 1) / (pp - 1); } return Math.round(s); }
  function phi(n) { if (n < 1) return 0; const f = factorMap(n); let r = n; for (const p in f) r -= r / p; return Math.round(r); }
  function omega(n) { return Object.keys(factorMap(n)).length; }
  function radical(n) { let r = 1; for (const p in factorMap(n)) r *= +p; return r; }
  function largestPrimeFactor(n) { const ks = Object.keys(factorMap(n)); return ks.length ? Math.max(...ks.map(Number)) : (n === 1 ? 1 : n); }
  function isSquarefree(n) { if (n < 1) return false; const f = factorMap(n); for (const p in f) if (f[p] > 1) return false; return true; }

  // ── Miller–Rabin (BigInt), deterministic for our ranges ───────────────
  function modpow(b, e, m) { b %= m; let r = 1n; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
  const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  function isPrimeBig(n) {
    if (n < 2n) return false;
    for (const p of MR_BASES) { if (n % p === 0n) return n === p; }
    let d = n - 1n, r = 0n; while (d % 2n === 0n) { d /= 2n; r++; }
    for (const a of MR_BASES) {
      let x = modpow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      let ok = false;
      for (let i = 0n; i < r - 1n; i++) { x = x * x % n; if (x === n - 1n) { ok = true; break; } }
      if (!ok) return false;
    }
    return true;
  }
  function isPrime(n) { if (!Number.isFinite(n) || n < 2 || !Number.isInteger(n)) return false; return isPrimeBig(BigInt(n)); }

  // ── polynomial helpers (coeffs = [c0, c1, c2, …], low→high) ───────────
  function evalPolyBig(coeffs, x) { const X = BigInt(x); let v = 0n; for (let i = coeffs.length - 1; i >= 0; i--) v = v * X + BigInt(coeffs[i]); return v; }
  function polyDeg(coeffs) { let d = coeffs.length - 1; while (d > 0 && coeffs[d] === 0) d--; return d; }
  function polyString(coeffs) {
    const parts = [];
    for (let i = polyDeg(coeffs); i >= 0; i--) {
      const a = coeffs[i]; if (a === 0) continue;
      const mag = Math.abs(a);
      const term = i === 0 ? `${mag}` : (mag === 1 ? '' : `${mag}`) + (i === 1 ? 'n' : `n^${i}`);
      parts.push((parts.length ? (a < 0 ? ' − ' : ' + ') : (a < 0 ? '−' : '')) + term);
    }
    return parts.join('') || '0';
  }
  function divisors(n) { n = Math.abs(n); const d = []; for (let i = 1; i * i <= n; i++) if (n % i === 0) { d.push(i); if (i !== n / i) d.push(n / i); } return d; }
  // rational root over ℚ (⟺ reducibility for deg 2 and 3). returns {p,q} or null.
  function rationalRoot(coeffs) {
    const deg = polyDeg(coeffs);
    const c0 = coeffs[0], an = coeffs[deg];
    if (c0 === 0) return { p: 0, q: 1 };
    for (const p of divisors(c0)) for (const q of divisors(an)) for (const s of [1, -1]) {
      // evaluate coeffs at s*p/q, cleared of denominators: Σ a_i (sp)^i q^(deg-i)
      let v = 0n; const P = BigInt(s * p), Q = BigInt(q);
      for (let i = 0; i <= deg; i++) v += BigInt(coeffs[i]) * (P ** BigInt(i)) * (Q ** BigInt(deg - i));
      if (v === 0n) return { p: s * p, q };
    }
    return null;
  }
  // a prime dividing f(n) for every n (Bunyakovsky fixed divisor). returns p or null.
  function fixedPrimeDivisor(coeffs) {
    for (const p of [2, 3, 5, 7, 11, 13]) {
      let all = true;
      for (let r = 0; r < p; r++) { if (Number(evalPolyBig(coeffs, r) % BigInt(p)) !== 0) { all = false; break; } }
      if (all) return p;
    }
    return null;
  }

  // ── the "does this value-type have this property" collapse table ──────
  // funcType ∈ {generic, prime, squarefree}; propKey ∈ {square, pow2, squarefree, prime}
  function propCollapse(funcType, propKey) {
    const ALWAYS = { squarefree: { prime: true, squarefree: true }, prime: { prime: true } };
    const NEVER = { square: { prime: true, squarefree: true } };
    if (ALWAYS[propKey] && ALWAYS[propKey][funcType]) return 'always';
    if (NEVER[propKey] && NEVER[propKey][funcType]) return 'never';
    return null;
  }

  // ── library shared with engine.js: functions + properties w/ prose ────
  const FUNCS = [
    { sym: 's(n)', prose: 'the digit sum', fn: digitSum, type: 'generic' },
    { sym: 'd(n)', prose: 'the number of divisors', fn: numDivisors, type: 'generic' },
    { sym: 'σ(n)', prose: 'the sum of divisors', fn: sigma, type: 'generic' },
    { sym: 'φ(n)', prose: "Euler's totient", fn: phi, type: 'generic' },
    { sym: 'P(n)', prose: 'the largest prime factor', fn: largestPrimeFactor, type: 'prime' },
    { sym: 'ω(n)', prose: 'the number of distinct prime factors', fn: omega, type: 'generic' },
    { sym: 'rad(n)', prose: 'the radical', fn: radical, type: 'squarefree' },
    { sym: 'rev(n)', prose: 'the digit reversal', fn: reverseDigits, type: 'generic' },
  ];
  const PROPS = [
    { key: 'square', prose: 'a perfect square', test: isSquare },
    { key: 'pow2', prose: 'a power of two', test: isPowerOfTwo },
    { key: 'squarefree', prose: 'squarefree', test: isSquarefree },
    { key: 'prime', prose: 'prime', test: isPrime },
  ];

  // ── screeners ─────────────────────────────────────────────────────────
  function screenPrimeForm(chk) {
    const coeffs = chk.coeffs, deg = polyDeg(coeffs), ps = polyString(coeffs);
    const content = coeffs.reduce((g, c) => gcd(g, c), 0);
    if (content > 1) return verdict('trivial-false', `the form has a fixed common factor ${content}, so ${ps} is a multiple of ${content} for every n — composite (apart from finitely many).`);
    if (deg <= 1) {
      const a = coeffs[1] || 0, b = coeffs[0];
      const g = gcd(a, b);
      if (g > 1) return verdict('trivial-false', `${ps} is always divisible by ${g}.`);
      return verdict('trivial-true', `a linear form with coprime coefficients — Dirichlet's theorem already guarantees infinitely many primes ${ps}.`);
    }
    const rr = rationalRoot(coeffs);
    if (rr) return verdict('trivial-false', `${ps} factors (root ${rr.q === 1 ? rr.p : rr.p + '/' + rr.q}), so it is composite for all large n — only finitely many primes.`);
    const fd = fixedPrimeDivisor(coeffs);
    if (fd) return verdict('trivial-false', `${fd} divides ${ps} for every n (a Bunyakovsky fixed divisor), so it is almost always composite.`);
    // survivor: count primes among first values as evidence it isn't vacuous
    let hits = 0; const ex = [];
    for (let n = 1; n <= 300 && hits < 6; n++) { const v = evalPolyBig(coeffs, n); if (isPrimeBig(v < 0n ? -v : v)) { hits++; ex.push(`${ps.replace(/n/g, '·' + n).replace(/·/g, '')}=${v}`); } }
    return verdict('candidate',
      `${ps} is irreducible of degree ${deg} with no fixed prime divisor — it satisfies the Bunyakovsky admissibility conditions, so whether it takes infinitely many prime values is genuinely open.`,
      { checkedTo: '300 seeds', primeExamples: ex, admissible: true, strength: 'rigorous', open: true });
  }

  function screenForallInt(chk) {
    if (chk.collapse) return verdict(chk.collapse.status, chk.collapse.reason);
    const from = chk.from || 2, budget = chk.budget || 20000;
    for (let n = from; n < from + budget; n++) {
      if (!chk.predicate(n)) return verdict('refuted', `a search found a counterexample at n = ${n}${chk.describe ? ' — ' + chk.describe(n) : ''}.`, { witness: n });
    }
    return verdict('candidate', `no counterexample among n = ${from}…${from + budget - 1} — it survives an exhaustive search to ${from + budget - 1}, but a search can't tell "genuinely open" from "true for an easy reason".`, { checkedTo: from + budget - 1, strength: 'empirical', open: false });
  }

  function screenIteration(chk) {
    const budget = chk.budget || 4000, stepCap = chk.stepCap || 3000, ceil = chk.ceil || 1e12;
    for (let start = 1; start <= budget; start++) {
      let n = start, steps = 0; const seen = new Set();
      while (steps < stepCap) {
        if (n === 1) break;
        if (n > ceil) return verdict('refuted', `the orbit of ${start} exceeds ${ceil.toExponential(0)} without returning — it appears to diverge.`, { witness: start });
        if (seen.has(n)) return verdict('refuted', `the orbit of ${start} falls into a cycle that never reaches 1 (revisits ${n}).`, { witness: start });
        seen.add(n);
        n = chk.step(n);
        if (!Number.isFinite(n) || n < 1) return verdict('trivial-false', `the map leaves the positive integers (at start ${start}).`);
        steps++;
      }
    }
    return verdict('candidate', `every start from 1 to ${budget} reaches 1 within ${stepCap} steps — a Collatz-class survivor with no visible reason to be true or false.`, { checkedTo: budget, strength: 'dynamical', open: true });
  }

  function verdict(status, reason, extra) {
    return Object.assign({ status, reason, kept: status === 'candidate' }, extra || {});
  }

  function screen(conj) {
    const chk = conj.check;
    if (!chk) return verdict('unverifiable', 'this domain has no in-browser checker; treat it as a dream, not a candidate.');
    if (chk.kind === 'prime-form') return screenPrimeForm(chk);
    if (chk.kind === 'forall-int') return screenForallInt(chk);
    if (chk.kind === 'iteration') return screenIteration(chk);
    return verdict('unverifiable', 'unknown checker kind.');
  }

  // match a survivor against the curated index (best-effort structural hints)
  function knownMatch(conj) {
    const chk = conj.check;
    if (!chk) return null;
    if (chk.kind === 'prime-form') {
      const c = chk.coeffs;
      if (polyDeg(c) === 2 && c[2] === 1 && c[1] === 0 && c[0] === 1) return { id: 'landau-primes-n-squared-plus-one', name: "Landau's n²+1 problem" };
    }
    if (chk.kind === 'iteration') {
      // probe for the classic 3n+1 map (n/2 on evens, 3n+1 on odds)
      try {
        if (chk.step(1) === 4 && chk.step(2) === 1 && chk.step(3) === 10 && chk.step(4) === 2 && chk.step(5) === 16)
          return { id: 'collatz', name: 'the Collatz conjecture' };
      } catch { /* non-arithmetic step */ }
    }
    return null;
  }

  root.CONJMATH = {
    // math
    gcd, isPrime, isSquare, isPowerOfTwo, isSquarefree, digitSum, digitProduct, reverseDigits,
    numDivisors, sigma, phi, omega, radical, largestPrimeFactor, factorMap,
    // poly
    evalPolyBig, polyDeg, polyString, rationalRoot, fixedPrimeDivisor, propCollapse,
    // library
    FUNCS, PROPS,
    // screening
    screen, knownMatch,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
