// commit.js — the engine behind math.mino.mobi/commit/.
//
// One file, imported unchanged by the page and by commit.selftest.mjs.
// No dependencies; runs in a browser and in node.
//
// Three parts:
//   1. SHA-256, written out (FIPS 180-4), so the page can hash synchronously
//      inside a drawing loop. The selftest checks it against the NIST vectors
//      and against node's own crypto on random inputs.
//   2. The real commitment the "flip" tab uses: c = SHA-256(tag ‖ bit ‖ nonce)
//      with a 128-bit random nonce. Blum's coin flip by telephone (1981).
//   3. Toy commitments over spaces small enough to count completely, and the
//      two numbers the page is about:
//        δ  — hiding loss: the statistical distance between the commitment
//             distributions for bit 0 and bit 1. Bob's best guess at the bit
//             from the commitment alone is right with probability (1 + δ)/2.
//        p  — equivocation: the chance that an honest commitment could also
//             be opened as the other bit, by an Alice with unlimited time.
//      For every scheme there is, p ≥ 1 − δ. The page shows why; the selftest
//      checks it on every scheme and size it can enumerate.

// ── 1. SHA-256 ──────────────────────────────────────────────────────────

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of a byte array. Returns a 32-byte Uint8Array. */
export function sha256(msg) {
  const len = msg.length;
  const blocks = Math.ceil((len + 9) / 64);
  const buf = new Uint8Array(blocks * 64);
  buf.set(msg);
  buf[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(buf.length - 4, bitLen >>> 0);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + 4 * i);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((x, i) => ov.setUint32(4 * i, x >>> 0));
  return out;
}

export const utf8 = (s) => new TextEncoder().encode(s);
export const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export const fromHex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));

// ── 2. The real commitment ──────────────────────────────────────────────

const TAG = utf8('math.mino.mobi/commit v1');

function message(bit, nonce) {
  const m = new Uint8Array(TAG.length + 1 + nonce.length);
  m.set(TAG);
  m[TAG.length] = bit ? 1 : 0;
  m.set(nonce, TAG.length + 1);
  return m;
}

/** 16 random bytes. `rand` is a getRandomValues-style filler (defaults to crypto). */
export function freshNonce(rand = (a) => globalThis.crypto.getRandomValues(a)) {
  return rand(new Uint8Array(16));
}

/** Commit to a bit. Returns { c, bit, nonce } — publish c, keep the rest. */
export function commit(bit, nonce = freshNonce()) {
  return { c: hex(sha256(message(bit, nonce))), bit: bit ? 1 : 0, nonce };
}

/** The hash a (bit, nonce) pair commits to, as hex. */
export const digest = (bit, nonce) => hex(sha256(message(bit, nonce)));

/** Does (bit, nonce) open commitment c? */
export function opens(c, bit, nonce) {
  return digest(bit, nonce) === c;
}

/** Blum's rule: the coin is Alice's bit XOR Bob's call. 0 = heads, 1 = tails. */
export const coin = (aliceBit, bobCall) => (aliceBit ^ bobCall) & 1;

// ── 3. Toy commitments you can count ────────────────────────────────────
//
// A scheme maps (bit, nonce) to a commitment value c in [0, 2^k), with the
// nonce uniform over [0, 2^r). Small k and r mean every case can be listed.

/** Seeded PRNG (mulberry32), so a toy scheme is reproducible from its salt. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First k bits of SHA-256(salt ‖ bit ‖ nonce as 4 bytes), as an integer. */
export function toyHash(salt, k, bit, n) {
  const m = new Uint8Array(9);
  const dv = new DataView(m.buffer);
  dv.setUint32(0, salt >>> 0);
  m[4] = bit ? 1 : 0;
  dv.setUint32(5, n >>> 0);
  const d = sha256(m);
  const top = new DataView(d.buffer).getUint32(0);
  return k === 0 ? 0 : top >>> (32 - k);
}

