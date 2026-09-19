// delve.mjs — the pure delve engine behind jev.mino.mobi.
//
// Dependency-free ESM. Runs unchanged in the browser (app.js) and in node
// (test/delve.selftest.mjs), which is the whole point: the questions this
// module builds are the questions the selftest asserts on, so the demo can
// never drift from what is being tested.
//
// It knows nothing about HTTP. It turns a foam-dungeon document into a
// world, keeps one delver's run state, renders that state as the `state`
// document Jev evaluates, builds the typed questions, and applies the
// answers back. Everything is deterministic given (dungeon, content, seed)
// EXCEPT Jev's own decisions — so a replay with the same answers is exact.
//
// The contract for the dungeon documents: https://foam.mino.mobi/dungeon/FORMAT.md

import {
  rollCharacter, sheet, grantXp, availableSkills, takeSkill, usableItems,
  healAmount, meleeCost, arrowRecoveryChance, maxHpOf, nextBonusMaxHp, ITEMS, ITEM_KEYS, SKILLS,
} from './character.mjs';
import { memoryFor, routeToFrontier, routeToEntrance, recordJournal } from './memory.mjs';

export const DELVE_VERSION = 2;

// The demo's default heartbeat. One tick = one Jev call = one decision.
export const TICK_MS_DEFAULT = 10_000;

// ------------------------------------------------------------------ rng ----
// mulberry32 — small, fast, and identical in node and the browser, so a
// seeded run replays byte-for-byte. Only the *consequences* of a decision
// use it (does the trap bite, how hard does the wraith hit); the decisions
// themselves come from Jev.
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------- bestiary ---
// The three agent types the content roller actually emits (mite/shade/
// wraith, hp 1/2/3). Damage is the creature's hp — tough things hit hard.
const BESTIARY = {
  mite: { hp: 1, bite: 1, note: 'a skittering mite; barely a threat alone' },
  shade: { hp: 2, bite: 2, note: 'a shade; drains as it closes' },
  wraith: { hp: 3, bite: 3, note: 'a wraith; the deep foam breeds them' },
};
function bite(type) {
  return BESTIARY[type]?.bite ?? 1;
}

// ------------------------------------------------------------------ world ---
/**
 * Fold the two foam-dungeon documents (map + content roll) into the lookup
 * shape the delve needs. Pure: same inputs → same world.
 */
export function makeWorld(dungeon, content) {
  if (!dungeon || dungeon.format !== 'foam-dungeon') {
    throw new Error('makeWorld: expected a foam-dungeon document');
  }
  if (!content || content.format !== 'foam-dungeon-content') {
    throw new Error('makeWorld: expected a foam-dungeon-content document');
  }

  const rooms = new Map();
  for (const r of dungeon.rooms) {
    rooms.set(r.id, {
      id: r.id,
      role: r.role,
      depth: r.depth,
      area: r.area,
      centroid: r.centroid,
      // carried for the 3D view: the dungeon is genuinely 3D and rooms stack,
      // so the renderer needs the true floor height and the wall outline
      // rather than a plan projection. scene.mjs reads both.
      floorY: r.floorY,
      outline: r.outline || [],
      // `doors` is the room's own outgoing list: { to, face, at, tile }
      exits: r.doors.map((d) => ({ to: d.to, face: d.face, at: d.at })),
      agents: [],
      loot: [],
      traps: [],
      obstacles: [],
    });
  }

  for (const a of content.agents) {
    const room = rooms.get(a.room);
    if (room) room.agents.push({ id: a.id, type: a.type, hp: a.hp, tile: a.tile });
  }
  for (const e of content.effects) {
    const room = rooms.get(e.room);
    if (!room) continue;
    if (e.type === 'loot' || e.type === 'treasure') {
      room.loot.push({ kind: e.type, gold: e.gold, tile: e.tile });
    } else if (e.type === 'trap') {
      room.traps.push({ trap: e.trap, dmg: e.dmg, span: e.span, tile: e.tile });
    } else if (e.type === 'obstacle') {
      room.obstacles.push({ span: e.span, tile: e.tile });
    }
  }

  const maxDepth = Math.max(...dungeon.rooms.map((r) => r.depth));

  return {
    rooms,
    entrance: dungeon.entrance,
    endpoints: dungeon.endpoints.slice(),
    maxDepth,
    bounds: dungeon.bounds,
    // vertical links between rooms — drawn as dashed drops in the 3D view
    trapdoors: dungeon.trapdoors || [],
    paths: dungeon.paths || [],
    seed: dungeon.generator?.seed ?? 0,
    roll: content.roll ?? 1,
    mapSig: content.mapSig ?? null,
    // total gold on the floor — the denominator for "how much did it get out with"
    goldOnFloor: content.effects
      .filter((e) => e.type === 'loot' || e.type === 'treasure')
      .reduce((s, e) => s + (e.gold || 0), 0),
  };
}

// -------------------------------------------------------------------- run ---
export function newRun(world, { seed = 1, character = null } = {}) {
  const rand = rng(seed);
  // The sheet is rolled from the same seed as everything else, so a run
  // replays exactly — stats included.
  const char = character || rollCharacter(rand);
  const run = {
    at: world.entrance,
    char,
    hp: char.maxHp,
    maxHp: char.maxHp,
    gold: 0,
    tick: 0,
    status: 'delving', // delving | escaped | dead | stranded
    visited: new Set([world.entrance]),
    cleared: new Set(), // rooms whose agents are dead
    looted: new Set(), // rooms whose loot is taken
    sprung: new Set(), // rooms whose traps already fired
    warded: new Set(), // rooms whose traps were disarmed by a ward
    withdrawing: false, // latched: see applyAnswers
    journal: [],        // the delver's own record of its decisions (memory.mjs)
    kills: 0,
    itemsUsed: {},
    deepest: world.rooms.get(world.entrance)?.depth ?? 0,
    log: [],
    rand,
    trail: [world.entrance],
  };
  return run;
}

