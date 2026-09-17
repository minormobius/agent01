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
} from '../memory.mjs';
import {
  makeWorld, newRun, buildState, buildQuestions, applyAnswers, offlineAnswers,
} from '../delve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'fixtures', n), 'utf8'));
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
  ok(exits.some((x) => x.via === 'trapdoor' && x.to === td.toRoom),
    'a chamber with a trapdoor lists it among the ways out');
  ok(exits.filter((x) => x.via === 'door').length === w.rooms.get(td.fromRoom).exits.length,
    'and its doors are all still there');

  const f = frontier(w, r);
  ok(f.some((x) => x.chamber === td.toRoom && x.via === 'trapdoor'),
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
