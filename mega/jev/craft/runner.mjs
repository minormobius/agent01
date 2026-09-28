// craft/runner.mjs — drives macros against a Sim, and the baseline policy.
//
// runMacro steps one macro generator to completion, feeding each primitive
// action's result back in, and checks an interrupt predicate after every
// action: that is where System 1 cuts in (a zombie at your side, dusk while
// you are in the open). The macro is abandoned cleanly — macros hold no
// half-finished state, see macros.mjs.
//
// baselinePolicy is the scripted System 1 this experiment has to beat: a
// fixed if-ladder over the same palette Jev will choose from. It exists so
// "Jev played for a day" has a number to be compared against, and so the
// engine can be shown climbing the tech ladder with no model in the loop.

import { itemsInSight, lostThings, pickLow, PALETTE, atHome, shortfall, ripePlots, growingPlots, visiblePlants, visiblePigs, chestItems, surplus, inNether, portalsHere, PORTAL_OBSIDIAN } from './macros.mjs';
import { EAT_ORDER, B, HOSTILE, durability } from './world.mjs';
import { speciesHere, needsFarmland } from './plants.mjs';

// One primitive action per step(), so a caller can interleave rendering
// (the viewer) or run flat out (play()). Both drive exactly this loop.
export class Driver {
  constructor(sim, { policy = baselinePolicy, interrupt = standardInterrupt, maxActions = 3000 } = {}) {
    Object.assign(this, { sim, policy, interrupt, maxActions });
    this.gen = null; this.cur = null; this.last = null; this.n = 0; this.done = false;
  }
  // start a macro by hand (the viewer's buttons; a Jev answer)
  start(name, args) {
    if (this.gen) this.end({ ok: false, why: 'replaced' });
    this.cur = { name, ...(args ? { args } : {}), tick: this.sim.tick };
    this.sim.note('macro', { name, ...(args ? { args } : {}) });
    this.gen = PALETTE[name].run(this.sim, args);
    this.last = this.gen.next(); this.n = 0;
  }
  end(res) {
    if (this.gen && !this.last?.done) this.gen.return();
    if (this.cur.name === 'explore' && /all the land/.test(res.why || '')) this.sim._explored = true;
    const out = { ...this.cur, ticks: this.sim.tick - this.cur.tick, ...res };
    this.sim._lastMacro = out;
    this.sim.note('macro_end', { name: this.cur.name, ok: res.ok, ...(res.why ? { why: res.why } : {}) });
    this.gen = null;
    return out;
  }
  // → null (an action ran), { ended: macroSummary }, or { done: true }
  step() {
    if (!this.gen) {
      const pick = this.policy(this.sim);
      if (!pick) { this.done = true; return { done: true }; }
      this.start(pick.name, pick.args);
    }
    if (this.last.done) return { ended: this.end(this.last.value || { ok: true }) };
    if (++this.n > this.maxActions) return { ended: this.end({ ok: false, why: 'action budget spent' }) };
    const res = this.sim.act(this.last.value);
    this.lastAction = { ...this.last.value, ...res };
    const why = this.interrupt && this.interrupt(this.sim, this.cur && this.cur.name);
    if (why) return { ended: this.end({ ok: false, why: `interrupted: ${why}`, interrupted: why }) };
    this.last = this.gen.next(res);
    return null;
  }
}

// Run one macro to completion (tests, and anything that wants a macro as a call).
export function runMacro(sim, name, args, opts = {}) {
  const d = new Driver(sim, { ...opts, policy: () => null });
  d.start(name, args);
  for (;;) { const r = d.step(); if (r && r.ended) return r.ended; }
}

const zombieAdjacent = (sim) => [...sim.ents.values()].some((e) => HOSTILE.has(e.kind) && sim.adjacentTo(sim.player, e));
const exposed = (sim) => sim.skyOpen(sim.player.c, sim.player.y + 2);
const inNetherNow = (sim) => sim.dim === 'nether';

