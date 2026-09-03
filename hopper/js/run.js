// hopper — a run. The world on a clock, the log of what the player did to it,
// the worms as weather, and the record that replays all of it anywhere.
//
// A world is a seed plus an event log. The engine is deterministic tick for
// tick, so if a deploy happened at clock 41,203 and a brick was broken at
// 58,990, running the same level to those clocks and applying the same
// events gives the same crystal, brick for brick, worm for worm. That is what
// makes a run a record a few kilobytes long: the level's numbers, the events
// with their clocks, and the player's path against real time, so a ghost can
// walk it again at the pace it was walked.
//
// Weather: with `worms` on, a wave of grazers rides in with every pack —
// they eat only exposed bricks, and what they eat goes back to the melt as
// budget for the colony still growing (the study's recycling), so a growth
// under weather lasts longer while the frozen terrain behind the player
// slowly loses its edges. Deterministic like everything else: the waves are
// events, and the worms keep the world's clock.

import { level, world, normalizeLevel, normalizeShape } from "./level.js";
import { Worms } from "./worms.js";

export const RECORD_VERSION = 1;
export const COLLECTION = "com.minomobi.hopper.run";     // the ATProto lexicon a published run is written to
// The study's defaults are a tenth of a colony's laying over 300k ticks; a
// hopper run is a few tens of thousands, so the weather is set for the
// game's clock: four grazers a wave, edges and corners edible (exposed 4 —
// the treads of a staircase are four-bond bricks), a bite every sixteen
// moves. About two bricks a second gone from the frozen terrain at the idle
// clock, a seventh of what a live colony lays while it lays.
export const WEATHER = { count: 4, speed: 0.06, bite: 0.06, length: 6, recycle: true, depth: -1, exposed: 4, spawnAfter: 0, starve: 0, lostAfter: 24 };
export const IDLE_TICKS = 240;                            // ticks a second once nothing grows (the worms' clock)

export class Run {
  constructor(n, shape = "grid", worms = false) {
    this.n = normalizeLevel(n);
    this.shape = normalizeShape(shape);
    this.worms = !!worms;
    this.lv = level(this.n, this.shape);
    this.growth = world(this.lv);
    this.W = this.worms ? new Worms(this.growth, WEATHER) : null;
    this.clock = 0;
    this.events = [];          // [clock, "d", packIndex, site] | [clock, "b", site]
    this.path = [];            // [tenths of a second, clock, x·100, y·100, z·100, yaw·100, pitch·100]
    this.t = 0;                // seconds of play
    this.parentEvents = 0;     // events inherited from a run this one continues
  }

  get live() { return !this.growth.done; }
  get busy() { return this.live || (this.W !== null && this.W.worms.length > 0); }

  // the world's clock: the growth while it is live, the worms always
  tick(n = 1) {
    const g = this.growth, W = this.W;
    for (let i = 0; i < n; i++) {
      this.clock++;
      if (!g.done) g.step();
      if (W !== null && W.worms.length) W.step();
    }
  }

  _deploy(packIndex, site) {
    const pack = this.lv.packs[packIndex];
    if (!pack) return -1;
    const idx = this.growth.deploy(pack, site);
    if (idx < 0) return -1;
    if (this.W !== null) {
      // weather: a wave rides in with every pack, on the plate it landed as
      const br = this.growth.bricks, sub = this.growth.sub, plate = [];
      for (let i = br.length - 1; i >= 0 && br[i].c === idx; i--) plate.push(br[i].tile !== undefined ? sub.siteAt({ tile: br[i].tile, z: br[i].z }) : sub.siteAt(br[i]));
      this.W.releaseAt(plate);
    }
    return idx;
  }
  _remove(site) { return this.growth.remove(site); }

  deploy(packIndex, site) {
    const idx = this._deploy(packIndex, site);
    if (idx >= 0) this.events.push([this.clock, "d", packIndex, site]);
    return idx;
  }
  remove(site) {
    const ok = this._remove(site);
    if (ok) this.events.push([this.clock, "b", site]);
    return ok;
  }
  apply(e) {
    if (e[1] === "d") return this._deploy(e[2], e[3]);
    if (e[1] === "b") return this._remove(e[2]);
    return false;
  }

  // Replay: bring the world to `clock`, applying `events` (sorted by clock)
  // on the way; `cursor.i` is where the events are up to. An event recorded
  // at clock c happened after the world reached c and before the tick to
  // c + 1, so it is applied when the clock equals c.
  advanceTo(clock, events, cursor) {
    const drain = () => { while (cursor.i < events.length && events[cursor.i][0] <= this.clock) { const e = events[cursor.i++]; this.apply(e); this.events.push(e); } };
    drain();
    while (this.clock < clock) { this.tick(1); drain(); }
  }