/**
 * The hatch connecting the delver's chamber to another, in EITHER direction.
 *
 * A rope works both ways, and it took a live run to notice that it did not.
 * Jev roped down the hatch from 93 into the sealed pocket (69, 68, 67), and
 * was then stuck: 69 has one door and no hatch of its own, and the rope could
 * only ever be used at a hatch's upper end. Standing in 67 — directly on a
 * working hatch out to chamber 92 — the memory still reported no route home,
 * because routes walked doors only.
 *
 * Physically a rope is tied off and climbed in both directions, and a shaft in
 * the ceiling is as visible as one in the floor. So a hatch is an exit from
 * both of its ends, and `direction` says which way this one goes.
 */
export function trapdoorHere(world, run) {
  for (const t of world.trapdoors || []) {
    if (t.fromRoom === run.at && world.rooms.has(t.toRoom)) {
      return { ...t, direction: 'down', toChamber: t.toRoom, otherEnd: t.toRoom };
    }
    if (t.toRoom === run.at && world.rooms.has(t.fromRoom)) {
      return { ...t, direction: 'up', toChamber: t.fromRoom, otherEnd: t.fromRoom };
    }
  }
  return null;
}

/** What the delver faces right now — the context item legality is judged on. */
export function situation(world, run) {
  const here = world.rooms.get(run.at);
  return {
    hp: run.hp,
    maxHp: run.maxHp,
    creatures: run.cleared.has(run.at) ? [] : (here?.agents || []),
    traps: run.sprung.has(run.at) || run.warded.has(run.at) ? [] : (here?.traps || []),
    loot: run.looted.has(run.at) ? [] : (here?.loot || []),
    trapdoor: trapdoorHere(world, run),
  };
}

// What the delver can actually see from where it stands: each exit, plus
// whatever it already learned about the room beyond by having been there.
// This is deliberately partial-information — Jev is choosing under fog, not
// reading a solved map.
export function visibleExits(world, run) {
  const here = world.rooms.get(run.at);
  if (!here) return [];
  return here.exits.map((x) => {
    const beyond = world.rooms.get(x.to);
    const seen = run.visited.has(x.to);
    const exit = {
      option: `to_${x.to}`,
      room: x.to,
      descends: beyond ? beyond.depth - here.depth : 0,
      visited: seen,
      times_entered: run.trail.filter((id) => id === x.to).length,
    };
    if (seen && beyond) {
      // Only rooms already walked reveal their contents.
      exit.known = {
        depth: beyond.depth,
        role: beyond.role,
        creatures_left: run.cleared.has(beyond.id) ? 0 : beyond.agents.length,
        loot_left: run.looted.has(beyond.id) ? 0 : beyond.loot.length,
      };
    }
    return exit;
  });
}

// ------------------------------------------------------------------ state ---
/**
 * The `state` document handed to Jev.
 *
 * Built as an OBJECT with descriptive keys rather than prose, which is what
 * the TypeSafe docs recommend: "each part of the state has a descriptive
 * name and its relationships remain clear". Every question in the same call
 * is evaluated against this one state, in parallel and in isolation.
 */
export function buildState(world, run) {
  const here = world.rooms.get(run.at);
  const creatures = run.cleared.has(here.id)
    ? []
    : here.agents.map((a) => ({ kind: a.type, hp: a.hp, note: BESTIARY[a.type]?.note }));
  const loot = run.looted.has(here.id) ? [] : here.loot;
  const traps = run.sprung.has(here.id) ? [] : here.traps;

  const sit = situation(world, run);
  const usable = usableItems(run.char, sit);

  return {
    delver: {
      name: run.char.name,
      level: run.char.level,
      xp: run.char.xp,
      xp_to_next_level: run.char.xpToNext,
      health: run.hp,
      max_health: run.maxHp,
      health_fraction: Number((run.hp / run.maxHp).toFixed(2)),
      stats: { ...run.char.stats },
      skills: run.char.skills.map((id) => SKILLS[id].label),
      gold_carried: run.gold,
      creatures_killed: run.kills,
      ticks_elapsed: run.tick,
      rooms_visited: run.visited.size,
      deepest_depth_reached: run.deepest,
    },
    // The inventory is stated in full, including the zeroes, so the model can
    // see what it has run out of rather than inferring it from an absence.
    inventory: { ...run.char.inventory },
    usable_right_now: usable.length
      ? usable.map((k) => ({ item: k, effect: ITEMS[k].why(run.char, sit) }))
      : 'Nothing in the pack is usable in this chamber.',
    objective: {
      goal: 'Descend to a vault chamber, take what is there, and climb back out alive.',
      vault_chambers_remaining: world.endpoints.filter((id) => !run.visited.has(id)).length,
      vault_chambers_total: world.endpoints.length,
      entrance_room: world.entrance,
      deepest_depth_in_dungeon: world.maxDepth,
      note: 'Higher depth numbers are further down. The entrance is depth 0.',
    },
    current_room: {
      id: here.id,
      role: here.role,
      depth: here.depth,
      floor_area_m2: Math.round(here.area),
      exit_count: here.exits.length,
      creatures_present: creatures,
      loot_present: loot.map((l) => ({ kind: l.kind, gold: l.gold })),
      traps_present: traps.map((t) => ({ trap: t.trap, damage: t.dmg, span: t.span })),
      obstacles_present: here.obstacles.length,
      hatch: sit.trapdoor
        ? {
          direction: sit.trapdoor.direction,
          connects_to_chamber: sit.trapdoor.toChamber,
          height_metres: sit.trapdoor.drop,
          already_entered: run.visited.has(sit.trapdoor.toChamber),
          note: sit.trapdoor.direction === 'down'
            ? 'A shaft in the floor. A rope goes down it.'
            : 'A shaft in the ceiling. A rope climbs up it.',
        }
        : null,
      already_visited: run.trail.filter((id) => id === here.id).length > 1,
    },
    available_exits: visibleExits(world, run),

    // WHAT THE DELVER REMEMBERS. Without this it cannot retrace: a live run
    // sat in a dead end at the bottom of the dungeon, four steps from the one
    // chamber it had never entered, and bounced between two rooms — because
    // nothing in the state document mentioned that chamber existed.
    memory: memoryFor(world, run),
    recent_events: run.log.slice(-6).map((l) => l.text),
  };
}

