// engine.js — the bridge to tempest.wasm.
//
// The wasm module exports plain integers and one shared buffer; there is no
// wasm-bindgen glue to keep in step, so this file *is* the interface. Read
// `core/src/wasm.rs` alongside it — the two halves of the ABI are documented
// there and implemented here, and nowhere else.
//
// Everything is namespaced onto globalThis.Tempest so the page can stay
// script-tag simple, like every other game on this surface.

(function () {
  'use strict';

  // Must match `pack::encode_wire` in the Rust. Ten words per threat.
  const WIRE_THREAT_WORDS = 10;
  const DIR = { cw: 0, ccw: 1, still: 2 };
  const KIND = { flipper: 0, tanker: 1, spiker: 2 };

  const STATE_HEADER = 10;
  const STATE_THREAT = 5;
  const STATE_SHOT = 2;

  const ACTION = { hold: 0, fire: 1, cw: 2, ccw: 3 };
  const OUTCOME = ['running', 'cleared', 'breached', 'stalled'];

  let mod = null;

  /**
   * Instantiate from bytes already in hand. Split out from `load` so the node
   * selftest can drive the *shipped* engine.js rather than a reimplementation
   * of it — a drift gate is worth nothing if the two sides are different code.
   */
  async function loadBytes(bytes) {
    // No imports at all: the module allocates inside its own linear memory and
    // never calls out. That is why it is 60-odd KB and why it cannot surprise
    // the page it is running in.
    const { instance } = await WebAssembly.instantiate(bytes, {});
    mod = instance.exports;
    return { epoch: mod.tp_epoch() };
  }

  /** Load tempest.wasm. Resolves once the module is ready to take a level. */
  async function load(url) {
    const res = await fetch(url || './tempest.wasm');
    if (!res.ok) throw new Error(`tempest.wasm: ${res.status}`);
    return loadBytes(await res.arrayBuffer());
  }

  function mem32() {
    return new Int32Array(mod.memory.buffer);
  }

  /**
   * Flatten a wave from levels.json into the wire format.
   * Mirrors `pack::encode_wire`; if you change one, change both.
   */
  function encode(web, wave) {
    const words = [web.lanes, web.closed ? 1 : 0, wave.threats.length];
    for (let i = 0; i < web.lanes; i++) {
      // Open webs publish lanes-1 costs; the last slot is never travelled.
      words.push(i < web.step.length ? web.step[i] : 22);
    }
    for (const t of wave.threats) {
      words.push(KIND[t.kind]);
      words.push(t.climb);
      words.push(t.flipPeriod);
      words.push(DIR[t.flipDir]);
      if (t.entry) {
        words.push(1, t.entry.lane, t.entry.depth, t.entry.tick);
      } else {
        words.push(0, 0, 0, 0);
      }
      words.push(t.parent);
      words.push(DIR[t.side]);
    }
    if (words.length !== 3 + web.lanes + wave.threats.length * WIRE_THREAT_WORDS) {
      throw new Error('wire encoding is the wrong length');
    }
    return Int32Array.from(words);
  }

  /** One wave in progress. */
  class Run {
    constructor(web, wave, startLane) {
      if (!mod) throw new Error('tempest.wasm not loaded');
      this.web = web;
      this.wave = wave;
      const words = encode(web, wave);
      const bytes = words.length * 4;
      this.ptr = mod.tp_alloc(bytes);
      if (!this.ptr) throw new Error('tempest.wasm refused the allocation');
      mem32().set(words, this.ptr >> 2);
      this.handle = mod.tp_new(this.ptr, words.length, startLane);
      mod.tp_free(this.ptr, bytes);
      this.ptr = 0;
      if (this.handle < 0) throw new Error('tempest.wasm rejected the wave');
      this.startLane = startLane;
    }

    step(action) {
      return OUTCOME[mod.tp_step(this.handle, action)] || 'running';
    }

    reset(startLane) {
      this.startLane = startLane;
      mod.tp_reset(this.handle, startLane);
    }

    /**
     * Read the snapshot. Allocates one small object per call, which at 60 Hz
     * is fine and keeps the renderer honest about what it is drawing.
     */
    state() {
      const ptr = mod.tp_state(this.handle);
      const len = mod.tp_state_len(this.handle);
      const m = mem32();
      const base = ptr >> 2;
      const v = m.subarray(base, base + len);
      const threatCount = v[8];
      const shotCount = v[9];
      const threats = [];
      for (let i = 0; i < threatCount; i++) {
        const o = STATE_HEADER + i * STATE_THREAT;
        threats.push({
          alive: v[o] === 1,
          active: v[o + 1] === 1,
          lane: v[o + 2],
          depth: v[o + 3],
          kind: v[o + 4],
        });
      }
      const shots = [];
      const shotBase = STATE_HEADER + threatCount * STATE_THREAT;
      for (let i = 0; i < shotCount; i++) {
        const o = shotBase + i * STATE_SHOT;
        shots.push({ lane: v[o], depth: v[o + 1] });
      }
      return {
        tick: v[0],
        outcome: OUTCOME[v[1]] || 'running',
        lane: v[2],
        fromLane: v[3],
        transit: v[4],
        canFire: v[5] === 1,
        settled: v[6] === 1,
        kills: v[7],
        threats,
        shots,
      };
    }

    /** Is the rim still holdable? Costs real work — ask sparingly. */
    holdable() {
      return mod.tp_holdable(this.handle) === 1;
    }

    /** Which openings from here still hold: { cw, ccw, stand }. */
    openings() {
      const mask = mod.tp_openings(this.handle);
      if (mask < 0) return null;
      return { cw: !!(mask & 1), ccw: !!(mask & 2), stand: !!(mask & 4) };
    }

    /** Every kill so far: { threat, tick, lane, depth }. */
    kills() {
      const ptr = mod.tp_kills(this.handle);
      const len = mod.tp_kills_len(this.handle);
      const m = mem32();
      const base = ptr >> 2;
      const out = [];
      for (let i = 0; i < len; i += 4) {
        out.push({
          threat: m[base + i],
          tick: m[base + i + 1],
          lane: m[base + i + 2],
          depth: m[base + i + 3],
        });
      }
      return out;
    }

    /** Ticks of margin left under one opening: 0 cw, 1 ccw, 2 stand. */
    slack(opening) {
      return mod.tp_slack(this.handle, opening);
    }

    /** The verdict on the run just played. */
    autopsy() {
      const ptr = mod.tp_autopsy(this.handle);
      const len = mod.tp_autopsy_len(this.handle);
      const bytes = new Uint8Array(mod.memory.buffer, ptr, len);
      return {
        verdict: new TextDecoder().decode(bytes),
        lostAt: mod.tp_lost_at(this.handle),
        doomedFor: mod.tp_doomed_for(this.handle),
      };
    }

    dispose() {
      if (this.handle >= 0) mod.tp_drop(this.handle);
      this.handle = -1;
    }
  }

  globalThis.Tempest = Object.assign(globalThis.Tempest || {}, {
    load,
    loadBytes,
    Run,
    ACTION,
    KIND,
    DIR,
    encode,
  });
})();
