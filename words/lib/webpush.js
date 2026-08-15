// Web Push, from scratch, on WebCrypto only.
//
// A push to a browser is two pieces of cryptography and no library:
//
//   * VAPID (RFC 8292) — a JWT signed with our P-256 key, which is how the
//     push service knows the message is from us and who to complain to;
//   * aes128gcm (RFC 8188/8291) — the payload, encrypted to a key the
//     BROWSER generated, so the push service (Google, Apple, Mozilla) relays
//     it without being able to read whose turn it is.
//
// Both are ~40 lines of WebCrypto, which is why there is no dependency here:
// web-push is a Node library with Node crypto in it, and a Worker has neither.
//
// The whole thing is verified against RFC 8291's worked example in
// test/push.selftest.mjs — same keys, same salt, byte-identical output. That
// matters more than usual: a bug here does not throw, it produces a message the
// browser silently fails to decrypt, and the only symptom is a notification
// that never arrives.

const enc = new TextEncoder();

export const b64url = {
  encode(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(text) {
    const s = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

const concat = (...parts) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** HKDF extract+expand in one call — exactly what WebCrypto's HKDF does. */
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** A raw 65-byte uncompressed P-256 point -> a CryptoKey. */
const importPublic = (raw, usage) =>
  crypto.subtle.importKey('raw', raw, { name: usage, namedCurve: 'P-256' },
    true, usage === 'ECDH' ? [] : ['verify']);

/**
 * A raw 32-byte scalar + its public point -> a private CryptoKey.
 * WebCrypto will not import a raw private key, so it goes in as a JWK.
 */
function importPrivate(dRaw, publicRaw, usage) {
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    d: b64url.encode(dRaw),
    x: b64url.encode(publicRaw.slice(1, 33)),
    y: b64url.encode(publicRaw.slice(33, 65)),
  };
  return crypto.subtle.importKey('jwk', jwk, { name: usage, namedCurve: 'P-256' },
    false, usage === 'ECDH' ? ['deriveBits'] : ['sign']);
}

/** A fresh VAPID keypair, base64url, ready to store. */
export async function generateKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url.encode(pub), privateKey: jwk.d };
}

/**
 * The `Authorization: vapid ...` header for one push endpoint.
 * The audience is the ORIGIN of the endpoint, not the whole URL — push services
 * reject the token otherwise, and the error is a bare 401.
 */
export async function vapidHeader(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const signingInput = `${b64url.encode(enc.encode(JSON.stringify(header)))}.${b64url.encode(enc.encode(JSON.stringify(claims)))}`;
  const key = await importPrivate(b64url.decode(privateKey), b64url.decode(publicKey), 'ECDSA');
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)));
  return {
    Authorization: `vapid t=${signingInput}.${b64url.encode(sig)},k=${publicKey}`,
  };
}

/**
 * Encrypt a payload to a subscription, per RFC 8291.
 * `salt` and `senderKeys` exist so the RFC's worked example can be reproduced
 * exactly; in production both are random and neither is ever reused.
 */
export async function encrypt(subscription, payload, { salt, senderKeys, recordSize = 4096 } = {}) {
  const uaPublic = b64url.decode(subscription.keys.p256dh);
  const authSecret = b64url.decode(subscription.keys.auth);
  const realSalt = salt || crypto.getRandomValues(new Uint8Array(16));

  let asPublic, asPrivateKey;
  if (senderKeys) {
    asPublic = b64url.decode(senderKeys.publicKey);
    asPrivateKey = await importPrivate(b64url.decode(senderKeys.privateKey), asPublic, 'ECDH');
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    asPrivateKey = pair.privateKey;
  }

  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: await importPublic(uaPublic, 'ECDH') }, asPrivateKey, 256));

  // The key derivation is keyed by BOTH public keys, which is what binds the
  // message to this subscription and not merely to this shared secret.
  const keyInfo = concat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const cek = await hkdf(realSalt, ikm, concat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(realSalt, ikm, concat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  // 0x02 is the "last record" delimiter; this implementation always sends one.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, recordSize);
  return concat(realSalt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/**
 * Send one push. Returns the raw Response so the caller can decide what a
 * failure means — 404 and 410 mean the subscription is dead and should be
 * deleted, everything else is worth a retry some other time.
 */
export async function send(subscription, payload, vapid, { ttl = 24 * 60 * 60 } = {}) {
  const body = await encrypt(subscription, payload);
  const auth = await vapidHeader(subscription.endpoint, vapid);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      ...auth,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body,
  });
}

/** A dead subscription — stop trying, delete the row. */
export const isGone = (status) => status === 404 || status === 410;
