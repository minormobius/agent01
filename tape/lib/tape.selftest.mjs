// tape/lib/tape.selftest.mjs — known-answer tests for the card, the manifest
// and the box protocol. Run by scripts/preflight.mjs.
//
// The load-bearing assertion is `a maximal card still fits an NTAG213`. If a
// future change to the record layout breaks it, the £0.15 sticker stops being
// the target hardware and the project gets more expensive. Fail loudly.

import assert from 'node:assert/strict';
import * as tag from './tag.js';
import * as cat from './catalog.js';
import * as proto from './protocol.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

// ------------------------------------------------------------------- tag --

t('base32 round-trips every byte value', () => {
  for (let i = 0; i < 256; i++) {
    const b = Uint8Array.from([i, 255 - i, i ^ 0x5a, i, 0, 255, i, 1]);
    assert.deepEqual([...tag.base32Decode(tag.base32Encode(b))], [...b]);
  }
});

t('base32 uses the Crockford alphabet and forgives eye-copy errors', () => {
  assert.equal(tag.base32Encode(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0])), '0000000000000');
  assert.ok(!/[ILOU]/.test(tag.base32Encode(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))));
  // O read as 0, I and L read as 1.
  assert.deepEqual([...tag.base32Decode('O123456789ABC')], [...tag.base32Decode('0123456789ABC')]);
  assert.deepEqual([...tag.base32Decode('1I23456789ABC')], [...tag.base32Decode('1123456789ABC')]);
});

t('a card id is 13 characters and recognised as one', () => {
  const id = tag.newCardId();
  assert.equal(id.length, tag.CARD_ID_CHARS);
  assert.ok(tag.isCardId(id));
  assert.ok(tag.isCardId(id.toLowerCase()));
  assert.ok(!tag.isCardId(id.slice(1)));
  assert.ok(!tag.isCardId('not a card'));
});

t('card bodies round-trip, label and flags included', () => {
  const card = { id: tag.newCardId(), label: 'Where the Wild Things Are', flags: tag.FLAG_RESUME | tag.FLAG_SHUFFLE };
  const back = tag.decodeCard(tag.encodeCard(card));
  assert.equal(back.id, card.id);
  assert.equal(back.label, card.label);
  assert.equal(back.flags, card.flags);
  assert.equal(back.version, tag.CARD_VERSION);
});

t('a label with multi-byte characters is measured in bytes, not characters', () => {
  const id = tag.newCardId();
  assert.equal(tag.decodeCard(tag.encodeCard({ id, label: 'Dénouement — 🦉' })).label, 'Dénouement — 🦉');
  assert.throws(() => tag.encodeCard({ id, label: '🦉'.repeat(9) }), /max 32/);
});

t('a foreign or future tag is refused rather than misread', () => {
  assert.throws(() => tag.decodeCard(Uint8Array.from([1, 2, 3])), /too short/);
  assert.throws(() => tag.decodeCard(new Uint8Array(20)), /not a tape card/);
  const bumped = tag.encodeCard({ id: tag.newCardId(), label: 'x' });
  bumped[2] = 99;
  assert.throws(() => tag.decodeCard(bumped), /card version 99/);
});

t('THE CONSTRAINT: a maximal card fits the cheapest tag we target', () => {
  const card = { id: tag.newCardId(), label: 'x'.repeat(tag.LABEL_MAX_BYTES), flags: 0xff };
  const records = tag.ndefRecords(card);
  const bytes = tag.ndefByteLength(records);
  assert.ok(bytes <= tag.TAG_CAPACITY[tag.TARGET_TAG],
    `a full card is ${bytes} bytes; ${tag.TARGET_TAG} holds ${tag.TAG_CAPACITY[tag.TARGET_TAG]}`);
  assert.ok(tag.fitsTag(records));
  // ...and it does NOT fit the one tag smaller, which is why NTAG213 is the floor.
  assert.ok(!tag.fitsTag(records, 'MIFARE Ultralight'));
});

t('THE OTHER CONSTRAINT: no tag on the market can hold the audio', () => {
  const oneMinute = cat.encodedBytes(60);
  const biggest = Math.max(...Object.values(tag.TAG_CAPACITY));
  assert.ok(oneMinute / biggest > 20,
    'if a tag ever holds a minute of speech, revisit the whole pointer design');
  // The biggest tag sold holds under three seconds of speech.
  assert.ok(biggest / (cat.encodedBytes(1)) < 5);
});

t('both records are written: one for phones, one for the box', () => {
  const records = tag.ndefRecords({ id: tag.newCardId(), label: 'Owl Babies' });
  assert.equal(records.length, 2);
  assert.equal(records[0].recordType, 'url');
  assert.ok(records[0].data.startsWith('https://tape.mino.mobi/c/'));
  assert.equal(records[1].recordType, tag.CARD_EXTERNAL_TYPE);
  assert.ok(records[1].data instanceof Uint8Array);
});

// --------------------------------------------------------------- catalog --

