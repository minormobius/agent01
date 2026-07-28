// fifty/lib/engines.selftest.mjs — known-answer tests for the pure engines.
//
// Run by deploy-fifty.yml before every deploy, and by scripts/preflight.mjs.
// These cover the parts where being subtly wrong looks fine on screen: King Wen
// lookup, bracket seeding and byes, ingredient scaling, HMAC invite codes, CSV
// quoting, and the classifier's structural signals.
//
//   node fifty/lib/engines.selftest.mjs

import { kingWen, cast, hexagram, unicodeHexagram, draw, deck, TRIGRAMS } from './iching.js';
import { single, double, seedOrder, bracketSize, placeEntrants, roundName } from './bracket.js';
import { parseIngredient, parseQuantity, formatQuantity, renderIngredient, scale } from './recipe.js';
import { issue, verify } from './invite.js';
import { parseCsv, toObjects, detectSource, toRecord, summarise } from './csv.js';
import { classifyPost, muteCandidates, postRate } from './classify.js';
import { forDate, resolve, SCENARIOS } from './scenario.js';
import { rng, hash32 } from './ui.js';

let failures = 0;
let checks = 0;

function ok(label, cond, detail = '') {
  checks++;
  if (cond) return;
  failures++;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(label, a === e, a === e ? '' : `got ${a}, want ${e}`);
}
function group(name, fn) { console.log(`\n${name}`); fn(); }

// ───────────────────────────────────────────────────────── I Ching ──

group('iching', () => {
  // Lines are bottom-to-top, 1 = yang.
  eq('1 The Creative = six yang', kingWen([1, 1, 1, 1, 1, 1]), 1);
  eq('2 The Receptive = six yin', kingWen([0, 0, 0, 0, 0, 0]), 2);
  eq('11 Peace = earth over heaven', kingWen([1, 1, 1, 0, 0, 0]), 11);
  eq('12 Standstill = heaven over earth', kingWen([0, 0, 0, 1, 1, 1]), 12);
  eq('63 After Completion', kingWen([1, 0, 1, 0, 1, 0]), 63);
  eq('64 Before Completion', kingWen([0, 1, 0, 1, 0, 1]), 64);
  eq('29 The Abysmal doubled', kingWen([0, 1, 0, 0, 1, 0]), 29);
  eq('30 The Clinging doubled', kingWen([1, 0, 1, 1, 0, 1]), 30);

  // Every one of the 64 must be reachable exactly once.
  const seen = new Set();
  for (let i = 0; i < 64; i++) {
    const lines = [0, 1, 2, 3, 4, 5].map((b) => (i >> b) & 1);
    seen.add(kingWen(lines));
  }
  eq('all 64 hexagrams reachable, no collisions', seen.size, 64);
  ok('hexagram numbers are 1..64', Math.min(...seen) === 1 && Math.max(...seen) === 64);

  // Every hexagram has a name and a judgment.
  for (let n = 1; n <= 64; n++) {
    const h = hexagram(n);
    ok(`hexagram ${n} complete`, !!(h.name && h.chinese && h.judgment && h.glyph));
  }
  eq('unicode glyph for 1', unicodeHexagram(1), '䷀');
  eq('unicode glyph for 64', unicodeHexagram(64), '䷿');
  eq('eight distinct trigrams', new Set(TRIGRAMS.map((t) => t.bits.join(''))).size, 8);

  // Determinism: same seed, same reading.
  const a = cast(rng('fifty:test'));
  const b = cast(rng('fifty:test'));
  eq('cast is deterministic', a.values, b.values);
  ok('cast produces 6 lines', a.values.length === 6);
  ok('line values are 6-9', a.values.every((v) => v >= 6 && v <= 9));
  ok('relating hexagram iff a line moves', (!!a.relating) === (a.moving.length > 0));

  // Yarrow probabilities, over enough samples to be stable: old yang (9) must be
  // about three times as likely as old yin (6). The three-coin method gives 1:1,
  // so this test is what stops a "simplification" from changing the oracle.
  const counts = { 6: 0, 7: 0, 8: 0, 9: 0 };
  const r = rng('yarrow-distribution');
  for (let i = 0; i < 60000; i++) counts[cast(r).values[0]]++;
  const ratio = counts[9] / counts[6];
  ok('old yang ≈ 3× old yin (yarrow, not coins)', ratio > 2.4 && ratio < 3.6, `ratio ${ratio.toFixed(2)}`);
  ok('young yin is the most common line', counts[8] > counts[7] && counts[7] > counts[9]);

  // Tarot
  eq('78-card deck', deck().length, 78);
  eq('22 major arcana', deck().filter((c) => c.arcana === 'major').length, 22);
  const spread = draw(rng('tarot-seed'), 'cross');
  eq('five-card cross deals five', spread.length, 5);
  eq('no duplicate cards in a spread', new Set(spread.map((s) => s.card.id)).size, 5);
  eq('tarot draw is deterministic',
    draw(rng('x'), 'three').map((s) => s.card.id),
    draw(rng('x'), 'three').map((s) => s.card.id));
});

