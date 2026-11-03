// commit.selftest.mjs — checks commit.js, the exact file the page loads.
//   node commit/commit.selftest.mjs
import { createHash, randomBytes } from 'node:crypto';
import {
  sha256, utf8, hex, commit, opens, coin, freshNonce, rng,
  SCHEMES, census, measure, toyHash, doubleOpening, expectedDoubleOpening, unmask,
} from './commit.js';

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log('FAIL', what); } };
const t0 = Date.now();

// ── SHA-256: NIST vectors, then node's own crypto on random inputs ──
const vectors = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu', 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
];
for (const [m, h] of vectors) ok(hex(sha256(utf8(m))) === h, `sha256 NIST vector "${m.slice(0, 12)}…"`);
ok(hex(sha256(utf8('a'.repeat(1000000)))) === 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0', 'sha256 one million a');
for (let i = 0; i < 300; i++) {
  const b = randomBytes(i % 200); // covers every padding boundary near 55/56/64
  ok(hex(sha256(b)) === createHash('sha256').update(b).digest('hex'), `sha256 vs node, ${b.length} bytes`);
}

// ── Real commitments ──
for (let i = 0; i < 400; i++) {
  const bit = i & 1;
  const { c, nonce } = commit(bit, freshNonce((a) => randomBytes(a.length)));
  ok(c.length === 64, 'commitment is 256 bits');
  ok(opens(c, bit, nonce), 'honest opening verifies');
  ok(!opens(c, bit ^ 1, nonce), 'the other bit, same nonce, does not');
  const bad = nonce.slice(); bad[i % 16] ^= 1 << (i % 8);
  ok(!opens(c, bit, bad), 'a one-bit nonce change does not');
}
// The same bit committed twice with fresh nonces gives unrelated commitments.
{
  const a = commit(1, freshNonce((x) => randomBytes(x.length))).c;
  const b = commit(1, freshNonce((x) => randomBytes(x.length))).c;
  ok(a !== b, 'fresh nonces give fresh commitments');
}

// ── Blum's coin: fair if either side is uniform ──
for (const bob of [0, 1]) {
  const heads = [0, 1].filter((a) => coin(a, bob) === 0).length;
  ok(heads === 1, `uniform Alice, Bob always calls ${bob}: heads is exactly 1/2`);
}
for (const alice of [0, 1]) {
  const heads = [0, 1].filter((b) => coin(alice, b) === 0).length;
  ok(heads === 1, `Alice always picks ${alice}, uniform Bob: heads is exactly 1/2`);
}

// ── Toy schemes: the census, and p ≥ 1 − δ everywhere ──
let theoremChecks = 0;
for (const key of Object.keys(SCHEMES)) {
  for (let k = 1; k <= 8; k++) {
    for (let r = 0; r <= 9; r++) {
      for (const salt of [1, 7, 2026, 99991]) {
        const s = census(key, k, r, salt);
        const tot0 = s.D0.reduce((a, b) => a + b, 0), tot1 = s.D1.reduce((a, b) => a + b, 0);
        ok(tot0 === s.N && tot1 === s.N, `${key} k=${k} r=${r}: counts sum to 2^r`);
        ok(s.delta >= 0 && s.delta <= 1 + 1e-12, `${key} k=${k} r=${r}: δ in [0,1]`);
        ok(Math.abs(s.overlap - (1 - s.delta)) < 1e-12, `${key} k=${k} r=${r}: Σmin = 1 − δ`);
        ok(s.p0 >= 1 - s.delta - 1e-12 && s.p1 >= 1 - s.delta - 1e-12, `${key} k=${k} r=${r}: p ≥ 1 − δ`);
        theoremChecks++;
        if (key === 'shift' && r >= k) ok(s.delta === 0 && s.p0 === 1, `shift k=${k} r=${r}: hides perfectly, opens both ways always`);
        if (key === 'tag') ok(s.delta === 1 && s.p0 === 0, `tag k=${k} r=${r}: binds perfectly, hides nothing`);
      }
    }
  }
}
// Random functions, not just the three schemes: the inequality is about counting.
{
  const R = rng(42);
  for (let t = 0; t < 2000; t++) {
    const M = 1 + Math.floor(R() * 40), N = 1 + Math.floor(R() * 40);
    const D0 = new Uint32Array(M), D1 = new Uint32Array(M);
    for (let n = 0; n < N; n++) { D0[Math.floor(R() * M)]++; D1[Math.floor(R() * M)]++; }
    const m = measure(D0, D1, N);
    ok(m.p0 >= 1 - m.delta - 1e-12 && m.p1 >= 1 - m.delta - 1e-12, `random function ${t}: p ≥ 1 − δ`);
    theoremChecks++;
  }
}
// A long nonce on a short hash hides well: δ shrinks as r grows past k.
{
  const a = census('hash', 4, 4, 11).delta, b = census('hash', 4, 12, 11).delta;
  ok(b < a && b < 0.05, `truncated hash k=4: δ falls from ${a.toFixed(3)} (r=4) to ${b.toFixed(3)} (r=12)`);
}

// ── Bob's attack agrees with the census ──
for (const key of Object.keys(SCHEMES)) {
  for (const [k, r] of [[3, 2], [5, 4], [6, 6], [8, 3]]) {
    const s = census(key, k, r, 5);
    for (let c = 0; c < s.M; c++) {
      const u = unmask(key, k, r, 5, c);
      ok(u.fits[0] === s.D0[c] > 0 && u.fits[1] === s.D1[c] > 0, `${key} k=${k} r=${r} c=${c}: unmask matches census`);
    }
  }
}

// ── Alice's attack: every pair found is real, and the mean cost is √(π·2^k) ──
for (const k of [8, 12, 16]) {
  let total = 0;
  const trials = k === 16 ? 120 : 400;
  for (let t = 0; t < trials; t++) {
    const d = doubleOpening(k, 1000 + t, 0);
    ok(d.found, `k=${k}: a double opening exists`);
    ok(toyHash(1000 + t, k, 0, d.n0) === d.c && toyHash(1000 + t, k, 1, d.n1) === d.c, `k=${k}: both openings verify`);
    total += d.draws;
  }
  const mean = total / trials, want = expectedDoubleOpening(k);
  ok(Math.abs(mean / want - 1) < 0.12, `k=${k}: mean draws ${mean.toFixed(1)} vs √(π·2^k) = ${want.toFixed(1)}`);
  console.log(`  double opening, k=${k}: mean ${mean.toFixed(1)} draws over ${trials}, theory ${want.toFixed(1)}`);
}

console.log(`commit.selftest: ${pass} passed, ${fail} failed, p ≥ 1 − δ checked on ${theoremChecks} schemes, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
