// test.mjs — tape wave 1. Each test names the SPEC clause it holds. Writes evidence.json. (Modulo, day 1)
import { writeFileSync } from 'node:fs';
import { isDeepStrictEqual as deq } from 'node:util';
import { boot, GONE_S, CARDS, CARDS_NEW, parseBindings, cardIdOf } from './tape1.mjs';
import { encode, decode } from './harness.mjs';
import { makeSD, makeFlash, PowerCut } from './fakesd.mjs';
import { stamp } from './fresh.mjs';
import { readFileSync } from 'node:fs';
import { encodeCard, base32Encode, CARD_EXTERNAL_TYPE, ndefRecords } from './tape-lib/tag.js';

const results = [];
const perReq = {};
async function test(req, name, fn) {
  const check = `${req.toLowerCase()}-${(perReq[req] = (perReq[req] || 0) + 1)}`;
  try { await fn(); results.push({ check, req, name, ok: true }); console.log('ok  ', req, name); }
  catch (e) { results.push({ check, req, name, ok: false, error: String(e && e.stack || e) }); console.log('FAIL', req, name, '\n ', e && e.message); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => assert(deq(a, b), `${m || ''} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);

let s = 12345;
const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
const idFrom = (n) => base32Encode(Uint8Array.from({ length: 8 }, (_, i) => (n * 37 + i * 11) & 255));
const tag = (n) => ({ uid: 'AB' + n.toString(16).padStart(6, '0').toUpperCase(), records: ndefRecords({ id: idFrom(n) }) });
const blank = (n) => ({ uid: 'C0FE' + n.toString(16).toUpperCase(), records: null });
const corrupt = (n) => ({ uid: 'DEAD' + n.toString(16).toUpperCase(), records: [{ recordType: CARD_EXTERNAL_TYPE, data: Uint8Array.from([1, 2, 3]) }] });
const library = (titles) => {
  const files = {};
  for (const [name, tracks] of Object.entries(titles)) for (const tr of tracks) files[`/tape/audio/${name}/${tr}`] = 'audio';
  return files;
};
const ev = (box, type) => box.events.filter((e) => e.type === type);
const logKinds = (sd) => (sd.read('/tape/log.txt') || '').split('\n').filter(Boolean).map((l) => l.split('\t')[1]);

// hold a card for `secs` at 20 Hz with miss rate p, starting at t0; returns last poll time
async function hold(box, card, t0, secs, p = 0) {
  let t = t0;
  for (let i = 0; i < secs * 20; i++) { t = t0 + i / 20; await box.poll(t, rnd() < p ? null : card); }
  return t;
}

// poll `card` every 0.5 s over (from, to]: a card resting on the pad while tracks play
async function keep(box, card, from, to) { for (let t = from + 0.5; t <= to + 1e-9; t += 0.5) await box.poll(t, card); }

// ---------- H
await test('H', 'encode/decode round-trips specials, look-alike tags, absent fields', () => {
  const vals = [NaN, Infinity, -Infinity, -0, null, 0, '', 'NaN', '$', { $: 'NaN' }, { $$: 1 }, { $: 'undefined' },
    [NaN, null, undefined, -0], { a: { b: [Infinity, { $: '-0' }] } }, { x: null }, JSON.parse('{"__proto__":{"$":"NaN"}}')];
  for (const v of vals) {
    const d = decode(encode(v));
    assert(Object.is(d, v) || deq(d, v), `round-trip ${encode(v)}`);
  }
  assert(Number.isNaN(decode(encode({ r: NaN })).r), 'NaN field');
  eq(decode(encode({ r: NaN })).r === null, false, 'NaN is not null');
  eq(Object.keys(decode(encode({ a: undefined, b: 1 }))), ['b'], 'undefined stays absent');
  eq(decode(encode('NaN')), 'NaN', 'string NaN stays a string (fi-5f90c6)');
  eq(Object.getPrototypeOf(decode(encode(JSON.parse('{"__proto__":{"p":1}}')))), Object.prototype, 'no proto change');
});

// ---------- titles
await test('T', 'titles: regex, decodable extensions, ._ files ignored, code-unit order, bad folders logged', async () => {
  const files = { ...library({ 'b-book': ['02.MP3', '01.m4a', '._01.m4a', 'cover.jpg', '10.ogg'], 'a1': ['x.flac'], 'Bad': ['1.mp3'], 'empty': ['notes.txt'] }) };
  const sd = makeSD(files);
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  eq([...box.titles.keys()], ['a1', 'b-book']);
  eq(box.titles.get('b-book'), ['01.m4a', '02.MP3', '10.ogg']);
  eq(logKinds(sd).filter((k) => k === 'bad-folder').length, 2);
});

// ---------- W1
await test('W1', 'an hour at 20 Hz, 25% missed at random: never gone', async () => {
  const sd = makeSD(library({ a: ['1.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  await hold(box, tag(1), 0, 3600, 0.25);
  eq(ev(box, 'pause').length, 0); eq(ev(box, 'play').length, 1);
});

// ---------- W2
await test('W2', 'removed card: pause at last good read + GONE_S (≤ 1.25)', async () => {
  const sd = makeSD(library({ a: ['1.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  const last = await hold(box, tag(1), 0, 2);
  for (let i = 1; i <= 40; i++) await box.poll(last + i / 20, null);
  const p = ev(box, 'pause');
  eq(p.length, 1); assert(p[0].t <= last + 1.25 + 1e-9 && p[0].t > last, `pause at ${p[0].t}`);
  eq(p[0].t, last + GONE_S);
});
await test('W2', 'pause t is between polls when the timer runs out between them; never before prior input', async () => {
  const sd = makeSD(library({ a: ['1.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  await box.poll(5, tag(1)); await box.poll(9, null);
  eq(ev(box, 'pause')[0].t, 6);
});
await test('W2', 'card swapped for another: first gone and second placed at that poll', async () => {
  const sd = makeSD(library({ a: ['1.mp3'], b: ['1.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  await box.poll(1, tag(1)); await box.poll(1.05, tag(2));
  eq(box.events.filter((e) => e.type !== 'bound').map((e) => [e.type, e.t, e.title]), [['play', 1, 'a'], ['pause', 1.05, undefined], ['play', 1.05, 'b']]);
});
await test('W2', 'D-tornread: a torn read of the card on the pad is a miss, not a phantom card; another uid still swaps', async () => {
  const sd = makeSD(library({ a: ['1.mp3'], b: ['1.mp3'], c: ['1.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  const good = tag(1);
  // cut before the tape record: only the URL record came back. (A cut *inside* it is D-known's, b-1.)
  const torn = { uid: good.uid.toLowerCase(), records: good.records.filter((r) => r.recordType !== CARD_EXTERNAL_TYPE) };
  await box.poll(1, good);
  for (let i = 1; i <= 10; i++) await box.poll(1 + i / 20, i % 3 ? torn : good);   // torn reads mid-sitting
  eq(ev(box, 'bound').map((e) => e.title), ['a'], 'no phantom bound');
  eq(ev(box, 'pause').length, 0, 'no stutter');
  const last = 1.5;                                                                  // i = 10 was torn; 9 was good
  for (let i = 1; i <= 30; i++) await box.poll(last + i / 20, i <= 18 ? torn : null); // torn till 2.4, then empty
  eq(ev(box, 'pause').map((e) => e.t), [1.45 + GONE_S], 'torn reads do not hold the card either');
  eq(ev(box, 'bound').length, 1, 'and still no phantom');
  await box.poll(5, good); await box.poll(5.05, blank(1));                            // a different uid swaps at once
  eq(ev(box, 'bound').map((e) => e.title), ['a', 'b']);
  eq(ev(box, 'pause').at(-1).t, 5.05);
});
await test('B', 'D-known: a written card read torn on placing (after a lift, a crowd, a reboot) binds no phantom; first-ever torn, blank and URL-only reads stay uid: per SPEC', async () => {
  const sd = makeSD(library({ a: ['1.mp3'], b: ['1.mp3'], c: ['1.mp3'], d: ['1.mp3'], e: ['1.mp3'], f: ['1.mp3'] }));
  const flash = makeFlash();
  let box = await boot({ sd, flash, t: 0 });
  const good = tag(2);
  const torn = { uid: good.uid.toLowerCase(), records: good.records.map((r) => ({ ...r, data: r.data.slice(0, 3) })) };
  await box.poll(0, good);                                                    // seen good once: a
  await box.poll(3, torn); await box.poll(3.05, good);                        // after a lift
  await box.poll(3.1, { crowd: true }); await box.poll(3.15, torn); await box.poll(3.2, good);  // after a crowd
  eq(ev(box, 'bound').map((e) => e.card), [cardIdOf(good)], 'no phantom in this session');
  eq(ev(box, 'play').map((e) => [e.t, e.title]), [[0, 'a'], [3.05, 'a'], [3.2, 'a']], 'torn placing read waits for the good one');
  box = await boot({ sd, flash, t: 10 });                                     // the memory is in flash
  await box.poll(10, torn); await box.poll(10.05, good);
  eq(ev(box, 'bound').length, 0, 'no phantom after a reboot');
  eq(ev(box, 'play').map((e) => e.title), ['a']);
  // what SPEC still says: a never-seen tag read torn, a wiped tag, a tag with only a URL record
  const fresh = tag(3), freshTorn = { uid: fresh.uid, records: fresh.records.map((r) => ({ ...r, data: r.data.slice(0, 3) })) };
  await box.poll(20, freshTorn);
  await box.poll(30, { uid: good.uid, records: null });
  await box.poll(40, { uid: good.uid, records: good.records.filter((r) => r.recordType !== CARD_EXTERNAL_TYPE) });
  const u = 'uid:' + good.uid.toLowerCase();
  eq(ev(box, 'bound').map((e) => [e.card, e.title]), [['uid:' + fresh.uid.toLowerCase(), 'b'], [u, 'c']], 'spec ids still bind');
  eq(ev(box, 'play').at(-1).card, u, 'URL-only read of a remembered uid is uid: too');
  // a never-seen corrupt card stays uid: on every placement (the lab's corrupt cards)
  const bad = corrupt(7);
  await box.poll(50, bad); await box.poll(52, bad);
  eq(ev(box, 'play').filter((e) => e.card === 'uid:' + bad.uid.toLowerCase()).length, 2, 'corrupt card plays its book each time');
});

// ---------- W3
await test('W3', 'crowd pauses at that poll, nulls keep it, nothing happens inside, single read places again', async () => {
  const sd = makeSD(library({ a: ['1.mp3', '2.mp3'], b: ['1.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  await box.poll(1, tag(1)); await box.poll(1.9, tag(1));
  await box.poll(2, { crowd: true });
  eq(ev(box, 'pause').map((e) => e.t), [2], 'pause at the crowd poll, not by the gone-timer');
  for (let t = 2.05; t < 10; t += 0.5) await box.poll(t, null);
  await box.poll(10, { crowd: true });
  eq(box.events.length, 3, 'only bound, play, pause');
  await box.poll(11, tag(1));
  eq(ev(box, 'play').map((e) => [e.t, e.track]), [[1, 0], [11, 0]]);
});
await test('W3', 'finished card read alone after a crowd starts from track 0', async () => {
  const sd = makeSD(library({ a: ['1.mp3', '2.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  await box.poll(1, tag(1)); await keep(box, tag(1), 1, 2); await box.trackEnded(2); await keep(box, tag(1), 2, 3); await box.trackEnded(3);
  eq(ev(box, 'finished').length, 1);
  await box.poll(3.5, tag(1)); eq(ev(box, 'play').length, 2, 'silent after finished');
  await box.poll(4, { crowd: true }); eq(ev(box, 'pause').length, 0, 'silent: no pause');
  await box.poll(5, tag(1));
  eq(ev(box, 'play').at(-1).track, 0);
});

// ---------- P
await test('P', 'resume where it stopped this session; next boot starts at 0; leave while silent gives nothing', async () => {
  const sd = makeSD(library({ a: ['1.mp3', '2.mp3', '3.mp3'] }));
  const flash = makeFlash();
  let box = await boot({ sd, flash, t: 0 });
  await box.poll(1, tag(1)); await keep(box, tag(1), 1, 2); await box.trackEnded(2);
  await box.poll(3, null); await box.poll(5, null);           // gone at 4
  await box.poll(6, tag(1));
  eq(ev(box, 'play').map((e) => [e.track, e.file]), [[0, '1.mp3'], [1, '2.mp3'], [1, '2.mp3']]);
  await keep(box, tag(1), 6, 7); await box.trackEnded(7); await keep(box, tag(1), 7, 8); await box.trackEnded(8);
  eq(ev(box, 'finished'), [{ t: 8, type: 'finished', title: 'a' }]);
  await box.poll(8.5, tag(1)); await box.poll(20, null);
  eq(ev(box, 'pause').length, 1, 'leaving while silent: nothing');
  await box.poll(21, tag(1));
  eq(ev(box, 'play').at(-1).track, 0, 'finished, off and back on: track 0 (same session)');
  box = await boot({ sd, flash, t: 100 });
  await box.poll(100, tag(1)); eq(ev(box, 'play')[0].track, 0);
});

// ---------- B
await test('B', 'bind first free title, cue + unknown.txt when none free, every placement', async () => {
  const sd = makeSD(library({ b: ['1.mp3'], a: ['1.mp3'] }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  await box.poll(1, tag(1)); await box.poll(2, blank(9)); await box.poll(3, corrupt(4));
  await box.poll(4, null); await box.poll(6, corrupt(4));
  eq(ev(box, 'bound').map((e) => e.title), ['a', 'b']);
  eq(ev(box, 'bound')[1].card, 'uid:c0fe9');
  eq(ev(box, 'cue').map((e) => e.card), ['uid:dead4', 'uid:dead4']);
  eq(sd.read('/tape/unknown.txt'), 'uid:dead4\nuid:dead4\n');
  const j = parseBindings(sd.read(CARDS));
  eq(j[idFrom(1)], 'a');
  for (const p of sd.files.keys()) if (p.startsWith('/tape/audio')) assert(sd.read(p) === 'audio');
});

// ---------- C: a cut at every step of a bind
await test('C', 'cut at every step of a bind: next boot sees old, or old + exactly that bind', async () => {
  const base = { ...library({ a: ['1.mp3'], b: ['1.mp3'] }), [CARDS]: JSON.stringify({ [idFrom(1)]: 'a' }) };
  let sawNew = false, sawOld = false;
  for (let cut = 0; cut < 12; cut++) {
    const sd = makeSD(base); const flash = makeFlash();
    const b1 = await boot({ sd, flash, t: 0 });
    sd.cutAt = sd.steps + cut;
    let threw = false;
    try { await b1.poll(1, tag(2)); } catch (e) { if (!(e instanceof PowerCut)) throw e; threw = true; }
    sd.cutAt = -1;
    // the file alone must decide (a box with no mirror reads the same card)
    const files = new Map(sd.files);
    const b0 = await boot({ sd: makeSD(Object.fromEntries(files)), flash: makeFlash(), t: 10 });
    assert(deq(b0.bindings, { [idFrom(1)]: 'a' }) || deq(b0.bindings, { [idFrom(1)]: 'a', [idFrom(2)]: 'b' }), `cut ${cut}, file alone: ${JSON.stringify(b0.bindings)}`);
    const b2 = await boot({ sd, flash, t: 10 });
    const old = { [idFrom(1)]: 'a' }, nw = { ...old, [idFrom(2)]: 'b' };
    const got = b2.bindings;
    assert(deq(got, old) || deq(got, nw), `cut ${cut}: ${JSON.stringify(got)}`);
    if (deq(got, nw)) sawNew = true; else sawOld = true;
    if (ev(b1, 'bound').length) assert(deq(got, nw), 'bound emitted but not durable');
    if (!threw) break;
  }
  assert(sawNew && sawOld);
});

// ---------- K
await test('K', 'cards.json missing → restore from mirror; {} decides; hand edit then loss comes back as edit', async () => {
  const sd = makeSD(library({ a: ['1.mp3'], b: ['1.mp3'] })); const flash = makeFlash();
  let box = await boot({ sd, flash, t: 0 });
  eq(ev(box, 'restore').length, 0, 'new box: no restore');
  await box.poll(1, tag(1));
  sd.files.delete(CARDS);
  box = await boot({ sd, flash, t: 10 });
  eq(ev(box, 'restore').length, 1); eq(box.bindings, { [idFrom(1)]: 'a' });
  sd.files.set(CARDS, '{}');
  box = await boot({ sd, flash, t: 20 }); eq(ev(box, 'restore').length, 0); eq(box.bindings, {});
  sd.files.set(CARDS, JSON.stringify({ [idFrom(7)]: 'b' }));
  box = await boot({ sd, flash, t: 30 });
  sd.files.set(CARDS, '{"oops": '); // mangled by the laptop
  box = await boot({ sd, flash, t: 40 });
  eq(ev(box, 'restore').length, 1); eq(box.bindings, { [idFrom(7)]: 'b' });
  eq(sd.read('/tape/cards.bad'), '{"oops": ', 'mangled text kept');
  sd.files.set(CARDS, 'junk'); sd.files.set(CARDS_NEW, JSON.stringify({ x: 'a' }));
  box = await boot({ sd, flash, t: 50 }); eq(ev(box, 'restore').length, 0); eq(box.bindings, { x: 'a' });
});

await test('K', 'a mangled cards.json is kept even with no mirror, and a second mangle never overwrites the first (D-bad, Morphyx)', async () => {
  const sd = makeSD({ ...library({ a: ['1.mp3'], b: ['1.mp3'] }), [CARDS]: '{"x": "a",,}' }); const flash = makeFlash();
  let box = await boot({ sd, flash, t: 0 });
  eq(ev(box, 'restore').length, 0, 'new box: nothing to restore');
  await box.poll(1, tag(1));
  eq(sd.read('/tape/cards.bad'), '{"x": "a",,}', 'first bind must not overwrite the person\'s text');
  eq(parseBindings(sd.read(CARDS)), { [idFrom(1)]: 'a', _gen: 1 });
  sd.files.set(CARDS, 'SECOND');
  box = await boot({ sd, flash, t: 10 });
  eq(sd.read('/tape/cards.bad'), '{"x": "a",,}', 'first mangle still there');
  eq(sd.read('/tape/cards.bad.2'), 'SECOND', 'second mangle beside it');
  eq(box.bindings, { [idFrom(1)]: 'a' }, 'mirror restored');
});

// Every boot repair path, cut at every SD step of boot + one bind, then booted twice clean:
// bindings are the old or old + that bind, the second clean boot agrees and owes no restore.
await test('C', 'cut at every step of every boot repair path plus a bind (Morphyx)', async () => {
  const lib = library({ aa: ['1.mp3'], bb: ['1.mp3'], cc: ['1.mp3'] });
  const old = JSON.stringify({ [idFrom(9)]: 'aa', _gen: 1 });
  const mir = { v: 1, titles: ['aa', 'bb', 'cc'], mirror: { [idFrom(9)]: 'aa', _gen: 1 } };
  const starts = {
    fresh: [{}, null], json: [{ [CARDS]: old }, null],
    strayNew: [{ [CARDS]: old, [CARDS_NEW]: JSON.stringify({ [idFrom(9)]: 'aa', [idFrom(8)]: 'bb', _gen: 2 }) }, null],
    newOnly: [{ [CARDS_NEW]: old }, null], mangledPlusNew: [{ [CARDS]: 'oops', [CARDS_NEW]: old }, null],
    mangledNoMirror: [{ [CARDS]: 'oops' }, null],
    mirror: [{}, mir], mirrorMangled: [{ [CARDS]: 'oops' }, mir],
  };
  for (const [name, [extra, fl]] of Object.entries(starts)) {
    const sd0 = makeSD({ ...lib, ...extra }); const f0 = makeFlash(fl);
    const b0 = await boot({ sd: sd0, flash: f0, t: 0 }); const before = encode(b0.bindings);
    await b0.poll(1, tag(1)); const after = encode(b0.bindings);
    assert(before !== after, `${name}: the clean run binds`);
    for (let k = 0; k < sd0.steps; k++) {
      const sd = makeSD({ ...lib, ...extra }, { cutAt: k }); const flash = makeFlash(fl);
      let cut = false;
      try { const b = await boot({ sd, flash, t: 0 }); await b.poll(1, tag(1)); } catch (e) { if (!(e instanceof PowerCut)) throw e; cut = true; }
      assert(cut, `${name} step ${k}: no cut happened`);
      sd.cutAt = -1;
      const b2 = await boot({ sd, flash, t: 5 });
      assert([before, after].includes(encode(b2.bindings)), `${name} cut at ${k}: ${encode(b2.bindings)}`);
      const b3 = await boot({ sd, flash, t: 9 });
      eq(encode(b3.bindings), encode(b2.bindings), `${name} cut at ${k}: repair didn't stick`);
      eq(ev(b3, 'restore').length, 0, `${name} cut at ${k}: restore owed after repair`);
      if (extra[CARDS] === 'oops') assert([...sd.files.values()].includes('oops'), `${name} cut at ${k}: mangled text lost`);
    }
  }
});