// Interrupts are facts, not judgements: each names a thing that changed and
// that the current macro was not written to handle.
export function standardInterrupt(sim, running = null) {
  // (not while fighting it or digging away from it: that is the answer to it)
  if (zombieAdjacent(sim) && !['fight', 'dig_in', 'guard'].includes(running)) return inNetherNow(sim) ? 'blaze adjacent' : 'zombie adjacent';
  // under water with breath running low: whatever the macro was doing, stop
  const p = sim.player;
  if (running !== 'surface' && sim.get(p.c, p.y + 1) === B.water && p.air <= 40 && !sim._airAck) { sim._airAck = true; return 'running out of air'; }
  if (p.air >= 60) sim._airAck = false;
  // (not while already heading for shelter: that is the answer to it)
  if (sim.isNight() && exposed(sim) && !sim._nightAck && !['go_home', 'dig_in', 'sleep_in_bed', 'sleep_until_dawn'].includes(running)) { sim._nightAck = true; return 'night fell in the open'; }
  if (!sim.isNight()) sim._nightAck = false;
  return null;
}

// The scripted ladder, then a life: wood → wooden pick → stone → stone pick →
// coal & torches → iron → iron pick → a house → light around it → a daily
// round of exploring, mining and hunting, home by dusk. One fixed if-ladder
// over the same palette Jev will choose from — the bar, not the ceiling.
export function baselinePolicy(sim) {
  const p = sim.player, inv = sim.inv;
  const n = (k) => inv[k] || 0;
  // every craft goes through here: short of wood → fetch wood first
  // (and short of coal → dig coal: smelting iron for a bucket once spent the
  // coal torches had just used, and the craft failed ~980 times in two days)
  const craftIt = (item, q = 1) => { const sh = shortfall(sim, item, q); return sh.log ? { name: 'gather_wood', args: { n: n('log') + 2 } } : sh.coal ? { name: 'mine_coal', args: { n: n('coal') + sh.coal + 2 } } : sh.cobblestone ? { name: 'mine_stone', args: { n: n('cobblestone') + sh.cobblestone + 2 } } : { name: 'craft', args: { item, ...(q > 1 ? { n: q } : {}) } }; };
  const blocks = n('cobblestone') + n('dirt') + n('planks') + n('sand');
  if (zombieAdjacent(sim)) return { name: 'fight' };
  if (sim.get(p.c, p.y + 1) === B.water) return { name: 'surface' };
  const tries = (k) => (sim.me._ageTries ||= {})[k] || 0;
  const tried = (k) => { sim.me._ageTries[k] = tries(k) + 1; };
  // died: everything carried is lying where it fell, for 5 minutes. Go back
  // for it (unless it is night and it lies out in the open)
  const lost = lostThings(sim);
  if (lost && !(sim.isNight() && sim.skyOpen(lost.c, lost.y + 2)) && tries('recover@' + lost.id) < 2) { tried('recover@' + lost.id); return { name: 'recover' }; }
  // in the nether: glowstone, a lamp, and back through the portal
  if (inNether(sim)) {
    if (p.food < 12 && EAT_ORDER.some((k) => inv[k])) return { name: 'eat' };
    if (!n('glowstone') && n('glowstone_dust') < 4 && tries('glow') < 4) { tried('glow'); return { name: 'mine_glowstone', args: { n: 4 - n('glowstone_dust') } }; }
    if (!n('glowstone') && n('glowstone_dust') >= 4) return { name: 'craft', args: { item: 'glowstone' } };
    if (tries('back') < 4) { tried('back'); return { name: 'use_portal' }; }
    return { name: 'explore' };
  }
  // a bed plan that failed tonight is not retried tonight (a zero-tick failure
  // at the top of the night branch would otherwise repeat every tick)
  const lm = sim._lastMacro, night0 = Math.floor(sim.tick / 4800);
  if (lm && !lm.ok && lm.name === 'sleep_in_bed') sim.me._bedFailNight = night0;
  if (lm && !lm.ok && lm.name === 'go_home' && sim.isNight()) sim.me._homeFailNight = night0;
  const bedOk = !PALETTE.sleep_in_bed.needs(sim, {}) && sim.me._bedFailNight !== night0;
  if (sim.isNight()) {
    if (bedOk && (atHome(sim) || (sim.home && sim.dist(p.c, sim.home[0]) < 25 && sim.me._homeFailNight !== night0))) return { name: 'sleep_in_bed' };
    if (atHome(sim)) return { name: 'sleep_until_dawn' };
    if (sim.home && exposed(sim) && sim.dist(p.c, sim.home[0]) < 25 && !sim._homeTried) { sim._homeTried = true; return { name: 'go_home' }; }
    return exposed(sim) ? { name: 'dig_in' } : { name: 'sleep_until_dawn' };
  }
  sim._homeTried = false;
  // a macro that just failed without spending a tick will fail the same way
  // again from the same spot: go somewhere else first
  const last = sim._lastMacro;
  if (last && !last.ok && last.ticks === 0 && !['explore', 'surface', 'fight', 'eat', 'go_home'].includes(last.name)) {
    if (!exposed(sim)) return { name: 'surface' };
    // with the whole world seen, exploring fails at once too: walk home instead
    return sim._explored && sim.home && !atHome(sim) ? { name: 'go_home' } : { name: 'explore' };
  }
  if (!exposed(sim) && p.y < sim.surface(p.c) - 6 && n('iron_pickaxe')) return { name: 'surface' };
  if (p.food < 14 && EAT_ORDER.some((k) => inv[k])) return { name: 'eat' };
  if (p.food < 8) return { name: 'hunt' };
  if (!n('wooden_pickaxe') && !n('stone_pickaxe') && !n('iron_pickaxe')) {
    return n('log') + n('planks') / 4 < 5 ? { name: 'gather_wood', args: { n: 5 } } : { name: 'craft', args: { item: 'wooden_pickaxe' } };
  }
  if (!n('stone_pickaxe') && !n('iron_pickaxe')) {
    return n('cobblestone') < 11 ? { name: 'mine_stone', args: { n: 11 } } : craftIt('stone_pickaxe');
  }
  if (!n('stone_sword') && !n('iron_sword')) return n('cobblestone') >= 2 ? craftIt('stone_sword') : { name: 'mine_stone', args: { n: 4 } };
  // an axe and a shovel: logs and dirt go 2-3x faster, for 4 cobblestone
  if (!sim.toolFor('axe')) return n('cobblestone') >= 3 ? craftIt('stone_axe') : { name: 'mine_stone', args: { n: n('cobblestone') + 3 } };
  if (!sim.toolFor('shovel')) return n('cobblestone') >= 1 ? craftIt('stone_shovel') : { name: 'mine_stone', args: { n: n('cobblestone') + 1 } };
  // tools wear out: make the next pick before this one breaks, when all it lacks is wood
  const worn = (k) => n(k) === 1 && ((p.wear && p.wear[k]) ?? durability(k)) <= 0.15 * durability(k);
  // the last pick worn low: up to where the wood is, then make another
  if (pickLow(sim) && sim.pickTier() > 0 && !exposed(sim)) return { name: 'surface' };
  const best = sim.toolFor('pick');
  // and always a spare stone pick: one that breaks underground strands you
  // (measured: without it, 8 of 20 worlds reached the nether, not 17)
  const spares = best === 'stone_pickaxe' ? 2 : 1;
  if (sim.pickTier() >= 2 && n('stone_pickaxe') < spares) return n('cobblestone') >= 3 ? craftIt('stone_pickaxe', n('stone_pickaxe') + 1) : { name: 'mine_stone', args: { n: n('cobblestone') + 3 } };
  if (best && worn(best) && Object.keys(shortfall(sim, best, 2)).every((x) => ['stick', 'planks', 'log'].includes(x))) return craftIt(best, 2);
  if (n('torch') < 4 && n('coal') < 1) return { name: 'mine_coal', args: { n: 3 } };
  if (n('torch') < 4) return craftIt('torch', 4);
  if (!n('iron_pickaxe')) {
    const iron = n('iron_ore') + n('iron_ingot');
    if (iron < 3 || n('coal') < 3) return { name: 'mine_iron', args: { iron: 3, coal: 3 } };
    return craftIt('iron_pickaxe');
  }
  // a team pools: someone sets up the chest, everyone stores stone in it, and
  // whoever sees enough in the pool builds the house for all of them
  const team = sim.players.length > 1;
  if (team && sim.team.chest == null && !sim._house) return n('chest') ? { name: 'set_up_chest' } : craftIt('chest');
  if (team && !sim._house && sim.team.builder == null && !(sim._houseFails > 2)) {
    const pooled = blocks + ['cobblestone', 'dirt', 'planks', 'sand'].reduce((a, k) => a + (chestItems(sim)[k] || 0), 0);
    if (n('door') < 2 && n('log') + n('planks') / 4 < 2) return { name: 'gather_wood', args: { n: 3 } };
    if (pooled >= 90) { sim._houseFails = (sim._houseFails || 0) + 1; return exposed(sim) ? { name: 'build_house' } : { name: 'surface' }; }
    if (blocks >= 40) return { name: 'store' };
    return { name: 'mine_stone', args: { n: n('cobblestone') + 40 } };
  }
  if (team && !sim._house) {
    // someone else is building: keep the pool topped up meanwhile
    if (blocks >= 40 && sim.team.chest != null) return { name: 'store' };
  }
  if (!sim._house) {
    if (sim._houseFails > 2) { /* give up on a house; live rough */ }
    else if (!exposed(sim)) return { name: 'surface' };
    else if (n('door') < 2 && n('log') + n('planks') / 4 < 2) return { name: 'gather_wood', args: { n: 3 } };
    else if (blocks < 70) return { name: 'mine_stone', args: { n: 70 } };
    else { sim._houseFails = (sim._houseFails || 0) + 1; return { name: 'build_house' }; }
  }
  if (sim._house && !sim._lit && !sim._litTried) { sim._litTried = true; return { name: 'light_area', args: { n: 4 } }; }
  // a bed: 3 wool (sheep) + 3 planks. The pool counts; only fruitless
  // scouting costs a try (sheep are scarce, and teammates want wool too)
  if (sim._house && !n('bed') && !p.bedAt) {
    if (n('wool') >= 3) return craftIt('bed');
    if (n('wool') + (chestItems(sim).wool || 0) >= 3) return { name: 'take', args: { item: 'wool', n: 3 - n('wool') } };
    if (n('shears') && visiblePigs(sim, 24, 'sheep').some((e) => !e.shorn)) return { name: 'shear', args: { n: 3 - n('wool') } };
    if (visiblePigs(sim, 24, 'sheep').length) return { name: 'hunt', args: { kind: 'sheep' } };
    if ((sim.me._bedTries || 0) < 4) { sim.me._bedTries = (sim.me._bedTries || 0) + 1; return { name: 'scout', args: { what: 'sheep' } }; }
  }
  // renewing: plant the saplings carried (wood runs out otherwise), pick up
  // what lies about, breed animals near home when we have their food
  const day = Math.floor(sim.tick / 4800);
  if (sim._house && n('sapling') && !sim.isNight() && tries('trees@' + day) < 1) { tried('trees@' + day); return { name: 'plant_trees', args: { n: Math.min(4, n('sapling')) } }; }
  if (itemsInSight(sim, 8).length && tries('collect@' + Math.floor(sim.tick / 600)) < 1) { tried('collect@' + Math.floor(sim.tick / 600)); return { name: 'collect' }; }
  if (sim._house && !sim.isNight() && tries('breed@' + day) < 2) {
    const k = ['cow', 'sheep', 'chicken', 'pig'].find((kind) => !PALETTE.breed.needs(sim, { kind }));
    if (k) { tried('breed@' + day); return { name: 'breed', args: { kind: k } }; }
  }
  // surplus goes in the pool when we are home anyway
  if (team && sim.team.chest != null && atHome(sim) && Object.values(surplus(sim)).reduce((a, b) => a + b, 0) >= 32) return { name: 'store' };
  if (!n('iron_sword')) {
    const iron = n('iron_ore') + n('iron_ingot');
    if (iron < 2 || n('coal') < 2) { if (!sim._swordTries || sim._swordTries < 3) { sim._swordTries = (sim._swordTries || 0) + 1; return { name: 'mine_iron', args: { iron: 2, coal: 2 } }; } }
    else return craftIt('iron_sword');
  }
  // the diamond age: iron armor, a diamond pick, a bucket, obsidian, glass, a
  // beacon at home. Each stage has a try budget: a world with no reachable
  // lava or diamonds must not trap the script
  const ingots = n('iron_ingot') + n('iron_ore');
  // the pool counts: a teammate's diamonds are ours to take
  const pool = (k) => n(k) + (chestItems(sim)[k] || 0);
  const fetch = (k, q) => n(k) < q && pool(k) >= q ? { name: 'take', args: { item: k, n: q - n(k) } } : null;
  if (sim._house && n('iron_pickaxe') + n('diamond_pickaxe') && !sim.ow('beacons').size && !sim.isNight()) {
    if (!n('iron_armor') && !n('diamond_armor') && tries('armor') < 3) {
      if (ingots >= 8 && n('coal') + n('charcoal') >= 8 - n('iron_ingot')) return craftIt('iron_armor');
      tried('armor'); return { name: 'mine_iron', args: { iron: 8, coal: 8 } };
    }
    if (sim.pickTier() < 4 && tries('diamond') < 4) {
      if (n('diamond') >= 3) return craftIt('diamond_pickaxe');
      if (fetch('diamond', 3)) return fetch('diamond', 3);
      tried('diamond'); return { name: 'mine_diamond', args: { n: 3 - n('diamond') } };
    }
    if (sim.pickTier() >= 4 && !n('beacon')) {
      if (!n('bucket') && !n('water_bucket') && tries('bucket') < 3) {
        if (ingots >= 3) return craftIt('bucket');
        tried('bucket'); return { name: 'mine_iron', args: { iron: 3, coal: 3 } };
      }
      if (fetch('obsidian', 3)) return fetch('obsidian', 3);
      if (n('obsidian') < 3 && tries('obsidian') < 6 && (n('bucket') || n('water_bucket'))) {
        tried('obsidian');
        // lava comes into sight by seeing more of the world, not by tunnelling
        return PALETTE.make_obsidian.needs(sim, {}) ? (sim._explored ? { name: 'branch_mine', args: { length: 16 } } : { name: 'explore' }) : { name: 'make_obsidian', args: { n: 3 - n('obsidian') } };
      }
      if (n('obsidian') >= 3) {
        if (fetch('glass', 5)) return fetch('glass', 5);
        if (n('glass') < 5 && fetch('sand', 5)) return fetch('sand', 5);
        if (n('glass') < 5 && n('sand') < 5 && tries('sand') < 3) { tried('sand'); return { name: 'dig_sand', args: { n: 5 } }; }
        if (n('glass') < 5) return craftIt('glass', 5);
        if (fetch('diamond', 1)) return fetch('diamond', 1);
        if (n('diamond') < 1 && tries('diamond2') < 3) { tried('diamond2'); return { name: 'mine_diamond', args: { n: 1 } }; }
        if (n('diamond') >= 1) return craftIt('beacon');
      }
    }
    if (n('beacon') && tries('place') < 3) { tried('place'); return { name: 'place_beacon' }; }
  }
  // the nether: 6 more obsidian, a portal near home (one for the team), a
  // crossing, and glowstone brought back
  if (sim._house && sim.ow('beacons').size && sim.pickTier() >= 4 && !sim.isNight() && !n('glowstone') && !p.glowPlaced) {
    if (!portalsHere(sim).length) {
      if (fetch('obsidian', PORTAL_OBSIDIAN)) return fetch('obsidian', PORTAL_OBSIDIAN);
      if (n('obsidian') < PORTAL_OBSIDIAN && tries('obsidian2') < 16 && (n('bucket') || n('water_bucket'))) {
        tried('obsidian2');
        return PALETTE.make_obsidian.needs(sim, {}) ? (sim._explored ? { name: 'branch_mine', args: { length: 16 } } : { name: 'explore' }) : { name: 'make_obsidian', args: { n: PORTAL_OBSIDIAN - n('obsidian') } };
      }
      if (n('obsidian') >= PORTAL_OBSIDIAN && tries('portal') < 3) { tried('portal'); return { name: 'build_portal' }; }
    } else if (tries('cross') < 4) { tried('cross'); sim.me._ageTries.glow = 0; sim.me._ageTries.back = 0; return { name: 'use_portal' }; }
  }
  // then growing: reap what is ripe, make a hoe, and for each species not yet
  // grown, plant the seeds carried or take them from a wild plant in sight
  // (the daily round's exploring finds the rest)
  const here = speciesHere(sim);
  if (here.length) {
    if (ripePlots(sim).length) return { name: 'harvest' };
    const tries = (sim.me._growTries = sim.me._growTries || {});
    const grown = sim.player.grown || {}, plotted = new Set([...ripePlots(sim), ...growingPlots(sim)].map((q) => q.sp));
    for (const sp of here) {
      if (grown[sp] || plotted.has(sp) || (tries[sp] || 0) >= 3) continue;
      if (sim.has(`${sp}_seeds`)) {
        if (needsFarmland(sp) && !n('wooden_hoe')) return craftIt('wooden_hoe');
        tries[sp] = (tries[sp] || 0) + 1;
        return { name: 'farm', args: { sp, n: 2 } };
      }
      if (visiblePlants(sim, sp).length) { tries[sp] = (tries[sp] || 0) + 0.5; return { name: 'forage', args: { sp, n: 1 } }; }
    }
  }
  // the daily round
  const round = ['explore', 'explore', 'hunt', 'branch_mine', 'explore'];
  sim._round = ((sim._round ?? -1) + 1) % round.length;
  const pick = round[sim._round];
  if (pick === 'hunt' && p.food >= 18) return { name: sim._explored ? 'branch_mine' : 'explore' };
  if (pick === 'explore' && sim._explored) return { name: 'branch_mine', args: { length: 14 } };
  if (pick === 'branch_mine') return { name: 'branch_mine', args: { length: 14 } };
  if (!exposed(sim)) return { name: 'surface' };
  // head home once the afternoon is late
  if (sim.home && (sim.tick % DAYLEN) > NIGHT_AT - 500 && !atHome(sim)) return { name: 'go_home' };
  return { name: pick };
}
const DAYLEN = 4800, NIGHT_AT = 3000;

