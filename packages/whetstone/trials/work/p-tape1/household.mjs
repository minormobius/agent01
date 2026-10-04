// household.mjs — the lab's side of the tape check, run in a child process with the project folder
// as its working directory. Hidden from the souls. It plays the SD card, the flash, the card reader
// and a household: evenings of cards placed and taken off, a laptop that adds books and sometimes
// mangles the bindings file, and power that sometimes goes in the middle of a write.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { encodeCard, base32Encode, CARD_EXTERNAL_TYPE } = await import(pathToFileURL(join(HERE, 'files', 'tape-lib', 'tag.js')).href);
const cwd = process.cwd();
const out = {};
async function ms(k, fn) {
  try { out[k] = await fn(); }
  catch (e) { out[k] = { ok: false, why: String((e && e.message) || e).slice(0, 240) }; }
}
const fail = (why) => ({ ok: false, why });

function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
class PowerCut extends Error { constructor() { super('power cut'); } }

// ---- the SD card and the flash ------------------------------------------------------------------
function makeSD(files = {}) {
  const F = new Map(Object.entries(files));
  const dirs = new Set(['/', '/tape', '/tape/audio']);
  for (const p of F.keys()) { let d = dirname(p); while (d !== '/') { dirs.add(d); d = dirname(d); } }
  let mutations = 0, cutAt = Infinity;
  const touched = [];
  const step = (path) => { mutations++; touched.push(path); return mutations === cutAt; };
  const sd = {
    list(dir) {
      const d = dir.replace(/\/$/, ''), names = new Set();
      for (const p of [...F.keys(), ...dirs]) if (p !== d && p.startsWith(d + '/')) names.add(p.slice(d.length + 1).split('/')[0]);
      return [...names];
    },
    isDir(p) { return dirs.has(p.replace(/\/$/, '')); },
    read(p) { return F.has(p) ? F.get(p) : null; },
    write(p, text) {
      text = String(text);
      if (step(p)) { F.set(p, text.slice(0, Math.floor(text.length / 2))); throw new PowerCut(); }
      F.set(p, text);
    },
    append(p, text) {
      text = String(text);
      if (step(p)) { F.set(p, (F.get(p) || '') + text.slice(0, Math.floor(text.length / 2))); throw new PowerCut(); }
      F.set(p, (F.get(p) || '') + text);
    },
    rename(a, b) {
      if (step(b)) throw new PowerCut();
      if (!F.has(a)) throw new Error(`rename: no ${a}`);
      F.set(b, F.get(a)); F.delete(a);
    },
    remove(p) { if (step(p)) throw new PowerCut(); F.delete(p); },
  };
  return {
    sd, F, dirs, touched,
    cutAfter(k) { cutAt = mutations + k; }, noCut() { cutAt = Infinity; },
    // The household's laptop: not the box, so none of this counts as the box's writes.
    put(p, text) { F.set(p, text); let d = dirname(p); while (d !== '/') { dirs.add(d); d = dirname(d); } },
    del(p) { F.delete(p); },
    mkdir(p) { dirs.add(p); },
  };
}
function makeFlash() {
  let v = null;
  return { flash: { get: () => (v == null ? null : JSON.parse(v)), set: (x) => { v = JSON.stringify(x); } }, raw: () => v };
}

// ---- cards ----------------------------------------------------------------------------------------
function cardFactory(R) {
  const hex = (n) => Array.from({ length: n }, () => Math.floor(R() * 256).toString(16).padStart(2, '0')).join('');
  return {
    blank() { const uid = hex(7); return { read: { uid: uid.toUpperCase(), records: null }, id: `uid:${uid}` }; },
    written() {
      const bytes = new Uint8Array(8); for (let i = 0; i < 8; i++) bytes[i] = Math.floor(R() * 256);
      const id = base32Encode(bytes);
      return { read: { uid: hex(7), records: [{ recordType: 'url', data: `https://tape.mino.mobi/c/${id}` }, { recordType: CARD_EXTERNAL_TYPE, data: encodeCard({ id, label: 'x' }) }] }, id };
    },
    corrupt() { const uid = hex(7); return { read: { uid, records: [{ recordType: CARD_EXTERNAL_TYPE, data: new Uint8Array([0x54, 0x50, 9, 0, 1, 2]) }] }, id: `uid:${uid}` }; },
  };
}

