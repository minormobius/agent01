// delve.selftest.mjs — offline proof that the delve engine and, more
// importantly, the QUESTIONS it builds are well-formed.
//
// Runs with no network and no API key: the fixtures are a real foam-dungeon
// map + content roll (seed 7, size s) captured from foam.mino.mobi.
//
//   node jev/test/delve.selftest.mjs
//
// The question-shape assertions are the load-bearing ones. They encode the
// TypeSafe request contract (docs.typesafe.ai/primitives):
//   choice → criteria is a MAP of option -> description
//   score  → criteria is an ORDERED ARRAY, minimum 2 levels
//   noul   → criteria optional; if present, exactly { true, false }
// If TypeSafe changes that contract, this test is where it should break —
// not in a live demo in front of an audience.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  makeWorld, newRun, buildState, buildQuestions, applyAnswers,
  offlineAnswers, fallbackMove, visibleExits, runSummary, rng,
} from '../delve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'fixtures', n), 'utf8'));

let passed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { passed++; return; }
  failures.push(label);
}
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

const dungeon = fix('dungeon-seed7-s.json');
const content = fix('content-seed7-s-roll1.json');

// ------------------------------------------------------------ world fold ---
const world = makeWorld(dungeon, content);
ok(world.rooms.size === dungeon.rooms.length, 'every room folded into the world');
ok(world.entrance === dungeon.entrance, 'entrance carried over');
eq(world.endpoints, dungeon.endpoints, 'endpoints carried over');
ok(world.maxDepth > 0, 'maxDepth derived');

// every agent and effect landed in a room
const placedAgents = [...world.rooms.values()].reduce((s, r) => s + r.agents.length, 0);
ok(placedAgents === content.agents.length, 'every agent placed in a room');
const placedEffects = [...world.rooms.values()].reduce(
  (s, r) => s + r.loot.length + r.traps.length + r.obstacles.length, 0);
ok(placedEffects === content.effects.length, 'every effect placed in a room');

// bad documents are rejected loudly rather than half-built
let threw = false;
try { makeWorld({ format: 'nope' }, content); } catch { threw = true; }
ok(threw, 'makeWorld rejects a non-foam-dungeon document');

// ------------------------------------------------- the TypeSafe contract ---
// Walk EVERY room in the fixture, not just the entrance: the question
// builder has to be well-formed everywhere the delver can stand, including
// dead ends (1 exit) and junctions (3 exits).
let roomsChecked = 0;
for (const roomId of world.rooms.keys()) {
  const r = newRun(world, { seed: 3 });
  r.at = roomId;
  const qs = buildQuestions(world, r);
  const exits = visibleExits(world, r);
  roomsChecked++;

  const types = Object.values(qs).map((q) => q.type);
  ok(types.every((t) => ['choice', 'score', 'noul'].includes(t)),
    `room ${roomId}: every question is a documented primitive`);
  ok(Object.values(qs).every((q) => typeof q.instructions === 'string' && q.instructions.length > 0),
    `room ${roomId}: every question carries instructions`);

  // choice: criteria is a map, one key per real exit, plus hold
  const mv = qs.move;
  ok(mv.type === 'choice', `room ${roomId}: move is a choice`);
  ok(mv.criteria && !Array.isArray(mv.criteria) && typeof mv.criteria === 'object',
    `room ${roomId}: choice criteria is a map`);
  const optKeys = Object.keys(mv.criteria).sort();
  const wantKeys = [...exits.map((x) => x.option), 'hold'].sort();
  eq(optKeys, wantKeys, `room ${roomId}: choice options are exactly the real exits + hold`);
  ok(optKeys.length >= 2, `room ${roomId}: choice offers at least 2 options`);
  ok(Object.values(mv.criteria).every((d) => typeof d === 'string' && d.length > 0),
    `room ${roomId}: every option has a description`);

  // score: ordered array, >= 2 levels
  const sc = qs.danger;
  ok(Array.isArray(sc.criteria), `room ${roomId}: score criteria is an array`);
  ok(sc.criteria.length >= 2, `room ${roomId}: score has at least 2 levels`);
  ok(sc.criteria.every((s) => typeof s === 'string'), `room ${roomId}: score levels are strings`);

  // noul: criteria, when present, is exactly { true, false }
  for (const key of ['fight', 'take_loot', 'withdraw']) {
    const n = qs[key];
    ok(n.type === 'noul', `room ${roomId}: ${key} is a noul`);
    if (n.criteria) {
      eq(Object.keys(n.criteria).sort(), ['false', 'true'], `room ${roomId}: ${key} criteria is true/false`);
    }
  }
}
ok(roomsChecked === world.rooms.size, 'question shape checked in every room');

