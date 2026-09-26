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

import { PALETTE, atHome, shortfall, ripePlots, growingPlots, visiblePlants } from './macros.mjs';
import { EAT_ORDER, B } from './world.mjs';
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

const zombieAdjacent = (sim) => [...sim.ents.values()].some((e) => e.kind === 'zombie' && sim.adjacentTo(sim.player, e));
const exposed = (sim) => sim.skyOpen(sim.player.c, sim.player.y + 2);

// Interrupts are facts, not judgements: each names a thing that changed and
// that the current macro was not written to handle.
export function standardInterrupt(sim, running = null) {
  if (zombieAdjacent(sim)) return 'zombie adjacent';
  // under water with breath running low: whatever the macro was doing, stop
  const p = sim.player;
  if (running !== 'surface' && sim.get(p.c, p.y + 1) === B.water && p.air <= 40 && !sim._airAck) { sim._airAck = true; return 'running out of air'; }
  if (p.air >= 60) sim._airAck = false;
  if (sim.isNight() && exposed(sim) && !sim._nightAck) { sim._nightAck = true; return 'night fell in the open'; }
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
  const craftIt = (item, q = 1) => shortfall(sim, item, q).log ? { name: 'gather_wood', args: { n: n('log') + 2 } } : { name: 'craft', args: { item, ...(q > 1 ? { n: q } : {}) } };
  const blocks = n('cobblestone') + n('dirt') + n('planks') + n('sand');
  if (zombieAdjacent(sim)) return { name: 'fight' };
  if (sim.get(p.c, p.y + 1) === B.water) return { name: 'surface' };
  if (sim.isNight()) {
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
  if (n('torch') < 4 && n('coal') < 1) return { name: 'mine_coal', args: { n: 3 } };
  if (n('torch') < 4) return craftIt('torch', 4);
  if (!n('iron_pickaxe')) {
    const iron = n('iron_ore') + n('iron_ingot');
    if (iron < 3 || n('coal') < 3) return { name: 'mine_iron', args: { iron: 3, coal: 3 } };
    return craftIt('iron_pickaxe');
  }
  if (!sim._house) {
    if (sim._houseFails > 2) { /* give up on a house; live rough */ }
    else if (!exposed(sim)) return { name: 'surface' };
    else if (n('door') < 2 && n('log') + n('planks') / 4 < 2) return { name: 'gather_wood', args: { n: 3 } };
    else if (blocks < 70) return { name: 'mine_stone', args: { n: 70 } };
    else { sim._houseFails = (sim._houseFails || 0) + 1; return { name: 'build_house' }; }
  }
  if (sim._house && !sim._lit && !sim._litTried) { sim._litTried = true; return { name: 'light_area', args: { n: 4 } }; }
  if (!n('iron_sword')) {
    const iron = n('iron_ore') + n('iron_ingot');
    if (iron < 2 || n('coal') < 2) { if (!sim._swordTries || sim._swordTries < 3) { sim._swordTries = (sim._swordTries || 0) + 1; return { name: 'mine_iron', args: { iron: 2, coal: 2 } }; } }
    else return craftIt('iron_sword');
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