// ---------- U
await test('U', 'log: boot, sd-change only when titles differ from this box\'s last boot, bind, finished, restore', async () => {
  const sd = makeSD(library({ a: ['1.mp3'] })); const flash = makeFlash();
  let box = await boot({ sd, flash, t: 0 });
  await box.poll(1, tag(1)); await box.poll(1.5, tag(1)); await box.trackEnded(2);
  box = await boot({ sd, flash, t: 10 });
  sd.files.set('/tape/audio/new-book/1.mp3', 'audio');
  box = await boot({ sd, flash, t: 20 });
  const lines = sd.read('/tape/log.txt').split('\n').filter((l) => l.includes('\tboot'));
  eq(lines.map((l) => l.split('\t').includes('sd-change')), [false, false, true]);
  const k = logKinds(sd);
  eq(['bind', 'finished'].map((x) => k.filter((y) => y === x).length), [1, 1]);
  const box2 = await boot({ sd, flash: makeFlash(), t: 30 });   // another box, same card: no sd-change
  assert(!sd.read('/tape/log.txt').trim().split('\n').at(-1).includes('sd-change'));
  void box2;
});

await test('U', 'a torn log line from a cut does not swallow the next boot line', async () => {
  const sd = makeSD({ ...library({ a: ['1.mp3'] }), '/tape/log.txt': '5\tboot\n9\tfini', '/tape/unknown.txt': 'uid:ab' });
  const box = await boot({ sd, flash: makeFlash(), t: 20 });
  eq(logKinds(sd).filter((k) => k === 'boot').length, 2);
  await box.poll(21, blank(1)); await box.poll(25, blank(1).uid ? { uid: 'FF', records: null } : null);
  eq(sd.read('/tape/unknown.txt').split('\n').filter(Boolean).at(-1), 'uid:ff');
});

