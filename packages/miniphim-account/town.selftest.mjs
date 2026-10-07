// town.selftest.mjs — what may leave the account, held to the souls' own protocol and the caps.
import assert from 'node:assert/strict';
import { decide, draftHash, factsOf, publish, CAPS, POST, facetsFor, cardUri } from './town.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HASH_TOOL } from '../whetstone/lib/town-run.mjs';
import { DID } from './account.mjs';

const now = '2026-10-05T12:00:00Z';
const post = (id, writer, text) => ({ id, writer, kind: 'post', text });
const yes = (d, part) => ({ id: d.id, part, verdict: 'yes', hash: draftHash(d) });
const ids = (r) => r.out.map((d) => d.id);
const held = (r, id) => r.held.find((h) => h.id === id)?.why || '';

// The protocol: a second part's yes on the exact hash; the writer can't approve itself; one veto kills.
const a = post('a', 'modulo', 'A measured thing. — Modulo');
const b = post('b', 'morphyx', 'Who holds the lever. — Morphyx');
const c = post('c', 'mozzie', 'Swept. — Mozzie');
let r = decide([a, b, c], [yes(a, 'morphyx'), yes(b, 'morphyx'), yes(c, 'modulo'), { id: 'c', part: 'morphyx', verdict: 'veto' }], { now });
assert.deepEqual(ids(r), ['a']);
assert.match(held(r, 'b'), /waiting for another part/);
assert.match(held(r, 'c'), /vetoed by morphyx/);
// An approval of an earlier version doesn't carry to an edited draft.
const a2 = { ...a, text: 'A measured thing, edited. — Modulo' };
r = decide([a2], [yes(a, 'mozzie')], { now });
assert.match(held(r, 'a'), /hash changed/);

// Signature, links, length.
const noSig = post('n', 'modulo', 'unsigned');
const wrongSig = post('w', 'modulo', 'signed by the wrong part. — Morphyx');
// Links go anywhere now; a bare "https://." in prose is not a link (it held a reply on 10-06).
const link = post('l', 'modulo', 'see https://arxiv.org/abs/2410.01234 — Modulo');
const okLink = post('k', 'modulo', 'it had no https://. so: https://del.mino.mobi/days/ — Modulo');
const long = post('g', 'modulo', `${'x'.repeat(CAPS.max_graphemes)} — Modulo`);
r = decide([noSig, wrongSig, link, okLink, long], [noSig, wrongSig, link, okLink, long].map((d) => yes(d, 'mozzie')), { now });
assert.deepEqual(ids(r), ['l', 'k']);
assert.match(held(r, 'n'), /signature/); assert.match(held(r, 'w'), /signature/);
assert.match(held(r, 'g'), /graphemes/);

// Posts a day: no cap (posts_per_day null, since 2026-10-07); a number, if one is ever set, still holds.
const many = Array.from({ length: 12 }, (_, i) => post(`p${i}`, 'morphyx', `post ${i}. — Morphyx`));
const capWas = CAPS.posts_per_day;
CAPS.posts_per_day = null;
r = decide(many, many.map((d) => yes(d, 'modulo')), { now, sent: [{ kind: 'post', at: '2026-10-05T01:00:00Z' }] });
assert.equal(r.out.length, 12, 'no posts cap');
CAPS.posts_per_day = 4;
r = decide(many, many.map((d) => yes(d, 'modulo')), { now, sent: [{ kind: 'post', at: '2026-10-05T01:00:00Z' }] });
assert.equal(r.out.length, 3, 'one already sent today counts');
assert.ok(r.held.every((h) => /posts a day/.test(h.why)));
CAPS.posts_per_day = capWas;

// Replies: only to what was read this day, not too old, per day, per author (the operator is exempt from the per-author cap).
const m = (uri, author, extra = {}) => ({ uri, cid: 'c', author_did: author, reply_root: { uri, cid: 'c' }, facts: { age_h: 1, from_operator: false, ...extra } });
const mentions = { 'at://x/1': m('at://x/1', 'did:alice'), 'at://x/2': m('at://x/2', 'did:alice'), 'at://x/3': m('at://x/3', 'did:alice'), 'at://x/old': m('at://x/old', 'did:bob', { age_h: 80 }),
  'at://x/op1': m('at://x/op1', 'did:op', { from_operator: true }), 'at://x/op2': m('at://x/op2', 'did:op', { from_operator: true }), 'at://x/op3': m('at://x/op3', 'did:op', { from_operator: true }) };
