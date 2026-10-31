// tape1.mjs — tape wave 1, the box without the radio. (Modulo, day 1)
//
// boot({ sd, flash, t }) → Promise<box>. box.poll(t, read), box.trackEnded(t), box.events.
// Built on des: the box keeps a Sim whose clock is the input time; the gone-timer is a des entry.
//
// DECISIONS (README "Box decisions" has the reasons):
//  D-gone   A card is gone GONE_S = 1.0 s after its last good read, unless another good read of it
//           arrives first. A read at exactly the deadline is too late (des runs entries at t ≤ until
//           before the poll at t). W1 arithmetic: gone needs 20 straight misses at 20 Hz; with 25%
//           missed that's 0.25^20 ≈ 9e-13 per poll, × 72,000 polls/hour ≈ 7e-8 per hour.
//           W2: pause.t = lastGood + 1.0 ≤ lastGood + 1.25, 0.25 s to spare. PROVISIONAL until the
//           household's hour of polls exists.
//  D-same   "Different card" means a different card id (decodeCard id, else uid:…), not uid.
//  D-store  Bind = write /tape/cards.new (whole file, no trailing whitespace, so half of it never
//           parses), rename it over cards.json, then flash mirror, then `bound`, then log.
//  D-boot   cards.json parses → decides; a stray cards.new beside it is stale (a cut rename) and is
//           removed. Else cards.new parses → decides and is renamed over cards.json. Else mirror →
//           restore and cards.json is rewritten from it. A cards.json that exists but doesn't parse
//           is first renamed to cards.bad (the household's text is kept, not overwritten), also when
//           nothing decides (no mirror), and never over an earlier cards.bad (cards.bad.2, …).
//  D-gone-title  A bound card whose title folder is gone: `cue` event, log line `missing-title`,
//           nothing appended to unknown.txt (it isn't unknown), binding kept.
//  D-tornread (Modulo, day 3) While a card is on the pad, a read whose id falls back to uid:<x> and
//           whose x is the uid that card was last read with is a miss, not another card. One
//           physical tag can't change its record while it never left the field (the box has no
//           writer), so this is a torn read. Without it, one torn read in 10,000 bound a phantom
//           `uid:` card to a free book within half an hour (measured). A torn *placing* read still
//           places uid:<x>: SPEC says placed at first good read.
//  D-known  (Morphyx, day 4) D-tornread only covers the card on the pad, but every *placement* of a
//           written card is also a chance to tear (after a lift, after a crowd), and each torn placement
//           bound a phantom for good. So the box remembers, in flash (no SD step), every uid it has
//           read a decodable tape record from. A later read of a remembered uid that carries a
//           'minomobi.com:tape' record which doesn't decode is a miss, wherever the pad stands. Narrow
//           on purpose: a blank read (records null) or one with no tape record at all still gives
//           uid:<x> as SPEC says, so a card wiped or rewritten by a phone is a new card. Left open:
//           a card's very first read being torn still places uid:<x> (it was never seen good).
//  D-log    Log lines are buffered per input and written with one append at the end of it.
import { Sim } from './tools/des/des.mjs';
import { decodeCard, CARD_EXTERNAL_TYPE } from './tape-lib/tag.js';

export const GONE_S = 1.0;
export const AUDIO = '/tape/audio';
export const CARDS = '/tape/cards.json';
export const CARDS_NEW = '/tape/cards.new';
export const CARDS_BAD = '/tape/cards.bad';
export const UNKNOWN = '/tape/unknown.txt';
export const LOG = '/tape/log.txt';
export const TITLE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac|amr)$/i;

export const isDecodable = (name) => typeof name === 'string' && !name.startsWith('.') && AUDIO_EXT.test(name);

function toBytes(d) {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (Array.isArray(d)) return Uint8Array.from(d);
  return null;
}

/** The card id of a single-tag read: first tape record that decodes, else uid:<lowercase uid>. */
export function cardIdOf(read) {
  for (const r of Array.isArray(read.records) ? read.records : []) {
    if (!r || r.recordType !== CARD_EXTERNAL_TYPE) continue;
    const b = toBytes(r.data);
    if (!b) continue;
    try { return decodeCard(b).id; } catch { /* corrupt: try the next one */ }
  }
  return 'uid:' + String(read.uid).toLowerCase();
}

/** True when the read carries a tape record but none of them decodes (a torn or corrupt read). */
export function tapeTorn(read) {
  const rs = Array.isArray(read.records) ? read.records : [];
  return rs.some((r) => r && r.recordType === CARD_EXTERNAL_TYPE) && cardIdOf(read).startsWith('uid:');
}

/** A bindings file parses when it is a JSON object whose non-`_` values are all strings. */
export function parseBindings(text) {
  if (typeof text !== 'string') return null;
  let v;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  for (const [k, x] of Object.entries(v)) if (!k.startsWith('_') && typeof x !== 'string') return null;
  return v;
}
const bindingsOnly = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

