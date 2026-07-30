#!/usr/bin/env node
// morph.selftest.mjs — runs the committed wasm engine headless and checks that
// it still grows the structures the page exists to show.
//
// The Rust side has its own `cargo test` suite (solver/tests/structure.rs);
// this is the check that the *artefact in this directory* — morph.wasm, the one
// the browser actually downloads — matches that source and still behaves. That
// distinction matters here: the wasm is a committed build product, so it can
// silently go stale.
//
//   node clock/morph/morph.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE_STRIDE = 6;
const EDGE_STRIDE = 5;
const EVENT_STRIDE = 4;
const STAT_COUNT = 16;
const S = {
  cells: 0, edges: 1, total: 2, buds: 3, energy: 4, meanDegree: 5,
  maxDepth: 6, grown: 7, capped: 8, gates: 13, frame: 14,
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const { instance } = await WebAssembly.instantiate(readFileSync(join(HERE, 'morph.wasm')), {});
const w = instance.exports;

const enc = new TextEncoder();
const dec = new TextDecoder();
const stats = () => new Float32Array(w.memory.buffer, w.stats_ptr(), STAT_COUNT);
const nodes = () => new Float32Array(w.memory.buffer, w.node_ptr(), w.node_count() * NODE_STRIDE);
const edges = () => new Float32Array(w.memory.buffer, w.edge_ptr(), w.edge_count() * EDGE_STRIDE);
const err = () => dec.decode(new Uint8Array(w.memory.buffer, w.err_ptr(), w.err_len()));

const compile = (src, seed = 7) => {
  const bytes = enc.encode(src);
  new Uint8Array(w.memory.buffer, w.src_ptr(), w.src_capacity()).set(bytes);
  return w.compile(bytes.length, seed) === 1;
};

/** Grow to completion, relaxing as we go, exactly as the page does. */
const grow = (frames = 4000) => {
  for (let i = 0; i < frames; i++) {
    w.step(64, 1, 1);
    if (stats()[S.grown] === 1) return i + 1;
  }
  return -1;
};

console.log('\nmorph engine (wasm)');

// 1. the ABI the JS glue assumes
check(
  'layout matches solver.js',
  w.layout(0) === NODE_STRIDE &&
    w.layout(1) === EDGE_STRIDE &&
    w.layout(2) === EVENT_STRIDE &&
    w.layout(3) === STAT_COUNT,
  `${w.layout(0)}/${w.layout(1)}/${w.layout(2)}/${w.layout(3)}`,
);
check('cell ceiling is reported', w.layout(4) >= 1000, `${w.layout(4)}`);

// 2. the triangle: N(N-1) gates, the same count cargo test asserts natively
const TRIANGLE = `
gate NOT 1
gate XOR 2
cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    z = NOT(y)
    return triangle(z)
}
grow triangle(32)
`;
check('triangle(32) compiles', compile(TRIANGLE), err());
let took = grow();
check('triangle(32) finishes growing', took > 0, `${took} frames`);
check('triangle(32) is 992 gates', stats()[S.gates] === 992, `${stats()[S.gates]}`);
check('nothing left unexpanded', stats()[S.buds] === 0, `${stats()[S.buds]} buds`);

// 3. buffers agree with the stats, and hold finite coordinates
{
  const n = nodes();
  const e = edges();
  check('node buffer matches cell count', n.length / NODE_STRIDE === stats()[S.cells]);
  check('edge buffer matches edge count', e.length / EDGE_STRIDE === stats()[S.edges]);
  check('every node is somewhere', n.every(Number.isFinite) && n.length > 0);
  check('every edge is somewhere', e.every(Number.isFinite) && e.length > 0);
  // A triangle of 992 gates is a connected sheet: far more edges than nodes.
  check('the sheet is wired up', stats()[S.edges] > stats()[S.cells], `${stats()[S.edges]} edges`);
  check('depth colouring has a range', stats()[S.maxDepth] > 4, `depth ${stats()[S.maxDepth]}`);
}

// 4. the layout actually moves and then settles
{
  const before = nodes().slice();
  for (let i = 0; i < 60; i++) w.step(0, 4, 1);
  const after = nodes();
  let moved = 0;
  for (let i = 0; i < after.length; i += NODE_STRIDE) {
    if (Math.abs(after[i] - before[i]) > 1e-4 || Math.abs(after[i + 1] - before[i + 1]) > 1e-4) moved++;
  }
  check('relaxation moves the structure', moved > 0, `${moved} nodes moved`);
  for (let i = 0; i < 2000; i++) w.step(0, 4, 1);
  const st = stats();
  check('and it stays finite', Number.isFinite(st[S.energy]) && st[S.energy] >= 0, `energy ${st[S.energy].toExponential(2)}`);
  check('the bounding box is sane', Number.isFinite(st[9]) && st[11] > st[9], `x ${st[9].toFixed(1)}..${st[11].toFixed(1)}`);
}

// 5. events are emitted for the sonification, and drain
{
  check('events compile', compile(TRIANGLE, 11), err());
  w.step(200, 1, 1);
  const n = w.drain_events();
  check('growth emits events', n > 0, `${n} events`);
  const ev = new Float32Array(w.memory.buffer, w.event_ptr(), n * EVENT_STRIDE);
  check('events carry a depth', ev.length > 0 && ev[1] > 0);
  check('events drain once', w.drain_events() === 0);
}

// 6. the ripple adder — the case that exercises fallback to another cell
{
  const src = `
gate XOR3 3
gate MAJ3 3
cell full_adder(a, b, c) {
    s = XOR3(a, b, c)
    co = MAJ3(a, b, c)
    return s, co
}
cell ripple(a, b, c) fallback full_adder {
    a0, a1 = SPLIT(a)
    b0, b1 = SPLIT(b)
    s0, cm = ripple(a0, b0, c)
    s1, co = ripple(a1, b1, cm)
    s = CAT(s0, s1)
    return s, co
}
grow ripple(32, 32, 1)
`;
  check('ripple adder compiles', compile(src), err());
  took = grow();
  check('ripple adder finishes', took > 0, `${took} frames`);
  check('32-bit ripple is 64 gates', stats()[S.gates] === 64, `${stats()[S.gates]}`);
}

// 7. a bad program reports rather than growing something wrong
{
  const ok = compile('gate G 2\ncell c(x) { return H(x, x) }\ngrow c(4)\n');
  check('unknown gate is rejected', !ok);
  check('with a message', /unknown/i.test(err()), err());
  check('and the canvas is emptied', w.node_count() === 0);
}

// 8. a non-narrowing recursion must not hang the tab
{
  const ok = compile('gate NOT 1\ncell loop(x) fallback %0 {\n  return loop(NOT(x))\n}\ngrow loop(4)\n');
  check('non-narrowing recursion compiles', ok, err());
  took = grow(200);
  check('and terminates immediately', took > 0 && stats()[S.gates] === 0, `${took} frames, ${stats()[S.gates]} gates`);
}

// 9. every preset the page ships must actually resolve and finish growing.
// This is the check that stops a broken program reaching the gallery as an
// empty canvas that only somebody clicking through would ever notice.
{
  const { PRESETS } = await import('./presets.js');
  for (const p of PRESETS) {
    if (!compile(p.src, 7)) {
      check(`preset ${p.name}`, false, err());
      continue;
    }
    const frames = grow();
    const st = stats();
    check(
      `preset ${p.name}`,
      frames > 0 && st[S.gates] > 0 && st[S.buds] === 0 && st[S.capped] === 0,
      `${st[S.gates]} gates, ${st[S.edges]} wires, depth ${st[S.maxDepth]}`,
    );
    // A structure with no wires renders as a cloud of unconnected dots. The
    // ring preset was exactly that before it was replaced, so it is checked.
    check(`  …and is wired up`, st[S.edges] > 0, `${st[S.edges]} wires`);
  }
}

console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