const reply = (id, uri) => ({ id, writer: 'modulo', kind: 'reply', text: `yes. — Modulo`, reply: { uri } });
const rs = [reply('r1', 'at://x/1'), reply('r2', 'at://x/2'), reply('r3', 'at://x/3'), reply('r4', 'at://x/old'), reply('r5', 'at://x/nowhere'),
  reply('o1', 'at://x/op1'), reply('o2', 'at://x/op2'), reply('o3', 'at://x/op3')];
r = decide(rs, rs.map((d) => yes(d, 'morphyx')), { now, mentions });
assert.deepEqual(ids(r), ['r1', 'r2', 'o1', 'o2', 'o3']);
assert.match(held(r, 'r3'), /one author/); assert.match(held(r, 'r4'), /older than/); assert.match(held(r, 'r5'), /addressed to us/);
// Replies to the person count toward no cap: a full day of others doesn't block one to them, and a
// long conversation with them doesn't use up the day (10-06: it held Mozzie's reply at 10).
const fullDay = Array.from({ length: CAPS.replies_per_day }, (_, i) => ({ kind: 'reply', at: now, author_did: `did:x${i}` }));
r = decide([reply('o1', 'at://x/op1'), reply('r1', 'at://x/1')], [reply('o1', 'at://x/op1'), reply('r1', 'at://x/1')].map((d) => yes(d, 'morphyx')), { now, mentions, sent: fullDay });
assert.deepEqual(ids(r), ['o1']); assert.match(held(r, 'r1'), /replies a day/);
const opDay = Array.from({ length: CAPS.replies_per_day + 5 }, () => ({ kind: 'reply', at: now, author_did: CAPS.operator_did }));
r = decide([reply('r1', 'at://x/1')], [yes(reply('r1', 'at://x/1'), 'morphyx')], { now, mentions, sent: opDay });
assert.deepEqual(ids(r), ['r1']);
const out1 = r.out.find((d) => d.id === 'r1');
assert.equal(out1.parent.uri, 'at://x/1'); assert.equal(out1.root.uri, 'at://x/1');

// PAUSED stops everything but retraction; retraction needs no second key, and only of our own posts.
const del = { id: 'd', writer: 'mozzie', kind: 'delete', target: `at://${DID}/${POST}/3abc` };
const delOther = { id: 'e', writer: 'mozzie', kind: 'delete', target: `at://did:plc:someoneelse/${POST}/3abc` };
r = decide([a, del, delOther], [yes(a, 'morphyx')], { now, paused: true });
assert.deepEqual(ids(r), ['d']);
assert.match(held(r, 'a'), /PAUSED/); assert.match(held(r, 'e'), /our own posts/);

// Facts the rules of the road decide on.
const f = factsOf({ reason: 'mention', indexedAt: '2026-10-05T09:00:00Z', author: { did: 'did:a', handle: 'modalmobius.delve.town', labels: [] },
  record: { text: 'what do you make of this? it has eight or more words in it', reply: { root: { uri: 'at://ours/1' } } } },
  { now, ours: new Set(['at://ours/1']), repliedToday: { 'did:a': 1 } });
assert.deepEqual({ ...f }, { addressed: true, reason: 'mention', age_h: 3, asks: true, has_link_or_file: false, words: 14, in_our_thread: true, replied_to_author_today: 1, author_is_bot: false, from_operator: true });

// Publishing builds the right records, through the door (which would refuse anything else).
const calls = [];
const fetchImpl = async (url, o) => { calls.push({ url: String(url), body: o.body ? JSON.parse(o.body) : null, headers: o.headers });
  if (String(url).includes('createSession')) return { ok: true, json: async () => ({ did: DID, accessJwt: 't' }) };
  return { ok: true, json: async () => ({ uri: `at://${DID}/${POST}/new`, cid: 'cid' }) }; };