// -------------------------------------------------------------- questions ---
/**
 * The typed questions. All five go in ONE call and are answered in parallel.
 *
 * Note what is NOT here: no output format, no "respond with JSON", no parse
 * step. The shape of the answer is the shape of the question.
 */
export function buildQuestions(world, run) {
  const here = world.rooms.get(run.at);
  const exits = visibleExits(world, run);

  // Choice criteria are a MAP of option -> description. Options are built
  // from the live exits, so Jev can only ever pick a door that exists —
  // that is the type safety doing the work an LLM would need a retry loop for.
  //
  // THE WORDING IS LOAD-BEARING, and all of this was measured, not guessed.
  //
  // ROUND 1 — prose. An early version described an explored neighbour as
  // "Already explored: 0 creature(s) and 0 loot pile(s) left there" and an
  // unexplored one as "Unexplored — its contents are unknown". That reads as
  // safe-versus-risky, and nothing said going back made no progress, so the
  // delver retreated into picked-clean rooms and oscillated between two
  // chambers forever. Rewriting the strings so each option names its direction
  // relative to the objective, and a revisit is called a revisit:
  //   deepest depth 5 -> 11 · unique chambers 6 -> 13 · vaults 0 -> 1
  //   gate firings 7 -> 1 · mean move confidence 0.48 -> 0.84
  //
  // ROUND 2 — structure. `criteria` values and `instructions` accept JSON,
  // not just strings (docs.typesafe.ai/primitives/advanced). Paired test over
  // 12 IDENTICAL states, prose vs the same facts as labelled objects:
  //   same pick in 12/12 states — structure does not change WHAT it decides
  //   mean confidence 0.912 -> 0.980
  //   and the whole gain is on the hard calls: the two states where prose
  //   returned 0.45 and 0.50 — straddling this demo's 0.45 gate — came back
  //   0.89 and 0.87. Fewer spurious gate firings, so fewer fallbacks.
  //
  // The lesson both rounds teach: low confidence is usually a bug report about
  // your question, not weakness in the model. Labelled keys beat a sentence
  // because nothing has to be parsed out of prose.
  const moveCriteria = {};
  // Retracing is only a real option if the delver can see where it leads.
  // These routes are computed over VISITED ground only — memory, not a map.
  const toFrontier = routeToFrontier(world, run);
  const toHome = routeToEntrance(world, run);
  for (const x of exits) {
    const isVault = world.endpoints.includes(x.room);
    const startsRetrace = Boolean(toFrontier && toFrontier.first_step === x.option);
    moveCriteria[x.option] = {
      leads_to_chamber: x.room,
      direction: x.descends > 0 ? 'DOWN, toward the vaults'
        : x.descends < 0 ? 'BACK UP, away from the vaults'
          : 'level, no progress downward',
      levels_changed: x.descends,
      is_vault_chamber: isVault,
      times_already_entered: x.times_entered,
      still_unexplored: x.times_entered === 0,
      creatures_known_left: x.known?.creatures_left ?? null,
      loot_known_left: x.known?.loot_left ?? null,
      // The note must not fight the retrace hint below it. A door that is the
      // first step toward unentered ground is NOT "gains nothing", even though
      // the chamber immediately through it is stripped — and handing the model
      // two criteria that contradict each other is the same mistake as writing
      // one badly.
      note: isVault
        ? 'This is the objective itself.'
        : startsRetrace && x.times_entered > 0
          ? 'This chamber is already stripped, but it is the way back toward ground never walked — '
            + 'see starts_route_to_unentered.'
          : x.times_entered > 0
            ? 'Already stripped, and it leads nowhere new; returning repeats ground already covered.'
            : 'Unentered chambers are the only ones still holding loot, and the only route to a vault.',
      // The difference between "everywhere from here is already walked" and
      // "this door starts a four-step route to the one chamber you have never
      // entered". Only set on the door that actually starts that route.
      ...(startsRetrace
        ? {
          starts_route_to_unentered: {
            chamber: toFrontier.target,
            steps_away: toFrontier.steps,
            note: 'The shortest way to ground this delver has never walked starts here.',
          },
        }
        : {}),
      ...(toHome && toHome.first_step === x.option && toHome.steps > 0
        ? { starts_route_to_entrance: { steps_away: toHome.steps } }
        : {}),
    };
  }
  moveCriteria.hold = {
    leads_to_chamber: null,
    direction: 'nowhere',
    levels_changed: 0,
    note: 'Stand still and do nothing this turn. Makes no progress and gains nothing;'
      + ' only sensible if every door is worse than wasting the turn.',
  };

  const questions = {
    // Which door. One option per real exit, plus hold.
    move: {
      type: 'choice',
      // structured for the same reason the criteria are — see above
      instructions: {
        task: 'Choose where the delver goes next.',
        objective: 'Reach a VAULT chamber, which lies deep, and survive to carry the gold out.',
        delver_position: { chamber: here.id, depth: here.depth, deepest_depth_in_dungeon: world.maxDepth },
        delver_health: { current: run.hp, max: run.maxHp },
        rule: 'Progress means descending into chambers not yet entered. Retreating to a chamber '
          + 'already stripped makes no progress. Retreat only if the health cost of going on is '
          + 'likely fatal.',
      },
      criteria: moveCriteria,
    },
    // How bad is it here, on an ordered spectrum.
    danger: {
      type: 'score',
      instructions: 'How dangerous is the delver’s current chamber right now?',
      criteria: [
        'Safe. Nothing hostile, no traps, nothing to fear.',
        'Uneasy. Minor hazards or a weak creature; a careful delver walks through unharmed.',
        'Dangerous. Real threats that will cost health to cross.',
        'Lethal. This chamber can kill the delver outright at its current health.',
      ],
    },
    // Greed check.
    take_loot: {
      type: 'noul',
      instructions: 'Should the delver stop to collect the loot in this chamber?',
      criteria: {
        true: 'The gold is worth the time and the risk of lingering.',
        false: 'Leave it — the risk of stopping here outweighs the gold.',
      },
    },
    // The whole-run call: keep going down, or cut losses and climb out.
    withdraw: {
      type: 'noul',
      instructions:
        'Should the delver abandon the descent and start climbing back toward the entrance to survive with what it already carries?',
      criteria: {
        true: 'Withdraw — health is low enough that pressing deeper likely ends the run.',
        false: 'Press on — there is enough health to keep descending.',
      },
    },
  };

  // CONDITIONAL QUESTIONS. The question set is just data, so it varies tick to
  // tick with no protocol ceremony — and a question is only asked when there
  // is a real decision behind it. A `choice` with one option is not a
  // decision, it is a forced move dressed up as one, and it still costs
  // tokens; so:
  //   engage    — only when something hostile is actually here
  //   use_item  — only when at least one charge is usable in THIS chamber
  //   level_up  — only when a level is waiting to be spent
  const sit = situation(world, run);
  if (sit.creatures.length) questions.engage = buildEngage(world, run);
  if (usableItems(run.char, sit).length) questions.use_item = buildUseItem(world, run);
  if (run.char.pendingLevels > 0) questions.level_up = buildLevelUp(world, run);

  return questions;
}

