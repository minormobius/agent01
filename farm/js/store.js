// store.js — THE SYNC LAYER. The only file that talks to auth.mino.mobi. board/store.js's pattern,
// simplified for a farm: one com.minomobi.farm.plot record (rkey `self`) IS the whole save, mirrored
// in localStorage for instant load and signed-out play; achievements / gifts / tends are small public
// records written once each. Local tier always works — signing in promotes the local farm instead of
// discarding it (deterministic newFarm means a wanderer save and a DID save differ only in seed, so
// promotion keeps the richer one).

import { AuthClient } from '../vendor/auth.js';
import { toPlotRecord, fromPlotRecord } from './state.js';
import { PLOT_COLLECTION, ACH_COLLECTION, GIFT_COLLECTION, TEND_COLLECTION } from './social.js';

export const SCOPE = [
  'atproto',
  'repo:' + PLOT_COLLECTION,
  'repo:' + ACH_COLLECTION,
  'repo:' + GIFT_COLLECTION,
  'repo:' + TEND_COLLECTION,
].join(' ');
export const SHARE_SCOPE = 'repo:app.bsky.feed.post';   // escalated only when the player taps share

const LS_KEY = 'farm:save';
const SAVE_DEBOUNCE_MS = 1500;
const PLOT_RKEY = 'self';

// TID mint (board/store.js's) — for gift/tend rkeys.
const TID_CHARS = '234567abcdefghijklmnopqrstuvwxyz';
let _lastTid = 0n;
export function generateTid() {
  let t = BigInt(Date.now()) * 1000n;
  if (t <= _lastTid) t = _lastTid + 1n;
  _lastTid = t;
  let v = (t << 10n) | BigInt(Math.floor(Math.random() * 1024));
  let s = '';
  for (let i = 0; i < 13; i++) { s = TID_CHARS[Number(v & 31n)] + s; v >>= 5n; }
  return s;
}

export class FarmStore extends EventTarget {
  constructor() {
    super();
    this.auth = new AuthClient();
    this.user = null;
    this._saveTimer = null;
    this._flushing = false;
    this._dirty = false;
  }

  async init() {
    this.auth.onAuthChange((user) => { this.user = user; this._emit('auth', { user }); });
    try { await this.auth.init(); } catch (e) { /* offline — the local tier still farms */ }
    this.user = this.auth.getUser();
    return this.user;
  }

  login(handle) { return this.auth.login(handle, { scope: SCOPE }); }
  logout() { return this.auth.logout(); }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // ── local mirror ──
  loadLocal() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? fromPlotRecord(JSON.parse(raw)) : null; }
    catch (e) { return null; }
  }
  saveLocal(farm, now) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(toPlotRecord(farm, now))); } catch (e) { /* quota — PDS still has it */ }
  }

  // ── the plot record (rkey self) ──
  async loadRemote() {
    if (!this.user) return null;
    try {
      const rec = await this.auth.pds.getRecord(PLOT_COLLECTION, PLOT_RKEY);
      return rec && rec.value ? fromPlotRecord(rec.value) : null;
    } catch (e) { return null; }
  }

  // debounce writes: farming is clicky, the PDS is not a keystroke log.
  save(farm, now, { immediate = false } = {}) {
    this.saveLocal(farm, now);
    this._pending = { farm, now };
    this._dirty = true;
    if (!this.user) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (immediate) return this._flush();
    this._saveTimer = setTimeout(() => this._flush(), SAVE_DEBOUNCE_MS);
  }

  async _flush() {
    if (this._flushing || !this._dirty || !this.user || !this._pending) return;
    this._flushing = true;
    const { farm, now } = this._pending;
    this._dirty = false;
    try {
      await this.auth.pds.putRecord(PLOT_COLLECTION, PLOT_RKEY, toPlotRecord(farm, now));
      this._emit('synced', { at: now });
    } catch (e) {
      this._dirty = true;                       // keep it pending; the next save retries
      this._emit('syncerror', { error: e });
    } finally {
      this._flushing = false;
      if (this._dirty) { this._saveTimer = setTimeout(() => this._flush(), SAVE_DEBOUNCE_MS * 2); }
    }
  }

  // ── public one-shot records ──
  // achievement: rkey = the achievement id, so a deed can never double-mint.
  async writeAchievement(ach, now) {
    if (!this.user) return null;
    return this.auth.pds.putRecord(ACH_COLLECTION, ach.id, {
      $type: ACH_COLLECTION, achievementId: ach.id, name: ach.name, emoji: ach.emoji,
      desc: ach.desc, earnedAt: new Date(now).toISOString(),
    });
  }

  async writeGift(toDid, item, note, now) {
    if (!this.user) return null;
    return this.auth.pds.createRecord(GIFT_COLLECTION, {
      $type: GIFT_COLLECTION, to: toDid, item, note: note || '', createdAt: new Date(now).toISOString(),
    });
  }

  async writeTend(subjectDid, plantId, now) {
    if (!this.user) return null;
    return this.auth.pds.createRecord(TEND_COLLECTION, {
      $type: TEND_COLLECTION, subject: subjectDid, plantId, verb: 'water', createdAt: new Date(now).toISOString(),
    });
  }

  // ── the share post (app.bsky.feed.post) — scope escalates on first use, from the tap itself ──
  async sharePost(text) {
    if (!this.user) throw new Error('sign in first');
    if (!this.auth.hasScope('app.bsky.feed.post')) {
      await this.auth.ensureScope([SCOPE, SHARE_SCOPE].join(' '));   // redirects; never returns when short
      return null;
    }
    const res = await this.auth.pds.createRecord('app.bsky.feed.post', {
      $type: 'app.bsky.feed.post', text: String(text).slice(0, 300), createdAt: new Date().toISOString(),
    });
    const rkey = res.uri.split('/').pop();
    return { uri: res.uri, url: 'https://bsky.app/profile/' + this.user.did + '/post/' + rkey };
  }
}

export default { FarmStore, SCOPE, SHARE_SCOPE, generateTid };
