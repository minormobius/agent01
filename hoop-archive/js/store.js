// hoop data model + two interchangeable backends.
//
//   LocalBackend   — localStorage. Always works, zero network. The instant
//                    preview path; seeded with a starter world so the canvas
//                    and threads are alive on first load.
//   AtprotoBackend — the real thing. Writes go to the signed-in user's PDS via
//                    the OAuth worker proxy; reads merge the whole crew's public
//                    repos. This is what "exposed to atproto" means: every place
//                    is a com.minomobi.hoop.place record, every message a
//                    com.minomobi.hoop.message record.
//
// Both speak the same interface:
//   listPlaces()                       -> Place[]
//   putPlace(place)                    -> Place      (deterministic rkey `${x}-${y}`)
//   listMessages(placeId)              -> Message[]
//   postMessage({placeId,text,parentId}) -> Message
//
// Every place also carries a CHAMBER ADDRESS (the postal system): the foam chamber it sits in
// (`gid`), that gid wrapped in a hierarchical address (`addr`), and the radial layer (`depth`).
// The address is sourced from a chamber lookup the app injects (setChamberLookup) — store stays
// free of world.js. A place is therefore "the thread of chamber X", not just a raw tile; NPCs
// will bind to the same addresses. Tile (x,y) stays as the canonical drop coordinate + rkey.

import { listRepoRecords, resolveDid, profileForDid } from './atproto.js';
import { addressFromGid } from './postal.js';

export const PLACE_NSID = 'com.minomobi.hoop.place';
export const MESSAGE_NSID = 'com.minomobi.hoop.message';

export const placeId = (x, y) => `${x}-${y}`;
const nowISO = () => new Date().toISOString();

// ── chamber lookup (injected by the app from world.js's FoamField) ────────────────────────
// fn(x,y) -> { gid:"cx,cy,i", depth } | null. Kept out of store's hard deps so the model and
// both backends stay world-agnostic and testable.
let _chamberLookup = null;
export function setChamberLookup(fn) { _chamberLookup = fn; }
// attach gid / addr / depth to a place if missing and a lookup is available (best-effort, pure)
export function withAddress(place) {
  if (place && place.addr && place.gid) return place;
  try {
    const ch = (_chamberLookup && place && place.x != null) ? (_chamberLookup(place.x, place.y) || {}) : {};
    const gid = place.gid ?? ch.gid;
    if (gid == null) return place;
    return { ...place, gid, depth: place.depth ?? ch.depth ?? 0, addr: place.addr ?? addressFromGid(gid) };
  } catch { return place; }
}

// ── Starter world ────────────────────────────────────────────────────────────
// A small constellation of design nodes for "the infinite game", with a seed
// conversation between the two designers so the preview reads as a living space.
export const SEED_PLACES = [
  { x: 24, y: 14, glyph: '⌂', kind: 'hub',       title: 'The Hub',        summary: 'Where every loop of the infinite game begins and returns. Spawn, social, the long table.' },
  { x: 14, y: 9,  glyph: '⚔', kind: 'sandbox',   title: 'Combat Sandbox', summary: 'Tuning grounds for the verbs. If the moment-to-moment fails here, nothing downstream matters.' },
  { x: 35, y: 8,  glyph: '☥', kind: 'lore',      title: 'Lore Vault',     summary: 'The myth-engine. Generated history that the world remembers. Borrowed bones from read.mino.mobi.' },
  { x: 33, y: 20, glyph: '∞', kind: 'system',    title: 'The Loop Engine','summary': 'The core: how a session ends so the next one is richer. Permanence, decay, inheritance.' },
  { x: 12, y: 20, glyph: '⌘', kind: 'threshold', title: 'The Threshold',  summary: 'Onboarding & the first ten minutes. The door a new player walks through.' },
];

export const SEED_MESSAGES = [
  { placeId: '24-14', author: 'mino',  text: 'Kicking this off. The Hub is the spine — everything should be ≤2 hops from here. Walk the @ around and drop a node wherever a system wants its own thread.' },
  { placeId: '24-14', author: 'hoopy', text: 'love it. so the map *is* the forum. each place = one long-running conversation. that\'s the whole pitch.', parentOf: 0 },
  { placeId: '24-14', author: 'mino',  text: 'Exactly. And because every place + message is an atproto record, the design log is quasi-permanent. We can fork the whole thing later.' },
  { placeId: '33-20', author: 'hoopy', text: 'the Loop Engine is the scary one. what actually carries over between runs? if it\'s everything it\'s a save file, if it\'s nothing it\'s arcade.' },
  { placeId: '33-20', author: 'mino',  text: 'Proposal: the WORLD remembers, the player mostly doesn\'t. You inherit reputation + a few scars, not power. Keeps the loop honest.', parentOf: 3 },
  { placeId: '14-9',  author: 'mino',  text: 'Three verbs to start: move, strike, parley. Resist adding a fourth until these three feel inevitable.' },
  { placeId: '35-8',  author: 'hoopy', text: 'can we wire the Lore Vault to the read/ mythograph generator? generated history that the Loop Engine can actually reference. that\'d be unreal.' },
];