// ---- the box under test -------------------------------------------------------------------------
const mod = await import(pathToFileURL(join(cwd, 'tape1.mjs')).href).catch((e) => ({ __e: e.message }));
const bootBox = (args) => { if (mod.__e) throw new Error(`tape1.mjs: ${mod.__e}`); return mod.boot(args); };

const EXT = ['m4a', 'mp3', 'opus', 'WAV', 'ogg', 'flac'];
const WORDS = ['gruffalo', 'owl-babies', 'room-on-the-broom', 'dogger', 'tiger-tea', 'zog', 'stickman', 'peace-at-last', 'whatever-next', 'cave-baby', 'mog', 'hairy-maclary', 'oi-frog', 'lost-and-found', 'paddington', 'moomin'];
function addTitle(S, R, name, n = 1 + Math.floor(R() * 3)) {
  const files = [];
  for (let i = 0; i < n; i++) { const f = `${String(i + 1).padStart(2, '0')}-part.${EXT[Math.floor(R() * EXT.length)]}`; S.put(`/tape/audio/${name}/${f}`, 'audio'); files.push(f); }
  if (R() < 0.3) S.put(`/tape/audio/${name}/cover.jpg`, 'jpeg');
  return files.sort(byCode);
}

// One placement: good reads every 0.25 s for `hold` seconds (with a few misses), then nothing for
// 2 s. trackEnded is called every `trackEvery` seconds of playing. Returns the time after.
async function place(box, t, read, R, { hold = 2 + R() * 4, miss = 0.1, trackEvery = 1.5 } = {}) {
  let nextEnd = t + trackEvery;
  for (let s = t; s < t + hold; s += 0.25) {
    if (s >= nextEnd) { await box.trackEnded(nextEnd); nextEnd += trackEvery; }
    await box.poll(s, R() < miss ? null : read);
  }
  for (let s = t + hold; s < t + hold + 2; s += 0.25) await box.poll(s, null);
  return t + hold + 2.25;
}

// The checker's own record of what the household has been promised: the durable bindings.
function titlesOn(S) {
  const out = [];
  for (const name of S.sd.list('/tape/audio').sort(byCode)) {
    if (!S.sd.isDir(`/tape/audio/${name}`)) continue;
    const ok = /^[a-z0-9][a-z0-9-]{0,31}$/.test(name) && S.sd.list(`/tape/audio/${name}`).some((f) => /\.(mp3|m4a|aac|wav|ogg|opus|flac|amr)$/i.test(f));
    if (ok) out.push(name);
  }
  return out;
}

