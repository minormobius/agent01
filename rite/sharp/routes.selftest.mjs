// node rite/sharp/routes.selftest.mjs
//
// Exercises the worker's /api/sharp/* handlers end to end with a stub ASSETS
// binding reading the committed data off disk. Catches the things the engine
// selftest cannot: route wiring, param parsing, cache headers, and the loader.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker.js';
import { clearMemo } from './rdap.js';

const RITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = {
  ASSETS: {
    async fetch(req) {
      const p = path.join(RITE, new URL(req.url).pathname);
      if (!fs.existsSync(p)) return new Response('not found', { status: 404 });
      return new Response(fs.readFileSync(p));
    },
  },
};

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
};
const get = (p) => worker.fetch(new Request(`https://rite.mino.mobi${p}`), env, { waitUntil() {} });

console.log('— /api/sharp/styles —');
{
  const res = await get('/api/sharp/styles');
  const body = await res.json();
  check(res.status === 200, 'returns 200');
  check(res.headers.get('access-control-allow-origin') === '*', 'CORS is open');
  check(body.styles.length >= 5 && body.corpus.monosyllables > 7000, `${body.styles.length} styles, ${body.corpus.monosyllables} monosyllables`);
  check(body.sources.length === 3, 'names its sources');
}

console.log('— /api/sharp (mint) —');
{
  const res = await get('/api/sharp?seed=rite&style=blunt&count=10');
  const body = await res.json();
  check(res.status === 200 && body.count === 10, `10 minted words: ${body.words.map((w) => w.word).join(' ')}`);
  check(body.mode === 'mint' && body.style === 'blunt' && body.seed === 'rite', 'echoes mode, style and seed');
  check(/\/sharp\/\?seed=rite/.test(body.permalink), `permalink: ${body.permalink}`);
  check(res.headers.get('cache-control') === 'public, max-age=86400', 'a seeded request is cacheable');
  check(body.words.every((w) => w.taken === false && w.syllables === 1), 'every word is unclaimed and one syllable');

  const again = await (await get('/api/sharp?seed=rite&style=blunt&count=10')).json();
  check(JSON.stringify(again.words) === JSON.stringify(body.words), 'the same seed gives the same words over HTTP');

  const seedless = await get('/api/sharp?count=3');
  const sl = await seedless.json();
  check(sl.seed && sl.seed.length >= 4, `a seedless request mints a seed (${sl.seed})`);
  check(seedless.headers.get('cache-control') === 'no-store', 'a seedless request is not cached');

  const inflected = await (await get('/api/sharp?seed=rite&count=40&inflected=1')).json();
  check(inflected.inflected === true && inflected.count === 40, 'inflected=1 is honoured');
}

console.log('— /api/sharp (real) —');
{
  const body = await (await get('/api/sharp?mode=real&seed=rite&obscurity=0.1&count=12')).json();
  check(body.mode === 'real' && body.count === 12, `12 real words: ${body.words.map((w) => w.word).join(' ')}`);
  check(body.words.every((w) => w.taken === true && w.say && w.say.ipa), 'every one is real and carries its pronunciation');
  const rare = await (await get('/api/sharp?mode=real&seed=rite&obscurity=0.95&count=12')).json();
  const mean = (b) => b.words.reduce((a, w) => a + w.freq, 0) / b.words.length;
  check(mean(body) > mean(rare), `obscurity works over HTTP (${mean(body).toFixed(1)} vs ${mean(rare).toFixed(2)} per million)`);
}

console.log('— /api/sharp/check —');
{
  const cat = await (await get('/api/sharp/check?w=cat')).json();
  check(cat.taken === true && cat.monosyllable === true && cat.say.ipa === 'kæt', `cat: ${cat.verdict}`);
  const inv = await (await get('/api/sharp/check?w=thrimp')).json();
  check(inv.taken === false && inv.monosyllable === true && inv.rhymes.length > 0, `thrimp: ${inv.verdict}, rhymes ${inv.rhymes.slice(0, 3).join(' ')}`);
  const poly = await (await get('/api/sharp/check?w=banana')).json();
  check(poly.taken === true && poly.syllables === 3 && poly.parts === null, `banana: ${poly.verdict}`);
  const messy = await (await get('/api/sharp/check?w=%20%20Thrimp!!%20')).json();
  check(messy.word === 'thrimp', 'input is normalised');
  const empty = await get('/api/sharp/check?w=');
  check(empty.status === 400, 'an empty check is a 400');
  const long = await (await get(`/api/sharp/check?w=${'a'.repeat(300)}`)).json();
  check(long.word.length === 64, 'a very long input is clipped rather than refused');
}

