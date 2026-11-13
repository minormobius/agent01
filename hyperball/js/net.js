// HYPERBALL online, the client's half (no DOM): the room's socket, and the two tricks that hide the network.
//  - your own bike is PREDICTED: stepped here at 120 Hz from your input, each step's input sent with a sequence number;
//    when a snapshot says the room has used inputs up to n, your bike becomes the room's and the inputs after n are
//    replayed on it (reconcile). Your slice (ball lock's turn of the across-frame) stays yours: steering goes as a
//    world vector, so it means the same thing on the room's copy.
//  - everyone else is INTERPOLATED ~100 ms behind (between the two snapshots around that moment), and the ball is
//    run forward from the latest snapshot to now (it's only physics, until somebody hits it).
import * as H from './habitat.js';
import * as G from './arena.js';
import { DT, bikeFrom, unpackInput } from './room-core.js';

export const DELAY = 0.1;

export class Net {
  constructor(code, { token = null, team = null, onMessage = () => {}, onClose = () => {}, WS = globalThis.WebSocket, origin = globalThis.location?.origin } = {}) {
    Object.assign(this, { code, onMessage, onClose });
    this.snaps = []; this.pending = []; this.seq = 0; this.out = []; this.rtt = 0.1; this.you = null; this.open = false;
    const url = `${origin.replace(/^http/, 'ws')}/api/rooms/${code}/ws`;
    this.ws = new WS(url);
    this.ws.onopen = () => { this.open = true; this.ws.send(JSON.stringify({ t: 'hi', token, team })); this.pingT = setInterval(() => this.send({ t: 'ping', c: now() }), 2000); };
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') { this.rtt = 0.8 * this.rtt + 0.2 * Math.max(0, now() - m.c) / 1000; return; }
      if (m.t === 'welcome') this.you = m.you;
      if (m.t === 'snap') { m.at = now() / 1000; this.snaps.push(m); if (this.snaps.length > 30) this.snaps.shift(); }
      this.onMessage(m);
    };
    this.ws.onclose = () => { this.open = false; clearInterval(this.pingT); this.onClose(); };
  }
  send(m) { if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  /** Queue one step's packed input (sent with the frame's others by flush). */
  push(e) { this.pending.push(e); this.out.push(e); if (this.pending.length > 240) this.pending.shift(); }
  flush() { if (this.out.length) { this.send({ t: 'in', q: this.out }); this.out = []; } }
  close() { clearInterval(this.pingT); try { this.ws.close(); } catch { /* fine */ } }
  get latest() { return this.snaps[this.snaps.length - 1] || null; }
}
const now = () => (globalThis.performance ? performance.now() : Date.now());

/** Your bike from the room's record, the inputs after its ack replayed; your slice's turn kept. Drops acked inputs. */
export function reconcile(rec, pending, keep, mode) {
  const k = bikeFrom(rec);
  if (keep) {                                     // keep the across-frame's turn about the heading (ball lock is yours)
    const fr = H.orthonormalTo(G.up(k.x), [k.F, keep.Rt, keep.N]);
    if (fr.every((v) => v.every(Number.isFinite))) [k.F, k.Rt, k.N] = fr;
  }
  while (pending.length && pending[0][0] <= rec.ack) pending.shift();
  for (const e of pending) G.stepBike(k, unpackInput(e, k), DT, mode);
  return k;
}

/** A bike between two records, t in [0, 1]. */
export function lerpBike(a, b, t) {
  const L = (p, q) => p.map((v, i) => v + (q[i] - v) * t);
  const k = bikeFrom(a);
  if (!b) return k;
  k.x = L(a.x, b.x); k.F = H.unit(L(a.F, b.F)); k.v = L(a.v, b.v); k.lean = L(a.lean, b.lean);
  k.Rt = H.unit(L(a.Rt, b.Rt)); k.N = H.unit(L(a.N, b.N));
  k.speed = a.speed + (b.speed - a.speed) * t; k.boosting = !!(t < 0.5 ? a.bs : b.bs); k.ground = !!(t < 0.5 ? a.g : b.g);
  return k;
}
/** The two snapshots around time `at` (seconds, the receive clock) and how far between them. */
export function around(snaps, at) {
  if (!snaps.length) return null;
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1], b = snaps[i];
    if (a.at <= at && at <= b.at) return { a, b, t: b.at > a.at ? (at - a.at) / (b.at - a.at) : 1 };
  }
  return at < snaps[0].at ? { a: snaps[0], b: null, t: 0 } : { a: snaps[snaps.length - 1], b: null, t: 0 };
}
/** The ball, run on from the latest snapshot by `ahead` seconds (capped at a quarter second). */
export function ballAhead(rec, ahead, mode) {
  const b = { x: rec.x.slice(), v: rec.v.slice() };
  const n = Math.round(Math.min(0.25, Math.max(0, ahead)) / DT);
  for (let i = 0; i < n; i++) G.stepBall(b, DT, mode);
  return b;
}