async function scanTitles(sd) {
  const titles = new Map();  // name → [track names]
  const bad = [];
  let names = [];
  try { names = (await sd.isDir(AUDIO)) ? ((await sd.list(AUDIO)) || []) : []; } catch { names = []; }
  for (const name of [...names].sort()) {
    const dir = AUDIO + '/' + name;
    if (!(await sd.isDir(dir))) continue;            // loose files in /tape/audio are not folders
    let tracks = [];
    if (TITLE_RE.test(name)) {
      for (const f of [...((await sd.list(dir)) || [])].sort()) {
        if (isDecodable(f) && !(await sd.isDir(dir + '/' + f))) tracks.push(f);
      }
    }
    if (tracks.length) titles.set(name, tracks); else bad.push(name);
  }
  return { titles, bad };
}

// D-bad (Morphyx): rename replaces its target, so a second mangle would overwrite the first one's
// cards.bad. Each mangle gets the first free name: cards.bad, cards.bad.2, cards.bad.3, …
async function freeBad(sd) {
  for (let i = 1; ; i++) { const p = i === 1 ? CARDS_BAD : `${CARDS_BAD}.${i}`; if ((await sd.read(p)) === null) return p; }
}

const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export async function boot({ sd, flash, t = 0 }) {
  const box = new Box(sd, flash, t);
  await box._boot();
  return box;
}

class Box {
  constructor(sd, flash, t) {
    this.sd = sd; this.flash = flash;
    this.events = [];
    this.sim = new Sim({ seed: 1 });
    this.sim.now = t;
    this.t0 = t;
    this._lines = [];
    // watcher
    this.card = null;          // id of the card on the pad, or null
    this.padUid = null;        // lower-case factory uid of its last good read (D-tornread)
    this.crowd = false;
    this.lastGood = -Infinity;
    this.goneTimer = null;
    // player
    this.playing = null;       // { card, title, track } while sound plays
    this.silent = false;       // card on pad but finished / cued
    this.pos = new Map();      // card → track to resume from (this power session)
  }

  _emit(e) { this.events.push(e); }
  _log(t, kind, ...details) { this._lines.push([t, kind, ...details].join('\t') + '\n'); }
  async _flush() {
    if (!this._lines.length) return;
    const text = this._lines.join('');
    this._lines = [];
    await this._appendLine(LOG, text);
  }
  // D-torn: a cut append leaves half a line. Before this power session's first append to a file,
  // end that torn line, so our first line doesn't glue onto it.
  async _appendLine(path, text) {
    this._torn ??= new Map();
    if (!this._torn.has(path)) {
      const old = await this.sd.read(path);
      this._torn.set(path, false);
      if (old && !old.endsWith('\n')) text = '\n' + text;
    }
    await this.sd.append(path, text);
  }

  async _boot() {
    const { sd, flash } = this;
    const t = this.t0;
    const prev = await flash.get();
    const { titles, bad } = await scanTitles(sd);
    this.titles = titles;
    const titleNames = [...titles.keys()];   // already sorted

    let decided = null, source = null;
    const cur = await sd.read(CARDS);
    const fromCards = parseBindings(cur);
    const newText = await sd.read(CARDS_NEW);
    if (fromCards) { decided = fromCards; source = 'cards.json'; }
    else {
      const fromNew = parseBindings(newText);
      if (fromNew) { decided = fromNew; source = 'cards.new'; }
      else if (prev && prev.mirror) { decided = { ...prev.mirror }; source = 'mirror'; }
      else decided = {};
    }
    this.file = decided;                               // the whole object, `_` keys included
    this.bindings = bindingsOnly(decided);

    const mirror = source === 'mirror' ? prev.mirror
      : source ? { ...decided } : (prev && prev.mirror) || null;
    this.known = new Set(prev && Array.isArray(prev.known) ? prev.known : []);   // D-known
    await flash.set({ v: 1, titles: titleNames, mirror, known: [...this.known].sort() });

    const sdChange = !!prev && Array.isArray(prev.titles) && !sameSet(prev.titles, titleNames);
    this._log(t, 'boot', ...(sdChange ? ['sd-change'] : []), `titles=${titleNames.length}`, `cards=${Object.keys(this.bindings).length}`, `from=${source || 'none'}`);
    for (const b of bad) { this._log(t, 'bad-folder', b); this._emit({ t, type: 'bad-folder', folder: b }); }
    if (source === 'mirror') { this._emit({ t, type: 'restore' }); this._log(t, 'restore'); }

    // repair the card so the next boot reads what this one decided
    if (source === 'cards.json') {
      if (newText !== null) await sd.remove(CARDS_NEW);
    } else if (source === 'cards.new') {
      if (cur !== null) await sd.rename(CARDS, await freeBad(sd));
      await sd.rename(CARDS_NEW, CARDS);
    } else if (source === 'mirror') {
      if (cur !== null) await sd.rename(CARDS, await freeBad(sd));
      await sd.write(CARDS_NEW, JSON.stringify(this.file));
      await sd.rename(CARDS_NEW, CARDS);
    } else if (cur !== null) {
      // D-bad (Morphyx): nothing parses and no mirror. The person's text still goes aside, or the
      // first bind's rename would overwrite it.
      await sd.rename(CARDS, await freeBad(sd));
    }
    await this._flush();
  }

