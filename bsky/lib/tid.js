/**
 * TID (timestamp identifier) decoding.
 *
 * Every ATProto record key is a TID: 13 characters of a sortable base32 that
 * encode the microsecond the record was created. That matters here because
 * Constellation returns backlinks as `{did, collection, rkey}` with **no
 * timestamp** — so without this, notifications can only be grouped by kind,
 * never ordered by when they happened.
 *
 * Layout, 64 bits big-endian:
 *   bit  0      always 0 (keeps the value positive and sortable as a string)
 *   bits 1-53   microseconds since the Unix epoch
 *   bits 54-63  a random clock identifier, to avoid collisions between clients
 *
 * The alphabet is deliberately not RFC 4648: it is ordered so that
 * lexicographic sort equals chronological sort, which is why rkeys sort
 * correctly as plain strings.
 *
 * A TID is a CLAIM by whoever wrote the record, not an observed time — a client
 * with a wrong clock produces a wrong TID, and nothing verifies it. Good enough
 * to order a notifications list; not evidence of anything.
 */

const ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';

const VALUES = (() => {
  const m = new Map();
  for (let i = 0; i < ALPHABET.length; i++) m.set(ALPHABET[i], i);
  return m;
})();

/**
 * Milliseconds since the epoch for a TID rkey, or null if it is not one.
 *
 * Plenty of record keys are NOT TIDs — `self` for a profile, a slug for a lab
 * save — so this returns null rather than throwing, and callers fall back.
 *
 * @param {string} rkey
 * @returns {number|null}
 */
export function tidToMillis(rkey) {
  if (typeof rkey !== 'string' || rkey.length !== 13) return null;

  // BigInt, not Number: the value is 64 bits and the microsecond field alone is
  // 53, so shifting in plain numbers loses the low bits.
  let bits = 0n;
  for (const ch of rkey) {
    const v = VALUES.get(ch);
    if (v === undefined) return null;         // not the TID alphabet
    bits = (bits << 5n) | BigInt(v);
  }

  const micros = bits >> 10n;                 // drop the clock id
  const ms = Number(micros / 1000n);
  // Sanity: anything before ATProto existed or far in the future is a rkey that
  // merely looks like a TID.
  if (!Number.isFinite(ms) || ms < 1_600_000_000_000 || ms > Date.now() + 86_400_000) return null;
  return ms;
}

/** @param {string} rkey @returns {Date|null} */
export function tidToDate(rkey) {
  const ms = tidToMillis(rkey);
  return ms === null ? null : new Date(ms);
}
