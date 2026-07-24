// node b/coin/rules.selftest.mjs
// Gates the constraint algebra: every rule must actually accept what it claims to
// accept and reject what it claims to reject, rulesets must survive a round-trip
// through a URL, and the daily set must be the same everywhere.

import {
  RULES, checkPost, checkThread, encodeRules, decodeRules,
  dailyRules, dailyWildcard, words, syllables, needsNovelty, DEFAULT_RULES,
} from './rules.js';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };
const one = (id, params, text, ctx = {}) => checkPost(text, [{ id, params }], ctx)[0];

console.log('— every rule declares itself completely —');
{
  const bad = Object.entries(RULES).filter(([, r]) =>
    !r.label || !r.blurb || !r.scope || !r.kind || typeof r.describe !== 'function' ||
    (r.scope === 'post' ? typeof r.check !== 'function' : typeof r.checkThread !== 'function'));
  ck(!bad.length, `all ${Object.keys(RULES).length} rules well-formed${bad.length ? ' — ' + bad.map((b) => b[0]) : ''}`);
  ck(Object.values(RULES).every((r) => ['post', 'thread'].includes(r.scope)), 'scopes are post|thread');
  ck(Object.values(RULES).every((r) => ['pure', 'corpus'].includes(r.kind)), 'kinds are pure|corpus');
}

console.log('— pure rules accept and reject —');
{
  ck(one('wildcard', { word: 'lantern' }, 'a lantern in the fog').ok, 'wildcard: present');
  ck(!one('wildcard', { word: 'lantern' }, 'a torch in the fog').ok, 'wildcard: absent');
  ck(one('wildcard', { word: 'lantern' }, 'lanterns everywhere').ok, 'wildcard: plural counts');

  ck(one('avgWord', { n: 5 }, 'gigantic elephants trampling flowerbeds').ok, 'avgWord: long words pass');
  ck(!one('avgWord', { n: 5 }, 'a cat sat on a mat').ok, 'avgWord: short words fail');

  ck(one('lipogram', { letter: 'e' }, 'a jolly outing').ok, 'lipogram: no forbidden letter');
  ck(!one('lipogram', { letter: 'e' }, 'the letter is here').ok, 'lipogram: catches it');

  ck(one('univocalic', { vowel: 'a' }, 'a fat cat sat').ok, 'univocalic: single vowel');
  ck(!one('univocalic', { vowel: 'a' }, 'a fat cat sits').ok, 'univocalic: catches a stray vowel');

  ck(one('noRepeats', {}, 'each word entirely distinct here').ok, 'noRepeats: all distinct');
  ck(!one('noRepeats', {}, 'the cat and the dog').ok, 'noRepeats: catches a repeat');

  ck(one('alliterate', { n: 3 }, 'silver salmon swim slowly').ok, 'alliterate: run found');
  ck(!one('alliterate', { n: 4 }, 'silver salmon swim north').ok, 'alliterate: run too short');

  ck(one('monosyllabic', {}, 'the cat ate the rat').ok, 'monosyllabic: all one beat');
  ck(!one('monosyllabic', {}, 'the elephant ate').ok, 'monosyllabic: catches a long word');

  ck(one('acrostic', { word: 'coin' }, 'crows over icy nests').ok, 'acrostic: spells it');
  ck(!one('acrostic', { word: 'coin' }, 'crows over nasty ice').ok, 'acrostic: wrong order');

  ck(one('question', {}, 'is this new?').ok, 'question: ends with ?');
  ck(!one('question', {}, 'this is new.').ok, 'question: does not');

  ck(one('exact', { n: 4 }, 'one two three four').ok, 'exact: right count');
  ck(!one('exact', { n: 4 }, 'one two three').ok, 'exact: wrong count');
}