  sample(t, p) {
    this.path.push([Math.round(t * 10), this.clock, Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100), Math.round(p.yaw * 100), Math.round(p.pitch * 100)]);
  }

  record(result) {
    return { v: RECORD_VERSION, n: this.n, shape: this.shape, worms: this.worms, clock: this.clock, t: +this.t.toFixed(2), parent: this.parentEvents, events: this.events, path: this.path, result: result || null };
  }

  // A run replayed to its end, ready to be continued: the crystal as they
  // left it (every colony frozen), the events kept as this run's prefix.
  static continueFrom(rec) {
    const r = new Run(rec.n, rec.shape, rec.worms);
    r.advanceTo(rec.clock, rec.events, { i: 0 });
    r.growth.freeze();
    r.parentEvents = r.events.length;
    return r;
  }
}

// ── the record on the wire: JSON → deflate-raw → base64url, "1." prefixed; "0." for plain ──
const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64 = (str) => { const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/")); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

export async function encodeRecord(rec) {
  const bytes = new TextEncoder().encode(JSON.stringify(rec));
  if (typeof CompressionStream === "function") {
    try {
      const cs = new CompressionStream("deflate-raw");
      const w = cs.writable.getWriter();
      w.write(bytes); w.close();
      const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      return "1." + b64(out);
    } catch (e) { /* fall through to plain */ }
  }
  return "0." + b64(bytes);
}

export async function decodeRecord(str) {
  if (typeof str !== "string" || str.length < 3 || str[1] !== ".") return null;
  try {
    let bytes = unb64(str.slice(2));
    if (str[0] === "1") {
      const ds = new DecompressionStream("deflate-raw");
      const w = ds.writable.getWriter();
      w.write(bytes); w.close();
      bytes = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    }
    return validateRecord(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) { return null; }
}

// a record from anywhere (a URL, a PDS) is data: check its shape before running it
export function validateRecord(o) {
  if (!o || o.v !== RECORD_VERSION) return null;
  const n = normalizeLevel(o.n), shape = normalizeShape(o.shape);
  if (!Number.isInteger(o.clock) || o.clock < 0 || o.clock > 50_000_000) return null;
  if (!Array.isArray(o.events) || o.events.length > 5000) return null;
  const events = [];
  let last = -1;
  for (const e of o.events) {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] < last || e[0] > o.clock) return null;
    last = e[0];
    if (e[1] === "d" && Number.isInteger(e[2]) && e[2] >= 0 && e[2] < 8 && Number.isInteger(e[3]) && e[3] >= 0) events.push([e[0], "d", e[2], e[3]]);
    else if (e[1] === "b" && Number.isInteger(e[2]) && e[2] >= 0) events.push([e[0], "b", e[2]]);
    else return null;
  }
  const path = Array.isArray(o.path) ? o.path.filter((s) => Array.isArray(s) && s.length === 7 && s.every(Number.isInteger)).slice(0, 20000) : [];
  const result = o.result && typeof o.result === "object" ? { won: !!o.result.won, t: +o.result.t || 0, deploys: o.result.deploys | 0, breaks: o.result.breaks | 0, falls: o.result.falls | 0, bites: o.result.bites | 0 } : null;
  return { v: RECORD_VERSION, n, shape, worms: !!o.worms, clock: o.clock, t: Math.max(0, +o.t || 0), parent: o.parent | 0, events, path, result, by: typeof o.by === "string" ? o.by.slice(0, 64) : undefined };
}

// where the ghost was at second `t`: the path sample interpolated
export function ghostAt(path, t) {
  if (!path.length) return null;
  const tt = t * 10;
  let lo = 0, hi = path.length - 1;
  if (tt <= path[0][0]) return unpack(path[0]);
  if (tt >= path[hi][0]) return unpack(path[hi]);
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid][0] <= tt) lo = mid; else hi = mid; }
  const a = path[lo], b = path[hi], f = b[0] === a[0] ? 0 : (tt - a[0]) / (b[0] - a[0]);
  const yawA = a[5] / 100, yawB = b[5] / 100;
  let dy = yawB - yawA; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  return { clock: Math.round(a[1] + (b[1] - a[1]) * f), x: (a[2] + (b[2] - a[2]) * f) / 100, y: (a[3] + (b[3] - a[3]) * f) / 100, z: (a[4] + (b[4] - a[4]) * f) / 100, yaw: yawA + dy * f, pitch: (a[6] + (b[6] - a[6]) * f) / 100 };
}
function unpack(s) { return { clock: s[1], x: s[2] / 100, y: s[3] / 100, z: s[4] / 100, yaw: s[5] / 100, pitch: s[6] / 100 }; }

// the public read of a published run: at://did/collection/rkey → the record
export function parseAtUri(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(String(uri || ""));
  return m && m[2] === COLLECTION ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}
export async function fetchRun(uri) {
  const at = parseAtUri(uri);
  if (!at) return null;
  const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(at.did)}&collection=${encodeURIComponent(at.collection)}&rkey=${encodeURIComponent(at.rkey)}`);
  if (!res.ok) return null;
  const j = await res.json();
  const rec = validateRecord(j.value);
  if (rec) rec.by = at.did;
  return rec;
}
