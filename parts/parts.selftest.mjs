#!/usr/bin/env node
// parts.selftest — the index over node:sqlite, with a fake PDS behind three
// repos and a fake Constellation answering backlinks. Exit 1 on any failure.
import { DatabaseSync } from 'node:sqlite';
import { Index, shape, COMMUNITY, POST, COMMENT, VOTE, SCOPE, SLUG } from './lib/index.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

// the db seam over node:sqlite
const sq = new DatabaseSync(':memory:');
const db = { run: (sql, ...p) => sq.prepare(sql).run(...p), all: (sql, ...p) => sq.prepare(sql).all(...p) };

// three repos, as a fake PDS would serve them
const repos = { 'did:plc:alice': {}, 'did:plc:bob': {}, 'did:plc:carol': {} };
let tid = 1000;
const put = (did, collection, value, rkey = String(++tid)) => { const uri = `at://${did}/${collection}/${rkey}`; (repos[did][collection] ??= new Map()).set(uri, { uri, cid: 'bafy' + Math.random().toString(36).slice(2, 10), value }); return { uri, cid: repos[did][collection].get(uri).cid }; };
const del = (did, collection, uri) => repos[did][collection]?.delete(uri);
const links = []; // fake constellation: [target, collection, path, did]
let calls = { pds: 0, plc: 0, constellation: 0 };
const fakeFetch = async (u) => {
  u = new URL(u); const q = Object.fromEntries(u.searchParams);
  if (u.host === 'plc.directory') { calls.plc++; return Response.json({ service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.example' }] }); }
  if (u.host === 'public.api.bsky.app') return Response.json({ did: 'did:plc:alice' });
  if (u.host === 'pds.example') { calls.pds++; const recs = [...(repos[q.repo]?.[q.collection]?.values() || [])]; return Response.json({ records: recs }); }
  if (u.host === 'constellation.microcosm.blue') { calls.constellation++; const dids = [...new Set(links.filter((l) => l[0] === q.target && l[1] === q.collection && l[2] === q.path).map((l) => l[3]))]; return Response.json({ total: dids.length, linking_records: dids.map((did) => ({ did, collection: q.collection, rkey: 'x' })) }); }
  return new Response('nope', { status: 404 });
};
let clock = Date.parse('2026-09-12T12:00:00Z');
const ix = new Index(db, { fetch: fakeFetch, now: () => clock });

check(SCOPE === 'atproto repo:com.minomobi.cad.community repo:com.minomobi.cad.post repo:com.minomobi.cad.comment repo:com.minomobi.cad.vote', 'the scope names the four collections');
check(SLUG.test('mech-keyboards') && !SLUG.test('Mech') && !SLUG.test('a') && !SLUG.test('-x-'), 'slugs are lowercase, 3–32, no leading or trailing dash');
check(shape(COMMUNITY, 'at://did:plc:alice/com.minomobi.cad.community/clocks', 'c', 'did:plc:alice', { name: 'other', title: 'x' }) === null, 'a community whose name disagrees with its rkey is not ours');
check(shape(POST, 'at://did:plc:bob/com.minomobi.cad.post/1', 'c', 'did:plc:bob', { title: 't', community: { uri: 'at://x/com.minomobi.cad.community/c', cid: 'c' }, part: { uri: 'at://x/com.minomobi.cad.part/h', cid: 'c' } }) === null, 'a post must reference a revision, not a head');

// alice founds a community; bob posts; carol comments and votes; bob votes on carol's comment
const community = put('did:plc:alice', COMMUNITY, { name: 'clocks', title: 'Clocks', description: 'movements, escapements, cases', createdAt: '2026-09-12T10:00:00Z' }, 'clocks');
put('did:plc:alice', COMMUNITY, { name: 'Bad Name', title: 'nope' }, 'Bad Name'); // ignored
const rev = { uri: 'at://did:plc:gd6m4mw3km2betcnbbs6362q/com.minomobi.cad.revision/3mvbgqo7wnk2w', cid: 'bafyreib6ub3' };
const post = put('did:plc:bob', POST, { community, part: rev, title: 'A lever escapement that ticks', text: 'sixty beats, two turns', createdAt: '2026-09-12T11:00:00Z' });
const older = put('did:plc:bob', POST, { community, part: rev, title: 'older post', createdAt: '2026-09-10T11:00:00Z' });
const c1 = put('did:plc:carol', COMMENT, { post, text: 'does the pallet clear?', createdAt: '2026-09-12T11:10:00Z' });
const c2 = put('did:plc:bob', COMMENT, { post, parent: c1, text: 'checked mid-beat, 0.0120 mm³ expected touch only', createdAt: '2026-09-12T11:20:00Z' });
put('did:plc:carol', VOTE, { subject: post, value: 1, createdAt: '2026-09-12T11:11:00Z' });
put('did:plc:alice', VOTE, { subject: post, value: 1, createdAt: '2026-09-12T11:12:00Z' });
put('did:plc:bob', VOTE, { subject: c1, value: 1, createdAt: '2026-09-12T11:21:00Z' });
put('did:plc:alice', VOTE, { subject: older, value: -1, createdAt: '2026-09-12T11:30:00Z' });
links.push([community.uri, POST, '.community.uri', 'did:plc:bob'], [post.uri, COMMENT, '.post.uri', 'did:plc:carol'], [post.uri, VOTE, '.subject.uri', 'did:plc:carol'], [post.uri, VOTE, '.subject.uri', 'did:plc:alice'], [c1.uri, VOTE, '.subject.uri', 'did:plc:bob']);

// alice self-reports after founding
const a = await ix.indexRepo('alice.example');
check(a.did === 'did:plc:alice' && a.added === 3 && a.skipped === 1, `indexRepo by handle: alice's community and two votes land, the bad slug is skipped (${JSON.stringify(a)})`);
check(ix.communities().length === 1 && ix.communities()[0].name === 'clocks' && ix.communities()[0].posts === 0, 'the community lists with no posts yet');
check(ix.feed().length === 0, 'the feed is empty: bob has not been indexed and nobody told us about him');

// the sweep discovers bob through the community's backlinks, then carol through the post's
const s1 = await ix.sweep();
check(s1.discovered === 2 && s1.errors.length === 0, `sweep discovers bob and carol through Constellation (${JSON.stringify(s1)})`);
const feed = ix.feed();
check(feed.length === 2 && feed[0].uri === post.uri && feed[0].score === 2 && feed[0].votes === 2 && feed[0].comments === 2 && feed[0].communityName === 'clocks', `the feed: bob's post on top, score ${feed[0].score}, ${feed[0].comments} comments`);
check(feed[1].score === -1 && ix.feed({ sort: 'new' })[0].uri === post.uri && ix.feed({ sort: 'top' })[1].uri === older.uri, 'hot, new and top all agree on this shape; the downvoted older post trails');
const thread = ix.thread(post.uri);
check(thread.length === 1 && thread[0].uri === c1.uri && thread[0].score === 1 && thread[0].replies.length === 1 && thread[0].replies[0].uri === c2.uri, 'the thread nests bob\'s reply under carol\'s comment with its score');
check(ix.mine('did:plc:alice')[post.uri]?.value === 1 && ix.mine('did:plc:alice')[older.uri]?.value === -1, 'mine() reports alice\'s votes by subject');
check(ix.community(community.uri).posts === 2 && ix.communityByName('clocks').uri === community.uri, 'a community knows its post count and resolves by name');

// idempotence: another sweep changes nothing and touches nothing stale
calls = { pds: 0, plc: 0, constellation: 0 };
const s2 = await ix.sweep();
check(s2.discovered === 0 && s2.refreshed === 0 && calls.pds === 0, `a second sweep within the freshness window re-indexes nobody (${calls.constellation} constellation calls, ${calls.pds} PDS calls)`);

// a changed vote, a deleted comment, a deleted post: the repo is the truth
repos['did:plc:carol'][VOTE].clear(); put('did:plc:carol', VOTE, { subject: post, value: -1, createdAt: '2026-09-12T12:30:00Z' });
del('did:plc:bob', COMMENT, c2.uri);
const r = await ix.indexRepo('did:plc:carol'); await ix.indexRepo('did:plc:bob');
check(ix.post(post.uri).score === 0 && ix.post(post.uri).votes === 2, `carol's re-vote replaces her old one, one vote per person (score ${ix.post(post.uri).score})`);
check(ix.thread(post.uri)[0].replies.length === 0, 'bob\'s deleted reply is gone from the thread');
del('did:plc:bob', POST, older.uri); await ix.indexRepo('did:plc:bob');
check(ix.feed().length === 1 && !ix.post(older.uri), 'a deleted post leaves the feed');
del('did:plc:alice', COMMUNITY, community.uri); await ix.indexRepo('did:plc:alice');
check(ix.feed().length === 0 && ix.communities().length === 0, 'deleting the community hides its posts from the front page (the records still exist in their repos)');

// staleness: a repo indexed long ago is refreshed by the sweep
clock += 7 * 3600e3; calls.pds = 0;
const s3 = await ix.sweep({ maxRepos: 2 });
check(calls.pds > 0 && s3.refreshed >= 1, `after six hours the sweep refreshes stale repos (${s3.refreshed} refreshed)`);
const st = ix.status();
check(st.repos === 3 && typeof st.lastSweep === 'number', `status: ${JSON.stringify(st)}`);

// a repo whose DID cannot be resolved is recorded, not fatal to the sweep
const bad = new Index({ run: db.run, all: db.all }, { fetch: async (u) => (new URL(u).host === 'plc.directory' ? new Response('', { status: 404 }) : fakeFetch(u)), now: () => clock });
check(await bad.indexRepo('did:plc:ghost').then(() => false, () => true) && db.all(`SELECT ok FROM repos WHERE did = 'did:plc:ghost'`)[0]?.ok === 0, 'an unresolvable repo is recorded with ok = 0');

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ parts selftest passed');
process.exit(fails ? 1 : 0);
