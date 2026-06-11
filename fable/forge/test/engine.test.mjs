// Reproducible tests — `node fable/forge/test/engine.test.mjs`.
// The foundry's three claims, each checked: (1) the DSL is CLOSED — every
// genome compiles to a total deterministic step; (2) fingerprints SEPARATE the
// hand-written laws (so novelty is real); (3) every admitted law is PLAYABLE —
// the oracle's path replays to a win — and the codex is deterministic.
import { sampleLaw, compile, lawKey, GENES, GENE_KEYS, KNOWN_LAWS } from '../js/dsl.js';
import { fingerprint, fpDistance } from '../js/fingerprint.js';
import { buildCodex } from '../js/foundry.js';
import { puzzleFor } from '../js/atlas.js';
import { initialState, isWin } from '../js/engine.js';
import { Rand } from '../js/prng.js';

let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };

console.log('forge foundry tests\n');

// 1. Closure + determinism of the DSL: random genomes compile to total,
//    deterministic step functions (same input ⇒ same output, no throws).
{
  let ok = 0; const N = 120;
  for (let n = 1; n <= N; n++) {
    const law = sampleLaw(new Rand('forge-closure::' + n));
    const step = compile(law);
    const fp = fingerprint(step);
    if (!Number.isFinite(fp.volume)) { fail(`law ${n} fingerprint NaN`); continue; }
    // determinism: re-run a probe transition twice
    const { makeWorld, initialState: init } = await import('../js/engine.js');
    const w = makeWorld(5, 5, { agent0: 0, exit: 24 });
    const s = init(w);
    const a = step(w, s, 1), b = step(w, s, 1);
    if (JSON.stringify(a && [...a.marks]) !== JSON.stringify(b && [...b.marks]) || (a && a.agent) !== (b && b.agent)) { fail(`law ${n} not deterministic`); continue; }
    ok++;
  }
  console.log(`closure: ${ok}/${N} random genomes compile to total, deterministic, finite-fingerprint laws`);
}

// 2. Fingerprints separate the four hand-written laws (novelty has signal).
{
  const fps = KNOWN_LAWS.map((k) => fingerprint(compile(k.law)));
  let minD = Infinity;
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) minD = Math.min(minD, fpDistance(fps[i], fps[j]));
  if (minD < 0.08) fail(`known laws too close in fingerprint space (${minD.toFixed(3)})`);
  console.log(`fingerprints: 4 known laws separate, min pairwise distance ${minD.toFixed(3)}`);
}

// 3. The foundry admits novel + playable laws; each admitted law's sample
//    puzzle path replays to a win; codex is deterministic.
{
  const { codex, stats } = buildCodex(6);
  if (codex.length < 6) fail(`only ${codex.length}/6 laws admitted`);
  let replays = 0;
  for (const e of codex) {
    if (e.noveltyDist < 0.22) fail(`${e.name} admitted below novelty floor (${e.noveltyDist.toFixed(2)})`);
    const pz = puzzleFor(e, 1);
    if (!pz) { fail(`${e.name} has no playable puzzle`); continue; }
    let s = initialState(pz.world); let good = true;
    for (const d of pz.solve.path) { const ns = pz.stepFn(pz.world, s, d); if (!ns) { good = false; break; } s = ns; }
    if (good && isWin(pz.world, s)) replays++; else fail(`${e.name} oracle path does not replay to a win`);
  }
  console.log(`foundry: scanned ${stats.scanned} → ${stats.admitted} admitted (${stats.inert} inert, ${stats.derivative} derivative); ${replays}/${codex.length} sample puzzles replay-verified`);
  // determinism
  const c2 = buildCodex(6).codex;
  const same = codex.every((e, i) => e.key === c2[i].key);
  if (!same) fail('codex not deterministic'); else console.log('determinism: the n-th discovered law is identical across runs');
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll foundry tests passed.');
process.exit(failures ? 1 : 0);
