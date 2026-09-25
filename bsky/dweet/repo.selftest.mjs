/**
 * repo.js against canned responses — identity resolution, the listRecords
 * page, and the one gate every record passes through.
 *
 *   node bsky/dweet/repo.selftest.mjs
 */
import { resolveDid, resolveIdentity, listDweets, dweetFromRow } from './repo.js';

let fails = 0;
const ok = (msg, cond) => { if (cond) console.log(`  ✓ ${msg}`); else { fails++; console.log(`  ✗ ${msg}`); } };
const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

const DID = 'did:plc:yivyyp54vddf7qf2lpsikhe4';
const seen = [];
const fake = async (url) => {
  seen.push(url);
  if (url.includes('resolveHandle?handle=morphyx.example')) return json({ did: DID });
  if (url.includes('resolveHandle')) return json({ error: 'not found' }, 400);
  if (url === `https://plc.directory/${DID}`) return json({
    alsoKnownAs: ['at://morphyx.example'],
    service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example/' }],
  });
  if (url.startsWith('https://pds.example/xrpc/com.atproto.repo.listRecords')) {
    const u = new URL(url);
    const limit = Number(u.searchParams.get('limit'));
    const rec = (k, value) => ({ uri: `at://${DID}/com.minomobi.dweet.dweet/${k}`, cid: `cid${k}`, value });
    const rows = [
      rec('3a', { src: 'c.width|=0', lang: 'js', title: 'one', createdAt: '2026-09-25T00:00:00Z', captureTime: 2000 }),
      rec('3b', { src: 'o=vec4(1);', lang: 'glsl', createdAt: '2026-09-24T00:00:00Z' }),
      rec('3c', { src: 'x'.repeat(300), lang: 'js', createdAt: '2026-09-23T00:00:00Z' }),   // over the cap
      rec('3d', { lang: 'js' }),                                                             // no src
    ].slice(0, limit);
    return json({ records: rows, cursor: 'next' });
  }
  return json({}, 404);
};

console.log('resolveDid');
ok('a handle resolves', await resolveDid('@morphyx.example', { fetch: fake }) === DID);
ok('a bsky.app profile URL resolves', await resolveDid('https://bsky.app/profile/morphyx.example', { fetch: fake }) === DID);
ok('a DID passes through without a request', await (async () => {
  const n = seen.length; const d = await resolveDid(DID, { fetch: fake }); return d === DID && seen.length === n;
})());
ok('an unknown handle throws, naming it', await resolveDid('nobody.example', { fetch: fake }).then(() => false, (e) => /nobody\.example/.test(e.message)));
ok('an empty handle throws', await resolveDid('  ', { fetch: fake }).then(() => false, () => true));

console.log('resolveIdentity');
const id = await resolveIdentity(DID, { fetch: fake });
ok('the PDS comes from the DID document, trailing slash dropped', id.pds === 'https://pds.example');
ok('the handle comes from alsoKnownAs', id.handle === 'morphyx.example');
ok('did:web resolves via .well-known', await resolveIdentity('did:web:nope.example', {
  fetch: async (u) => u === 'https://nope.example/.well-known/did.json'
    ? json({ service: [{ id: '#atproto_pds', serviceEndpoint: 'https://w.example' }] }) : json({}, 404),
}).then((r) => r.pds === 'https://w.example'));
ok('an unsupported method throws', await resolveIdentity('did:key:z', { fetch: fake }).then(() => false, () => true));

console.log('listDweets');
const page = await listDweets(id.pds, DID, { limit: 4, fetch: fake });
ok('valid records come back as dweets', page.dweets.length === 2);
ok('…over-the-cap and src-less records are dropped, and counted', page.dropped === 2);
ok('…with the firehose shape: uri, did, lang, title', page.dweets[0].uri === `at://${DID}/com.minomobi.dweet.dweet/3a`
  && page.dweets[0].did === DID && page.dweets[0].title === 'one' && page.dweets[1].lang === 'glsl');
ok('…captureTime carried', page.dweets[0].captureTime === 2000);
ok('a full page keeps the cursor', page.cursor === 'next');
const short = await listDweets(id.pds, DID, { limit: 10, fetch: fake });
ok('a short page ends paging even if a cursor was sent', short.cursor === null);
ok('a non-200 throws', await listDweets('https://down.example', DID, { fetch: async () => json({}, 502) })
  .then(() => false, (e) => /502/.test(e.message)));
ok('dweetFromRow refuses a row with no value', dweetFromRow(DID, { uri: 'at://x/y/z' }) === null);

if (fails) { console.log(`\nrepo.selftest: ${fails} FAILED`); process.exit(1); }
console.log('\nrepo.selftest: all passed');