// ── Threading helper: build a flat list into a nested tree by parentId ───────
export function threadTree(messages) {
  const byId = new Map(messages.map((m) => [m.id, { ...m, children: [] }]));
  const roots = [];
  for (const m of byId.values()) {
    if (m.parentId && byId.has(m.parentId)) byId.get(m.parentId).children.push(m);
    else roots.push(m);
  }
  const sortRec = (list) => {
    list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// ── Local backend ────────────────────────────────────────────────────────────
const LS_PLACES = 'hoop:places:v1';
const LS_MSGS = 'hoop:messages:v1';

export class LocalBackend {
  constructor() {
    this.mode = 'local';
    this._seedIfEmpty();
  }
  _read(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  _write(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

  _seedIfEmpty() {
    if (localStorage.getItem(LS_PLACES)) return;
    const places = SEED_PLACES.map((p) => ({
      id: placeId(p.x, p.y), ...p, author: 'mino', createdAt: nowISO(),
    }));
    let t = Date.now() - SEED_MESSAGES.length * 60000;
    const made = [];
    SEED_MESSAGES.forEach((m, i) => {
      const id = `seed-${i}`;
      const parentId = m.parentOf != null ? `seed-${m.parentOf}` : undefined;
      made.push({ id, placeId: m.placeId, text: m.text, author: m.author, parentId, seed: true, createdAt: new Date(t).toISOString() });
      t += 60000;
    });
    this._write(LS_PLACES, places);
    this._write(LS_MSGS, made);
  }

  async listPlaces() { return this._read(LS_PLACES).map(withAddress); }

  async putPlace(place) {
    const places = this._read(LS_PLACES);
    const id = placeId(place.x, place.y);
    const rec = withAddress({ id, createdAt: nowISO(), ...place, id });
    const i = places.findIndex((p) => p.id === id);
    if (i >= 0) places[i] = { ...places[i], ...rec }; else places.push(rec);
    this._write(LS_PLACES, places);
    return rec;
  }

  async listMessages(pid) {
    return this._read(LS_MSGS).filter((m) => m.placeId === pid);
  }

  async postMessage({ placeId: pid, text, parentId, author }) {
    const msgs = this._read(LS_MSGS);
    const rec = { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, placeId: pid, text, parentId, author: author || 'you', createdAt: nowISO() };
    msgs.push(rec);
    this._write(LS_MSGS, msgs);
    return rec;
  }
}

// ── ATProto backend ──────────────────────────────────────────────────────────
// `auth` is an initialised AuthClient (vendor/auth.js). `getCrew()` returns the
// list of participant handles/dids whose public repos we merge into the view.
export class AtprotoBackend {
  constructor(auth, getCrew) {
    this.mode = 'atproto';
    this.auth = auth;
    this.getCrew = getCrew;
  }

  async _profile(did) { return profileForDid(did); }

  async _crewDids() {
    const me = this.auth.getUser();
    const handles = new Set((await this.getCrew()) || []);
    if (me?.handle) handles.add(me.handle);
    const dids = await Promise.all([...handles].map((h) => resolveDid(h)));
    if (me?.did) dids.push(me.did);
    return [...new Set(dids.filter(Boolean))];
  }

  async listPlaces() {
    const dids = await this._crewDids();
    const all = (await Promise.all(dids.map((d) => listRepoRecords(d, PLACE_NSID)))).flat();
    // Deterministic rkey = `${x}-${y}`, so dedupe by id keeping the earliest.
    const byId = new Map();
    for (const r of all) {
      const v = r.value || {};
      const id = placeId(v.x, v.y);
      const prof = await this._profile(r._did);
      const place = withAddress({ id, title: v.title, glyph: v.glyph, kind: v.kind, x: v.x, y: v.y, summary: v.summary, addr: v.addr, gid: v.gid, depth: v.depth, createdAt: v.createdAt, author: prof.handle, authorDid: prof.did, avatar: prof.avatar });
      const prev = byId.get(id);
      if (!prev || (place.createdAt && place.createdAt < prev.createdAt)) byId.set(id, place);
    }
    return [...byId.values()];
  }

  async putPlace(place) {
    const id = placeId(place.x, place.y);
    const e = withAddress({ ...place });
    const value = {
      $type: PLACE_NSID,
      title: e.title, glyph: e.glyph || '◆', kind: e.kind || 'node',
      x: e.x, y: e.y, summary: e.summary || '', createdAt: nowISO(),
    };
    if (e.addr) value.addr = e.addr;            // the chamber address (postal)
    if (e.gid) value.gid = e.gid;               // the foam chamber it binds to
    if (e.depth != null) value.depth = e.depth; // the radial layer
    // Deterministic rkey so both designers converge on one place per coordinate.
    await this.auth.pds.putRecord(PLACE_NSID, id, value);
    const me = this.auth.getUser();
    return { id, ...e, author: me?.handle || 'you', createdAt: value.createdAt };
  }

  async listMessages(pid) {
    const dids = await this._crewDids();
    const all = (await Promise.all(dids.map((d) => listRepoRecords(d, MESSAGE_NSID)))).flat();
    const out = [];
    for (const r of all) {
      const v = r.value || {};
      if (v.placeId !== pid) continue;
      const prof = await this._profile(r._did);
      out.push({ id: r.uri || `${r._did}/${r.cid}`, placeId: v.placeId, text: v.text, parentId: v.parentId, createdAt: v.createdAt, author: prof.handle, authorDid: prof.did, avatar: prof.avatar });
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return out;
  }

  async postMessage({ placeId: pid, text, parentId }) {
    const value = { $type: MESSAGE_NSID, placeId: pid, text, createdAt: nowISO() };
    if (parentId) value.parentId = parentId;
    const res = await this.auth.pds.createRecord(MESSAGE_NSID, value);
    const me = this.auth.getUser();
    return { id: res?.uri || `local-${Date.now()}`, placeId: pid, text, parentId, createdAt: value.createdAt, author: me?.handle || 'you' };
  }
}
