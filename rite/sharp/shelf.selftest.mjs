// node rite/sharp/shelf.selftest.mjs
//
// The shelf: what a kept word is, how local and repo copies reconcile, and the
// two things that must not take the page down — storage that refuses, and a
// scope ceiling that does not offer the collection yet.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Shelf, memoryStore, browserStore, entryFrom, freeCount,
  toRecord, fromRecord, rkeyOf, ceilingAllows, COLLECTION, SCOPE, STORE_KEY, MAX_ENTRIES,
} from './shelf.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
};

console.log('— entries —');
{
  const e = entryFrom({ word: '  LOUNCE! ', score: 85, say: { ipa: 'laʊns', arpabet: 'L AW N S' }, rhymes: ['bounce', 'ounce'] });
  check(e.word === 'lounce', 'the word is normalised on the way in');
  check(e.score === 85 && e.say.ipa === 'laʊns' && e.rhymes.length === 2, 'what the page knew is carried');
  check(e.origin === 'mint' && e.syllables === 1 && e.uri === null, 'the rest takes sensible defaults');
  check(entryFrom({ word: '!!!' }) === null && entryFrom({}) === null, 'a word that survives normalisation to nothing is not an entry');
  const trimmed = entryFrom({ word: 'x', rhymes: Array(40).fill('a'), note: 'z'.repeat(900) });
  check(trimmed.rhymes.length === 8 && trimmed.note.length === 280, 'oversized fields are clipped, not rejected');
  check(freeCount({ domains: [{ verdict: 'free' }, { verdict: 'taken' }, { verdict: 'free' }] }) === 2, 'freeCount counts only real yeses');
  const junk = entryFrom({ word: 'y', domains: [{ domain: 'y.com' }, null, { domain: 'y.dev', verdict: 'free' }] });
  check(junk.domains.length === 1, 'a half-formed domain row is dropped rather than stored');
}

console.log('— keeping —');
{
  const s = new Shelf(memoryStore());
  s.keep({ word: 'lounce', score: 85 });
  s.keep({ word: 'spraw', score: 93 });
  check(s.size === 2 && s.entries[0].word === 'spraw', 'newest first');
  check(s.has('LOUNCE') && !!s.get('lounce'), 'lookup is case-insensitive');

  s.setDomains('lounce', [{ domain: 'lounce.com', verdict: 'taken' }, { domain: 'lounce.dev', verdict: 'free' }]);
  check(freeCount(s.get('lounce')) === 1 && s.get('lounce').domains[0].checkedAt, 'domains attach, stamped with when they were asked');

  s.keep({ word: 'lounce', score: 85, origin: 'mint' });
  check(s.get('lounce').domains.length === 2, 're-keeping a word does not wipe the verdicts a later lookup wrote');
  check(s.size === 2, 're-keeping does not duplicate');

  check(s.drop('spraw') === 1 && s.size === 1, 'drop removes exactly one');
  check(s.drop('nothere') === 0, 'dropping a word that is not there is not an error');
  s.clear();
  check(s.size === 0, 'clear empties it');
}

console.log('— persistence —');
{
  const store = memoryStore();
  const a = new Shelf(store);
  a.keep({ word: 'thrimp', score: 40, domains: [{ domain: 'thrimp.com', verdict: 'free' }] });
  const b = new Shelf(store);
  check(b.size === 1 && b.get('thrimp').domains.length === 1, 'a shelf reloads from its store');

  const corrupt = { durable: true, read: () => '{not json', write: () => true };
  check(new Shelf(corrupt).size === 0, 'corrupt storage gives an empty shelf, not a thrown page');
  const wrongShape = { durable: true, read: () => '{"a":1}', write: () => true };
  check(new Shelf(wrongShape).size === 0, 'storage holding the wrong shape gives an empty shelf');

  // A private window: every localStorage call throws.
  const hostile = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  const s = new Shelf(browserStore(hostile));
  check(s.durable === false, 'storage that refuses is detected up front');
  s.keep({ word: 'ghost' });
  check(s.size === 1 && new Shelf(browserStore(hostile)).size === 0,
    'the shelf still works for the session, and is honest that it will not survive');

  const cap = new Shelf(memoryStore());
  for (let i = 0; i < MAX_ENTRIES + 20; i++) cap.keep({ word: `w${i}` });
  check(cap.size === MAX_ENTRIES, `the shelf is capped at ${MAX_ENTRIES}`);
}

console.log('— the record —');
{
  const e = entryFrom({
    word: 'lounce', score: 85, taken: false, say: { ipa: 'laʊns', arpabet: 'L AW N S' },
    rhymes: ['bounce'], homophones: [], style: 'native', seed: 'banger-a', origin: 'mint',
    domains: [{ domain: 'lounce.dev', verdict: 'free', checkedAt: '2026-09-22T00:00:00.000Z' }],
  });
  const rec = toRecord(e);
  check(rec.$type === COLLECTION && rec.word === 'lounce' && rec.createdAt === e.keptAt, 'the record names itself and carries the word');
  check(rec.score === 85 && rec.say.ipa === 'laʊns' && rec.domains[0].verdict === 'free', 'the snapshot goes with it');
  check(!('homophones' in rec) && !('note' in rec), 'empty fields are omitted rather than written as null');

  const back = fromRecord({ uri: 'at://did:plc:abc/com.minomobi.sharp.word/3kabc', value: rec });
  check(back.word === e.word && back.score === e.score && back.keptAt === e.keptAt, 'a record round-trips to the same entry');
  check(back.uri.endsWith('3kabc') && rkeyOf(back.uri) === '3kabc', 'the record address comes back, and the rkey out of it');
  check(fromRecord(null) === null && fromRecord({ value: {} }) === null, 'a row with no word is not an entry');

  check(SCOPE === `atproto repo:${COLLECTION}`, `the site asks for one collection only: ${SCOPE}`);
}

