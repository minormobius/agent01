#!/usr/bin/env node
// lab.selftest.mjs — known-answer checks for the scorer.
//
// A measuring instrument that nobody measures is a way of being confidently
// wrong at scale: every conclusion in the lab's README came out of this file's
// subject, and a scorer that quietly stopped reading the event stream would
// still print a plausible table. So the checks here are cases whose answer is
// known before running:
//
//   * a finished DAG under a periodic driver **must** come out exactly periodic
//     and drift-free. That is not an observation about these programs, it is
//     arithmetic: pitch is a function of depth, depth stops changing when
//     growth stops, and the injector repeats.
//   * the polyrhythm **must** come out aperiodic, because its ring lengths
//     share no factors. It did not, once — that is how the flat-depth bug was
//     found — so this is a regression guard with a story behind it.
//   * the constants mirrored from audio.js **must** still match audio.js.
//
//   node clock/morph/lab/lab.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEngine, measure, score, pluckSemitone, SCALE, MAX_FIRES_PER_FRAME } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('\nmorph lab');

// ---- the mirrored constants -----------------------------------------------
// score.mjs cannot import audio.js — that module is written for a browser — so
// it keeps copies. A copy nobody checks is a copy that drifts, and a drifted
// pitch map means every number in the lab is measuring a sonifier that does not
// exist.
{
  const audio = readFileSync(join(HERE, '..', 'audio.js'), 'utf8');
  const scale = audio.match(/const SCALE = \[([^\]]*)\]/);
  const fires = audio.match(/MAX_FIRES_PER_FRAME = (\d+)/);
  const step = audio.match(/const step = Math\.round\(t \* (\d+)\)/);
  check(
    'the pitch map still matches audio.js',
    scale && fires && step
      && scale[1].split(',').map((s) => +s.trim()).join() === SCALE.join()
      && +fires[1] === MAX_FIRES_PER_FRAME
      && +step[1] === 14,
    scale && fires && step ? `scale [${scale[1].trim()}], ${fires[1]}/frame, step ×${step[1]}` : 'could not read audio.js',
  );
  // And the formula itself, at the two ends and the middle.
  check(
    'pluckSemitone reproduces the sonifier',
    pluckSemitone(0, 40) === 24 && pluckSemitone(40, 40) === 12 * 4 + SCALE[4] && pluckSemitone(20, 40) === 12 * 3 + SCALE[2],
    `${pluckSemitone(0, 40)} → ${pluckSemitone(20, 40)} → ${pluckSemitone(40, 40)}`,
  );
}

const eng = await loadEngine();

// ---- the period detector itself ------------------------------------------
// On a synthetic transcript, because the engine does not hand you a clean one:
// the injection interval is `depth / rate` and therefore fractional, so a
// finished DAG is *quasi*-periodic — it comes round to almost the same place
// forever without ever exactly repeating. That is a genuine property of the
// driver rather than a defect, and it means "period ∞" from a real piece is
// weaker evidence than it looks. Hence checking the detector where the answer
// is known exactly.
{
  const cycle = [[24], [36, 41], [48], [41], [], [36]];
  const ticks = [];
  for (let i = 0; i < 900; i++) {
    ticks.push({ notes: cycle[i % cycle.length], fired: 1, births: 0, deaths: 0, maxDepth: 20, gates: 100 });
  }
  const r = score(ticks);
  check('the period detector finds a known cycle', r.period === cycle.length, `found ${r.period}, planted ${cycle.length}`);
  check('…and reports no drift on a still structure', r.drift === 0 && r.massDrift === 0, `drift ${r.drift}`);

  const noisy = ticks.map((t, i) => ({ ...t, maxDepth: 20 + (i % 37) }));
  check('…and does report drift when the depth moves', score(noisy).drift > 5, `drift ${score(noisy).drift.toFixed(1)}`);
}

// ---- a finished DAG cannot morph ------------------------------------------
// Not an observation about this program: pitch is a function of depth, and a
// structure that has stopped growing and is not starving has fixed depths. So
// the notes can only ever be reordered, never retuned. This is the arithmetic
// behind "there is no texture in the morphing" — there is no morphing.
const TRIANGLE = `
gate XOR 2
gate NOT 1
cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    z = NOT(y)
    return triangle(z)
}
grow triangle(24)
`;
{
  const r = await measure(eng, TRIANGLE, { waves: 1.4, threshold: 0.5, starve: 0 }, 1500);
  check(
    'a finished DAG cannot drift in pitch',
    r.drift === 0 && r.churn === 0 && r.massDrift === 0,
    `depth σ ${r.drift}, churn ${r.churn}, gate σ ${r.massDrift}`,
  );
}

// ---- the polyrhythm is not ------------------------------------------------
{
  const { PIECES } = await import(join(HERE, '..', 'showcase', 'pieces.js'));
  const poly = PIECES.find((p) => p.name === 'polyrhythm');
  const r = await measure(eng, poly.src, { ...poly.settings, grow: 1 }, 2000);
  check(
    'incommensurate loops do not come out periodic',
    !Number.isFinite(r.period),
    `period ${Number.isFinite(r.period) ? r.period : '∞'}, ${r.distinctSets} distinct note-sets`,
  );
  // The flat-depth bug made this exactly 1 pitch. Anything under 4 is that bug
  // coming back, whatever the period says.
  check(
    '…and a loop is a pitch gradient, not one note',
    r.entropy > 0.4,
    `pitch entropy ${r.entropy.toFixed(2)} over the 15 reachable steps`,
  );
}

// ---- starvation is the other way out --------------------------------------
{
  const { PIECES } = await import(join(HERE, '..', 'showcase', 'pieces.js'));
  const ero = PIECES.find((p) => p.name === 'erosion');
  const r = await measure(eng, ero.src, { ...ero.settings, grow: ero.settings.grow ?? 3 }, 1500);
  check(
    'a structure that turns over drifts in pitch',
    r.drift > 5 && !Number.isFinite(r.period),
    `depth σ ${r.drift.toFixed(1)}, period ${Number.isFinite(r.period) ? r.period : '∞'}`,
  );
}

// ---- every shipped piece is scoreable, and the retuned ones morph ----------
{
  const { PIECES } = await import(join(HERE, '..', 'showcase', 'pieces.js'));
  // The three retuned in the texture pass. Their whole reason for carrying a
  // threshold and a starvation setting is that they move; if one stops moving
  // it has silently become an ordinary static piece with odd settings.
  const MUST_MOVE = { anemone: 2, erosion: 5, weave: 4 };
  for (const p of PIECES) {
    const r = await measure(eng, p.src, { ...p.settings, grow: p.settings.grow ?? 2 }, 1500);
    if (r.error) { check(p.name, false, r.error); continue; }
    const need = MUST_MOVE[p.name];
    // Drift is the requirement, not aperiodicity. Weave drifts by 12 levels
    // and *still* settles into a ~550-tick cycle in some windows; a piece whose
    // pitch centre keeps moving is the thing being asked for, and whether the
    // firing order eventually comes round is a separate question.
    check(
      `${p.name} scores`,
      !need || r.drift > need,
      `variety ${r.variety.toFixed(2)} harmony ${r.harmony.toFixed(2)} drift ${r.drift.toFixed(1)}` +
      ` period ${Number.isFinite(r.period) ? r.period : '∞'} poly ${r.polyphony.toFixed(1)}` +
      (need ? ` (needs drift > ${need})` : ''),
    );
  }
}

console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