// ──────────────────────────────────────────────────────── brackets ──

group('bracket', () => {
  eq('bracket size rounds up to a power of two', [1, 2, 3, 5, 8, 9, 16, 17].map(bracketSize),
    [1, 2, 4, 8, 8, 16, 16, 32]);
  // The fold construction: each round mirrors every seed against its complement.
  eq('standard seed order for 8', seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  eq('standard seed order for 4', seedOrder(4), [1, 4, 2, 3]);
  eq('every seed appears once', seedOrder(16).slice().sort((a, b) => a - b),
    Array.from({ length: 16 }, (_, i) => i + 1));
  ok('opening matches always sum to size + 1',
    seedOrder(16).every((s, i) => (i % 2 ? true : s + seedOrder(16)[i + 1] === 17)));

  const e = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Seed ${i + 1}` }));

  // 8 clean entrants: 3 rounds, 4 first-round matches, no byes.
  const b8 = single(e(8));
  eq('8 entrants → 3 rounds', b8.rounds.length, 3);
  eq('8 entrants → 4 opening matches', b8.rounds[0].length, 4);
  ok('8 entrants → no byes', b8.rounds[0].every((m) => !m.bye));
  eq('top seed meets bottom seed first', [b8.rounds[0][0].a.id, b8.rounds[0][0].b.id], ['p1', 'p8']);
  eq('8 entrants → one final', b8.rounds[2].length, 1);

  // 6 entrants: 8 slots, 2 byes, and they must go to seeds 1 and 2.
  const b6 = single(e(6));
  const byes = b6.rounds[0].filter((m) => m.bye);
  eq('6 entrants → 2 byes', byes.length, 2);
  eq('byes go to the top two seeds', byes.map((m) => m.winner.id).sort(), ['p1', 'p2']);
  ok('byes are auto-advanced', byes.every((m) => m.decided));
  ok('byes are in different halves',
    b6.rounds[0].indexOf(byes[0]) < 2 !== b6.rounds[0].indexOf(byes[1]) < 2);

  // Seeds 1 and 2 must not be able to meet before the final, at any size.
  for (const n of [4, 8, 16, 32]) {
    const slots = placeEntrants(e(n), n);
    const half = n / 2;
    const i1 = slots.findIndex((p) => p.id === 'p1');
    const i2 = slots.findIndex((p) => p.id === 'p2');
    ok(`seeds 1 and 2 in opposite halves at ${n}`, (i1 < half) !== (i2 < half));
  }

  // Advancing produces a champion.
  const results = {};
  let bracket = single(e(8));
  for (const round of bracket.rounds) {
    for (const m of round) {
      const live = single(e(8), results).rounds[m.round].find((x) => x.id === m.id);
      if (live.a && live.b) results[m.id] = live.a.id;      // top slot always wins
    }
    bracket = single(e(8), results);
  }
  eq('deterministic winners → seed 1 champion', bracket.champion.id, 'p1');

  // An undecided bracket has no champion.
  ok('no champion until it is played', single(e(8)).champion === null);

  eq('round naming', [0, 1, 2].map((i) => roundName(i, 3)), ['Quarterfinal', 'Semifinal', 'Final']);

  // Double elimination: nobody is out until they lose twice, so a losers
  // bracket only exists once real matches have produced losers.
  ok('an unplayed double bracket has no losers bracket yet', double(e(8), {}).losersRounds.length === 0);

  const played = {};
  let dd = double(e(8), played);
  for (let pass = 0; pass < 8; pass++) {
    const all = [...dd.rounds.flat(), ...dd.losersRounds.flat(), dd.grandFinal];
    let moved = false;
    for (const m of all) {
      if (m && m.a && m.b && !played[m.id]) { played[m.id] = m.a.id; moved = true; }
    }
    dd = double(e(8), played);
    if (!moved) break;
  }
  ok('double elimination grows a losers bracket once played', dd.losersRounds.length > 0,
    `${dd.losersRounds.length} losers rounds`);
  ok('double elimination has a grand final', !!dd.grandFinal);
  ok('a played double bracket crowns someone', !!dd.champion);
  ok('every losers match has at least one player',
    dd.losersRounds.flat().every((m) => m.a || m.b));
});

// ───────────────────────────────────────────────────────── recipes ──

group('recipe', () => {
  eq('decimal', parseQuantity('2.5'), 2.5);
  eq('vulgar fraction', parseQuantity('3/4'), 0.75);
  eq('mixed number', parseQuantity('1 1/2'), 1.5);
  eq('unicode fraction', parseQuantity('½'), 0.5);
  eq('whole plus unicode fraction', parseQuantity('1½'), 1.5);
  eq('no quantity', parseQuantity('salt'), null);

  const a = parseIngredient('1 1/2 cups caster sugar, sifted');
  eq('quantity parsed', a.quantity, 1.5);
  eq('unit parsed', a.unit, 'cup');
  eq('name parsed', a.name, 'caster sugar');
  eq('prep note split off', a.note, 'sifted');

  const b = parseIngredient('2 eggs');
  eq('unknown unit stays in the name', b.unit, '');
  eq('name keeps the noun', b.name, 'eggs');
  eq('bare count parsed', b.quantity, 2);

  const c = parseIngredient('a pinch of saffron');
  eq('unparseable line survives whole', c.quantity, null);
  eq('unparseable line renders unchanged', renderIngredient(c, 3), 'a pinch of saffron');

  const d = parseIngredient('2-3 apples');
  eq('range low end', d.quantity, 2);
  eq('range high end', d.quantityMax, 3);

  eq('formats a clean fraction', formatQuantity(2.25), '2¼');
  eq('formats a third', formatQuantity(1 / 3), '⅓');
  eq('drops a trivial remainder', formatQuantity(3.01), '3');
  eq('rounds large numbers', formatQuantity(137.4), '137');
  eq('falls back to a decimal when no fraction is close', formatQuantity(2.9), '2.9');
  eq('two-thirds of a cup is a fraction, not 0.7', formatQuantity(2 / 3), '⅔');

  eq('singular at 1', renderIngredient(parseIngredient('2 cups flour'), 0.5), '1 cup flour');
  eq('plural above 1', renderIngredient(parseIngredient('1 cup flour'), 3), '3 cups flour');
  eq('scaling keeps the prep note',
    renderIngredient(parseIngredient('1 tbsp butter, melted'), 2), '2 tbsp butter, melted');

  eq('whole-recipe scale',
    scale(['200 g flour', '1 egg', 'salt to taste'], 2, 4),
    ['400 g flour', '2 eggs', 'salt to taste']);
  eq('scaling down', scale(['4 eggs'], 4, 1), ['1 egg']);
  eq('uncountables are not pluralised', scale(['salt'], 1, 4), ['salt']);
  eq('regular -y plural', scale(['1 cherry'], 1, 6), ['6 cherries']);
});

// ───────────────────────────────────────────────────── invite codes ──

await group('invite', async () => {
  const secret = 'test-secret-not-a-real-one';
  const code = await issue(secret, { cohort: 2, uses: 3, referrer: 7, nonce: 1234 });

  ok('code is human-transcribable', /^[0-9A-Z-]+$/.test(code), code);
  ok('code is grouped for reading', code.includes('-'), code);

  const good = await verify(secret, code);
  ok('a genuine code verifies', good.valid, good.reason);
  eq('cohort round-trips', good.grant.cohort, 2);
  eq('uses round-trips', good.grant.uses, 3);
  eq('referrer round-trips', good.grant.referrer, 7);

  const wrongSecret = await verify('some-other-secret', code);
  ok('a different secret rejects it', !wrongSecret.valid);

  // Flip one character. Crockford maps I/L→1 and O→0, so pick a target that is
  // not one of those aliases, or the "tamper" is a no-op by design.
  const chars = code.split('');
  const idx = chars.findIndex((ch, i) => /[0-9A-HJKMNP-TV-Z]/.test(ch) && i > 2);
  chars[idx] = chars[idx] === 'A' ? 'B' : 'A';
  const tampered = await verify(secret, chars.join(''));
  ok('a tampered code rejects', !tampered.valid);

  ok('garbage rejects without throwing', !(await verify(secret, 'hello')).valid);
  ok('empty rejects without throwing', !(await verify(secret, '')).valid);

  // Expiry
  const past = await issue(secret, { cohort: 0, expiry: '2020-01-01', nonce: 1 });
  ok('an expired code rejects', !(await verify(secret, past)).valid);
  const future = await issue(secret, { cohort: 0, expiry: '2099-01-01', nonce: 1 });
  ok('a future expiry verifies', (await verify(secret, future)).valid);

  // Same grant, different nonce → different code.
  const c1 = await issue(secret, { cohort: 1, nonce: 1 });
  const c2 = await issue(secret, { cohort: 1, nonce: 2 });
  ok('nonce makes identical grants distinct', c1 !== c2);
  ok('both still verify', (await verify(secret, c1)).valid && (await verify(secret, c2)).valid);

  // Formatting must not matter — people retype these.
  ok('lowercase and spacing tolerated',
    (await verify(secret, code.toLowerCase().replace(/-/g, ' '))).valid);
});

// ───────────────────────────────────────────────────────────── CSV ──

group('csv', () => {
  const rows = parseCsv('a,b,c\n1,"two, with comma",3\n4,"say ""hi""",6\r\n');
  eq('row count', rows.length, 3);
  eq('quoted comma stays in one field', rows[1][1], 'two, with comma');
  eq('doubled quotes unescape', rows[2][1], 'say "hi"');
  eq('CRLF handled', rows[2][2], '6');

  const objs = toObjects(rows);
  eq('header keys', Object.keys(objs[0]), ['a', 'b', 'c']);

  const lb = toObjects(parseCsv(
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n' +
    '2024-01-02,Stalker,1979,https://boxd.it/x,4.5,Yes,"Long, and worth it.",scifi,2024-01-01\n'));
  const source = detectSource(lb);
  ok('letterboxd reviews detected', source && source.id === 'letterboxd-reviews', source && source.id);

  const rec = toRecord(source.map(lb[0]), source);
  eq('title mapped', rec.subject.title, 'Stalker');
  eq('4.5/5 normalises to 9/10', rec.rating, 9);
  eq('original rating preserved', rec.originalRating.value, 4.5);
  eq('subject type', rec.subject.type, 'movie');
  ok('review date is an ISO timestamp', /^\d{4}-\d{2}-\d{2}T/.test(rec.reviewedAt), rec.reviewedAt);

  const gr = toObjects(parseCsv(
    'Book Id,Title,Author,My Rating,My Review,Exclusive Shelf,Date Read,ISBN13,Bookshelves\n' +
    '123,Dune,Frank Herbert,5,Great.,read,2023-05-05,="9780441013593",scifi\n'));
  const gsrc = detectSource(gr);
  ok('goodreads detected', gsrc && gsrc.id === 'goodreads', gsrc && gsrc.id);
  const grec = toRecord(gsrc.map(gr[0]), gsrc);
  eq('5/5 normalises to 10/10', grec.rating, 10);
  eq('ISBN unwrapped from the Excel guard', grec.subject.identifiers.isbn, '9780441013593');

  const s = summarise([rec, grec]);
  eq('summary counts', [s.total, s.rated], [2, 2]);
  eq('mean of 9 and 10', s.mean, 9.5);
});

// ────────────────────────────────────────────────────── classifier ──

group('classify', () => {
  const post = (text, embed) => ({ record: { text, createdAt: new Date().toISOString() }, embed });

  eq('tech keywords', classifyPost(post('spent all day on a typescript compiler bug')).category, 'tech');
  eq('sports keywords', classifyPost(post('what a touchdown, the NFL playoffs are wild')).category, 'sports');
  eq('images are the strongest art signal',
    classifyPost(post('sunset', { $type: 'app.bsky.embed.images' })).category, 'art');
  eq('short chatter', classifyPost(post('ok good morning')).category, 'personal');
  eq('link host beats keywords',
    classifyPost(post('this is neat', {
      $type: 'app.bsky.embed.external', external: { uri: 'https://arxiv.org/abs/1234' },
    })).category, 'science');

  const c = classifyPost(post('deploying a rust api to kubernetes'));
  ok('classification shows its working', c.signals.length > 0);
  ok('signals belong to the chosen category', c.signals.every((s) => s.category === c.category));

  // Mute candidates: a word used heavily by one account must rank as higher
  // leverage than the same volume spread across many.
  const feed = [];
  for (let i = 0; i < 8; i++) feed.push({ post: { record: { text: 'wordle 1234 4/6 spoiler' }, author: { did: 'did:x:1' } } });
  for (let i = 0; i < 8; i++) feed.push({ post: { record: { text: `hello everyone number ${i}` }, author: { did: `did:x:${i + 2}` } } });
  const mutes = muteCandidates(feed, { min: 3 });
  const wordle = mutes.find((m) => m.term === 'wordle');
  const hello = mutes.find((m) => m.term === 'hello');
  ok('concentrated term found', !!wordle);
  ok('spread term found', !!hello);
  ok('concentrated term has higher leverage', wordle.leverage > hello.leverage,
    `${wordle && wordle.leverage} vs ${hello && hello.leverage}`);
  ok('stop words excluded', !mutes.some((m) => m.term === 'the' || m.term === 'and'));

  // Post rate over a known span.
  const day = 86400000;
  const now = Date.now();
  const rate = postRate(Array.from({ length: 11 }, (_, i) => ({
    post: { record: { createdAt: new Date(now - i * day).toISOString() } },
  })));
  ok('≈1 post/day over 10 days', Math.abs(rate.perDay - 1.1) < 0.2, String(rate.perDay));
});

// ─────────────────────────────────────────────────────── scenarios ──

group('scenario', () => {
  const a = forDate('2026-07-28');
  const b = forDate('2026-07-28');
  eq('same day → same scenario', a.scenario.id, b.scenario.id);

  const days = new Set();
  for (let i = 1; i <= 60; i++) days.add(forDate(`2026-01-${String(i % 28 + 1).padStart(2, '0')}`).scenario.id);
  ok('the rotation actually rotates', days.size > 3, `${days.size} distinct in 60 days`);

  for (const s of SCENARIOS) {
    ok(`${s.id} has a brief`, !!s.brief);
    ok(`${s.id} has a lesson`, !!s.lesson);
    ok(`${s.id} is either options or numeric`, !!(s.options || s.numeric));
    if (s.options) ok(`${s.id} has at least two options`, s.options.length >= 2);
  }

  // Play whatever today's scenario actually is — the rotation decides, not us.
  const today = forDate('2026-07-28');
  const move = today.scenario.options ? today.scenario.options[0].id
    : Math.round((today.scenario.numeric.min + today.scenario.numeric.max) / 3);
  const r1 = resolve('2026-07-28', move);
  const r2 = resolve('2026-07-28', move);
  eq('resolution is deterministic', r1.score, r2.score);
  eq('field size matches the scale', r1.field.length, r1.fieldSize);
  ok('score is a number', Number.isFinite(r1.score));

  // The stag hunt must actually reward coordination.
  const stagScorer = SCENARIOS.find((s) => s.id === 'stag');
  // Three others plus you is four hunters — the threshold.
  ok('stag pays when four commit', stagScorer.score('stag', ['stag', 'stag', 'stag', 'hare', 'hare']) > 5);
  ok('stag fails one short', stagScorer.score('stag', ['stag', 'stag', 'hare', 'hare', 'hare']) === 0);
  ok('stag pays nothing when it fails', stagScorer.score('stag', ['hare', 'hare', 'hare', 'hare', 'hare']) === 0);
  ok('hare is the safe floor', stagScorer.score('hare', ['hare', 'hare', 'hare', 'hare', 'hare']) > 0);
});

// ──────────────────────────────────────────────────────── seeding ──

group('determinism', () => {
  eq('hash is stable', hash32('fifty'), hash32('fifty'));
  ok('hash separates near-identical strings', hash32('fifty') !== hash32('fiftt'));
  const r1 = rng('seed'); const r2 = rng('seed');
  eq('same seed → same stream', [r1(), r1(), r1()], [r2(), r2(), r2()]);
  ok('different seeds diverge', rng('a')() !== rng('b')());
  const r = rng('uniformity');
  let sum = 0;
  for (let i = 0; i < 20000; i++) sum += r();
  ok('roughly uniform on [0,1)', Math.abs(sum / 20000 - 0.5) < 0.02, String(sum / 20000));
});

// ────────────────────────────────────────────────────────── report ──

console.log(`\n${failures ? '✗' : '✓'} fifty engines — ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
