// tape1.mjs — reference for SPEC.md, for the lab's checker only. The box: a des Sim advanced to
// each input's time, a card watcher whose "gone" is a des timer, bindings kept on the SD (cut-safe:
// cards.new then rename) and mirrored in flash, and a use log.
import { Sim } from './tools/des/des.mjs';
import { decodeCard, CARD_EXTERNAL_TYPE } from './tape-lib/tag.js';

const AUDIO = '/tape/audio';
const CARDS = '/tape/cards.json', NEW = '/tape/cards.new';
const LOG = '/tape/log.txt', UNKNOWN = '/tape/unknown.txt';
const TITLE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const DECODABLE = /\.(mp3|m4a|aac|wav|ogg|opus|flac|amr)$/i;
const GONE_AFTER = 1.0; // seconds without a good read

const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function cardId(read) {
  for (const r of read.records || []) {
    if (r.recordType !== CARD_EXTERNAL_TYPE) continue;
    try { return decodeCard(r.data).id; } catch { /* a corrupt record: fall back to the UID */ }
  }
  return `uid:${String(read.uid).toLowerCase()}`;
}

// A bindings file parses when it is a JSON object whose non-underscore values are all strings.
function parseBindings(text) {
  if (text == null) return null;
  let o; try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('_')) continue;
    if (typeof v !== 'string') return null;
    out[k] = v;
  }
  return out;
}

export async function boot({ sd, flash, t = 0 }) {
  const sim = new Sim({ seed: 1 });
  sim.run({ until: t });
  const events = [];
  const emit = (e) => events.push({ t: sim.now, ...e });
  const log = async (...parts) => { await sd.append(LOG, `${sim.now}\t${parts.join('\t')}\n`); };

  // Titles: folders under /tape/audio with a safe name and at least one decodable file.
  const titles = {}, bad = [];
  for (const name of [...(await sd.list(AUDIO))].sort(byCode)) {
    if (!(await sd.isDir(`${AUDIO}/${name}`))) continue;
    const tracks = [...(await sd.list(`${AUDIO}/${name}`))].filter((f) => DECODABLE.test(f)).sort(byCode);
    if (TITLE.test(name) && tracks.length) titles[name] = tracks; else bad.push(name);
  }
  const order = Object.keys(titles).sort(byCode);

  // Bindings: cards.json if it parses, else cards.new if it parses, else the flash mirror.
  const mirror = (await flash.get()) || {};
  let bindings = parseBindings(await sd.read(CARDS)) ?? parseBindings(await sd.read(NEW));
  let restored = false;
  if (bindings == null) { bindings = { ...(mirror.bindings || {}) }; restored = mirror.bindings != null; }
  const lastTitles = mirror.titles || null;
  const sdChange = lastTitles != null && JSON.stringify(lastTitles) !== JSON.stringify(order);
  await flash.set({ bindings, titles: order });
  await log('boot', ...(sdChange ? ['sd-change'] : []));
  for (const b of bad) await log('bad-folder', b);
  if (restored) { emit({ type: 'restore', from: 'flash' }); await log('restore'); }

  // Playback state.
  let present = null;       // the card on the pad, as the watcher believes
  let crowded = false;
  let playing = null;       // { card, title, track }
  const finishedFor = new Set();
  const trackOf = {};       // card -> track index, this power session
  let goneTimer = null;

  const stop = () => { if (playing) { playing = null; emit({ type: 'pause' }); } };
  const start = (card, title, track) => {
    playing = { card, title, track };
    emit({ type: 'play', card, title, track, file: titles[title][track] });
  };
  const gone = () => { goneTimer = null; present = null; stop(); };

  async function placed(card) {
    present = card;
    let title = bindings[card];
    if (title === undefined) {
      const bound = new Set(Object.values(bindings));
      title = order.find((x) => !bound.has(x));
      if (title === undefined) {
        emit({ type: 'cue', card });
        await sd.append(UNKNOWN, `${card}\n`);
        return;
      }
      const next = { ...bindings, [card]: title };
      await sd.write(NEW, JSON.stringify(next));
      await sd.rename(NEW, CARDS);
      bindings = next;
      await flash.set({ bindings, titles: order });
      emit({ type: 'bound', card, title });
      await log('bind', card, title);
      trackOf[card] = 0;
    }
    if (!titles[title]) { emit({ type: 'cue', card }); return; }
    if (finishedFor.has(card)) { finishedFor.delete(card); trackOf[card] = 0; }
    start(card, title, trackOf[card] ?? 0);
  }

  const advance = (to) => { if (to < sim.now) throw new Error(`time went backwards: ${to} < ${sim.now}`); sim.run({ until: to }); };

  return {
    events,
    async poll(t, read) {
      advance(t);
      if (read && read.crowd) {
        crowded = true; sim.cancel(goneTimer); goneTimer = null;
        stop(); present = null;
        return;
      }
      if (!read) return;
      const card = cardId(read);
      crowded = false;
      sim.cancel(goneTimer);
      goneTimer = sim.schedule(GONE_AFTER, gone);
      if (present === card) return;
      if (present !== null) { stop(); present = null; }
      await placed(card);
    },
    async trackEnded(t) {
      advance(t);
      if (!playing) return;
      const { card, title, track } = playing;
      if (track + 1 < titles[title].length) { trackOf[card] = track + 1; start(card, title, track + 1); return; }
      playing = null; finishedFor.add(card); trackOf[card] = 0;
      emit({ type: 'finished', title });
      await log('finished', title);
    },
  };
}