// A household month. opts: cuts (power cut chance per evening), mishaps (laptop chance per evening).
async function month(seed, { evenings = 24, cuts = 0, mishaps = 0, edits = 0 } = {}) {
  const R = prng(seed), C = cardFactory(R);
  const S = makeSD(); const FL = makeFlash();
  const deck = [];
  for (let i = 0; i < 2 + Math.floor(R() * 3); i++) addTitle(S, R, WORDS[i]);
  let nextWord = deck.length + 5;
  const E = {};                 // durable bindings the box has announced (or the household wrote)
  const violations = [];
  let restoresWanted = 0, restoresSeen = 0, cutsDone = 0, boots = 0;
  const parses = (text) => { if (text == null) return null; try { const o = JSON.parse(text); return o && typeof o === 'object' && !Array.isArray(o) && Object.entries(o).every(([k, v]) => k.startsWith('_') || typeof v === 'string') ? o : null; } catch { return null; } };
  for (let ev = 0; ev < evenings; ev++) {
    // The laptop, between evenings.
    if (R() < 0.35) { const n = WORDS[nextWord++ % WORDS.length] + (nextWord > WORDS.length ? `-${nextWord}` : ''); addTitle(S, R, n); }
    if (R() < 0.12) deck.push(R() < 0.5 ? C.blank() : R() < 0.85 ? C.written() : C.corrupt());
    if (deck.length === 0) deck.push(C.blank());
    if (mishaps && R() < mishaps && S.F.has('/tape/cards.json')) {
      if (R() < 0.5) { S.del('/tape/cards.json'); S.del('/tape/cards.new'); }
      else { S.put('/tape/cards.json', S.F.get('/tape/cards.json').slice(0, 5)); S.del('/tape/cards.new'); }
    }
    if (edits && R() < edits && Object.keys(E).length >= 2) {
      // The household swaps two bindings by hand, or clears them all.
      if (R() < 0.7) { const ks = Object.keys(E).sort(byCode); const [a, b] = [ks[0], ks[1]]; [E[a], E[b]] = [E[b], E[a]]; }
      else for (const k of Object.keys(E)) delete E[k];
      S.put('/tape/cards.json', JSON.stringify(E)); S.del('/tape/cards.new');
    }
    // Should this boot restore? Exactly when no bindings file parses and the box has a mirror.
    const wantRestore = parses(S.sd.read('/tape/cards.json')) == null && parses(S.sd.read('/tape/cards.new')) == null && FL.raw() != null;
    // The evening.
    const cutTonight = cuts && R() < cuts;
    if (cutTonight) S.cutAfter(1 + Math.floor(R() * 12)); else S.noCut();
    let box, t = 0, seen = 0, c = null, firstFree;
    const judge = () => {
      for (const e of box.events.slice(seen)) {
        if (e.type === 'restore' && !wantRestore) violations.push(`evening ${ev}: restored when a bindings file parsed (or with no mirror)`);
        if (e.type === 'bound') {
          if (!c || e.card !== c.id) violations.push(`bound ${e.card}, but the card placed was ${c && c.id}`);
          else if (E[c.id] !== undefined) violations.push(`rebound ${c.id} (was ${E[c.id]}, now ${e.title})`);
          else if (e.title !== firstFree) violations.push(`bound ${c.id} to ${e.title}; the first unbound title was ${firstFree}`);
          E[e.card] = e.title;
        }
        if (e.type === 'play' && E[e.card] === undefined) violations.push(`${e.card} played ${e.title} with no binding announced`);
        else if (e.type === 'play' && e.title !== E[e.card]) violations.push(`${e.card} played ${e.title}; it is bound to ${E[e.card]}`);
        if (e.type === 'cue' && c && firstFree !== undefined && E[c.id] === undefined) violations.push(`cued ${c.id} while ${firstFree} was free`);
      }
      seen = box.events.length;
    };
    try {
      box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
      boots++;
      if (wantRestore) { restoresWanted++; if (box.events.some((e) => e.type === 'restore')) restoresSeen++; else violations.push(`evening ${ev}: no bindings file parsed and the box did not restore from its mirror`); }
      judge();
      const n = 2 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        c = deck[Math.floor(R() * deck.length)];
        firstFree = titlesOn(S).find((x) => !Object.values(E).includes(x));
        t = await place(box, t, c.read, R);
        judge();
      }
    } catch (e) {
      if (!(e instanceof PowerCut)) throw e;
      if (box) judge();
      cutsDone++;
    }
  }
  const audio = S.touched.filter((p) => p.startsWith('/tape/audio'));
  if (audio.length) violations.push(`the box wrote under /tape/audio: ${audio[0]}`);
  return { violations, bindings: Object.keys(E).length, restoresWanted, restoresSeen, cutsDone, boots, S, FL };
}

