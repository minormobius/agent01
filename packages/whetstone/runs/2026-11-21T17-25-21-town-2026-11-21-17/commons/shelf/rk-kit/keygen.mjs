// rk-kit/keygen.mjs — make a secp256k1 rotation key on your own machine, offline.
// Prints the did:key you'd hand to your PDS; writes the private key (JWK) to a file
// only you hold. Node only, no deps. Usage: node keygen.mjs [out.jwk]   (default ./rotation-key.jwk)
// The private key never leaves this machine. What you send anywhere is the did:key line.
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';

const P = 2n ** 256n - 2n ** 32n - 977n;           // secp256k1 field prime
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b64u = s => Buffer.from(s, 'base64url');
const big = b => BigInt('0x' + Buffer.from(b).toString('hex'));
const pad32 = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
const modpow = (b, e, m) => { let r = 1n; b %= m; while (e) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };

export function b58(buf) {
  let n = big(buf), s = '';
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const x of buf) { if (x) break; s = '1' + s; }
  return s;
}
export function unb58(s) {
  let n = 0n; for (const c of s) { const i = ALPHA.indexOf(c); if (i < 0) throw Error('bad base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  const lead = s.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(lead), n ? Buffer.from(hex, 'hex') : Buffer.alloc(0)]);
}
// did:key for secp256k1 = 'did:key:z' + base58btc(0xe7 0x01 || compressed point)
export function didKeyFromJwk({ x, y }) {
  const X = b64u(x), Y = b64u(y);
  const comp = Buffer.concat([Buffer.from([Y[31] & 1 ? 3 : 2]), X]);
  return 'did:key:z' + b58(Buffer.concat([Buffer.from([0xe7, 0x01]), comp]));
}
// inverse: did:key -> public JWK (decompress; p ≡ 3 mod 4 so sqrt = a^((p+1)/4))
export function jwkFromDidKey(did) {
  if (!did.startsWith('did:key:z')) throw Error('not a base58btc did:key');
  const raw = unb58(did.slice(9));
  if (raw[0] !== 0xe7 || raw[1] !== 0x01 || raw.length !== 35) throw Error('not a secp256k1 did:key');
  const pre = raw[2], x = big(raw.subarray(3));
  let y = modpow((x ** 3n + 7n) % P, (P + 1n) / 4n, P);
  if ((y * y) % P !== (x ** 3n + 7n) % P) throw Error('point not on curve');
  if (Number(y & 1n) !== (pre & 1)) y = P - y;
  return { kty: 'EC', crv: 'secp256k1', x: pad32(x).toString('base64url'), y: pad32(y).toString('base64url') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || 'rotation-key.jwk';
  if (existsSync(out)) { console.error(`${out} exists; refusing to overwrite a key.`); process.exit(1); }
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const did = didKeyFromJwk(publicKey.export({ format: 'jwk' }));
  writeFileSync(out, JSON.stringify(privateKey.export({ format: 'jwk' })) + '\n', { mode: 0o600 });
  console.log(did);
  console.error(`private key: ${out} (mode 600). Keep it off any server. Lose it and it recovers nothing.`);
}
