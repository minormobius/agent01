// plant-bridge.js — the TWIN as a plant backend on the CopleyBench amp wire
// contract. Given a homunculus deck + its device profiles, it accepts the same
// motion commands ScriptHost sends the real CopleyBench.Server / SimServer
// (moverel, coordinated/move, status) and executes them through the tjs physics
// engine (deckengine): jerk-limited planning, per-motor torque verdict, and
// collision checking. It holds the live joint state so the surface can render
// the move and telemetry can report position.
//
// It is PURE SIM. It never opens a CAN line and never owns hardware — one CAN
// owner stays CopleyBench.Server. The twin is a parallel, client-shaped surface;
// swapping ScriptHost's `Copley.ServerUrl` to this bridge runs a recipe against
// the twin with zero hardware involvement. (See HOMUNCULUS.md.)
//
// Pure module (no http, no DOM). twin/server.mjs wraps it in a node HTTP server.

import { planDeviceMove, simulateDevice, defaultState } from './deckengine.js';
import { resolve, countsToMm } from './profiles.js';

const op = (ok, message, code = ok ? 'ok' : 'error', extra = {}) => ({ ok, message, code, dt: 0, stall: false, collision: false, ...extra });

function jointMax(dev, joint) {
  if (!dev) return Infinity;
  if (dev.type === 'hbot') return joint === 'x' ? dev.params.bedX : dev.params.bedY;
  if (dev.type === 'linear') return dev.params.travel;
  return Infinity;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// crude trapezoid duration for axes with no twin body (rotary), for cycle bookkeeping
function estDuration(dist, lim) { const d = Math.abs(dist); const v = lim.vmax || 100, a = lim.amax || 1000; return d / v + v / a; }

export class PlantBridge {
  constructor(deck, profiles) {
    this.deck = deck;
    this.profiles = profiles;
    this.state = {};          // deviceId -> joint state {x,y} | {p}
    for (const d of deck.devices) this.state[d.id] = { ...defaultState(d) };
    this.hbotMotor = {};      // deviceId -> { A, B } absolute motor positions (mm-equiv)
    this.enabled = {};        // node -> bool
    this.cycleTime = 0;       // accumulated sim seconds (throughput bookkeeping)
  }

  // ---- the wire verbs ------------------------------------------------------
  enable(nameOrNode, on = true) { const p = resolve(this.profiles, nameOrNode); if (!p) return op(false, `unknown axis '${nameOrNode}'`, 'unknown_axis'); this.enabled[p.node ?? p.axis] = on; return op(true, `${p.axis} ${on ? 'enabled' : 'disabled'}`); }
  disable(nameOrNode) { return this.enable(nameOrNode, false); }

  home(nameOrNode) {
    const p = resolve(this.profiles, nameOrNode); if (!p) return op(false, `unknown axis '${nameOrNode}'`, 'unknown_axis');
    if (p.deviceId && this.deck.getDevice(p.deviceId)) {
      this.state[p.deviceId] = { ...defaultState(this.deck.getDevice(p.deviceId)) };
      if (this.hbotMotor[p.deviceId]) this._syncMotorsFromJoints(p.deviceId);
    }
    return op(true, `${p.axis} homed`);
  }

  // moverel: { counts | delta_mm, vel?, accel?, decel?, jerk?, method? }
  moveRel(nameOrNode, body = {}) {
    const p = resolve(this.profiles, nameOrNode);
    if (!p) return op(false, `unknown axis/node '${nameOrNode}'`, 'unknown_axis');
    const mm = body.delta_mm != null ? +body.delta_mm : countsToMm(p, +(body.counts || 0));
    return this._applyDelta(p, mm);
  }

  // coordinated/move: { moves: [{ axis|node, counts|delta_mm, ... }], maxTotalCurrent? }
  coordinatedMove(moves = []) {
    let dt = 0, anyStall = false, anyColl = false, okAll = true; const results = [];
    for (const mv of moves) {
      const r = this.moveRel(mv.axis != null ? mv.axis : mv.node, mv);
      results.push({ axis: mv.axis ?? mv.node, ...r });
      dt = Math.max(dt, r.dt || 0);
      if (r.stall) anyStall = true;
      if (r.collision) anyColl = true;
      if (!r.ok) okAll = false;
    }
    this.cycleTime += dt;
    return op(okAll, `coordinated move (${moves.length} axes) — ${dt.toFixed(3)}s${anyStall ? ' · STALL' : ''}${anyColl ? ' · COLLISION' : ''}`, anyStall ? 'stall' : anyColl ? 'collision' : 'ok', { dt, stall: anyStall, collision: anyColl, results });
  }

  // ---- core ----------------------------------------------------------------
  _applyDelta(p, mm) {
    // rotary / no-body axes: honor the command, advance the clock, no pose change
    if (!p.rendered && p.role !== 'hbot-a' && p.role !== 'hbot-b') {
      const dt = estDuration(mm, p.limitsMm); this.cycleTime += dt;
      return op(true, `${p.axis}: accepted (no twin body — ${dt.toFixed(3)}s)`, 'ok', { dt });
    }
    // hbot motor-level move (A / B): accumulate, derive joints x=(A+B)/2, y=(A-B)/2
    if (p.role === 'hbot-a' || p.role === 'hbot-b') {
      const dev = p.deviceId;
      const m = this.hbotMotor[dev] || this._syncMotorsFromJoints(dev);
      if (p.role === 'hbot-a') m.A += mm; else m.B += mm;
      const target = { x: (m.A + m.B) / 2, y: (m.A - m.B) / 2 };
      return this._planApply(dev, target, p.axis);
    }
    // ordinary joint move (linear p, or hbot logical x/y)
    const dev = p.deviceId, j = p.joint, cur = this.state[dev] || {};
    const target = { ...cur, [j]: (cur[j] || 0) + mm };
    return this._planApply(dev, target, p.axis);
  }

  _planApply(devId, target, label) {
    const dev = this.deck.getDevice(devId);
    if (!dev) return op(false, `no device '${devId}'`, 'unknown_device');
    // clamp to soft limits
    for (const k of Object.keys(target)) target[k] = clamp(target[k], 0, jointMax(dev, k));
    const move = planDeviceMove(this.deck, devId, target, this.state);
    if (!move) { this.state[devId] = { ...this.state[devId], ...target }; if (this.hbotMotor[devId]) this._syncMotorsFromJoints(devId); return op(true, `${label}: already there`, 'ok', { dt: 0 }); }
    const sim = simulateDevice(this.deck, devId, move, 120);
    this.state[devId] = target;
    if (this.hbotMotor[devId]) this._syncMotorsFromJoints(devId);
    const stall = sim.verdict.anyStall;
    const collision = this.deck.collisions(this.state).some((c) => c.violated);
    const peak = Math.max(...sim.motorKeys.map((k) => sim.verdict.peakUtil[k] || 0));
    this.cycleTime += move.T;
    return op(!stall && !collision, `${label}: ${move.T.toFixed(3)}s · peak ${Math.round(peak * 100)}%${stall ? ' · STALL' : ''}${collision ? ' · COLLISION' : ''}`, stall ? 'stall' : collision ? 'collision' : 'ok', { dt: move.T, stall, collision, peakUtil: peak });
  }

  _syncMotorsFromJoints(devId) {
    const s = this.state[devId] || {};
    const m = this.hbotMotor[devId] = { A: (s.x || 0) + (s.y || 0), B: (s.x || 0) - (s.y || 0) };
    return m;
  }

  // ---- introspection (status / telemetry) ----------------------------------
  status(nameOrNode) {
    const p = resolve(this.profiles, nameOrNode);
    if (!p) return null;
    const s = (p.deviceId && this.state[p.deviceId]) || {};
    const position = p.joint ? (s[p.joint] || 0) : 0;
    return {
      node: p.node ?? null, axis: p.axis, role: p.role,
      position, unit: 'mm',
      enabled: !!this.enabled[p.node ?? p.axis],
      moving: false, mode: 'twin', deviceId: p.deviceId, joint: p.joint,
    };
  }
  amps() { return this.profiles.filter((p) => p.node != null).map((p) => ({ node: p.node, axis: p.axis, role: p.role, board: p.board, channel: p.channel })); }
  telemetry() { return this.profiles.filter((p) => p.node != null).map((p) => this.status(p.node)); }
  pose() { return this.state; } // for the 3D surface
}

if (typeof globalThis !== 'undefined') {
  globalThis.PLANTBRIDGE = { PlantBridge };
}
