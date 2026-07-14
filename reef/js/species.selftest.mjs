// Selftest for the reef species generator. Run: node reef/js/species.selftest.mjs

import { generate, countCubes, SPECIES, GRID, NCELLS } from './species.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const coords = (c) => [Math.floor(c / (GRID * GRID)), Math.floor(c / GRID) % GRID, c % GRID];

function stats(v) {
  let n = 0, lo = [GRID, GRID, GRID], hi = [0, 0, 0], comZ = 0;
  for (let c = 0; c < NCELLS; c++) {
    if (!v[c]) continue;
    n++;
    const p = coords(c);
    for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
    comZ += p[2];
  }
  const span = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
  const bbox = span[0] * span[1] * span[2];
  return { n, span, density: n / bbox, comZ: comZ / n, minZ: lo[2] };
}

function connected(v) {
  let start = -1, total = 0;
  for (let c = 0; c < NCELLS; c++) if (v[c]) { total++; if (start < 0) start = c; }
  if (start < 0) return false;
  const seen = new Uint8Array(NCELLS);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const c = stack.pop();
    count++;
    const [a0, a1, a2] = coords(c);
    for (const [d0, d1, d2] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const b0 = a0 + d0, b1 = a1 + d1, b2 = a2 + d2;
      if (b0 < 0 || b1 < 0 || b2 < 0 || b0 >= GRID || b1 >= GRID || b2 >= GRID) continue;
      const nb = (b0 * GRID + b1) * GRID + b2;
      if (v[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
    }
  }
  return count === total;
}

const N_SEEDS = 40;
const per = SPECIES.map(() => []);
for (let sp = 0; sp < SPECIES.length; sp++) {
  for (let seed = 0; seed < N_SEEDS; seed++) per[sp].push(stats(generate(sp, seed)));
}

// determinism
{
  const a = generate(1, 123), b = generate(1, 123), c = generate(1, 124);
  check('deterministic by (species, seed)', a.every((v, i) => v === b[i]));
  check('different seeds differ', !a.every((v, i) => v === c[i]));
}

// connectivity + size for every specimen sampled
{
  let allConn = true, allSized = true, minN = 1e9, maxN = 0;
  for (let sp = 0; sp < SPECIES.length; sp++) {
    for (let seed = 0; seed < N_SEEDS; seed++) {
      const v = generate(sp, seed);
      if (!connected(v)) { allConn = false; console.log('  disconnected:', SPECIES[sp], seed); }
      const n = countCubes(v);
      minN = Math.min(minN, n); maxN = Math.max(maxN, n);
      if (n < 50 || n > 450) { allSized = false; console.log('  bad size:', SPECIES[sp], seed, n); }
    }
  }
  check('all specimens connected', allConn);
  check('all specimens 50..450 cubes', allSized, `range [${minN}, ${maxN}]`);
}

// gross morphology separations (means over seeds)
{
  const mean = (sp, f) => per[sp].reduce((s, x) => s + f(x), 0) / per[sp].length;
  const [FISH, EEL, RAY, JELLY, TURTLE, CORAL, ANEMONE] = [0, 1, 2, 3, 4, 5, 6];
  const flat = (sp) => mean(sp, (x) => x.span[2]);
  check('ray is flat', flat(RAY) <= 3.6, `z-span ${flat(RAY).toFixed(1)}`);
  check('turtle is low-slung', flat(TURTLE) <= 5 && mean(TURTLE, (x) => x.span[1]) > 6);
  const elong = (sp) => mean(sp, (x) => Math.max(...x.span) / Math.min(...x.span));
  check('eel is elongated', elong(EEL) > 2.2, elong(EEL).toFixed(2));
  check('coral is sparse', mean(CORAL, (x) => x.density) < 0.28, mean(CORAL, (x) => x.density).toFixed(2));
  check('fish is compact (2x coral density)', mean(FISH, (x) => x.density) > 2 * mean(CORAL, (x) => x.density),
    `${mean(FISH, (x) => x.density).toFixed(2)} vs ${mean(CORAL, (x) => x.density).toFixed(2)}`);
  check('jellyfish rides high', mean(JELLY, (x) => x.comZ) > 7.2, mean(JELLY, (x) => x.comZ).toFixed(1));
  check('anemone is rooted', mean(ANEMONE, (x) => x.minZ) <= 1.2 && mean(ANEMONE, (x) => x.comZ) < 7);
  check('coral is rooted and tall', mean(CORAL, (x) => x.minZ) <= 1.2 && mean(CORAL, (x) => x.span[2]) > 6);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good');
process.exit(failures ? 1 : 0);
