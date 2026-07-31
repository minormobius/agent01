#!/usr/bin/env node
// showcase.selftest.mjs — grows every showcase composition on the committed
// wasm.
//
// These are the elaborate ones, and they break in ways the presets do not: a
// composition wires several recursive cells together, so a width mismatch four
// stages down turns the whole piece into "cannot be grown" — which in a gallery
// is a blank canvas nobody reports. Anemone shipped broken exactly that way in
// draft, from a feedback bus four wires narrower than the wire it drove.
//
// Each piece also asserts the property it is *for*. A polyrhythm that has
// stopped sustaining itself, or an erosion that has stopped pruning, still
// grows perfectly well and is no longer the thing the notes describe.
//
//   node clock/morph/showcase/showcase.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const S = { cells: 0, edges: 1, buds: 3, maxDepth: 6, grown: 7, capped: 8, gates: 13, firings: 17, deaths: 18, regrowths: 19 };
const PARAM = { RATE: 6, THRESH: 7, LEAK: 8, STARVE: 9 };

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const { instance } = await WebAssembly.instantiate(readFileSync(join(HERE, '..', 'morph.wasm')), {});
const w = instance.exports;
const enc = new TextEncoder();
const dec = new TextDecoder();
const stats = () => new Float32Array(w.memory.buffer, w.stats_ptr(), 20);
const err = () => dec.decode(new Uint8Array(w.memory.buffer, w.err_ptr(), w.err_len()));
const compile = (src) => {
  const b = enc.encode(src);
  new Uint8Array(w.memory.buffer, w.src_ptr(), w.src_capacity()).set(b);
  return w.compile(b.length, 1337) === 1;
};
const growAll = () => {
  for (let i = 0; i < 8000; i++) {
    w.step(128, 0, 1);
    if (stats()[S.grown] === 1) return true;
  }
  return false;
};

const { PIECES } = await import('./pieces.js');
console.log('\nmorph showcase');

for (const p of PIECES) {
  if (!compile(p.src)) {
    check(p.name, false, err());
    continue;
  }
  const grown = growAll();
  const st = stats();
  const [gates, wires, depth, buds, capped] =
    [st[S.gates], st[S.edges], st[S.maxDepth], st[S.buds], st[S.capped]];
  check(
    p.name,
    grown && gates > 0 && buds === 0 && capped === 0 && wires > 0,
    `${gates} gates, ${wires} wires, depth ${depth}`,
  );

  // Apply the piece's own settings, since most of them do not work without.
  const s = { waves: 1.4, threshold: 0.5, leak: 0.3, starve: 0, ...p.settings };
  w.set_param(PARAM.THRESH, s.threshold);
  w.set_param(PARAM.LEAK, s.leak);
  w.set_param(PARAM.STARVE, s.starve);
  w.set_param(PARAM.RATE, s.waves === 0 ? 40 : s.waves);
  w.step(0, 0, 1);
  if (s.waves === 0) w.set_param(PARAM.RATE, 0); // one kick, then no driver
  for (let i = 0; i < 400; i++) w.step(s.grow ?? 2, 1, 1);

  let fired = 0;
  for (let i = 0; i < 600; i++) {
    w.step(s.grow ?? 2, 1, 1);
    fired += stats()[S.firings];
  }
  check(`  …${p.name} conducts`, fired > 0, `${fired} firings`);

  // The property each piece exists to show.
  if (s.waves === 0) {
    check(`  …${p.name} sustains with no driver`, fired > 0, `${fired} firings after the kick`);
  }
  if (s.starve > 0) {
    const st2 = stats();
    check(
      `  …${p.name} prunes and regrows`,
      st2[S.deaths] > 0 && st2[S.regrowths] > 0,
      `${st2[S.deaths]} died, ${st2[S.regrowths]} regrown`,
    );
  }
  w.set_param(PARAM.THRESH, 0.5);
  w.set_param(PARAM.STARVE, 0);
  w.set_param(PARAM.RATE, 1.4);
}

// The polyrhythm's notes make an arithmetic claim — five wires per voice, ring
// length n+1, so 5 × (5 + 8 + 12 + 19) gates and one driver each. Gate count
// equal to wire count is what says they are twenty disjoint rings rather than
// anything cross-wired.
{
  compile(PIECES.find((p) => p.name === 'polyrhythm').src);
  growAll();
  const st = stats();
  const want = 5 * (5 + 8 + 12 + 19);
  check(
    'polyrhythm is twenty rings of four lengths',
    st[S.gates] === want && st[S.edges] === want,
    `${st[S.gates]} gates, ${st[S.edges]} wires, wanted ${want} of each`,
  );
}

// The carry-save piece exists to be compared against erosion, so the claim in
// its notes — two orders of magnitude of depth for the same gates — is checked
// rather than asserted in prose.
{
  const depthOf = (name) => {
    compile(PIECES.find((p) => p.name === name).src);
    growAll();
    return stats()[S.maxDepth];
  };
  const shallow = depthOf('carry-save');
  const deep = depthOf('erosion');
  check(
    'carry-save is far shallower than the ripple bank',
    deep > shallow * 10,
    `${shallow} against ${deep}`,
  );
}

console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
