// town-proxy.selftest.mjs — the live hands: the real client, over real HTTP, against a fake PDS.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTownProxy, TOWN_CLIENT } from './town-proxy.mjs';
import { DID } from './account.mjs';

const repo = { 'town.delve.graph.follow': [], 'town.delve.feed.like': [], 'com.minomobi.garden.plot': [], 'town.delve.actor.profile': [] };
const calls = [];
let n = 0;
const fake = async (url, init = {}) => {
  const u = new URL(url), nsid = u.pathname.split('/').pop().split('.').pop();
  const body = init.body ? JSON.parse(init.body) : Object.fromEntries(u.searchParams);
  calls.push({ nsid, body, proxy: init.headers?.['atproto-proxy'] || null, auth: !!init.headers?.authorization });
  const ok = (o) => ({ ok: true, json: async () => o });
  if (nsid === 'createSession') return ok({ did: DID, accessJwt: 't' });
  if (nsid === 'resolveHandle') return ok({ did: 'did:plc:friend' });
  if (nsid === 'listRecords') return ok({ records: repo[body.collection].map((r) => ({ uri: r.uri, value: r.value })) });
  if (nsid === 'createRecord') { const uri = `at://${DID}/${body.collection}/r${++n}`; repo[body.collection].push({ uri, value: body.record }); return ok({ uri }); }
  if (nsid === 'deleteRecord') { repo[body.collection] = repo[body.collection].filter((r) => !r.uri.endsWith('/' + body.rkey)); return ok({}); }
  if (nsid === 'getPosts') return ok({ posts: [{ uri: body.uris, cid: 'bafypost' }] });
  if (nsid === 'getFollows') return ok({ follows: [{ handle: 'a.delve.town' }] });
  if (nsid === 'putRecord' || nsid === 'applyWrites' || nsid === 'getRecord' || nsid === 'describeRepo') { repo.last = { nsid, body }; return ok({ uri: `at://${body.repo}/${body.collection}/${body.rkey || 'k'}`, value: body.record || null }); }
  return { ok: false, status: 400, json: async () => ({ error: 'unexpected ' + nsid }) };
};
const p = await startTownProxy({ password: 'pw', fetchImpl: fake, caps: { follows_per_day: 2, likes_per_day: 5, reads_per_run: 3 },
  acts: [{ at: new Date().toISOString(), part: 'modulo', kind: 'like', subject: 'x' }] });
const dir = mkdtempSync(join(tmpdir(), 'tc-')); writeFileSync(join(dir, 'town.mjs'), TOWN_CLIENT);
const run = async (soul, ...args) => { try { const { stdout } = await exec('node', [join(dir, 'town.mjs'), ...args], { env: { ...process.env, MINIPHIM_TOWN_URL: p.url, WHETSTONE_SOUL: soul } }); return { ok: true, out: JSON.parse(stdout) }; } catch (e) { return { ok: false, out: JSON.parse(e.stdout || '{}') }; } };

assert.equal((await run('modulo')).out.left.like, 4, "yesterday's acts and today's earlier ones count against today's cap");
const r = (await run('morphyx', 'read', 'town.delve.graph.getFollows', 'actor=modalmobius.delve.town', 'limit=100'));
assert.ok(r.ok && r.out.follows.length === 1);
assert.equal(calls.find((c) => c.nsid === 'getFollows').proxy, 'did:web:api.delve.town#bsky_appview', 'reads go through the town\'s AppView');
assert.ok(!(await run('morphyx', 'read', 'com.atproto.server.createAppPassword')).ok, 'a read the door does not allow is refused');
assert.ok(!(await run('', 'follow', 'friend.delve.town')).ok, 'an act must say which part made it');
const f = (await run('mozzie', 'follow', 'friend.delve.town'));
assert.ok(f.ok && f.out.subject === 'did:plc:friend' && repo['town.delve.graph.follow'].length === 1);
assert.equal(repo['town.delve.graph.follow'][0].value.$type, 'town.delve.graph.follow');
assert.ok((await run('mozzie', 'follow', 'friend.delve.town')).out.already, 'following twice is a no-op, not a second record');
assert.ok((await run('modulo', 'unfollow', 'did:plc:friend')).ok && repo['town.delve.graph.follow'].length === 0);
const capped = (await run('modulo', 'follow', 'friend.delve.town'));
assert.ok(!capped.ok && /cap: 2 follows/.test(capped.out.error), 'the cap holds in code');
assert.ok((await run('morphyx', 'like', 'at://did:plc:friend/town.delve.feed.post/3abc')).ok);
assert.deepEqual(repo['town.delve.feed.like'][0].value.subject, { uri: 'at://did:plc:friend/town.delve.feed.post/3abc', cid: 'bafypost' });
assert.ok(!(await run('morphyx', 'like', 'https://evil.example/')).ok, 'a like needs a town post uri');
assert.ok(!(await run('morphyx', 'follow', DID)).ok, 'the account does not follow itself');
assert.ok(!(await run('morphyx', 'post', 'hello')).ok, 'posts are not an act: they go through the outbox');
(await run('morphyx', 'read', 'town.delve.graph.getFollows', 'actor=x')); (await run('morphyx', 'read', 'town.delve.graph.getFollows', 'actor=x'));
assert.ok(!(await run('morphyx', 'read', 'town.delve.graph.getFollows', 'actor=x')).ok, 'reads are capped per run');
assert.ok(calls.every((c) => !c.body?.repo || c.body.repo === DID), 'every write and listing was in our own repo');
assert.deepEqual(p.log.filter((a) => !a.failed).map((a) => `${a.part}:${a.kind}`), ['mozzie:follow', 'modulo:unfollow', 'morphyx:like']);

