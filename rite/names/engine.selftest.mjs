// node rite/names/engine.selftest.mjs
// Gates: determinism, uniqueness, pairwise distinctness, full coverage of
// every culture × setting × kind, blends, and error paths.

import { generateSet, catalog, CULTURES, SETTINGS, KINDS } from './engine.js';

let failures = 0;
function check(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ ${msg}`); }
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const norm = (n) => n.toLowerCase().replace(/[\s'\-]/g, '');

console.log('— determinism —');
{
  const a = generateSet({ seed: 'tabard', culture: 'norse', setting: 'classical', kind: 'given', count: 300 });
  const b = generateSet({ seed: 'tabard', culture: 'norse', setting: 'classical', kind: 'given', count: 300 });
  check(JSON.stringify(a) === JSON.stringify(b), 'same seed → byte-identical set');
  const c = generateSet({ seed: 'tabard2', culture: 'norse', setting: 'classical', kind: 'given', count: 300 });
  const overlap = a.names.filter((n) => c.names.includes(n)).length;
  check(overlap < 300, `different seed → different set (overlap ${overlap}/300)`);
}

console.log('— the 300-name contract —');
{
  const s = generateSet({ seed: 'contract', culture: 'norse', setting: 'classical', kind: 'given', count: 300 });
  check(s.count === 300, `delivers 300 names (got ${s.count})`);
  const keys = s.names.map(norm);
  check(new Set(keys).size === keys.length, 'all unique after separator-stripping');
  let minD = Infinity, worst = '';
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const d = editDistance(keys[i], keys[j]);
      if (d < minD) { minD = d; worst = `${s.names[i]} / ${s.names[j]}`; }
    }
  check(minD >= 2, `pairwise edit distance ≥ 2 (min ${minD}${minD < 2 ? ': ' + worst : ''})`);
  check(s.names.every((n) => n.length >= 3), 'no runt names');
}

console.log('— full sweep: every culture × setting × kind (count 60) —');
{
  let combos = 0, shortfalls = 0;
  for (const culture of Object.keys(CULTURES))
    for (const setting of Object.keys(SETTINGS))
      for (const kind of Object.keys(KINDS)) {
        combos++;
        const s = generateSet({ seed: 'sweep', culture, setting, kind, count: 60 });
        if (s.count < 60) { shortfalls++; console.error(`    shortfall: ${culture}/${setting}/${kind} → ${s.count}/60`); }
        const keys = s.names.map(norm);
        if (new Set(keys).size !== keys.length) { failures++; console.error(`    dup in ${culture}/${setting}/${kind}`); }
        if (s.names.some((n) => n.includes('undefined'))) { failures++; console.error(`    'undefined' leaked in ${culture}/${setting}/${kind}`); }
      }
  check(shortfalls === 0, `${combos} combos all deliver full sets`);
}

console.log('— blend sweep: merged wardrobes never leak undefined (the steppe+hellenic bug) —');
{
  const cultures = Object.keys(CULTURES);
  let bad = 0, combos = 0;
  for (let i = 0; i < cultures.length; i++) {
    const blend = `${cultures[i]}+${cultures[(i + 3) % cultures.length]}`;
    for (const kind of Object.keys(KINDS)) {
      combos++;
      const s = generateSet({ seed: 'blendbug', culture: blend, setting: 'fantasy', kind, count: 60 });
      if (s.names.some((n) => n.includes('undefined'))) { bad++; console.error(`    undefined in ${blend}/${kind}`); }
      if (s.count < 60) { bad++; console.error(`    shortfall ${blend}/${kind}: ${s.count}/60`); }
    }
  }
  const regress = generateSet({ seed: 'x', culture: 'steppe+hellenic', setting: 'classical', kind: 'full', count: 300 });
  check(!regress.names.some((n) => n.includes('undefined')), 'steppe+hellenic full ×300 is clean (the reported bug)');
  check(bad === 0, `${combos} blend combos clean`);
}

console.log('— titles —');
{
  let bad = 0;
  for (const setting of Object.keys(SETTINGS)) {
    const s = generateSet({ seed: 'office', culture: 'norse', setting, kind: 'title', count: 300 });
    if (s.count < 300) { bad++; console.error(`    title shortfall in ${setting}: ${s.count}/300`); }
    if (s.names.some((n) => /[{}]|undefined/.test(n))) { bad++; console.error(`    bad title in ${setting}`); }
  }
  check(bad === 0, '300-title sets fill for every setting, no leaks');
  const s = generateSet({ seed: 'office', culture: 'brythonic', setting: 'wasteland', kind: 'title', count: 300 });
  const withPlace = s.names.filter((n) => / of [A-Z]/.test(n)).length;
  check(withPlace > 50, `minted-toponym titles occur at scale (${withPlace}/300 "of <Place>")`);
}

console.log('— tight-space stress: every culture at 300, worst-case kinds —');
{
  let shortfalls = [];
  for (const culture of Object.keys(CULTURES)) {
    for (const kind of ['given', 'place']) {
      const s = generateSet({ seed: 'stress', culture, setting: 'classical', kind, count: 300 });
      if (s.count < 300) shortfalls.push(`${culture}/${kind}:${s.count}`);
    }
  }
  check(shortfalls.length === 0, `300-name sets fill everywhere${shortfalls.length ? ' (short: ' + shortfalls.join(', ') + ')' : ''}`);
}

console.log('— blends, catalog, errors —');
{
  const s = generateSet({ seed: 'border', culture: 'norse+romance', setting: 'classical', kind: 'family', count: 120 });
  check(s.count === 120 && s.cultureLabel.includes('×'), `blend generates (${s.cultureLabel})`);
  const cat = catalog();
  check(Object.keys(cat.cultures).length === Object.keys(CULTURES).length, 'catalog lists all cultures');
  let threw = 0;
  for (const bad of [{ culture: 'klingon' }, { setting: 'noir' }, { kind: 'pet' }]) {
    try { generateSet({ seed: 'x', ...bad }); } catch { threw++; }
  }
  check(threw === 3, 'bad culture/setting/kind all throw');
  const capped = generateSet({ seed: 'cap', count: 99999 });
  check(capped.requested <= 1000, `count capped at 1000 (requested field: ${capped.requested})`);
}

console.log('— generated epithets —');
{
  const s = generateSet({ seed: 'flourish', culture: 'norse', setting: 'wasteland', kind: 'full', count: 300 });
  const flourished = s.names.filter((n) => / (the |of |Ever-|No )/.test(n) || /[a-z] [A-Z][a-z]+-[A-Z]/.test(n) || / \S+(born|blood|eater|walker|sworn|keeper|bane|song|brand|friend|runner|breaker|rigger|touched|spoken|mothered)$/.test(n));
  check(flourished.length >= 30, `epithets occur at scale (${flourished.length}/300 flourished names)`);
  const eps = flourished.map((n) => n.split(' ').slice(1).join(' '));
  const uniq = new Set(eps).size;
  check(uniq === eps.length, `no epithet repeats within a set (${uniq}/${eps.length} distinct)`);
  check(s.names.every((n) => !/[{}]/.test(n)), 'no unexpanded template tokens');
  const a = generateSet({ seed: 'flourish', culture: 'norse', setting: 'wasteland', kind: 'full', count: 300 });
  check(JSON.stringify(a.names) === JSON.stringify(s.names), 'epithet generation is deterministic');
  // every setting that carries a grammar produces epithets
  for (const setting of Object.keys(SETTINGS)) {
    const t = generateSet({ seed: 'flourish2', culture: 'frankish', setting, kind: 'full', count: 200 });
    const withEp = t.names.filter((n) => n.split(' ').length > 2 || / (the|of|No) /.test(n + ' ')).length;
    if (withEp === 0) { failures++; console.error(`    no epithets in ${setting}`); }
    if (t.names.some((n) => /[{}]/.test(n))) { failures++; console.error(`    unexpanded token in ${setting}`); }
  }
  check(true, 'all settings carry working epithet grammars');
}

console.log('— flavor smoke (eyeball these) —');
for (const [culture, setting] of [['norse', 'classical'], ['veil', 'fantasy'], ['nihon', 'classical'], ['desertic', 'classical'], ['steppe', 'scifi'], ['brythonic', 'wasteland'], ['steppe+hellenic', 'fantasy']]) {
  const s = generateSet({ seed: 'taste', culture, setting, kind: 'full', count: 8 });
  console.log(`  ${culture}/${setting}/full: ${s.names.join(' · ')}`);
}
for (const [culture, setting] of [['norse', 'fantasy'], ['romance', 'classical'], ['mesoa', 'wasteland'], ['veil', 'fey'], ['steppe', 'scifi']]) {
  const s = generateSet({ seed: 'office', culture, setting, kind: 'title', count: 6 });
  console.log(`  ${culture}/${setting}/title: ${s.names.join(' · ')}`);
}
{
  // deeds are rare — trawl a big fantasy set for second-order forms
  const s = generateSet({ seed: 'saga', culture: 'frankish', setting: 'fantasy', kind: 'full', count: 300 });
  const deeds = s.names.filter((n) => /the [A-Z][a-z]+-[A-Z]|-and-/.test(n));
  console.log(`  deeds in frankish/fantasy ×300 (${deeds.length}): ${deeds.slice(0, 6).join(' · ')}`);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nall checks passed');
