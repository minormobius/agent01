// hyperball's worker, held: run `node hyperball/test/worker.selftest.mjs`. The network is stubbed.
import { handle, DID, newCode, HyperballRoom } from '../worker.js';
import { whoIs } from '../room.js';
import { CODE } from '../js/room-core.js';

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

// rooms
{
  const r = await handle(new Request('https://hyperball.mino.mobi/api/rooms', { method: 'POST' }), {}, {}, stub(null), null);
  const j = await r.json();
  ok(r.status === 200 && CODE.test(j.code), `POST /api/rooms gives a room code (${j.code})`);
  ok(Array.from({ length: 200 }, () => newCode()).every((c) => CODE.test(c)), 'every code is a valid code');
  ok((await handle(req('/api/rooms/K7Q0/ws'), {}, {}, stub(null), null)).status === 400, 'a code with a 0 in it is refused');
  let named = null, path = null;
  const ROOM = { idFromName: (n) => { named = n; return n; }, get: () => ({ fetch: (q) => { path = new URL(q.url).pathname; return new Response('room'); } }) };
  const rr = await handle(req('/api/rooms/k7qx/ws'), { ROOM }, {}, stub(null), null);
  ok((await rr.text()) === 'room' && named === 'K7QX' && path === '/api/rooms/K7QX/ws', 'a room socket goes to the Durable Object named by its code (upper-cased)');
}
{
  const f = async (url, init) => (init.headers.authorization === 'Bearer good' ? Response.json({ did, handle: 'alice.test', scope: 'atproto' }) : new Response('no', { status: 401 }));
  ok((await whoIs('good', f)).did === did && (await whoIs('bad', f)) === null && (await whoIs(null, f)) === null, 'a token is checked with auth.mino.mobi/api/me: good gives the DID, bad or none a guest');
}
// the Durable Object, with fake sockets
{
  class Sock { constructor() { this.l = {}; this.out = []; this.readyState = 1; this.peer = null; } accept() {} addEventListener(t, f) { (this.l[t] ||= []).push(f); } send(d) { this.peer.out.push(JSON.parse(d)); } close() { this.readyState = 3; } emit(t, e) { for (const f of this.l[t] || []) f(e); } }
  globalThis.WebSocketPair = class { constructor() { const a = new Sock(), b = new Sock(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; } };
  const RealResponse = globalThis.Response;
  globalThis.Response = class extends RealResponse { constructor(body, init = {}) { super(body, init.status === 101 ? {} : init); if (init.webSocket) { this.webSocket = init.webSocket; this.s = 101; } } };
  const room = new HyperballRoom({}, {});
  const up = new Request('https://room/api/rooms/K7QX/ws', { headers: { upgrade: 'websocket' } });
  const r1 = await room.fetch(up), r2 = await room.fetch(up);
  const c1 = r1.webSocket, c2 = r2.webSocket;
  ok(r1.s === 101 && c1, 'the room accepts a websocket');
  const srv1 = c1.peer, srv2 = c2.peer;
  srv1.emit('message', { data: JSON.stringify({ t: 'hi', team: 'orange' }) });
  srv2.emit('message', { data: JSON.stringify({ t: 'hi' }) });
  await new Promise((res) => setTimeout(res, 20));
  ok(c1.out.some((m) => m.t === 'welcome') && room.core.conns.size === 2, 'two guests say hi and are welcomed');
  const host = c1.out.find((m) => m.t === 'welcome').you;
  srv1.emit('message', { data: JSON.stringify({ t: 'start' }) });
  await new Promise((res) => setTimeout(res, 300));
  ok(room.core.phase === 'play' && c2.out.filter((m) => m.t === 'snap').length >= 3, `the host starts and snapshots flow (${c2.out.filter((m) => m.t === 'snap').length} in 0.3 s)`);
  srv1.emit('close', {}); srv2.emit('close', {});
  ok(room.core === null && room.timer === null, 'when everyone leaves the room stops ticking and forgets');
  void host;
  globalThis.Response = RealResponse;
}
console.log(`${fails ? '✗' : '✓'} hyperball worker: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
