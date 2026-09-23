// node rite/sharp/engine.selftest.mjs
//
// Gates: segmentation is lossless, the syllable heuristic still hits its
// measured accuracy, the mint contract holds for every style, the word index
// answers correctly, and the whole thing is deterministic.
//
// It runs against the real committed data, not fixtures — a corpus rebuild that
// breaks an assumption fails here rather than in production.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mint, draw, check, catalog, segment, render, countSyllables, plausibility,
  rimeKey, nucleusKey, permitted, arpaToIpa, STYLE_KEYS, WordIndex,
} from './engine.js';
import { hydrate, lexiconFrom, rimeOfPhones } from './corpus.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const D = (f) => path.join(HERE, 'data', f);

let failures = 0;
function check_(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

const model = JSON.parse(fs.readFileSync(D('phono.json'), 'utf8'));
const mono = JSON.parse(fs.readFileSync(D('mono.json'), 'utf8'));
const corpus = hydrate(mono);
const lexicon = lexiconFrom(fs.readFileSync(D('taken.txt'), 'utf8'));

console.log(`— data —`);
check_(corpus.count > 7000, `${corpus.count} real single-syllable words`);
check_(lexicon.size > 200000, `${lexicon.size} claimed words in the index`);
check_(Object.keys(model.onsets).length > 50 && Object.keys(model.codas).length > 200,
  `model: ${Object.keys(model.onsets).length} onsets, ${Object.keys(model.nuclei).length} nuclei, ${Object.keys(model.codas).length} codas`);
check_(model.calibration.length === 200 && model.calibration.every((v, i, a) => i === 0 || v >= a[i - 1]),
  'calibration is 200 non-decreasing percentiles');
check_(mono.words.length === mono.phones.length && mono.words.length === mono.freq.length && mono.words.length === mono.order.length,
  'mono.json arrays are all the same length');
check_(mono.words.every((w, i) => i === 0 || mono.words[i - 1] < w), 'mono.json words are sorted and unique');

console.log('— segmentation is lossless —');
{
  let bad = 0; const examples = [];
  for (const w of corpus.words) {
    const seg = segment(w);
    if (!seg || render(seg) !== w) { bad++; if (examples.length < 8) examples.push(w); }
  }
  const rate = 1 - bad / corpus.words.length;
  check_(rate >= 0.99, `render(segment(w)) === w for ${(rate * 100).toFixed(2)}% of the corpus (${bad} exceptions: ${examples.join(' ')})`);
  for (const [w, parts] of Object.entries({
    strength: ['str', 'e', 'ngth', false],
    mole: ['m', 'o', 'l', true],
    sky: ['sk', 'y', '', false],
    ash: ['', 'a', 'sh', false],
    thwart: ['thw', 'a', 'rt', false],
    bridge: ['br', 'i', 'dge', false],
    flaw: ['fl', 'aw', '', false],
  })) {
    const s = segment(w);
    check_(!!s && s.onset === parts[0] && s.nucleus === parts[1] && s.coda === parts[2] && s.magicE === parts[3],
      `segment(${w}) = ${JSON.stringify(s)}`);
  }
}

console.log('— syllable counting —');
{
  // Ground truth is the CMUdict count shipped in taken.txt.
  let seen = 0, exact = 0, TP = 0, FP = 0, FN = 0;
  for (let i = 0; i < lexicon.size; i++) {
    const w = lexicon.wordAt(i);
    if (!/^[a-z]+$/.test(w)) continue;
    const e = lexicon.entry(w);
    if (e.syllables == null || !e.kinds.includes('e')) continue;   // real words CMUdict has counted
    seen++;
    const g = countSyllables(w);
    if (g === e.syllables) exact++;
    const isMono = e.syllables === 1, saysMono = g === 1;
    if (isMono && saysMono) TP++; else if (!isMono && saysMono) FP++; else if (isMono && !saysMono) FN++;
  }
  const acc = exact / seen, prec = TP / (TP + FP), rec = TP / (TP + FN);
  check_(acc >= 0.93, `exact count on ${seen} real words: ${(acc * 100).toFixed(2)}% (gate 93%)`);
  check_(prec >= 0.95, `"is it one syllable" precision ${(prec * 100).toFixed(2)}% (gate 95%)`);
  check_(rec >= 0.99, `"is it one syllable" recall ${(rec * 100).toFixed(2)}% (gate 99%)`);
  for (const [w, n] of Object.entries({ cat: 1, strength: 1, banana: 3, rhythm: 2, queue: 1, walked: 1, wanted: 2, apples: 2, skrelt: 1, blorp: 1 }))
    check_(countSyllables(w) === n, `countSyllables(${w}) = ${n}`);
}

console.log('— the word index —');
{
  const rng = (() => { let a = 12345; return () => (a = (a * 48271) % 2147483647) / 2147483647; })();
  let ok = true;
  for (let t = 0; t < 4000; t++) {
    const i = Math.floor(rng() * lexicon.size);
    const w = lexicon.wordAt(i);
    if (lexicon.find(w) !== i && lexicon.wordAt(lexicon.find(w)) !== w) { ok = false; break; }
  }
  check_(ok, 'binary search finds 4000 random entries');
  check_(lexicon.has('cat') && lexicon.has('strength') && lexicon.has('the'), 'has() finds real words');
  check_(!lexicon.has('skrelt') && !lexicon.has('zzzzqx') && !lexicon.has(''), 'has() rejects invented words');
  check_(lexicon.syllables('banana') === 3 && lexicon.syllables('cat') === 1, 'syllable counts come back from the index');
  check_(lexicon.entry('cat').kinds.includes('e') && lexicon.entry('cat').kinds.includes('c'), 'kinds records every list that claims a word');
  const roundTrip = new WordIndex('ant\t1ec\nbee\t1ec\ncow\t1ec\n');
  check_(roundTrip.size === 3 && roundTrip.has('bee') && !roundTrip.has('bef'), 'WordIndex works on a hand-built text');
}

console.log('— the mint contract —');
for (const style of STYLE_KEYS) {
  const r = mint({ seed: 'selftest', count: 120, style, model, lexicon, corpus });
  const words = r.words.map((w) => w.word);
  const problems = [];
  if (r.count !== 120) problems.push(`only minted ${r.count}`);
  if (new Set(words).size !== words.length) problems.push('duplicates');
  for (const w of r.words) {
    if (countSyllables(w.word) !== 1) { problems.push(`${w.word} is not one syllable`); break; }
    if (lexicon.has(w.word)) { problems.push(`${w.word} is already taken`); break; }
    if (!permitted(w.word)) { problems.push(`${w.word} is not permitted`); break; }
    const seg = segment(w.word);
    if (!seg || render(seg) !== w.word) { problems.push(`${w.word} does not round-trip`); break; }
    if (/ed$|(?:^|[^s])s$/.test(seg.coda)) { problems.push(`${w.word} reads as an inflection`); break; }
    if (w.say && !arpaToIpa(w.say.arpabet)) { problems.push(`${w.word} has unreadable phones`); break; }
  }
  check_(problems.length === 0, `${style}: 120 unclaimed monosyllables — ${problems.join('; ') || words.slice(0, 6).join(' ') + ' …'}`);
}
{
  const r = mint({ seed: 'selftest', count: 60, style: 'native', model, lexicon, corpus, inflected: true });
  check_(r.count === 60 && r.words.some((w) => /ed$|s$/.test(w.word)), 'inflected:true lets plurals and past tenses through');
  const say = mint({ seed: 'pron', count: 200, style: 'native', model, lexicon, corpus });
  const withSay = say.words.filter((w) => w.say).length;
  check_(withSay / say.count >= 0.9, `${((withSay / say.count) * 100).toFixed(0)}% of minted words get a pronunciation (gate 90%)`);
  const withRhymes = say.words.filter((w) => w.rhymes.length).length;
  check_(withRhymes / say.count >= 0.7, `${((withRhymes / say.count) * 100).toFixed(0)}% rhyme with a real word (gate 70%)`);
  const scored = say.words.filter((w) => w.score !== null).length;
  check_(scored === say.count, 'every minted word gets a plausibility score');
  check_(mint({ seed: 'x', count: 5, style: 'nonsense', model, lexicon, corpus }).style === 'native', 'an unknown style falls back to native');
  check_(mint({ seed: 'x', count: 9999, model, lexicon, corpus }).requested === 500, 'count is capped at 500');
}

console.log('— determinism —');
{
  const a = mint({ seed: 'borges', count: 80, style: 'liquid', model, lexicon, corpus });
  const b = mint({ seed: 'borges', count: 80, style: 'liquid', model, lexicon, corpus });
  check_(JSON.stringify(a) === JSON.stringify(b), 'same seed → byte-identical mint');
  const c = mint({ seed: 'borges ', count: 80, style: 'liquid', model, lexicon, corpus });
  check_(JSON.stringify(a.words) === JSON.stringify(c.words), 'seeds are trimmed before hashing');
  const d = mint({ seed: 'borges2', count: 80, style: 'liquid', model, lexicon, corpus });
  const overlap = a.words.filter((w) => d.words.some((x) => x.word === w.word)).length;
  check_(overlap < 40, `a different seed gives a different set (overlap ${overlap}/80)`);
  const e = mint({ seed: 'borges', count: 80, style: 'blunt', model, lexicon, corpus });
  check_(JSON.stringify(a.words) !== JSON.stringify(e.words), 'style changes the set');
  const p = draw({ seed: 'z', count: 30, obscurity: 0.4, corpus, model });
  check_(JSON.stringify(p) === JSON.stringify(draw({ seed: 'z', count: 30, obscurity: 0.4, corpus, model })), 'draw is deterministic too');
}

console.log('— drawing real words —');
{
  const mean = (o) => {
    const w = draw({ seed: 'dial', count: 120, obscurity: o, corpus, model }).words;
    return w.reduce((a, x) => a + x.freq, 0) / w.length;
  };
  const common = mean(0), middle = mean(0.5), rare = mean(1);
  check_(common > middle && middle > rare, `obscurity dials frequency down: ${common.toFixed(1)} → ${middle.toFixed(1)} → ${rare.toFixed(1)} per million`);
  const r = draw({ seed: 'real', count: 60, obscurity: 0.5, corpus, model });
  check_(r.words.every((w) => lexicon.has(w.word)), 'every drawn word is a real word');
  check_(r.words.every((w) => w.syllables === 1 && w.taken), 'every drawn word is one syllable and marked taken');
  check_(r.words.every((w) => w.say && w.say.ipa), 'every drawn word carries its CMUdict pronunciation');
}

console.log('— rhymes, homophones, neighbours —');
{
  const c = check('cat', { model, lexicon, corpus });
  check_(c.taken && c.monosyllable && c.say.ipa === 'kæt', `check(cat): ${c.verdict}`);
  check_(c.rhymes.includes('hat') && c.rhymes.includes('flat'), `cat rhymes with ${c.rhymes.slice(0, 4).join(', ')}`);
  check_(c.rhymes.every((w) => rimeOfPhones(corpus.phones[corpus.index.get(w)]) === rimeOfPhones(corpus.phones[corpus.index.get('cat')])),
    'every rhyme really shares the rime');
  check_(c.neighbours.every((w) => corpus.index.has(w)), 'every neighbour is a real monosyllable');

  const b = check('banana', { model, lexicon, corpus });
  check_(b.taken && b.syllables === 3 && !b.monosyllable && b.parts === null,
    `check(banana): ${b.verdict} — and no syllable parts, because it is not one`);

  const n = check('blorp', { model, lexicon, corpus });
  check_(!n.taken && n.monosyllable && n.say && n.rhymes.length > 0, `check(blorp): ${n.verdict} /${n.say.ipa}/`);

  const s = check('SKRELT!', { model, lexicon, corpus });
  check_(s.word === 'skrelt' && s.rhymes.includes('felt'), 'check normalises input and still finds the rhymes');

  const e = check('   ', { model, lexicon, corpus });
  check_(e.ok === false, 'check refuses an empty string politely');

  const cind = check('cind', { model, lexicon, corpus });
  check_(!cind.taken && cind.say.ipa === 'kaɪnd', 'check(cind) hears "kind" — free in spelling, taken in the ear');
}

console.log('— catalog —');
{
  const cat = catalog();
  check_(cat.styles.length === STYLE_KEYS.length && cat.styles.every((s) => s.blurb), 'every style is described');
  check_(cat.limits.maxCount === 500, 'limits are published');
}

console.log(failures === 0 ? '\nall good' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