// Their repo, all of it: any collection, always ours; posts to the outbox; the profile keeps its bot label.
const p2 = await startTownProxy({ password: 'pw', fetchImpl: fake, caps: { follows_per_day: 2, likes_per_day: 5, reads_per_run: 10, repo_writes_per_day: 3, posts_via_outbox: true } });
const run2 = async (soul, ...args) => { try { const { stdout } = await exec('node', [join(dir, 'town.mjs'), ...args], { env: { ...process.env, MINIPHIM_TOWN_URL: p2.url, WHETSTONE_SOUL: soul } }); return { ok: true, out: JSON.parse(stdout) }; } catch (e) { return { ok: false, out: JSON.parse(e.stdout || '{}') }; } };
writeFileSync(join(dir, 'plot.json'), JSON.stringify({ name: 'bed one', water: 3 }));
const made = await run2('mozzie', 'repo', 'createRecord', 'collection=com.minomobi.garden.plot', 'record=@' + join(dir, 'plot.json'), 'repo=did:plc:someoneelse');
assert.ok(made.ok, JSON.stringify(made.out));
const created = repo['com.minomobi.garden.plot'].at(-1);
assert.match(created.uri, new RegExp(`^at://${DID}/`), 'always our repo, whatever the client says');
assert.equal(created.value.$type, 'com.minomobi.garden.plot', 'the record gets its $type');
writeFileSync(join(dir, 'prof.json'), JSON.stringify({ displayName: 'miniphim (bot)', description: 'x' }));
assert.ok((await run2('modulo', 'repo', 'putRecord', 'collection=town.delve.actor.profile', 'rkey=self', 'record=@' + join(dir, 'prof.json'))).ok);
assert.deepEqual(repo.last.body.record.labels, { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'bot' }] }, 'the profile keeps its bot label');
const post = await run2('modulo', 'repo', 'createRecord', 'collection=town.delve.feed.post', 'record=@' + join(dir, 'plot.json'));
assert.ok(!post.ok && /outbox/.test(post.out.error), 'posts go through the outbox while their rule says so');
assert.ok((await run2('morphyx', 'repo', 'listRecords', 'collection=com.minomobi.garden.plot')).ok, 'reads are not writes');
assert.ok((await run2('morphyx', 'repo', 'deleteRecord', 'collection=com.minomobi.garden.plot', 'rkey=r1')).ok);
const capped2 = await run2('morphyx', 'repo', 'deleteRecord', 'collection=com.minomobi.garden.plot', 'rkey=r2');
assert.ok(!capped2.ok && /repo writes a day/.test(capped2.out.error), 'the write cap holds');
assert.deepEqual(p2.log.filter((a) => !a.failed).map((a) => `${a.part}:${a.op}`), ['mozzie:createRecord', 'modulo:putRecord', 'morphyx:deleteRecord']);
await p2.close();
await p.close();
console.log('miniphim town proxy selftest: live reads through the AppView, follow/unfollow/like idempotent, caps across runs, attributed, posts kept out; the whole repo (any collection, always ours, profile keeps its label, write cap)');
