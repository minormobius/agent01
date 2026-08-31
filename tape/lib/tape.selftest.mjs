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
import * as power from './power.js';
import * as pinmap from './pinmap.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  assert.equal(proto.url(proto.AP_ADDRESS, 'hello'), 'http://192.168.4.1/api/hello');
  assert.equal(proto.url('http://192.168.1.40', 'putCard', { cardId: 'ABC' }), 'http://192.168.1.40/api/card/ABC');
  assert.throws(() => proto.url(proto.AP_ADDRESS, 'putCard'), /needs a cardId/);
  assert.throws(() => proto.url(proto.AP_ADDRESS, 'nope'), /no such route/);
});

t('hello is checked before the studio writes anything', () => {
  const ok = { api: 1, name: 'tape', firmware: '0.1.0', freeBytes: 1e9, titles: 2, cards: 1 };
  assert.deepEqual(proto.validateHello(ok), []);
  assert.ok(proto.validateHello({ ...ok, api: 2 })[0].includes('box speaks api 2'));
  assert.equal(proto.validateHello({ ...ok, freeBytes: undefined }).length, 1);
});

t('THE INVARIANT: no origin can both record and upload', () => {
  // getUserMedia needs a secure context; the box cannot serve one; an HTTPS page
  // cannot reach the box. Every combination is checked, because this single fact
  // is why the pipeline has two halves with a file passing between them. If a
  // browser change ever makes this test fail, the whole studio can collapse into
  // one page — so failing loudly is the point.
  for (const isSecureContext of [true, false]) {
    for (const sameOriginAsBox of [true, false]) {
      if (isSecureContext && sameOriginAsBox) {
        // Not a combination the world offers: the box serves plain HTTP.
        assert.throws(() => proto.originCapabilities({ isSecureContext, sameOriginAsBox }),
          /cannot be a secure context/);
        continue;
      }
      const c = proto.originCapabilities({ isSecureContext, sameOriginAsBox });
      assert.ok(!(c.canRecord && c.canUpload),
        `secure=${isSecureContext} atBox=${sameOriginAsBox} claimed both`);
      assert.ok(c.canPickFile, 'a file input works on any origin — that is the bridge');
    }
  }
  // The one thing that would collapse the two halves into one page, and the
  // reason it is not in version one.
  const upgraded = proto.originCapabilities({
    isSecureContext: true, sameOriginAsBox: true, boxHasCertificate: true,
  });
  assert.ok(upgraded.canRecord && upgraded.canUpload);
  assert.equal(proto.TLS_UPGRADE.inVersionOne, false);
  assert.equal(proto.TLS_UPGRADE.costs.length, 3);
});

t('the public site records and writes tags; the box receives', () => {
  const site = proto.originCapabilities({ isSecureContext: true, sameOriginAsBox: false, hasNfc: true });
  assert.deepEqual(site, { canRecord: true, canWriteTag: true, canUpload: false, canPickFile: true });
  const box = proto.originCapabilities({ isSecureContext: false, sameOriginAsBox: true, hasNfc: false });
  assert.deepEqual(box, { canRecord: false, canWriteTag: false, canUpload: true, canPickFile: true });
  // An iPhone on the public site: records fine, cannot write a tag. Hence enrolment.
  const iphone = proto.originCapabilities({ isSecureContext: true, sameOriginAsBox: false, hasNfc: false });
  assert.equal(iphone.canRecord, true);
  assert.equal(iphone.canWriteTag, false);
});

t('localhost is the trap: the one origin where both halves work', () => {
  // A developer serving the box page from localhost sees recording and uploading
  // work together, because localhost is a secure context that is also plain HTTP.
  // Nothing else in the world behaves like that, so it must not be mistaken for
  // evidence that the constraint is soft.
  const fake = (hostname, protocol, secure) => ({
    location: { hostname, protocol }, isSecureContext: secure,
  });
  const dev = proto.capabilitiesHere(fake('localhost', 'http:', true));
  assert.ok(dev.canRecord && dev.canUpload, 'localhost is the misleading case');
  assert.ok(proto.isLocalDev(fake('127.0.0.1', 'http:', true)));

  // The same page on a real LAN address loses the microphone, which is the
  // failure a localhost-only test would never have shown.
  const real = proto.capabilitiesHere(fake('192.168.4.1', 'http:', false));
  assert.equal(real.canRecord, false);
  assert.equal(real.canUpload, true);
  assert.ok(!proto.isLocalDev(fake('192.168.4.1', 'http:', false)));

  // And the public site is the mirror image.
  const site = proto.capabilitiesHere(fake('tape.mino.mobi', 'https:', true));
  assert.equal(site.canRecord, true);
  assert.equal(site.canUpload, false);
});

