// selftest: round-trip 50 fresh keys through did:key and back; node's own EC import must accept each point.
import { generateKeyPairSync, createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
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
// the card: the key on it must be the key, and its words must name the did, the dry run and the 72 h.
import { card } from './keygen.mjs';
{
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = privateKey.export({ format: 'jwk' }), didKey = didKeyFromJwk(publicKey.export({ format: 'jwk' }));
  const c = card({ did: 'did:plc:test', didKey, jwk, made: '2026-11-22' });
  const line = c.split('\n').find(l => l.startsWith('{"kty"'));
  const back = createPrivateKey({ key: JSON.parse(line), format: 'jwk' });
  if (!verify('sha256', Buffer.from('card'), publicKey, sign('sha256', Buffer.from('card'), back))) throw Error('card key is not the key');
  for (const w of ['did:plc:test', didKey, 'dry run', '72 hours', 'different computer']) if (!c.includes(w)) throw Error('card lacks ' + w);
  console.log('selftest ok: the card carries the key and the words');
}
