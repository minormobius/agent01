// craft/mind.mjs — LAYER 3: what Jev sees, what it is asked, what its answer does.
//
// Jev never sees a voxel. perceive() hands it computed facts — time to dusk,
// threats and their distance, what is in sight and how far, where the tech
// ladder stands and what the next rung is short of — and options() turns the
// palette's LEGAL macros into concrete choices, each carrying what it would
// advance, roughly how long it takes, and what it risks. The caller computes;
// the model decides (../CLAUDE.md, "compute first, then ask").
//
// One call per decision, at every macro boundary and every interrupt:
//   next    choice  — which activity now (the only answer that acts)
//   danger  score   — how dangerous the player's situation is (telemetry)
//   have    noul    — the self-check: does the state contain what this needs?
//                     (recorded, never gated on — in a sequential loop it was
//                     measured to stick at "no", see "Composition" in CLAUDE.md)
// Below GATE confidence on `next`, the baseline's pick is used instead and the
// stream says so. Nothing here pretends: every decision is stamped with the
// source that produced it — typesafe, offline stand-in, random, or baseline.

import { PALETTE, legalMacros, shortfall, visible, visiblePigs, atHome, describeShort } from './macros.mjs';
import { baselinePolicy, Driver, MILESTONES } from './runner.mjs';
import { DAY, NIGHT_START } from './sim.mjs';
import { B, BUILDING, RECIPES } from './world.mjs';

export const GATE = 0.45;

// the ladder, in order — "progress" is how far up it the player is
export const GOALS = [
  ['wooden_pickaxe', (s) => s.has('wooden_pickaxe') || s.pickTier() >= 1],
  ['stone_pickaxe', (s) => s.pickTier() >= 2],
  ['stone_sword', (s) => s.has('stone_sword') || s.has('iron_sword')],
  ['torches', (s) => s.has('torch', 4) || !!s._lit],
  ['iron_pickaxe', (s) => s.pickTier() >= 3],
  ['house', (s) => !!s._house],
  ['lit_grounds', (s) => !!s._lit],
  // past the ladder there must still be somewhere to go, or every option
  // reads "advances nothing" and the answer is a coin toss (measured: the
  // first live run spread to ~0.2 confidence exactly there)
  ['iron_sword', (s) => s.has('iron_sword')],
  ['explored', (s) => s.seenCount / s.N >= 0.8],
];
// what each rung is made of, for the short-of lines
const GOAL_ITEM = { wooden_pickaxe: 'wooden_pickaxe', stone_pickaxe: 'stone_pickaxe', stone_sword: 'stone_sword', torches: 'torch', iron_pickaxe: 'iron_pickaxe', iron_sword: 'iron_sword' };

