// tape1 — the box without the radio (wave 1). STATE-TABLE.md is the table this follows.
// The card watcher's gone-timer lives on a des clock; everything that touches the SD card
// happens in the async poll/trackEnded/boot calls, never inside a des callback.
import { Sim } from './tools/des/des.mjs';
import { decodeCard, CARD_EXTERNAL_TYPE } from './tape-lib/tag.js';

// DECISION (provisional, CHOICE.md): a card is gone 1.0 s after its last good read. W2 allows
// 1.25; at 20 Hz with iid 25% misses, 20 misses in a row is ~1e-12 a poll. Bursts are not iid,
// and the hour of raw polls through the lid plate decides this number, not this comment.
export const GONE_AFTER = 1.0;

export const AUDIO = '/tape/audio';
export const CARDS = '/tape/cards.json';
export const CARDS_NEW = '/tape/cards.new';
export const UNKNOWN = '/tape/unknown.txt';
export const LOG = '/tape/log.txt';
const TITLE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac', 'amr']);

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function isDecodable(name) {
  if (name.startsWith('.')) return false;
  const dot = name.lastIndexOf('.');
  return dot > 0 && AUDIO_EXT.has(name.slice(dot + 1).toLowerCase());
}

export function cardId(read) {
  for (const r of read.records || []) {
    if (!r || r.recordType !== CARD_EXTERNAL_TYPE) continue;
    try {
      let d = r.data;
      if (d instanceof DataView) d = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      else if (d instanceof ArrayBuffer) d = new Uint8Array(d);
      return decodeCard(d).id;
    } catch { /* a corrupt record: try the next */ }
  }
  return 'uid:' + String(read.uid).toLowerCase();
}

// A bindings file parses when it is a JSON object whose non-'_' values are all strings.
export function parseBindings(text) {
  if (typeof text !== 'string') return null;
  let v;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k of Object.keys(v)) {
    if (k.startsWith('_')) continue;
    if (typeof v[k] !== 'string') return null;
    out[k] = v[k];
  }
  return out;
}

export function serialize(bindings) {
  const o = {};
  for (const k of Object.keys(bindings).sort(byCodeUnit)) o[k] = bindings[k];
  return JSON.stringify(o); // no trailing newline: a torn prefix can never close the object
}

async function scan(sd) {
  const titles = new Map(); const bad = [];
  let names = [];
  try { names = (await sd.list(AUDIO)) || []; } catch { names = []; }
  for (const name of [...names].sort(byCodeUnit)) {
    const path = `${AUDIO}/${name}`;
    if (!(await sd.isDir(path))) continue;
    let tracks = [];
    if (TITLE_RE.test(name)) {
      const inner = (await sd.list(path)) || [];
      for (const f of [...inner].sort(byCodeUnit)) if (isDecodable(f) && !(await sd.isDir(`${path}/${f}`))) tracks.push(f);
    }
    if (tracks.length) titles.set(name, tracks); else bad.push(name);
  }
  return { titles, bad };
}

const line = (t, kind, ...rest) => [t, kind, ...rest].join('\t') + '\n';

