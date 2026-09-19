// memory.selftest.mjs — what the delver remembers, and what it must NOT know.
//
//   node mega/jev/test/memory.selftest.mjs
//
// The fog-of-war assertions are the load-bearing ones. Memory is allowed to
// say "the nearest chamber you have never entered is four steps back the way
// you came" — that is recall. It is NOT allowed to route through chambers the
// delver has never stood in, because that would be a map of the dungeon
// handed over for free, and the demo would be showing an oracle rather than a
// model making decisions under uncertainty.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  frontier, routeToFrontier, routeToEntrance, atDeadEnd, memoryFor,
  recordJournal, knownExits, JOURNAL_WINDOW,
} from '../delve/memory.mjs';
import {
  makeWorld, newRun, buildState, buildQuestions, applyAnswers, offlineAnswers,
} from '../delve/delve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'delve', 'fixtures', n), 'utf8'));
const mk = () => makeWorld(fix('dungeon-seed7-s.json'), fix('content-seed7-s-roll1.json'));
const world = mk();

let passed = 0;
const failures = [];
const ok = (c, l) => { c ? passed++ : failures.push(l); };

// --------------------------------------------------------- a fresh delver ---
{
  const r = newRun(world, { seed: 7 });
  const f = frontier(world, r);
  const entranceExits = world.rooms.get(world.entrance).exits.length;
  ok(f.length === entranceExits, 'at the entrance, the frontier is exactly its own doors');
  ok(f.every((x) => !r.visited.has(x.chamber)), 'nothing already entered is on the frontier');

  const route = routeToFrontier(world, r);
  ok(route !== null, 'there is somewhere new to go at the start');
  ok(route.steps === 1, 'the nearest unentered chamber is one step away');
  ok(route.first_step === `to_${route.target}`, 'the first step names the target directly at one step');
  ok(!atDeadEnd(world, r), 'the entrance is not a dead end');
}

// ------------------------------------------ FOG OF WAR: the important part ---
{
  const r = newRun(world, { seed: 7 });
  // Walk a few rooms, then check the route never traverses unvisited ground.
  for (let t = 0; t < 10 && r.status === 'delving'; t++) {
    applyAnswers(world, r, offlineAnswers(world, r).answers);
  }
  const route = routeToFrontier(world, r);
  if (route) {
    // every step EXCEPT the last must be a chamber already entered
    const middle = route.path.slice(0, -1);
    ok(middle.every((id) => r.visited.has(id)),
      'the route retraces only chambers already entered');
    ok(!r.visited.has(route.target), 'the target itself is genuinely unentered');
    ok(route.path[route.path.length - 1] === route.target, 'the path ends at the target');
    ok(route.steps === route.path.length, 'steps and path length agree');
    // and the first step must be a real exit from where the delver stands
    const exits = world.rooms.get(r.at).exits.map((x) => `to_${x.to}`);
    ok(exits.includes(route.first_step), 'the first step is a door that actually exists here');
  }
  const home = routeToEntrance(world, r);
  if (home && home.steps > 0) {
    ok(home.path.every((id) => r.visited.has(id)), 'the way home retraces only walked ground');
    ok(home.path[home.path.length - 1] === world.entrance, 'the way home ends at the entrance');
  }
}
{
  // A delver that has entered exactly one chamber cannot route two steps out:
  // it does not know the second chamber's doors yet.
  const r = newRun(world, { seed: 7 });
  const route = routeToFrontier(world, r);
  ok(route.steps === 1, 'from a standing start nothing is more than one step known');
  const f = frontier(world, r);
  ok(f.every((x) => world.rooms.get(world.entrance).exits.some((e) => e.to === x.chamber)),
    'the frontier is only what is visible through a door of somewhere entered');
}

// --------------------------------------------- the dead end that started it ---
// The exact situation from a live run: chamber 30, bottom of the dungeon, one
// exit, 16 chambers entered, one chamber ever seen and never entered.
{
  const w = mk();
  const r = newRun(w, { seed: 7 });
  for (let t = 0; t < 18 && r.status === 'delving'; t++) {
    applyAnswers(w, r, offlineAnswers(w, r).answers);
  }
  ok(atDeadEnd(w, r), 'the delver is at a dead end (every door leads somewhere walked)');
  const mem = memoryFor(w, r);
  ok(mem.every_exit_here_leads_somewhere_already_walked === true, 'the memory says so plainly');
  ok(mem.chambers_seen_but_never_entered.length > 0, 'it still knows of unentered chambers');
  ok(mem.nearest_unentered !== null, 'and it can name the nearest one');
  ok(mem.nearest_unentered.steps_away > 1, 'which is not adjacent — it requires retracing');
  ok(/Going back is not failure/.test(mem.note || ''), 'the note frames retracing as the way forward');

  // and the move question must carry the hint on the right door
  const qs = buildQuestions(w, r);
  const hinted = Object.entries(qs.move.criteria)
    .filter(([, v]) => v && v.starts_route_to_unentered);
  ok(hinted.length === 1, 'exactly one door is marked as starting the route to new ground');
  ok(hinted[0][0] === mem.nearest_unentered.first_step, 'and it is the door the route names');
  // the note on that door must NOT also say the trip gains nothing
  ok(!/leads nowhere new/.test(hinted[0][1].note),
    'the door that starts a retrace is not also described as leading nowhere');
}