const clock = (t) => {
  const ph = t % DAY, mins = Math.floor((ph / DAY) * 24 * 60 + 6 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
const blocksHeld = (s) => BUILDING.reduce((n, k) => n + (s.inv[k] || 0), 0);
const tier = (s) => ['none', 'wooden', 'stone', 'iron'][s.pickTier()];
const about = (d) => Math.round(d * 1.3);           // tiles → walking ticks, roughly

// --------------------------------------------------------------- perceive ---
export function perceive(sim) {
  const p = sim.player, t = sim.tick, ph = t % DAY, night = ph >= NIGHT_START;
  const zs = [...sim.ents.values()].filter((e) => e.kind === 'zombie' && sim.dist(e.c, p.c) <= 16)
    .sort((a, b) => sim.dist(a.c, p.c) - sim.dist(b.c, p.c));
  const near = (ids) => { const v = visible(sim, ids, 30); return v.length ? { in_sight: v.length, nearest_tiles: Math.round(sim.dist(v[0][0], p.c)) } : { in_sight: 0 }; };
  const pigs = visiblePigs(sim, 30).sort((a, b) => sim.dist(a.c, p.c) - sim.dist(b.c, p.c));
  const reached = GOALS.filter(([, f]) => f(sim)).map(([g]) => g);
  const open = GOALS.filter(([, f]) => !f(sim)).slice(0, 2).map(([g]) => {
    if (g === 'house') return { goal: g, needs: `about 60 building blocks (holding ${blocksHeld(sim)}) and 2 doors (6 planks)` };
    if (g === 'lit_grounds') return { goal: g, needs: 'a house, then 4 torches' };
    if (g === 'explored') return { goal: g, needs: `see 80% of the island (seen ${Math.round(100 * sim.seenCount / sim.N)}%)` };
    const sh = shortfall(sim, GOAL_ITEM[g], g === 'torches' ? 4 : 1);
    return { goal: g, short_of: Object.keys(sh).length ? describeShort(sh) : 'nothing — can be crafted now' };
  });
  const underSky = sim.skyOpen(p.c, p.y + 2);
  return {
    objective: {
      aim: 'Thrive on this island: climb the tech ladder (wood, stone, iron), build a house before night, stay fed, do not die, and explore.',
      rules: [
        'Zombies spawn at night on open ground away from torches, and only hurt you if they reach you.',
        'A house (or a dug-in hole) keeps zombies out; the house is also where you respawn.',
        'Food drops by 1 every 480 ticks; at 0 you lose health, at 18+ you heal.',
        'An activity runs until it finishes or something interrupts it — then you choose again.',
      ],
    },
    time: {
      day: Math.floor(t / DAY) + 1, clock: clock(t), phase: night ? 'NIGHT' : 'day',
      ...(night ? { ticks_until_dawn: DAY - ph } : { ticks_until_dusk: NIGHT_START - ph }),
    },
    player: {
      health: `${p.hp}/20`, food: `${p.food}/20`,
      where: atHome(sim) ? 'inside the house' : underSky ? 'outside, under open sky' : 'underground or covered',
      depth_below_surface: Math.max(0, sim.surface(p.c) - p.y),
      pickaxe: tier(sim), sword: sim.has('iron_sword') ? 'iron' : sim.has('stone_sword') ? 'stone' : sim.has('wooden_sword') ? 'wooden' : 'none',
      home: sim.home ? { exists: true, walk_ticks_about: about(sim.dist(sim.home[0], p.c)), is_house: !!sim._house } : { exists: false },
    },
    inventory: { ...sim.inv },
    threats: zs.slice(0, 4).map((z) => ({ kind: 'zombie', tiles_away: Math.round(sim.dist(z.c, p.c)), touching: sim.adjacentTo(p, z) })),
    in_sight: {
      trees: near([B.log]), coal: near([B.coal_ore]), iron: near([B.iron_ore]), sand: near([B.sand]),
      pigs: pigs.length ? { in_sight: pigs.length, nearest_tiles: Math.round(sim.dist(pigs[0].c, p.c)) } : { in_sight: 0 },
    },
    progress: { reached: reached.length ? reached : ['nothing yet'], next: open },
    explored: `${Math.round(100 * sim.seenCount / sim.N)}% of the island`,
    recent: (sim._journal || []).slice(-6),
  };
}

// ---------------------------------------------------------------- options ---
// Concrete choices: a macro with its arguments, and the facts that decide it.
// `advances` is computed against the ladder, so the model compares written
// consequences instead of inferring them.
const USEFUL_CRAFTS = ['wooden_pickaxe', 'stone_pickaxe', 'stone_sword', 'iron_pickaxe', 'iron_sword', 'torch', 'door', 'glass', 'cooked_porkchop', 'furnace'];

export function options(sim) {
  const p = sim.player, night = sim.isNight(), inside = !sim.skyOpen(p.c, p.y + 2);
  const goalsOpen = GOALS.filter(([, f]) => !f(sim)).map(([g]) => g);
  const nextGoal = goalsOpen[0] || 'none — the ladder is climbed';
  const out = [];
  const add = (id, name, args, facts) => {
    const m = PALETTE[name];
    const leaves = !['craft', 'eat', 'fight', 'sleep_until_dawn', 'dig_in', 'set_home', 'surface'].includes(name) && !(name === 'go_home');
    // the option carries its own last failure. A fact in the journal is not
    // a fact on the option being chosen — the dungeon's rope lesson.
    const last = sim._outcomes && sim._outcomes[id];
    if (last && last.ok && last.ticks === 0 && sim.tick - last.tick < 50) return;   // it just did nothing: not a real option now
    // it just FAILED from this very spot: it would fail the same way again. A
    // label saying so was not enough — measured: 323 consecutive picks of an
    // option carrying "FAILED … would block the door". Traps are not offered.
    if (last && !last.ok && last.c === p.c && last.y === p.y && sim.tick - last.tick < 300 && sameInv(last.inv, sim.inv)) return;
    const failed = last && !last.ok && sim.tick - last.tick < 2400
      ? { last_tried: `FAILED ${sim.tick - last.tick} ticks ago, after spending ${last.ticks} ticks: ${last.why}` } : {};
    out.push({ id, name, args, criteria: {
      activity: m.doc, mode: m.mode, ...facts, ...failed,
      ...(night && leaves ? { at_night: 'goes out among zombies' } : {}),
    } });
  };
  const legal = new Set(legalMacros(sim));
  // every quantity asks for MORE than is held: a macro whose target is already
  // met finishes at once, "ok", having done nothing — and gets picked again
  const cob = sim.inv.cobblestone || 0;
  if (legal.has('mine_stone')) add('mine_stone', 'mine_stone', { n: cob + (sim._house ? 16 : Math.max(11, 64 - blocksHeld(sim))) }, {
    yields: 'cobblestone (and any ore on the way)', takes: 'about 100–250 ticks',
    advances: sim.pickTier() < 2 ? 'stone_pickaxe needs 3 cobblestone' : !sim._house ? `a house needs ~60 building blocks, holding ${blocksHeld(sim)}` : 'nothing on the ladder' });
  if (legal.has('mine_coal')) add('mine_coal', 'mine_coal', { n: (sim.inv.coal || 0) + 3 }, {
    yields: 'coal', takes: visible(sim, [B.coal_ore], 20).length ? 'short — coal is in sight' : 'about 100–300 ticks of digging',
    advances: sim.has('torch', 4) ? 'fuel for smelting' : 'torches (coal + stick)' });
  const ironHeld = (sim.inv.iron_ore || 0) + (sim.inv.iron_ingot || 0);
  if (legal.has('mine_iron')) add('mine_iron', 'mine_iron', { iron: ironHeld + 3, coal: (sim.inv.coal || 0) + 2 }, {
    yields: 'iron ore and coal', takes: 'about 150–400 ticks, deep underground',
    advances: sim.pickTier() < 3 ? 'iron_pickaxe needs 3 iron + coal to smelt' : !sim.has('iron_sword') ? 'iron_sword needs 2 iron' : 'stockpile only' });
  if (legal.has('branch_mine')) add('branch_mine', 'branch_mine', { length: 14 }, { yields: 'ore along a tunnel', takes: 'about 60–150 ticks', advances: 'resources, no rung' });
  if (legal.has('surface')) add('surface', 'surface', null, { takes: `about ${Math.max(5, (sim.surface(p.c) - p.y) * 4)} ticks`, advances: 'back to open ground' });
  const seenPct = Math.round(100 * sim.seenCount / sim.N);
  if (legal.has('explore')) add('explore', 'explore', { steps: 40 }, { yields: 'new ground seen', takes: 'about 40 ticks',
    advances: goalsOpen.includes('explored') ? `${goalsOpen[0] === 'explored' ? 'the next rung' : 'a rung'}: explored (seen ${seenPct}% of the 80% needed)` : `island seen: ${seenPct}%` });
  for (const what of ['tree', 'pig', 'coal', 'iron']) {
    const seen = what === 'pig' ? visiblePigs(sim, 20).length : visible(sim, [{ tree: B.log, coal: B.coal_ore, iron: B.iron_ore }[what]], 20).length;
    if (!seen) add(`scout_${what}`, 'scout', { what }, { yields: `finds a ${what}`, takes: 'about 40–200 ticks', advances: `none in sight now` });
  }
  if (legal.has('gather_wood')) add('gather_wood', 'gather_wood', { n: (sim.inv.log || 0) + 4 }, {
    yields: 'logs (→ planks, sticks, tables, doors)', takes: visible(sim, [B.log], 20).length ? 'about 30–60 ticks, trees in sight' : 'longer — no tree in sight',
    advances: !sim.pickTier() ? 'wooden_pickaxe needs wood' : 'planks for doors and sticks' });
  if (legal.has('hunt')) add('hunt', 'hunt', null, { yields: 'porkchops (food)', takes: visiblePigs(sim, 20).length ? 'about 20–60 ticks, pig in sight' : 'longer — no pig in sight', advances: `food ${p.food}/20` });
  if (legal.has('go_home')) {
    const toDusk = NIGHT_START - (sim.tick % DAY), walk = about(sim.dist(sim.home[0], p.c));
    add('go_home', 'go_home', null, { takes: `about ${walk} ticks`,
      advances: night ? 'safety: it is night' : toDusk < walk + 200 ? `safety: dusk in ${toDusk} ticks` : `nothing yet: night is ${toDusk} ticks away, and the walk takes about ${walk}` });
  }
  for (const item of USEFUL_CRAFTS) {
    if (Object.keys(shortfall(sim, item, (sim.inv[item] || 0) + (item === 'torch' ? 4 : 1))).length) continue;
    if (item.endsWith('pickaxe') && (sim.inv[item] || sim.pickTier() >= { wooden_pickaxe: 1, stone_pickaxe: 2, iron_pickaxe: 3 }[item])) continue;
    if (item.endsWith('sword') && (sim.inv[item] || sim.has('iron_sword'))) continue;
    if ((item === 'door' && sim.has('door', 2)) || (item === 'furnace' && sim.has('furnace'))) continue;
    if (item === 'glass' && sim.has('glass', 4)) continue;
    const goal = item === 'torch' ? 'torches' : item;
    add(`craft_${item}`, 'craft', { item, n: (sim.inv[item] || 0) + (item === 'torch' ? 4 : 1) }, {
      yields: item.replace(/_/g, ' '), takes: 'short (under 20 ticks)',
      advances: goal === nextGoal ? `completes the next rung: ${goal}` : goalsOpen.includes(goal) ? `a rung: ${goal}` : item === 'door' && !sim._house ? 'the house needs 2 doors' : 'not on the ladder',
    });
  }
  if (legal.has('build_house')) add('build_house', 'build_house', null, {
    yields: 'a sealed, roofed, lit house with a door — home and respawn point', takes: 'about 80–200 ticks',
    advances: 'the house rung', uses: `~60 building blocks (holding ${blocksHeld(sim)})` });
  if (legal.has('light_area')) add('light_area', 'light_area', { n: 4 }, { yields: 'torches around home', takes: 'about 40–100 ticks', advances: sim._house && !sim._lit ? 'the lit_grounds rung' : 'fewer zombies nearby' });
  if (legal.has('dig_in')) add('dig_in', 'dig_in', null, { yields: 'a one-block emergency shelter', takes: 'about 10 ticks', advances: 'safety, right here' });
  if (legal.has('sleep_until_dawn')) add('sleep_until_dawn', 'sleep_until_dawn', null, { takes: `until dawn (${DAY - (sim.tick % DAY)} ticks)`, advances: inside ? 'safe: you are covered' : 'NOT safe: you are in the open' });
  if (legal.has('eat')) add('eat', 'eat', null, { takes: '4 ticks', advances: `food ${p.food}/20` });
  if (legal.has('fight')) add('fight', 'fight', null, { takes: 'a few ticks per hit', advances: 'a zombie is touching you' });
  return out;
}

// -------------------------------------------------------------- questions ---
export function buildQuestions(sim, opts) {
  const criteria = {};
  for (const o of opts) criteria[o.id] = o.criteria;
  return {
    next: {
      type: 'choice',
      instructions: {
        task: 'Choose what the player does next.',
        how: 'Each option lists what it yields, how long it takes, and what it advances. Prefer the option that best serves the aim given the time of day, health, food and threats.',
      },
      criteria,
    },
    danger: {
      type: 'score',
      instructions: 'How dangerous is the player\'s situation right now?',
      criteria: [
        'safe — sheltered, or daytime with no threat near',
        'watchful — night is coming or a threat is in the area',
        'exposed — out in the open at night, or low on health or food',
        'critical — being attacked, or about to die',
      ],
    },
    have: {
      type: 'noul',
      instructions: 'Does the state contain the information needed to decide what the player should do next?',
      criteria: { true: 'yes, the facts that decide it are in the state', false: 'no, something that decides it is missing' },
    },
  };
}

// ------------------------------------------------------ the three deciders --
// Each takes (sim, opts, questions) and returns an answers object in Jev's
// response shape, stamped with its source.

// the scripted baseline, expressed as an answer over the SAME option set
export function baselineAnswer(sim, opts) {
  const pick = baselinePolicy(sim);
  const hit = pick && opts.find((o) => o.name === pick.name && (!o.args || !pick.args || o.args.item === pick.args.item || o.name !== 'craft'));
  return { source: 'baseline', answers: { next: { choice: hit ? hit.id : opts[0]?.id, confidence: 1, probabilities: {} } }, direct: pick };
}
// uniform over the legal options: the control that says whether choosing matters
export function randomAnswer(sim, opts) {
  const o = opts[Math.floor(sim.rng() * opts.length)];
  return { source: 'random', answers: { next: { choice: o.id, confidence: 1 / opts.length, probabilities: {} } } };
}
// a stand-in with Jev's response shape, for the page without a key. It is
// the baseline with fake spread — NOT the model, and stamped so.
export function offlineAnswer(sim, opts) {
  const b = baselineAnswer(sim, opts);
  const probs = {};
  for (const o of opts) probs[o.id] = o.id === b.answers.next.choice ? 0.7 : 0.3 / Math.max(1, opts.length - 1);
  return {
    source: 'offline',
    answers: {
      next: { type: 'choice', choice: b.answers.next.choice, confidence: 0.7, probabilities: probs },
      danger: { type: 'score', score: sim.isNight() ? 1.6 : 0.4, probabilities: {} },
      have: { type: 'noul', noul: 0.8 },
    },
  };
}

// -------------------------------------------------------------- resolve -----
// Turn an answer into a macro pick. Below the gate, the baseline decides and
// the decision says so — the same visible fallback the dungeon uses.
export function resolve(sim, opts, response, { gate = true } = {}) {
  const a = response.answers?.next;
  const opt = a && opts.find((o) => o.id === a.choice);
  const record = {
    tick: sim.tick, source: response.source, choice: a?.choice ?? null,
    confidence: a?.confidence ?? null, danger: response.answers?.danger?.score ?? null, have: response.answers?.have?.noul ?? null,
    options: opts.length,
  };
  let pick = opt ? { name: opt.name, args: opt.args || undefined } : null;
  if (response.source === 'typesafe' && opt && (a.confidence ?? 0) < GATE) record.below_gate = true;
  if (response.source === 'typesafe' && (!opt || (gate && (a.confidence ?? 0) < GATE))) {
    const b = baselinePolicy(sim);
    record.gated = true;
    record.fallback = b ? b.name : null;
    pick = b;
  }
  if (response.source === 'baseline') pick = response.direct;
  return { pick, record };
}

const sameInv = (a, inv) => a === JSON.stringify(inv);
export function remember(sim, id, ended) {
  if (!id) return;
  sim._outcomes = sim._outcomes || {};
  sim._outcomes[id] = { tick: sim.tick, ok: ended.ok, why: ended.why, ticks: ended.ticks, c: sim.player.c, y: sim.player.y, inv: JSON.stringify(sim.inv) };
}

// A journal entry per decision, kept short: the model reads its own last six.
export function journal(sim, record, outcome) {
  sim._journal = sim._journal || [];
  sim._journal.push({
    at: `day ${Math.floor(record.tick / DAY) + 1} ${clock(record.tick)}`,
    chose: record.gated ? `${record.choice} (overridden: ${record.fallback})` : record.choice,
    result: outcome ? (outcome.ok ? 'done' : `failed: ${outcome.why}`) : 'running',
    ticks: outcome?.ticks,
  });
  if (sim._journal.length > 12) sim._journal.shift();
}

// ------------------------------------------------------------ the loop -----
// Play with a decider: at every macro boundary (and after every interrupt)
// build the state and the options, ask, resolve, run the macro. `decide` may
// be async (a real call) or not (baseline / random / offline). The decision
// and its answers go into the stream as a 'jev' note, so a replay shows what
// was chosen and why, not just what happened.
export async function playMind(sim, decide, { maxTicks = DAY, maxDecisions = 2000, onDecision, gate = true, reuse = false } = {}) {
  let lastLive = null;
  const d = new Driver(sim, { policy: () => null });
  const milestones = {}, decisions = [];
  const mark = () => {
    for (const m of MILESTONES) if (!(m in milestones) && (m === 'home' ? sim._house : sim.inv[m] || sim.stats.crafted[m])) milestones[m] = sim.tick;
    for (const [g, f] of GOALS) if (!(`goal:${g}` in milestones) && f(sim)) milestones[`goal:${g}`] = sim.tick;
  };
  let idle = 0;
  while (sim.tick < maxTicks && decisions.length < maxDecisions) {
    const opts = options(sim);
    if (!opts.length) { sim.act({ op: 'wait', ticks: 20 }); continue; }
    let response;
    const again = reuse && reuseRanking(sim, lastLive, opts);
    if (again) {
      lastLive.reused++; lastLive.used.add(again.opt.id);
      response = { source: 'typesafe', reused: true, answers: { next: { choice: again.opt.id, confidence: again.p, probabilities: lastLive.response.answers.next.probabilities } } };
    } else {
      const qs = buildQuestions(sim, opts);
      const state = perceive(sim);
      try { response = await decide(sim, opts, qs, state); }
      catch (e) { response = { ...offlineAnswer(sim, opts), source: 'offline', error: String(e.message || e) }; }
      if (response.source === 'typesafe') lastLive = { tick: sim.tick, response, reused: 0, used: new Set([response.answers?.next?.choice]), interrupted: false };
    }
    const { pick, record } = resolve(sim, opts, response, { gate });
    if (response.error) record.error = response.error;
    if (response.usage) record.tokens = response.usage.input_tokens;
    sim.note('jev', { ...record, pick: pick && pick.name, ...(response.answers?.next?.probabilities ? { top: topK(response.answers.next.probabilities, 3) } : {}) });
    if (!pick) { sim.act({ op: 'wait', ticks: 10 }); continue; }
    d.start(pick.name, pick.args);
    let r;
    for (;;) { r = d.step(); if (r && r.ended) break; }
    journal(sim, record, r.ended);
    remember(sim, record.choice, r.ended);
    record.pick = pick.name;
    if (response.reused) record.reused = true;
    if (lastLive && r.ended.interrupted) lastLive.interrupted = true;
    record.result = r.ended.ok ? 'ok' : r.ended.why;
    record.ticks = r.ended.ticks;
    decisions.push(record);
    onDecision && onDecision(record, r.ended);
    mark();
    idle = r.ended.ticks ? 0 : idle + 1;
    if (idle > 8) { sim.act({ op: 'wait', ticks: 20 }); idle = 0; }       // a decider stuck choosing no-ops still lets time pass
  }
  return { decisions, milestones, stats: sim.stats, tick: sim.tick };
}
const topK = (probs, k) => Object.fromEntries(Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, k).map(([o, p]) => [o, Math.round(p * 100) / 100]));

// the three local deciders as `decide` functions
export const DECIDERS = {
  baseline: (sim, opts) => baselineAnswer(sim, opts),
  random: (sim, opts) => randomAnswer(sim, opts),
  offline: (sim, opts) => offlineAnswer(sim, opts),
};
// the real one, through the mega worker's proxy (the key lives there only)
export function jevDecider(endpoint, { fetchImpl = fetch } = {}) {
  return async (sim, opts, questions, state) => {
    const res = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state, questions }),
    });
    const body = await res.json().catch(() => ({ error: 'unreadable response' }));
    if (!res.ok) { const e = new Error(body.error || `HTTP ${res.status}`); e.status = res.status; e.retryAfter = body.retry_after_s; throw e; }
    return body;      // carries source: 'typesafe', stamped by the worker
  };
}

// ------------------------------------------------------- one call, a plan ---
// A choice answer ranks EVERY option. When the macro it picked ends quickly
// and nothing interrupted, the next-ranked option that is still legal is
// Jev's own preference from moments ago, so use it instead of a new call.
// Bounded: only within REUSE.ticks of the call, at most REUSE.max times,
// never across an interrupt or dusk, never below REUSE.floor probability.
// Stamped source 'typesafe-reused', so the stream says which decisions were
// fresh calls and which were the same call's ranking.
export const REUSE = { ticks: 60, max: 2, floor: 0.08 };
export function reuseRanking(sim, last, opts) {
  if (!last || last.response.source !== 'typesafe' || last.interrupted) return null;
  if (sim.tick - last.tick > REUSE.ticks || last.reused >= REUSE.max) return null;
  if (sim.isNight(last.tick) !== sim.isNight()) return null;
  const probs = last.response.answers?.next?.probabilities;
  if (!probs) return null;
  for (const [id, p] of Object.entries(probs).sort((a, b) => b[1] - a[1])) {
    if (p < REUSE.floor) break;
    if (last.used.has(id)) continue;
    const o = opts.find((x) => x.id === id);
    if (o) return { opt: o, p };
  }
  return null;
}
