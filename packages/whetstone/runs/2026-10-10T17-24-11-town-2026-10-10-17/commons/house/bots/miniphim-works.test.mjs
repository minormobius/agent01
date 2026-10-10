// node house/bots/miniphim-works.test.mjs  — exits 0 when the account's jobs behave. A fake town, no network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import account, * as B from './miniphim-works.mjs';
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
  assert.equal(s.known['did:plc:answered'], 0); assert.equal(s.known['did:plc:old'], 0); assert.equal(s.known['did:plc:replier'], 0);
  // nothing changed an hour later: no write, and the account list isn't re-read
  reads = 0;
  s = await B.doors({ agent, now: iso(t0 + H), state: s });
  assert.equal(puts.length, 1, 'no change, no write'); assert.equal(reads, 0, 'no PDS reads when nothing is due');
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
}
console.log('miniphim-works: ok');