// ---- H: the harness ------------------------------------------------------------------------------
await ms('h', async () => {
  const h = await import(pathToFileURL(join(cwd, 'harness.mjs')).href);
  const same = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || (a === b);
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
    if (a && typeof a === 'object') {
      if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
      const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort(), kb = Object.keys(b).sort();
      return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
    }
    return a === b;
  };
  const cases = [NaN, Infinity, -Infinity, 0, -1.5, 'x', null, true, [], {},
    { reading: NaN, previous: null }, { reading: undefined, previous: 1 }, { a: [NaN, Infinity, -Infinity, null, 2] },
    'NaN', 'Infinity', '-Infinity', '$NaN', '~NaN', '__NaN__', '@@NaN', 'null', '{"$":"NaN"}',
    { $: 'NaN' }, { $n: 'NaN' }, { __t: 'NaN' }, { '~': 'NaN' }, { $$: 1, $: 2 }, { type: 'NaN' }, { nan: true },
    { deep: { deeper: [{ x: -Infinity, y: 'Infinity', z: { $: 'Infinity' } }] } }];
  for (const c of cases) {
    const back = h.decode(h.encode(c));
    if (!same(c, back)) return fail(`decode(encode(${JSON.stringify(c, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v === undefined ? '<absent>' : v))})) came back different`);
  }
  const a = h.decode(h.encode({ v: NaN })), b = h.decode(h.encode({}));
  if (!('v' in a) || 'v' in b) return fail('a NaN field and an absent one are not kept distinct');
  return { ok: true, cases: cases.length };
});

// A fresh box with titles and one card bound, ready for the watcher tests.
async function boxWithCard({ tracks = 1 } = {}) {
  const S = makeSD(); const FL = makeFlash();
  for (let i = 0; i < tracks; i++) S.put(`/tape/audio/long-book/${String(i + 1).padStart(2, '0')}.mp3`, 'a');
  const box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
  const card = { uid: '04A1B2C3D4E5F6', records: null };
  await box.poll(0.05, card);
  return { box, card, S };
}

// ---- W1 hold, W2 leave, W3 crowd ----------------------------------------------------------------
await ms('w1', async () => {
  for (const [seed, miss] of [[1, 0.25], [2, 0.25], [3, 0.25], [11, 0.2], [12, 0.25]]) {
    const R = prng(seed * 31 + 7);
    const { box, card } = await boxWithCard();
    const before = box.events.length;
    for (let i = 1; i <= 72000; i++) await box.poll(0.05 + i * 0.05, R() < miss ? null : card);
    const pauses = box.events.slice(before).filter((e) => e.type === 'pause').length;
    if (!box.events.some((e) => e.type === 'play')) return fail('the card never started playing');
    if (pauses) return fail(`seed ${seed}: ${pauses} false "gone" in an hour at 20 Hz with ${miss * 100}% of reads missed`);
  }
  return { ok: true };
});
await ms('w2', async () => {
  const R = prng(424242);
  let worst = 0, n = 0;
  for (let k = 0; k < 200; k++) {
    const { box, card } = await boxWithCard();
    let t = 0.05, last = 0.05;
    const hold = 1 + R() * 20;
    for (; t < hold; t += 0.05) { const ok = R() >= 0.25; await box.poll(t, ok ? card : null); if (ok) last = t; }
    const before = box.events.length;
    for (let s = t; s < t + 4; s += 0.05) await box.poll(s, null);
    const pause = box.events.slice(before).find((e) => e.type === 'pause') || box.events.filter((e) => e.type === 'pause' && e.t >= last).pop();
    if (!pause) return fail(`removal ${k}: no pause within 4 s of the card leaving`);
    worst = Math.max(worst, pause.t - last); n++;
  }
  if (worst > 1.25 + 1e-9) return fail(`a removed card was reported gone ${worst.toFixed(2)} s after its last good read (limit 1.25 s)`);
  return { ok: true, worst, removals: n };
});
await ms('w3', async () => {
  const { box, card, S } = await boxWithCard();
  S.put('/tape/audio/spare-book/01.mp3', 'a'); // a free title, so a box that took the crowd for a card would bind it
  for (let t = 0.1; t < 3; t += 0.05) await box.poll(t, card);
  const before = box.events.length, logBefore = S.F.get('/tape/log.txt') || '';
  await box.poll(3.0, { crowd: true });
  const at = box.events.slice(before);
  if (!at.some((e) => e.type === 'pause' && Math.abs(e.t - 3.0) < 1e-9)) return fail('a second tag arrived during playback and the box did not pause at that poll');
  const during = box.events.length;
  for (let t = 3.05; t < 6; t += 0.05) await box.poll(t, { crowd: true });
  if (box.events.slice(during).some((e) => e.type === 'play')) return fail('played while two tags were in the field');
  const odd = box.events.slice(before).find((e) => e.type !== 'pause');
  if (odd) return fail(`while two tags were in the field the box did something besides pause: ${odd.type}`);
  if (S.F.has('/tape/unknown.txt') || /\tbind\t/.test((S.F.get('/tape/log.txt') || '').slice(logBefore.length))) return fail('the crowd was taken for a card');
  const after = box.events.length;
  await box.poll(6.0, card);
  const res = box.events.slice(after).find((e) => e.type === 'play');
  if (!res || Math.abs(res.t - 6.0) > 1e-9) return fail('did not resume at the first single-tag read after the crowd');
  return { ok: true };
});