const demo = () => {
  const m = cat.emptyManifest();
  cat.addTitle(m, { id: 'wild-things', title: 'Where the Wild Things Are', reader: 'Dad',
    tracks: [{ name: 'The whole thing', seconds: 380 }] });
  cat.addTitle(m, { id: 'owl-babies', title: 'Owl Babies', reader: 'Mum',
    tracks: [{ name: 'Part one', seconds: 150 }, { name: 'Part two', seconds: 140 }] });
  return m;
};

t('an empty manifest validates', () => {
  assert.deepEqual(cat.validateManifest(cat.emptyManifest()), []);
});

t('track paths are derived, never author-supplied', () => {
  const m = demo();
  assert.equal(m.titles['owl-babies'].tracks[1].file, '/tape/audio/owl-babies/001.opus');
  assert.deepEqual(cat.validateManifest(m), []);
  m.titles['owl-babies'].tracks[1].file = '/tape/audio/owl-babies/wrong.opus';
  assert.ok(cat.validateManifest(m).some((s) => /expected/.test(s)));
});

t('many books on one card is just a longer array', () => {
  const m = demo();
  const one = tag.newCardId(), six = tag.newCardId();
  cat.bindCard(m, one, ['wild-things'], { label: 'the wild things card' });
  cat.bindCard(m, six, ['wild-things', 'owl-babies'], { label: 'bedtime', mode: 'shuffle' });
  assert.equal(cat.playlistTracks(m, one).length, 1);
  assert.equal(cat.playlistTracks(m, six).length, 3);
  assert.equal(cat.playlistTracks(m, six)[2].title, 'Owl Babies');
  assert.equal(cat.playlistTracks(m, tag.newCardId()), null);
  assert.deepEqual(cat.validateManifest(m), []);
});

t('a card cannot be pointed at a title that is not there', () => {
  assert.throws(() => cat.bindCard(cat.emptyManifest(), tag.newCardId(), ['ghost']), /no such title/);
  assert.throws(() => cat.bindCard(demo(), tag.newCardId(), ['wild-things'], { mode: 'jazz' }), /unknown mode/);
});

t('orphans are findable so the SD card can be swept', () => {
  const m = demo();
  cat.bindCard(m, tag.newCardId(), ['wild-things']);
  assert.deepEqual(cat.orphanTitles(m), ['owl-babies']);
});

t('the size sums the design record quotes', () => {
  // 24 kbps mono Opus: a minute is ~180 kB, an hour ~11 MB.
  assert.ok(Math.abs(cat.encodedBytes(60) - 183_600) < 1000);
  assert.ok(Math.abs(cat.encodedBytes(3600) / 1e6 - 11) < 0.5);
  // A 32 GB card holds well over a thousand hours — capacity is a non-problem.
  assert.ok(cat.hoursPerCard(32) > 1000);
  const m = demo();
  assert.equal(cat.stats(m).titles, 2);
  assert.equal(cat.stats(m).tracks, 3);
  assert.equal(cat.stats(m).seconds, 670);
});

// -------------------------------------------------------------- protocol --

t('routes build absolute urls and refuse missing parameters', () => {
  assert.equal(proto.url(proto.DEFAULT_BOX_ORIGIN, 'hello'), 'http://tape.local/api/hello');
  assert.equal(proto.url('http://192.168.1.40', 'putCard', { cardId: 'ABC' }), 'http://192.168.1.40/api/card/ABC');
  assert.throws(() => proto.url(proto.DEFAULT_BOX_ORIGIN, 'putCard'), /needs a cardId/);
  assert.throws(() => proto.url(proto.DEFAULT_BOX_ORIGIN, 'nope'), /no such route/);
});

t('hello is checked before the studio writes anything', () => {
  const ok = { api: 1, name: 'tape', firmware: '0.1.0', freeBytes: 1e9, titles: 2, cards: 1 };
  assert.deepEqual(proto.validateHello(ok), []);
  assert.ok(proto.validateHello({ ...ok, api: 2 })[0].includes('box speaks api 2'));
  assert.ok(proto.validateHello({ ...ok, freeBytes: undefined }).length === 1);
});

t('mixed content is why the public studio cannot reach the box', () => {
  const fromPublicSite = { sameOriginAsBox: false, pageIsHttps: true, relayEnabled: false };
  assert.deepEqual(proto.availableTransports(fromPublicSite), ['card']);
  assert.match(proto.transportBlockedReason('lan', fromPublicSite), /http:\/\/tape\.local/);

  const fromTheBox = { sameOriginAsBox: true, pageIsHttps: false, relayEnabled: false };
  assert.deepEqual(proto.availableTransports(fromTheBox), ['lan', 'card']);
  assert.equal(proto.transportBlockedReason('lan', fromTheBox), null);

  const withRelay = { sameOriginAsBox: false, pageIsHttps: true, relayEnabled: true };
  assert.deepEqual(proto.availableTransports(withRelay), ['relay', 'card']);
});

t('an iPhone still gets a working flow, via the box', () => {
  // No NDEFReader in node, and none in Safari either.
  assert.equal(proto.hasWebNfc(), false);
  const body = proto.enrollBody({ cardId: 'ABCDEFGHJKMNP', label: 'bedtime' });
  assert.equal(body.ttlSeconds, 60);
  assert.equal(body.cardId, 'ABCDEFGHJKMNP');
});

console.log(`tape: ${n} checks passed`);
