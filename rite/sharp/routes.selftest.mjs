// node rite/sharp/routes.selftest.mjs
//
// Exercises the worker's /api/sharp/* handlers end to end with a stub ASSETS
// binding reading the committed data off disk. Catches the things the engine
// selftest cannot: route wiring, param parsing, cache headers, and the loader.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker.js';

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

console.log('— health —');
{
  const h = await (await get('/api/health')).json();
  check(h.routes.includes('/api/sharp') && h.routes.includes('/api/sharp/check'), 'health lists the sharp routes');
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
