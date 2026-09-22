// node rite/sharp/tld.selftest.mjs
//
// The TLD verifier and the RDAP reader, offline. Preflight must stay
// deterministic and network-free, so the registry is a stub — which is the
// point: the part worth testing is what a response MEANS, and that is pure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  splitDomain, validLabel, rdapUrl, rdapBaseFor, readRdap, domainHacks,
  summariseRecord, suffixTlds, VERDICTS,
} from './tld.js';
import { checkOne, checkMany, clearMemo } from './rdap.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'tlds.json'), 'utf8'));
const data = { tldSet: new Set(raw.tlds), rdap: raw.rdap };

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
};

console.log('— the TLD list —');
check(raw.tlds.length > 1000, `${raw.tlds.length} delegated TLDs (IANA list ${raw.version})`);
check(data.tldSet.has('com') && data.tldSet.has('sh') && data.tldSet.has('wtf'), 'com, sh and wtf are real');
check(!data.tldSet.has('thistldnotexist') && !data.tldSet.has('zzz'), 'invented TLDs are not');
check(Object.keys(raw.rdap).length > 800, `${Object.keys(raw.rdap).length} publish an RDAP service`);
check(Object.keys(raw.rdap).every((t) => data.tldSet.has(t)), 'every bootstrap entry is a delegated TLD');
check(raw.tlds.every((t, i, a) => i === 0 || a[i - 1] < t), 'the list is sorted and free of duplicates');

console.log('— labels —');
for (const [l, ok] of [['thrimp', true], ['a', true], ['a-b', true], ['-ab', false], ['ab-', false],
  ['xn--abc', false], ['ab--cd', false], ['a'.repeat(64), false], ['a'.repeat(63), true], ['th.imp', false], ['', false]])
  check(validLabel(l) === ok, `validLabel(${JSON.stringify(l)}) = ${ok}`);

console.log('— splitting —');
{
  const a = splitDomain('thrimp.com', data.tldSet);
  check(a.label === 'thrimp' && a.tld === 'com' && a.known, 'thrimp.com splits');
  const b = splitDomain('Thrimp.COM.', data.tldSet);
  check(b.label === 'thrimp' && b.tld === 'com', 'case and a trailing dot are normalised away');
  const c = splitDomain('foo.thistldnotexist', data.tldSet);
  check(c.known === false, 'an unreal TLD is reported as unknown, not rejected silently');
  check(splitDomain('thrimp', data.tldSet) === null, 'a bare label is not a domain');
  check(splitDomain('.com', data.tldSet) === null && splitDomain('foo.', data.tldSet) === null, 'empty halves are refused');
}

console.log('— RDAP URLs —');
check(rdapUrl('thrimp', 'com', data.rdap) === 'https://rdap.verisign.com/com/v1/domain/thrimp.com', 'com resolves to Verisign');
check(rdapUrl('thrimp', 'sh', data.rdap) === null, 'sh has no bootstrap entry, so no URL');
check(rdapBaseFor('com', { com: 'https://x/y' }) === 'https://x/y/', 'a missing trailing slash is added');

console.log('— reading a response —');
{
  // The trap: rdap.org answers 404 "No RDAP service is available" for .io, .sh,
  // .me and .co whether or not the name is registered. Reading that as free is
  // how a tool ends up reporting that github.io is available.
  const noService = '{"errorCode":404,"title":"No RDAP service is available for this resource"}';
  check(readRdap(404, noService, true) === 'unverifiable', 'a "no RDAP service" 404 is NOT availability');
  check(readRdap(404, '{"errorCode":404,"title":"Domain not found"}', true) === 'free', 'a registry 404 is availability');
  check(readRdap(404, '', true) === 'free', 'an empty registry 404 is availability');
  check(readRdap(200, '{"objectClassName":"domain","ldhName":"GOOGLE.COM"}', true) === 'taken', '200 with a record is taken');
  check(readRdap(200, '{"errorCode":429,"title":"rate limit"}', true) === 'unknown', '200 wrapping an error is not taken');
  check(readRdap(429, '', true) === 'unknown' && readRdap(503, '', true) === 'unknown' && readRdap(0, 'abort', true) === 'unknown',
    'rate limits, outages and timeouts are unknown, never free');
  check(readRdap(400, '', true) === 'invalid' && readRdap(422, '', true) === 'invalid', 'a rejected query is invalid');
  check(readRdap(404, '{"errorCode":404,"title":"Domain not found"}', false) === 'unverifiable',
    'a 404 from somewhere the bootstrap did not send us proves nothing');
  check(Object.keys(VERDICTS).length === 5, 'every verdict is documented');
}

