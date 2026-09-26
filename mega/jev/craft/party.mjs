// craft/party.mjs — several players in one world, acting at the same time.
//
// sim.act() runs one player's action to completion while the world steps
// under it: fine alone, wrong for two (your teammate would freeze while you
// mine). Here every action is a plan (sim.plan): each tick, every member
// whose last action has finished is served its next one — from a macro it is
// running, from the hands queue (a human), or from a decision (Jev, the
// baseline) — its `pre` applies, the world steps ONCE, and actions whose time
// is up complete (`post`) for whoever owns them. Everything a member does is
// run inside sim.as(member), so macros and planners see "their" player.
//
// Decisions may be asynchronous (a live call). A member waiting on one simply
// idles while the world goes on: Jev thinks in real time, like a teammate.
// Party.tick() never awaits; it returns who needs a decision, and the caller
// (the page, or playParty below) supplies it.

import { PALETTE } from './macros.mjs';
import { standardInterrupt } from './runner.mjs';

export class Party {
  constructor(sim) {
    this.sim = sim;
    this.members = [];
  }
  // controller: 'human' | 'mind' (decisions supplied by the caller)
  join(entity, controller, extra = {}) {
    const m = { e: entity, controller, gen: null, y: null, pending: null, macro: null, queue: [], wantsDecision: false, thinking: false, ...extra };
    entity.role = controller;
    this.members.push(m);
    return m;
  }
  member(id) { return this.members.find((m) => m.e.id === id); }

  startMacro(m, name, args) {
    const sim = this.sim;
    sim.as(m.e, () => {
      if (m.gen) this.endMacro(m, { ok: false, why: 'replaced' });
      m.macro = { name, args, tick: sim.tick };
      m.e.doing = name;
      sim.note('macro', { name, ...(args ? { args } : {}), who: m.e.id });
      m.gen = PALETTE[name].run(sim, args);
      m.y = m.gen.next();
      if (m.y.done) this.endMacro(m, m.y.value || { ok: true });
    });
  }
  endMacro(m, res) {
    const sim = this.sim;
    if (m.gen && m.y && !m.y.done) m.gen.return();
    const out = { ...m.macro, ticks: sim.tick - m.macro.tick, ...res };
    sim.note('macro_end', { name: m.macro.name, ok: res.ok, ...(res.why ? { why: res.why } : {}), who: m.e.id });
    m.gen = null; m.y = null; m.e.doing = null;
    m.lastEnded = out;
    if (m.onEnded) m.onEnded(out);
    return out;
  }
  // a human hand on the controls ends whatever macro was running for them
  takeOver(m) { if (m.gen) this.sim.as(m.e, () => this.endMacro(m, { ok: false, why: 'you took over' })); }

  // next primitive for a member, or null (idle / waiting on a decision)
  nextAction(m) {
    if (m.gen) {
      if (m.y.done) { this.endMacro(m, m.y.value || { ok: true }); return null; }
      return m.y.value;
    }
    if (m.controller === 'human') {
      const a = m.queue.shift() || (m.intent && m.intent());
      if (a) m.e.doing = a.op;
      return a || null;
    }
    if (!m.thinking) m.wantsDecision = true;
    return null;
  }
  // feed a finished (or refused) action's result back to its source
  deliver(m, a, res) {
    if (m.gen) {
      const why = standardInterrupt(this.sim, m.macro && m.macro.name);
      if (why) { this.endMacro(m, { ok: false, why: `interrupted: ${why}`, interrupted: why }); return; }
      m.y = m.gen.next(res);
      if (m.y.done) this.endMacro(m, m.y.value || { ok: true });   // ends the moment its last action does, not a tick later
    } else if (m.onResult) m.onResult(a, res);
  }
  serve(m) {
    const sim = this.sim;
    for (let guard = 0; guard < 8 && !m.pending; guard++) {
      const a = this.nextAction(m);
      if (!a) return;
      const pl = sim.plan(a);
      if (!pl.ok) { this.deliver(m, a, { ok: false, ticks: 0, why: pl.why }); continue; }   // refusals are free
      if (pl.pre) pl.pre();
      m.pending = { a, pl, t0: sim.tick, doneAt: sim.tick + pl.ticks };
    }
  }
  complete(m) {
    const sim = this.sim, { a, pl, t0 } = m.pending;
    m.pending = null;
    const r = pl.post ? pl.post() : null;
    this.deliver(m, a, { ok: !r || r.ok, ticks: sim.tick - t0, ...(r && !r.ok ? { why: r.why } : {}) });
  }
  // one world tick for everyone; returns the members that need a decision
  tick() {
    const sim = this.sim;
    for (const m of this.members) sim.as(m.e, () => this.serve(m));
    sim.step();
    for (const m of this.members) if (m.pending && sim.tick >= m.pending.doneAt) sim.as(m.e, () => this.complete(m));
    sim.flush();
    return this.members.filter((m) => m.wantsDecision && !m.thinking && !m.gen);
  }
}
