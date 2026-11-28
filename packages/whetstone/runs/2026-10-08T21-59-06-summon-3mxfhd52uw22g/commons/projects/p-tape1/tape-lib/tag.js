// tape/lib/tag.js — the card data model.
//
// THE ONE FACT THIS FILE EXISTS TO ENFORCE: an NFC tag cannot hold audio.
// The biggest tag anyone sells cheaply (NTAG216) has 888 bytes of user memory.
// One minute of speech at 24 kbps Opus is 180,000 bytes. A tag is off by three
// to four orders of magnitude. So the tag holds a *pointer* — a 64-bit card id
// — and the audio lives on the box's SD card, addressed through the manifest
// (see catalog.js). Everything good about this design falls out of that:
//
//   • a card costs ~20¢ instead of $19.99
//   • re-pointing a card at new audio never touches the card
//   • many books per card is free — the manifest maps one card to a playlist
//   • a card written by one box works on another that has the same audio
//
// We write TWO NDEF records to every card:
//   1. a URL record  → tap the card on any phone and it opens the card's page
//   2. an external record "minomobi.com:tape" → the compact body the box reads
//
// Both together fit inside NTAG213's 144 bytes, so the cheapest sticker works.
// tag.selftest.mjs asserts that, and will fail if this file ever grows past it.

export const CARD_MAGIC = 0x5450;          // 'TP'
export const CARD_VERSION = 1;
export const CARD_EXTERNAL_TYPE = 'minomobi.com:tape';
export const CARD_URL_BASE = 'https://tape.mino.mobi/c/';

export const FLAG_SHUFFLE = 0x01;  // play the card's playlist in random order
export const FLAG_RESUME  = 0x02;  // remember the position when the card leaves
export const FLAG_LOCKED  = 0x04;  // the studio refuses to rewrite this card

export const CARD_ID_BYTES = 8;
export const CARD_ID_CHARS = 13;   // ceil(64 / 5) Crockford base32 characters
export const LABEL_MAX_BYTES = 32;
export const CARD_BODY_MAX = 13 + LABEL_MAX_BYTES;  // 45

// User memory, in bytes, of the tags worth considering. Sourced from the NXP
// datasheets; see design/ for why 125 kHz RFID is not on this list.
export const TAG_CAPACITY = {
  'MIFARE Ultralight': 48,
  NTAG213: 144,
  NTAG215: 504,
  NTAG216: 888,
  'MIFARE Classic 1K': 752,
  'MIFARE DESFire EV3 8K': 8192,
};

// The cheapest tag we promise to work on. Everything here is sized to fit it.
export const TARGET_TAG = 'NTAG213';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  // Crockford: no I, L, O, U

export function base32Encode(bytes) {
  let out = '', acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; out += B32[(acc >> bits) & 31]; }
  }
  if (bits) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  // Crockford's forgiving reads: a human copying an id off a card by eye may
  // write O for 0 and I or L for 1. Hyphens are decoration.
  const norm = String(str).toUpperCase().replace(/-/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  let acc = 0, bits = 0;
  const out = [];
  for (const ch of norm) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error(`not a card id: bad character ${JSON.stringify(ch)}`);
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return Uint8Array.from(out);
}

/** A fresh random card id, as its 13-character human/URL form. */
export function newCardId(random = defaultRandom) {
  return base32Encode(random(CARD_ID_BYTES));
}

function defaultRandom(n) {
  const b = new Uint8Array(n);
  // Browsers and node >=19 both expose this on globalThis.
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function isCardId(s) {
  if (typeof s !== 'string') return false;
  const norm = s.toUpperCase().replace(/-/g, '');
  if (norm.length !== CARD_ID_CHARS) return false;
  try { return base32Decode(norm).length === CARD_ID_BYTES; } catch { return false; }
}

export function cardUrl(id) { return CARD_URL_BASE + id; }

/** Pack the body the box reads off the tag. */
export function encodeCard({ id, label = '', flags = FLAG_RESUME }) {
  if (!isCardId(id)) throw new Error(`encodeCard: ${JSON.stringify(id)} is not a card id`);
  const labelBytes = new TextEncoder().encode(label);
  if (labelBytes.length > LABEL_MAX_BYTES) {
    throw new Error(`encodeCard: label is ${labelBytes.length} bytes, max ${LABEL_MAX_BYTES}`);
  }
  const idBytes = base32Decode(id);
  const out = new Uint8Array(13 + labelBytes.length);
  out[0] = (CARD_MAGIC >> 8) & 0xff;
  out[1] = CARD_MAGIC & 0xff;
  out[2] = CARD_VERSION;
  out[3] = flags & 0xff;
  out.set(idBytes, 4);
  out[12] = labelBytes.length;
  out.set(labelBytes, 13);
  return out;
}

export function decodeCard(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 13) throw new Error('decodeCard: too short to be a tape card');
  if (((b[0] << 8) | b[1]) !== CARD_MAGIC) throw new Error('decodeCard: not a tape card');
  if (b[2] !== CARD_VERSION) throw new Error(`decodeCard: card version ${b[2]}, this build reads ${CARD_VERSION}`);
  const labelLen = b[12];
  if (b.length < 13 + labelLen) throw new Error('decodeCard: label runs past the end of the record');
  return {
    version: b[2],
    flags: b[3],
    id: base32Encode(b.subarray(4, 12)),
    label: new TextDecoder().decode(b.subarray(13, 13 + labelLen)),
  };
}

/**
 * The records to hand to Web NFC's NDEFReader.write({ records }).
 * Shape matches NDEFRecordInit so this is passed straight through.
 */
export function ndefRecords(card) {
  return [
    { recordType: 'url', data: cardUrl(card.id) },
    { recordType: CARD_EXTERNAL_TYPE, data: encodeCard(card) },
  ];
}

/**
 * Bytes this message actually occupies on a Type 2 tag, TLV wrapper included.
 * Used to prove at test time that a maximal card still fits an NTAG213.
 */
export function ndefByteLength(records) {
  let msg = 0;
  for (const r of records) {
    if (r.recordType === 'url') {
      // TNF well-known, type 'U'. Payload = 1 abbreviation byte + the rest of
      // the URI; 'https://' is abbreviation 0x04.
      const rest = String(r.data).replace(/^https:\/\//, '');
      msg += 4 + 1 + new TextEncoder().encode(rest).length;
    } else {
      // TNF external. Header = flags + typeLen + payloadLen + the type string.
      const type = new TextEncoder().encode(r.recordType).length;
      const payload = r.data.length;
      msg += 3 + type + payload;
    }
  }
  // NDEF message TLV: tag 0x03, length (1 byte under 255), value, terminator.
  return 1 + (msg < 255 ? 1 : 3) + msg + 1;
}

export function fitsTag(records, tag = TARGET_TAG) {
  const cap = TAG_CAPACITY[tag];
  if (!cap) throw new Error(`fitsTag: unknown tag ${tag}`);
  return ndefByteLength(records) <= cap;
}