console.log('— domain hacks —');
{
  const flash = domainHacks('flash', data.tldSet).map((h) => h.domain);
  check(flash.includes('fla.sh'), `flash -> ${flash.join(' ')}`);
  const crust = domainHacks('crust', data.tldSet).map((h) => h.domain);
  check(crust.includes('cru.st'), `crust -> ${crust.join(' ')}`);
  check(domainHacks('zzzz', data.tldSet).length === 0, 'a word with no TLD tail yields nothing');
  check(domainHacks('Th!ng', data.tldSet).length === 0, 'non-letters are refused');
  check(domainHacks('flash', data.tldSet).every((h) => data.tldSet.has(h.tld) && validLabel(h.label)),
    'every hack is a real TLD and a usable label');
  check(suffixTlds(data.tldSet).length > 500, `${suffixTlds(data.tldSet).length} TLDs are short enough to finish a word`);
}

console.log('— the record summary —');
{
  const s = summariseRecord({
    events: [{ eventAction: 'registration', eventDate: '1997-09-15T04:00:00Z' },
      { eventAction: 'expiration', eventDate: '2028-09-14T04:00:00Z' }],
    status: ['client transfer prohibited'],
    entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'MarkMonitor Inc.']]] }],
  });
  check(s.registered.startsWith('1997') && s.registrar === 'MarkMonitor Inc.' && s.status.length === 1,
    `summarises a real record: ${s.registrar}, registered ${s.registered.slice(0, 10)}`);
  check(summariseRecord(null) === null && summariseRecord({}).registrar === null, 'a missing or empty record does not throw');
}

console.log('— the client, against a stub registry —');
{
  clearMemo();
  const seen = [];
  const stub = async (url) => {
    seen.push(url);
    if (url.includes('taken.com')) return new Response('{"objectClassName":"domain"}', { status: 200 });
    if (url.includes('slow.com')) return new Response('', { status: 429 });
    return new Response('{"errorCode":404,"title":"Domain not found"}', { status: 404 });
  };
  const opts = { fetch: stub, timeoutMs: 500, retries: 0 };

  check((await checkOne('taken', 'com', data, opts)).verdict === 'taken', 'a 200 reads as taken');
  check((await checkOne('freeee', 'com', data, opts)).verdict === 'free', 'a 404 reads as free');
  check((await checkOne('slow', 'com', data, opts)).verdict === 'unknown', 'a 429 reads as unknown');
  check((await checkOne('anything', 'sh', data, opts)).verdict === 'unverifiable', 'a TLD with no RDAP is unverifiable, unqueried');
  check((await checkOne('-bad-', 'com', data, opts)).verdict === 'invalid', 'a bad label never reaches the registry');
  check((await checkOne('x', 'thistldnotexist', data, opts)).verdict === 'invalid', 'an unreal TLD never reaches the registry');

  const before = seen.length;
  await checkOne('taken', 'com', data, opts);
  check(seen.length === before, 'the memo means the same question is only asked once');

  clearMemo();
  seen.length = 0;
  const many = await checkMany([['aaa', 'com'], ['taken', 'com'], ['bbb', 'dev'], ['ccc', 'sh']], data, opts);
  check(many.length === 4, 'checkMany answers every pair');
  check(many[0].domain === 'aaa.com' && many[1].domain === 'taken.com' && many[3].domain === 'ccc.sh',
    'results come back in the order they were asked, not the order they finished');
  check(many[3].verdict === 'unverifiable' && !seen.some((u) => u.includes('.sh')), 'the unverifiable one cost no request');

  clearMemo();
  const capped = await checkMany(Array.from({ length: 40 }, (_, i) => [`w${i}`, 'com']), data, { ...opts, maxTlds: 6 });
  check(capped.length === 6, 'the per-request cap holds, so one caller cannot flood a registry');

  clearMemo();
  const boom = await checkOne('kaboom', 'com', data, { ...opts, fetch: async () => { throw new Error('socket hung up'); } });
  check(boom.verdict === 'unknown', 'a thrown fetch is a verdict, not a crash');
}

console.log(failures === 0 ? '\nall good' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
