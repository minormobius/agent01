// memory.mjs — what the delver remembers about where it has been.
//
// Pure, dependency-free, node-tested.
//
// WHY THIS EXISTS. Watching a live run: at tick 18 the delver stood in
// chamber 30, a dead end at the bottom of the dungeon, having entered 16
// chambers. Exactly one chamber it had seen was still unentered — 46, four
// steps back the way it came. The state document told it the last six events
// in prose, a COUNT of rooms visited, and the single exit in front of it. So
// it bounced between 30 and 35 until the run ended. It had not given up; it
// had nothing to go on.
//
// A person in that spot retraces their steps. Retracing needs three things
// this module provides:
//   1. a JOURNAL of its own decisions, structured rather than narrated
//   2. a FRONTIER — chambers it has seen the door of but never walked through
//   3. a ROUTE to the nearest one, through chambers it has actually been in
//
// FOG OF WAR IS PRESERVED, deliberately. The route is computed over the
// VISITED subgraph only: the delver knows the exits of rooms it has stood in,
// and nothing else. It is memory, not a map of the dungeon, and not an
// oracle. Being told "the nearest chamber you have never entered is 4 steps
// back, first step to_35" still leaves the real decision — is that worth it
// at 11 health, or is it time to climb out? — entirely open.

export const MEMORY_VERSION = 1;

/** How many journal entries travel in the state document. */
export const JOURNAL_WINDOW = 8;

/**
 * One line of the journal: what it decided, and what that cost.
 * Structured, not prose — the whole point of a typed model is that its own
 * history does not need re-parsing either.
 */
export function recordJournal(run, { chamber, depth, answers = {}, hpBefore, goldBefore }) {
  run.journal = run.journal || [];
  run.journal.push({
    tick: run.tick,
    chamber,
    depth,
    chose: answers.move?.choice ?? null,
    engaged: answers.engage?.choice ?? null,
    used: answers.use_item?.choice && answers.use_item.choice !== 'none' ? answers.use_item.choice : null,
    health_change: run.hp - hpBefore,
    gold_change: run.gold - goldBefore,
    health_after: run.hp,
  });
  // Bound it. A journal that grows without limit quietly grows the bill too.
  if (run.journal.length > 200) run.journal.splice(0, run.journal.length - 200);
  return run;
}

/**
 * Every way out of a chamber the delver KNOWS about: its doors, and any
 * trapdoor in it.
 *
 * Trapdoors count, and leaving them out was a real bug. In a live run three
 * chambers (67, 68, 69) sat unvisited at the end with the frontier reported as
 * empty — they form a pocket reachable ONLY through the trapdoor in chamber
 * 93, which the delver had stood in and been told about, while carrying five
 * ropes. Memory that forgets a door it was shown is not memory.
 */
export function knownExits(world, run, id) {
  const room = world.rooms.get(id);
  if (!room) return [];
  const out = room.exits.map((x) => ({ to: x.to, via: 'door' }));
  // A hatch is an exit from BOTH its ends: a rope is tied off and climbed in
  // either direction, and a shaft in the ceiling is as visible as one in the
  // floor. Treating it as one-way sealed a live run into a pocket it had
  // roped into — see delve.mjs trapdoorHere().
  for (const t of world.trapdoors || []) {
    if (t.fromRoom === id && world.rooms.has(t.toRoom)) {
      out.push({ to: t.toRoom, via: 'hatch', direction: 'down', drop: t.drop });
    } else if (t.toRoom === id && world.rooms.has(t.fromRoom)) {
      out.push({ to: t.fromRoom, via: 'hatch', direction: 'up', drop: t.drop });
    }
  }
  return out;
}

/** Chambers seen through a door or a trapdoor, but never entered. */
export function frontier(world, run) {
  const out = [];
  const seen = new Set();
  for (const id of run.visited) {
    for (const x of knownExits(world, run, id)) {
      if (run.visited.has(x.to) || seen.has(x.to)) continue;
      seen.add(x.to);
      out.push({ chamber: x.to, reachable_from: id, via: x.via });
    }
  }
  return out;
}

/**
 * Shortest route from where the delver stands to the nearest chamber it has
 * never entered, travelling ONLY through chambers it has been in.
 *
 * Returns { target, steps, first_step, path } or null when there is nothing
 * left to find.
 */