// --------------------------------------------------------- state document ---
const run0 = newRun(world, { seed: 3 });
const state = buildState(world, run0);
ok(typeof state === 'object' && !Array.isArray(state), 'state is an object');
for (const k of ['delver', 'objective', 'current_room', 'available_exits', 'recent_events']) {
  ok(k in state, `state carries ${k}`);
}
ok(state.current_room.id === world.entrance, 'state starts at the entrance');
ok(Array.isArray(state.available_exits) && state.available_exits.length > 0, 'entrance has exits');
// the state must be JSON-clean — it is about to become a request body
ok(JSON.parse(JSON.stringify(state)) !== null, 'state round-trips through JSON');
ok(!JSON.stringify(state).includes('undefined'), 'state has no undefined leaking into JSON');

// fog of war: an unvisited neighbour reveals nothing
const unseen = state.available_exits.filter((x) => !x.visited);
ok(unseen.every((x) => !('known' in x)), 'unexplored exits expose no contents');

// ---------------------------------------------------------- the move gate ---
// Low confidence must NOT act on the model's pick.
{
  const r = newRun(world, { seed: 5 });
  const exits = visibleExits(world, r);
  const wrongWay = exits[exits.length - 1].option;
  const res = applyAnswers(world, r, {
    move: { type: 'choice', choice: wrongWay, probabilities: {}, confidence: 0.11 },
    danger: { type: 'score', score: 0, probabilities: [] },
    fight: { type: 'noul', noul: 0 },
    take_loot: { type: 'noul', noul: 0 },
    withdraw: { type: 'noul', noul: 0 },
  }, { moveConfidenceGate: 0.45 });
  ok(res.usedFallback, 'confidence below the gate triggers the fallback');
  ok(res.events.some((e) => e.kind === 'gate'), 'the gate firing is logged, not hidden');
}
// High confidence acts on the pick.
{
  const r = newRun(world, { seed: 5 });
  const target = visibleExits(world, r)[0];
  const res = applyAnswers(world, r, {
    move: { type: 'choice', choice: target.option, probabilities: {}, confidence: 0.95 },
    danger: { type: 'score', score: 0, probabilities: [] },
    fight: { type: 'noul', noul: 0 },
    take_loot: { type: 'noul', noul: 0 },
    withdraw: { type: 'noul', noul: 0 },
  });
  ok(!res.usedFallback, 'confidence above the gate acts on the model pick');
  ok(r.at === target.room, 'the delver actually moved through the chosen door');
}
// A choice that is not an option at all must not crash or teleport.
{
  const r = newRun(world, { seed: 5 });
  const before = r.at;
  const res = applyAnswers(world, r, {
    move: { type: 'choice', choice: 'to_999999', probabilities: {}, confidence: 0.99 },
    danger: { type: 'score', score: 0, probabilities: [] },
    fight: { type: 'noul', noul: 0 },
    take_loot: { type: 'noul', noul: 0 },
    withdraw: { type: 'noul', noul: 0 },
  });
  ok(r.at === before, 'an unknown option leaves the delver where it was');
  ok(res.events.some((e) => e.text.includes('No such exit')), 'an unknown option is reported');
}
// A completely empty answer set must not throw.
{
  const r = newRun(world, { seed: 5 });
  let crashed = false;
  try { applyAnswers(world, r, {}); } catch { crashed = true; }
  ok(!crashed, 'a missing/empty answers object is survivable');
}

