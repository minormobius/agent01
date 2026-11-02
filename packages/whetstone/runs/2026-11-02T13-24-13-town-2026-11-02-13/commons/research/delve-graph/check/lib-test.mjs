// node research/delve-graph/check/lib-test.mjs : tests www/delve-graph/lib.js without a browser
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const root = new URL('../../../www/delve-graph/', import.meta.url);
const ctx = { URLSearchParams, Map, Set, Math, Promise, Date, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('lib.js', root), 'utf8'), ctx);
const DG = ctx.DG;
// 1. planted partition: 4 groups of 20, p_in .5, p_out .02 -> recovers the groups
{ const r = DG.rng(7), E = []; for (let a = 0; a < 80; a++) for (let b = a + 1; b < 80; b++) if (r() < ((a / 20 | 0) === (b / 20 | 0) ? 0.5 : 0.02)) E.push([a, b, 1]);
  const c = DG.communities(80, E, { runs: 10, nulls: 5 }); const pure = [0, 1, 2, 3].every((g) => new Set(c.comm.slice(g * 20, g * 20 + 20)).size === 1);
  console.log('planted: Q', c.Q.best.toFixed(3), 'null max', c.nullMax.toFixed(3), 'groups', c.groups, 'pure', pure); assert.ok(pure && c.groups === 4 && c.Q.best > c.nullMax + 0.2); }
// 2. weights matter: two triangles joined by a heavy edge vs light edge
{ const E = [[0,1,1],[1,2,1],[0,2,1],[3,4,1],[4,5,1],[3,5,1],[2,3,0.1]]; const c = DG.communities(6, E, { runs: 5, nulls: 0 }); assert.equal(c.groups, 2);
  const E2 = E.map((e) => e.slice()); E2[6][2] = 50; const c2 = DG.communities(6, E2, { runs: 5, nulls: 0 }); assert.equal(c2.comm[2], c2.comm[3]); console.log('weights: light bridge 2 groups, heavy bridge merges 2&3: ok'); }
// 3. the morning snapshot, mutual follows: Louvain should match or beat the greedy 0.2086
{ const D = JSON.parse(fs.readFileSync(new URL('data.json', root))); const g = DG.fromSnapshot(D); const E = DG.weightedEdges(g, 'follow');
  const c = DG.communities(g.nodes.length, E, { runs: 30, nulls: 10 }); console.log('snapshot: pairs', E.length, 'Q best', c.Q.best.toFixed(4), 'median', c.Q.median.toFixed(4), 'null max', c.nullMax.toFixed(4), 'groups', c.groups, 'isolated', c.isolated);
  assert.equal(E.length, 632); assert.equal(c.isolated, 60); assert.ok(c.Q.best >= 0.2086 - 0.005); }
// 4. targetsOf
{ const self = 'did:plc:me', o = 'did:plc:o';
  const T = (it) => DG.targetsOf(it, self).map((x) => x.join(':')).join(',');
  assert.equal(T({ post: { author: { did: self }, record: { reply: { parent: { uri: `at://${o}/x/1` } } } } }), 'reply:' + o);
  assert.equal(T({ post: { author: { did: self }, record: { facets: [{ features: [{ $type: 'town.delve.richtext.facet#mention', did: o }] }] } } }), 'mention:' + o);
  assert.equal(T({ post: { author: { did: self }, record: { embed: { $type: 'town.delve.embed.record', record: { uri: `at://${o}/p/2` } } } } }), 'quote:' + o);
  assert.equal(T({ reason: { $type: 'app.bsky.feed.defs#reasonRepost' }, post: { author: { did: o }, record: { reply: { parent: { uri: 'at://did:plc:z/x' } } } } }), 'repost:' + o);
  assert.equal(T({ post: { author: { did: self }, record: { reply: { parent: { uri: `at://${self}/x/1` } } } } }), '');
  console.log('targetsOf: reply, mention, quote, repost, self-thread: ok'); }
// 5. crawl against a stub world: seed s follows a,b; a follows b,s,c; b follows a; feeds: a replies to b twice
{ const prof = (h) => ({ did: 'did:plc:' + h, handle: h + '.delve.town', labels: h === 'b' ? [{ val: 'bot' }] : [] });
  const fol = { s: ['a', 'b'], a: ['b', 's', 'c'], b: ['a'] };
  const feed = { 'did:plc:a': [{ post: { author: { did: 'did:plc:a' }, record: { reply: { parent: { uri: 'at://did:plc:b/p/1' } } } } }, { post: { author: { did: 'did:plc:a' }, record: { reply: { parent: { uri: 'at://did:plc:b/p/2' } } } } }] };
  const fetchJson = async (u) => { const url = new URL(u), m = url.pathname.split('.').slice(-2).join('.'), a = url.searchParams.get('actor');
    if (m === 'actor.getProfile') return prof(a.split('.')[0]);
    if (m === 'graph.getFollows') return { follows: (fol[a.replace('did:plc:', '')] || []).map(prof) };
    if (m === 'feed.getAuthorFeed') return { feed: feed[a] || [] }; throw new Error(m); };
  const g = await DG.crawl('s.delve.town', 'delve', { fetchJson });
  const H = (i) => g.nodes[i].handle[0];
  console.log('crawl: nodes', g.nodes.map((n) => n.handle[0] + n.depth + (n.bot ? 'b' : '')).join(' '), 'follows', g.follows.map(([a, b]) => H(a) + H(b)).join(' '), 'talk', g.interactions.map(([a, b, n]) => H(a) + H(b) + n).join(' '), 'reads', g.reads);
  assert.equal(g.nodes.length, 4); assert.equal(g.follows.length, 6); assert.equal(g.interactions.map(([a, b, n]) => H(a) + H(b) + n).join(), 'ab2');
  const both = DG.weightedEdges(g, 'both', 'count'); assert.equal(both.find(([a, b]) => H(a) + H(b) === 'ab' || H(a) + H(b) === 'ba')[2], 3);
  const g2 = await DG.crawl('s.bsky.social', 'bsky', { fetchJson }); assert.equal(g2.nodes.length, 3, 'bsky does not add two-hop nodes'); }
console.log('ALL OK');