export function routeToFrontier(world, run) {
  const start = run.at;
  const queue = [[start, []]];
  const seen = new Set([start]);

  while (queue.length) {
    const [id, path] = queue.shift();

    // An unvisited chamber IS the target — we stop the moment we reach one.
    if (id !== start && !run.visited.has(id)) {
      const last = path[path.length - 1];
      return {
        target: id,
        steps: path.length,
        // A trapdoor is not a door: it is entered with a rope, not walked
        // through, so the first move is naming an item rather than an exit.
        first_step: path[0].via === 'hatch' ? 'use the rope here' : `to_${path[0].to}`,
        first_step_via: path[0].via,
        needs_rope: path.some((p) => p.via === 'hatch'),
        path: path.map((p) => p.to),
        last_leg_via: last ? last.via : 'door',
      };
    }

    // We only know the ways out of chambers we have actually stood in, so the
    // search may only expand THROUGH visited ground.
    if (!run.visited.has(id)) continue;
    for (const x of knownExits(world, run, id)) {
      if (seen.has(x.to)) continue;
      seen.add(x.to);
      queue.push([x.to, [...path, { to: x.to, via: x.via }]]);
    }
  }
  return null;
}

/** True when every door out of the current chamber leads somewhere already walked. */
export function atDeadEnd(world, run) {
  const room = world.rooms.get(run.at);
  if (!room) return true;
  return room.exits.every((x) => run.visited.has(x.to));
}

/**
 * Shortest route home, over ground already walked.
 *
 * HATCHES COUNT. An earlier version walked doors only, on the theory that a
 * trapdoor is a one-way drop — and a live run paid for it. Having roped down
 * into the sealed pocket (69, 68, 67), the delver stood in chamber 67
 * directly on a working hatch out to 92 and was told `route_to_entrance:
 * null`. There was a way home under its feet and the memory denied it existed.
 */
export function routeToEntrance(world, run) {
  const start = run.at;
  if (start === world.entrance) return { steps: 0, first_step: null, path: [], needs_rope: false };
  const queue = [[start, []]];
  const seen = new Set([start]);
  while (queue.length) {
    const [id, path] = queue.shift();
    if (id === world.entrance) {
      const needsRope = path.some((p) => p.via === 'hatch');
      return {
        steps: path.length,
        first_step: path[0].via === 'hatch' ? 'use the rope here' : `to_${path[0].to}`,
        first_step_via: path[0].via,
        needs_rope: needsRope,
        path: path.map((p) => p.to),
      };
    }
    if (id !== start && !run.visited.has(id)) continue;
    for (const x of knownExits(world, run, id)) {
      if (seen.has(x.to)) continue;
      seen.add(x.to);
      queue.push([x.to, [...path, { to: x.to, via: x.via }]]);
    }
  }
  return null;
}

/**
 * The memory block that travels in the state document.
 */
export function memoryFor(world, run) {
  const front = frontier(world, run);
  const route = routeToFrontier(world, run);
  const home = routeToEntrance(world, run);
  const deadEnd = atDeadEnd(world, run);

  return {
    chambers_entered: run.visited.size,
    chambers_in_dungeon: world.rooms.size,
    // The trail as walked, most recent last. Repetition in here is the signal
    // that the delver is going in circles.
    recent_trail: run.trail.slice(-12),
    journal: (run.journal || []).slice(-JOURNAL_WINDOW),

    every_exit_here_leads_somewhere_already_walked: deadEnd,
    chambers_seen_but_never_entered: front.map((f) => f.chamber),
    nearest_unentered: route
      ? {
        chamber: route.target,
        steps_away: route.steps,
        first_step: route.first_step,
        reached_by: route.last_leg_via,
        needs_rope: route.needs_rope,
        ropes_carried: run.char?.inventory?.rope ?? 0,
        note: route.needs_rope
          ? (route.steps <= 1
            ? 'It is straight down the trapdoor in this chamber. That needs a rope.'
            : `Reaching it means retracing ${route.steps - 1} chamber(s) already walked, then a trapdoor, which needs a rope.`)
          : (route.steps <= 1
            ? 'It is immediately through a door from here.'
            : `Reaching it means retracing ${route.steps - 1} chamber(s) already walked, then one new door.`),
      }
      : null,
    route_to_entrance: home
      ? {
        steps_away: home.steps,
        first_step: home.first_step,
        needs_rope: Boolean(home.needs_rope),
        ropes_carried: run.char?.inventory?.rope ?? 0,
        ...(home.needs_rope && (run.char?.inventory?.rope ?? 0) === 0
          ? { warning: 'The only way back from here is a hatch, and there is no rope left.' }
          : {}),
      }
      : { steps_away: null, first_step: null, warning: 'No route back to the entrance is known from here.' },
    note: front.length === 0
      ? 'Every chamber this delver has seen has been entered. There is nothing left to find by exploring.'
      : deadEnd
        ? 'Every door out of this chamber leads somewhere already walked. Going back is not failure; '
          + 'it is how an unentered chamber gets reached.'
        : null,
  };
}