t('the box is findable on its own AP with no router at all', () => {
  assert.deepEqual(proto.boxOrigins({ mode: 'ap' }), [proto.AP_ADDRESS]);
  assert.deepEqual(proto.boxOrigins({ mode: 'ap+sta', lanAddress: '192.168.1.40' }),
    ['http://192.168.1.40', 'http://tape.local', proto.AP_ADDRESS]);
  // A literal IP is first on the AP path on purpose: Android does not resolve
  // .local reliably, and the AP has no DNS worth trusting anyway.
  assert.ok(proto.AP_ADDRESS.includes('192.168.4.1'));
});

t('the path suggestion matches the situation', () => {
  assert.deepEqual(proto.suggestPath({ sameOriginAsBox: true, relayEnabled: false }), ['box', 'card']);
  assert.deepEqual(proto.suggestPath({ boxReachable: true, relayEnabled: true }), ['box', 'relay', 'card']);
  // Away from home the box is unreachable however much you want it to be.
  assert.deepEqual(proto.suggestPath({ remote: true, relayEnabled: true }), ['relay', 'card']);
  assert.deepEqual(proto.suggestPath({ remote: true, relayEnabled: false }), ['card']);
  assert.equal(proto.PATHS.box.cloud, false);
  assert.equal(proto.PATHS.card.cloud, false);
  assert.equal(proto.PATHS.relay.cloud, true);
});

t('a phone voice memo is an accepted upload', () => {
  assert.ok(proto.acceptsFile('New Recording 4.m4a'));   // iOS Voice Memos
  assert.ok(proto.acceptsFile('Recording_001.ogg'));     // Android Recorder
  assert.ok(proto.acceptsFile('chapter one.MP3'));       // a ripped audiobook
  assert.ok(!proto.acceptsFile('cover.jpg'));
});

t('an iPhone still gets a working flow, via the box', () => {
  assert.equal(proto.hasWebNfc(), false);   // none in node, and none in Safari
  const body = proto.enrollBody({ cardId: 'ABCDEFGHJKMNP', label: 'bedtime' });
  assert.equal(body.ttlSeconds, 60);
  assert.equal(body.cardId, 'ABCDEFGHJKMNP');
});

// ----------------------------------------------------------------- power --

t('the box is comfortably portable on the cell the BOM buys', () => {
  const cell = power.CELLS.find((c) => c.id === power.BOM_CELL);
  assert.ok(cell, 'BOM_CELL must name a cell in CELLS');
  const b = power.budget(cell.mAh);
  assert.ok(b.draw.play > 100 && b.draw.play < 160, `play draw ${b.draw.play} mA`);
  assert.ok(b.hours.play > 12, `${b.hours.play} h of stories on a charge`);
  assert.ok(b.daysPerCharge > 4, `${b.daysPerCharge} days between charges`);
});

t('even at the volume end stop it lasts an evening many times over', () => {
  assert.ok(power.hours(2500, 'play', { loud: true }) > 5);
});

t('duty-cycling the NFC field is what makes standby possible', () => {
  // Undo the duty cycle and idle draw roughly quadruples — this is the check
  // that stops someone "simplifying" the poll loop into a continuous field.
  const idle = power.drawMa('idle');
  const nfc = power.LOADS.find((l) => l.id === 'nfc');
  const continuous = idle - nfc.ma.idle + 65;
  assert.ok(idle < 20, `idle is ${idle} mA`);
  assert.ok(continuous / idle > 3, 'a continuous field should be visibly worse');
  assert.ok(power.hours(3000, 'idle') > 100);
});

t('deep sleep is bounded by the cell, not by the circuit', () => {
  assert.equal(power.hours(3000, 'sleep'), power.SELF_DISCHARGE_MONTHS * 730);
});

t('smaller cells still work; the model just says by how much', () => {
  for (const c of power.CELLS) {
    const h = power.hours(c.mAh, 'play');
    assert.ok(h > 5, `${c.name} gives only ${h} h`);
  }
  assert.throws(() => power.drawMa('dancing'), /no such state/);
});

// ---------------------------------------------------------------- pinmap --

t('no pin is assigned twice, reserved, or absent from the part', () => {
  // The whole reason this file exists. GPIO33–37 carry the octal PSRAM on any
  // R8 module and look completely free on the pinout drawing; GPIO22–25 do not
  // exist at all. Finding either with a multimeter costs an evening.
  assert.deepEqual(pinmap.problems(), []);
  assert.equal(new Set(pinmap.PINS.map((p) => p.gpio)).size, pinmap.PINS.length);
});