// ---------------------------------------------------- the new decisions ----
// Each of these builds its option set from what is ACTUALLY possible this
// tick. That is the type system doing the work: `shoot` cannot be picked with
// an empty quiver because it is not in the set, and no validator or retry
// loop is involved.

function buildEngage(world, run) {
  const sit = situation(world, run);
  const criteria = {};
  const worst = [...sit.creatures].sort((a, b) => b.hp - a.hp)[0];
  const raw = sit.creatures.reduce((t, a) => t + (a.hp || 1), 0);

  if (sit.creatures.length) {
    criteria.melee = {
      action: 'Close and fight them hand to hand.',
      clears_the_chamber: true,
      likely_health_cost: meleeCost(run.char, raw),
      note: 'Clears the chamber for good and earns experience, but always costs health.',
    };
    if (run.char.inventory.arrow > 0) {
      criteria.shoot = {
        action: `Loose an arrow at the ${worst.type}.`,
        arrows_left_after: run.char.inventory.arrow - 1,
        likely_health_cost: 0,
        note: 'Kills the toughest creature outright with no retaliation, and spends an arrow. '
          + 'Any others in the chamber still have to be dealt with.',
      };
    }
    criteria.avoid = {
      action: 'Slip past them without engaging.',
      clears_the_chamber: false,
      likely_health_cost: '0 or 1',
      note: 'Cheapest now, but they are still here if the delver comes back through.',
    };
  }

  return {
    type: 'choice',
    instructions: {
      task: 'Decide how to handle the creatures in this chamber.',
      creatures_present: sit.creatures.map((a) => ({ kind: a.type, hp: a.hp })),
      delver_health: { current: run.hp, max: run.maxHp },
      arrows_in_quiver: run.char.inventory.arrow,
      rule: 'Melee always costs health but clears the chamber and earns experience. '
        + 'An arrow costs no health, but the quiver does not refill on its own. '
        + 'Avoiding costs almost nothing now and leaves the problem in place.',
    },
    criteria,
  };
}

function buildUseItem(world, run) {
  const sit = situation(world, run);
  const usable = usableItems(run.char, sit);
  // The route home may START with the rope in this chamber. Knowing that and
  // not saying it on the rope OPTION is the same mistake as writing the
  // criteria badly: a live run sat in chamber 67 with `route_to_entrance`
  // reading "6 steps via use the rope here", chose `none` every tick, and
  // shuffled between two chambers until the run ended. The fact has to travel
  // on the thing being chosen, not merely somewhere in the state.
  const home = routeToEntrance(world, run);
  const ropeIsTheWayHome = Boolean(home && home.first_step === 'use the rope here');
  const criteria = {
    none: {
      action: 'Use nothing this turn.',
      note: 'Charges never regenerate, so keeping one is a real choice rather than a default.',
    },
  };
  for (const k of usable) {
    criteria[k] = {
      action: `Use the ${ITEMS[k].label.toLowerCase()}.`,
      effect: ITEMS[k].why(run.char, sit),
      remaining_after_use: run.char.inventory[k] - 1,
      note: ITEMS[k].blurb,
    };
    // Roping into somewhere whose only way back is another hatch, on the last
    // rope, is a one-way trip. That should be a decision taken knowingly, not
    // a trap sprung afterwards — so the risk is stated before the choice.
    if (k === 'rope' && ropeIsTheWayHome) {
      criteria[k].starts_route_to_entrance = {
        steps_away: home.steps,
        note: 'This hatch is the first step of the only known way back to the entrance. '
          + 'There is no door route out of here.',
      };
    }
    if (k === 'rope' && run.char.inventory.rope - 1 === 0) {
      const dest = world.rooms.get(sit.trapdoor.toChamber);
      const doorRoutes = dest ? dest.exits.length : 0;
      criteria[k].caution = doorRoutes === 0
        ? 'This is the LAST rope, and the chamber at the other end has no doors at all. '
          + 'Using it here is one-way.'
        : 'This is the last rope. If the way back from there turns out to be another hatch, '
          + 'there will be nothing left to climb it with.';
    }
  }
  return {
    type: 'choice',
    instructions: {
      task: 'Spend one charge from the pack, or keep them all.',
      inventory: { ...run.char.inventory },
      // What is NOT on the menu, and why. Stating it beats leaving the model
      // to infer a capability from an absence.
      not_offered: ITEM_KEYS.filter((k) => !usable.includes(k)).map((k) => ({
        item: k,
        held: run.char.inventory[k],
        reason: run.char.inventory[k] === 0 ? 'none carried' : 'nothing here for it to act on',
      })),
      route_home: home
        ? { steps_away: home.steps, first_step: home.first_step, needs_rope: Boolean(home.needs_rope) }
        : { first_step: null, warning: 'No route back to the entrance is known from here.' },
      rule: 'Nothing refills. A potion spent at 2 health is worth far more than one spent at 10, '
        + 'and an arrow spent on a mite is an arrow not spent on a wraith. '
        + 'A rope, though, is sometimes the only way out of somewhere.',
    },
    criteria,
  };
}