export const SCHEMES = {
  // A hash cut down to k bits. The realistic one: it leaks a little and
  // binds a little, and both depend on how r compares with k.
  hash: {
    name: 'truncated hash',
    f: (salt, k) => (bit, n) => toyHash(salt, k, bit, n),
  },
  // A shift: c = n + bit·s mod 2^k, s odd. The toy cousin of a Pedersen
  // commitment. When the nonce covers the whole range (r ≥ k) both bits
  // produce exactly the same spread of c, so it hides perfectly, and every
  // c opens both ways.
  shift: {
    name: 'shift (Pedersen-style)',
    f: (salt, k) => {
      const M = 2 ** k;
      const s = k === 0 ? 0 : ((salt % M) | 1) % M;
      return (bit, n) => (n + bit * s) % M;
    },
  },
  // A tag: the bit sits in the last position of c in the clear, the nonce
  // fills the rest. Binding is perfect and hiding is zero.
  tag: {
    name: 'tag (bit in the clear)',
    f: (salt, k) => {
      const half = 2 ** Math.max(k - 1, 0);
      return (bit, n) => (k === 0 ? 0 : ((n % half) * 2 + bit));
    },
  },
};

/**
 * Lay a scheme out completely. Returns counts D0[c], D1[c] (how many nonces
 * send each bit to c) and the measures.
 */
export function census(schemeKey, k, r, salt) {
  const f = SCHEMES[schemeKey].f(salt, k);
  const M = 2 ** k, N = 2 ** r;
  const D0 = new Uint32Array(M), D1 = new Uint32Array(M);
  for (let n = 0; n < N; n++) { D0[f(0, n)]++; D1[f(1, n)]++; }
  return { schemeKey, k, r, salt, M, N, D0, D1, ...measure(D0, D1, N) };
}

/**
 * The two numbers, from the counts.
 *   delta   statistical distance ½ Σ |D0 − D1| / N
 *   overlap Σ min(D0, D1) / N  (= 1 − δ, computed separately as a check)
 *   p0, p1  probability mass, under bit 0 and bit 1, on the values that
 *           both bits can reach: the honest commitments Alice could lie about
 *   reveal  fraction of values that only one bit can reach (of those reached)
 */
export function measure(D0, D1, N) {
  let dist = 0, overlap = 0, e0 = 0, e1 = 0, reached = 0, single = 0;
  for (let c = 0; c < D0.length; c++) {
    const a = D0[c], b = D1[c];
    dist += Math.abs(a - b);
    overlap += Math.min(a, b);
    if (a > 0 && b > 0) { e0 += a; e1 += b; }
    if (a > 0 || b > 0) { reached++; if (!(a > 0 && b > 0)) single++; }
  }
  const delta = dist / (2 * N);
  return {
    delta,
    overlap: overlap / N,
    p0: e0 / N,
    p1: e1 / N,
    guess: (1 + delta) / 2,
    reached,
    single,
  };
}

// ── Attacks on the toy hash ─────────────────────────────────────────────

/**
 * Alice's attack on binding: find nonces n0, n1 with h(0, n0) = h(1, n1) for
 * the k-bit hash, nonces unlimited. Draws alternately from the two sides and
 * stops at the first match. Expected draws ≈ √(π·2^k).
 */
export function doubleOpening(k, salt, startNonce = 0, maxDraws = 1 << 22) {
  const seen = [new Map(), new Map()];
  for (let i = 0; i < maxDraws; i++) {
    const bit = i & 1;
    const n = startNonce + (i >>> 1);
    const c = toyHash(salt, k, bit, n);
    const other = seen[bit ^ 1].get(c);
    if (other !== undefined) {
      const n0 = bit === 0 ? n : other, n1 = bit === 1 ? n : other;
      return { found: true, draws: i + 1, c, n0, n1 };
    }
    if (!seen[bit].has(c)) seen[bit].set(c, n);
  }
  return { found: false, draws: maxDraws };
}

export const expectedDoubleOpening = (k) => Math.sqrt(Math.PI * 2 ** k);

/**
 * Bob's attack on hiding: given c, try every nonce in [0, 2^r) under both bits.
 * Returns the bits that fit and the work done.
 */
export function unmask(schemeKey, k, r, salt, c) {
  const f = SCHEMES[schemeKey].f(salt, k);
  const N = 2 ** r;
  const fits = [false, false];
  for (let n = 0; n < N; n++) {
    if (f(0, n) === c) fits[0] = true;
    if (f(1, n) === c) fits[1] = true;
  }
  return { fits, work: 2 * N };
}

/** log2 of the work each attack needs at full size, for the scaling table. */
export const fullSize = {
  hashBits: 256,
  nonceBits: 128,
  doubleOpeningLog2: 128 + Math.log2(Math.sqrt(Math.PI)), // birthday on 256 bits
  unmaskLog2: 128 + 1, // every nonce, both bits
};