// ---- F: titles, tracks and card ids --------------------------------------------------------------
async function shelfScenario() {
  const S = makeSD(); const FL = makeFlash();
  const files = {
    'ant-book': ['b.mp3', 'a.m4a', 'C.opus', 'notes.txt', 'cover.jpg'],
    'bee-book': ['02.WAV', '01.flac', '10.ogg'],
    'Bad Name': ['01.mp3'], '-dash-first': ['01.mp3'], 'no-audio': ['readme.txt'],
    'cat-book': ['x.AMR', 'y.aac'],
  };
  for (const [d, fs] of Object.entries(files)) for (const f of fs) S.put(`/tape/audio/${d}/${f}`, 'a');
  S.put('/tape/audio/loose.mp3', 'a');
  const expect = { 'ant-book': ['C.opus', 'a.m4a', 'b.mp3'], 'bee-book': ['01.flac', '02.WAV', '10.ogg'], 'cat-book': ['x.AMR', 'y.aac'] };
  const box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
  const R = prng(5), C = cardFactory(R);
  const cards = [C.written(), C.blank(), C.corrupt(), C.blank()];
  let t = 0;
  const seen = {};
  for (const c of cards) {
    const before = box.events.length;
    for (let s = 0; s < 40; s++) { await box.poll(t, c.read); t += 0.25; if (s % 4 === 3) await box.trackEnded(t); }
    for (let s = 0; s < 8; s++) { await box.poll(t, null); t += 0.25; }
    const evs = box.events.slice(before);
    const bound = evs.find((e) => e.type === 'bound');
    if (cards.indexOf(c) < 3) {
      if (!bound) return { fail: fail(`card ${cards.indexOf(c) + 1} (${['written', 'blank', 'corrupt'][cards.indexOf(c)]}) was not bound`) };
      if (bound.card !== c.id) return { fail: fail(`a ${['written', 'blank', 'corrupt'][cards.indexOf(c)]} card was identified as ${bound.card}; expected ${c.id}`) };
      seen[bound.title] = evs.filter((e) => e.type === 'play').map((e) => e.file);
    } else if (!evs.some((e) => e.type === 'cue')) return { fail: fail('a fourth card with every title bound got no cue') };
  }
  return { S, FL, seen, cards, expect, fail: null };
}
await ms('f', async () => {
  const sc = await shelfScenario();
  if (sc.fail) return sc.fail;
  const { S, seen, cards, expect } = sc;
  for (const [title, order] of Object.entries(expect)) {
    const got = (seen[title] || []).filter((f, i, a) => a.indexOf(f) === i);
    if (JSON.stringify(got) !== JSON.stringify(order)) return fail(`${title} played ${JSON.stringify(got)}; expected ${JSON.stringify(order)}`);
  }
  if (Object.keys(seen).sort().join() !== 'ant-book,bee-book,cat-book') return fail(`titles bound: ${Object.keys(seen).sort().join(', ')}`);
  const log = S.F.get('/tape/log.txt') || '';
  for (const bad of ['Bad Name', '-dash-first', 'no-audio']) if (!log.split('\n').some((l) => l.split('\t')[1] === 'bad-folder' && l.includes(bad))) return fail(`the bad folder "${bad}" is not in /tape/log.txt`);
  if (!(S.F.get('/tape/unknown.txt') || '').includes(cards[3].id)) return fail('the unknown card is not in /tape/unknown.txt');
  return { ok: true };
});

