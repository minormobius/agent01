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

import { PALETTE, legalMacros, shortfall, visible, visiblePigs, atHome, describeShort, visiblePlants, ripePlots, growingPlots, chestItems, surplus, houseCapacity } from './macros.mjs';
import { projectState, projectFact, projectDue, projectQuestion, setProject, baselineProject, PROJECT_NAMES, PROJECTS } from './projects.mjs';
import { speciesHere, needsFarmland } from './plants.mjs';
import { baselinePolicy, Driver, MILESTONES } from './runner.mjs';
import { DAY, NIGHT_START } from './sim.mjs';
import { B, H, BUILDING, RECIPES, FOOD, SPECIES, slotsUsed, CHEST_SLOTS } from './world.mjs';

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
      aim: 'Thrive in this world: stay fed and alive, and pursue a long-range project — tech (tools, a house, iron), grow (cultivate every plant species here), or explore (see it all). Every activity says what it does for the current project.',
      rules: [
        'Zombies spawn at night on open ground away from torches, and only hurt you if they reach you.',
        'A house (or a dug-in hole) keeps zombies out; the house is also where you respawn.',
        'Food drops by 1 every 480 ticks; at 0 you lose health, at 18+ you heal.',
        'An activity runs until it finishes or something interrupts it — then you choose again.',
        ...(sim.players.length > 1 ? ['You share this world with teammates (see team). What they ask for is listed, and options that answer a request say so.'] : []),
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
    project: projectFacts(sim),
    shared: sharedFacts(sim),
    survival: (() => { const ts = sim.noSurvival ? [] : threats(sim); return ts.length ? { threats: ts.map((t) => t.text) } : { threats: 'none right now' }; })(),
    explored: `${Math.round(100 * sim.seenCount / sim.N)}% of the island`,
    recent: (sim._journal || []).slice(-6),
    ...(sim.players.length > 1 ? { team: teamFacts(sim) } : {}),
  };
}

// ------------------------------------------------------------- survival ---
// Survival is not a project: it is whatever is threatening the player RIGHT
// NOW, and every option says what it does about each threat. Without this the
// options that keep you alive read "not part of the project" and sit at ~0.2
// confidence (measured live, 2026-09-26). Each threat names the options that
// relieve it; an option that goes out among zombies at night worsens that one.
const SHELTER = new Set(['go_home', 'dig_in', 'build_house', 'sleep_in_bed']);
export function threats(sim) {
  const p = sim.player, night = sim.isNight(), out = [];
  const inside = !sim.skyOpen(p.c, p.y + 2) || atHome(sim);
  const zNear = [...sim.ents.values()].filter((e) => e.kind === 'zombie' && sim.dist(e.c, p.c) <= 6).length;
  const adjacent = [...sim.ents.values()].some((e) => e.kind === 'zombie' && sim.adjacentTo(p, e));
  const foodHeld = Object.keys(FOOD).some((k) => sim.has(k));
  if (sim.get(p.c, p.y + 1) === B.water) out.push({ id: 'air', text: `under water: air ${p.air}/60, drowning at 0`, relief: (o) => o.name === 'surface' });
  if (adjacent) out.push({ id: 'zombie', text: 'a zombie is hitting you', relief: (o) => o.name === 'fight' || o.name === 'dig_in' });
  if (night && !inside) out.push({ id: 'night', text: `night, out in the open (${zNear} zombies within 6)`, relief: (o) => SHELTER.has(o.name) || (o.name === 'sleep_until_dawn' && inside), worse: (o) => o.leaves });
  if (p.food <= 6) out.push({ id: 'hunger', text: `food ${p.food}/20${p.food === 0 ? ': starving, losing health' : ''}`,
    relief: (o) => (o.name === 'eat' && foodHeld) || o.name === 'hunt' || (o.name === 'harvest') || (o.name === 'craft' && ['bread', 'cooked_porkchop'].includes(o.args?.item)) || (o.name === 'forage' && o.args?.sp === 'sunfruit') });
  if (p.hp <= 8) out.push({ id: 'health', text: `health ${p.hp}/20${zNear ? `, ${zNear} zombies near` : ''}`,
    relief: (o) => SHELTER.has(o.name) || (o.name === 'eat' && sim.has('moonpetal')) || (o.name === 'sleep_until_dawn' && inside) || (adjacent && o.name === 'fight') });
  return out;
}
function survivalFact(ts, o) {
  if (!ts.length) return null;
  const helps = ts.filter((t) => t.relief(o)).map((t) => t.id), hurts = ts.filter((t) => t.worse && t.worse(o)).map((t) => t.id);
  if (helps.length) return `relieves: ${helps.join(', ')}`;
  if (hurts.length) return `worsens: ${hurts.join(', ')}`;
  return `does nothing about: ${ts.map((t) => t.id).join(', ')}`;
}

