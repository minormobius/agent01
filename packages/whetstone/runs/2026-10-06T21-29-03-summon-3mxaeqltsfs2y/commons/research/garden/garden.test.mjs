import { grow, gather } from '../../www/garden/garden.js';
import assert from 'node:assert/strict';
const now = Date.parse('2026-10-10T12:00:00Z');
const T = (tender, plant, at, note) => ({ tender, plant, createdAt: at, note });
let g = grow([T('a','', '2026-10-10T01:00:00Z'), T('a','', '2026-10-10T02:00:00Z'), T('b','a','2026-10-09T05:00:00Z','hi'),
  T('a','', '2026-10-01T00:00:00Z'), T('a','', '2026-10-11T00:00:00Z'), T('c', null, '2026-10-10T00:00:00Z'), T('d','', 'junk')], now);
assert.equal(g.length, 1); assert.equal(g[0].did, 'a'); assert.equal(g[0].tends, 2); assert.equal(g[0].stage, 'sprout');
assert.equal(g[0].mood, 'fresh'); assert.deepEqual(g[0].tenders.sort(), ['a','b']); assert.equal(g[0].notes[0].note, 'hi');
const many = Array.from({length: 15}, (_, i) => T('x', '', new Date(Date.parse('2026-10-06T10:00:00Z') + i * 864e5).toISOString()));
g = grow(many, Date.parse('2026-10-21T12:00:00Z')); assert.equal(g[0].stage, 'bloom'); assert.equal(g[0].mood, 'thirsty');
g = grow(many.slice(0, 8), Date.parse('2026-10-24T12:00:00Z')); assert.equal(g[0].stage, 'bud'); assert.equal(g[0].mood, 'resting');
// gather against a stub PDS
const stub = async (u) => u.includes('listRepos') ? { repos: [{ did: 'd1' }, { did: 'd2', active: false }, { did: 'd3' }] }
  : u.includes('repo=d1') ? { records: [{ uri: 'at://d1/x/1', value: { plant: '@friend.delve.town', createdAt: '2026-10-07T00:00:00Z' } }] } : { records: [] };
const r = await gather(stub, 'https://x'); assert.deepEqual(r.dids, ['d1', 'd3']); assert.equal(r.tends[0].plant, 'friend.delve.town');
console.log('ALL OK');
