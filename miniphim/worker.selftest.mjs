// worker.selftest.mjs — the house's terms, held in node: the off switch, read-only, the content
// policy, the API table, and fetch only to the council's hosts.
import assert from 'node:assert/strict';
const realFetch = globalThis.fetch;
const { default: worker } = await import('./worker.js');
const ASSETS = { fetch: async () => new Response('<p>page</p>', { headers: { 'content-type': 'text/html', 'set-cookie': 'x=1' } }) };
const ctx = { waitUntil() {} };
const get = (path, env = { OPEN: 'true', ASSETS }, method = 'GET') => worker.fetch(new Request(`https://miniphim.minomobi.com${path}`, { method }), env, ctx);

let r = await get('/');
assert.equal(r.status, 200);
assert.match(r.headers.get('content-security-policy'), /connect-src 'self' https:\/\/plc\.directory https:\/\/public\.api\.bsky\.app https:\/\/api\.delve\.town https:\/\/pds\.delve\.town/);
assert.equal(r.headers.get('set-cookie'), null, 'no cookies, ever');
r = await get('/', { OPEN: 'false', ASSETS });
assert.equal(r.status, 503, 'the off switch closes pages'); assert.match(await r.text(), /closed it for now/);
assert.equal((await get('/api/', { OPEN: 'false', ASSETS })).status, 503, 'and the API');
assert.equal((await get('/', undefined, 'POST')).status, 405, 'read-only');
r = await get('/api/');
assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*');
assert.ok(Array.isArray((await r.json()).routes));
assert.equal((await get('/api/nope/')).status, 404);
await assert.rejects(fetch('https://example.com/'), /not allowed/, 'fetch to any other host throws');
await assert.rejects(fetch('http://plc.directory/'), /not allowed/, 'plain http too');
assert.ok(globalThis.fetch !== realFetch);
console.log('miniphim worker selftest: off switch (pages and API), read-only, no cookies, content policy, API table, fetch only to the council\'s hosts');