// ---- P: playback ----------------------------------------------------------------------------------
await ms('p', async () => {
  const { box, card } = await boxWithCard({ tracks: 3 });
  let t = 0.1;
  const run = async (secs, read) => { for (const end = t + secs; t < end; t += 0.05) await box.poll(t, read); };
  await run(1, card);
  await box.trackEnded(t); await run(1, card);
  let plays = box.events.filter((e) => e.type === 'play');
  if (plays.at(-1)?.track !== 1) return fail('after one track ended, the next track did not start');
  await run(2, null);                       // taken off
  await run(1, card);                       // put back: same track
  plays = box.events.filter((e) => e.type === 'play');
  if (plays.at(-1)?.track !== 1) return fail(`put back after a removal, it played track ${plays.at(-1)?.track}; expected track 1 again`);
  await box.trackEnded(t); await run(0.5, card);
  const before = box.events.length;
  await box.trackEnded(t);
  const fin = box.events.slice(before);
  if (!fin.some((e) => e.type === 'finished')) return fail('the last track ended and no "finished"');
  await run(5, card);                       // left on the pad: silent
  if (box.events.slice(before).some((e) => e.type === 'play')) return fail('repeated after finishing with the card still on the pad');
  await run(2, null); await run(1, card);
  plays = box.events.filter((e) => e.type === 'play');
  if (plays.at(-1)?.track !== 0) return fail('put back after finishing, it did not start again from the first track');
  return { ok: true };
});