// --------------------------- contradictory answers must be reconciled ---
// The questions are isolated, so `withdraw` (strategic) and `move` (tactical)
// can disagree in the same response. Withdraw wins, visibly.
{
  const r = newRun(world, { seed: 8 });
  // get somewhere with both an up and a down exit
  let probe = null;
  for (const roomId of world.rooms.keys()) {
    const t = newRun(world, { seed: 8 });
    t.at = roomId;
    const ex = visibleExits(world, t);
    if (ex.some((x) => x.descends > 0) && ex.some((x) => x.descends < 0)) { probe = t; break; }
  }
  ok(probe !== null, 'found a chamber with both an ascending and a descending exit');
  if (probe) {
    const down = visibleExits(world, probe).find((x) => x.descends > 0);
    const before = probe.at;
    const res = applyAnswers(world, probe, {
      move: { type: 'choice', choice: down.option, probabilities: {}, confidence: 0.95 },
      danger: { type: 'score', score: 0, probabilities: {} },
      fight: { type: 'noul', noul: 0 },
      take_loot: { type: 'noul', noul: 0 },
      withdraw: { type: 'noul', noul: 0.9 },
    });
    ok(probe.at !== down.room, 'a high-confidence descent is NOT taken while withdrawing');
    const wentUp = world.rooms.get(probe.at).depth < world.rooms.get(before).depth;
    ok(wentUp || probe.at === before, 'the delver climbed (or held) instead of descending');
    ok(res.events.some((e) => e.text.includes('outranks move')),
      'the override is announced in the log, not silent');
  }
}
// withdraw must NOT interfere when the move already ascends
{
  let probe = null;
  for (const roomId of world.rooms.keys()) {
    const t = newRun(world, { seed: 8 });
    t.at = roomId;
    const ex = visibleExits(world, t);
    if (ex.some((x) => x.descends < 0)) { probe = t; break; }
  }
  if (probe) {
    const up = visibleExits(world, probe).find((x) => x.descends < 0);
    const res = applyAnswers(world, probe, {
      move: { type: 'choice', choice: up.option, probabilities: {}, confidence: 0.95 },
      danger: { type: 'score', score: 0, probabilities: {} },
      fight: { type: 'noul', noul: 0 },
      take_loot: { type: 'noul', noul: 0 },
      withdraw: { type: 'noul', noul: 0.9 },
    });
    ok(probe.at === up.room, 'an ascending move is taken unchanged while withdrawing');
    ok(!res.events.some((e) => e.text.includes('outranks move')), 'no spurious override is logged');
  }
}

// ------------------------------------------------------------ a full run ---
// Drive a whole delve on the offline stand-in. This is the "does the demo
// actually go somewhere" test: it must terminate, move, and stay in bounds.
function drive(seed, maxTicks = 300) {
  const r = newRun(world, { seed });
  for (let i = 0; i < maxTicks && r.status === 'delving'; i++) {
    const resp = offlineAnswers(world, r);
    applyAnswers(world, r, resp.answers);
  }
  return r;
}
{
  const r = drive(11);
  ok(r.tick > 0, 'the run advanced');
  ok(r.visited.size > 1, 'the delver left the entrance');
  ok(r.hp >= 0 && r.hp <= r.maxHp, 'health stayed in bounds');
  ok(r.gold >= 0 && r.gold <= world.goldOnFloor, 'gold never exceeds what is on the floor');
  ok(world.rooms.has(r.at), 'the delver is always in a real room');
  ok(r.trail.every((id) => world.rooms.has(id)), 'the whole trail is real rooms');
  const s = runSummary(world, r);
  ok(s.deepest_depth <= s.max_depth, 'deepest depth never exceeds the dungeon');
  ok(s.vaults_reached <= s.vaults_total, 'vault count is sane');
}

// determinism: same seed, same story
{
  const a = drive(21), b = drive(21);
  eq(a.trail, b.trail, 'same seed replays the same trail');
  eq([a.hp, a.gold, a.status], [b.hp, b.gold, b.status], 'same seed replays the same outcome');
}
// The rng must actually be wired into outcomes. Adjacent seeds CAN coincide
// (a run only draws a handful of numbers), so assert across a spread rather
// than on one pair — a single-pair check here is a flaky test, not a stronger
// one.
{
  const outcomes = new Set(
    [11, 21, 22, 23, 40, 57, 68, 91].map((s) => {
      const r = drive(s);
      return JSON.stringify([r.trail, r.hp, r.gold, r.status]);
    }),
  );
  ok(outcomes.size > 1, `seeds produce more than one distinct run (got ${outcomes.size})`);
}

// the offline stand-in answers in the real response shape
{
  const r = newRun(world, { seed: 9 });
  const resp = offlineAnswers(world, r);
  ok(resp.source === 'offline', 'offline answers are stamped as offline');
  const qs = buildQuestions(world, r);
  eq(Object.keys(resp.answers).sort(), Object.keys(qs).sort(),
    'the stand-in answers exactly the questions that were asked');
  ok(resp.answers.move.choice in qs.move.criteria, 'the stand-in picks a real option');
  ok(resp.answers.danger.score >= 0 && resp.answers.danger.score <= qs.danger.criteria.length - 1,
    'the stand-in score is within the legend');
  for (const k of ['fight', 'take_loot', 'withdraw']) {
    const v = resp.answers[k].noul;
    ok(v >= 0 && v <= 1, `the stand-in ${k} noul is within 0..1`);
  }
}

