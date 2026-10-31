// node house/api/rooms.test.mjs : no network; a fake town of four rooms.
import assert from 'node:assert/strict';
import handler, { read } from './rooms.mjs';
import { parseRoom } from './lib/rooms.mjs';

const P = (did, k) => `at://did:plc:${did}/town.delve.feed.post/${k}`;
const A = P('aaa', 'r1'), B = P('bbb', 'r2'), C = P('ccc', 'r3'), D = P('ddd', 'r4'), C2 = P('ccc', 'r5'), GONE = P('eee', 'x9');
const post = (uri, handle, text, extra = {}) => ({ uri, author: { handle }, record: { text, createdAt: '2026-10-0' + uri.slice(-1) + 'T00:00:00Z', ...extra }, replyCount: 0 });
const posts = [
  post(A, 'a.t', `#delve-room [Vestibule]\nExits:\n- [To Orchard] ${B} (gate)\n- [To nowhere] ${GONE} (crumbled)\n- an uncarved door\nDescription: x`),
  post(B, 'b.t', `#delve-room [Orchard]\nExits:\n- [Back] ${A} (gate)`),
  post(C, 'c.t', '#delve-room [Reading Room]'),
  post(C2, 'c.t', '#delve-room [Reading Room]'),
  post(D, 'd.t', '#delve-room [Porch]'),
  post(P('fff', 'q1'), 'f.t', '#delve-room [Room N: Name]'),
  post(P('ggg', 'q2'), 'g.t', '#delve-room [Side]', { reply: { root: { uri: A } } }),
  post(P('hhh', 'q3'), 'h.t', 'what is a delve-room anyway'),
];
const threads = { [D]: [{ post: { uri: P('ddd', 'e1'), author: { handle: 'z.t' }, record: { text: `Exit: [To Orchard] ${B} (path)` } } }] };
const calls = [];
const get = async (m, q) => {
  calls.push(m);
  if (m === 'town.delve.feed.searchPosts') return { posts: q.q === '#delve-room' ? posts : [] };
  if (m === 'town.delve.feed.getPostThread') return { thread: { replies: threads[q.uri] || [] } };
  if (m === 'town.delve.feed.getPosts') return { posts: [] };
  throw new Error('unexpected ' + m);
};

const out = await read(get);
const names = out.rooms.map(r => r.name).sort();
assert.deepEqual(names, ['Orchard', 'Porch', 'Reading Room', 'Vestibule']);
assert.equal(out.stats.merged_copies, 1);
assert.deepEqual(out.rooms.find(r => r.name === 'Reading Room').copies, [C2]);
assert.equal(out.stats.doors, 4);
assert.equal(out.stats.two_way_pairs, 1);
assert.equal(out.stats.bricked, 1);
const exitReply = out.doors.find(d => d.via === 'reply');
assert.equal(exitReply.from, D); assert.equal(exitReply.to, B); assert.equal(exitReply.by, 'z.t'); assert.equal(exitReply.two_way, false);
assert.equal(out.stats.buildings, 2);
assert.deepEqual(out.buildings[0].rooms.sort(), [A, B, D].sort());
assert.equal(out.buildings[0].doors, 2);
assert.equal(out.buildings[0].needs_second_floor, false);
assert.ok(out.rooms.every(r => r.url && r.url.startsWith('https://delve.town/profile/')));
assert.deepEqual(out.rooms.find(r => r.name === 'Vestibule').promises, ['an uncarved door']);
assert.deepEqual(out.skipped.map(s => s.why).sort(), ["a reply, not a root post", "the convention's own template"]);
assert.equal(parseRoom(posts[7]).skip.includes('mentions'), true);
assert.deepEqual(out.errors, []);

// K5: five rooms, all ten pairs joined: 10 > 3*5-6 = 9, so it needs a second floor.
const K = ['k1', 'k2', 'k3', 'k4', 'k5'].map(k => P('kkk', k));
const kposts = K.map((u, i) => post(u, 'k.t', `#delve-room [K${i}]\nExits:\n` + K.filter(v => v !== u).map(v => `- [x] ${v} (door)`).join('\n')));
const k = await read(async (m, q) => m === 'town.delve.feed.searchPosts' ? { posts: q.q === '#delve-room' ? kposts : [] } : m === 'town.delve.feed.getPostThread' ? { thread: { replies: [] } } : { posts: [] });
assert.equal(k.buildings[0].doors, 10); assert.equal(k.buildings[0].needs_second_floor, true);

// The handler: fetch only api.delve.town; returns JSON.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = new URL(url); assert.equal(u.host, 'api.delve.town');
  const m = u.pathname.replace('/xrpc/', ''), q = Object.fromEntries(u.searchParams);
  return new Response(JSON.stringify(await get(m, q)), { status: 200 });
};
const res = await handler(new Request('https://miniphim.minomobi.com/api/rooms/'), {});
globalThis.fetch = realFetch;
assert.equal(res.status, 200);
const body = await res.json();
assert.equal(body.stats.rooms, 4); assert.ok(body.convention.includes('mistakeknot'));
console.log('rooms: ok');
