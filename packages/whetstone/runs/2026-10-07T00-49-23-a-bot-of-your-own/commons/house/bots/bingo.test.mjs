// node house/bots/bingo.test.mjs  — exits 0 when the caller behaves. A fake town, no network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import tick, * as B from './bingo.mjs';

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
  let n = 0, failNext = 0;
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
    notes.push({ uri: `at://${who}/p/${k}`, cid: `n${k}`, reason: 'reply', indexedAt: new Date(1e12 + k).toISOString(),
      author: { did: who, handle: who.split(':')[2] + '.delve.town' },
      record: { text, reply: { root: { uri: root.uri }, parent: { uri: parent.uri } } } });
  };
  return { agent, posts, notes, say, fail: (k = 1) => { failNext = k; } };
}
const H = 3600e3;
async function run(T, state, t) { return tick({ agent: T.agent, now: new Date(t).toISOString(), state }); }

{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await run(T, undefined, t);
  assert.equal(s.phase, 'open'); assert.equal(T.posts.length, 1);
  const root = T.posts[0];
  assert.ok(root.text.includes(s.commit) && !root.text.includes(s.seed), 'commit public, seed private');
  assert.equal(s.commit, await B.commitment(s.seed));

  T.say('did:plc:ann', 'me please', root);
  T.say('did:plc:bob', 'deal me in', root);
  T.say('did:plc:ann', 'did it work?', root);                    // a second ask: no second card
  T.say('did:plc:zed', 'unrelated', { uri: 'at://elsewhere/1' });  // another thread: ignored
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

  // rest, then game 2 with a new commitment
  const n = T.posts.length;
  s = await run(T, s, t += H); assert.equal(T.posts.length, n, 'resting');
  s = await run(T, s, t += B.REST_TICKS * H);
  assert.equal(s.phase, 'open'); assert.equal(s.game, 2); assert.notEqual(s.commit, (await B.commitment(seed)));
}

// 4. Nobody shouts: the caller calls it after GRACE calls, naming the earliest card(s).
{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await run(T, undefined, t);
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
  let s = await run(T, undefined, t);
  for (let k = 0; k < B.OPEN_TICKS; k++) s = await run(T, s, t += H);
  assert.equal(s.phase, 'idle'); assert.equal(T.posts.length, 2);
  assert.match(T.posts[1].text, /no winner\. Nobody joined/);
  assert.ok(T.posts[1].text.includes(s.history[0].seed));
}

// 6. State stays small: 40 players, a full game.
{
  const T = town();
  let t = Date.parse('2026-10-08T00:00:00Z');
  let s = await run(T, undefined, t);
  for (let i = 0; i < 40; i++) T.say(`did:plc:p${i}`, 'in', T.posts[0]);
  for (let k = 0; k < 90 && s.phase !== 'idle'; k++) { s = await run(T, s, t += H); assert.ok(JSON.stringify(s).length < 100_000); }
  assert.equal(s.phase, 'idle');
}
console.log('bingo: ok');