// --------------------------------------------- trapdoors are exits too ---
// Leaving them out was a real bug: a live run ended with chambers 67, 68 and
// 69 unvisited and the frontier reported EMPTY. They are a pocket reachable
// only through the trapdoor in chamber 93 — which the delver had stood in and
// been told about, while carrying five ropes.
{
  const w = mk();
  const td = w.trapdoors[0];
  const r = newRun(w, { seed: 7 });
  r.visited.add(td.fromRoom);
  r.at = td.fromRoom;

  const exits = knownExits(w, r, td.fromRoom);
  ok(exits.some((x) => x.via === 'hatch' && x.to === td.toRoom),
    'a chamber with a trapdoor lists it among the ways out');
  ok(exits.filter((x) => x.via === 'door').length === w.rooms.get(td.fromRoom).exits.length,
    'and its doors are all still there');

  const f = frontier(w, r);
  ok(f.some((x) => x.chamber === td.toRoom && x.via === 'hatch'),
    'the chamber below a trapdoor is on the frontier');

  const route = routeToFrontier(w, r);
  ok(route !== null, 'a route to it exists');
  if (route && route.target === td.toRoom) {
    ok(route.needs_rope === true, 'a route ending in a trapdoor is flagged as needing a rope');
    ok(route.first_step === 'use the rope here', 'standing on it, the first step is the rope, not a door');
  }
}
{
  // the full case: the sealed pocket must be findable from a finished run
  const w = mk();
  const r = newRun(w, { seed: 7 });
  for (let t = 0; t < 40 && r.status === 'delving'; t++) {
    applyAnswers(w, r, offlineAnswers(w, r).answers);
  }
  const unvisited = [...w.rooms.keys()].filter((id) => !r.visited.has(id));
  if (unvisited.length) {
    const mem = memoryFor(w, r);
    const reachable = unvisited.filter((id) => {
      for (const v of r.visited) if (knownExits(w, r, v).some((x) => x.to === id)) return true;
      return false;
    });
    if (reachable.length) {
      ok(mem.nearest_unentered !== null,
        'a chamber reachable through a known trapdoor is never reported as nothing-left-to-find');
      ok(mem.chambers_seen_but_never_entered.length > 0, 'and it appears on the frontier list');
      ok(typeof mem.nearest_unentered.ropes_carried === 'number',
        'the memory states how many ropes are carried, since the route needs one');
    }
  }
}

// ----------------------------------------------------- nothing left to find ---
{
  const w = mk();
  const r = newRun(w, { seed: 7 });
  for (const id of w.rooms.keys()) r.visited.add(id);
  ok(frontier(w, r).length === 0,
    'with every chamber entered the frontier is empty, trapdoors included');
  ok(routeToFrontier(w, r) === null, 'and there is no route to nowhere');
  const mem = memoryFor(w, r);
  ok(mem.nearest_unentered === null, 'the memory reports no target rather than inventing one');
  ok(/nothing left to find/.test(mem.note || ''), 'and says exploration is exhausted');
  ok(!JSON.stringify(mem).includes('undefined'), 'no undefined leaks into the state document');
}