  // ---- time: run des up to t (the gone-timer may fire in between)
  _advance(t) {
    if (t > this.sim.now) this.sim.run({ until: t });
  }

  _armGone() {
    if (this.goneTimer) this.sim.cancel(this.goneTimer);
    const at = this.lastGood + GONE_S;
    this.goneTimer = this.sim.schedule(Math.max(0, at - this.sim.now), function gone() {
      this.goneTimer = null;
      this._leave(this.sim.now);
    }.bind(this));
  }

  _leave(t) {   // the card on the pad has gone
    if (this.goneTimer) { this.sim.cancel(this.goneTimer); this.goneTimer = null; }
    if (this.playing) this._stop(t);
    this.card = null; this.silent = false; this.padUid = null;
  }

  _stop(t) {
    const p = this.playing;
    this.pos.set(p.card, p.track);
    this.playing = null;
    this._emit({ t, type: 'pause' });
  }

  async poll(t, read) {
    this._advance(t);
    if (read && read.crowd) {
      if (this.card !== null || this.playing) this._leave(t);
      this.crowd = true;
    } else if (read && typeof read === 'object' && 'uid' in read) {
      const id = cardIdOf(read);
      const uid = String(read.uid).toLowerCase();
      if (!id.startsWith('uid:') && !this.known.has(uid)) {          // D-known: remember good uids
        this.known.add(uid);
        const prev = (await this.flash.get()) || { v: 1, titles: [...this.titles.keys()], mirror: null };
        await this.flash.set({ ...prev, known: [...this.known].sort() });
      }
      if (this.known.has(uid) && tapeTorn(read)) {
        // D-known: a remembered written card, read torn. A miss: no place, no swap, no hold.
      } else if (this.crowd || this.card === null) {
        this.crowd = false;
        await this._place(t, id);
      } else if (id !== this.card && id.startsWith('uid:') && id === 'uid:' + this.padUid) {
        // D-tornread: the card on the pad, read with its record cut short. A miss, not a new card.
      } else if (id !== this.card) {
        this._leave(t);
        await this._place(t, id);
      }
      if (this.card === id) { this.lastGood = t; this.padUid = String(read.uid).toLowerCase(); this._armGone(); }
    }
    await this._flush();
  }

  async trackEnded(t) {
    this._advance(t);
    const p = this.playing;
    if (p) {
      const tracks = this.titles.get(p.title);
      if (p.track + 1 < tracks.length) this._play(t, p.card, p.title, p.track + 1);
      else {
        this.playing = null; this.silent = true;
        this.pos.delete(p.card);
        this._emit({ t, type: 'finished', title: p.title });
        this._log(t, 'finished', p.title, p.card);
      }
    }
    await this._flush();
  }

  _play(t, card, title, track) {
    const file = this.titles.get(title)[track];
    this.playing = { card, title, track };
    this._emit({ t, type: 'play', card, title, track, file });
    this._log(t, 'play', card, title, track, file);
  }

  async _place(t, id) {
    this.card = id; this.silent = false;
    let title = Object.prototype.hasOwnProperty.call(this.bindings, id) ? this.bindings[id] : null;
    if (title === null) {
      const taken = new Set(Object.values(this.bindings));
      const free = [...this.titles.keys()].find((n) => !taken.has(n));
      if (free === undefined) {
        this.silent = true;
        this._emit({ t, type: 'cue', card: id });
        this._log(t, 'cue', id);
        await this._appendLine(UNKNOWN, id + '\n');
        return;
      }
      await this._bind(t, id, free);
      title = free;
    }
    if (!this.titles.has(title)) {
      this.silent = true;
      this._emit({ t, type: 'cue', card: id });
      this._log(t, 'missing-title', id, title);
      return;
    }
    this._play(t, id, title, this.pos.get(id) || 0);
  }

  async _bind(t, id, title) {
    const gen = (Number.isInteger(this.file._gen) ? this.file._gen : 0) + 1;
    const next = { ...this.file, [id]: title, _gen: gen };
    await this.sd.write(CARDS_NEW, JSON.stringify(next));
    await this.sd.rename(CARDS_NEW, CARDS);
    this.file = next;
    this.bindings = bindingsOnly(next);
    const prev = (await this.flash.get()) || { v: 1, titles: [...this.titles.keys()] };
    await this.flash.set({ ...prev, mirror: { ...next } });
    this._emit({ t, type: 'bound', card: id, title });
    this._log(t, 'bind', id, title);
  }
}
