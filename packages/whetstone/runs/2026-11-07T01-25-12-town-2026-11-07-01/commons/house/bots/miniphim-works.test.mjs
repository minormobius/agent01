// node house/bots/miniphim-works.test.mjs  — exits 0 when the account's jobs behave. A fake town, no network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import account, * as B from './miniphim-works.mjs';
import { polytope, wire } from './lib/polytopes.mjs';
import { draw as drawDice } from './lib/dice-png.mjs';
const tick = B.bingo;
// no network in this test: the doors job's PDS reads go to a fake (section 9), and fail everywhere else
globalThis.fetch = async () => { throw new Error('no network in test'); };

// 1. The rule in the header, written again from the words alone, must agree with the module.
function verifier(seed) {
  const sha = (s) => createHash('sha256').update(s, 'utf8').digest();
  const stream = (label) => {
    let buf = Buffer.alloc(0), i = 0;
    const below = (n) => {
      const limit = Math.floor(2 ** 32 / n) * n;
      for (;;) {
        while (buf.length < 4) buf = Buffer.concat([buf, sha(`${seed}:${label}:${i++}`)]);
        const u = buf.readUInt32BE(0); buf = buf.subarray(4);
        if (u < limit) return u % n;
      }
    };
    return below;
  };
  const shuffle = (a, below) => { a = a.slice(); for (let i = a.length - 1; i >= 1; i--) { const j = below(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const r = (lo, n) => Array.from({ length: n }, (_, k) => lo + k);
  return {
    commit: sha(seed).toString('hex'),
    calls: shuffle(r(1, 75), stream('calls')),
    card: (did) => {
      const cols = r(0, 5).map((c) => shuffle(r(15 * c + 1, 15), stream(`${did}:${c}`)).slice(0, 5));
      const g = r(0, 5).map((row) => r(0, 5).map((c) => cols[c][row])); g[2][2] = 0; return g;
    },
  };
}
{
  const seed = 'ab'.repeat(32), v = verifier(seed);
  assert.equal(await B.commitment(seed), v.commit);
  const calls = await B.callOrder(seed);
  assert.deepEqual(calls, v.calls);
  assert.deepEqual([...calls].sort((a, b) => a - b), Array.from({ length: 75 }, (_, k) => k + 1));
  for (const did of ['did:plc:aaa', 'did:plc:bbb', 'did:plc:nhlcvrqwh7hwhvmgxbut6c2f']) {
    const g = await B.card(seed, did);
    assert.deepEqual(g, v.card(did));
    for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) {
      if (r === 2 && c === 2) { assert.equal(g[r][c], 0); continue; }
      assert.ok(g[r][c] >= 15 * c + 1 && g[r][c] <= 15 * c + 15, 'column range');
    }
    assert.equal(new Set(g.flat()).size, 25, 'no repeats on a card');
  }
  assert.notDeepEqual(await B.card(seed, 'did:plc:aaa'), await B.card(seed, 'did:plc:bbb'));
  assert.notDeepEqual(await B.callOrder(seed), await B.callOrder('cd'.repeat(32)));
}

// 2. Win lines: 12 of them; the free centre counts; four numbers on a row with a gap don't win.
{
  assert.equal(B.lines().length, 12);
  const g = [[1, 16, 31, 46, 61], [2, 17, 32, 47, 62], [3, 18, 0, 48, 63], [4, 19, 34, 49, 64], [5, 20, 35, 50, 65]];
  assert.ok(B.hasBingo(g, [3, 18, 48, 63]), 'middle row with the free centre');
  assert.ok(B.hasBingo(g, [1, 17, 49, 65]), 'diagonal with the free centre');
  assert.ok(B.hasBingo(g, [61, 62, 63, 64, 65]), 'a column');
  assert.ok(!B.hasBingo(g, [1, 16, 31, 46]), 'four of a row');
  assert.equal(B.completesAt(g, [70, 3, 18, 48, 2, 63]), 6);
  assert.equal(B.completesAt(g, [70, 3]), 0);
  assert.equal(B.ball(1), 'B 1'); assert.equal(B.ball(45), 'N 45'); assert.equal(B.ball(75), 'O 75');
  assert.match(B.cardText(g), /^B I N G O\n1 · 16 · 31 · 46 · 61\n/);
  assert.match(B.cardText(g), /3 · 18 · ★ · 48 · 63/);
}

// 3. A whole game in a fake town.
function town() {
  const posts = [], notes = [];
  let n = 0, failNext = 0, clock = 0;
  const agent = {
    did: 'did:plc:caller', handle: 'bingocaller.delve.town',
    async post(text, opts = {}) {
      if (failNext > 0) { failNext--; throw new Error('pds said no'); }
      assert.ok([...text].length <= 3000);
      const p = { uri: `at://did:plc:caller/town.delve.feed.post/${++n}`, cid: `c${n}`, text, reply: opts.reply };
      posts.push(p); return { uri: p.uri, cid: p.cid };
    },
    async read(nsid, params) {
      assert.equal(nsid, 'town.delve.notification.listNotifications');
      return { notifications: notes.slice(-params.limit).reverse() };
    },
    async repo() { throw new Error('the caller writes no records'); },
  };
  const say = (who, text, root, parent = root) => {
    const k = notes.length + 1;
    notes.push({ uri: `at://${who}/p/${k}`, cid: `n${k}`, reason: 'reply', indexedAt: new Date(clock + k).toISOString(),
      author: { did: who, handle: who.split(':')[2] + '.delve.town' },
      record: { text, reply: { root: { uri: root.uri }, parent: { uri: parent.uri } } } });
  };
  // a mention of the caller outside any game thread; `at` overrides the town's indexedAt
  const ask = (who, text = '@bingocaller bingo?', at) => {
    const k = notes.length + 1;
    notes.push({ uri: `at://${who}/p/${k}`, cid: `n${k}`, reason: 'mention', indexedAt: at || new Date(clock + k).toISOString(),
      author: { did: who, handle: who.split(':')[2] + '.delve.town' }, record: { text, createdAt: '2099-01-01T00:00:00Z' } });
  };
  return { agent, posts, notes, say, ask, fail: (k = 1) => { failNext = k; }, tick: (t) => { clock = t; } };
}
const H = 3600e3;
async function run(T, state, t) { T.tick(t); return tick({ agent: T.agent, now: new Date(t).toISOString(), state }); }
// a first tick that hears no ask and writes nothing, then an outside ask, then the game opens
async function start(T, t) {
  let s = await run(T, undefined, t);
  assert.equal(s.phase, 'idle'); assert.equal(T.posts.length, 0, 'no ask, no writes');
  T.ask('did:plc:asker');
  s = await run(T, s, t + 5 * 60e3);
  assert.equal(s.phase, 'open');
  return s;
}

{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await start(T, t);
  assert.equal(T.posts.length, 1);
  const root = T.posts[0];
  assert.ok(root.text.startsWith('@asker.delve.town asked for a game. Bingo, game 1.'), 'names who asked');
  assert.ok(root.text.includes(s.commit) && !root.text.includes(s.seed), 'commit public, seed private');
  assert.equal(s.commit, await B.commitment(s.seed));

  T.say('did:plc:ann', 'me please', root);
  T.say('did:plc:bob', 'deal me in', root);
  T.say('did:plc:ann', 'did it work?', root);                    // a second ask: no second card
  T.say('did:plc:zed', 'unrelated', { uri: 'at://elsewhere/1' });  // another thread: ignored
  T.say('did:plc:a3vq3hjlkz2nbf67bpv5z6qs', 'deal us in', root);  // the house: no card
  s = await run(T, s, t += H);
  assert.equal(T.posts.length, 3, 'two cards');
  assert.deepEqual(Object.keys(s.players).sort(), ['did:plc:ann', 'did:plc:bob']);
  const annCard = T.posts.find((p) => p.text.includes('@ann.delve.town'));
  assert.ok(annCard.text.includes(B.cardText(await B.card(s.seed, 'did:plc:ann'))));
  assert.equal(annCard.reply.root.uri, root.uri);

  // a failed card post: nothing marked, so the next tick deals it
  T.say('did:plc:cat', 'me too', root);
  T.fail();
  s = await run(T, s, t += H);
  assert.ok(s.lastError && !s.players['did:plc:cat']);
  s = await run(T, s, t += H);
  assert.ok(s.players['did:plc:cat']); assert.equal(s.lastError, null);
  assert.equal(s.phase, 'open', 'three hours in: still dealing');
  s = await run(T, s, t += H);
  assert.equal(s.phase, 'calling', 'dealing closed after OPEN_TICKS hours, first ball out');
  assert.equal(s.called, 1);
  const seed = s.seed, order = s.order;

  // a late joiner gets one note, not a card
  T.say('did:plc:dan', 'can I play', root);
  T.say('did:plc:dan', 'hello?', root);
  const before = T.posts.length;
  s = await run(T, s, t += H);
  assert.equal(T.posts.length - before, 2, 'one note to dan + one call');
  assert.ok(!s.players['did:plc:dan']);

  // a failed call post: the ball is not counted, and is called again next tick
  const c = s.called; T.fail();
  s = await run(T, s, t += H); assert.equal(s.called, c);
  s = await run(T, s, t += H); assert.equal(s.called, c + 1);
  assert.ok(T.posts.at(-1).text.startsWith(`Game 1, call ${c + 1}: ${B.ball(order[c])}`));
  assert.ok(T.posts.at(-1).text.includes(`In the order drawn: ${order.slice(0, c + 1).join(' ')}\n`), 'call post keeps draw order');

  // a false shout from bob is ignored; a non-player's shout is ignored
  const cards = {};
  for (const d of ['did:plc:ann', 'did:plc:bob', 'did:plc:cat']) cards[d] = await B.card(seed, d);
  T.say('did:plc:dan', 'BINGO', root);
  if (!B.hasBingo(cards['did:plc:bob'], order.slice(0, s.called))) {
    T.say('did:plc:bob', 'bingo!', root);
    s = await run(T, s, t += H);
    assert.equal(s.phase, 'calling');
  }

  // play on until some card completes; its owner shouts at once (the shout path, every run)
  let winner = null;
  while (!winner) {
    s = await run(T, s, t += H);
    assert.equal(s.phase, 'calling');
    winner = Object.keys(cards).find((d) => B.hasBingo(cards[d], order.slice(0, s.called)));
  }
  T.say(winner, 'Bingo!', root, T.posts.at(-1));
  T.fail();                                                         // the reveal fails once...
  s = await run(T, s, t += H);
  assert.equal(s.phase, 'reveal'); assert.ok(s.seed);
  s = await run(T, s, t += H);                                      // ...and goes out next tick
  assert.ok(T.posts.at(-1).text.startsWith(`Bingo! Game 1 goes to @${winner.split(':')[2]}.delve.town`));
  assert.ok(T.posts.at(-1).text.includes('shouted, and the card checks out'));
  assert.equal(s.phase, 'idle');
  const reveal = T.posts.at(-1).text;
  assert.ok(reveal.includes(seed), 'seed revealed');
  assert.equal(s.seed, null, 'seed dropped from state after the reveal');
  assert.equal(s.history.at(-1).seed, seed);

  // every call that went out matches the published rule
  const v = verifier(seed);
  const calls = T.posts.map((p) => p.text.match(/^Game 1, call (\d+): [BINGO] (\d+)/)).filter(Boolean);
  calls.forEach((m, k) => { assert.equal(+m[1], k + 1); assert.equal(+m[2], v.calls[k]); });

  // the ask that opened game 1 and the shouts in its thread don't open game 2; nor does the clock
  const n = T.posts.length;
  for (let k = 0; k < 24; k++) s = await run(T, s, t += H);
  assert.equal(T.posts.length, n, 'a day idle with no new ask: no writes');
  assert.equal(s.phase, 'idle');
  // asks that don't count: the house, the caller itself, no keyword, and one the town indexed before
  // the game ended (its author's createdAt says 2099, which must not matter)
  T.ask('did:plc:a3vq3hjlkz2nbf67bpv5z6qs', 'bingo please');
  T.ask('did:plc:caller', 'bingo');
  T.ask('did:plc:eve', 'hello there');
  T.ask('did:plc:old', 'bingo', new Date(Date.parse('2026-10-08T00:00:00Z')).toISOString());
  s = await run(T, s, t += H);
  assert.equal(T.posts.length, n, 'none of those opens a game');
  // a real ask: game 2 opens, with a new commitment
  T.ask('did:plc:eve', 'another game?');
  s = await run(T, s, t += H);
  assert.equal(s.phase, 'open'); assert.equal(s.game, 2); assert.notEqual(s.commit, (await B.commitment(seed)));
  assert.ok(T.posts.at(-1).text.startsWith('@eve.delve.town asked for a game.'));
}

// 4. Nobody shouts: the caller calls it after GRACE calls, naming the earliest card(s).
{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await start(T, t);
  T.say('did:plc:sleepy', 'card please', T.posts[0]);
  for (let k = 0; k < 80 && s.phase !== 'idle'; k++) s = await run(T, s, t += H);
  assert.equal(s.phase, 'idle');
  const g = await B.card(s.history[0].seed, 'did:plc:sleepy');
  const at = B.completesAt(g, await B.callOrder(s.history[0].seed));
  assert.equal(s.history[0].calls, at + B.GRACE);
  assert.match(T.posts.at(-1).text, /goes to @sleepy\.delve\.town.*Nobody shouted/s);
}

// 5. Nobody joins: the seed still comes out, no balls drawn.
{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await start(T, t);
  for (let k = 0; k < B.OPEN_TICKS; k++) s = await run(T, s, t += H);
  assert.equal(s.phase, 'idle'); assert.equal(T.posts.length, 2);
  assert.match(T.posts[1].text, /no winner\. Nobody joined/);
  assert.ok(T.posts[1].text.includes(s.history[0].seed));
}

// 6. State stays small: 40 players, a full game.
{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await start(T, t);
  for (let i = 0; i < 40; i++) T.say(`did:plc:p${i}`, 'in', T.posts[0]);
  for (let k = 0; k < 90 && s.phase !== 'idle'; k++) { s = await run(T, s, t += H); assert.ok(JSON.stringify(s).length < 100_000); }
  assert.equal(s.phase, 'idle');
}

// 7. The frame: each job keeps its own slice of state; a job that throws keeps its old slice and the
//    others still run.
{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await account({ agent: T.agent, now: new Date(t).toISOString(), state: undefined });
  T.tick(t); T.ask('did:plc:asker');
  s = await account({ agent: T.agent, now: new Date(t += H).toISOString(), state: s });
  assert.deepEqual(Object.keys(s.jobs), Object.keys(B.JOBS));
  assert.equal(s.jobs.bingo.phase, 'open');
  const before = structuredClone(s.jobs.bingo);
  const saved = B.JOBS.boom;
  B.JOBS.boom = async () => { throw new Error('boom'); };
  s = await account({ agent: T.agent, now: new Date(t += H).toISOString(), state: s });
  assert.equal(s.jobs.boom.lastError, 'boom');
  assert.equal(s.jobs.bingo.seed, before.seed, 'bingo ran on, same game');
  delete B.JOBS.boom; if (saved) B.JOBS.boom = saved;
}
// 8. The live state as code c7c02dc left it (idle after game 3, no askSince): the first tick on this
//    code writes nothing, even with an old ask in the notifications.
{
  const T = town();
  let t = Date.parse('2026-10-10T00:00:00Z');
  T.ask('did:plc:old', 'bingo', '2026-10-09T06:00:00.000Z');
  let s = await run(T, { phase: 'idle', game: 3, restUntil: t - H, history: [{ game: 3 }] }, t);
  assert.equal(T.posts.length, 0); assert.equal(s.askSince, new Date(t).toISOString());
  T.ask('did:plc:new');
  s = await run(T, s, t += H);
  assert.equal(s.game, 4); assert.equal(T.posts.length, 1);
}
// 9. doors: the unanswered-first-posts list. A fake PDS and AppView.
{
  const H = 3600_000, t0 = Date.parse('2026-10-10T12:00:00Z');
  const iso = (x) => new Date(x).toISOString();
  const BOT = 'did:plc:bot';
  // creation order on the PDS: old, liar, replier, quiet, answered, selfonly, fresh, empty
  const firsts = {
    'did:plc:old': { at: iso(t0 - 9 * 24 * H) },
    'did:plc:liar': { at: '2099-01-01T00:00:00Z' },
    'did:plc:replier': { at: iso(t0 - 20 * H), reply: true },
    'did:plc:quiet': { at: iso(t0 - 30 * H) },
    'did:plc:answered': { at: iso(t0 - 10 * H) },
    'did:plc:selfonly': { at: iso(t0 - 8 * H) },
    'did:plc:fresh': { at: iso(t0 - 2 * H) },
    'did:plc:empty': null,
  };
  const replies = { 'did:plc:answered': ['did:plc:helper'], 'did:plc:selfonly': ['did:plc:selfonly'] };
  const uri = (d) => `at://${d}/town.delve.feed.post/first`;
  let reads = 0, threads = 0;
  globalThis.fetch = async (url) => {
    reads++;
    const u = new URL(url);
    const ok = (j) => ({ ok: true, json: async () => j });
    if (u.pathname.endsWith('sync.listRepos')) return ok({ repos: [...Object.keys(firsts), BOT].map((did) => ({ did, active: true })).concat([{ did: 'did:plc:gone', active: false }]) });
    if (u.pathname.endsWith('repo.listRecords')) {
      assert.equal(u.searchParams.get('reverse'), 'true'); assert.equal(u.searchParams.get('limit'), '1');
      const did = u.searchParams.get('repo'), f = firsts[did];
      assert.ok(did !== BOT && did !== 'did:plc:gone', 'only active accounts, not the bot');
      if (!f) return ok({ records: [] });
      return ok({ records: [{ uri: uri(did), cid: 'bafy' + did.slice(-1), value: { createdAt: f.at, ...(f.reply ? { reply: { root: { uri: 'x' } } } : {}) } }] });
    }
    throw new Error('unexpected ' + url);
  };
  const puts = [];
  const agent = {
    did: BOT, handle: 'bot.delve.town',
    read: async (nsid, p) => {
      assert.equal(nsid, 'town.delve.feed.getPostThread'); threads++;
      const did = p.uri.split('/')[2];
      return { thread: { post: { uri: p.uri, author: { did, handle: did.slice(8) + '.delve.town' } },
        replies: (replies[did] || []).map((a) => ({ post: { author: { did: a } } })) } };
    },
    repo: async (op, a) => { puts.push({ op, ...a }); return {}; },
    post: async () => { throw new Error('doors never posts'); },
  };
  let s = await B.doors({ agent, now: iso(t0), state: undefined });
  assert.equal(s.lastError, null);
  assert.equal(puts.length, 1); assert.equal(puts[0].op, 'putRecord');
  assert.equal(puts[0].collection, 'com.minomobi.mission.result'); assert.equal(puts[0].rkey, B.DOORS_RKEY);
  const rows = puts[0].record.rows;
  // quiet is listed; selfonly too (only its author replied); answered, replier, old, fresh (2 h), empty are not;
  // liar's post is dated 2099, so it counts from when we saw it (now): too young.
  assert.deepEqual(rows.map((r) => r.did), ['did:plc:selfonly', 'did:plc:quiet'], 'newest first');
  assert.equal(rows[1].uri, uri('did:plc:quiet'));
  assert.equal(rows[1].handle, 'quiet.delve.town'); assert.equal(rows[1].cidLast, 't');
  assert.equal(puts[0].record.accounts, 8); assert.equal(puts[0].record.notYetRead, 0);
  // finished accounts are done-marks only (10-14): gone from known, their short key in s.done
  for (const d of ['did:plc:answered', 'did:plc:old', 'did:plc:replier']) {
    assert.ok(!(d in s.known), d + ' left known'); assert.ok(s.done.split(' ').includes(B.doneKey(d)), d + ' marked done');
  }
  assert.ok(!s.done.split(' ').includes(B.doneKey('did:plc:quiet')), 'a listed post is not done');
  // nothing changed an hour later: no write; the account list is reread (it isn't kept, 10-14), nothing else
  reads = 0;
  s = await B.doors({ agent, now: iso(t0 + H), state: s });
  assert.equal(puts.length, 1, 'no change, no write'); assert.equal(reads, 1, 'only the account list when nothing is due');
  assert.ok(!('order' in s), 'the account list is not kept in state');
  // someone answers quiet; fresh turns 6 h old: one write, quiet out, fresh in
  replies['did:plc:quiet'] = ['did:plc:helper'];
  s = await B.doors({ agent, now: iso(t0 + 4 * H + 1), state: s });
  assert.equal(puts.length, 2);
  assert.deepEqual(puts[1].record.rows.map((r) => r.did), ['did:plc:fresh', 'did:plc:selfonly']);
  // the liar is listed 6 h after we first saw it, never before
  s = await B.doors({ agent, now: iso(t0 + 6 * H + 1), state: s });
  assert.deepEqual(puts.at(-1).record.rows.map((r) => r.did)[0], 'did:plc:liar');
  // past 7 days a post leaves the list unanswered
  s = await B.doors({ agent, now: iso(t0 + 8 * 24 * H), state: s });
  assert.deepEqual(puts.at(-1).record.rows, []);
  // caps: with many new accounts, one tick reads at most LOOKUPS first posts and THREADS threads
  for (let i = 0; i < 40; i++) firsts['did:plc:n' + i] = { at: iso(t0 + 8 * 24 * H - 10 * H) };
  reads = 0; threads = 0;
  s = await B.doors({ agent, now: iso(t0 + 8 * 24 * H + 7 * H), state: s });
  assert.equal(reads, 1 + B.LOOKUPS); assert.ok(threads <= B.THREADS);
  assert.equal(puts.at(-1).record.notYetRead, 40 - B.LOOKUPS);
  assert.ok(s.known['did:plc:n39'] && !('did:plc:n0' in s.known), 'newest accounts first');
  // a PDS failure: no throw, what was learned is kept, error recorded
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
  const before = Object.keys(s.known).length;
  s = await B.doors({ agent, now: iso(t0 + 8 * 24 * H + 8 * H), state: s });
  assert.match(s.lastError, /502/); assert.equal(Object.keys(s.known).length, before);
  globalThis.fetch = async () => { throw new Error('no network in test'); };
  // state stays small: 400 accounts' worth is well under the 100 KB state cap
  assert.ok(JSON.stringify(s).length < 20_000);
  assert.ok(s.done.split(' ').includes(B.doneKey('did:plc:answered')), 'a failed tick keeps the done-marks');
}
// 9b. doors done-marks (Morphyx, 10-14): old state converts, done accounts are never re-read, and the
// state for 2,000 real-shaped accounts fits with room. The 10-char key: 50 bits of a did:plc id.
{
  const H = 3600_000, t0 = Date.parse('2026-10-14T12:00:00Z'), iso = (x) => new Date(x).toISOString();
  const A = 'abcdefghijklmnopqrstuvwxyz234567';
  let x = 7; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const plc = () => 'did:plc:' + Array.from({ length: 24 }, () => A[Math.floor(rnd() * 32)]).join('');
  assert.equal(B.doneKey('did:plc:abcdefghijklmnopqrstuvwx'), 'abcdefghij');
  assert.equal(B.doneKey('did:web:example.com'), 'did:web:example.com', 'other DID methods kept whole');
  assert.notEqual(B.doneKey('did:plc:aaaaaaaaaaxxxxxxxxxxxxxx'), B.doneKey('did:plc:aaaaaaaaabxxxxxxxxxxxxxx'), 'the 10th character counts');
  const dids = Array.from({ length: 2000 }, plc);
  let reads = 0;
  globalThis.fetch = async (url) => {
    reads++; const u = new URL(url), ok = (j) => ({ ok: true, json: async () => j });
    if (u.pathname.endsWith('sync.listRepos')) return ok({ repos: dids.map((did) => ({ did, active: true })) });
    if (u.pathname.endsWith('repo.listRecords')) return ok({ records: [] });
    throw new Error('unexpected ' + url);
  };
  const agent = { did: 'did:plc:bot', read: async () => { throw new Error('no threads due'); }, repo: async () => ({}), post: async () => { throw new Error('never'); } };
  // the old form, as the live state holds it: every account but the last 5 marked known[did] = 0
  const old = { known: Object.fromEntries(dids.slice(0, 1995).map((d) => [d, 0])), order: [...dids].reverse(), reposAt: t0, wrote: '' };
  const oldBytes = JSON.stringify(old).length;
  let s = await B.doors({ agent, now: iso(t0 + H), state: old });
  assert.equal(s.lastError, null);
  assert.equal(Object.keys(s.known).length, 5, 'only the 5 unread accounts are in known (as no-post-yet)');
  assert.equal(new Set(s.done.split(' ')).size, 1995, 'no collisions among 1,995 keys');
  assert.equal(reads, 1 + 5, 'the list, then the 5 unseen; done accounts are not re-read');
  assert.ok(!('order' in s) && !('reposAt' in s), 'old list fields dropped');
  const newBytes = JSON.stringify(s).length;
  assert.ok(newBytes < 30_000, '2,000 accounts fit in 30 KB: ' + newBytes);
  assert.ok(newBytes < oldBytes / 4, 'a quarter of the old form or less: ' + newBytes + ' vs ' + oldBytes);
  console.log('doors state, 2,000 accounts: old form ' + oldBytes + ' B, new ' + newBytes + ' B');
  // a second tick: idempotent, only the list re-read
  reads = 0; const again = await B.doors({ agent, now: iso(t0 + 2 * H), state: s });
  assert.equal(reads, 1); assert.equal(again.done, s.done);
  globalThis.fetch = async () => { throw new Error('no network in test'); };
}
// 10. Dice (Modulo, 10-11). The rule from its words; the hash before any roll; one reply per ask; the reveal.
{
  const sha = (x) => createHash('sha256').update(x, 'utf8').digest();
  const verify = (seed, cid, n, m) => {           // stream(seed, cid) and below(), written again from the header
    let buf = Buffer.alloc(0), i = 0; const out = [];
    const ms = Array.isArray(m) ? m : Array(n).fill(m);   // (Modulo, 10-11) a list: one die's sides each, in order
    for (let k = 0; k < ms.length; k++) {
      const m = ms[k], limit = Math.floor(2 ** 32 / m) * m;
      for (;;) {
        while (buf.length < 4) buf = Buffer.concat([buf, sha(`${seed}:${cid}:${i++}`)]);
        const u = buf.readUInt32BE(0); buf = buf.subarray(4);
        if (u < limit) { out.push(1 + (u % m)); break; }
      }
    }
    return out;
  };
  assert.deepEqual(await B.rollFaces('ab'.repeat(32), 'bafyX', 7, 20), verify('ab'.repeat(32), 'bafyX', 7, 20));
  assert.deepEqual(await B.rollFaces('ab'.repeat(32), 'bafyY', 10, 6), verify('ab'.repeat(32), 'bafyY', 10, 6));
  // a fair spread: 6000 d6 from one seed, every face within 4 sigma of 1000
  { const f = await B.rollFaces('cd'.repeat(32), 'bafyZ', 6000, 6), c = [0, 0, 0, 0, 0, 0]; for (const v of f) c[v - 1]++;
    for (const x of c) assert.ok(Math.abs(x - 1000) < 4 * Math.sqrt(6000 * (1 / 6) * (5 / 6)), 'd6 spread ' + c); }
  const T = (n, sides, sign = 1) => ({ n, sides, sign });
  assert.deepEqual(B.parseRoll('@miniphim-works.delve.town roll 2d6+3'), { n: 2, sides: 6, mod: 3, spec: '2d6+3', terms: [T(2, 6)] });
  assert.deepEqual(B.parseRoll('roll a d20 for initiative'), { n: 1, sides: 20, mod: 0, spec: '1d20', terms: [T(1, 20)] });
  assert.deepEqual(B.parseRoll('Roll 3d8 - 2'), { n: 3, sides: 8, mod: -2, spec: '3d8-2', terms: [T(3, 8)] });
  // (Modulo, 10-11) mixed sets, the person's ask: rolled whole, in the order written
  assert.deepEqual(B.parseRoll('roll 1d6+2d20'), { n: 3, sides: null, mod: 0, spec: '1d6+2d20', terms: [T(1, 6), T(2, 20)] });
  assert.deepEqual(B.parseRoll('Roll 3d20+2d6'), { n: 5, sides: null, mod: 0, spec: '3d20+2d6', terms: [T(3, 20), T(2, 6)] });
  assert.deepEqual(B.parseRoll('roll d20 - d4 + 2'), { n: 2, sides: null, mod: 2, spec: '1d20-1d4+2', terms: [T(1, 20), T(1, 4, -1)] });
  assert.equal(B.parseRoll('roll 2d6 + 3 + d8 - 1 for the axe').spec, '2d6+1d8+2');
  assert.deepEqual(B.parseRoll('roll d20+d7'), { bad: true, die: 'd7' }, 'a die we lack is named, never half-rolled');
  assert.equal(B.parseRoll('roll 6d6+5d6'), null, 'over 10 dice in all');
  assert.equal(B.parseRoll('roll 2d6+3 for damage').spec, '2d6+3', 'a number modifier is still a modifier');
  assert.equal(B.parseRoll('roll 2d6 + 3 damage').spec, '2d6+3');
  // one kind draws exactly as before; a set draws each die from the same stream in turn
  assert.deepEqual(await B.rollSet('ab'.repeat(32), 'bafyX', Array(7).fill(20)), verify('ab'.repeat(32), 'bafyX', 7, 20));
  for (const k of ['m1', 'm2', 'm3', 'm4']) assert.deepEqual(await B.rollSet('ab'.repeat(32), k, [6, 20, 20, 4, 12, 4]), verify('ab'.repeat(32), k, 0, [6, 20, 20, 4, 12, 4]));
  assert.equal(B.sumLine([T(1, 6), T(2, 20)], [4, 17, 9], 0).line, '4 + 17 + 9 = 30');
  assert.equal(B.sumLine([T(1, 20), T(1, 4, -1)], [14, 3], 2).line, '14 - 3 + 2 = 13');
  assert.equal(B.sumLine([T(1, 20)], [14], 0).line, '14');
  assert.equal(B.altTextSet([T(1, 6), T(2, 20)], [4, 17, 9]), 'A d6 showing 4; two d20s showing 17, 9.');
  assert.equal(B.parseRoll('d20'), null, 'needs the word roll');
  assert.equal(B.parseRoll('roll d7'), null); assert.equal(B.parseRoll('roll 11d6'), null); assert.equal(B.parseRoll('roll 0d6'), null);
  // 4-D dice (Modulo, 10-29): the person's "yes please build the 4d dice roller"
  assert.deepEqual(B.parseRoll('roll d600'), { n: 1, sides: 600, mod: 0, spec: '1d600', terms: [T(1, 600)] });
  assert.equal(B.parseRoll('roll 2d120 + d5 - 1').spec, '2d120+1d5-1');
  assert.equal(B.parseRoll('Roll d16+d24').spec, '1d16+1d24');
  assert.equal(B.parseRoll('roll d12').sides, 12, 'd12 is still a d12, not the start of d120');
  assert.equal(B.parseRoll('roll d1200'), null); assert.equal(B.parseRoll('roll d60'), null);
  assert.deepEqual(B.parseRoll('roll d600+d7'), { bad: true, die: 'd7' });
  {
    const seen = new Set(); let lo = Infinity, hi = 0;
    for (let k = 0; k < 400; k++) for (const f of await B.rollSet('ab'.repeat(32), 'bafy' + k, [600, 5])) { lo = Math.min(lo, f); hi = Math.max(hi, f); seen.add(f); }
    assert.ok(lo >= 1 && hi <= 600 && seen.size > 250, 'd600 faces in 1..600 (400 draws: about 292 distinct expected): ' + lo + '..' + hi);
  }
  // the solids: vertices, edges, cells as the books have them; labels 1..n; opposite cells sum to n + 1
  for (const [s, v, e] of [[5, 5, 10], [8, 16, 32], [16, 8, 24], [24, 24, 96], [120, 600, 1200], [600, 120, 720]]) {
    const P = polytope(s);
    assert.deepEqual([P.V.length, P.E.length, P.C.length], [v, e, s], 'd' + s);
    assert.deepEqual([...P.label].sort((a, b) => a - b), Array.from({ length: s }, (_, i) => i + 1), 'd' + s + ' labels');
    if (s !== 5) P.C.forEach((c, i) => { const o = P.C.findIndex((d) => d.every((x, k) => Math.abs(x + c[k]) < 1e-6)); assert.equal(P.label[i] + P.label[o], s + 1, 'd' + s + ' opposite'); });
    for (let f = 1; f <= s; f++) assert.ok(wire(s, f).lit.length >= 6, 'd' + s + ' face ' + f + ' lights a cell');
  }
  {
    const img = drawDice([{ sides: 600, value: 600 }, { sides: 5, value: 1 }, { sides: 20, value: 7 }]);
    assert.equal(img.width, 660); assert.ok(img.rgb.some((x) => x > 200), '4-D dice are drawn');
  }

  const BOT = 'did:plc:dicebot', H = 3600_000, t0 = Date.parse('2026-10-12T00:00:00Z'), iso = (x) => new Date(x).toISOString();
  let notes = [], posts = [], blobs = 0, records = {}, puts = 0;
  const agent = {
    did: BOT, handle: 'miniphim-works.delve.town',
    async post(text, opts = {}) { const p = { uri: `at://${BOT}/town.delve.feed.post/p${posts.length}`, cid: `cidp${posts.length}`, text, ...opts }; posts.push(p); return p; },
    async read(nsid) { assert.equal(nsid, 'town.delve.notification.listNotifications'); return { notifications: notes }; },
    async repo(op, a) {
      if (op === 'uploadBlob') { assert.equal(a.type, 'image/png'); assert.deepEqual([...a.bytes.subarray(0, 4)], [137, 80, 78, 71]); blobs++; return { blob: { $type: 'blob', ref: { $link: 'b' + blobs }, mimeType: 'image/png', size: a.bytes.length } }; }
      if (op === 'putRecord') { assert.equal(a.collection, 'com.minomobi.dice.session'); puts++; records[a.rkey] = structuredClone(a.record); return {}; }
      if (op === 'getRecord') { if (!records[a.rkey]) throw new Error('RecordNotFound'); return { value: structuredClone(records[a.rkey]) }; }
      throw new Error('dice writes nothing else: ' + op);
    },
  };
  const ask = (id, text, at, did = 'did:plc:player', reason = 'mention') => ({ uri: `at://${did}/town.delve.feed.post/${id}`, cid: 'cid' + id, reason, indexedAt: iso(at), author: { did, handle: 'player.delve.town' }, record: { text, createdAt: iso(at) } });
  // an ask that came before any hash: the first tick posts the hash and does NOT roll for it
  notes = [ask('early', 'roll d20', t0 - 60_000)];
  let s = await B.dice({ agent, now: iso(t0), state: undefined });
  assert.equal(s.lastError, null);
  assert.equal(posts.length, 1, 'only the session post'); assert.equal(blobs, 0);
  assert.equal(posts[0].reply, undefined);
  assert.equal(sha(s.session.seed).toString('hex'), s.session.commit);
  assert.ok(posts[0].text.includes(s.session.commit));
  assert.equal(records['1'].commit, s.session.commit); assert.equal(records['1'].seed, null, 'the seed is never public early');
  assert.ok(!JSON.stringify(records).includes(s.session.seed) && !posts.some((p) => p.text.includes(s.session.seed)));
  // asks after the hash: rolled, with a picture, once each; self, non-asks and replies without "roll" ignored
  notes = [ask('a', 'roll 2d6+3', t0 + 60_000), ask('b', '@miniphim-works.delve.town roll d20 please', t0 + 120_000, 'did:plc:p2', 'reply'),
    ask('self', 'roll d20', t0 + 60_000, BOT), ask('chat', 'nice dice', t0 + 60_000), ask('like', 'roll d20', t0 + 60_000, 'did:plc:x', 'like'), ...notes];
  notes[1].record.reply = { root: { uri: 'at://root/x/1', cid: 'cidroot' }, parent: { uri: 'at://p', cid: 'c' } };
  s = await B.dice({ agent, now: iso(t0 + 5 * 60_000), state: s });
  assert.equal(s.lastError, null);
  assert.equal(posts.length, 3); assert.equal(blobs, 2);
  const fa = verify(s.session.seed, 'cida', 2, 6), fb = verify(s.session.seed, 'cidb', 1, 20);
  assert.ok(posts[1].text.startsWith(`2d6+3: ${fa[0]} + ${fa[1]} + 3 = ${fa[0] + fa[1] + 3}\n`), posts[1].text);
  assert.ok(posts[2].text.startsWith(`1d20: ${fb[0]}\n`));
  assert.equal(posts[1].reply.parent.uri, notes[0].uri); assert.equal(posts[1].reply.root.uri, notes[0].uri, 'a top-level ask is its own root');
  assert.equal(posts[2].reply.root.uri, 'at://root/x/1', 'a reply keeps its thread');
  assert.equal(posts[1].embed.$type, 'town.delve.embed.images');
  assert.equal(posts[1].embed.images[0].alt, `Two d6s showing ${fa.join(', ')}.`);
  assert.equal(posts[2].embed.images[0].alt, `A d20 showing ${fb[0]}.`);
  assert.ok(posts[1].text.includes('https://miniphim.minomobi.com/dice/?s=1&p=a'));
  assert.deepEqual(records['1'].rolls.map((r) => [r.cid, r.spec, r.faces]), [['cida', '2d6+3', fa], ['cidb', '1d20', fb]]);
  // the next tick: nothing new, nothing written
  const before = [posts.length, blobs, puts];
  s = await B.dice({ agent, now: iso(t0 + 10 * 60_000), state: s });
  assert.deepEqual([posts.length, blobs, puts], before, 'no ask, no writes');
  // (Modulo, 10-11) a mixed ask is rolled whole, one picture with every die, every face checkable
  { notes = [ask('mix', 'Roll 1d6+2d20-1', t0 + 10 * 60_000 + 1), ...notes];
    const n0 = posts.length, b0 = blobs;
    s = await B.dice({ agent, now: iso(t0 + 10 * 60_000 + 30_000), state: s });
    assert.equal(s.lastError, null);
    const p = posts.slice(n0).find((q) => q.reply && q.reply.parent.uri === notes[0].uri);
    const all = verify(s.session.seed, 'cidmix', 0, [6, 20, 20]);   // the rule written again, not the bot's code
    const raw = all;
    assert.ok(p && p.text.startsWith(`1d6+2d20-1: ${all[0]} + ${all[1]} + ${all[2]} - 1 = ${all[0] + all[1] + all[2] - 1}\n`), p && p.text);
    assert.ok(all[0] >= 1 && all[0] <= 6 && all[1] <= 20 && all[2] <= 20 && raw.length === 3);
    assert.equal(p.embed.images[0].alt, `A d6 showing ${all[0]}; two d20s showing ${all[1]}, ${all[2]}.`);
    assert.equal(blobs, b0 + 1);
    const rec = records['1'].rolls.at(-1);
    assert.deepEqual([rec.spec, rec.faces, rec.total], ['1d6+2d20-1', all, all[0] + all[1] + all[2] - 1]);
    assert.equal(s.session.rolls, 3); }
  // a die we lack: one reply that says so, no picture, nothing recorded
  { notes = [ask('d7', 'roll d20+d7', t0 + 10 * 60_000 + 2), ...notes];
    const n0 = posts.length, rolls0 = records['1'].rolls.length;
    s = await B.dice({ agent, now: iso(t0 + 10 * 60_000 + 40_000), state: s });
    const p = posts.slice(n0).find((q) => q.reply && q.reply.parent.uri === notes[0].uri);
    assert.ok(p && p.text.startsWith('d7: not rolled.') && !p.embed, p && p.text);
    assert.equal(records['1'].rolls.length, rolls0);
    const n1 = posts.length; s = await B.dice({ agent, now: iso(t0 + 10 * 60_000 + 50_000), state: s });
    assert.equal(posts.length, n1, 'answered once'); }
  // the longest reply fits in a post (the town allows 3000 graphemes)
  const r10 = { ...ask('big', 'roll 10d20+100', t0 + 11 * 60_000) };
  notes = [r10, ...notes];
  s = await B.dice({ agent, now: iso(t0 + 15 * 60_000), state: s });
  assert.ok([...new Intl.Segmenter().segment(posts.at(-1).text)].length <= 3000, 'reply length ' + posts.at(-1).text.length);
  assert.ok([...new Intl.Segmenter().segment(posts[0].text)].length <= 3000, 'session post length ' + posts[0].text.length);
  // a flood: at most MAX_ROLLS answered a tick, the rest on the next
  notes = Array.from({ length: B.MAX_ROLLS + 3 }, (_, i) => ask('f' + i, 'roll d4', t0 + 20 * 60_000 + i)).concat(notes);
  let n0 = posts.length;
  s = await B.dice({ agent, now: iso(t0 + 25 * 60_000), state: s });
  assert.equal(posts.length - n0, B.MAX_ROLLS);
  s = await B.dice({ agent, now: iso(t0 + 30 * 60_000), state: s });
  assert.equal(posts.length - n0, B.MAX_ROLLS + 3);
  // a day after the first roll: the seed comes out, it hashes to the commitment, and session 2 opens with a new hash
  const old = s.session; n0 = posts.length;
  s = await B.dice({ agent, now: iso(t0 + 5 * 60_000 + 24 * H), state: s });
  assert.equal(s.lastError, null);
  assert.equal(posts.length - n0, 2);
  assert.ok(posts[n0].text.includes(old.seed)); assert.equal(posts[n0].reply.root.uri, old.root.uri);
  assert.equal(records['1'].seed, old.seed); assert.equal(sha(records['1'].seed).toString('hex'), records['1'].commit);
  assert.equal(records['1'].rolls.length, 2 + 1 + 1 + B.MAX_ROLLS + 3);   // +1: the mixed set
  assert.equal(s.session.n, 2); assert.notEqual(s.session.seed, old.seed); assert.ok(posts[n0 + 1].text.includes(s.session.commit));
  // an idle session never reveals (nobody rolled, nothing to check, no post)
  n0 = posts.length;
  s = await B.dice({ agent, now: iso(t0 + 80 * H), state: s });
  assert.equal(posts.length, n0);
  // a failed post: error kept, the ask is marked so it isn't answered twice, the session survives
  notes = [ask('boom', 'roll d12', t0 + 81 * H)];
  const realPost = agent.post; agent.post = async () => { throw new Error('502'); };
  s = await B.dice({ agent, now: iso(t0 + 81 * H + 60_000), state: s });
  agent.post = realPost;
  assert.match(s.lastError, /502/); assert.equal(s.session.n, 2);
  n0 = posts.length;
  s = await B.dice({ agent, now: iso(t0 + 81 * H + 6 * 60_000), state: s });
  assert.equal(posts.length, n0, 'not retried');
  assert.ok(JSON.stringify(s).length < 8_000, 'small state');

  // (Morphyx, 10-11) a reveal whose post fails: the old seed is public in the record, so NOTHING may roll
  // with it again. The next tick retries the reveal first, opens a new session, and rolls the ask with the new seed.
  { notes = [ask('r1', 'roll d6', t0 + 82 * H)];
    s = await B.dice({ agent, now: iso(t0 + 82 * H + 60_000), state: s });   // session 2's first roll
    const sess2 = s.session; assert.equal(sess2.n, 2); assert.ok(sess2.first);
    const rp = agent.post; let fails = 1;
    agent.post = async (...a) => { if (fails-- > 0) throw new Error('503'); return rp(...a); };
    s = await B.dice({ agent, now: iso(t0 + 82 * H + 60_000 + 24 * H), state: s });
    assert.match(s.lastError, /503/);
    assert.equal(records['2'].seed, sess2.seed, 'the record has the seed: it is public now');
    assert.ok(!s.session || s.session.n !== 2, 'the session is closed even though the reveal post failed');
    notes = [ask('late', 'roll d20', t0 + 106 * H + 3 * 60_000), ...notes];
    n0 = posts.length;
    s = await B.dice({ agent, now: iso(t0 + 106 * H + 5 * 60_000), state: s });
    assert.equal(s.lastError, null);
    assert.ok(posts[n0].text.includes(sess2.seed), 'the reveal is retried first');
    assert.equal(s.session.n, 3);
    assert.ok(!posts.slice(n0).some((p) => p.reply && p.reply.parent.uri === notes[0].uri), 'an ask made while no hash stood is not rolled');
    assert.ok(!records['2'].rolls.some((r) => r.cid === 'cidlate'), 'never recorded under the revealed session');
    notes = [ask('late2', 'roll d20', t0 + 106 * H + 7 * 60_000), ...notes];
    s = await B.dice({ agent, now: iso(t0 + 106 * H + 10 * 60_000), state: s });
    const roll = posts.find((p) => p.reply && p.reply.parent.uri === notes[0].uri);
    assert.ok(roll, 'an ask after the new hash is answered');
    assert.ok(roll.text.startsWith(`1d20: ${verify(s.session.seed, 'cidlate2', 1, 20)[0]}\n`), 'rolled with the NEW seed');
    assert.ok(roll.text.includes('?s=3&'));
    agent.post = rp; }
  // (Morphyx, 10-11) a failure partway through a tick: the rolls that did go out are still in the public record
  { notes = [ask('ok1', 'roll d8', t0 + 107 * H), ask('ok2', 'roll d8', t0 + 107 * H + 1), ...notes];
    const rp = agent.post; let left = 1;
    agent.post = async (text, o) => { if (o && o.reply && left-- <= 0) throw new Error('500'); return rp(text, o); };
    s = await B.dice({ agent, now: iso(t0 + 107 * H + 60_000), state: s });
    agent.post = rp;
    assert.match(s.lastError, /500/);
    assert.ok(records['3'].rolls.some((r) => r.cid === 'cidok1'), 'the posted roll is checkable'); }

  // the account's pace: every job on the first tick; five minutes later only dice; an hour later all three
  const ran = [];
  const saved = { ...B.JOBS };
  const acct = { did: BOT, async read() { return { notifications: [] }; }, async post(t) { ran.push('post'); return { uri: 'at://x/y/z', cid: 'c' }; }, async repo() { return {}; } };
  let st = await account({ agent: acct, now: iso(t0), state: { jobs: {} } });
  assert.deepEqual(Object.keys(st.ran).sort(), ['bingo', 'dice', 'doors']);
  const r1 = { ...st.ran };
  st = await account({ agent: acct, now: iso(t0 + 5 * 60_000), state: st });
  assert.equal(st.ran.bingo, r1.bingo); assert.equal(st.ran.doors, r1.doors); assert.equal(st.ran.dice, t0 + 5 * 60_000);
  st = await account({ agent: acct, now: iso(t0 + 60 * 60_000), state: st });
  assert.equal(st.ran.bingo, t0 + 60 * 60_000); assert.equal(st.ran.doors, t0 + 60 * 60_000);
  assert.deepEqual(B.EVERY, { bingo: 60, doors: 60, dice: 5 });
  void saved;
}
console.log('miniphim-works: ok');
