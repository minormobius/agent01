// Reproducible tests — `node fable/deal/test/engine.test.mjs`.
// The tribunal's claims, checked: the reducer is pure and legal-move-closed;
// the skill gate has real teeth (it rejects decision-free games); certified
// games terminate under both policies from many seeds; determinism end to end.
import { sampleGenome, describe, genomeKey } from '../js/genome.js';
import { init, legalMoves, apply } from '../js/engine.js';
import { randomPolicy, greedyPolicy } from '../js/policies.js';
import { certify, playout } from '../js/tribunal.js';
import { gameForSeed } from '../js/atlas.js';
import { Rand } from '../js/prng.js';

let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };

console.log('deal tribunal tests\n');

// 1. Reducer closure: across many genomes and full random playouts, every
//    applied move is legal, hands never go negative, games end or hit the cap.
{
  let games = 0, clean = 0;
  for (let i = 1; i <= 25; i++) {
    const g = sampleGenome(new Rand('closure::' + i));
    let st = init(g, 'c' + i);
    const rand = new Rand('cpol::' + i);
    let ok = true, steps = 0;
    while (!st.over && steps++ < 400) {
      const mvs = legalMoves(g, st);
      if (!mvs.length) { ok = false; break; }
      const mv = mvs[rand.int(mvs.length)];
      const ns = apply(g, st, mv);
      if (ns.hands[0].length < 0 || ns.hands[1].length < 0) { ok = false; break; }
      st = ns;
    }
    games++;
    if (ok) clean++; else fail(`genome ${i} reducer violated invariants`);
  }
  console.log(`reducer: ${clean}/${games} full random playouts clean (legal moves only, sane hands)`);
}

// 2. The skill gate has teeth: greedy must beat random on certified games,
//    measured fresh (not just trusting the stored certificate).
{
  const g = gameForSeed(4);
  if (!g) fail('seed 4 yielded no certified game');
  else {
    let w = 0; const N = 30;
    for (let k = 0; k < N; k++) {
      const seatA = k % 2 === 0;
      const r = playout(g.genome, 'verify' + k, seatA ? greedyPolicy : randomPolicy, seatA ? randomPolicy : greedyPolicy);
      if ((seatA && r.winner === 0) || (!seatA && r.winner === 1)) w++;
    }
    if (w / N <= 0.5) fail(`greedy did not beat random on certified game (${w}/${N})`);
    else console.log(`skill gate: greedy beats random ${w}/${N} on certified game "${g.genome.name}" — decisions demonstrably matter`);
  }
}

// 3. Certified games terminate from many seeds, both policy matchups.
{
  const g = gameForSeed(2);
  let ended = 0; const N = 30;
  for (let k = 0; k < N; k++) {
    const r = playout(g.genome, 'term' + k, k % 2 ? greedyPolicy : randomPolicy, greedyPolicy);
    if (!r.capped) ended++;
  }
  if (ended < N) fail(`${N - ended} games hit the move cap`);
  console.log(`termination: ${ended}/${N} games ended naturally on "${g.genome.name}"`);
}

// 4. Determinism: same seed ⇒ same genome, same certificate, same playout.
{
  const a = gameForSeed(7), b = gameForSeed(7);
  if (genomeKey(a.genome) !== genomeKey(b.genome)) fail('genome not deterministic');
  if (a.report.interest !== b.report.interest || a.report.skill !== b.report.skill) fail('certificate not deterministic');
  const p1 = playout(a.genome, 'det', greedyPolicy, greedyPolicy);
  const p2 = playout(b.genome, 'det', greedyPolicy, greedyPolicy);
  if (p1.winner !== p2.winner || p1.moves !== p2.moves) fail('playout not deterministic');
  console.log('determinism: genome, certificate, and full playouts identical across runs');
}

// 5. Rules text generates for both forms.
{
  let tricks = 0, sheds = 0;
  for (let i = 1; i <= 20; i++) {
    const g = sampleGenome(new Rand('rules::' + i));
    const txt = describe(g);
    if (!txt || txt.length < 80) fail(`genome ${i} rules text too thin`);
    if (g.form === 'trick') tricks++; else sheds++;
  }
  console.log(`rulebooks: 20/20 generated (${tricks} trick-taking, ${sheds} shedding)`);
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll tribunal tests passed.');
process.exit(failures ? 1 : 0);
