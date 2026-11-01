// Proposed cid-keyed dice (council/proposals/modulo-gate-1031.md, not yet ratified).
// h = sha256(hexToBytes(randomness) || utf8(cid)); die i = h[i] mod 6 + 1, i < n <= 32.
// Run: node research/dice-route/vector.mjs   (exits 1 if the vector doesn't hold)
import { createHash } from 'node:crypto';
export function dice(randomnessHex, cid, n) {
  if (!/^[0-9a-f]{64}$/.test(randomnessHex)) throw new Error('randomness must be 64 hex');
  if (!(n >= 1 && n <= 32)) throw new Error('1 <= n <= 32');
  const h = createHash('sha256').update(Buffer.concat([Buffer.from(randomnessHex, 'hex'), Buffer.from(cid, 'utf8')])).digest();
  return [...h.subarray(0, n)].map(b => b % 6 + 1);
}
// Vector: quicknet round 1000000, fetched from api.drand.sh 10-31
// (chain 52db9ba7…84e971; check https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/1000000)
const V = {
  round: 1000000,
  randomness: 'b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3',
  cid: 'bafyreighppscd7lwzuaqrxsdpklgbplkjlxmbw4xg5qo6lgo4axuqgzieq', // mozzie-gate-1031
  want: [6, 1, 3, 5, 5],
};
if (import.meta.url === `file://${process.argv[1]}`) {
  const got = dice(V.randomness, V.cid, 5);
  const ok = JSON.stringify(got) === JSON.stringify(V.want);
  console.log(ok ? 'ok' : 'FAIL', got.join(','), 'want', V.want.join(','));
  process.exit(ok ? 0 : 1);
}