function buildLevelUp(world, run) {
  const criteria = {};
  // THE WORDING IS LOAD-BEARING HERE TOO. A first version listed each skill's
  // effect and nothing else, and jev-1.13.0 took Toughness five level-ups in a
  // row while carrying an empty pack — a defensible read of "+4 health,
  // always available" when nothing said the quiver was empty. Each option now
  // states what it would do to the stock the delver actually has.
  const inv = run.char.inventory;
  for (const id of availableSkills(run.char)) {
    const sk = SKILLS[id];
    const grants = sk.grants && Object.keys(sk.grants).length ? sk.grants : null;
    const restocks = grants
      ? Object.entries(grants).map(([item, n]) => ({
        item, carried_now: inv[item], carried_after: inv[item] + n,
        and_then: sk.perLevel?.[item] ? `+${sk.perLevel[item]} more at every later level` : null,
      }))
      : null;
    criteria[id] = {
      skill: sk.label,
      tier: sk.tier,
      effect: sk.blurb,
      restocks,
      raises_max_health_by: nextBonusMaxHp(run.char, id) || null,
      heals_now: 0,
      times_already_taken: run.char.skills.filter((x) => x === id).length,
    };
  }
  return {
    type: 'choice',
    instructions: {
      task: `${run.char.name} reached level ${run.char.level}. Choose one skill.`,
      skills_already_taken: run.char.skills.map((id) => SKILLS[id].label),
      pack_right_now: { ...run.char.inventory },
      empty_handed: ITEM_KEYS.filter((k) => inv[k] === 0),
      note: ITEM_KEYS.every((k) => inv[k] === 0)
        ? 'The pack is completely empty. Nothing refills on its own; only a skill restocks it.'
        : 'Charges never refill on their own. Only a skill restocks the pack.',
      stats: { ...run.char.stats },
      rule: 'A tier-2 skill needs its tier-1 parent, so it only appears once that is taken. '
        + 'Toughness is always available and may be taken more than once.',
    },
    criteria,
  };
}

// --------------------------------------------------------------- fallback ---
/**
 * The deterministic rule used when Jev's `move` confidence is below the
 * gate: follow the dungeon's own descent gradient (steepest drop, else the
 * least-visited door). This is the "fall back to a different system" arm of
 * confidence-gated routing — the demo shows it firing rather than hiding it.
 */
export function fallbackMove(world, run, { climbing = false } = {}) {
  const exits = visibleExits(world, run);
  if (!exits.length) return 'hold';

  // When the gate fires and the delver is heading out, follow the route home
  // it actually knows rather than the crude "prefer ascent" heuristic. The
  // heuristic bounced a withdrawing delver between two chambers of a pocket
  // whose only exit was a hatch, because ascending by depth number and
  // getting closer to the entrance are not the same thing.
  if (climbing) {
    const home = routeToEntrance(world, run);
    if (home && home.first_step && exits.some((x) => x.option === home.first_step)) {
      return home.first_step;
    }
  }
  const scored = exits.map((x) => {
    const visits = run.trail.filter((id) => id === x.room).length;
    // climbing out: prefer ascent; delving: prefer descent
    const dirScore = climbing ? -x.descends : x.descends;
    return { option: x.option, key: dirScore * 10 - visits * 3 + (x.visited ? 0 : 1) };
  });
  scored.sort((a, b) => b.key - a.key || a.option.localeCompare(b.option));
  return scored[0].option;
}

// ---------------------------------------------------------------- resolve ---
/**
 * Apply one tick's answers to the run. Returns the events produced, so the
 * UI can narrate exactly what each decision cost.
 *
 * `answers` is Jev's `answers` object verbatim — the same shape whether it
 * came from the API or the offline stand-in.
 */
