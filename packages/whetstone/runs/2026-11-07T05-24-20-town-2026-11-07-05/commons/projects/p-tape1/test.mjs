// node test.mjs — runs every check, writes evidence.json (stamped by Fresh), exits 0 only if
// all pass. Check ids are linked to requirements in links.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { encode, decode, record, replay } from './harness.mjs';
import { boot, GONE_AFTER, CARDS, CARDS_NEW, LOG, UNKNOWN } from './tape1.mjs';
import { makeSD, makeFlash, library, PowerCut } from './fake-sd.mjs';
import { ndefRecords } from './tape-lib/tag.js';
import { stamp } from './fresh.mjs';
import { Sim } from './tools/des/des.mjs';

const results = [];
async function check(id, fn) {
  try { await fn(); results.push({ check: id, result: 'pass' }); }
  catch (e) { results.push({ check: id, result: 'fail', detail: String(e && e.stack || e) }); console.log(`FAIL ${id}: ${e && e.message}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const tagRead = (uid, id) => ({ uid, records: id ? ndefRecords({ id }) : null });
const ID = ['A000000000000', 'B000000000000', 'C000000000000', 'D000000000000', 'E000000000000'];
const types = (box) => box.events.map((e) => e.type);
const logKinds = (sd) => (sd.read(LOG) || '').split('\n').filter(Boolean).map((l) => l.split('\t')[1]);

// Hold a card on the pad from t0 for dur seconds at 20 Hz; miss is the chance a poll reads nothing.
async function hold(box, read, t0, dur, miss = 0, r = Math.random) {
  let t = t0, last = null;
  for (let i = 0; t0 + i * 0.05 <= t0 + dur + 1e-9; i++) { t = t0 + i * 0.05; if (r() < miss) await box.poll(t, null); else { await box.poll(t, read); last = t; } }
  return { t, last };
}
// The card stays on the pad, read every poll, from t0 (exclusive) until t; then the track ends at t.
async function endAt(box, read, t0, t) { for (let i = 1; t0 + i * 0.05 < t - 1e-9; i++) await box.poll(t0 + i * 0.05, read); await box.poll(t, read); await box.trackEnded(t); }
async function empty(box, t0, dur) { let t = t0; for (let i = 1; i * 0.05 <= dur + 1e-9; i++) { t = t0 + i * 0.05; await box.poll(t, null); } return t; }

// ---------- H: the harness ----------
await check('T-H-ROUNDTRIP', () => {
  const lookalikes = ['["x","NaN"]', '["z"]', '{"o":[]}', 'NaN', 'null', ''];
  const vals = [null, NaN, Infinity, -Infinity, -0, 0, 1.5, 'NaN', true, [], {}, [NaN, null, undefined, -Infinity],
    { a: NaN, b: null, c: undefined, d: { e: Infinity } }, ['x', 'NaN'], ['z'], { s: 'x' }, ['s', 'x'], { __tag: 'NaN' },
    ...lookalikes, lookalikes.map((s) => ({ [s]: s }))];
  const same = (a, b) => {
    if (typeof a === 'number') return Object.is(a, b);
    if (a === null || typeof a !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b) || !b || typeof b !== 'object') return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined || Array.isArray(a)), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
  };
  for (const v of vals) { const back = decode(encode(v)); assert(same(v, back), `round trip lost ${String(encode(v))}`); }
  const o = decode(encode({ a: undefined, b: null }));
  assert(!('a' in o) && o.b === null, 'absent must stay absent and null stay null');
  assert(encode(NaN) !== encode(null) && encode({ a: NaN }) !== encode({ a: null }) && encode({}) !== encode({ a: null }), 'NaN, null, absent must differ');
  assert(encode('["x","NaN"]') !== encode(NaN) && encode(['x', 'NaN']) !== encode(NaN), 'a caller string or array must not read as a tag');
});
await check('T-H-REPLAY', async () => {
  const model = (bad) => (sim) => { sim.process(function* () { for (let i = 0; i < 4; i++) { yield sim.timeout(1); sim.decide('reading', { v: i === 2 ? (bad ? null : NaN) : i, lo: -Infinity }); } }); };
  const log = await record(model(false), { seed: 3, until: 10, scale: 0.37 });
  assert(Number.isNaN(log[2].data.v) && log[0].data.lo === -Infinity, 'log must keep NaN and -Infinity (fi-5f90c6)');
  assert((await replay(model(false), log, { seed: 3, until: 10 })).ok, 'same model must replay');
  assert(!(await replay(model(true), log, { seed: 3, until: 10 })).ok, 'a null where NaN was logged must mismatch');
});

// ---------- titles ----------
await check('T-T-TITLES', async () => {
  const sd = makeSD(library({ b: 2, a: 1 }, { '/tape/audio/a/._01.m4a': 'x', '/tape/audio/a/02.MP3': 'x', '/tape/audio/a/notes.txt': 'x',
    '/tape/audio/Bad Name/01.mp3': 'x', '/tape/audio/empty/readme.txt': 'x', '/tape/audio/loose.mp3': 'x' }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  assert(box.state.titles.join() === 'a,b', `titles ${box.state.titles}`);
  await box.poll(0, tagRead('04AA', ID[0]));
  const p = box.events.find((e) => e.type === 'play');
  assert(p.title === 'a' && p.track === 0 && p.file === '01.m4a', 'first free title a, track 01.m4a');
  await endAt(box, tagRead('04AA', ID[0]), 0, 1);
  assert(box.events.at(-1).file === '02.MP3', 'tracks in code-unit order, extension any case, ._ skipped');
  const bad = (sd.read(LOG) || '').split('\n').filter((l) => l.split('\t')[1] === 'bad-folder').map((l) => l.split('\t')[2]).sort();
  assert(bad.join() === 'Bad Name,empty', `bad folders ${bad}`);
});

// ---------- W: the card watcher ----------
await check('T-W1-HOLD', async () => {
  for (const seed of [1, 2, 3]) {
    const box = await boot({ sd: makeSD(library({ a: 1 })), flash: makeFlash(), t: 0 });
    await hold(box, tagRead('04AA', ID[0]), 0, 3600, 0.25, rng(seed));
    assert(!types(box).includes('pause'), `seed ${seed}: card reported gone during an hour on the pad`);
  }
});
await check('T-W2-LEAVE', async () => {
  const r = rng(7);
  for (let k = 0; k < 40; k++) {
    const box = await boot({ sd: makeSD(library({ a: 3 })), flash: makeFlash(), t: 0 });
    const { last } = await hold(box, tagRead('04AA', ID[0]), 0, 1 + 10 * r(), 0.25, r);
    await empty(box, last, 3);
    const p = box.events.filter((e) => e.type === 'pause');
    assert(p.length === 1 && p[0].t <= last + 1.25 + 1e-9 && p[0].t > last, `pause at ${p[0] && p[0].t}, last read ${last}`);
  }
  const box = await boot({ sd: makeSD(library({ a: 1 })), flash: makeFlash(), t: 0 });
  await hold(box, tagRead('04AA', ID[0]), 0, 1); await endAt(box, tagRead('04AA', ID[0]), 1, 2); await empty(box, 2, 3);
  assert(!types(box).includes('pause'), 'a silent card that leaves gives nothing');
});
await check('T-W3-CROWD', async () => {
  const box = await boot({ sd: makeSD(library({ a: 3 })), flash: makeFlash(), t: 0 });
  const c = tagRead('04AA', ID[0]);
  await box.poll(0, c); await box.poll(0.5, c); await box.poll(1, { crowd: true });
  assert(types(box).join() === 'bound,play,pause' && box.events.at(-1).t === 1, 'crowd pauses at that poll');
  await box.poll(1.1, null); await box.poll(5, null); await box.poll(6, { crowd: true }); await box.poll(9, null);
  assert(types(box).length === 3, 'while crowded, nothing but pause; no timer ends a crowd');
  await box.poll(9.05, c);
  assert(box.events.at(-1).type === 'play' && box.events.at(-1).track === 0, 'crowd ends at the next good read, card placed');
  await endAt(box, c, 9.05, 10); await endAt(box, c, 10, 11); await endAt(box, c, 11, 12);
  assert(box.events.at(-1).type === 'finished', 'finished');
  await box.poll(12.05, { crowd: true }); await box.poll(12.1, c);
  assert(box.events.at(-1).type === 'play' && box.events.at(-1).track === 0, 'a finished card read alone after a crowd starts from 0');
  const b2 = await boot({ sd: makeSD(library({ a: 1 })), flash: makeFlash(), t: 0 });
  await b2.poll(0, { crowd: true }); await b2.poll(0.05, tagRead('04BB', null));
  assert(types(b2).join() === 'bound,play' && b2.events[0].card === 'uid:04bb', 'blank tag after crowd binds by uid');
});

// Modulo's open pokes (turn 2): the player reports late, and a vanished title meets a crowd.
await check('T-W-POKE', async () => {
  const c = tagRead('04AA', ID[0]);
  // (a) The card leaves mid-track; the player's trackEnded arrives after the gone-timer ran out.
  const box = await boot({ sd: makeSD(library({ a: 3 })), flash: makeFlash(), t: 0 });
  await box.poll(0, c); await box.poll(0.4, c); await box.trackEnded(3);
  assert(types(box).join() === 'bound,play,pause', `late trackEnded after gone: ${types(box)}`);
  assert(box.events[2].t > 0.4 && box.events[2].t <= 0.4 + 1.25 + 1e-9, `pause at ${box.events[2].t}`);
  await box.poll(3.05, c);
  assert(box.events.at(-1).type === 'play' && box.events.at(-1).track === 0, 'back on the pad, it resumes where the pause left it');
  // Events never run earlier than the input before them.
  assert(box.events.every((e, i, a) => i === 0 || e.t >= a[i - 1].t), `events out of time order ${box.events.map((e) => e.t)}`);
  // (b) A card bound to a title whose folder went, placed alone after a crowd: cue, no play, no rebind.
  const sd = makeSD(library({ a: 1, c: 1 }, { [CARDS]: JSON.stringify({ [ID[0]]: 'b' }) }));
  const b2 = await boot({ sd, flash: makeFlash(), t: 0 });
  await b2.poll(0, { crowd: true }); await b2.poll(0.05, null); await b2.poll(0.1, c);
  assert(types(b2).join() === 'cue' && b2.events[0].reason === 'missing', `vanished title after crowd: ${types(b2)}`);
  assert(JSON.parse(sd.read(CARDS))[ID[0]] === 'b', 'the binding to the vanished title is kept, not changed');
  await b2.trackEnded(0.12);
  assert(types(b2).length === 1, 'trackEnded while nothing plays does nothing');
  await b2.poll(0.15, { crowd: true }); await b2.poll(0.2, tagRead('04BB', ID[1]));
  assert(b2.events.at(-1).type === 'play' && b2.events.at(-1).title === 'a', 'the next new card binds a free title');
});

// ---------- P: playing ----------
await check('T-P-PLAY', async () => {
  const box = await boot({ sd: makeSD(library({ a: 3, b: 2 })), flash: makeFlash(), t: 0 });
  const A = tagRead('04AA', ID[0]), B = tagRead('04BB', ID[1]);
  await box.poll(0, A); await endAt(box, A, 0, 1);              // a: track 1
  await box.poll(1.5, B);                                       // different card: pause a, place b
  const ev = box.events;
  assert(ev.at(-3).type === 'pause' && ev.at(-3).t === 1.5 && ev.at(-1).title === 'b' && ev.at(-1).track === 0, 'swap pauses, then b binds and plays');
  await box.poll(2, A);
  assert(ev.at(-2).type === 'pause' && ev.at(-1).type === 'play' && ev.at(-1).track === 1, 'resumes the track where it stopped this session');
  await endAt(box, A, 2, 3); await endAt(box, A, 3, 4);
  assert(ev.at(-1).type === 'finished' && ev.at(-1).title === 'a', 'finished after the last track');
  await endAt(box, A, 4, 5);
  assert(ev.at(-1).type === 'finished', 'silent while it stays: trackEnded does nothing');
  await empty(box, 5, 2); await box.poll(7.5, A);
  assert(ev.at(-1).type === 'play' && ev.at(-1).track === 0, 'put back after finishing starts from 0');
});

// ---------- B: binding ----------
await check('T-B-BIND', async () => {
  const sd = makeSD(library({ c: 1, a: 1, b: 1 }, { [CARDS]: JSON.stringify({ _gen: 4, X: 'b' }) }));
  const box = await boot({ sd, flash: makeFlash(), t: 0 });
  await box.poll(0, tagRead('04AA', ID[0])); await empty(box, 0, 2);
  await box.poll(3, tagRead('04BB', ID[1])); await empty(box, 3, 2);
  await box.poll(6, tagRead('04CC', ID[2]));
  const bound = box.events.filter((e) => e.type === 'bound').map((e) => e.title);
  assert(bound.join() === 'a,c', `binds to the first free titles, got ${bound}`);
  assert(box.events.at(-1).type === 'cue' && sd.read(UNKNOWN) === ID[2] + '\n', 'no free title: cue and unknown.txt');
  await empty(box, 6, 2); await box.poll(9, tagRead('04CC', ID[2]));
  assert(box.events.at(-1).type === 'cue' && sd.read(UNKNOWN) === `${ID[2]}\n${ID[2]}\n`, 'cue again on every placement');
  const j = JSON.parse(sd.read(CARDS));
  assert(j.X === 'b' && j[ID[0]] === 'a' && j[ID[1]] === 'c', 'cards.json holds the bindings');
  assert(sd.writes.every(([, p]) => !p.startsWith('/tape/audio')), 'never writes under /tape/audio');
  const bad = tagRead('04DD', null); bad.records = [{ recordType: 'minomobi.com:tape', data: new Uint8Array([1, 2, 3]) }];
  const b2 = await boot({ sd: makeSD(library({ a: 1 })), flash: makeFlash(), t: 0 });
  await b2.poll(0, bad);
  assert(b2.events[0].card === 'uid:04dd', 'a corrupt record means the uid');
  const b3 = await boot({ sd, flash: makeFlash(), t: 20 });
  assert(!types(b3).includes('bound'), 'never binds at boot');
});

// ---------- C: cuts at every step of a bind ----------
await check('T-C-CUTS', async () => {
  for (const start of ['{"Y":"a"}', null, '{"Y":"a"', '']) {
    for (let k = 0; ; k++) {
      const files = library({ a: 1, b: 1 }); if (start !== null) files[CARDS] = start;
      const sd = makeSD(files); const flash = makeFlash({ v: 1, titles: ['a', 'b'], bindings: { Y: 'a' } });
      const box = await boot({ sd, flash, t: 0 });
      const s0 = sd.steps; sd.cutAt = s0 + k;
      let cut = false;
      try { await box.poll(1, tagRead('04AA', ID[0])); } catch (e) { if (!(e instanceof PowerCut)) throw e; cut = true; }
      sd.cutAt = -1;
      const again = await boot({ sd, flash, t: 2 });
      const got = JSON.stringify(again.state.bindings);
      const old = JSON.stringify({ Y: 'a' }), full = JSON.stringify({ [ID[0]]: 'b', Y: 'a' });
      assert(got === old || got === full, `start ${start}, cut at bind step ${k}: ${got}`);
      if (!cut) assert(got === full, 'uncut bind must be kept');
      if (start === '{"Y":"a"}') assert(again.state.decidedBy !== 'mirror', `cut at bind step ${k}: a bindings file must decide, not the mirror`);
      if (start === '{"Y":"a"}' && got === old) {
        sd.files.set(CARDS, '{"Y":'); const third = await boot({ sd, flash, t: 3 });
        assert(JSON.stringify(third.state.bindings) === old, `cut at bind step ${k}, then cards.json mangled: an undone bind came back at boot`);
      }
      if (!cut) break;
    }
  }
});

// ---------- K: the mirror ----------
await check('T-K-MIRROR', async () => {
  const flash = makeFlash();
  const sd = makeSD(library({ a: 1, b: 1 }));
  let box = await boot({ sd, flash, t: 0 });
  assert(!types(box).includes('restore'), 'a new box restores nothing');
  await box.poll(0, tagRead('04AA', ID[0]));
  sd.files.delete(CARDS);
  box = await boot({ sd, flash, t: 10 });
  assert(types(box).join() === 'restore' && box.state.bindings[ID[0]] === 'a', 'missing cards.json: restore from flash');
  sd.files.set(CARDS, '{"' + ID[0] + '":"a", "H":"b"'); // torn by the laptop
  box = await boot({ sd, flash, t: 20 });
  assert(types(box).join() === 'restore' && box.state.bindings.H === undefined, 'torn cards.json: restore');
  sd.files.set(CARDS, JSON.stringify({ [ID[0]]: 'a', H: 'b' })); // a hand edit
  box = await boot({ sd, flash, t: 30 });
  assert(!types(box).includes('restore'), 'a parsing file decides: no restore');
  sd.files.delete(CARDS);
  box = await boot({ sd, flash, t: 40 });
  assert(box.state.bindings.H === 'b', 'hand edit then missing comes back as the edit');
  sd.files.set(CARDS, '{}');
  box = await boot({ sd, flash, t: 50 });
  assert(!types(box).includes('restore') && Object.keys(box.state.bindings).length === 0, '{} decides: the deck starts over');
  sd.files.set(CARDS, 'garbage'); sd.files.set(CARDS_NEW, JSON.stringify({ N: 'a' }));
  box = await boot({ sd, flash, t: 60 });
  assert(!types(box).includes('restore') && box.state.bindings.N === 'a', 'cards.new decides when cards.json fails');
  const k = logKinds(sd);
  assert(k.filter((x) => x === 'restore').length === 3, 'each restore logged once (boots at 10, 20, 40)');
});

// ---------- U: the use log ----------
await check('T-U-LOG', async () => {
  const flash = makeFlash();
  const sd = makeSD(library({ a: 2, b: 1 }, { '/tape/audio/Nope/01.mp3': 'x' }));
  let box = await boot({ sd, flash, t: 0 });
  await box.poll(0, tagRead('04AA', ID[0])); await endAt(box, tagRead('04AA', ID[0]), 0, 1); await endAt(box, tagRead('04AA', ID[0]), 1, 2);
  box = await boot({ sd, flash, t: 100 });
  for (let i = 1; i <= 2; i++) sd.files.set(`/tape/audio/c/0${i}.mp3`, 'x');
  sd.dirs.add('/tape/audio/c');
  box = await boot({ sd, flash, t: 200 });
  const lines = (sd.read(LOG) || '').split('\n').filter(Boolean).map((l) => l.split('\t'));
  const boots = lines.filter((l) => l[1] === 'boot');
  assert(boots.length === 3, 'one boot line per boot');
  assert(boots.map((l) => l.includes('sd-change')).join() === 'false,false,true', 'sd-change only when this box saw different titles');
  const n = (k) => lines.filter((l) => l[1] === k).length;
  assert(n('bind') === 1 && n('finished') === 1 && n('bad-folder') === 3 && n('restore') === 0, `counts ${JSON.stringify(lines)}`);
});

// A real cut on the bind's log append (not a hand-made half line): the next boot must start
// on a fresh line, so the boot line is whole and counted, and only the torn line is lost.
await check('T-U-TORN', async () => {
  let hit = 0;
  for (let k = 0; k < 40; k++) {
    const flash = makeFlash();
    const sd = makeSD(library({ a: 2 }));
    let box = await boot({ sd, flash, t: 0 });
    sd.cutAt = sd.steps + k;
    try { await box.poll(1, tagRead('04AA', ID[0])); await box.poll(1.05, tagRead('04AA', ID[0])); } catch (e) { if (!(e instanceof PowerCut)) throw e; }
    const last = sd.writes[sd.writes.length - 1];
    if (sd.steps <= sd.cutAt || last[0] !== 'append' || last[1] !== LOG) continue;
    hit++;
    const torn = sd.read(LOG);
    assert(!torn.endsWith('\n'), 'cut append left half a line');
    sd.cutAt = -1;
    box = await boot({ sd, flash, t: 10 });
    const lines = sd.read(LOG).split('\n').filter(Boolean).map((l) => l.split('\t'));
    const known = new Set(['boot', 'bind', 'finished', 'restore', 'bad-folder', 'missing', 'cue']);
    const whole = lines.filter((l) => l.length >= 2 && known.has(l[1]) && Number.isFinite(+l[0]));
    assert(lines.length - whole.length <= 1, `at most the torn line is unreadable: ${JSON.stringify(lines)}`);
    const boots = whole.filter((l) => l[1] === 'boot');
    assert(boots.length === 2 && boots[1][0] === lines[lines.length - 1][0] && +boots[1][0] === 10, 'second boot line whole, last, at t=10');
    assert(box.state.bindings[ID[0]] === 'a', 'the bind itself was durable before the log line');
  }
  assert(hit >= 1, 'no cut landed on a log append; the check tested nothing');
});

// ---------- the household, over months ----------
// Evenings: books are added, new cards join (written, blank, corrupt), the laptop sometimes
// deletes or mangles cards.json, and with cuts on, power fails at a random step.
async function months({ seed, evenings, cuts }) {
  const r = rng(seed);
  const flash = makeFlash();
  const sd = makeSD(library({ 'book-00': 2, 'book-01': 1 }));
  let nbook = 2, truth = {}; const deck = [];
  const newCard = () => {
    const n = deck.length, kind = r();
    const uid = (0x04A000 + n).toString(16).toUpperCase();
    if (kind < 0.6) deck.push(tagRead(uid, String(n).padStart(12, '0') + '0'));
    else if (kind < 0.8) deck.push(tagRead(uid, null));
    else deck.push({ uid, records: [{ recordType: 'minomobi.com:tape', data: new Uint8Array([0x54, 0x50, 9]) }] });
  };
  for (let i = 0; i < 3; i++) newCard();
  let t = 0;
  for (let ev = 0; ev < evenings; ev++) {
    if (r() < 0.3) { const n = 1 + Math.floor(r() * 3); for (let i = 1; i <= n; i++) sd.files.set(`/tape/audio/book-${String(nbook).padStart(2, '0')}/${i}.mp3`, 'x'); sd.dirs.add(`/tape/audio/book-${String(nbook).padStart(2, '0')}`); nbook++; }
    if (r() < 0.25) newCard();
    const m = r();
    if (m < 0.05) sd.files.delete(CARDS); else if (m < 0.1 && sd.files.has(CARDS)) sd.files.set(CARDS, sd.read(CARDS).slice(0, 7));
    sd.cutAt = cuts && r() < 0.3 ? sd.steps + Math.floor(r() * 12) : -1;
    t += 1000;
    try {
      const box = await boot({ sd, flash, t });
      const b = box.state.bindings;
      for (const [k, v] of Object.entries(truth)) assert(b[k] === v, `evening ${ev}: binding ${k}→${v} became ${b[k]}`);
      const fresh = Object.keys(b).filter((k) => !(k in truth));
      assert(fresh.length <= 1, `evening ${ev}: ${fresh.length} binds appeared at boot`);
      truth = { ...b };
      for (let p = 0; p < 6; p++) {
        const c = deck[Math.floor(r() * deck.length)];
        t += 1; const before = box.events.length;
        await box.poll(t, c);
        for (const e of box.events.slice(before)) {
          if (e.type === 'bound') { assert(!(e.card in truth), `${e.card} bound twice`); truth[e.card] = e.title; }
          if (e.type === 'play') assert(truth[e.card] === e.title, `${e.card} played ${e.title}, bound to ${truth[e.card]}`);
        }
        if (r() < 0.5) await box.trackEnded(t + 0.5);
        t = await empty(box, t + 0.5, 1.5);
      }
      const titles = Object.values(truth);
      assert(new Set(titles).size === titles.length, 'a title bound to two cards');
    } catch (e) { if (!(e instanceof PowerCut)) throw e; }
    sd.cutAt = -1;
  }
  return { sd, flash, truth };
}
await check('T-B-MONTHS', async () => { for (const seed of [11, 12, 13]) await months({ seed, evenings: 120, cuts: false }); });
await check('T-C-MONTHS', async () => { for (const seed of [21, 22, 23, 24]) await months({ seed, evenings: 120, cuts: true }); });

// ---------- R: same inputs, same box ----------
await check('T-R-SAME', async () => {
  const a = await months({ seed: 31, evenings: 60, cuts: true }), b = await months({ seed: 31, evenings: 60, cuts: true });
  assert(a.sd.snapshot() === b.sd.snapshot() && JSON.stringify(a.flash.peek()) === JSON.stringify(b.flash.peek()), 'two runs differ');
});

// ---------- built on des ----------
await check('T-D-DES', () => { assert(readFileSync('tape1.mjs', 'utf8').includes("from './tools/des/des.mjs'") && typeof Sim === 'function', 'tape1 imports des'); assert(GONE_AFTER <= 1.25, 'gone timeout within W2'); });

// ---------- E: the enclosure, measured off the exact-kernel models (enclosure/measure.mjs) ----------
{
  const { measure } = await import('./enclosure/measure.mjs');
  const { parts } = await import('./enclosure/gen.mjs');
  const m = measure();
  const has = (k) => m.fail.filter((f) => f.startsWith(k + ':'));
  await check('T-E-GEN', () => {   // the trees on disk are what gen.mjs makes now: no stale tree measured
    const { printed } = parts();
    for (const [k, t] of Object.entries(printed)) assert(readFileSync(`enclosure/${k}.json`, 'utf8') === JSON.stringify(t, null, 1) + '\n', `enclosure/${k}.json is stale; run node enclosure/gen.mjs`);
    assert(m.E.printed === Object.keys(printed).length, `enclosure/ holds ${m.E.printed} trees, gen.mjs makes ${Object.keys(printed).length}`);
  });
  await check('T-E-PRINT', () => { const f = has('E'); assert(!f.length && m.E.cardSized, f.join('; ') || 'no card-sized part'); });
  await check('T-E-NEST', () => { const f = has('NEST'); assert(!f.length && m.NEST.walls === 4, f.join('; ') || 'nest walls not found'); });
  await check('T-E-SEAL', () => { const f = has('SEAL'); assert(!f.length && m.SEAL.net_cm3 >= 200, f.join('; ') || 'no seal figure'); });
  await check('T-E-GRILLE', () => { const f = has('GRILLE'); assert(!f.length && m.GRILLE.holes > 0, f.join('; ') || 'no grille'); });
}

// V: links name only real checks, and every check verifies something.
await check('T-V-SELF', () => {
  const links = JSON.parse(readFileSync('links.json', 'utf8'));
  const ids = new Set(results.map((r) => r.check).concat('T-V-SELF'));
  for (const l of links) if (l.kind === 'verifies') assert(ids.has(l.from), `link names unknown check ${l.from}`);
  for (const id of ids) assert(links.some((l) => l.kind === 'verifies' && l.from === id), `${id} verifies nothing`);
});

const at = new Date().toISOString().slice(0, 10);
const links = JSON.parse(readFileSync('links.json', 'utf8'));
const evidence = results.map((r) => stamp({ check: r.check, result: r.result, at }, links, (p) => readFileSync(p)));
writeFileSync('evidence.json', JSON.stringify(evidence, null, 2) + '\n');
const failed = results.filter((r) => r.result === 'fail').length;
console.log(`${results.length - failed}/${results.length} checks passed; evidence.json written (stamped)`);
process.exit(failed ? 1 : 0);