console.log('— reconciling local with the repo —');
{
  const s = new Shelf(memoryStore());
  s.keep({ word: 'lounce', keptAt: new Date('2026-09-20') });
  s.keep({ word: 'spraw', keptAt: new Date('2026-09-21') });

  const r = s.merge([
    { word: 'teeze', keptAt: '2026-09-19T00:00:00.000Z', uri: 'at://x/c/1' },
    { word: 'lounce', keptAt: '2026-09-22T00:00:00.000Z', score: 85, uri: 'at://x/c/2' },
    { word: 'spraw', keptAt: '2026-09-01T00:00:00.000Z', uri: 'at://x/c/3' },
  ]);
  check(r.added === 1 && s.has('teeze'), 'a word only the repo has arrives');
  check(s.get('lounce').score === 85 && s.get('lounce').uri === 'at://x/c/2', 'the newer repo copy wins');
  check(Date.parse(s.get('spraw').keptAt) === Date.parse('2026-09-21'), 'the newer local copy survives an older repo copy');
  check(s.get('spraw').uri === 'at://x/c/3', '…while still learning where its record lives, so it is not written twice');
  check(s.entries.map((e) => e.word).join(' ') === 'lounce spraw teeze', 'the merged shelf is newest first');

  const s2 = new Shelf(memoryStore());
  s2.keep({ word: 'keepme', domains: [{ domain: 'keepme.com', verdict: 'free' }] });
  s2.merge([{ word: 'keepme', keptAt: new Date(Date.now() + 60000).toISOString(), uri: 'at://x/c/9' }]);
  check(s2.get('keepme').domains.length === 1, 'a newer repo copy with no verdicts does not erase the ones held locally');
}

console.log('— the scope ceiling —');
{
  const meta = (scope) => async () => new Response(JSON.stringify({ scope }), { status: 200 });
  check((await ceilingAllows(meta(`atproto repo:${COLLECTION}`))).ok, 'a ceiling naming the collection allows it');
  check((await ceilingAllows(meta('atproto transition:generic'))).ok, 'transition:generic covers it');
  const short = await ceilingAllows(meta('atproto repo:com.minomobi.answers'));
  check(!short.ok && short.known && /does not offer/.test(short.reason),
    'a ceiling without it is refused BEFORE the redirect, with a reason — not after, as someone else\'s error');

  // A dropped request and a short ceiling are different claims. Reporting the
  // first as the second tells someone their feature is unshipped when it is
  // not, and hides the sign-in button over a blip.
  const down = await ceilingAllows(async () => new Response('', { status: 503 }));
  check(!down.ok && down.known === false, 'an auth worker that is down is not a yes, and not a no either');
  const offline = await ceilingAllows(async () => { throw new Error('offline'); });
  check(!offline.ok && offline.known === false && /could not reach/.test(offline.reason), 'a thrown fetch is unknown, not a verdict');
  check((await ceilingAllows(meta(`atproto repo:${COLLECTION}`))).known === true, 'a ceiling we read is marked as read');
}

console.log('— the vendored OAuth client —');
{
  // Static sites cannot import across directories, so /sharp keeps its own copy
  // of packages/oauth-client/auth.js. The repo rule is edit the package, never
  // the copy — this is what keeps that true.
  const pkg = fs.readFileSync(path.join(HERE, '../../packages/oauth-client/auth.js'));
  const copy = fs.readFileSync(path.join(HERE, 'auth.js'));
  check(pkg.equals(copy), 'rite/sharp/auth.js is byte-identical to packages/oauth-client/auth.js');
}

console.log('— the lexicon —');
{
  const lex = JSON.parse(fs.readFileSync(path.join(HERE, 'lexicons', `${COLLECTION}.json`), 'utf8'));
  check(lex.id === COLLECTION && lex.defs.main.type === 'record', `${COLLECTION} is a record lexicon`);
  const props = lex.defs.main.record.properties;
  const rec = toRecord(entryFrom({ word: 'x', score: 1, say: { ipa: 'ɪ' }, rhymes: ['a'], domains: [{ domain: 'x.com', verdict: 'free' }], style: 's', seed: 'z', note: 'n', taken: false }));
  const unknown = Object.keys(rec).filter((k) => k !== '$type' && !props[k]);
  check(unknown.length === 0, `every field the writer emits is declared${unknown.length ? ': ' + unknown.join(' ') : ''}`);
  check(lex.defs.main.record.required.every((k) => props[k]), 'every required field is declared');
  const scope = fs.readFileSync(path.join(HERE, '../../workers/auth/src/oauth/scope.ts'), 'utf8');
  check(scope.includes(`'${COLLECTION}'`), 'the collection is in the auth worker\'s WRITE_COLLECTIONS');
}

console.log(failures === 0 ? '\nall good' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
