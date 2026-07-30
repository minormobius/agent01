// node hoop/v100/test/conclusion.selftest.mjs
// The chapter close: locate the chamber → Luna's contact → the final decision → an ending fitted to the path.
import {
  CHAMBER_LORE_TARGET, chamberLore, signalLocated, chapterComplete, finalChoice,
  lunaContact, FINAL_CHOICES, weighJourney, concludeEnding,
} from '../story/conclusion.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

// locate-the-chamber gate
ok(CHAMBER_LORE_TARGET === 3, 'gather three chamber-lore to locate the chamber');
ok(chamberLore({}) === 0 && !signalLocated({}), 'fresh: no lore, chamber not located');
ok(chamberLore({ 'cl.gathered': 5 }) === CHAMBER_LORE_TARGET, 'chamber-lore caps at the target');
ok(signalLocated({ 'cl.gathered': 3 }), 'three chamber-lore → located');
ok(signalLocated({ 'flag.signal_located': true }), 'an explicit located flag also counts');
ok(!chapterComplete({}) && chapterComplete({ 'flag.chapter_complete': true }), 'chapter-complete flag reads');

// Luna's contact uses the name she knows
const lc = lunaContact('Tann Drey');
ok(/Tann Drey/.test(lc.body) && /Bay 14/.test(lc.body) && lc.title && lc.foot, 'Luna names you + reveals Bay 14');
ok(/traveller/.test(lunaContact('').body), 'contact degrades gracefully with no name');

// the decision: four choices, three resonate with a faction
ok(FINAL_CHOICES.length === 4, 'four final choices');
ok(FINAL_CHOICES.filter((c) => c.resonates).length === 3, 'three choices resonate with a nave faction');
ok(['continuant', 'rindwalker', 'drift'].every((f) => FINAL_CHOICES.some((c) => c.resonates === f)), 'each faction has a resonant choice');
ok(finalChoice({ 'flag.final_choice': 'carry' }) === 'carry', 'a recorded final choice reads back');
ok(finalChoice({ 'flag.final_choice': 'nonsense' }) === null, 'an invalid choice is rejected');

// weigh the journey
const j = weighJourney({ 'flag.chosen_faction': 'drift', 'fw.continuant': 3, 'fw.rindwalker': 3, 'fw.drift': 3 }, { loreSeen: 8, loreTotal: 10 });
ok(j.chosen === 'drift' && j.witnessed === 3 && j.depth === 'thorough', 'journey: chosen faction, witnessed count, depth');
ok(weighJourney({}, { loreSeen: 1, loreTotal: 100 }).depth === 'hurried', 'low lore ratio reads as hurried');

// endings: fitted to choice + path, alignment matters, the differences are real
const aligned = concludeEnding('carry', j);              // drift chose carry (their resonant choice)
ok(/Chapter One/.test(aligned.title) && aligned.review && aligned.close, 'ending has title + review + close');
ok(/Tann Drey/.test(aligned.review) === false, 'review weighs the path (no leaked name)');
ok(/did not waver/.test(aligned.close), 'choosing in line with your faction reads as conviction');
const diverged = concludeEnding('withhold', j);          // drift chose the Continuant option
ok(/asked you, not them/.test(diverged.close), 'choosing against your faction reads as a turn');
ok(concludeEnding('answer', j).close !== concludeEnding('withhold', j).close, 'different decisions → different endings');
ok(concludeEnding('carry', weighJourney({ 'flag.chosen_faction': 'continuant' }, { loreSeen: 0, loreTotal: 10 })).review
   !== aligned.review, 'a different journey → a different review (the differences are the player\'s)');

console.log((bad ? '✗ ' : '✓ ') + 'conclusion.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
