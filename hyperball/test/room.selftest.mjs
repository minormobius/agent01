// HYPERBALL's room, held: run `node hyperball/test/room.selftest.mjs`. No sockets: messages are collected.
import * as H from '../js/habitat.js';
import * as G from '../js/arena.js';
import { RoomCore, CODE, DT, bikeFrom, packInput, unpackInput, QUEUE_MAX } from '../js/room-core.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('✗ ' + msg); } };
let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const inbox = new Map();
const send = (id, m) => { if (!inbox.has(id)) inbox.set(id, []); inbox.get(id).push(JSON.parse(JSON.stringify(m))); };
const last = (id, t) => (inbox.get(id) || []).filter((m) => m.t === t).pop();

ok(CODE.test('K7QX') && !CODE.test('K7Q0') && !CODE.test('ab12') && !CODE.test('K7QXX'), 'room codes: four of A–Z and 2–9, no I O 0 1');

const room = new RoomCore('K7QX', { rnd, send });
room.join('a', { did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', handle: 'alice.test' });
room.join('b', { did: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb', handle: 'bob.test' });
{
  const lb = last('b', 'lobby');
  ok(room.host === 'a' && lb.host === 'a', 'the first to join hosts');
  const sat = lb.seats.filter((s) => s.id);
  ok(sat.length === 2 && sat[0].team !== sat[1].team, 'two people are put on opposite teams (the emptier first)');
  room.message('b', { t: 'team', team: 'cyan' });
  ok(last('a', 'lobby').seats.filter((s) => s.team === 'cyan' && s.id).length === 2, 'bob moves to cyan: both on cyan, orange all bots');
  room.message('b', { t: 'config', size: 1 });
  ok(room.size === 2, 'only the host changes the room');
  room.message('a', { t: 'config', size: 1, skill: 'hard' });
  ok(room.size === 1 && room.skill === 'hard' && room.seats.filter((s) => s.conn).length === 2, 'the host makes it 1v1: one person per side, both still seated');
  room.message('a', { t: 'config', size: 2 });
}
// start, and drive
room.message('a', { t: 'start' });
ok(room.phase === 'play' && room.countdown > 0 && room.match.bikes.filter((b) => b.human).length === 2, 'the host starts: a kickoff count, two human bikes, two bots');
ok(room.snapshot().bikes.filter((r) => !r.h).every((r) => /^[A-Z]+$/.test(r.name)), 'the bots have names');
{
  const me = room.match.bikes.find((b) => b.conn === 'a').k, x0 = me.x.slice();
  for (let i = 0; i < 120 * 3.2; i++) room.tick(DT);                       // through the countdown
  ok(H.norm(H.add(me.x, x0, -1)) < 1e-9, 'during the kickoff count nobody moves');
  for (let i = 0; i < 120 * 2; i++) { room.message('a', { t: 'in', q: [packInput(100 + i, me, { throttle: 1, steer: [0, 0] })] }); room.tick(DT); }
  ok(G.along(me.x, x0) > 10, `alice holds throttle for 2 s and rides ${G.along(me.x, x0).toFixed(1)} m`);
  const sn = last('a', 'snap');
  const mine = sn.bikes.find((r) => r.ack === 100 + 239);
  ok(sn && mine && Math.abs(G.along(bikeFrom(mine).x, me.x)) < 1, 'snapshots carry her bike and the last input the room used');
  ok((inbox.get('a') || []).filter((m) => m.t === 'snap').length >= 2 * 20 * 0.9 + 3 * 20 * 0.9, 'snapshots come at about 20 a second');
  // a jump press, sent once between steps, is used once
  const k = room.match.bikes.find((b) => b.conn === 'b').k;
  room.message('b', { t: 'in', q: [packInput(1, k, { throttle: 0, steer: [0, 0], jump: true, jumpHeld: true })] });
  room.tick(DT);
  ok(!k.ground, 'bob\'s jump, sent once, lifts him');
}
// leaving mid-match: the seat goes back to a bot, the match goes on; the host passes on
{
  room.leave('a');
  ok(room.host === 'b' && room.match.bikes.filter((b) => b.human).length === 1, 'alice leaves: bob hosts, her bike is a bot again');
  const before = room.steps;
  for (let i = 0; i < 120; i++) room.tick(DT);
  ok(room.steps > before && room.phase !== 'lobby', 'the match goes on');
}
// a goal: the room counts it once, pauses, kicks off again
{
  const m = room.match;
  m.ball.x = H.scale(G.ENEMY, G.ARENA.R - G.ARENA.ball.r); m.ball.v = [0, 0, 0, 0];
  const g0 = room.goals.cyan;
  for (let i = 0; i < 12; i++) room.tick(DT);
  ok(room.goals.cyan === g0 + 1 && room.phase === 'goal' && last('b', 'goal').side === 'cyan', 'a ball in their net is one goal for cyan, announced');
  for (let i = 0; i < 120 * 3; i++) room.tick(DT);
  ok(room.phase === 'play' && room.goals.cyan === g0 + 1, 'after the pause, a fresh kickoff; still one goal');
}
// full time
{
  room.clock = 0.05;
  for (let i = 0; i < 120 * 4; i++) room.tick(DT);
  ok(room.phase === 'over' && last('b', 'over'), 'the clock runs out: full time');
  room.message('b', { t: 'lobby' });
  ok(room.phase === 'lobby', 'the host takes everyone back to the lobby');
}
// a full room: the seventh person watches
{
  const r2 = new RoomCore('ABCD', { rnd, send });
  r2.message('x', { t: 'config', size: 3 });
  for (let i = 0; i < 7; i++) r2.join(`p${i}`, {});
  r2.message('p0', { t: 'config', size: 3 });
  for (let i = 1; i < 7; i++) { const c = r2.conns.get(`p${i}`); if (c.seat < 0) r2.sit(c); }
  ok(r2.seats.filter((s) => s.conn).length === 6 && last('p0', 'lobby').watching.length === 1, '3v3 seats six; the seventh watches');
  ok(r2.conns.get('p1').name.startsWith('guest'), 'someone not signed in is a guest');
}
// steering crosses the wire as a world vector: the room's copy of the bike may have its across-frame turned (ball lock)
{
  const k = G.makeBike(G.SPOT, [0, 1, 0, 0]), k2 = { ...k, Rt: k.N.map((v) => -v), N: k.Rt.slice() };   // turned 90° about F
  const e = packInput(1, k, { throttle: 0.5, steer: [0.6, -0.8], jump: true, boost: true });
  const u = unpackInput(e, k), u2 = unpackInput(e, k2);
  const w = (kk, st) => H.add(H.scale(kk.Rt, st[0]), kk.N, st[1]);
  ok(H.norm(H.add(w(k, u.steer), w(k2, u2.steer), -1)) < 2e-3 && u.jump && u.boost && !u.jumpHeld && u.throttle === 0.5, 'a steer means the same 4D direction whichever way the slice is turned');
  // reconciliation: replaying the inputs the room hasn't used yet lands where the room will
  const rm = new RoomCore('RECN', { rnd, send }); rm.join('p', {}); rm.message('p', { t: 'config', size: 1 }); rm.message('p', { t: 'start' });
  rm.countdown = 0;
  const srv = rm.match.bikes.find((b) => b.conn === 'p').k;
  const mine = JSON.parse(JSON.stringify(srv)), sent = [];
  for (let i = 1; i <= 90; i++) { const inp = { throttle: 1, steer: [Math.sin(i / 20), 0.5 * Math.cos(i / 13)], jump: i === 40, jumpHeld: false, boost: i > 60 }; const e = packInput(i, mine, inp); sent.push(e); G.stepBike(mine, unpackInput(e, mine), DT, 'arcade'); }
  for (let i = 0; i < 60; i += 2) { rm.message('p', { t: 'in', q: sent.slice(i, i + 2) }); rm.step(); rm.step(); }   // as a client sends them: a frame's worth at a time
  const ack = rm.conns.get('p').ack, re = JSON.parse(JSON.stringify(srv));
  for (const e of sent.filter((e) => e[0] > ack)) G.stepBike(re, unpackInput(e, re), DT, 'arcade');
  ok(ack === 60 && H.norm(H.add(re.x, mine.x, -1)) < 0.05, `the room acks 60; replaying 61–90 on its bike lands ${H.norm(H.add(re.x, mine.x, -1)).toFixed(4)} m from the prediction`);
  rm.message('p', { t: 'in', q: Array.from({ length: 40 }, (_, i) => packInput(200 + i, srv, { throttle: 1, steer: [0, 0] })) });
  ok(rm.conns.get('p').queue.length === QUEUE_MAX, `a burst is trimmed to the last ${QUEUE_MAX}`);
  for (let i = 0; i < 60; i++) rm.step();
  ok(rm.conns.get('p').input.throttle === 0, 'when the inputs stop (a hidden tab), the bike is let go, not left on the throttle');
}
console.log(`${fails ? '✗' : '✓'} hyperball room: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