// The team's pool, house and beds: what is everyone's
const summarise = (items, k = 8) => Object.fromEntries(Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, k));
function sharedFacts(sim) {
  const box = chestItems(sim), inBed = sim.players.filter((e) => e.bedAt && sim.get(e.bedAt[0], e.bedAt[1]) === B.bed).length;
  return {
    chest: sim.team.chest == null ? 'none yet: a chest (8 planks) at home is the team\'s shared store' : { stacks_used: `${slotsUsed(box)} of ${CHEST_SLOTS}`, holds: Object.keys(box).length ? summarise(box) : 'nothing' },
    house: sim.team.house ? `built, sleeps ${houseCapacity(sim.team.house)} (the team is ${sim.players.length})` : sim._house ? 'built' : 'none yet',
    beds: `${inBed} of ${sim.players.length} players have a bed placed; the night passes only when every player is asleep`,
  };
}

function projectFacts(sim) {
  if (!sim.project) return { current: 'none chosen yet' };
  const st = projectState(sim, sim.project);
  return {
    current: sim.project, aim: PROJECTS[sim.project].aim, progress: `${st.done} of ${st.total} steps done`,
    ...(st.complete ? { status: 'COMPLETE' } : { next_step: st.next ? `${st.next.label} (${st.next.detail(sim)})` : 'nothing to do now but wait' }),
    ...(st.waiting.length ? { waiting_on: st.waiting } : {}),
  };
}

// ------------------------------------------------------------------ team ----
// Teammates, as facts: where they are relative to you, how they are doing,
// what they are busy with, and what they have ASKED for. A request is data in
// the state (there is no instruction channel), so it can only matter through
// the options that answer it — and those say so, computed here.
export const REQUESTS = {
  come: 'come to them', wood: 'bring them wood', food: 'bring them food', stone: 'bring them stone',
  torches: 'bring them torches', defend: 'defend them from zombies',
};
export const REQUEST_TTL = 1600;
const liveRequest = (sim, e) => e.request && sim.tick - e.request.tick < REQUEST_TTL ? e.request : null;
function teamFacts(sim) {
  const me = sim.player;
  return sim.players.filter((e) => e !== me).map((e) => {
    const r = liveRequest(sim, e);
    const zs = [...sim.ents.values()].filter((z) => z.kind === 'zombie' && sim.dist(z.c, e.c) < 8).length;
    return {
      teammate: e.role === 'human' ? `the human player (#${e.id})` : `Jev teammate #${e.id}`,
      tiles_away: Math.round(sim.dist(e.c, me.c)), health: `${e.hp}/20`, food: `${e.food}/20`,
      doing: e.doing || 'standing still', zombies_near_them: zs,
      ...(r ? { request: `${REQUESTS[r.what] || r.what} (asked ${sim.tick - r.tick} ticks ago)` } : {}),
    };
  });
}
// a finished macro may answer a teammate's request: clear it if so
export function fulfil(sim, pick, ended) {
  if (!ended || !ended.ok || !pick || !pick.args || pick.args.to == null) return;
  const e = sim.ents.get(pick.args.to);
  if (!e || !e.request) return;
  const w = e.request.what;
  if ((pick.name === 'follow' && w === 'come') || (pick.name === 'guard' && w === 'defend') || (pick.name === 'give' && pick.args.what === w)) {
    sim.note('request_done', { who: e.id, what: w, by: sim.player.id });
    e.request = null;
  }
}

