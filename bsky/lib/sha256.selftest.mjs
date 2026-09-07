/**
 * Known-answer tests for lib/sha256.js. Run: node bsky/lib/sha256.selftest.mjs
 * Vectors are FIPS 180-4 / NIST plus the padding-boundary lengths.
 */
import { createHash } from 'node:crypto';
import { sha256hex } from './sha256.js';

const enc = new TextEncoder();
let fail = 0;

const check = (label, input, expected) => {
  const got = sha256hex(typeof input === 'string' ? enc.encode(input) : input);
  const ok = got === expected;
  if (!ok) fail++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : `\n      got ${got}\n      want ${expected}`}`);
};

console.log('NIST vectors');
check('empty string', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('"abc"', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('448-bit message', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
check('896-bit message',
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');

console.log('padding boundaries (where naive implementations break)');
for (const n of [54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128]) {
  const buf = new Uint8Array(n).fill(0x61);
  check(`${n} bytes of 'a'`, buf, createHash('sha256').update(buf).digest('hex'));
}

console.log('random cross-check against node:crypto');
for (let i = 0; i < 200; i++) {
  const n = Math.floor(Math.random() * 3000);
  const buf = new Uint8Array(n);
  for (let j = 0; j < n; j++) buf[j] = Math.floor(Math.random() * 256);
  const want = createHash('sha256').update(buf).digest('hex');
  if (sha256hex(buf) !== want) { console.log(`  ✗ mismatch at length ${n}`); fail++; break; }
}
if (!fail) console.log('  ✓ 200 random buffers up to 3000 bytes all match');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
