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

import { PALETTE } from './macros.mjs';

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
    this.gen = PALETTE[name](this.sim, args);
    this.last = this.gen.next(); this.n = 0;
  }
  end(res) {
    if (this.gen && !this.last?.done) this.gen.return();
    const out = { ...this.cur, ticks: this.sim.tick - this.cur.tick, ...res };
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
    const why = this.interrupt && this.interrupt(this.sim);
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
export function standardInterrupt(sim) {
  if (zombieAdjacent(sim)) return 'zombie adjacent';
  if (sim.isNight() && exposed(sim) && !sim._nightAck) { sim._nightAck = true; return 'night fell in the open'; }
  if (!sim.isNight()) sim._nightAck = false;
  return null;
}

// The scripted ladder: wood → wooden pick → stone → stone pick → iron → iron pick.
export function baselinePolicy(sim) {
  const p = sim.player, inv = sim.inv;
  if (zombieAdjacent(sim)) return { name: 'fight' };
  if (sim.isNight()) return exposed(sim) ? { name: 'dig_in' } : { name: 'sleep_until_dawn' };
  if (!exposed(sim) && !sim.isNight() && p.y < sim.surface(p.c) - 6 && inv.iron_pickaxe) return { name: 'surface' };
  if (p.food < 14 && ['apple', 'porkchop', 'cooked_porkchop'].some((k) => inv[k])) return { name: 'eat' };
  if (p.food < 8) return { name: 'hunt' };
  if (!inv.wooden_pickaxe && !inv.stone_pickaxe && !inv.iron_pickaxe) {
    return (inv.log || 0) + (inv.planks || 0) / 4 < 5 ? { name: 'gather_wood', args: { n: 5 } } : { name: 'craft', args: { item: 'wooden_pickaxe' } };
  }
  if (!inv.stone_pickaxe && !inv.iron_pickaxe) {
    return (inv.cobblestone || 0) < 11 ? { name: 'mine_stone', args: { n: 11 } } : { name: 'craft', args: { item: 'stone_pickaxe' } };
  }
  if (!inv.iron_pickaxe) {
    const iron = (inv.iron_ore || 0) + (inv.iron_ingot || 0);
    if (iron < 3 || (inv.coal || 0) < 3) return { name: 'mine_iron', args: { iron: 3, coal: 3 } };
    return { name: 'craft', args: { item: 'iron_pickaxe' } };
  }
  return null;
}

// Play a policy until it returns null or the tick budget runs out.
// Returns the per-macro log and the milestones reached, with their tick.
export const MILESTONES = ['log', 'crafting_table', 'wooden_pickaxe', 'cobblestone', 'stone_pickaxe', 'coal', 'iron_ore', 'furnace', 'iron_ingot', 'iron_pickaxe'];
export function play(sim, policy = baselinePolicy, { maxTicks = 4800 * 3, maxMacros = 400, onMacro } = {}) {
  const log = [], milestones = {};
  const mark = () => { for (const m of MILESTONES) if (!(m in milestones) && (sim.inv[m] || sim.stats.crafted[m])) milestones[m] = sim.tick; };
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
