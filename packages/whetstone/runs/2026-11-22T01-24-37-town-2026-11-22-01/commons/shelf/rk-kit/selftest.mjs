// selftest: round-trip 50 fresh keys through did:key and back; node's own EC import must accept each point.
import { generateKeyPairSync, createPublicKey, sign, verify } from 'node:crypto';
import { didKeyFromJwk, jwkFromDidKey, b58, unb58 } from './keygen.mjs';
let ok = 0;
for (let i = 0; i < 50; i++) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const did = didKeyFromJwk(publicKey.export({ format: 'jwk' }));
  if (!/^did:key:zQ3s/.test(did)) throw Error('prefix ' + did);      // secp256k1 did:keys start zQ3s
  const back = createPublicKey({ key: jwkFromDidKey(did), format: 'jwk' });
  const sig = sign('sha256', Buffer.from('rk' + i), privateKey);
  if (!verify('sha256', Buffer.from('rk' + i), back, sig)) throw Error('round-trip failed');
  ok++;
}
const z = Buffer.from([0, 0, 1, 2]); if (!unb58(b58(z)).equals(z)) throw Error('b58 leading zeros');
console.log(`selftest ok: ${ok}/50 keys round-trip, signatures verify against the decoded did:key`);