// ---------- months: B, C, R together
async function months(seed, { cuts }) {
  s = seed;
  const titles = {}; let nextTitle = 0;
  const addBook = () => { const n = `book-${String(nextTitle++).padStart(3, '0')}`; titles[n] = ['01.mp3', '02.mp3']; return n; };
  for (let i = 0; i < 3; i++) addBook();
  const sd = makeSD(library(titles)); const flash = makeFlash();
  const deck = [1, 2, 3].map(tag);
  const everBound = new Map();   // card → title
  const events = [];
  let t = 0;
  for (let evening = 0; evening < 120; evening++) {
    if (rnd() < 0.15) for (const [k, v] of Object.entries(library({ [addBook()]: ['01.mp3', '._01.mp3'] }))) sd.files.set(k, v);
    if (rnd() < 0.2) deck.push([tag, blank, corrupt][Math.floor(rnd() * 3)](100 + evening));
    if (cuts && rnd() < 0.3) sd.cutAt = sd.steps + Math.floor(rnd() * 12);
    t += 1000;
    let box;
    try {
      box = await boot({ sd, flash, t });
      for (let k = 0; k < 6; k++) {
        const card = deck[Math.floor(rnd() * deck.length)];
        t += 1; await box.poll(t, card); t += 0.05; await box.poll(t, card);
        if (rnd() < 0.5) { t += 3; await box.trackEnded(t); }
        t += 5; await box.poll(t, null);
      }
    } catch (e) { if (!(e instanceof PowerCut)) throw e; }
    sd.cutAt = -1;
    if (box) events.push(...box.events);
    for (const e of box ? box.events : []) {
      if (e.type === 'bound') { assert(!everBound.has(e.card), `bound twice: ${e.card}`); everBound.set(e.card, e.title); }
    }
    const check = await boot({ sd: { ...sd, write() { throw 0; }, append() {}, rename() {}, remove() {} }, flash: makeFlash(flash.get()), t });
    for (const [c, ti] of Object.entries(check.bindings)) {
      if (everBound.has(c)) assert(everBound.get(c) === ti, `binding changed ${c}`);
      everBound.set(c, ti);
    }
    for (const e of box ? box.events : []) if (e.type === 'play') assert(everBound.get(e.card) === e.title, `played wrong title ${e.card}`);
  }
  return { events, files: [...sd.files.entries()].sort(), flash: flash.get() };
}
await test('B', '120 evenings, books and cards added: no card bound twice, only its title plays', async () => { await months(1, { cuts: false }); });
await test('C', '120 evenings with power cuts at random steps: same', async () => { await months(2, { cuts: true }); });
await test('R', 'same SD, flash, inputs → same events, SD, flash', async () => {
  const a = await months(3, { cuts: true }), b = await months(3, { cuts: true });
  eq(encode(a), encode(b));
});

const failed = results.filter((r) => !r.ok);
const here = (f) => new URL('./' + f, import.meta.url);
const links = JSON.parse(readFileSync(here('links.json'), 'utf8'));
const read = (f) => { try { return readFileSync(here(f)); } catch { return null; } };
const evidence = results.filter((r) => r.ok).map((r) => stamp(r, links, read));
writeFileSync(here('evidence.json'), JSON.stringify(evidence, null, 1) + '\n');
console.log(`${results.length - failed.length}/${results.length} pass`);
process.exit(failed.length ? 1 : 0);
