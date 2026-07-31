// fifty/lib/invite.js — stateless invite codes (concept 37).
//
// The usual invite system is a database of random strings. This one puts the
// grant inside the code and signs it, so the code IS the record: cohort,
// expiry, referrer, allowance. Verification is one HMAC — no lookup, no
// replication, and a leaked list of issued codes tells an attacker nothing they
// could not already see.
//
// What a stateless code genuinely cannot do is count its own redemptions. That
// is the honest boundary, and it is stated on the page rather than papered over:
// issuing and verification are stateless, redemption is not.

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford — no I, L, O, U

function b32encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(str) {
  const clean = String(str).toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/**
 * The payload packed into a code. Kept tiny because it becomes the code:
 *   v  version
 *   c  cohort index (which wave of the beta)
 *   e  expiry, in days since epoch
 *   u  uses allowed
 *   r  referrer index into the campaign's referrer list, or 0
 *   n  nonce, so two identical grants still produce different codes
 */
function pack({ version = 1, cohort = 0, expiryDays = 0, uses = 1, referrer = 0, nonce = 0 }) {
  const b = new Uint8Array(8);
  b[0] = version & 255;
  b[1] = cohort & 255;
  b[2] = (expiryDays >>> 8) & 255;
  b[3] = expiryDays & 255;
  b[4] = uses & 255;
  b[5] = referrer & 255;
  b[6] = (nonce >>> 8) & 255;
  b[7] = nonce & 255;
  return b;
}

function unpack(b) {
  if (b.length < 8) return null;
  return {
    version: b[0],
    cohort: b[1],
    expiryDays: (b[2] << 8) | b[3],
    uses: b[4],
    referrer: b[5],
    nonce: (b[6] << 8) | b[7],
  };
}

const dayOf = (date) => Math.floor(new Date(date).getTime() / 86400000);
export const dayToDate = (d) => new Date(d * 86400000);

/** Issue a code. `secret` never leaves the issuer. */
export async function issue(secret, grant) {
  const payload = pack({
    ...grant,
    expiryDays: grant.expiry ? dayOf(grant.expiry) : 0,
    nonce: grant.nonce != null ? grant.nonce : Math.floor(Math.random() * 65536),
  });
  const sig = await hmac(secret, b32encode(payload));
  const body = new Uint8Array(payload.length + 5);
  body.set(payload, 0);
  body.set(sig.slice(0, 5), payload.length);       // 40-bit tag: 1 in 10^12 to forge
  const code = b32encode(body);
  return code.replace(/(.{5})(?=.)/g, '$1-');       // ABCDE-FGHIJ-KLMNO
}

/**
 * Verify a code against the secret. Returns the grant it carries, or the
 * reason it failed. Never throws on bad input — a verifier that throws on
 * garbage is a verifier somebody will wrap in a bare try/catch.
 */
export async function verify(secret, code, { now = new Date() } = {}) {
  const bytes = b32decode(code);
  if (bytes.length < 13) return { valid: false, reason: 'too short to be a code' };

  const payload = bytes.slice(0, 8);
  const tag = bytes.slice(8, 13);
  const expected = (await hmac(secret, b32encode(payload))).slice(0, 5);

  let diff = 0;
  for (let i = 0; i < 5; i++) diff |= tag[i] ^ expected[i];
  if (diff !== 0) return { valid: false, reason: 'signature does not match — forged, mistyped, or issued by a different campaign' };

  const grant = unpack(payload);
  if (grant.version !== 1) return { valid: false, reason: `unknown code version ${grant.version}` };
  if (grant.expiryDays && dayOf(now) > grant.expiryDays) {
    return { valid: false, reason: `expired on ${dayToDate(grant.expiryDays).toISOString().slice(0, 10)}`, grant };
  }
  return { valid: true, grant };
}

/** A campaign is the issuer's own record of what a cohort/referrer index means. */
export const CAMPAIGN_COLLECTION = 'com.minomobi.fifty.invite.campaign';

export function campaignRecord(campaign) {
  return {
    $type: CAMPAIGN_COLLECTION,
    name: campaign.name || '',
    cohorts: (campaign.cohorts || []).map((c, i) => ({ index: i, label: c.label, grants: c.grants || [] })),
    referrers: (campaign.referrers || []).map((r, i) => ({ index: i, did: r.did, label: r.label || '' })),
    // Deliberately absent: the secret. It is the one thing that must not be a
    // public record, and saying so in the schema is cheaper than a footnote.
    note: 'The HMAC secret is held by the issuer and never published.',
    createdAt: campaign.createdAt || new Date().toISOString(),
  };
}
