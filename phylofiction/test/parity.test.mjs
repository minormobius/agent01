/* phylofiction — WASM ⇄ JS parity. Guards the committed engine/phylofiction.wasm
 * against the JS reference engine: same seed → same world on both backends, so
 * the WASM accelerator and the JS fallback are interchangeable and a permalink
 * is stable. Run:  node --test test/parity.test.mjs
 *
 * If this fails after editing the engine, rebuild the artifact:
 *   cd engine-rs && cargo build --target wasm32-unknown-unknown --release
 *   cp target/wasm32-unknown-unknown/release/phylofiction_engine.wasm ../engine/phylofiction.wasm
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evolveWorld } from "../js/evolve.js";

const wasmPath = fileURLToPath(new URL("../engine/phylofiction.wasm", import.meta.url));
const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), {});
const ex = instance.exports;
const dec = new TextDecoder();
const wasmWorld = (n) => {
  const ptr = ex.evolve(n >>> 0);
  const len = ex.result_len();
  return JSON.parse(dec.decode(new Uint8Array(ex.memory.buffer, ptr, len)));
};
const approx = (a, b) => Math.abs(a - b) <= 1e-9;

test("wasm exports the expected ABI", () => {
  for (const fn of ["evolve", "result_len", "find_seed", "engine_version", "memory"]) {
    assert.ok(fn in ex, "missing export " + fn);
  }
  assert.equal(ex.engine_version(), 1);
});

test("wasm and JS engines are bit-identical (seeds 0..79)", () => {
  for (let n = 0; n < 80; n++) {
    const j = evolveWorld(n), w = wasmWorld(n);
    assert.deepEqual(w.summary, j.summary, `summary mismatch @${n}`);
    // score: integers exact, reversal within fp tolerance
    for (const k of ["disparity", "convergence", "innovation", "extinctionPulses", "oxygenated"])
      assert.equal(w.score[k], j.score[k], `score.${k} @${n}`);
    assert.ok(approx(w.score.reversal, j.score.reversal), `score.reversal @${n}`);

    assert.equal(w.tree.nodes.length, j.tree.nodes.length, `node count @${n}`);
    for (let i = 0; i < j.tree.nodes.length; i++) {
      const a = j.tree.nodes[i], b = w.tree.nodes[i];
      assert.equal(b.id, a.id, `id @${n}#${i}`);
      assert.equal(b.parentId, a.parentId, `parent @${n}#${i}`);
      assert.equal(b.birth, a.birth, `birth @${n}#${i}`);
      assert.equal(b.last, a.last, `last @${n}#${i}`);
      assert.equal(b.extinct, a.extinct, `extinct @${n}#${i}`);
      assert.equal(b.deathCause, a.deathCause, `deathCause @${n}#${i}`);
      assert.equal(b.dominant, a.dominant, `dominant @${n}#${i}`);
      assert.deepEqual(b.caps, a.caps, `caps @${n}#${i}`);
      assert.ok(approx(b.genome.oxidantTolerance, a.genome.oxidantTolerance), `O2tol @${n}#${i}`);
    }

    assert.equal(w.events.length, j.events.length, `event count @${n}`);
    for (let i = 0; i < j.events.length; i++) {
      assert.equal(w.events[i].epoch, j.events[i].epoch, `event.epoch @${n}#${i}`);
      assert.equal(w.events[i].kind, j.events[i].kind, `event.kind @${n}#${i}`);
      assert.equal(w.events[i].gloss, j.events[i].gloss, `event.gloss @${n}#${i}`);
    }
  }
});

test("wasm find_seed matches the JS interestingness filter", () => {
  // Rust scans entirely in-engine; the result must equal a seed that both
  // engines agree oxygenated with a survivorship reversal.
  const s = ex.find_seed(0, 300);
  assert.ok(s >= 0, "no interesting seed found");
  const w = wasmWorld(s), j = evolveWorld(s);
  assert.ok(w.summary.oxygenated && j.summary.oxygenated);
  assert.ok(w.score.reversal > 0.2 && j.score.reversal > 0.2);
});