const done = await publish([{ ...out1 }, { ...decide([a], [yes(a, 'morphyx')], { now }).out[0] }, del], { password: 'pw', now, fetchImpl });
assert.deepEqual(done.map((d) => [d.kind, d.failed || 'ok']), [['reply', 'ok'], ['post', 'ok'], ['delete', 'ok']]);
const create = calls.filter((c) => c.url.endsWith('createRecord'));
assert.equal(create[0].body.record.reply.parent.uri, 'at://x/1'); assert.equal(create[1].body.record.reply, undefined);
assert.ok(create.every((c) => c.body.repo === DID && c.body.collection === POST));

// Images: the hash covers each SVG's bytes and alt; the souls' hash tool agrees with the lab; a
// picture with no alt text is held; publishing uploads a PNG and embeds it.
{
  const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  const files = { 'www/c.svg': svg };
  const g = { id: 'g1', writer: 'modulo', kind: 'post', text: 'A chart. — Modulo', images: [{ file: 'www/c.svg', alt: 'a black square' }] };
  const hg = draftHash(g, files);
  assert.notEqual(hg, draftHash({ ...g, images: undefined }, files), 'the picture is in the hash');
  assert.notEqual(hg, draftHash(g, { 'www/c.svg': svg.replace('10"/>', '9"/>') }), 'a changed picture is a changed hash');
  assert.equal(draftHash({ id: 'x', kind: 'post', text: 't' }), draftHash({ id: 'x', kind: 'post', text: 't', images: [] }), 'no images: hashes from before images still hold');
  const root = mkdtempSync(join(tmpdir(), 'hash-')); mkdirSync(join(root, 'town', 'outbox'), { recursive: true }); mkdirSync(join(root, 'www'));
  writeFileSync(join(root, 'town', 'hash.mjs'), HASH_TOOL); writeFileSync(join(root, 'www', 'c.svg'), svg); writeFileSync(join(root, 'town', 'outbox', 'g1.json'), JSON.stringify(g));
  assert.equal(execFileSync('node', ['town/hash.mjs', 'town/outbox/g1.json'], { cwd: root, encoding: 'utf8' }).trim(), hg, "the souls' hash tool and the lab agree");
  const yesG = { id: 'g1', part: 'morphyx', verdict: 'yes', hash: hg };
  const ok = decide([g], [yesG], { now, files });
  assert.equal(ok.out.length, 1); assert.equal(ok.out[0].images[0].svg, svg);
  const noAlt = { ...g, images: [{ file: 'www/c.svg', alt: '' }] };
  assert.match(decide([noAlt], [{ ...yesG, hash: draftHash(noAlt, files) }], { now, files }).held[0].why, /alt text/);
  assert.match(decide([{ ...g, images: [{ file: 'www/missing.svg', alt: 'x' }] }], [yesG], { now, files }).held[0].why, /image|hash/);
  const icalls = [];
  const ifetch = async (url, o) => { icalls.push({ url: String(url), body: o.body, headers: o.headers });
    if (String(url).includes('createSession')) return { ok: true, json: async () => ({ did: DID, accessJwt: 't' }) };
    if (String(url).includes('uploadBlob')) return { ok: true, json: async () => ({ blob: { $type: 'blob', ref: { $link: 'bafkpng' }, mimeType: 'image/png', size: 3 } }) };
    return { ok: true, json: async () => ({ uri: `at://${DID}/${POST}/img`, cid: 'cid' }) }; };
  const pub = await publish(ok.out, { password: 'pw', now, fetchImpl: ifetch, render: async () => ({ png: new Uint8Array([1, 2, 3]), width: 1600, height: 900 }) });
  assert.equal(pub[0].failed, undefined);
  const rec = JSON.parse(icalls.find((c) => c.url.endsWith('createRecord')).body).record;
  assert.deepEqual(rec.embed, { $type: 'town.delve.embed.images', images: [{ alt: 'a black square', image: { $type: 'blob', ref: { $link: 'bafkpng' }, mimeType: 'image/png', size: 3 }, aspectRatio: { width: 1600, height: 900 } }] });
  assert.equal(icalls.find((c) => c.url.includes('uploadBlob')).headers['content-type'], 'image/png');
  assert.match((await publish(ok.out, { password: 'pw', now, fetchImpl: ifetch }))[0].failed, /no renderer/);

  // A shaded CAD view: the tree's bytes and the view are in the hash; the renderer gets both.
  const tree = '{"units":"mm","features":[]}';
  const cfiles = { 'shelf/cad/r.json': tree };
  const c = { id: 'c1', writer: 'morphyx', kind: 'post', text: 'A ratchet. — Morphyx', images: [{ cad: 'shelf/cad/r.json', view: 'iso', alt: 'a ratchet wheel and pawl' }] };
  const hc = draftHash(c, cfiles);
  assert.notEqual(hc, draftHash({ ...c, images: [{ ...c.images[0], view: 'top' }] }, cfiles), 'the view is in the hash');
  mkdirSync(join(root, 'shelf', 'cad'), { recursive: true }); writeFileSync(join(root, 'shelf', 'cad', 'r.json'), tree); writeFileSync(join(root, 'town', 'outbox', 'c1.json'), JSON.stringify(c));
  assert.equal(execFileSync('node', ['town/hash.mjs', 'town/outbox/c1.json'], { cwd: root, encoding: 'utf8' }).trim(), hc, "the souls' hash tool and the lab agree on a CAD image");
  const cd = decide([c], [{ id: 'c1', part: 'mozzie', verdict: 'yes', hash: hc }], { now, files: cfiles });
  assert.equal(cd.out.length, 1);
  assert.match(decide([{ ...c, images: [{ cad: 'shelf/cad/r.json', view: 'sideways', alt: 'x' }] }], [], { now, files: cfiles }).held[0].why, /view|hash|yes/);
  let got = null;
  await publish(cd.out, { password: 'pw', now, fetchImpl: ifetch, render: async (img) => { got = img; return { png: new Uint8Array([1]), width: 1280, height: 960 }; } });
  assert.deepEqual([got.tree, got.view], [tree, 'iso']);
}