// ------------------------------- a hatch is an exit from BOTH of its ends ---
// Found by watching a live run: Jev roped down into the sealed pocket and was
// then stuck. Chamber 69 has one door and no hatch of its own, the rope only
// worked at a hatch's upper end, and standing in 67 — directly on a working
// hatch out to 92 — the memory still reported no route home.
{
  const w = mk();
  const td = w.trapdoors.find((t) => w.rooms.has(t.fromRoom) && w.rooms.has(t.toRoom));
  const r = newRun(w, { seed: 7 });
  r.visited.add(td.fromRoom);
  r.visited.add(td.toRoom);

  r.at = td.toRoom;
  const up = knownExits(w, r, td.toRoom).find((x) => x.via === 'hatch');
  ok(up && up.to === td.fromRoom, 'the chamber below a hatch lists it as a way UP');
  ok(up.direction === 'up', 'and the direction is recorded');

  r.at = td.fromRoom;
  const down = knownExits(w, r, td.fromRoom).find((x) => x.via === 'hatch');
  ok(down && down.to === td.toRoom && down.direction === 'down', 'and as a way DOWN from above');
}
{
  // the pocket that trapped him: every chamber in it must know a way home
  const w = mk();
  const r = newRun(w, { seed: 7 });
  for (const id of [114, 88, 89, 94, 93, 92, 87, 61, 62, 37, 38, 42, 41, 40, 46, 35, 30, 69, 68, 67]) {
    r.visited.add(id);
  }
  r.char.inventory.rope = 3;
  for (const at of [69, 68, 67]) {
    r.at = at;
    const home = routeToEntrance(w, r);
    ok(home !== null, `from sealed chamber ${at} a route home exists`);
    ok(home.needs_rope === true, `from ${at} that route needs a rope, and says so`);
    ok(home.steps > 0, `from ${at} the route has real length`);
    const mem = memoryFor(w, r);
    ok(mem.route_to_entrance.steps_away === home.steps, `${at}: the memory reports it`);
    ok(mem.route_to_entrance.ropes_carried === 3, `${at}: and how many ropes are carried`);
    ok(!mem.route_to_entrance.warning, `${at}: no warning while a rope is carried`);
  }
  // with no rope left, the memory must SAY it is a trap rather than stay quiet
  r.at = 69;
  r.char.inventory.rope = 0;
  const stuck = memoryFor(w, r).route_to_entrance;
  ok(/no rope left/i.test(stuck.warning || ''), 'with no rope the memory warns outright');
  ok(stuck.steps_away !== null, 'and still names the route, so the cost is legible');
}
{
  // the last-rope caution must appear BEFORE the one-way trip, not after
  const w = mk();
  const td = w.trapdoors[0];
  const r = newRun(w, { seed: 7 });
  r.at = td.fromRoom;
  r.visited.add(td.fromRoom);
  r.char.inventory.rope = 2;
  let qs = buildQuestions(w, r);
  ok(qs.use_item && !qs.use_item.criteria.rope.caution, 'no caution with ropes to spare');
  r.char.inventory.rope = 1;
  qs = buildQuestions(w, r);
  ok(/last rope/i.test(qs.use_item.criteria.rope.caution || ''), 'the last rope is flagged before it is spent');
}

// ------------------------------------------------------------- the journal ---
{
  const w = mk();
  const r = newRun(w, { seed: 7 });
  ok(Array.isArray(r.journal) && r.journal.length === 0, 'a fresh run has an empty journal');

  for (let t = 0; t < 6 && r.status === 'delving'; t++) {
    applyAnswers(w, r, offlineAnswers(w, r).answers);
  }
  ok(r.journal.length === r.tick, 'one journal entry per tick, including ticks that did nothing');
  const e = r.journal[r.journal.length - 1];
  for (const k of ['tick', 'chamber', 'depth', 'chose', 'health_change', 'gold_change', 'health_after']) {
    ok(k in e, `a journal entry carries ${k}`);
  }
  ok(typeof e.health_change === 'number', 'health_change is a number, not prose');
  ok(r.journal.every((x, i) => i === 0 || x.tick >= r.journal[i - 1].tick), 'entries are in order');

  // the state document carries a WINDOW, not the whole history
  const mem = memoryFor(w, r);
  ok(mem.journal.length <= JOURNAL_WINDOW, 'only a window of the journal travels in the state');
  ok(mem.recent_trail.length <= 12, 'the trail in the state is bounded too');

  // and it must stay bounded over a long run, or it quietly grows the bill
  for (let t = 0; t < 400; t++) recordJournal(r, { chamber: 1, depth: 1, answers: {}, hpBefore: r.hp, goldBefore: r.gold });
  ok(r.journal.length <= 200, `the journal is capped (${r.journal.length})`);
  ok(memoryFor(w, r).journal.length <= JOURNAL_WINDOW, 'the state window stays small regardless');
}

// ------------------------------------------------- it reaches the state doc ---
{
  const w = mk();
  const r = newRun(w, { seed: 3 });
  applyAnswers(w, r, offlineAnswers(w, r).answers);
  const st = buildState(w, r);
  ok(st.memory, 'the state document carries a memory block');
  for (const k of ['chambers_entered', 'recent_trail', 'journal',
    'every_exit_here_leads_somewhere_already_walked', 'chambers_seen_but_never_entered',
    'nearest_unentered', 'route_to_entrance']) {
    ok(k in st.memory, `memory carries ${k}`);
  }
  ok(!JSON.stringify(st).includes('undefined'), 'the whole state stays JSON-clean with memory in it');
}

if (failures.length) {
  console.error(`✗ memory selftest: ${failures.length} failure(s) of ${passed + failures.length}\n`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✓ memory selftest: ${passed} checks passed`);