console.log('— /api/sharp/tlds —');
{
  const res = await get('/api/sharp/tlds');
  const body = await res.json();
  check(res.status === 200 && body.counts.tlds > 1000, `${body.counts.tlds} delegated TLDs, ${body.counts.verifiable} with RDAP`);
  check(Object.keys(body.verdicts).length === 5, 'the verdicts are published, so a caller can read the answers');
  const hack = await (await get('/api/sharp/tlds?endswith=flash')).json();
  check(hack.endswith.some((h) => h.domain === 'fla.sh'), `endswith=flash -> ${hack.endswith.map((h) => h.domain).join(' ')}`);
}

console.log('— /api/sharp/domain, against a stub registry —');
{
  // The worker's RDAP client uses global fetch; swap it so the selftest never
  // touches a real registry. Preflight has to run offline and identically.
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (!u.startsWith('http')) return real(url, init);
    asked.push(u);
    if (u.includes('taken.com')) return new Response('{"objectClassName":"domain","events":[{"eventAction":"registration","eventDate":"2008-11-10T00:00:00Z"}]}', { status: 200 });
    return new Response('{"errorCode":404,"title":"Domain not found"}', { status: 404 });
  };
  try {
    clearMemo();
    const one = await (await get('/api/sharp/domain?name=taken.com')).json();
    check(one.results[0].verdict === 'taken' && one.results[0].detail.registered.startsWith('2008'),
      'a whole name resolves and the record comes back summarised');

    clearMemo(); asked.length = 0;
    const many = await (await get('/api/sharp/domain?label=thrimp&tlds=com,dev,sh,thistldnotexist')).json();
    const by = Object.fromEntries(many.results.map((r) => [r.tld, r.verdict]));
    check(by.com === 'free' && by.dev === 'free', 'registry 404s read as free');
    check(by.sh === 'unverifiable', '.sh has no RDAP service, so the answer is unverifiable — not free');
    check(by.thistldnotexist === 'invalid', 'an unreal TLD is invalid');
    check(!asked.some((u) => u.includes('.sh')), 'nothing was asked of a registry that does not exist');
    check(many.free.length === 2 && !many.free.includes('thrimp.sh'), '`free` lists only what a registry actually said');
    check(typeof many.caveat === 'string' && /not purchasable/.test(many.caveat), 'the response says what "free" does not mean');

    clearMemo();
    const bad = await get('/api/sharp/domain?label=-nope-&tlds=com');
    check(bad.status === 400, 'an unusable label is a 400, not a registry query');
    const none = await get('/api/sharp/domain');
    check(none.status === 400, 'no label is a 400');

    clearMemo();
    const cap = await (await get(`/api/sharp/domain?label=thrimp&tlds=${Array.from({length:40},(_, i)=>'com').join(',')}`)).json();
    check(cap.checked <= 16, `one request cannot ask for more than 16 TLDs (got ${cap.checked})`);

    const res = await get('/api/sharp/domain?label=thrimp&tlds=com');
    check(res.headers.get('cache-control') === 'public, max-age=300', 'availability is cached briefly, not for a day');
  } finally {
    globalThis.fetch = real;
  }
}

console.log('— health —');
{
  const h = await (await get('/api/health')).json();
  check(h.routes.includes('/api/sharp') && h.routes.includes('/api/sharp/check')
    && h.routes.includes('/api/sharp/domain') && h.routes.includes('/api/sharp/tlds'), 'health lists the sharp routes');
}

console.log('— the page is served —');
{
  const res = await worker.fetch(new Request('https://rite.mino.mobi/sharp/index.html'), env, { waitUntil() {} });
  check(res.status === 200, 'GET /sharp/index.html falls through to ASSETS');
  const html = await res.text();
  check(html.includes('id="word"') && html.includes('/api/sharp'), 'the page is the sharp page and talks to the sharp API');
}

console.log(failures === 0 ? '\nall good' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
