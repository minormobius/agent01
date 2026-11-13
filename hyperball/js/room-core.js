// HYPERBALL's room, no DOM and no Workers APIs: the whole online match as plain state, so node can test it and the
// Durable Object (room.js) only carries sockets. The room runs the real game (arena.js stepMatch) with each human's
// latest input, bots in the empty seats, and is the authority: clients send inputs, the room sends snapshots.
//
// Phases: lobby (seats fill, the host picks the size and the bots' skill, then starts) → play (a 3 s kickoff count,
// then the match) → goal (2.6 s, then a kickoff) → over (after 3 minutes; the host can go again). A human who leaves
// gives their seat back to a bot, mid-match included; if the host leaves, the next human hosts.
import * as G from './arena.js';

export const CODE = /^[A-HJ-NP-Z2-9]{4}$/;           // room codes: no I, O, 0, 1
export const DT = 1 / 120, SNAP_EVERY = 6;            // physics at 120 Hz, a snapshot every 6 steps (20 Hz)
export const MATCH_SECONDS = 180;
export const BOT_NAMES = ['NEON', 'VAPOR', 'ECHO', 'PRISM', 'SOLAR', 'DRIFT', 'HALO', 'PIXEL', 'NOVA', 'FLUX'];
export const QUEUE_MAX = 10;                          // inputs waiting more than ~80 ms are dropped (the client reconciles)
const NEUTRAL = { throttle: 0, steer: [0, 0], jump: false, jumpHeld: false, boost: false };
const r3 = (v) => Math.round(v * 1000) / 1000;
const v4 = (v) => v.map(r3);

export class RoomCore {
  constructor(code, { rnd = Math.random, send = () => {}, now = () => Date.now() } = {}) {
    Object.assign(this, { code, rnd, send, now });
    this.conns = new Map();              // id → { id, did, handle, guest, seat, input, latch, ack }
    this.size = 2; this.skill = 'normal'; this.mode = 'arcade';
    this.seats = this.makeSeats(2);      // [{ team, slot, conn }]
    this.host = null; this.phase = 'lobby';
    this.match = null; this.goals = { cyan: 0, orange: 0 }; this.clock = MATCH_SECONDS; this.countdown = 0; this.pause = 0;
    this.steps = 0; this.acc = 0; this.lastGoal = null; this.botSeed = Math.floor(rnd() * BOT_NAMES.length);
  }
  makeSeats(n) { const s = []; for (const team of ['cyan', 'orange']) for (let i = 0; i < n; i++) s.push({ team, slot: i, conn: null }); return s; }

  // ------------------------------------------------------------ people --
  join(id, who = {}) {
    const c = { id, did: who.did || null, handle: who.handle || null, guest: !who.did, seat: -1, input: { ...NEUTRAL }, sv: [0, 0, 0, 0], queue: [], lastSeq: 0, ack: 0, dry: 0, name: who.handle ? `@${who.handle}` : `guest ${id.slice(-3)}` };
    this.conns.set(id, c);
    if (!this.host) this.host = id;
    this.sit(c, who.team);
    this.send(id, { ...this.lobby(), t: 'welcome', you: id, code: this.code });
    this.broadcastLobby();
    if (this.match) this.syncHumans();
    return c;
  }
  /** Sit c in a free seat, on team if given and possible; -1 if the room is full (they watch). */
  sit(c, team) {
    if (c.seat >= 0) this.seats[c.seat].conn = null;
    const free = (t) => this.seats.findIndex((s) => !s.conn && (!t || s.team === t));
    let i = team ? free(team) : -1;
    if (i < 0) {
      const counts = { cyan: 0, orange: 0 };
      for (const s of this.seats) if (s.conn) counts[s.team]++;
      i = free(counts.cyan <= counts.orange ? 'cyan' : 'orange');
      if (i < 0) i = free(null);
    }
    c.seat = i;
    if (i >= 0) this.seats[i].conn = c.id;
  }
  leave(id) {
    const c = this.conns.get(id);
    if (!c) return;
    if (c.seat >= 0) this.seats[c.seat].conn = null;
    this.conns.delete(id);
    if (this.host === id) this.host = [...this.conns.keys()][0] || null;
    if (this.match) this.syncHumans();
    this.broadcastLobby();
  }
  get empty() { return this.conns.size === 0; }

