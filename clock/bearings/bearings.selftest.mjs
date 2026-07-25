#!/usr/bin/env node
// bearings.selftest.mjs — runs the committed wasm solver headless and checks
// that the physics still does the thing the page exists to show.
//
// The Rust side has its own `cargo test` suite (solver/tests/physics.rs); this
// is the check that the *artefact in this directory* — bearings.wasm, the one
// the browser actually downloads — matches the source and still behaves. That
// distinction matters here: the wasm is a committed build product, so it can
// silently go stale.
//
//   node clock/bearings/bearings.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BALL_STRIDE = 12;
const EDGE_STRIDE = 6;
const STAT_COUNT = 18;
const S = { current: 0, closed: 1, chains: 2, maxSpeed: 3, cgIters: 5, time: 8, longestChain: 11, n: 13, reach: 14, pin: 16, supply: 17 };
const P = { VOLTAGE: 0, VISCOSITY: 1, CHARGE: 2, CHAIN: 3, NOISE: 4, POLARITY: 8 };

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const { instance } = await WebAssembly.instantiate(readFileSync(join(HERE, 'bearings.wasm')), {});
const w = instance.exports;

const stats = () => new Float32Array(w.memory.buffer, w.stats_ptr(), STAT_COUNT);
const balls = () => new Float32Array(w.memory.buffer, w.ball_ptr(), w.ball_count() * BALL_STRIDE);
const edges = () => new Float32Array(w.memory.buffer, w.edge_ptr(), w.edge_count() * EDGE_STRIDE);
const run = (seconds, sub = 12) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) w.step(1 / 60, sub);
};

console.log('\nbearings solver (wasm)');

// 1. the ABI the JS glue assumes
check(
  'layout matches solver.js',
  w.layout(0) === BALL_STRIDE && w.layout(1) === EDGE_STRIDE && w.layout(2) === STAT_COUNT,
  `wasm says ${w.layout(0)}/${w.layout(1)}/${w.layout(2)}`,
);
check(
  'exports the whole interface',
  ['init', 'step', 'set_param', 'stir', 'shake', 'ball_ptr', 'ball_count', 'edge_ptr', 'edge_count', 'stats_ptr', 'memory']
    .every((k) => k in w),
);

// 2. an unpowered cell is a dead still cell
w.init(400, 5);
w.set_param(P.VOLTAGE, 0);
w.set_param(P.NOISE, 0);
run(4);
{
  const s = stats();
  check('unpowered: no current', s[S.current] === 0, `${s[S.current]}`);
  check('unpowered: open circuit', s[S.closed] === 0);
  check('unpowered: settles', s[S.maxSpeed] < 0.02, `max speed ${s[S.maxSpeed].toFixed(4)}`);
}

// 3. powered, the bearings build a wire and close the circuit
w.init(520, 7);
w.set_param(P.VOLTAGE, 13 / 30); // the page's default dial position
w.set_param(P.NOISE, 0.05);
let closedAt = null;
for (let i = 0; i < 60 * 45 && closedAt === null; i++) {
  w.step(1 / 60, 12);
  if (stats()[S.closed] > 0.5) closedAt = stats()[S.time];
}
check('powered: assembles a path to ground', closedAt !== null, closedAt === null ? 'never closed in 45 s' : `closed at ${closedAt.toFixed(1)} s`);
{
  const s = stats();
  check('powered: draws current once closed', s[S.current] > 1e-3, `${s[S.current].toFixed(4)}`);
  check('powered: the wire spans the cell', s[S.reach] > 0.95, `reach ${s[S.reach].toFixed(2)}`);
  check('powered: the supply sags under load', Math.abs(s[S.pin]) < Math.abs(s[S.supply]),
    `pin ${s[S.pin].toFixed(3)} of ${s[S.supply].toFixed(3)}`);
  check('powered: chains are long', s[S.longestChain] >= 20, `longest ${s[S.longestChain]}`);
}

// 4. the render buffers are sane — this is what the GPU reads verbatim
{
  const b = balls();
  const e = edges();
  check('ball buffer has one record per bearing', b.length === w.ball_count() * BALL_STRIDE);
  check('ball buffer is finite', b.every(Number.isFinite));
  let inCup = true, unitQuat = true, normalised = true;
  for (let i = 0; i < b.length; i += BALL_STRIDE) {
    const [x, y, r, q, v] = [b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4]];
    if (Math.hypot(x, y) + r > 1.001) inCup = false;
    if (Math.abs(q) > 1 || Math.abs(v) > 1) normalised = false;
    const n = b[i + 6] ** 2 + b[i + 7] ** 2 + b[i + 8] ** 2 + b[i + 9] ** 2;
    if (Math.abs(n - 1) > 1e-3) unitQuat = false;
  }
  check('every bearing is inside the cup', inCup);
  check('charge and potential arrive normalised', normalised);
  check('orientation quaternions stay unit', unitQuat);
  check('edge buffer is a whole number of edges', e.length % EDGE_STRIDE === 0 && e.every(Number.isFinite));
}

// 5. stirring and shaking cannot break it
w.stir(0.3, 0.2, 4, -3, 0.25);
w.shake(2.5);
run(3);
{
  const s = stats();
  const b = balls();
  check('survives stir + shake', b.every(Number.isFinite) && Number.isFinite(s[S.current]));
}

// 6. determinism — same seed, same cell
const fingerprint = (seed) => {
  w.init(200, seed);
  w.set_param(P.VOLTAGE, 0.6);
  run(2);
  return Array.from(balls().slice(0, 40)).join(',');
};
check('same seed reproduces the same cell', fingerprint(99) === fingerprint(99));
check('different seeds differ', fingerprint(99) !== fingerprint(100));

// 7. polarity really reverses the cell
const polarityCurrent = (pol) => {
  w.init(400, 3);
  w.set_param(P.POLARITY, pol);
  w.set_param(P.VOLTAGE, 1);
  run(6);
  return stats()[S.current];
};
{
  const pos = polarityCurrent(1);
  const neg = polarityCurrent(-1);
  check('polarity flips the current', pos > 0 && neg < 0, `${pos.toFixed(4)} / ${neg.toFixed(4)}`);
}

// 8. it has to be fast enough to animate
w.init(520, 11);
w.set_param(P.VOLTAGE, 0.5);
run(1);
{
  const t0 = performance.now();
  run(2);
  const ms = (performance.now() - t0) / 120;
  check('steps in well under a frame', ms < 14, `${ms.toFixed(1)} ms/frame at 520 bearings`);
}

console.log(failures ? `\n✗ ${failures} check(s) failed\n` : '\n✓ bearings solver ok\n');
process.exit(failures ? 1 : 0);
