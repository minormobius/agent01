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

export const DELVE_VERSION = 1;

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
export function newRun(world, { maxHp = 12, seed = 1 } = {}) {
  const run = {
    at: world.entrance,
    hp: maxHp,
    maxHp,
    gold: 0,
    tick: 0,
    status: 'delving', // delving | escaped | dead | stranded
    visited: new Set([world.entrance]),
    cleared: new Set(), // rooms whose agents are dead
    looted: new Set(), // rooms whose loot is taken
    sprung: new Set(), // rooms whose traps already fired
    deepest: world.rooms.get(world.entrance)?.depth ?? 0,
    log: [],
    rand: rng(seed),
    trail: [world.entrance],
  };
  return run;
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

  return {
    delver: {
      health: run.hp,
      max_health: run.maxHp,
      health_fraction: Number((run.hp / run.maxHp).toFixed(2)),
      gold_carried: run.gold,
      ticks_elapsed: run.tick,
      rooms_visited: run.visited.size,
      deepest_depth_reached: run.deepest,
    },
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
      already_visited: run.trail.filter((id) => id === here.id).length > 1,
    },
    available_exits: visibleExits(world, run),
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
  // THE WORDING IS LOAD-BEARING, and this was measured rather than guessed.
  // An earlier version described an explored neighbour as "Already explored:
  // 0 creature(s) and 0 loot pile(s) left there" and an unexplored one as
  // "Unexplored — its contents are unknown". That reads as safe-vs-risky, so
  // the delver kept retreating into picked-clean rooms and oscillated between
  // two chambers forever. Nothing told it that going back made no progress.
  //
  // Same model, same state, only these strings rewritten (16 turns, seed 7):
  //   deepest depth 5 -> 11 · unique chambers 6 -> 13 · vaults 0 -> 1
  //   confidence-gate firings 7 -> 1 · mean move confidence 0.48 -> 0.84
  //
  // That confidence jump is the real lesson: the low confidence was not the
  // model being weak, it was the model correctly reporting that the question
  // was ambiguous. Every option now says whether it moves TOWARD or AWAY from
  // the objective, a revisit is named as a revisit, and "nothing left there"
  // is given as a reason NOT to go rather than as reassurance.
  const moveCriteria = {};
  for (const x of exits) {
    const isVault = world.endpoints.includes(x.room);
    let desc;
    if (x.descends > 0) desc = `Goes DOWN ${x.descends} level(s), toward the vaults.`;
    else if (x.descends < 0) desc = `Goes BACK UP ${-x.descends} level(s), away from the vaults.`;
    else desc = 'Stays on this level; no progress downward.';

    if (isVault) {
      desc += ' THIS IS A VAULT CHAMBER — the objective itself.';
    } else if (x.times_entered > 0) {
      desc += ` The delver has already been in chamber ${x.room} ${x.times_entered} time(s);`
        + ` it is picked clean (${x.known?.creatures_left ?? 0} creature(s),`
        + ` ${x.known?.loot_left ?? 0} loot left) and holds nothing further.`
        + ' Going back there repeats ground already covered.';
    } else {
      desc += ` Chamber ${x.room} has NOT been entered yet. Unexplored chambers are the only ones`
        + ' that still hold loot, and the only route to a vault.';
    }
    moveCriteria[x.option] = desc;
  }
  moveCriteria.hold = 'Stand still and do nothing this turn. Makes no progress and gains nothing;'
    + ' only sensible if every door is worse than wasting the turn.';

  return {
    // Which door. One option per real exit, plus hold.
    move: {
      type: 'choice',
      instructions:
        `The delver is in chamber ${here.id} at depth ${here.depth} of ${world.maxDepth}, on `
        + `${run.hp} of ${run.maxHp} health. The objective is to reach a VAULT chamber, which lies `
        + 'deep. Progress means descending into chambers not yet entered; retreating to a chamber '
        + 'already stripped makes no progress. Retreat only if the health cost of going on is '
        + 'likely fatal. Which option best serves the objective right now?',
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
    // Fight or slip past.
    fight: {
      type: 'noul',
      instructions: 'Should the delver attack the creatures in this chamber rather than avoid them?',
      criteria: {
        true: 'Attacking is worth it — they are weak enough, or they block the way and must be cleared.',
        false: 'Avoid them — too costly at this health, or simply not worth the wounds.',
      },
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
  const withdrawing = (answers.withdraw?.noul ?? 0) > 0.5;

  // ---- 1. fight or avoid -------------------------------------------------
  const hostiles = run.cleared.has(here.id) ? [] : here.agents;
  if (hostiles.length) {
    if ((answers.fight?.noul ?? 0) > 0.5) {
      const dmg = hostiles.reduce((s, a) => s + bite(a.type), 0);
      // Fighting well takes less: a clean read of the room halves the bite.
      const taken = Math.max(1, Math.round(dmg * (run.rand() < 0.5 ? 0.5 : 1)));
      run.hp -= taken;
      run.cleared.add(here.id);
      say(`Fought ${hostiles.length} creature(s) in ${here.id} — cleared, took ${taken} damage.`, 'fight');
    } else {
      // Slipping past is cheaper but not free.
      const taken = run.rand() < 0.45 ? 1 : 0;
      if (taken) {
        run.hp -= taken;
        say(`Slipped past ${hostiles.length} creature(s) in ${here.id} — clipped for ${taken}.`, 'evade');
      } else {
        say(`Slipped past ${hostiles.length} creature(s) in ${here.id} untouched.`, 'evade');
      }
    }
  }

  // ---- 2. traps ----------------------------------------------------------
  const traps = run.sprung.has(here.id) ? [] : here.traps;
  if (traps.length && run.hp > 0) {
    // A high danger read means the delver is moving carefully: fewer traps bite.
    const dangerScore = answers.danger?.score ?? 0;
    const wary = dangerScore >= 2 ? 0.35 : 0.7;
    let taken = 0;
    for (const t of traps) if (run.rand() < wary) taken += t.dmg;
    run.sprung.add(here.id);
    if (taken) {
      run.hp -= taken;
      say(`${traps.length} trap(s) in ${here.id} — ${taken} damage.`, 'trap');
    } else if (traps.length) {
      say(`Stepped clear of ${traps.length} trap(s) in ${here.id}.`, 'trap');
    }
  }

  // ---- 3. loot -----------------------------------------------------------
  const loot = run.looted.has(here.id) ? [] : here.loot;
  if (loot.length && run.hp > 0 && (answers.take_loot?.noul ?? 0) > 0.5) {
    const gold = loot.reduce((s, l) => s + (l.gold || 0), 0);
    run.gold += gold;
    run.looted.add(here.id);
    const hasTreasure = loot.some((l) => l.kind === 'treasure');
    say(`Took ${gold} gold in ${here.id}${hasTreasure ? ' — a treasure hoard' : ''}.`, 'loot');
  }

  // ---- 4. death check before moving -------------------------------------
  if (run.hp <= 0) {
    run.hp = 0;
    run.status = 'dead';
    say(`The delver died in chamber ${here.id} at depth ${here.depth}, carrying ${run.gold} gold.`, 'death');
    run.tick += 1;
    return { events, usedFallback: false, withdrawing };
  }

  // ---- 5. move -----------------------------------------------------------
  let option = answers.move?.choice ?? 'hold';
  const conf = answers.move?.confidence ?? 1;
  let usedFallback = false;

  // Confidence-gated routing: below the gate we do not act on the model's
  // pick, we fall back to the deterministic descent rule.
  if (conf < moveConfidenceGate) {
    option = fallbackMove(world, run, { climbing: withdrawing });
    usedFallback = true;
    say(`move confidence ${conf.toFixed(2)} < ${moveConfidenceGate} — fell back to the descent rule (${option}).`, 'gate');
  }

  const exits = visibleExits(world, run);
  let chosen = exits.find((x) => x.option === option);

  // WITHDRAW OUTRANKS MOVE, and this is a composition rule the caller has to
  // make — not something the model does for you.
  //
  // The five questions are evaluated in parallel and IN ISOLATION, so they can
  // disagree: measured against jev-1.13.0, a run at 2 health answered
  // `withdraw` 0.82 (yes, turn back) and `move` to_41 with 0.85 confidence
  // (descend) in the same call, and the delver marched down and died. Neither
  // answer is wrong — `move` was asked which door best serves the objective,
  // `withdraw` was asked whether to abandon it. Reconciling them is our job.
  //
  // The rule: `withdraw` is the strategic call and wins over the tactical one.
  // If the delver is withdrawing and the picked door goes deeper, take the
  // best ascending door instead — and say so in the log, the same way the
  // confidence gate announces itself. Nothing is hidden from the viewer.
  if (withdrawing && chosen && chosen.descends > 0) {
    const up = exits
      .filter((x) => x.descends < 0)
      .sort((a, b) => a.descends - b.descends || a.times_entered - b.times_entered)[0];
    if (up) {
      say(`withdraw ${(answers.withdraw?.noul ?? 0).toFixed(2)} outranks move — climbing out via ${up.option} instead of descending.`, 'gate');
      chosen = up;
      option = up.option;
    }
  }

  if (option === 'hold' || !chosen) {
    if (option !== 'hold') say(`No such exit ${option} — held position.`, 'gate');
    else say(`Held in chamber ${here.id}.`, 'info');
  } else {
    run.at = chosen.room;
    run.visited.add(chosen.room);
    run.trail.push(chosen.room);
    const next = world.rooms.get(chosen.room);
    run.deepest = Math.max(run.deepest, next.depth);
    const verb = chosen.descends > 0 ? 'descended' : chosen.descends < 0 ? 'climbed' : 'crossed';
    say(`${verb} into chamber ${chosen.room} (depth ${next.depth}).`, 'move');

    if (world.endpoints.includes(chosen.room)) {
      say(`Reached VAULT chamber ${chosen.room}.`, 'vault');
    }
  }

  // ---- 6. terminal states ------------------------------------------------
  if (run.at === world.entrance && run.tick > 0 && (withdrawing || run.gold > 0) && run.visited.size > 1) {
    // Back at the mouth of the dungeon with something to show for it.
    if (withdrawing) {
      run.status = 'escaped';
      say(`Climbed out at the entrance with ${run.gold} gold and ${run.hp}/${run.maxHp} health.`, 'escape');
    }
  }

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
  const hostiles = run.cleared.has(here.id) ? [] : here.agents;
  const traps = run.sprung.has(here.id) ? [] : here.traps;
  const loot = run.looted.has(here.id) ? [] : here.loot;
  const hpFrac = run.hp / run.maxHp;

  const threat = hostiles.reduce((s, a) => s + bite(a.type), 0) + traps.reduce((s, t) => s + t.dmg, 0);
  const rawScore = threat === 0 ? 0 : threat <= 2 ? 1 : threat <= 5 ? 2 : 3;
  const score = Math.min(3, rawScore + (hpFrac < 0.34 ? 1 : 0));

  const withdraw = hpFrac < 0.4 ? 0.88 : hpFrac < 0.6 ? 0.42 : 0.08;
  const climbing = withdraw > 0.5;
  const pick = fallbackMove(world, run, { climbing });

  // A plausible distribution concentrated on the pick.
  const probabilities = {};
  const opts = [...exits.map((x) => x.option), 'hold'];
  const lead = opts.length === 1 ? 1 : 0.62;
  for (const o of opts) probabilities[o] = Number(((o === pick ? lead : (1 - lead) / (opts.length - 1)) || 0).toFixed(3));

  // MEASURED, not assumed: the live API returns score `probabilities` as an
  // OBJECT keyed by level index ({"0":0,"1":0.98,"2":0.02}), not the array the
  // published example shows. The stand-in mirrors the real shape so offline
  // mode is a faithful mock. `score` itself is the expectation over that
  // distribution — Σ i·p_i — which the live responses confirm exactly.
  const scoreProbs = Object.fromEntries([0, 1, 2, 3].map((i) => [String(i), i === score ? 0.7 : 0.1]));

  return {
    source: 'offline',
    model: 'offline-stand-in',
    answers: {
      move: { type: 'choice', choice: pick, probabilities, confidence: Number(lead.toFixed(2)) },
      danger: {
        type: 'score',
        score: Object.entries(scoreProbs).reduce((acc, [i, p]) => acc + Number(i) * p, 0),
        legend: Object.fromEntries([0, 1, 2, 3].map((i) => [String(i), `level ${i}`])),
        probabilities: scoreProbs,
        confidence: 0.7,
      },
      fight: { type: 'noul', noul: hostiles.length && threat <= 3 && hpFrac > 0.5 ? 0.8 : 0.2 },
      take_loot: { type: 'noul', noul: loot.length && (hpFrac > 0.45 || run.gold === 0) ? 0.85 : 0.25 },
      withdraw: { type: 'noul', noul: withdraw },
    },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

// ----------------------------------------------------------------- report ---
export function runSummary(world, run) {
  return {
    status: run.status,
    ticks: run.tick,
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