  // ------------------------------------------------------------ messages --
  message(id, m) {
    const c = this.conns.get(id);
    if (!c || !m || typeof m !== 'object') return;
    if (m.t === 'in') {                                      // inputs, one per client physics step: [seq, throttle, sx, sy, sz, sw, flags]
      if (!(this.phase === 'play' && this.countdown <= 0) || !Array.isArray(m.q)) return;   // the kickoff count: nobody moves
      for (const e of m.q.slice(0, 64)) if (Array.isArray(e) && Number.isFinite(e[0]) && e[0] > c.lastSeq) { c.queue.push(e); c.lastSeq = e[0]; }
      if (c.queue.length > QUEUE_MAX) c.queue.splice(0, c.queue.length - QUEUE_MAX);    // fell behind: drop the oldest
    }
    else if (m.t === 'team' && (this.phase === 'lobby' || this.phase === 'over')) { this.sit(c, m.team === 'orange' ? 'orange' : 'cyan'); this.broadcastLobby(); }
    else if (m.t === 'config' && id === this.host && (this.phase === 'lobby' || this.phase === 'over')) {
      if ([1, 2, 3].includes(+m.size) && +m.size !== this.size) this.resize(+m.size);
      if (['easy', 'normal', 'hard'].includes(m.skill)) this.skill = m.skill;
      if (['arcade', 'spin'].includes(m.mode)) this.mode = m.mode;
      this.broadcastLobby();
    } else if (m.t === 'start' && id === this.host && (this.phase === 'lobby' || this.phase === 'over')) this.startMatch();
    else if (m.t === 'lobby' && id === this.host && this.phase === 'over') { this.phase = 'lobby'; this.match = null; this.broadcastLobby(); }
  }
  resize(n) {
    const people = this.seats.filter((s) => s.conn).map((s) => ({ id: s.conn, team: s.team }));
    this.size = n; this.seats = this.makeSeats(n);
    for (const c of this.conns.values()) c.seat = -1;
    for (const p of people) this.sit(this.conns.get(p.id), p.team);
    for (const c of this.conns.values()) if (c.seat < 0) this.sit(c);
  }
  lobby() {
    return {
      t: 'lobby', phase: this.phase, host: this.host, size: this.size, skill: this.skill, mode: this.mode, goals: this.goals,
      seats: this.seats.map((s) => { const c = s.conn && this.conns.get(s.conn); return { team: s.team, slot: s.slot, id: c?.id || null, did: c?.did || null, handle: c?.handle || null, name: c?.name || null }; }),
      watching: [...this.conns.values()].filter((c) => c.seat < 0).map((c) => c.name),
    };
  }
  broadcastLobby() { const m = this.lobby(); for (const id of this.conns.keys()) this.send(id, m); }
  broadcast(m) { for (const id of this.conns.keys()) this.send(id, m); }

