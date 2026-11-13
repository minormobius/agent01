// hyperball's worker, held: run `node hyperball/test/worker.selftest.mjs`. The network is stubbed.
import { handle, DID } from '../worker.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('✗ ' + msg); } };
const did = 'did:plc:z72i7hdynmk6r22z27h6tvur';
const calls = [];
const stub = (profile, imgOk = true) => async (url) => {
  calls.push(String(url));
  if (String(url).includes('app.bsky.actor.getProfile')) return profile ? new Response(JSON.stringify(profile), { status: 200 }) : new Response('{}', { status: 400 });
  if (String(url).includes('searchActorsTypeahead')) return new Response('{"actors":[]}', { status: 200 });
  if (String(url).includes('cdn.bsky.app')) return imgOk ? new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }) : new Response('x', { status: 500 });
  return new Response('?', { status: 404 });
};
const req = (path) => new Request(`https://hyperball.mino.mobi${path}`);

ok(DID.test(did) && DID.test('did:web:example.com') && !DID.test('did:plc:short') && !DID.test('alice.bsky.social'), 'DIDs: plc and web accepted, a handle or a short plc refused');
{
  calls.length = 0;
  const r = await handle(req(`/avatar/${did}`), {}, {}, stub({ did, avatar: `https://cdn.bsky.app/img/avatar/plain/${did}/bafy@jpeg` }), null);
  ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && /max-age=86400/.test(r.headers.get('cache-control')), 'an avatar comes back from this origin, as an image, cached a day');
  ok(calls.some((c) => c.includes('/img/avatar_thumbnail/plain/')), 'it fetches the thumbnail, not the full picture');
}
ok((await handle(req('/avatar/alice.bsky.social'), {}, {}, stub(null), null)).status === 400, 'a handle (not a DID) is refused: 400');
ok((await handle(req(`/avatar/${did}`), {}, {}, stub({ did }), null)).status === 404, 'a profile with no avatar: 404, and the game draws its own');
ok((await handle(req(`/avatar/${did}`), {}, {}, stub(null), null)).status === 404, 'no such profile: 404');
ok((await handle(req(`/avatar/${did}`), {}, {}, stub({ did, avatar: 'https://cdn.bsky.app/img/avatar/plain/x' }, false), null)).status === 502, 'the CDN failing: 502');
{
  calls.length = 0;
  const r = await handle(req('/xrpc/app.bsky.actor.searchActorsTypeahead?q=mor&limit=8'), {}, {}, stub(null), null);
  ok(r.status === 200 && calls[0] === 'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=mor&limit=8', 'the typeahead is forwarded to the public AppView, query and all');
}
ok((await handle(req('/xrpc/com.atproto.repo.createRecord'), {}, {}, stub(null), null)).status === 404, 'any other XRPC method: not here');
{
  let served = null;
  const r = await handle(req('/js/main.js'), { ASSETS: { fetch: (q) => { served = new URL(q.url).pathname; return new Response('ok'); } } }, {}, stub(null), null);
  ok(r.status === 200 && served === '/js/main.js', 'everything else is the static site');
}
console.log(`${fails ? '✗' : '✓'} hyperball worker: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
