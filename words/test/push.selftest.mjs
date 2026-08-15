#!/usr/bin/env node
// words — Web Push crypto selftest, against RFC 8291's worked example.
//
//   node words/test/push.selftest.mjs
//
// WHY A KNOWN-ANSWER TEST AND NOT A ROUND TRIP. Encrypting and then decrypting
// with our own code proves the two halves agree with each other, which is
// exactly the bug we are worried about: a push the browser cannot decrypt does
// not error anywhere we can see it. The push service accepts the POST, returns
// 201, and the notification simply never appears. So the only test worth having
// is against numbers somebody else published — RFC 8291 §5 gives the keys, the
// salt, the plaintext and the exact bytes on the wire, and this reproduces them.

import { encrypt, vapidHeader, generateKeys, b64url } from '../lib/webpush.js';

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => { if (cond) pass++; else failures.push(`${name}${detail ? ` — ${detail}` : ''}`); };
const eq = (name, got, want) => ok(name, got === want, `\n      got  ${got}\n      want ${want}`);

// --------------------------------------------------- RFC 8291 section 5 ----
// "When I grow up, I want to be a watermelon"
const VECTOR = {
  plaintext: 'When I grow up, I want to be a watermelon',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  // The RECEIVER's private key, also published in the example. It is here so
  // the test can decrypt what we encrypt, from the other side of the ECDH —
  // see the note on circularity below.
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  // The complete aes128gcm message from the RFC.
  expected: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

// A receiver-side decrypt, for the test only. THIS IS THE ANTI-CIRCULARITY
// CHECK: a published byte string is only as good as one's transcription of it,
// so the ciphertext is also decrypted using the RECEIVER's private key — the
// far side of the key agreement, which is what a browser actually does. If the
// expected string above were mistyped, this would still fail on a real bug.
async function decrypt(body, uaPrivate, uaPublic, authSecret) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    d: uaPrivate,
    x: b64url.encode(b64url.decode(uaPublic).slice(1, 33)),
    y: b64url.encode(b64url.decode(uaPublic).slice(33, 65)),
  };
  const priv = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));

  const cat = (...ps) => {
    const out = new Uint8Array(ps.reduce((n, p) => n + p.length, 0));
    let at = 0; for (const p of ps) { out.set(p, at); at += p.length; }
    return out;
  };
  const te = new TextEncoder();
  const hk = async (sl, ikm, info, len) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sl, info }, k, len * 8));
  };
  const ikm = await hk(b64url.decode(authSecret), shared,
    cat(te.encode('WebPush: info'), new Uint8Array([0]), b64url.decode(uaPublic), asPublic), 32);
  const cek = await hk(salt, ikm, cat(te.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hk(salt, ikm, cat(te.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  return new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2)));
}

{
  const body = await encrypt(
    { endpoint: 'https://example.com/p', keys: { p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret } },
    VECTOR.plaintext,
    {
      salt: b64url.decode(VECTOR.salt),
      senderKeys: { publicKey: VECTOR.asPublic, privateKey: VECTOR.asPrivate },
      recordSize: 4096,
    },
  );
  const got = b64url.encode(body);
  eq('RFC 8291 §5 encrypts byte-for-byte', got, VECTOR.expected);

  // And prove the header it produces is the shape the spec describes, so a
  // mistake in the framing shows up here rather than as a silent 400.
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  eq('the salt is the first 16 bytes', b64url.encode(salt), VECTOR.salt);
  eq('the record size is in the header', rs, 4096);
  eq('the key id length is 65', body[20], 65);
  eq('the sender public key is inline', b64url.encode(body.slice(21, 86)), VECTOR.asPublic);

  // The independent check: the intended recipient can read it.
  eq('the receiver can decrypt it', await decrypt(body, VECTOR.uaPrivate, VECTOR.uaPublic, VECTOR.authSecret),
    VECTOR.plaintext);
}
{
  // And with random salt + ephemeral keys, which is how it actually ships.
  const sub = { endpoint: 'https://example.com/p', keys: { p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret } };
  const body = await encrypt(sub, 'Ada played QUIXOTIC for 84');
  eq('a real push decrypts on the far side',
    await decrypt(body, VECTOR.uaPrivate, VECTOR.uaPublic, VECTOR.authSecret),
    'Ada played QUIXOTIC for 84');
}
{
  // A random salt and ephemeral keys must give a DIFFERENT body every time —
  // reusing either would leak the plaintext across two pushes.
  const sub = { endpoint: 'https://example.com/p', keys: { p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret } };
  const a = b64url.encode(await encrypt(sub, 'your turn'));
  const b = b64url.encode(await encrypt(sub, 'your turn'));
  ok('every push uses a fresh salt and key', a !== b);
  ok('and they are the right length', b64url.decode(a).length > 86);
}

// ------------------------------------------------------------- VAPID -------
{
  const keys = await generateKeys();
  ok('a generated public key is an uncompressed P-256 point',
    b64url.decode(keys.publicKey).length === 65 && b64url.decode(keys.publicKey)[0] === 4);
  eq('a generated private key is 32 bytes', b64url.decode(keys.privateKey).length, 32);

  const at = Date.parse('2026-08-05T12:00:00Z');
  const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc123', {
    ...keys, subject: 'mailto:tips@minomobi.com',
  }, at);
  ok('the header is a vapid header', h.Authorization.startsWith('vapid t='));
  const [, jwt] = h.Authorization.match(/t=([^,]+)/);
  const [head, claims, sig] = jwt.split('.');
  const decode = (s) => JSON.parse(new TextDecoder().decode(b64url.decode(s)));
  eq('signed with ES256', decode(head).alg, 'ES256');
  // The audience is the ORIGIN, not the endpoint. Getting this wrong is a bare
  // 401 from the push service with no explanation.
  eq('the audience is the endpoint origin', decode(claims).aud, 'https://fcm.googleapis.com');
  eq('it expires within 24h', decode(claims).exp, Math.floor(at / 1000) + 12 * 60 * 60);
  eq('it carries a contact', decode(claims).sub, 'mailto:tips@minomobi.com');
  eq('the signature is a raw P-256 pair', b64url.decode(sig).length, 64);
  ok('the public key rides along', h.Authorization.includes(`k=${keys.publicKey}`));

  // ...and it must actually verify under that public key.
  const pub = await crypto.subtle.importKey('raw', b64url.decode(keys.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub,
    b64url.decode(sig), new TextEncoder().encode(`${head}.${claims}`));
  ok('the signature verifies', valid);
}
{
  // base64url round-trips, including the padding cases that trip people up.
  for (const n of [1, 2, 3, 16, 31, 32, 65]) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    const back = b64url.decode(b64url.encode(bytes));
    ok(`base64url round-trips ${n} bytes`, back.length === n && back.every((b, i) => b === bytes[i]));
  }
  ok('no padding characters survive', !b64url.encode(new Uint8Array([1, 2])).includes('='));
}

console.log(`words push selftest: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
