// store.js — THE SYNC LAYER. The only file that talks to auth.mino.mobi. board/store.js's pattern,
// simplified for a farm: one com.minomobi.farm.plot record (rkey `self`) IS the whole save, mirrored
// in localStorage for instant load and signed-out play; achievements / gifts / tends are small public
// records written once each. Local tier always works — signing in promotes the local farm instead of
// discarding it (deterministic newFarm means a wanderer save and a DID save differ only in seed, so
// promotion keeps the richer one).

import { AuthClient } from '../vendor/auth.js';
import { toPlotRecord, fromPlotRecord } from './state.js';
import { PLOT_COLLECTION, ACH_COLLECTION, GIFT_COLLECTION, TEND_COLLECTION } from './social.js';

// The login scope asks for POSTING up front: sharing deeds is a core loop, and bouncing the player
// through a re-consent redirect at the exact moment they tap "post" was the worst possible friction.
// One consent screen, six lines, done.
export const FARM_SCOPES = [
  'repo:' + PLOT_COLLECTION,
  'repo:' + ACH_COLLECTION,
  'repo:' + GIFT_COLLECTION,
  'repo:' + TEND_COLLECTION,
];
export const SHARE_SCOPE = 'repo:app.bsky.feed.post';
export const SCOPE = ['atproto', ...FARM_SCOPES, SHARE_SCOPE].join(' ');

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

  // Does the session actually hold the farm's write grants? The .mino.mobi SSO cookie means a
  // sign-in here often RESUMES a session consented on some other site — authenticated, but with
  // none of the com.minomobi.farm.* scopes. Every write would 403; check before assuming.
  hasFarmScope() { return FARM_SCOPES.every((s) => this.auth.hasScope(s)); }
  hasShareScope() { return this.auth.hasScope('app.bsky.feed.post'); }
  // re-consent for the farm's full scope (union with whatever the session already holds).
  // Redirects the page; call from a user gesture. If the grant turns out to already be held
  // (race with another tab), unblock the flush loop and push the pending save through.
  async grantScope() {
    const ok = await this.auth.ensureScope(SCOPE);
    if (ok) { this._scopeBlocked = false; this._failures = 0; this._flush(); }
    return ok;
  }

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

  // is this failure permanent (missing grant — retrying will never help) or transient (network)?
  static isScopeError(e) {
    return /scope|forbidden|403|not authorized|unauthorized/i.test(String((e && e.message) || e));
  }

  async _flush() {
    if (this._flushing || !this._dirty || !this.user || !this._pending) return;
    if (this._scopeBlocked) return;   // a missing grant never fixes itself — wait for grantScope()
    this._flushing = true;
    const { farm, now } = this._pending;
    this._dirty = false;
    try {
      await this.auth.pds.putRecord(PLOT_COLLECTION, PLOT_RKEY, toPlotRecord(farm, now));
      this._failures = 0;
      this._emit('synced', { at: now });
    } catch (e) {
      this._dirty = true;                       // keep it pending
      if (FarmStore.isScopeError(e)) {
        // PERMANENT: the session lacks the farm's write grants. Stop hammering the PDS and tell
        // the app ONCE — the fix is a re-consent redirect, not a retry loop. (This was the
        // "sync hiccup" toast storm after an SSO login consented on another site.)
        this._scopeBlocked = true;
        this._emit('scopeneeded', { error: e });
      } else {
        // TRANSIENT: back off exponentially (3s → 6s → 12s … cap 60s), toast only the first time.
        this._failures = (this._failures || 0) + 1;
        if (this._failures === 1) this._emit('syncerror', { error: e });
      }
    } finally {
      this._flushing = false;
      if (this._dirty && !this._scopeBlocked) {
        const delay = Math.min(60_000, SAVE_DEBOUNCE_MS * 2 * Math.pow(2, Math.max(0, (this._failures || 1) - 1)));
        this._saveTimer = setTimeout(() => this._flush(), delay);
      }
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

  // ── the share post (app.bsky.feed.post). New logins carry the scope from the start; this
  // escalation path remains for sessions consented before posting joined the login scope. ──
  async sharePost(text) {
    if (!this.user) throw new Error('sign in first');
    if (!this.hasShareScope()) {
      await this.auth.ensureScope(SCOPE);   // redirects; never returns when short
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