export function applyAnswers(world, run, answers, { moveConfidenceGate = 0.45 } = {}) {
  if (run.status !== 'delving') return { events: [], usedFallback: false };

  const events = [];
  const say = (text, kind = 'info') => {
    events.push({ text, kind, tick: run.tick });
    run.log.push({ text, kind, tick: run.tick });
  };

  const here = world.rooms.get(run.at);
  // Captured up front so the journal can record what this tick actually cost.
  const journalStart = { chamber: run.at, depth: here.depth, hpBefore: run.hp, goldBefore: run.gold };
  // WITHDRAWAL LATCHES, and that is a deliberate fix rather than a tweak.
  // Reading `withdraw > 0.5` fresh each tick made the endgame dither: measured
  // against jev-1.13.0, a delver at 20/38 health sat on withdraw 0.51–0.57 for
  // six straight ticks and climbed, descended, climbed, descended. A retreat
  // is a decision about the RUN, so it needs hysteresis:
  //   enter withdrawal only on a decisive call (> 0.65)
  //   leave it only once genuinely recovered (health back above 70%)
  // A 0.51 is the model saying "I am not sure", and the right response to
  // that is not to reverse course every few seconds.
  const withdrawNoul = answers.withdraw?.noul ?? 0;
  if (!run.withdrawing && withdrawNoul > 0.65) {
    run.withdrawing = true;
    say(`withdraw ${withdrawNoul.toFixed(2)} \u2014 turning back for the surface.`, 'gate');
  } else if (run.withdrawing && withdrawNoul < 0.4 && run.hp / run.maxHp > 0.7) {
    run.withdrawing = false;
    say(`recovered to ${run.hp}/${run.maxHp} \u2014 pressing on again.`, 'gate');
  }
  const withdrawing = run.withdrawing;
  const ch = run.char;
  let xp = 0;
  let movedByRope = false;

  // ---- 1. spend the level, if one is waiting ----------------------------
  // First, so the skill's charges are available to the very tick that earned
  // them — a potion granted by Second Wind can be drunk immediately.
  if (ch.pendingLevels > 0) {
    const pick = answers.level_up?.choice;
    const legal = availableSkills(ch);
    const id = legal.includes(pick) ? pick : legal[0];
    if (id) {
      const res = takeSkill(ch, id);
      if (res.ok) {
        run.maxHp = ch.maxHp;
        // NOTE: raising the ceiling does NOT heal. It used to, which quietly
        // made Toughness a free potion on top of a permanent upgrade and made
        // the level-up choice a foregone conclusion.
        say(`Level ${ch.level}: took ${res.skill.label}.`, 'level');
        if (pick && pick !== id) say(`(asked for ${pick}, which was not available)`, 'gate');
      }
    }
  }

  // ---- 2. use an item ---------------------------------------------------
  const sit = situation(world, run);
  const wanted = answers.use_item?.choice ?? 'none';
  const legalItems = usableItems(ch, sit);
  if (wanted !== 'none') {
    if (!legalItems.includes(wanted)) {
      say(`Cannot use ${wanted} here \u2014 kept it.`, 'gate');
    } else {
      ch.inventory[wanted] -= 1;
      run.itemsUsed[wanted] = (run.itemsUsed[wanted] || 0) + 1;
      if (wanted === 'potion') {
        const heal = Math.min(healAmount(ch), run.maxHp - run.hp);
        run.hp += heal;
        say(`Drank a potion: +${heal} health (${run.hp}/${run.maxHp}).`, 'item');
      } else if (wanted === 'arrow') {
        const target = [...sit.creatures].sort((x, y) => y.hp - x.hp)[0];
        here.agents = here.agents.filter((a) => a.id !== target.id);
        run.kills += 1;
        xp += 2 + (target.hp || 1);
        if (!here.agents.length) run.cleared.add(here.id);
        const recovered = run.rand() < arrowRecoveryChance(ch);
        if (recovered) ch.inventory.arrow += 1;
        say(`Shot the ${target.type} dead${recovered ? ' and recovered the arrow' : ''}.`, 'item');
      } else if (wanted === 'ward') {
        run.warded.add(here.id);
        say(`Ward flared: ${sit.traps.length} trap(s) here are dead.`, 'item');
      } else if (wanted === 'rope') {
        const td = sit.trapdoor;
        const target = td.toChamber;
        run.at = target;
        run.visited.add(target);
        run.trail.push(target);
        movedByRope = true;
        const dest = world.rooms.get(target);
        if (dest.depth > run.deepest) { xp += 2 * (dest.depth - run.deepest); run.deepest = dest.depth; }
        say(`Roped ${td.direction} the hatch into chamber ${target} (depth ${dest.depth}).`, 'item');
      }
    }
  }

  // ---- 3. the creatures --------------------------------------------------
  const room = world.rooms.get(run.at);
  const hostiles = run.cleared.has(room.id) ? [] : room.agents;
  if (hostiles.length && !movedByRope) {
    const mode = answers.engage?.choice ?? 'avoid';
    if (mode === 'melee') {
      const raw = hostiles.reduce((t, a) => t + (a.hp || 1), 0);
      const taken = meleeCost(ch, raw);
      run.hp -= taken;
      run.kills += hostiles.length;
      xp += hostiles.reduce((t, a) => t + 2 + (a.hp || 1), 0);
      run.cleared.add(room.id);
      say(`Fought ${hostiles.length} creature(s) hand to hand \u2014 cleared, took ${taken}.`, 'fight');
    } else if (mode === 'shoot' && ch.inventory.arrow > 0) {
      // engage=shoot is a second arrow, distinct from use_item=arrow
      const target = [...hostiles].sort((x, y) => y.hp - x.hp)[0];
      ch.inventory.arrow -= 1;
      run.itemsUsed.arrow = (run.itemsUsed.arrow || 0) + 1;
      room.agents = room.agents.filter((a) => a.id !== target.id);
      run.kills += 1;
      xp += 2 + (target.hp || 1);
      if (!room.agents.length) run.cleared.add(room.id);
      const recovered = run.rand() < arrowRecoveryChance(ch);
      if (recovered) ch.inventory.arrow += 1;
      say(`Loosed an arrow: the ${target.type} drops${recovered ? ', arrow recovered' : ''}.`, 'item');
    } else {
      const taken = run.rand() < 0.45 ? 1 : 0;
      if (taken) { run.hp -= taken; say(`Slipped past ${hostiles.length} creature(s) \u2014 clipped for ${taken}.`, 'evade'); }
      else say(`Slipped past ${hostiles.length} creature(s) untouched.`, 'evade');
    }
  }

  // ---- 4. traps ----------------------------------------------------------
  const traps = run.sprung.has(room.id) || run.warded.has(room.id) ? [] : room.traps;
  if (traps.length && run.hp > 0) {
    const dangerScore = answers.danger?.score ?? 0;
    const wary = dangerScore >= 2 ? 0.35 : 0.7;
    let taken = 0;
    for (const t of traps) if (run.rand() < wary) taken += t.dmg;
    run.sprung.add(room.id);
    if (taken) { run.hp -= taken; say(`${traps.length} trap(s) in ${room.id} \u2014 ${taken} damage.`, 'trap'); }
    else say(`Stepped clear of ${traps.length} trap(s) in ${room.id}.`, 'trap');
  }

  // ---- 5. loot -----------------------------------------------------------
  const loot = run.looted.has(room.id) ? [] : room.loot;
  if (loot.length && run.hp > 0 && (answers.take_loot?.noul ?? 0) > 0.5) {
    const gold = loot.reduce((s2, l) => s2 + (l.gold || 0), 0);
    run.gold += gold;
    run.looted.add(room.id);
    xp += Math.floor(gold / 6);
    const hasTreasure = loot.some((l) => l.kind === 'treasure');
    say(`Took ${gold} gold in ${room.id}${hasTreasure ? ' \u2014 a treasure hoard' : ''}.`, 'loot');
  }

  // ---- 6. experience -----------------------------------------------------
  if (xp > 0) {
    const before = ch.level;
    grantXp(ch, xp, 'the chamber');
    if (ch.level > before) {
      run.maxHp = ch.maxHp;
      say(`${ch.name} reached level ${ch.level}.`, 'level');
    }
  }

  // ---- 7. death ----------------------------------------------------------
  if (run.hp <= 0) {
    run.hp = 0;
    run.status = 'dead';
    say(`${ch.name} died in chamber ${room.id} at depth ${room.depth}, carrying ${run.gold} gold.`, 'death');
    recordJournal(run, { ...journalStart, answers });
    run.tick += 1;
    return { events, usedFallback: false, withdrawing };
  }

  // ---- 8. move -----------------------------------------------------------
  let usedFallback = false;
  if (!movedByRope) {
    let option = answers.move?.choice ?? 'hold';
    const conf = answers.move?.confidence ?? 1;

    if (conf < moveConfidenceGate) {
      option = fallbackMove(world, run, { climbing: withdrawing });
      usedFallback = true;
      say(`move confidence ${conf.toFixed(2)} < ${moveConfidenceGate} \u2014 fell back to the descent rule (${option}).`, 'gate');
    }

    const exits = visibleExits(world, run);
    let chosen = exits.find((x) => x.option === option);

    // WITHDRAW OUTRANKS MOVE. The questions are isolated, so they can
    // disagree: measured against jev-1.13.0, a run at 2 health answered
    // `withdraw` 0.82 and `move` a descent at 0.85 in the same call, and the
    // delver marched down and died. Neither is wrong for the question it was
    // asked; reconciling them is our job, and it is announced in the log.
    if (withdrawing && chosen && chosen.descends > 0) {
      const up = exits.filter((x) => x.descends < 0)
        .sort((x, y) => x.descends - y.descends || x.times_entered - y.times_entered)[0];
      if (up) {
        say(`withdrawing \u2014 climbing out via ${up.option} rather than descending.`, 'gate');
        chosen = up;
        option = up.option;
      }
    }

    if (option === 'hold' || !chosen) {
      if (option !== 'hold') say(`No such exit ${option} \u2014 held position.`, 'gate');
      else say(`Held in chamber ${room.id}.`, 'info');
    } else {
      run.at = chosen.room;
      const fresh = !run.visited.has(chosen.room);
      run.visited.add(chosen.room);
      run.trail.push(chosen.room);
      const next = world.rooms.get(chosen.room);
      if (fresh) grantXp(ch, 1, 'new ground');
      if (next.depth > run.deepest) { grantXp(ch, 2 * (next.depth - run.deepest), 'deeper'); run.deepest = next.depth; }
      const verb = chosen.descends > 0 ? 'descended' : chosen.descends < 0 ? 'climbed' : 'crossed';
      say(`${verb} into chamber ${chosen.room} (depth ${next.depth}).`, 'move');
    }
  }

  if (world.endpoints.includes(run.at) && !run.vaultsSeen?.has?.(run.at)) {
    run.vaultsSeen = run.vaultsSeen || new Set();
    run.vaultsSeen.add(run.at);
    grantXp(ch, 25, 'a vault');
    say(`Reached VAULT chamber ${run.at}.`, 'vault');
  }
  run.maxHp = ch.maxHp;

  // ---- 9. terminal states ------------------------------------------------
  if (run.at === world.entrance && run.tick > 0 && withdrawing && run.visited.size > 1) {
    run.status = 'escaped';
    say(`Climbed out at the entrance with ${run.gold} gold and ${run.hp}/${run.maxHp} health.`, 'escape');
  }

  recordJournal(run, { ...journalStart, answers });
  run.tick += 1;
  return { events, usedFallback, withdrawing };
}