export async function boot({ sd, flash, t = 0 }) {
  const events = [];
  const sim = new Sim({ seed: 1 });
  if (t > 0) sim.run({ until: t });
  const prior = flash.get();
  const { titles, bad } = await scan(sd);
  const titleList = [...titles.keys()];

  // Who decides the bindings (K): cards.json, else cards.new, else the mirror.
  let bindings = null, decidedBy = null;
  const fromJson = parseBindings(await sd.read(CARDS));
  if (fromJson) { bindings = fromJson; decidedBy = 'cards.json'; }
  else {
    const fromNew = parseBindings(await sd.read(CARDS_NEW));
    if (fromNew) { bindings = fromNew; decidedBy = 'cards.new'; }
    else if (prior && prior.bindings) { bindings = { ...prior.bindings }; decidedBy = 'mirror'; }
  }
  if (!bindings) bindings = {};

  const sdChange = !!(prior && Array.isArray(prior.titles) && prior.titles.join('/') !== titleList.join('/'));
  const mirror = decidedBy && decidedBy !== 'mirror' ? { ...bindings } : prior && prior.bindings ? { ...prior.bindings } : null;
  flash.set({ v: 1, titles: titleList, bindings: mirror });

  // A cut append leaves half a line: start the boot line on a fresh one so it can't merge.
  const logText = await sd.read(LOG);
  const fresh = logText && !logText.endsWith('\n') ? '\n' : '';
  await sd.append(LOG, fresh + line(t, 'boot', `titles=${titleList.length}`, `cards=${Object.keys(bindings).length}`, `from=${decidedBy || 'none'}`, ...(sdChange ? ['sd-change'] : [])));
  for (const b of bad) await sd.append(LOG, line(t, 'bad-folder', b));
  if (decidedBy === 'mirror') {
    events.push({ t, type: 'restore' });
    await sd.append(LOG, line(t, 'restore', `cards=${Object.keys(bindings).length}`));
  }

  // Housekeeping: leave exactly one bindings file that decides, holding what the box decided.
  if (decidedBy === 'cards.json') {
    if ((await sd.read(CARDS_NEW)) !== null) await sd.remove(CARDS_NEW);
  } else if (decidedBy === 'cards.new') {
    await sd.rename(CARDS_NEW, CARDS);
  } else if (decidedBy === 'mirror') {
    await sd.write(CARDS_NEW, serialize(bindings));
    await sd.rename(CARDS_NEW, CARDS);
  }

  // Card watcher + player state.
  let pad = 'empty';          // 'empty' | 'card' | 'crowd'
  let card = null;            // id of the card on the pad
  let playing = null;         // { title, track } while sound plays
  let timer = null;
  const position = new Map(); // card -> track to resume from, this power session

  const emit = (e) => events.push(e);
  function stop(at) {
    if (playing) { position.set(card, playing.track); emit({ t: at, type: 'pause' }); playing = null; }
  }
  function gone() { timer = null; stop(sim.now); pad = 'empty'; card = null; }
  function arm() { if (timer) sim.cancel(timer); timer = sim.schedule(GONE_AFTER, gone); }

  function play(at, id, title, track) {
    playing = { title, track };
    emit({ t: at, type: 'play', card: id, title, track, file: titles.get(title)[track] });
  }

  async function place(at, id) {
    pad = 'card'; card = id; arm();
    let title = Object.hasOwn(bindings, id) ? bindings[id] : null;
    if (title !== null) {
      if (!titles.has(title)) {
        emit({ t: at, type: 'cue', card: id, reason: 'missing' });
        await sd.append(LOG, line(at, 'missing', id, title));
        return;
      }
      const from = position.get(id) ?? 0;
      play(at, id, title, from < titles.get(title).length ? from : 0);
      return;
    }
    const taken = new Set(Object.values(bindings));
    title = titleList.find((x) => !taken.has(x));
    if (title === undefined) {
      emit({ t: at, type: 'cue', card: id });
      await sd.append(UNKNOWN, id + '\n');
      await sd.append(LOG, line(at, 'cue', id));
      return;
    }
    const next = { ...bindings, [id]: title };
    await sd.write(CARDS_NEW, serialize(next));
    await sd.rename(CARDS_NEW, CARDS);         // the bind is durable here, and not before
    bindings = next;
    const f = flash.get() || {};
    flash.set({ ...f, v: 1, bindings: { ...bindings } });
    emit({ t: at, type: 'bound', card: id, title });
    await sd.append(LOG, line(at, 'bind', id, title));
    position.delete(id);
    play(at, id, title, 0);
  }

  const box = {
    events,
    async poll(at, read) {
      sim.run({ until: Math.max(at, sim.now) });
      if (read == null) return;
      if (read.crowd) {
        if (timer) { sim.cancel(timer); timer = null; }
        stop(at);
        pad = 'crowd'; card = null;
        return;
      }
      const id = cardId(read);
      if (pad === 'card' && card === id) { arm(); return; }
      if (pad === 'card') { stop(at); if (timer) { sim.cancel(timer); timer = null; } }
      await place(at, id);
    },
    async trackEnded(at) {
      sim.run({ until: Math.max(at, sim.now) });
      if (!playing) return;
      const tracks = titles.get(playing.title);
      if (playing.track + 1 < tracks.length) { play(at, card, playing.title, playing.track + 1); return; }
      const title = playing.title;
      playing = null; position.set(card, 0);
      emit({ t: at, type: 'finished', title });
      await sd.append(LOG, line(at, 'finished', title));
    },
    // Read-only views for tests and the README; the lab ignores them.
    get state() { return { pad, card, playing: playing && { ...playing }, bindings: { ...bindings }, titles: titleList.slice(), decidedBy }; },
  };
  return box;
}