t('the reserved list actually catches a bad assignment', () => {
  // A test that only ever passes proves nothing, so break it on purpose.
  const good = pinmap.PINS.find((p) => p.net === 'LED');
  const original = good.gpio;
  for (const [bad, why] of [[35, 'octal PSRAM'], [24, 'does not exist'], [0, 'strapping'], [19, 'USB']]) {
    good.gpio = bad;
    assert.ok(pinmap.problems().length > 0, `GPIO${bad} (${why}) should have been rejected`);
  }
  good.gpio = original;
  assert.deepEqual(pinmap.problems(), []);
});

t('the analogue inputs are on ADC1, because ADC2 dies when WiFi is on', () => {
  for (const net of ['VOL_WIPER', 'VBAT_SENSE']) {
    const pin = pinmap.PINS.find((p) => p.net === net);
    assert.ok(pinmap.ADC1_PINS.has(pin.gpio), `${net} is on GPIO${pin.gpio}, not an ADC1 pin`);
  }
});

t('every part in the schematic has somewhere to be drawn', () => {
  for (const p of pinmap.PINS) assert.ok(p.group in pinmap.GROUPS, `${p.net} has group ${p.group}`);
  assert.equal(pinmap.byGroup().reduce((n, g) => n + g.pins.length, 0), pinmap.PINS.length);
  assert.ok(pinmap.spare().length > 4, 'leave room for whoever adds a screen');
  assert.ok(!pinmap.spare().some((g) => pinmap.NONEXISTENT.has(g)));
});

// ------------------------------------------------------------------- BOM --

const parts = JSON.parse(fs.readFileSync(
  new URL('../parts.json', import.meta.url), 'utf8'));

t('the bill of materials is well formed and priced two ways', () => {
  assert.equal(parts.schemaVersion, 1);
  assert.ok(parts.parts.length >= 10);
  const ids = new Set();
  for (const p of parts.parts) {
    assert.ok(!ids.has(p.id), `duplicate part id ${p.id}`);
    ids.add(p.id);
    for (const k of ['block', 'name', 'qty', 'usd', 'usdGeneric']) {
      assert.ok(p[k] !== undefined, `part ${p.id} is missing ${k}`);
    }
    assert.ok(p.usd >= p.usdGeneric, `${p.id}: the branded part should not be cheaper`);
  }
});

t('every source link is absolute, https, and carries a checked verdict', () => {
  const allowed = new Set(Object.keys(parts.checked.verdicts));
  let sources = 0;
  for (const p of parts.parts) {
    for (const src of p.sources) {
      sources++;
      assert.ok(src.url.startsWith('https://'), `${p.id}: ${src.url} is not https`);
      assert.ok(allowed.has(src.status), `${p.id}: unknown verdict ${src.status}`);
      assert.ok(src.vendor && src.sku !== undefined, `${p.id}: source needs a vendor and sku`);
    }
  }
  assert.ok(sources >= 15, `only ${sources} sources`);
  assert.match(parts.checked.at, /^\d{4}-\d{2}-\d{2}$/);
});

t('the parts that must be buyable have a verified link', () => {
  // Generic lines (an SD card, a deck of cards, hookup wire) need no link.
  // The ones with a specific chip in them do, and it must have been confirmed
  // to still be that chip — not merely to return 200.
  for (const id of ['mcu', 'nfc', 'amp', 'charger', 'cell']) {
    const p = parts.parts.find((x) => x.id === id);
    assert.ok(p.sources.some((s) => s.status === 'ok'),
      `${id} has no source verified as still being the right part`);
  }
});

t('the bench records what is owned, so the shopping list stays honest', () => {
  assert.ok(Array.isArray(parts.tools) && parts.tools.length >= 8);
  const ids = parts.tools.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate tool id');
  // priority is display order and NOTHING else — it briefly meant "is this on
  // the shopping list" too, and quietly swept an optional tool onto it.
  const shopping = parts.tools.filter((t) => !t.optional && t.owned === false).map((t) => t.priority);
  assert.equal(new Set(shopping).size, shopping.length, 'two shopping-list tools share a priority');
  for (const t of parts.tools) {
    assert.ok([true, false, 'partial'].includes(t.owned), `tool ${t.id}: owned must be set`);
    assert.equal(typeof t.optional, 'boolean', `tool ${t.id}: optional must be explicit`);
    assert.ok(t.why && t.why.length > 40, `tool ${t.id} needs a reason, not a label`);
    assert.ok(typeof t.usd === 'number');
    if (t.owned === true) assert.equal(t.usd, 0, `${t.id} is owned; it should not be in the total`);
  }
  // The meter is on the bench already. If a future edit ever un-owns it, the
  // crimper advice below has to change with it — they are linked.
  const dmm = parts.tools.find((t) => t.id === 'dmm');
  assert.equal(dmm.owned, true);
});