// ---- B: binding and keeping; C: power cuts; K: the mirror -----------------------------------------
await ms('b', async () => {
  let bound = 0;
  for (let s = 1; s <= 40; s++) {
    const m = await month(1000 + s);
    if (m.violations.length) return fail(`month ${s}: ${m.violations[0]}`);
    bound += m.bindings;
  }
  if (bound < 40) return fail(`only ${bound} bindings in 40 months: the box is not binding`);
  return { ok: true, bound };
});
await ms('c', async () => {
  // Every SD step of one bind, then random cuts across months.
  for (let k = 1; k <= 8; k++) {
    const S = makeSD(); const FL = makeFlash();
    S.put('/tape/audio/apple/01.mp3', 'a'); S.put('/tape/audio/berry/01.mp3', 'a');
    const one = { uid: 'AA01', records: null }, two = { uid: 'BB02', records: null };
    let box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
    for (let t = 0; t < 2; t += 0.25) await box.poll(t, one);
    for (let t = 2; t < 4; t += 0.25) await box.poll(t, null);
    S.cutAfter(k);
    let cut = false;
    try { for (let t = 4; t < 6; t += 0.25) await box.poll(t, two); } catch (e) { if (!(e instanceof PowerCut)) throw e; cut = true; }
    S.noCut();
    if (!cut) continue;
    box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
    const plays = [];
    for (const c of [one, two]) { const b = box.events.length; for (let t = 0; t < 2; t += 0.25) await box.poll(t + plays.length * 10, c); for (let t = 2; t < 4; t += 0.25) await box.poll(t + plays.length * 10, null); plays.push(box.events.slice(b).find((e) => e.type === 'play')?.title); }
    if (plays[0] !== 'apple') return fail(`power cut at step ${k} of a bind: the first card now plays ${plays[0]}, not apple`);
    if (plays[1] !== 'berry') return fail(`power cut at step ${k} of a bind: the second card plays ${plays[1]} after the reboot, not berry`);
  }
  let cuts = 0;
  for (let s = 1; s <= 40; s++) {
    const m = await month(2000 + s, { cuts: 0.35 });
    if (m.violations.length) return fail(`month ${s} with power cuts: ${m.violations[0]}`);
    cuts += m.cutsDone;
  }
  return { ok: true, cuts };
});
await ms('k', async () => {
  // Scripted: missing, torn, {} by hand, and an edit followed by a missing file.
  const setup = async () => {
    const S = makeSD(); const FL = makeFlash();
    for (const n of ['apple', 'berry', 'cherry']) S.put(`/tape/audio/${n}/01.mp3`, 'a');
    const cards = ['A1', 'B2', 'C3'].map((u) => ({ uid: u, records: null }));
    const box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
    let t = 0;
    for (const c of cards) { for (let i = 0; i < 6; i++, t += 0.25) await box.poll(t, c); for (let i = 0; i < 8; i++, t += 0.25) await box.poll(t, null); }
    return { S, FL, cards };
  };
  const plays = async (S, FL, cards) => {
    const box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
    const got = []; let t = 0;
    for (const c of cards) { const b = box.events.length; for (let i = 0; i < 6; i++, t += 0.25) await box.poll(t, c); for (let i = 0; i < 8; i++, t += 0.25) await box.poll(t, null); got.push(box.events.slice(b).find((e) => e.type === 'play')?.title); }
    return { got, restored: box.events.some((e) => e.type === 'restore') };
  };
  const want = ['apple', 'berry', 'cherry'];
  { const { S, FL, cards } = await setup(); S.del('/tape/cards.json'); S.del('/tape/cards.new');
    const r = await plays(S, FL, cards); if (!r.restored || r.got.join() !== want.join()) return fail(`cards.json deleted: restored=${r.restored}, cards play ${r.got.join(', ')}`); }
  { const { S, FL, cards } = await setup(); S.put('/tape/cards.json', '{"uid:a1": "app'); S.del('/tape/cards.new');
    const r = await plays(S, FL, cards); if (!r.restored || r.got.join() !== want.join()) return fail(`cards.json torn: restored=${r.restored}, cards play ${r.got.join(', ')}`); }
  { const { S, FL, cards } = await setup(); S.put('/tape/cards.json', '{}');
    const r = await plays(S, FL, [cards[2], cards[0], cards[1]]);
    if (r.restored || r.got.join() !== want.join()) return fail(`a hand-written {} should clear the deck (cards rebind in the order placed): restored=${r.restored}, got ${r.got.join(', ')}`); }
  { const { S, FL, cards } = await setup();
    S.put('/tape/cards.json', JSON.stringify({ 'uid:a1': 'berry', 'uid:b2': 'apple', 'uid:c3': 'cherry' }));
    const r1 = await plays(S, FL, cards);
    if (r1.restored || r1.got.join() !== 'berry,apple,cherry') return fail(`a hand-edited cards.json should decide: got ${r1.got.join(', ')}`);
    S.del('/tape/cards.json'); S.del('/tape/cards.new');
    const r2 = await plays(S, FL, cards);
    if (!r2.restored || r2.got.join() !== 'berry,apple,cherry') return fail(`edited, then the file went missing: the box should restore the edited deck, got ${r2.got.join(', ')}`); }
  // Random laptop mishaps and hand edits across months.
  let restores = 0;
  for (let s = 1; s <= 40; s++) {
    const m = await month(3000 + s, { mishaps: 0.2, edits: 0.08 });
    if (m.violations.length) return fail(`month ${s} with laptop mishaps: ${m.violations[0]}`);
    restores += m.restoresSeen;
  }
  return { ok: true, restores };
});