console.log('— corpus rules read the novelty result —');
{
  const novel = { ok: true, novelCount: 2, novel: ['wibble blork', 'zonk the frobnitz'] };
  ck(one('novel', {}, 'x', { novelty: novel }).ok, 'novel: passes when a phrase is new');
  ck(!one('novel', {}, 'x', { novelty: { ok: false, novel: [] } }).ok, 'novel: fails when nothing is new');
  ck(one('novel', {}, 'x', {}).pending, 'novel: pending before the check returns');
  ck(one('novelBigram', {}, 'x', { novelty: novel }).ok, 'novelBigram: passes on a 2-word novelty');
  ck(!one('novelBigram', {}, 'x', { novelty: { ok: true, novelCount: 1, novel: ['zonk the frobnitz'] } }).ok,
    'novelBigram: a 3-word novelty is NOT enough');
  ck(needsNovelty([{ id: 'novel' }]) && !needsNovelty([{ id: 'avgWord' }]),
    'needsNovelty only fires for corpus rules (a pure ruleset never hits the network)');
}

console.log('— thread rules span the chain —');
{
  const seg = (t) => ({ text: t });
  const haiku = [seg('an old silent pond'), seg('a frog jumps into the pond'), seg('splash silence again')];
  const hres = checkThread(haiku, [{ id: 'haiku', params: { pattern: [5, 7, 5] } }])[0];
  ck(typeof hres.ok === 'boolean' && /\d+–\d+–\d+/.test(hres.msg), `haiku reports the counts (${hres.msg})`);
  ck(!checkThread([seg('one')], [{ id: 'haiku', params: { pattern: [5, 7, 5] } }])[0].ok, 'haiku: wrong post count fails');

  const chained = [seg('walk to the river'), seg('river runs to the sea'), seg('sea takes it all')];
  ck(checkThread(chained, [{ id: 'chain', params: {} }])[0].ok, 'chain: each post picks up the last word');
  ck(!checkThread([seg('walk to the river'), seg('ocean runs')], [{ id: 'chain', params: {} }])[0].ok, 'chain: broken link fails');

  const shrink = [seg('one two three four'), seg('one two three'), seg('one two')];
  ck(checkThread(shrink, [{ id: 'shrinking', params: {} }])[0].ok, 'shrinking: strictly narrowing');
  ck(!checkThread([seg('one two'), seg('one two three')], [{ id: 'shrinking', params: {} }])[0].ok, 'shrinking: growth fails');
}

console.log('— rulesets survive a URL round-trip —');
{
  for (const rs of [
    DEFAULT_RULES,
    [{ id: 'novel', params: {} }, { id: 'avgWord', params: { n: 6 } }],
    [{ id: 'wildcard', params: { word: 'lantern' } }, { id: 'lipogram', params: { letter: 'e' } }],
    [{ id: 'haiku', params: { pattern: [5, 7, 5] } }],
  ]) {
    const back = decodeRules(encodeRules(rs));
    ck(JSON.stringify(back) === JSON.stringify(rs), `round-trip: ${encodeRules(rs)}`);
  }
  ck(decodeRules('nonsense,novel').length === 1, 'unknown rule ids are dropped, not crashed on');
}

console.log('— the daily challenge is the same for everyone —');
{
  const a = dailyRules('2026-07-24'), b = dailyRules('2026-07-24');
  ck(JSON.stringify(a) === JSON.stringify(b), 'same day → same ruleset');
  ck(JSON.stringify(dailyRules('2026-07-25')) !== JSON.stringify(a), 'different day → different ruleset');
  ck(a.some((r) => RULES[r.id].kind === 'corpus'), 'the daily set always includes a corpus rule');
  ck(a.some((r) => RULES[r.id].kind === 'pure'), 'and always a pure one');
  ck(dailyWildcard('2026-07-24') === dailyWildcard('2026-07-24'), 'the wildcard is stable within a day');
  const seen = new Set();
  for (let d = 1; d <= 28; d++) seen.add(dailyWildcard(`2026-03-${String(d).padStart(2, '0')}`));
  ck(seen.size > 15, `wildcards vary across a month (${seen.size}/28 distinct)`);
}

console.log('— helpers —');
{
  ck(words('go to https://x.com/y now').join(' ') === 'go to now', 'URLs stripped from word counts');
  ck(syllables('elephant') === 3 && syllables('cat') === 1, 'syllable counting is sane');
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);
