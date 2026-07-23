/* Selftest for reality.js — the screener must correctly classify known cases.
     node conjectures/reality.selftest.mjs
   This is the credibility anchor: if the screener can't refute 5n+1 or spot that
   n²−1 factors, "real mode" is a lie. Exits non-zero on any failure. */
import './reality.js';
import './engine.js';
const M = globalThis.CONJMATH;
const G = globalThis.CONJGEN;

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fails++; } };
const status = (chk) => M.screen({ check: chk }).status;

// ── math primitives ──
ok(M.isPrime(97) && !M.isPrime(91) && M.isPrime(1000003), 'isPrime');
ok(M.largestPrimeFactor(84) === 7, 'largestPrimeFactor(84)=7');
ok(M.numDivisors(12) === 6 && M.sigma(6) === 12 && M.phi(10) === 4, 'divisor functions');
ok(M.digitSum(1234) === 10 && M.reverseDigits(1230) === 321, 'digit functions');
ok(M.isSquare(144) && !M.isSquare(145) && M.isSquarefree(30) && !M.isSquarefree(12), 'square/squarefree');

// ── prime-form classification (rigorous) ──
ok(status({ kind: 'prime-form', coeffs: [1, 0, 1] }) === 'candidate', 'n²+1 → candidate (Bunyakovsky-admissible)');
ok(status({ kind: 'prime-form', coeffs: [41, 1, 1] }) === 'candidate', 'n²+n+41 → candidate');
ok(status({ kind: 'prime-form', coeffs: [-1, 0, 1] }) === 'trivial-false', 'n²−1 factors → trivial-false');
ok(status({ kind: 'prime-form', coeffs: [0, 2] }) === 'trivial-false', '2n has content 2 → trivial-false');
ok(status({ kind: 'prime-form', coeffs: [2, 1, 1] }) === 'trivial-false', 'n²+n+2 has fixed divisor 2 → trivial-false');
ok(status({ kind: 'prime-form', coeffs: [1, 1] }) === 'trivial-true', 'n+1 → Dirichlet trivial-true');
ok(status({ kind: 'prime-form', coeffs: [3, 6] }) === 'trivial-false', '6n+3 divisible by 3 → trivial-false');

// ── ∀-integer screening (empirical refutation) ──
ok(status({ kind: 'forall-int', from: 2, budget: 5000, predicate: () => true }) === 'candidate', 'always-true predicate → candidate');
ok(status({ kind: 'forall-int', from: 2, budget: 5000, predicate: (n) => n < 100 }) === 'refuted', 'predicate that fails at n=100 → refuted');
{
  const v = M.screen({ check: { kind: 'forall-int', from: 2, budget: 5000, predicate: (n) => n !== 4242 } });
  ok(v.status === 'refuted' && v.witness === 4242, 'refutation reports the witness');
}
ok(status({ kind: 'forall-int', collapse: { status: 'trivial-true', reason: 'x' }, predicate: () => false }) === 'trivial-true', 'collapse short-circuits the search');

// ── iteration screening (dynamics) ──
const collatz = (n) => (n % 2 === 0 ? n / 2 : 3 * n + 1);
const fiveN1 = (n) => (n % 2 === 0 ? n / 2 : 5 * n + 1);
ok(status({ kind: 'iteration', step: collatz, budget: 4000, stepCap: 3000, ceil: 1e12 }) === 'candidate', '3n+1 → candidate (survives)');
ok(status({ kind: 'iteration', step: fiveN1, budget: 4000, stepCap: 3000, ceil: 1e12 }) === 'refuted', '5n+1 → refuted (diverges)');

// ── engine integration: generated checkable conjectures screen to valid verdicts ──
const VALID = new Set(['refuted', 'trivial-false', 'trivial-true', 'candidate', 'known', 'unverifiable']);
let kept = 0, seenStatus = new Set();
for (let i = 0; i < 800; i++) {
  const c = G.generateConjecture('r' + i, { checkableOnly: true });
  ok(c.check, `checkable conjecture has a check spec @${i}`);
  const a = JSON.stringify(M.screen(c)); const b = JSON.stringify(M.screen(G.generateConjecture('r' + i, { checkableOnly: true })));
  ok(a === b, `screening deterministic @${i}`);
  const v = M.screen(c);
  ok(VALID.has(v.status), `valid status "${v.status}" @${i}`);
  seenStatus.add(v.status);
  if (v.status === 'candidate') kept++;
}
ok(seenStatus.has('refuted'), 'the machine refutes some generated conjectures');
ok(seenStatus.has('candidate'), 'the machine keeps some generated conjectures');
ok(seenStatus.has('trivial-false') || seenStatus.has('trivial-true'), 'the machine flags some as trivial');
ok(kept > 0 && kept < 800, `real mode filters (kept ${kept}/800)`);

console.log(fails === 0
  ? `OK — reality screener passes. statuses seen: ${[...seenStatus].join(', ')}; survivors ${kept}/800`
  : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