// ---- U: the use log -------------------------------------------------------------------------------
await ms('u', async () => {
  const R = prng(77);
  const S = makeSD(); const FL = makeFlash();
  S.put('/tape/audio/apple/01.mp3', 'a'); S.put('/tape/audio/berry/01.mp3', 'a'); S.put('/tape/audio/Bad Folder/01.mp3', 'a');
  const C = cardFactory(R); const cards = [C.blank(), C.blank(), C.written()];
  const want = { boot: 0, bind: 0, finished: 0, sdChange: 0, badFolder: 0 };
  for (let ev = 0; ev < 10; ev++) {
    let added = false;
    if (ev === 3 || ev === 7) { S.put(`/tape/audio/new-${ev}/01.mp3`, 'a'); added = true; }
    const box = await bootBox({ sd: S.sd, flash: FL.flash, t: 0 });
    want.boot++; want.badFolder++; if (added) want.sdChange++;
    let t = 0;
    for (const c of cards) {
      for (let i = 0; i < 8; i++, t += 0.25) await box.poll(t, c.read);
      await box.trackEnded(t);
      for (let i = 0; i < 8; i++, t += 0.25) await box.poll(t, null);
    }
    want.bind += box.events.filter((e) => e.type === 'bound').length;
    want.finished += box.events.filter((e) => e.type === 'finished').length;
  }
  const lines = (S.F.get('/tape/log.txt') || '').split('\n').filter(Boolean).map((l) => l.split('\t'));
  const count = (k) => lines.filter((l) => l[1] === k).length;
  const got = { boot: count('boot'), bind: count('bind'), finished: count('finished'), sdChange: lines.filter((l) => l[1] === 'boot' && l.includes('sd-change')).length, badFolder: count('bad-folder') };
  if (JSON.stringify(got) !== JSON.stringify(want)) return fail(`log.txt counts ${JSON.stringify(got)}; expected ${JSON.stringify(want)}`);
  if (lines.some((l) => !Number.isFinite(Number(l[0])))) return fail('a log line does not start with its time');
  return { ok: true, ...got };
});

// ---- R: same inputs, same box; and it is built on des -------------------------------------------
await ms('r', async () => {
  const a = await month(4242, { cuts: 0.2, mishaps: 0.2 }), b = await month(4242, { cuts: 0.2, mishaps: 0.2 });
  const snap = (m) => JSON.stringify([[...m.S.F.entries()].sort(), m.FL.raw()]);
  if (snap(a) !== snap(b)) return fail('the same month twice left a different SD card or flash');
  const x = await shelfScenario(), y = await shelfScenario();
  if (snap(x) !== snap(y)) return fail('the same evening twice (binds, tracks, a cue) left a different SD card or flash');
  const ownFiles = [];
  const walk = (d) => { for (const n of readdirSync(join(cwd, d), { withFileTypes: true })) { const p = d ? `${d}/${n.name}` : n.name; if (n.isDirectory()) { if (!['tools', 'engines', 'node_modules', 'refs', 'from', 'council', 'ledger', 'shelf'].includes(n.name)) walk(p); } else if (/\.m?js$/.test(n.name)) ownFiles.push(p); } };
  walk('');
  if (!ownFiles.some((f) => /tools\/des\/des\.mjs/.test(readFileSync(join(cwd, f), 'utf8')))) return fail('no file of the project imports tools/des/des.mjs');
  return { ok: true };
});

console.log(JSON.stringify(out));