t('the connector line covers all three parts of a JST-XH connection', () => {
  // A JST-XH connection is housing + loose crimp contacts + a shrouded header
  // that solders into the board. Kits routinely ship the first two and not the
  // third, which is not visible from the product title — so the link check
  // (which verifies identity, not sufficiency) cannot catch it. This can.
  const kit = parts.tools.find((t) => t.id === 'jstxh');
  for (const part of [/housing/i, /contact/i, /header/i]) {
    assert.match(kit.why, part, `the kit description must account for ${part}`);
  }
  assert.ok(kit.sources.some((s) => s.status === 'ok'));
});

t('the wire line names stranded, because solid is the adjacent trap', () => {
  // Adafruit 3111 (stranded) and 1311 (solid) have near-identical titles, and
  // the link check cannot tell them apart — it matches on "Stranded-Core"
  // precisely so a slip to the solid twin fails here rather than at the bench.
  const wire = parts.tools.find((t) => t.id === 'wire');
  assert.match(wire.name, /STRANDED/);
  assert.ok(wire.sources.every((s) => /Stranded-Core/i.test(s.expect)),
    'every wire source must be verified as stranded, not merely as wire');
  assert.ok(wire.sources.some((s) => s.status === 'ok'));
});

t('headers are the top of the shopping list', () => {
  // If this ever gets demoted as "just a passive", the build turns back into a
  // harness project and four interconnects come back as cables.
  const needed = parts.tools.filter((t) => t.owned === false && !t.optional)
    .sort((a, b) => a.priority - b.priority);
  assert.equal(needed[0].id, 'headers', `top of the list is ${needed[0].id}`);
});

t('nothing already owned is counted in the shopping list', () => {
  // The claim this protects is not "the list is small" — that moved the moment
  // the crimper became a real recommendation, and the test failing is what
  // forced the prose to be restated. The durable claim is narrower: an owned
  // tool contributes nothing, so the total is what is actually being spent.
  const owned = parts.tools.filter((t) => t.owned === true);
  assert.ok(owned.length >= 3, 'the bench should be recorded, not assumed');
  assert.equal(owned.reduce((n, t) => n + t.usd, 0), 0);

  const must = parts.tools.filter((t) => t.owned === false && !t.optional);
  assert.ok(must.length >= 3);
  const total = must.reduce((n, t) => n + t.usd, 0);
  assert.ok(total > 0 && total < 200, `must-buy total is $${total}`);
});

t('the enclosure routes keep metal away from the reader', () => {
  // The one enclosure failure that is silent: a conductive layer over the
  // antenna detunes it and the card just never reads. Every route has to say so.
  assert.ok(Array.isArray(parts.enclosure) && parts.enclosure.length >= 3);
  const laser = parts.enclosure.find((e) => /laser/i.test(e.route));
  assert.match(laser.note, /NEVER metal|never metal/,
    'the laser-cut route must warn against ordering it in metal');
  for (const e of parts.enclosure) {
    assert.ok(e.note && e.note.length > 40, `${e.route} needs a real note`);
    for (const src of e.sources) {
      assert.ok(src.url.startsWith('https://'));
      assert.ok(Object.keys(parts.checked.verdicts).includes(src.status));
    }
  }
  // At least one route must be buyable from a verified link; the craft-box route
  // deliberately has none, because stock turns over and the spec is the answer.
  assert.ok(parts.enclosure.some((e) => e.sources.some((s) => s.status === 'ok')));
});

// ------------------------------------------------------------ power chain --

t('the power chain the BOM buys is the one the budget assumes', () => {
  assert.equal(power.DEFAULT_CHAIN, 'boost5v');
  assert.ok(parts.parts.some((p) => p.id === 'boost'), 'the BOM must contain the buck-boost');
  // The boost path costs runtime. If that ever stops being true the model is wrong.
  assert.ok(power.drawMa('play', { chain: 'boost5v' }) > power.drawMa('play', { chain: 'direct' }));
  assert.throws(() => power.drawMa('play', { chain: 'wishful' }), /no such power chain/);
});

console.log(`tape: ${n} checks passed`);