  // ------------------------------------------------------------ the match --
  startMatch() {
    this.goals = { cyan: 0, orange: 0 }; this.clock = MATCH_SECONDS; this.lastGoal = null;
    this.kickoff();
    this.broadcastLobby();
  }
  kickoff() {
    this.match = G.newMatch(this.size, G.ARENA, this.rnd, false);
    this.match.bikes.forEach((b, i) => { b.name = BOT_NAMES[(i + this.botSeed) % BOT_NAMES.length]; });
    this.syncHumans();
    this.phase = 'play'; this.countdown = 3; this.pause = 0;
    for (const c of this.conns.values()) { c.input = { ...NEUTRAL }; c.sv = [0, 0, 0, 0]; c.queue.length = 0; }
  }
  /** Seat i is bike i of the match (cyan's first, then orange's): humans where someone sits, bots elsewhere. */
  syncHumans() {
    if (!this.match) return;
    this.match.bikes.forEach((b, i) => {
      const s = this.seats[i], c = s && s.conn && this.conns.get(s.conn);
      b.human = !!c; b.conn = c ? c.id : null; b.did = c?.did || null; b.handle = c?.handle || null;
    });
  }
  /** One input a step from the seat's queue (acked by its seq); when the queue runs dry, the last one again, minus any jump.
   *  Steering arrives as a 4D vector across the bike, so the room needn't know how the player has turned their slice. */
  inputFor(k) {
    const b = this.match.bikes.find((x) => x.k === k), c = b && b.conn && this.conns.get(b.conn);
    if (!c) return { ...NEUTRAL };
    const e = c.queue.shift();
    if (e) {
      const f = e[6] | 0, cl = (v) => Math.max(-1.5, Math.min(1.5, +v || 0));
      c.sv = [cl(e[2]), cl(e[3]), cl(e[4]), cl(e[5])];
      c.input = { throttle: Math.max(-1, Math.min(1, +e[1] || 0)), steer: [0, 0], jump: !!(f & 1), jumpHeld: !!(f & 2), boost: !!(f & 4) };
      c.ack = e[0]; c.dry = 0;
    } else if (++c.dry > 30) c.input = { ...NEUTRAL };              // nothing for a quarter second (a hidden tab): let go
    else c.input = { ...c.input, jump: false };
    return { ...c.input, steer: steerIn(k, c.sv) };
  }
  /** Advance by dt seconds of wall time: fixed 120 Hz steps, snapshots at 20 Hz. */
  tick(dt) {
    if (!this.match || this.phase === 'lobby' || this.phase === 'over') return;
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.step();
      if (++this.steps % SNAP_EVERY === 0) this.broadcast(this.snapshot());
      if (this.phase === 'over') break;
    }
  }
  step() {
    if (this.phase === 'goal') {
      G.stepBall(this.match.ball, DT, this.mode);
      this.pause -= DT;
      if (this.pause <= 0) { if (this.clock <= 0) this.finish(); else this.kickoff(); }
      return;
    }
    if (this.countdown > 0) { this.countdown -= DT; return; }
    this.clock -= DT;
    const r = G.stepMatch(this.match, DT, this.mode, this.skill, this.rnd, (k) => this.inputFor(k));
    if (r === 'cyan' || r === 'orange') {
      this.goals[r]++;
      const by = this.match.last;
      this.lastGoal = { side: r, by: by ? (by.handle ? `@${by.handle}` : by.name) : null, own: !!(by && by.team !== r) };
      this.phase = 'goal'; this.pause = 2.6;
      this.broadcast({ t: 'goal', ...this.lastGoal, goals: this.goals });
    } else if (r === 'touch' && this.match.last) this.match.lastTouch = this.match.last.conn || null;
    if (this.clock <= 0 && this.phase === 'play') this.finish();
  }
  finish() { this.phase = 'over'; this.broadcast({ t: 'over', goals: this.goals }); this.broadcastLobby(); }

  /** What everyone sees: the ball, every bike's state (rounded), the score, the clock, and each seat's last input. */
  snapshot() {
    const m = this.match;
    return {
      t: 'snap', n: this.steps, phase: this.phase, clock: r3(this.clock), countdown: r3(this.countdown), goals: this.goals,
      ball: { x: v4(m.ball.x), v: v4(m.ball.v) },
      bikes: m.bikes.map((b) => {
        const k = b.k, c = b.conn && this.conns.get(b.conn);
        return { id: b.conn || null, x: v4(k.x), F: v4(k.F), Rt: v4(k.Rt), N: v4(k.N), v: v4(k.v), lean: v4(k.lean), speed: r3(k.speed), g: k.ground ? 1 : 0, bo: r3(k.boost), bs: k.boosting ? 1 : 0, ack: c ? c.ack : 0, h: b.human ? 1 : 0, name: b.human ? (b.handle ? `@${b.handle}` : c?.name) : b.name, did: b.did || null, team: b.team };
      }),
    };
  }
}

/** A steering vector across the bike (world 4D) as [right, ana] on the bike's own across-frame, length at most 1. */
export function steerIn(k, sv) {
  const a = sv[0] * k.Rt[0] + sv[1] * k.Rt[1] + sv[2] * k.Rt[2] + sv[3] * k.Rt[3], b = sv[0] * k.N[0] + sv[1] * k.N[1] + sv[2] * k.N[2] + sv[3] * k.N[3];
  const m = Math.hypot(a, b);
  return m > 1 ? [a / m, b / m] : [a, b];
}
/** Pack an input for the wire: [seq, throttle, steer as a world vector (4), flags: 1 jump, 2 jump held, 4 boost]. */
export function packInput(seq, k, input) {
  const r3 = (v) => Math.round(v * 1000) / 1000, s = input.steer;
  return [seq, r3(input.throttle), ...[0, 1, 2, 3].map((i) => r3(s[0] * k.Rt[i] + s[1] * k.N[i])), (input.jump ? 1 : 0) | (input.jumpHeld ? 2 : 0) | (input.boost ? 4 : 0)];
}
/** Unpack it against a (possibly differently turned) copy of the bike. */
export function unpackInput(e, k) {
  const f = e[6] | 0;
  return { throttle: e[1], steer: steerIn(k, [e[2], e[3], e[4], e[5]]), jump: !!(f & 1), jumpHeld: !!(f & 2), boost: !!(f & 4) };
}

/** Put a bike back together from a snapshot's record (the client uses it for its own bike and the others). */
export function bikeFrom(rec) {
  return { x: rec.x.slice(), F: rec.F.slice(), Rt: rec.Rt.slice(), N: rec.N.slice(), v: rec.v.slice(), lean: rec.lean.slice(), speed: rec.speed, ground: !!rec.g, boost: rec.bo, boosting: !!rec.bs };
}