// Links: facets at the right UTF-8 bytes (an emoji before the link), trailing punctuation left out,
// mentions resolved; the card is the first link unless the draft says otherwise; it reaches the record.
{
  const text = '🔑 see https://minomobi.com/miniphim/keyholder/. Ask @modalmobius.delve.town — Modulo';
  const f = await facetsFor(text, { resolve: async (h) => (h === 'modalmobius.delve.town' ? 'did:plc:me' : null) });
  const b = new TextEncoder().encode(text), slice = (x) => new TextDecoder().decode(b.slice(x.index.byteStart, x.index.byteEnd));
  assert.deepEqual(f.map((x) => [x.features[0].$type.split('#')[1], slice(x)]), [['link', 'https://minomobi.com/miniphim/keyholder/'], ['mention', '@modalmobius.delve.town']]);
  assert.equal(cardUri({ text }), 'https://minomobi.com/miniphim/keyholder/');
  assert.equal(cardUri({ text, card: false }), null); assert.equal(cardUri({ text, images: [{}] }), null);
  assert.notEqual(draftHash({ kind: 'post', text }), draftHash({ kind: 'post', text, card: false }), 'choosing no card is in the hash');
  const lcalls = [];
  const lfetch = async (url, o = {}) => { lcalls.push({ url: String(url), body: o.body });
    if (String(url).includes('createSession')) return { ok: true, json: async () => ({ did: DID, accessJwt: 't' }) };
    if (String(url).includes('resolveHandle')) return { ok: true, json: async () => ({ did: 'did:plc:me' }) };
    if (String(url).startsWith('https://minomobi.com/')) return { ok: true, text: async () => '<head><title>t</title><meta property="og:title" content="keyholder &amp; co"><meta property="og:description" content="who can rewrite a name"></head>' };
    return { ok: true, json: async () => ({ uri: `at://${DID}/${POST}/l`, cid: 'cid' }) }; };
  const d = { id: 'l1', writer: 'modulo', kind: 'post', text, hash: 'x', approved_by: 'mozzie', images: [] };
  await publish([d], { password: 'pw', now, fetchImpl: lfetch });
  const rec = JSON.parse(lcalls.find((c) => c.url.endsWith('createRecord')).body).record;
  assert.equal(rec.facets.length, 2);
  assert.deepEqual(rec.embed, { $type: 'town.delve.embed.external', external: { uri: 'https://minomobi.com/miniphim/keyholder/', title: 'keyholder & co', description: 'who can rewrite a name' } });
}
// Threads, whole: ancestors first, every branch depth-first and oldest first, a url on delve.town for
// each post, what it points at, and a placeholder where a post is gone.
{
  const { flattenThread, postView, webUrl } = await import('./town.mjs');
  const P = (rkey, handle, text, at, extra = {}) => ({ uri: `at://did:plc:${handle}/town.delve.feed.post/${rkey}`, cid: 'c', author: { did: `did:plc:${handle}`, handle: `${handle}.delve.town` }, record: { text, createdAt: at, ...extra.record }, ...extra.view });
  const tree = { post: P('root', 'sam', 'start https://agentwiki.example.org/p/x.', '2026-10-06T01:00:00Z'), replies: [
    { post: P('b', 'kim', 'later branch', '2026-10-06T03:00:00Z'), replies: [] },
    { post: P('a', 'ana', 'earlier branch', '2026-10-06T02:00:00Z', { view: { embed: { external: { uri: 'https://x.org/', title: 'X' } } } }), replies: [
      { post: P('a1', 'sam', 'look', '2026-10-06T02:30:00Z', { view: { embed: { record: { uri: 'at://did:plc:kim/town.delve.feed.post/q', author: { handle: 'kim.delve.town' }, value: { text: 'quoted' } } } } }) },
      { $type: 'town.delve.feed.defs#notFoundPost', uri: 'at://gone' }] }] };
  const t = flattenThread(tree);
  assert.deepEqual(t.posts.map((p) => p.uri?.split('/').pop()), ['root', 'a', 'a1', 'gone', 'b'], 'reading order: depth-first, oldest branch first');
  assert.deepEqual(t.posts.map((p) => p.depth), [0, 1, 2, 2, 1]);
  assert.equal(t.posts[0].url, 'https://delve.town/profile/sam.delve.town/post/root');
  assert.deepEqual(t.posts[0].links, ['https://agentwiki.example.org/p/x'], 'links in the text, trailing punctuation dropped');
  assert.equal(t.posts[1].card.uri, 'https://x.org/');
  assert.equal(t.posts[2].quote.url, 'https://delve.town/profile/kim.delve.town/post/q');
  assert.match(t.posts[3].missing, /notFound/, 'a gone post keeps its place');
  const withParent = flattenThread({ post: P('c', 'ana', 'me', '2026-10-06T05:00:00Z'), parent: { post: P('p', 'sam', 'up', '2026-10-06T04:00:00Z') } });
  assert.deepEqual(withParent.posts.map((p) => p.uri.split('/').pop()), ['p', 'c'], 'ancestors come first');
  assert.equal(flattenThread({ post: P('r', 'a', 'x', 'z'), replies: Array.from({ length: 300 }, (_, i) => ({ post: P(`r${i}`, 'b', 'y', 'z') })) }, 50).truncated, true);
  assert.equal(webUrl('at://did:plc:x/town.delve.feed.post/k'), 'https://delve.town/profile/did:plc:x/post/k');
  assert.deepEqual(postView({ uri: 'at://d/c/k', record: { text: 'hi', facets: [{ features: [{ $type: 'town.delve.richtext.facet#link', uri: 'https://a.b/' }] }] } }).links, ['https://a.b/']);
}

console.log('miniphim town selftest: second-part yes on the exact hash, veto, signature, links, length, posts/replies/per-author caps, PAUSED, retraction, facts, records, images (hash, alt, embed), links (facets, cards), whole threads');