// ------------------------------------------------------------ offline sim ---
/**
 * The offline stand-in, used when no API key is configured so the page is
 * never a dead demo. It produces answers in Jev's exact response shape from
 * plain local heuristics.
 *
 * It is NOT Jev and must never be presented as Jev: every answer it makes is
 * stamped `source: 'offline'`, and the UI labels the whole run accordingly.
 */
export function offlineAnswers(world, run) {
  const here = world.rooms.get(run.at);
  const exits = visibleExits(world, run);
  const sit = situation(world, run);
  const ch = run.char;
  const hpFrac = run.hp / run.maxHp;

  const threat = sit.creatures.reduce((s, a) => s + bite(a.type), 0)
    + sit.traps.reduce((s, t) => s + t.dmg, 0);
  const rawScore = threat === 0 ? 0 : threat <= 2 ? 1 : threat <= 5 ? 2 : 3;
  const score = Math.min(3, rawScore + (hpFrac < 0.34 ? 1 : 0));

  const withdraw = hpFrac < 0.4 ? 0.88 : hpFrac < 0.6 ? 0.42 : 0.08;
  const climbing = withdraw > 0.5;
  const pick = fallbackMove(world, run, { climbing });

  const probabilities = {};
  const opts = [...exits.map((x) => x.option), 'hold'];
  const lead = opts.length === 1 ? 1 : 0.62;
  for (const o of opts) probabilities[o] = Number(((o === pick ? lead : (1 - lead) / (opts.length - 1)) || 0).toFixed(3));

  const scoreProbs = Object.fromEntries([0, 1, 2, 3].map((i) => [String(i), i === score ? 0.7 : 0.1]));

  // The stand-in answers EVERY question that was asked, including the ones
  // whose option sets change tick to tick — it picks from the live set rather
  // than from a hard-coded list, or it would start naming illegal options the
  // moment the inventory changed.
  const qs = buildQuestions(world, run);
  const chooseFrom = (q, prefer) => {
    const keys = Object.keys(q.criteria);
    const hit = prefer.find((k) => keys.includes(k));
    return hit || keys[0];
  };
  const dist = (q, picked) => {
    const keys = Object.keys(q.criteria);
    const lead2 = keys.length === 1 ? 1 : 0.6;
    return Object.fromEntries(keys.map((k) => [k, Number((k === picked ? lead2 : (1 - lead2) / (keys.length - 1)).toFixed(3))]));
  };

  // crude but legible policy: shoot the tough, melee the weak, avoid when hurt
  const toughest = [...sit.creatures].sort((a, b) => b.hp - a.hp)[0];
  const engagePick = !qs.engage ? null
    : (toughest.hp >= 3 && ch.inventory.arrow > 0) ? chooseFrom(qs.engage, ['shoot', 'melee', 'avoid'])
      : hpFrac > 0.5 && threat <= 4 ? chooseFrom(qs.engage, ['melee', 'avoid'])
        : chooseFrom(qs.engage, ['avoid', 'melee']);

  const usableNow = usableItems(ch, sit);
  const itemPick = !qs.use_item ? null
    : (hpFrac < 0.45 && usableNow.includes('potion')) ? 'potion'
      : (sit.traps.length >= 2 && usableNow.includes('ward')) ? 'ward'
        : (usableNow.includes('arrow') && toughest && toughest.hp >= 3 && hpFrac < 0.7) ? 'arrow'
          : 'none';

  // Answer EXACTLY the questions that were asked — engage, use_item and
  // level_up are conditional, so a stand-in that always emits all three would
  // be answering questions nobody asked.
  const answers = {
    move: { type: 'choice', choice: pick, probabilities, confidence: Number(lead.toFixed(2)) },
    danger: {
      type: 'score',
      score: Object.entries(scoreProbs).reduce((acc, [i, p]) => acc + Number(i) * p, 0),
      legend: Object.fromEntries([0, 1, 2, 3].map((i) => [String(i), `level ${i}`])),
      probabilities: scoreProbs,
      confidence: 0.7,
    },
    take_loot: { type: 'noul', noul: sit.loot.length && (hpFrac > 0.45 || run.gold === 0) ? 0.85 : 0.25 },
    withdraw: { type: 'noul', noul: withdraw },
  };

  if (qs.engage) {
    answers.engage = {
      type: 'choice', choice: engagePick,
      probabilities: dist(qs.engage, engagePick), confidence: 0.66,
    };
  }
  if (qs.use_item) {
    answers.use_item = {
      type: 'choice', choice: itemPick,
      probabilities: dist(qs.use_item, itemPick), confidence: 0.7,
    };
  }
  if (qs.level_up) {
    // Spend on what is actually short, then climb the tree, and only fall
    // back to Toughness when nothing else is left. Taking Toughness six times
    // is what the naive "first in the list" policy did, and it made the skill
    // tree look decorative.
    const short = Object.entries(ch.inventory).sort((a, b) => a[1] - b[1])[0][0];
    const restock = { potion: ['alchemy', 'second_wind'], arrow: ['marksman', 'fletcher'],
      ward: ['trapsense'], rope: ['climber'] }[short] || [];
    const untaken = Object.keys(qs.level_up.criteria)
      .filter((k) => k !== 'toughness' && !ch.skills.includes(k));
    const skillPick = chooseFrom(qs.level_up, [...restock, ...untaken, 'butcher', 'toughness']);
    answers.level_up = {
      type: 'choice', choice: skillPick,
      probabilities: dist(qs.level_up, skillPick), confidence: 0.6,
    };
  }

  return { source: 'offline', model: 'offline-stand-in', answers, usage: { input_tokens: 0, output_tokens: 0 } };
}

// ----------------------------------------------------------------- report ---
export function runSummary(world, run) {
  return {
    status: run.status,
    ticks: run.tick,
    level: run.char.level,
    xp: run.char.xp,
    skills: run.char.skills.map((id) => SKILLS[id].label),
    kills: run.kills,
    items_used: { ...run.itemsUsed },
    inventory: { ...run.char.inventory },
    health: run.hp,
    max_health: run.maxHp,
    gold: run.gold,
    gold_on_floor: world.goldOnFloor,
    rooms_visited: run.visited.size,
    rooms_total: world.rooms.size,
    deepest_depth: run.deepest,
    max_depth: world.maxDepth,
    vaults_reached: world.endpoints.filter((id) => run.visited.has(id)).length,
    vaults_total: world.endpoints.length,
  };
}