// What a Jev teammate can ASK for: a typed choice riding in the same batched
// call as its `next` (breadth is free). Every option carries the computed
// facts that would justify it; none of them is an instruction to anyone.
export function askQuestion(sim) {
  const p = sim.player;
  const zs = [...sim.ents.values()].filter((z) => z.kind === 'zombie' && sim.dist(z.c, p.c) < 6).length;
  const foodHeld = Object.keys(FOOD).reduce((n, k) => n + (p.inv[k] || 0), 0);
  const mates = sim.players.filter((e) => e !== p);
  const nearest = mates.length ? Math.round(Math.min(...mates.map((e) => sim.dist(e.c, p.c)))) : null;
  const cur = liveRequest(sim, p);
  const criteria = {
    none: { means: 'ask for nothing: you can manage alone', ...(cur ? { note: `withdraws your standing request (${cur.what})` } : {}) },
    defend: { means: REQUESTS.defend, zombies_within_6: zs, your_health: `${p.hp}/20` },
    food: { means: REQUESTS.food, your_food: `${p.food}/20`, food_carried: foodHeld },
    wood: { means: REQUESTS.wood, wood_carried: (p.inv.log || 0) + (p.inv.planks || 0) },
    stone: { means: REQUESTS.stone, stone_carried: p.inv.cobblestone || 0 },
    torches: { means: REQUESTS.torches, torches_carried: p.inv.torch || 0, night: sim.isNight() },
    come: { means: REQUESTS.come, nearest_teammate_tiles: nearest },
  };
  if (cur) criteria[cur.what] = { ...criteria[cur.what], standing: `you already asked for this ${sim.tick - cur.tick} ticks ago` };
  return {
    type: 'choice',
    instructions: { task: 'Should this agent ask its teammates for help right now, and for what? Teammates see the request in their state and may answer it instead of their own work.' },
    criteria,
  };
}
// set (or clear) a player's request from an ask answer
export function applyAsk(sim, e, choice) {
  if (!choice) return;
  const cur = e.request && e.request.what;
  if (choice === 'none') { if (cur) { e.request = null; sim.note('request', { who: e.id, what: null }); } return; }
  if (!REQUESTS[choice] || choice === cur) return;
  e.request = { what: choice, tick: sim.tick };
  sim.note('request', { who: e.id, what: choice });
}
// the stand-in's rule of thumb for asking
export function offlineAsk(sim) {
  const p = sim.player;
  const zs = [...sim.ents.values()].filter((z) => z.kind === 'zombie' && sim.dist(z.c, p.c) < 4).length;
  const foodHeld = Object.keys(FOOD).reduce((n, k) => n + (p.inv[k] || 0), 0);
  if (zs && p.hp < 12) return 'defend';
  if (p.food < 8 && !foodHeld) return 'food';
  return 'none';
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
  // sim.noProjects: the control arm for measuring what the project facts do
  const pst = sim.project && !sim.noProjects ? projectState(sim, sim.project) : null;
  const ts = sim.noSurvival ? [] : threats(sim);
  const add = (id, name, args, facts, tokens = []) => {
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
    const pf = projectFact(sim, pst, new Set(tokens));
    const sf = survivalFact(ts, { name, args, leaves: night && leaves });
    out.push({ id, name, args, tokens, criteria: {
      activity: m.doc, mode: m.mode, ...facts, ...(sf ? { survival: sf } : {}), ...(pf ? { project: pf } : {}), ...failed,
      ...(night && leaves ? { at_night: 'goes out among zombies' } : {}),
    } });
  };
  const legal = new Set(legalMacros(sim));
  // every quantity asks for MORE than is held: a macro whose target is already
  // met finishes at once, "ok", having done nothing — and gets picked again
  const cob = sim.inv.cobblestone || 0;
  if (legal.has('mine_stone')) add('mine_stone', 'mine_stone', { n: cob + (sim._house ? 16 : Math.max(11, 64 - blocksHeld(sim))) }, {
    yields: 'cobblestone (and any ore on the way)', takes: 'about 100–250 ticks',
    advances: sim.pickTier() < 2 ? 'stone_pickaxe needs 3 cobblestone' : !sim._house ? `a house needs ~60 building blocks, holding ${blocksHeld(sim)}` : 'nothing on the ladder' }, ['cobblestone']);
  if (legal.has('mine_coal')) add('mine_coal', 'mine_coal', { n: (sim.inv.coal || 0) + 3 }, {
    yields: 'coal', takes: visible(sim, [B.coal_ore], 20).length ? 'short — coal is in sight' : 'about 100–300 ticks of digging',
    advances: sim.has('torch', 4) ? 'fuel for smelting' : 'torches (coal + stick)' }, ['coal']);
  const ironHeld = (sim.inv.iron_ore || 0) + (sim.inv.iron_ingot || 0);
  if (legal.has('mine_iron')) add('mine_iron', 'mine_iron', { iron: ironHeld + 3, coal: (sim.inv.coal || 0) + 2 }, {
    yields: 'iron ore and coal', takes: 'about 150–400 ticks, deep underground',
    advances: sim.pickTier() < 3 ? 'iron_pickaxe needs 3 iron + coal to smelt' : !sim.has('iron_sword') ? 'iron_sword needs 2 iron' : 'stockpile only' }, ['iron_ore', 'coal']);
  // the diamond age
  if (legal.has('mine_diamond') && sim.pickTier() < 4 || legal.has('mine_diamond') && (sim.inv.diamond || 0) < 4) add('mine_diamond', 'mine_diamond', { n: 3 }, { yields: 'diamonds (and coal, iron on the way)', takes: 'about 200–600 ticks, down at the bottom layers',
    advances: sim.pickTier() < 4 ? `a diamond pickaxe takes 3 diamonds (holding ${sim.inv.diamond || 0})` : `diamonds held ${sim.inv.diamond || 0}` }, ['diamond']);
  if (legal.has('make_obsidian')) add('make_obsidian', 'make_obsidian', { n: 3 }, { yields: 'obsidian (water poured on lava, then mined)', takes: 'about 60–200 ticks', advances: `obsidian held ${sim.inv.obsidian || 0} (a beacon takes 3)` }, ['make_obsidian', 'obsidian']);
  if (legal.has('place_beacon')) add('place_beacon', 'place_beacon', null, { yields: 'a beacon at home: no zombie spawns within 16', takes: 'about 20–60 ticks', advances: 'the capstone of the tech ladder' }, ['place_beacon', 'craft:beacon']);
  if ((sim.inv.sand || 0) < 5 && !sim.beacons.size && sim.pickTier() >= 4) add('dig_sand', 'dig_sand', { n: (sim.inv.sand || 0) + 5 }, { yields: 'sand (→ glass at a furnace)', takes: 'about 20–80 ticks', advances: 'a beacon takes 5 glass' }, ['sand', 'dig_sand']);
  if (legal.has('branch_mine')) add('branch_mine', 'branch_mine', { length: 14 }, { yields: 'ore along a tunnel', takes: 'about 60–150 ticks', advances: 'resources, no rung' }, ['coal', 'iron_ore', 'cobblestone']);
  if (legal.has('surface')) add('surface', 'surface', null, { takes: `about ${Math.max(5, (sim.surface(p.c) - p.y) * 4)} ticks`, advances: 'back to open ground' });
  const seenPct = Math.round(100 * sim.seenCount / sim.N);
  if (legal.has('explore')) add('explore', 'explore', { steps: 40 }, { yields: 'new ground seen', takes: 'about 40 ticks',
    advances: goalsOpen.includes('explored') ? `${goalsOpen[0] === 'explored' ? 'the next rung' : 'a rung'}: explored (seen ${seenPct}% of the 80% needed)` : `island seen: ${seenPct}%` }, ['explore']);
  for (const what of ['tree', 'pig', 'coal', 'iron']) {
    const seen = what === 'pig' ? visiblePigs(sim, 20).length : visible(sim, [{ tree: B.log, coal: B.coal_ore, iron: B.iron_ore }[what]], 20).length;
    if (!seen) add(`scout_${what}`, 'scout', { what }, { yields: `finds a ${what}`, takes: 'about 40–200 ticks', advances: `none in sight now` }, [`scout:${what}`, ...(what === 'tree' ? ['log'] : what === 'pig' ? ['porkchop'] : [])]);
  }
  // plants: forage what is in sight, look for what is not, farm what we hold seeds for, reap what is ripe
  const here = speciesHere(sim);
  for (const sp of here) {
    const inSight = visiblePlants(sim, sp).length, grown = ((p.grown || {})[sp] || 0) > 0;
    if (inSight) add(`forage_${sp}`, 'forage', { sp, n: 1 }, { yields: `${sp} seeds and ${SPECIES[sp].produce}`, takes: 'about 20–60 ticks, one is in sight',
      advances: sim.has(`${sp}_seeds`) ? `more ${sp} seeds (holding ${sim.inv[`${sp}_seeds`]})` : `the first ${sp} seeds` }, [`forage:${sp}`, `${sp}_seeds`, SPECIES[sp].produce]);
    else if (!grown && !sim.has(`${sp}_seeds`)) add(`scout_${sp}`, 'scout', { what: sp }, { yields: `finds a wild ${sp}`, takes: 'about 40–300 ticks',
      advances: (p.found || {})[sp] ? `${sp} was seen before, not in sight now` : `${sp} not found yet: ${SPECIES[sp].doc}` }, [`scout:${sp}`]);
    if (sim.has(`${sp}_seeds`) && !PALETTE.farm.needs(sim, { sp })) add(`farm_${sp}`, 'farm', { sp, n: 2 }, { yields: `${sp} planted near home`, takes: 'about 20–80 ticks',
      advances: `a ${sp} crop — ${SPECIES[sp].doc}` }, [`farm:${sp}`]);
  }
  // the pool: set it up, fill it, draw on it
  const box = chestItems(sim);
  if (legal.has('set_up_chest')) add('set_up_chest', 'set_up_chest', null, { yields: 'a chest at home: the team\'s shared store (27 stacks)', takes: 'about 20–60 ticks', advances: sim.players.length > 1 ? 'pooling: teammates can store and take' : 'somewhere to keep things' }, ['set_up_chest']);
  if (legal.has('store')) {
    const sp = surplus(sim);
    add('store', 'store', null, { yields: `your surplus into the chest: ${describeShort(sp)}`, takes: `about ${about(sim.dist(Math.floor(sim.team.chest / H), p.c)) + 5} ticks`,
      advances: `the shared pool (${slotsUsed(box)} of ${CHEST_SLOTS} stacks used)` }, ['store', ...Object.keys(sp)]);
  }
  if (sim.team.chest != null) {
    // offer to take what the project's next steps are short of, and what the chest has
    const wanted = new Set();
    if (pst && pst.withNeeds) for (const w of pst.withNeeds.slice(0, 3)) for (const t of w.needs) if (box[t]) wanted.add(t);
    if (!sim._house && BUILDING.some((k) => box[k]) && blocksHeld(sim) < 60) wanted.add(BUILDING.find((k) => box[k]));
    for (const item of [...wanted].slice(0, 4)) add(`take_${item}`, 'take', { item, n: 64 }, { yields: `${Math.min(64, box[item])} ${item.replace(/_/g, ' ')} from the team chest`, takes: `about ${about(sim.dist(Math.floor(sim.team.chest / H), p.c)) + 3} ticks`, advances: `the chest holds ${box[item]}` }, [item]);
  }
  // sheep: wool for beds, mutton for food
  const sheepSeen = visiblePigs(sim, 24, 'sheep').length;
  if (sheepSeen) add('hunt_sheep', 'hunt', { kind: 'sheep' }, { yields: 'wool (beds) and mutton', takes: 'about 20–60 ticks, a sheep is in sight', advances: `wool held ${sim.inv.wool || 0} (a bed takes 3)` }, ['wool', 'mutton', 'hunt:sheep']);
  else if (!sim.has('bed') && !(p.bedAt)) add('scout_sheep', 'scout', { what: 'sheep' }, { yields: 'finds a sheep', takes: 'about 40–200 ticks', advances: 'wool for a bed' }, ['scout:sheep']);
  if (legal.has('sleep_in_bed')) {
    const asleep = sim.players.filter((e) => e.asleep).length, others = sim.players.length - 1;
    add('sleep_in_bed', 'sleep_in_bed', null, { takes: `until dawn (${DAY - (sim.tick % DAY)} ticks)`,
      advances: others ? `the night passes the moment every player is asleep (${asleep} of ${others} teammates are now); otherwise you wait in bed until dawn` : 'the night passes at once: you are the only player' }, ['sleep']);
  }
  if (legal.has('harvest')) {
    const ripe = ripePlots(sim);
    add('harvest', 'harvest', null, { yields: [...new Set(ripe.map((q) => SPECIES[q.sp].produce))].join(', ') + ' and seeds (then replants)', takes: `about ${20 + 15 * ripe.length} ticks`,
      advances: `${ripe.length} ripe plot${ripe.length > 1 ? 's' : ''}` }, ['harvest', ...ripe.map((q) => SPECIES[q.sp].produce)]);
  }
  if (legal.has('gather_wood')) add('gather_wood', 'gather_wood', { n: (sim.inv.log || 0) + 4 }, {
    yields: 'logs (→ planks, sticks, tables, doors)', takes: visible(sim, [B.log], 20).length ? 'about 30–60 ticks, trees in sight' : 'longer — no tree in sight',
    advances: !sim.pickTier() ? 'wooden_pickaxe needs wood' : 'planks for doors and sticks' }, ['log']);
  if (legal.has('hunt')) add('hunt', 'hunt', null, { yields: 'porkchops (food)', takes: visiblePigs(sim, 20).length ? 'about 20–60 ticks, pig in sight' : 'longer — no pig in sight', advances: `food ${p.food}/20` }, ['porkchop']);
  if (legal.has('go_home')) {
    const toDusk = NIGHT_START - (sim.tick % DAY), walk = about(sim.dist(sim.home[0], p.c));
    add('go_home', 'go_home', null, { takes: `about ${walk} ticks`,
      advances: night ? 'safety: it is night' : toDusk < walk + 200 ? `safety: dusk in ${toDusk} ticks` : `nothing yet: night is ${toDusk} ticks away, and the walk takes about ${walk}` });
  }
  const crafts = [...USEFUL_CRAFTS, ...(here.some(needsFarmland) && !sim.has('wooden_hoe') ? ['wooden_hoe'] : []), ...(sim.has('wheat', 3) ? ['bread'] : []), ...(sim.has('glowcap', 2) ? ['lantern'] : []),
    ...(sim.team.chest == null && !sim.has('chest') ? ['chest'] : []), ...(!sim.has('iron_armor') && !sim.has('diamond_armor') ? ['iron_armor'] : []), ...(sim.pickTier() < 4 ? ['diamond_pickaxe'] : []),
    ...(!sim.has('diamond_sword') ? ['diamond_sword'] : []), ...(!sim.has('bucket') && !sim.has('water_bucket') ? ['bucket'] : []), ...(!sim.beacons.size && !sim.has('beacon') ? ['beacon'] : []), ...(!sim.has('diamond_armor') ? ['diamond_armor'] : []), ...(!sim.has('bed') && !p.bedAt ? ['bed'] : []), ...(sim.has('mutton') ? ['cooked_mutton'] : [])];
  for (const item of crafts) {
    if (Object.keys(shortfall(sim, item, (sim.inv[item] || 0) + (item === 'torch' ? 4 : 1))).length) continue;
    if (item.endsWith('pickaxe') && (sim.inv[item] || sim.pickTier() >= { wooden_pickaxe: 1, stone_pickaxe: 2, iron_pickaxe: 3, diamond_pickaxe: 4 }[item])) continue;
    if (item.endsWith('sword') && (sim.inv[item] || sim.has('diamond_sword') || (item !== 'diamond_sword' && sim.has('iron_sword')))) continue;
    if ((item === 'door' && sim.has('door', 2)) || (item === 'furnace' && sim.has('furnace'))) continue;
    if (item === 'glass' && sim.has('glass', 4)) continue;
    const goal = item === 'torch' ? 'torches' : item;
    add(`craft_${item}`, 'craft', { item, n: (sim.inv[item] || 0) + (item === 'torch' ? 4 : 1) }, {
      yields: item.replace(/_/g, ' '), takes: 'short (under 20 ticks)',
      advances: goal === nextGoal ? `completes the next rung: ${goal}` : goalsOpen.includes(goal) ? `a rung: ${goal}` : item === 'door' && !sim._house ? 'the house needs 2 doors' : item === 'wooden_hoe' ? 'farmland for crops' : 'not on the ladder',
    }, [`craft:${item}`, item]);
  }
  if (legal.has('build_house')) add('build_house', 'build_house', null, {
    yields: 'a sealed, roofed, lit house with a door — home and respawn point', takes: 'about 80–200 ticks',
    advances: 'the house rung', uses: `~60 building blocks (holding ${blocksHeld(sim)})` }, ['build_house']);
  if (legal.has('light_area')) add('light_area', 'light_area', { n: 4 }, { yields: 'torches around home', takes: 'about 40–100 ticks', advances: sim._house && !sim._lit ? 'the lit_grounds rung' : 'fewer zombies nearby' }, ['light_area']);
  if (legal.has('dig_in')) add('dig_in', 'dig_in', null, { yields: 'a one-block emergency shelter', takes: 'about 10 ticks', advances: 'safety, right here' });
  if (legal.has('sleep_until_dawn')) add('sleep_until_dawn', 'sleep_until_dawn', null, { takes: `until dawn (${DAY - (sim.tick % DAY)} ticks)`, advances: inside ? 'safe: you are covered' : 'NOT safe: you are in the open' });
  if (legal.has('eat')) add('eat', 'eat', null, { takes: '4 ticks', advances: `food ${p.food}/20` });
  if (legal.has('fight')) add('fight', 'fight', null, { takes: 'a few ticks per hit', advances: 'a zombie is touching you' });
  // the team: one option per teammate per way of helping
  for (const e of sim.players) {
    if (e === p) continue;
    const r = liveRequest(sim, e), d = Math.round(sim.dist(e.c, p.c));
    const who = e.role === 'human' ? 'the human player' : `Jev #${e.id}`;
    const answers = (w) => r && r.what === w ? { request: `ANSWERS what ${who} asked for, ${sim.tick - r.tick} ticks ago` } : {};
    if (!PALETTE.follow.needs(sim, { to: e.id }) && d > 1.5) add(`follow_${e.id}`, 'follow', { to: e.id }, { takes: `about ${about(d)} ticks`, advances: `be next to ${who}`, ...answers('come') });
    const zs = [...sim.ents.values()].filter((z) => z.kind === 'zombie' && sim.dist(z.c, e.c) < 8).length;
    if (!PALETTE.guard.needs(sim, { to: e.id }) && (zs || (r && r.what === 'defend') || sim.isNight())) add(`guard_${e.id}`, 'guard', { to: e.id, ticks: 160 }, { takes: 'about 160 ticks', advances: `keep ${who} safe (${zs} zombies near them)`, ...answers('defend') });
    for (const what of ['wood', 'food', 'stone', 'torches']) {
      if (PALETTE.give.needs(sim, { to: e.id, what })) continue;
      if (!(r && r.what === what) && !(what === 'food' && e.food < 10)) continue;   // offer gifts that are wanted
      add(`give_${what}_${e.id}`, 'give', { to: e.id, what }, { takes: `about ${about(d) + 2} ticks`, advances: `${who} gets half your ${what}` + (what === 'food' ? ` (their food ${e.food}/20)` : ''), ...answers(what) });
    }
  }
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
    // the slow choice, only when it is due (none yet, complete, or twice a day)
    ...(!sim.noProjects && projectDue(sim) ? { project: projectQuestion(sim) } : {}),
  };
}

