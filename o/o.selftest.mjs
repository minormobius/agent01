// o.selftest.mjs — ranking, rings, URL round-trips. node o/o.selftest.mjs
import { rank, rings, toQuery, fromQuery, cleanActor, authorOf, DEFAULTS, sum, altText, ALT_LIMIT } from './circle.js';
import { handleFromPath, avatarPath } from './worker.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('✗ ' + m); } };
const NOW = Date.parse('2026-11-23T12:00:00Z'), DAY = 86400000;
const ev = (did, kind, dir, daysAgo = 1) => ({ did, kind, dir, t: NOW - daysAgo * DAY });

// ── ranking ──────────────────────────────────────────────────────────────────
const E = [
  ev('A', 'like', 'out'), ev('A', 'like', 'out'), ev('A', 'like', 'in'),             // A: 3
  ev('B', 'reply', 'in'), ev('B', 'reply', 'out'), ev('B', 'quote', 'in'),           // B: 3, all conversation
  ev('C', 'like', 'in'), ev('C', 'like', 'in'), ev('C', 'repost', 'in'), ev('C', 'like', 'in'), // C: 4
  ev('D', 'like', 'out', 25),                                                        // outside 20 days
  ev('ME', 'reply', 'out'),                                                          // self
  ev('E', 'mention', 'out'),                                                         // unknown kind
];
const r = rank(E, 'ME', { now: NOW });
ok(r.map((x) => x.did).join('') === 'CBA', `default order: total, then conversation (got ${r.map((x) => x.did).join('')})`);
ok(r[0].total === 4 && r[0].score === 4, 'default score is the plain interaction count');
ok(!r.some((x) => x.did === 'D'), 'events older than the window are dropped');
ok(!r.some((x) => x.did === 'ME'), 'the centre is never in their own circle');
ok(!r.some((x) => x.did === 'E'), 'unknown kinds are ignored');
ok(r.find((x) => x.did === 'B').in.reply === 1 && r.find((x) => x.did === 'B').out.reply === 1, 'in/out kept apart');
ok(sum(r.find((x) => x.did === 'A').out) === 2, 'out tally');

const rIn = rank(E, 'ME', { now: NOW, dir: 'in' });
ok(rIn[0].did === 'C' && rIn.find((x) => x.did === 'A').total === 1, 'direction: in only');
const rOut = rank(E, 'ME', { now: NOW, dir: 'out' });
ok(rOut[0].did === 'A' && !rOut.some((x) => x.did === 'C'), 'direction: out only');
const rW = rank(E, 'ME', { now: NOW, weights: { like: 1, repost: 2, reply: 5, quote: 5 } });
ok(rW[0].did === 'B' && rW[0].score === 15, 'weights re-rank: conversation wins');
const r30 = rank(E, 'ME', { now: NOW, days: 30 });
ok(r30.some((x) => x.did === 'D'), 'a wider window brings older events back');
// ties: two-way beats one-way at equal score and conversation
const T = [ev('X', 'like', 'in'), ev('X', 'like', 'in'), ev('Y', 'like', 'in'), ev('Y', 'like', 'out')];
ok(rank(T, 'ME', { now: NOW })[0].did === 'Y', 'tie: two-way beats one-way');
ok(JSON.stringify(rank(T, 'ME', { now: NOW })) === JSON.stringify(rank([...T].reverse(), 'ME', { now: NOW })), 'order of events does not matter');

// ── rings ────────────────────────────────────────────────────────────────────
for (const [inner, outer, third] of [[8, 16, 0], [12, 24, 0], [3, 0, 0], [6, 12, 0], [8, 16, 24], [12, 24, 32], [3, 0, 1], [8, 16, 8], [12, 24, 12]]) {
  const S = 1200, g = rings(S, inner, outer, third);
  ok(g.inner.length === inner && g.outer.length === outer && g.third.length === third, `ring counts ${inner}/${outer}/${third}`);
  const all = [g.centre, ...g.inner, ...g.outer, ...g.third];
  let overlap = false, out = false;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (p.x - p.r < 0 || p.y - p.r < 0 || p.x + p.r > S || p.y + p.r > S) out = true;
    for (let j = i + 1; j < all.length; j++) {
      const q = all[j];
      if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) overlap = true;
    }
  }
  ok(!overlap, `no avatar overlaps another (${inner}/${outer}/${third})`);
  ok(!out, `every avatar is on the canvas (${inner}/${outer}/${third})`);
}
const g = rings(1200);
ok(Math.abs(g.inner[0].x - 600) < 1e-9 && g.inner[0].y < 600, 'rank 1 sits at twelve o\'clock');
ok(g.inner[1].x > 600, 'ranks run clockwise');
ok(g.inner[0].r > g.outer[0].r && g.centre.r > g.inner[0].r, 'centre > inner > outer');
ok(g.third.length === 0 && g.guides.length === 2, 'no third ring by default');
const g3 = rings(1200, 8, 16, 24);
ok(g3.outer[0].r > g3.third[0].r && g3.guides.length === 3, 'third ring: smaller seats, its own guide');