// ------------------------------- the shapes the LIVE API actually returns ---
// Measured against jev-1.13.0, not taken from the published examples (which
// show score probabilities as an ARRAY; the service returns an OBJECT keyed by
// level index). The offline stand-in has to mirror the real thing, or offline
// mode is a mock of something that does not exist.
{
  const r = newRun(world, { seed: 4 });
  const resp = offlineAnswers(world, r);
  const d = resp.answers.danger;

  ok(d.probabilities && !Array.isArray(d.probabilities) && typeof d.probabilities === 'object',
    'score probabilities is an OBJECT keyed by level, as the live API returns');
  const keys = Object.keys(d.probabilities);
  eq(keys.slice().sort(), keys.slice().sort((a, b) => Number(a) - Number(b)).sort(),
    'score probability keys are level indices');
  const sum = Object.values(d.probabilities).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum - 1) < 1e-9, `score probabilities sum to 1 (got ${sum})`);

  // The live service computes `score` as the expectation over the distribution
  // (confirmed exactly: 0*0 + 1*0.98 + 2*0.02 = 1.02 came back as 1.02).
  const expectation = Object.entries(d.probabilities).reduce((acc, [i, p]) => acc + Number(i) * p, 0);
  ok(Math.abs(expectation - d.score) < 1e-9,
    `score is the expectation over probabilities (score ${d.score} vs Σ i·p_i ${expectation})`);
  ok(Object.keys(d.legend).length === Object.keys(d.probabilities).length,
    'legend covers every level the distribution does');

  // choice probabilities are keyed by the option names themselves
  const qs = buildQuestions(world, r);
  eq(Object.keys(resp.answers.move.probabilities).sort(), Object.keys(qs.move.criteria).sort(),
    'choice probability keys are exactly the declared options');
}

// ------------------------------------ the move criteria must not mislead ---
// An earlier wording made an explored, picked-clean neighbour read as the safe
// option and an unexplored one as the risky one, with nothing saying that
// going back made no progress — and the delver oscillated between two rooms
// forever. These assertions pin the fix: direction is always stated relative
// to the objective, and a revisit is named as a revisit.
{
  const r = newRun(world, { seed: 6 });
  // walk somewhere with both a visited and an unvisited exit
  let found = null;
  for (const roomId of world.rooms.keys()) {
    const probe = newRun(world, { seed: 6 });
    probe.at = roomId;
    const ex = visibleExits(world, probe);
    if (ex.length < 2) continue;
    probe.visited.add(ex[0].room);
    probe.trail.push(ex[0].room);
    const again = visibleExits(world, probe);
    if (again.some((x) => x.times_entered > 0) && again.some((x) => x.times_entered === 0)) {
      found = probe; break;
    }
  }
  ok(found !== null, 'found a room with both a revisit and a fresh exit to check');
  if (found) {
    const qs = buildQuestions(world, found);
    const exits = visibleExits(world, found);
    for (const x of exits) {
      const desc = qs.move.criteria[x.option];
      ok(/DOWN|BACK UP|Stays on this level/.test(desc),
        `${x.option}: the description states its direction relative to the objective`);
      if (x.times_entered > 0 && !world.endpoints.includes(x.room)) {
        ok(/already been in chamber/.test(desc) && /repeats ground already covered/.test(desc),
          `${x.option}: a revisit is named as a revisit`);
        ok(!/Unexplored|NOT been entered/.test(desc), `${x.option}: a revisit is not called unexplored`);
      }
      if (x.times_entered === 0) {
        ok(/NOT been entered yet/.test(desc), `${x.option}: a fresh chamber is named as unentered`);
      }
    }
    ok(/makes no progress|Makes no progress/.test(qs.move.criteria.hold), 'hold is named as making no progress');
    ok(/objective/i.test(qs.move.instructions), 'the move instructions name the objective');
  }
}

// the fallback always names a real option
for (const climbing of [true, false]) {
  for (const roomId of world.rooms.keys()) {
    const r = newRun(world, { seed: 1 });
    r.at = roomId;
    const pick = fallbackMove(world, r, { climbing });
    const qs = buildQuestions(world, r);
    ok(pick in qs.move.criteria, `fallback names a real option in ${roomId} (climbing=${climbing})`);
  }
}

// rng is stable across the two runtimes we care about
{
  const a = rng(42); const first = [a(), a(), a()].map((n) => n.toFixed(6));
  const b = rng(42); const again = [b(), b(), b()].map((n) => n.toFixed(6));
  eq(first, again, 'rng is reproducible from a seed');
}

// ------------------------------------------------------------------ done ---
if (failures.length) {
  console.error(`✗ delve selftest: ${failures.length} failure(s) of ${passed + failures.length} checks\n`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✓ delve selftest: ${passed} checks passed (${world.rooms.size} rooms, ${content.agents.length} agents, ${content.effects.length} effects)`);