// ------------------------------------------------------ the three deciders --
// Each takes (sim, opts, questions) and returns an answers object in Jev's
// response shape, stamped with its source.

// the scripted baseline, expressed as an answer over the SAME option set
export function baselineAnswer(sim, opts) {
  const pick = baselinePolicy(sim);
  // the option for the same macro AND the same target (which item, which species, what to scout)
  const key = (a) => a && (a.item ?? a.sp ?? a.what);
  const hit = pick && (opts.find((o) => o.name === pick.name && key(o.args) != null && key(o.args) === key(pick.args))
    || opts.find((o) => o.name === pick.name && (!o.args || !pick.args || key(o.args) == null || !['craft', 'farm', 'forage', 'scout'].includes(o.name))));
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
  const ts = sim.noSurvival ? [] : threats(sim);
  if (ts.length) record.threats = ts.map((t) => t.id);
  let pick = opt ? { name: opt.name, args: opt.args || undefined } : null;
  if (response.source === 'typesafe' && opt && (a.confidence ?? 0) < GATE) record.below_gate = true;
  if (response.source === 'typesafe' && (!opt || (gate && (a.confidence ?? 0) < GATE))) {
    const b = baselinePolicy(sim);
    record.gated = true;
    record.fallback = b ? b.name : null;
    pick = b;
  }
  if (response.source === 'baseline') pick = response.direct;
  // the project: Jev's answer when it gave one, else the decider's own rule
  if (!sim.noProjects && projectDue(sim)) {
    const want = response.answers?.project?.choice;
    const name = PROJECT_NAMES.includes(want) ? want : response.source === 'random' ? PROJECT_NAMES[Math.floor(sim.rng() * PROJECT_NAMES.length)] : baselineProject(sim);
    setProject(sim, name);
    record.project = name;
    if (response.answers?.project?.confidence != null) record.project_confidence = response.answers.project.confidence;
  }
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
    fulfil(sim, pick, r.ended);
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

// ------------------------------------------------------------ the party -----
import { Party } from './party.mjs';
// Several Jevs needing a decision at the same moment share ONE call: the
// state carries each agent's facts under its name, and each agent gets its
// own next_<id> question over its own options. Breadth is free; the state is
// what costs (see "Where the limits actually are"). A swarm of N costs one call
// per round, not N.
export function batchRequest(sim, members) {
  const agents = {}, questions = {}, per = new Map();
  for (const m of members) sim.as(m.e, () => {
    const opts = options(sim);
    if (!opts.length) return;
    const st = perceive(sim), q = buildQuestions(sim, opts);
    agents[`agent_${m.e.id}`] = st;
    questions[`next_${m.e.id}`] = { ...q.next, instructions: { ...q.next.instructions, task: `Choose what agent_${m.e.id} does next (its facts are under agents.agent_${m.e.id}).` } };
    if (q.project) questions[`project_${m.e.id}`] = { ...q.project, instructions: { task: `${q.project.instructions.task} (This is agent_${m.e.id}.)` } };
    if (sim.players.length > 1) {
      const a = askQuestion(sim);
      questions[`ask_${m.e.id}`] = { ...a, instructions: { ...a.instructions, task: `${a.instructions.task} (This is agent_${m.e.id}; its facts are under agents.agent_${m.e.id}.)` } };
    }
    per.set(m, opts);
  });
  const shared = members.length ? sim.as(members[0].e, () => ({ time: perceive(sim).time, objective: perceive(sim).objective })) : {};
  return { state: { ...shared, agents }, questions, per };
}

// Play a party headlessly. `deciders` maps a member to decide(sim, opts, qs,
// state) (single) — or pass `batch: ask` to route every mind member through
// one batched call per round. The world pauses while decisions are made, so
// runs are reproducible (the page does not pause; Jev thinks in real time).
export async function playParty(sim, party, { maxTicks = DAY, decide, batch, batchWindow = 12, onDecision } = {}) {
  const decisions = [];
  let waiting = [], since = 0;
  while (sim.tick < maxTicks) {
    let need = party.tick();
    // batching: the first agent to need a decision waits up to batchWindow
    // ticks (idle) for others to finish too, so a round is one call
    if (batch) {
      for (const m of need) if (!waiting.includes(m)) waiting.push(m);
      if (!waiting.length) continue;
      if (!since) since = sim.tick;
      const everyone = party.members.filter((m) => m.controller === 'mind').every((m) => waiting.includes(m));
      if (sim.tick - since < batchWindow && !everyone) continue;
      need = waiting; waiting = []; since = 0;
    }
    if (!need.length) continue;
    if (batch && need.length) {
      const { state, questions, per } = batchRequest(sim, need);
      if (!per.size) continue;
      let resp;
      try { resp = await batch(state, questions); } catch (e) { resp = { error: String(e.message || e), answers: {} }; }
      for (const [m, opts] of per) sim.as(m.e, () => {
        const a = resp.answers?.[`next_${m.e.id}`];
        const one = a ? { source: resp.source || 'typesafe', answers: { next: a, ...(resp.answers?.[`project_${m.e.id}`] ? { project: resp.answers[`project_${m.e.id}`] } : {}) } } : { ...offlineAnswer(sim, opts), error: resp.error || 'no answer' };
        if (sim.players.length > 1) applyAsk(sim, m.e, a ? resp.answers?.[`ask_${m.e.id}`]?.choice : offlineAsk(sim));
        startFrom(sim, party, m, opts, one, decisions, onDecision);
      });
    } else {
      for (const m of need) {
        const opts = sim.as(m.e, () => options(sim));
        if (!opts.length) { m.wantsDecision = false; continue; }
        const qs = sim.as(m.e, () => buildQuestions(sim, opts)), st = sim.as(m.e, () => perceive(sim));
        let resp;
        // decide AS that player: a local decider reads the sim (its own inventory, its own map)
        try { resp = await sim.as(m.e, () => (m.decide || decide)(sim, opts, qs, st)); } catch (e) { resp = { ...sim.as(m.e, () => offlineAnswer(sim, opts)), error: String(e.message || e) }; }
        sim.as(m.e, () => startFrom(sim, party, m, opts, resp, decisions, onDecision));
      }
    }
  }
  return { decisions };
}
function startFrom(sim, party, m, opts, resp, decisions, onDecision) {
  const { pick, record } = resolve(sim, opts, resp, { gate: false });
  record.who = m.e.id;
  record.pick = pick && pick.name;
  m.wantsDecision = false;
  sim.note('jev', { ...record, pick: pick && pick.name, who: m.e.id });
  decisions.push(record);
  if (!pick) { m.pending = { a: { op: 'wait' }, pl: { ticks: 10 }, t0: sim.tick, doneAt: sim.tick + 10 }; return; }
  m.onEnded = (ended) => sim.as(m.e, () => { journal(sim, record, ended); remember(sim, record.choice, ended); fulfil(sim, pick, ended); record.result = ended.ok ? 'ok' : ended.why; onDecision && onDecision(record, ended); });
  party.startMacro(m, pick.name, pick.args);
}
export { Party };