// ── alt text ─────────────────────────────────────────────────────────────────
const mk = (n, len = 12) => Array.from({ length: n }, (_, i) => ({ did: 'd' + i, total: 100 - i, score: (100 - i) * 2, profile: { handle: ('h' + i).padEnd(len, 'x') + '.bsky.social' } }));
const S0 = { ...DEFAULTS, weights: { ...DEFAULTS.weights } };
const A = altText({ handle: 'me.bsky.social' }, mk(24), S0);
ok(A.startsWith('My Bluesky circle, @me.bsky.social, last 20 days, ranked by interactions both ways. Made with o.mino.mobi.'), 'alt: header says who, when, how, where');
ok(/\nInner ring:\n1\. @h0x+\.bsky\.social \(100\)/.test(A) && /\nOuter ring:\n9\. @h8/.test(A), 'alt: rings in rank order, numbered, with counts');
ok(!/Third ring/.test(A) && !/more$/.test(A), 'alt: no third ring when off, nothing cut');
ok(A.length <= ALT_LIMIT, 'alt: default circle fits');
const A3 = altText({ handle: 'me.bsky.social' }, mk(48, 20), { ...S0, third: 24 });
ok(A3.length <= ALT_LIMIT, `alt: a 48-seat circle with long handles still fits (${A3.length})`);
ok(!/\(\d+\)/.test(A3) && /Third ring:/.test(A3), 'alt: when too long, counts go first, rings stay');
const Atiny = altText({ handle: 'me.bsky.social' }, mk(48, 60), { ...S0, third: 24 }, { limit: 600 });
ok(Atiny.length <= 600 && /…and \d+ more$/.test(Atiny), 'alt: past that, the tail is cut and says how many');
ok(Atiny.split('\n').filter((l) => /^\d+\./.test(l)).every((l) => /^\d+\. @h\d+x+\.bsky\.social$/.test(l)), 'alt: never cut mid-handle');
const Aw = altText({ handle: 'me.bsky.social' }, mk(3), { ...S0, dir: 'in', weights: { like: 1, repost: 1, reply: 3, quote: 1 } });
ok(/their interactions with me \(weighted\)/.test(Aw) && /1\. @h0x+\.bsky\.social \(200\)/.test(Aw), 'alt: weighted circles show the score and say so');
ok(altText({ handle: 'me.bsky.social' }, mk(5), S0).split('\n').filter((l) => /^\d+\./.test(l)).length === 5, 'alt: fewer people than seats lists who there is');

// ── settings in the URL ──────────────────────────────────────────────────────
ok(toQuery({ ...DEFAULTS, weights: { ...DEFAULTS.weights } }) === '', 'defaults write an empty query');
const custom = { days: 30, dir: 'in', weights: { like: 1, repost: 2, reply: 3, quote: 3 }, inner: 10, outer: 20, third: 24 };
ok(JSON.stringify(fromQuery(toQuery(custom))) === JSON.stringify(custom), 'settings round-trip through the URL');
const wild = fromQuery('d=9999&i=-4&o=500&dir=sideways&wl=abc');
ok(wild.days === 90 && wild.inner === 3 && wild.outer === 24 && wild.dir === 'both' && wild.weights.like === 1, 'hostile query values are clamped');
ok(fromQuery('t=999').third === 32 && fromQuery('').third === 0, 'third ring clamped, off by default');

// ── input ────────────────────────────────────────────────────────────────────
ok(cleanActor('@Alice.bsky.social ') === 'alice.bsky.social', 'handle: @ and case');
ok(cleanActor('https://bsky.app/profile/alice.bsky.social/post/3abc') === 'alice.bsky.social', 'bsky.app link');
ok(cleanActor('https://o.mino.mobi/alice.bsky.social?d=30') === 'alice.bsky.social', 'o.mino.mobi link');
ok(cleanActor('did:plc:AbC') === 'did:plc:AbC', 'DIDs keep their case');
ok(authorOf('at://did:plc:x/app.bsky.feed.post/1') === 'did:plc:x' && authorOf(null) === null, 'authorOf');

// ── worker routing ───────────────────────────────────────────────────────────
ok(handleFromPath('/alice.bsky.social') === 'alice.bsky.social', 'a handle path');
ok(handleFromPath('/') === null && handleFromPath('/app.js') === null && handleFromPath('/av/x') === null, 'assets and the root are not handles');
ok(handleFromPath('/did:plc:z72i7hdynmk6r22z27h6tvur') === 'did:plc:z72i7hdynmk6r22z27h6tvur', 'a DID path');
ok(handleFromPath('/did:plc:short') === null, 'a malformed DID is not a path');
ok(handleFromPath('/<script>.x') === null, 'nothing that is not a handle');
ok(avatarPath('/av/did:plc:z72i7hdynmk6r22z27h6tvur/bafkreihwihm6kpd6zuwhhlro75p5qks5qtrcu55jp3gddbfjsieiv7wuka')
  === 'https://cdn.bsky.app/img/avatar_thumbnail/plain/did:plc:z72i7hdynmk6r22z27h6tvur/bafkreihwihm6kpd6zuwhhlro75p5qks5qtrcu55jp3gddbfjsieiv7wuka@jpeg', 'avatar proxy maps to the thumbnail CDN');
ok(avatarPath('/av/did:plc:x/../../etc') === null && avatarPath('/av/https://evil.example/x') === null && avatarPath('/av/did:web:evil.com/abc') === null,
  'the avatar proxy is not an open proxy');

console.log(fails ? `✗ ${fails} failed, ${passes} passed` : `✓ o selftest: ${passes} passed`);
process.exit(fails ? 1 : 0);