// Play a policy until it returns null or the tick budget runs out.
// Returns the per-macro log and the milestones reached, with their tick.
export const MILESTONES = ['log', 'crafting_table', 'wooden_pickaxe', 'cobblestone', 'stone_pickaxe', 'coal', 'torch', 'iron_ore', 'furnace', 'iron_ingot', 'iron_pickaxe', 'door', 'home'];
export function play(sim, policy = baselinePolicy, { maxTicks = 4800 * 3, maxMacros = 400, onMacro } = {}) {
  const log = [], milestones = {};
  const mark = () => { for (const m of MILESTONES) if (!(m in milestones) && (m === 'home' ? sim._house : sim.inv[m] || sim.stats.crafted[m])) milestones[m] = sim.tick; };
  const d = new Driver(sim, { policy });
  let fails = 0;
  while (sim.tick < maxTicks && log.length < maxMacros) {
    const r = d.step();
    if (!r) continue;
    if (r.done) break;
    const m = r.ended;
    log.push(m);
    onMacro && onMacro(m);
    mark();
    // a policy that keeps choosing a failing macro without time passing is stuck
    fails = m.ok || m.ticks > 0 ? 0 : fails + 1;
    if (fails > 5) { log.push({ tick: sim.tick, name: 'stuck', ok: false, why: m.why }); break; }
  }
  return { log, milestones, stats: sim.stats, tick: sim.tick };
}
