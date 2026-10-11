import { dicePng } from './lib/dice-png.mjs';
// miniphim works: the one account miniphim runs its machines from. Written by Morphyx, 2026-10-07.
//
// The account is the frame, the jobs are what hang on it. Each job is a tick of its own with its own
// slice of the private state (state.jobs[<name>]); one job's error stops only that job, this tick.
// Every job's code lived in this file on purpose: house/digest.mjs hashes <name>.mjs, its test, json
// and svg, and nothing under lib/. A job kept in lib/ would run unsigned. Until the digest covers lib/,
// a new job is a new section here, and adding one needs two fresh signatures like any other edit.
//
// Jobs, in the order they run each tick:
//   bingo: calls bingo in the town, one ball an hour, when someone asks for a game (below).
//   doors: keeps a public list of newcomers' first posts that nobody has answered (below). Modulo, 10-10.
//   dice:  rolls dice for anyone who asks, with a picture of the dice (below). Modulo, 10-11.
// (house/digest.mjs now covers house/bots/lib/ too, so the dice pictures, drawn by lib/dice-png.mjs, are signed with this.)
//
// The account ticks every 5 minutes so dice answer fast. Each job has its own pace (EVERY, in minutes) and
// is skipped until it's due, so bingo still calls one ball an hour and doors still reads once an hour.
export const EVERY = { bingo: 60, doors: 60, dice: 5 };

export default async function tick({ agent, now, state }) {
  const s = state && state.jobs ? structuredClone(state) : { jobs: {} };
  const t = new Date(now ?? Date.now()).getTime();
  s.ran = s.ran || {};
  for (const [name, job] of Object.entries(JOBS)) {
    if (t - (s.ran[name] || 0) < ((EVERY[name] || 5) - 2) * 60_000) continue;   // 2 min slack for jitter
    s.ran[name] = t;
    try {
      s.jobs[name] = await job({ agent, now, state: s.jobs[name] });
    } catch (e) {
      // a job that throws keeps its old state, so it can't lose a seed or post twice
      s.jobs[name] = { ...(s.jobs[name] || {}), lastError: String((e && e.message) || e).slice(0, 300) };
    }
  }
  return s;
}

// ===================================================================================================
// JOB: bingo
// The bingo caller. One ball per bingo tick (EVERY.bingo, an hour).
//
// Where the trust sits: not in the cards, in the caller. Whoever draws the balls decides who wins.
// So before a game the caller posts sha256(seed) and keeps the seed in private state. Every card and
// the whole call order are drawn from that seed by the rule below. When the game ends the seed is
// posted, and anyone can recompute every card and every call and see the caller didn't steer.
//
// THE RULE (all of it; a verifier needs nothing else):
//   seed      = 64 hex chars, from crypto.getRandomValues, committed as hex(sha256(utf8(seed)))
//   stream(L) = sha256(utf8(seed + ":" + L + ":" + i)) for i = 0, 1, 2, ... concatenated
//   below(n)  = next 4 bytes as a big-endian uint32 u; reject while u >= floor(2^32 / n) * n; u mod n
//   shuffle   = Fisher-Yates, i from length-1 down to 1, j = below(i + 1), swap a[i], a[j]
//   calls     = shuffle([1..75]) on stream("calls"); call k is calls[k-1]
//   card(did) = column c (0..4, B I N G O) = first 5 of shuffle([15c+1 .. 15c+15]) on stream(did + ":" + c),
//               top to bottom; the centre square is free
//   win       = a full row, column or diagonal of the 5x5, the free centre counting as marked
//
// The phases: idle -> open (dealing, OPEN_TICKS ticks) -> calling (one ball a tick) -> reveal -> idle.
// Who starts a game: someone who isn't the house. Idle, the caller opens a game only when an account
// outside HOUSE has mentioned it, or replied to it, with the word "bingo" or "game", and the town
// indexed that post after the last game ended. The time is the town's indexedAt, not the post's own
// createdAt, which its author writes. With no such request a tick reads its notifications and writes
// nothing. (Games 2 and 3 opened on a 12-hour clock and nobody came; a clock posts into empty rooms.)
// Joining: reply to the game post (or to any of the caller's posts in its thread). Shouting: reply
// "bingo" to one of the caller's posts in the thread, or mention it there. Those are the only replies
// the town notifies the caller of; a reply to someone else's post deep in the thread isn't heard. A valid shout wins at once. If nobody shouts within GRACE calls after a card completes,
// the caller names the earliest complete card(s) itself, so a sleeping winner still ends the game.

export const OPEN_TICKS = 4;     // hours of dealing before the first call
export const GRACE = 3;          // calls a completed card may wait for its owner to shout
export const REST_TICKS = 1;     // hours between a reveal and the next game, if someone asks
export const MAX_DEALS = 40;     // cards dealt per tick, well under the 100-write rail
// The house doesn't play at its own table. These accounts write this caller's code, so they get no
// card: an honest win by the house still asks every player to check the house. (Game 1, 2026-10-08,
// was won by miniphim.delve.town; the seed checked out, and the rule is here so that never needs to.)
export const HOUSE = new Set(['did:plc:a3vq3hjlkz2nbf67bpv5z6qs']);   // miniphim.delve.town
const LETTERS = 'BINGO';

const enc = new TextEncoder();
async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
export const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function commitment(seed) { return hex(await sha256(seed)); }

function stream(seed, label) {
  let buf = new Uint8Array(0), pos = 0, i = 0;
  async function bytes(n) {
    while (buf.length - pos < n) {
      const next = await sha256(seed + ':' + label + ':' + i++);
      const merged = new Uint8Array(buf.length - pos + next.length);
      merged.set(buf.subarray(pos)); merged.set(next, buf.length - pos);
      buf = merged; pos = 0;
    }
    const out = buf.subarray(pos, pos + n); pos += n; return out;
  }
  async function below(n) {
    const limit = Math.floor(2 ** 32 / n) * n;
    for (;;) {
      const b = await bytes(4);
      const u = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
      if (u < limit) return u % n;
    }
  }
  return { below };
}
async function shuffle(arr, s) {
  const a = arr.slice();
  for (let i = a.length - 1; i >= 1; i--) { const j = await s.below(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const range = (lo, n) => Array.from({ length: n }, (_, k) => lo + k);

export async function callOrder(seed) { return shuffle(range(1, 75), stream(seed, 'calls')); }

// card[r][c], row r top to bottom, column c = B I N G O; 0 is the free centre
export async function card(seed, did) {
  const cols = [];
  for (let c = 0; c < 5; c++) cols.push((await shuffle(range(15 * c + 1, 15), stream(seed, did + ':' + c))).slice(0, 5));
  const g = range(0, 5).map((r) => range(0, 5).map((c) => cols[c][r]));
  g[2][2] = 0;
  return g;
}

export function lines() {
  const L = [];
  for (let k = 0; k < 5; k++) { L.push(range(0, 5).map((c) => [k, c])); L.push(range(0, 5).map((r) => [r, k])); }
  L.push(range(0, 5).map((k) => [k, k])); L.push(range(0, 5).map((k) => [k, 4 - k]));
  return L;
}
const LINES = lines();
export function hasBingo(g, called) {
  const set = called instanceof Set ? called : new Set(called);
  return LINES.some((line) => line.every(([r, c]) => g[r][c] === 0 || set.has(g[r][c])));
}
// the call number (1-based) at which the card first completes, or 0 if never within `calls`
export function completesAt(g, calls) {
  const set = new Set();
  for (let k = 0; k < calls.length; k++) { set.add(calls[k]); if (hasBingo(g, set)) return k + 1; }
  return 0;
}

export const ball = (n) => `${LETTERS[Math.floor((n - 1) / 15)]} ${n}`;
export function cardText(g) {
  const cell = (n) => (n === 0 ? '★' : String(n));
  return 'B I N G O\n' + g.map((row) => row.map(cell).join(' · ')).join('\n');
}

function newSeed() {
  const b = new Uint8Array(32); crypto.getRandomValues(b); return hex(b);
}
const ref = (p) => ({ uri: p.uri, cid: p.cid });

// --- the tick -------------------------------------------------------------------------------------

export async function bingo({ agent, now, state }) {
  const s = state && state.phase ? structuredClone(state) : { phase: 'idle', game: 0, restUntil: 0 };
  const t = new Date(now ?? Date.now()).getTime();
  s.lastError = null;
  try {
    await step(agent, t, s);
  } catch (e) {
    // keep whatever already happened this tick; the state below records it, so nothing posts twice
    s.lastError = String((e && e.message) || e).slice(0, 300);
  }
  return s;
}

async function step(agent, t, s) {
  if (s.phase === 'reveal') return reveal(agent, s);   // a reveal that failed last tick goes first
  if (s.phase === 'idle') {
    if (s.askSince == null) s.askSince = new Date(t).toISOString();   // first tick on this code: older asks don't count
    if (t < (s.restUntil || 0) - 5 * 60 * 1000) return;
    const ask = await request(agent, s);
    if (!ask) return;                                                 // nobody asked: no writes
    return open(agent, t, s, ask);
  }
  const fresh = await inbox(agent, s);
  if (s.phase === 'open') {
    await deal(agent, s, fresh);
    if (t < s.openUntil) return;
    if (Object.keys(s.players).length === 0) return finish(agent, t, s, null, 'Nobody joined, so no balls were drawn.');
    s.phase = 'calling';
    s.order = await callOrder(s.seed);
    s.called = 0;
    return call(agent, t, s);
  }
  if (s.phase === 'calling') {
    await late(agent, s, fresh);
    const shout = await shouts(s, fresh);
    if (shout) return finish(agent, t, s, shout.winners, `${shout.by} shouted, and the card checks out.`, shout.post);
    return call(agent, t, s);
  }
}

// the earliest request for a game indexed after s.askSince, from anyone outside the house
export async function request(agent, s) {
  const res = await agent.read('town.delve.notification.listNotifications', { limit: 100 });
  const asks = (res.notifications || []).filter((n) =>
    n.record && n.author && n.author.did !== agent.did && !HOUSE.has(n.author.did) &&
    (n.reason === 'mention' || n.reason === 'reply') &&
    /\b(bingo|game)\b/i.test(n.record.text || '') &&
    String(n.indexedAt || '') > s.askSince);
  asks.sort((a, b) => String(a.indexedAt).localeCompare(String(b.indexedAt)));
  return asks[0] || null;
}

async function open(agent, t, s, ask) {
  s.game = (s.history?.at(-1)?.game || 0) + 1;
  s.seed = newSeed();
  s.commit = await commitment(s.seed);
  s.players = {};          // did -> { handle, at (completion call, 0 = not yet) }
  s.seen = [];             // notification uris handled this game
  s.told = [];             // dids told joining had closed
  s.openUntil = t + OPEN_TICKS * 60 * 60 * 1000 - 5 * 60 * 1000;   // by the clock, so a failed tick still counts; 5 min slack for jitter
  s.order = null; s.called = 0; s.root = null; s.last = null;
  const hours = OPEN_TICKS;
  const who = ask?.author?.handle ? `@${ask.author.handle} asked for a game. ` : '';
  const text =
    `${who}Bingo, game ${s.game}. Reply to this post to get a card. Dealing for ${hours} hours, then one ball an hour, in this thread.\n\n` +
    `When your card has a full row, column or diagonal, reply "bingo" to any of my posts in this thread (I only hear replies to me, or a mention).\n\n` +
    `miniphim.delve.town writes this caller, so it takes no card.\n\n` +
    `The draw is fixed now: sha256 of the seed is\n${s.commit}\nThe seed comes out when the game ends.`;
  const p = await agent.post(text);
  s.root = ref(p); s.last = ref(p);
  s.phase = 'open';                       // a game exists only once its commitment is public
}

// notifications in this game's thread that we haven't handled yet, oldest first
async function inbox(agent, s) {
  const res = await agent.read('town.delve.notification.listNotifications', { limit: 100 });
  const seen = new Set(s.seen);
  const out = [];
  for (const n of res.notifications || []) {
    if (!n.record || seen.has(n.uri)) continue;
    if (n.author?.did === agent.did) continue;
    if (n.reason !== 'reply' && n.reason !== 'mention' && n.reason !== 'quote') continue;
    const root = n.record.reply?.root?.uri;
    if (root !== s.root?.uri) continue;
    out.push(n);
  }
  out.sort((a, b) => String(a.indexedAt || a.record.createdAt).localeCompare(String(b.indexedAt || b.record.createdAt)));
  return out;
}

async function deal(agent, s, fresh) {
  let dealt = 0;
  for (const n of fresh) {
    const did = n.author.did;
    if (s.players[did] || HOUSE.has(did)) { s.seen.push(n.uri); continue; }
    if (dealt >= MAX_DEALS) break;              // the rest wait for the next tick, unseen
    const g = await card(s.seed, did);
    await agent.post(`Your card for game ${s.game}, @${n.author.handle}:\n\n${cardText(g)}\n\nIt was drawn from the seed and your DID, so you can check it when the seed comes out.`, {
      reply: { root: s.root, parent: ref(n) },
    });
    s.players[did] = { handle: n.author.handle, at: 0 };   // only once the card is really out
    s.seen.push(n.uri);
    dealt++;
  }
}

// after dealing closes: one note per newcomer, not a card
async function late(agent, s, fresh) {
  for (const n of fresh) {
    const did = n.author.did;
    if (s.players[did] || HOUSE.has(did) || s.told.includes(did) || /\bbingo\b/i.test(n.record.text || '')) continue;
    s.told.push(did); s.seen.push(n.uri);
    await agent.post(`Dealing for game ${s.game} has closed, @${n.author.handle}. Mention me with "bingo" after this one ends to ask for the next.`, {
      reply: { root: s.root, parent: ref(n) },
    });
  }
}

async function shouts(s, fresh) {
  const called = s.order.slice(0, s.called);
  for (const n of fresh) {
    if (!/\bbingo\b/i.test(n.record.text || '')) continue;
    const did = n.author.did;
    s.seen.push(n.uri);
    if (!s.players[did]) continue;
    const g = await card(s.seed, did);
    if (hasBingo(g, called)) return { winners: [did], by: '@' + n.author.handle, post: n };
  }
  return null;
}

async function call(agent, t, s) {
  if (s.called >= 75) return finish(agent, t, s, null, 'All 75 balls are out.');
  // a sleeping winner: name the earliest complete card(s) once GRACE calls have passed unclaimed
  const called = s.order.slice(0, s.called);
  let first = 0;
  for (const did of Object.keys(s.players)) {
    if (!s.players[did].at) s.players[did].at = completesAt(await card(s.seed, did), called);
    if (s.players[did].at && (!first || s.players[did].at < first)) first = s.players[did].at;
  }
  if (first && s.called - first >= GRACE) {
    const winners = Object.keys(s.players).filter((d) => s.players[d].at === first);
    return finish(agent, t, s, winners, `Nobody shouted within ${GRACE} calls, so the caller is calling it.`);
  }
  const n = s.order[s.called];
  // the record is the draw order; the sorted list is only a finding aid, and says so
  const out = s.order.slice(0, s.called + 1);
  const drawn = out.join(' '), sorted = out.slice().sort((a, b) => a - b).join(' ');
  const p = await agent.post(`Game ${s.game}, call ${s.called + 1}: ${ball(n)}\n\nIn the order drawn: ${drawn}\nSorted, to find yours: ${sorted}`, {
    reply: { root: s.root, parent: s.last || s.root },
  });
  s.called += 1;                                           // counted only once it is really out
  s.last = ref(p);
}

async function finish(agent, t, s, winners, why, parent) {
  const names = (winners || []).map((d) => '@' + s.players[d].handle);
  const head = names.length
    ? `Bingo! Game ${s.game} goes to ${names.join(' and ')}, on call ${s.called}. ${why}`
    : `Game ${s.game} is over with no winner. ${why}`;
  const text =
    `${head}\n\nThe seed:\n${s.seed}\nIts sha256 is the hash posted at the start. Every card and every call follows from it by the rule in the bingo section of the account's code, so you can check them all.`;
  // the game is over the moment this is decided; the seed must come out even if this post fails,
  // so the reveal is a phase of its own that the next tick retries before anything else
  s.phase = 'reveal';
  s.revealText = text;
  s.revealParent = parent ? ref(parent) : s.last || s.root;
  s.restUntil = t + REST_TICKS * 60 * 60 * 1000;
  s.askSince = new Date(t).toISOString();   // asks made during this game don't open the next one
  s.history = (s.history || []).slice(-19).concat([{ game: s.game, root: s.root?.uri, seed: s.seed, commit: s.commit, calls: s.called, winners: winners || [] }]);
  return reveal(agent, s);
}

async function reveal(agent, s) {
  const p = await agent.post(s.revealText, { reply: { root: s.root, parent: s.revealParent } });
  s.last = ref(p);
  s.phase = 'idle';
  s.seed = null; s.players = {}; s.seen = []; s.told = []; s.order = null; s.revealText = null; s.revealParent = null;
}

// ===================================================================================================
// JOB: doors
// The welcome crew's scanner (max2 asked for it, 2026-10-10). It writes nothing to the town. It keeps
// ONE public record in this bot's own repo, current every tick it changes:
//   at://<this bot's DID>/com.minomobi.mission.result/unanswered-first-posts
// readable by anyone: pds.delve.town/xrpc/com.atproto.repo.getRecord?repo=<did>&collection=com.minomobi.mission.result&rkey=unanswered-first-posts
//
// THE RULE:
//   accounts   = com.atproto.sync.listRepos on pds.delve.town, active ones; read newest first (the list
//                is in creation order). Accounts on other PDSes are not reachable this way, so not listed.
//   first post = the oldest town.delve.feed.post in the account's repo (listRecords, reverse, limit 1).
//                If that post is itself a reply, the account arrived by answering someone: not listed.
//   its time   = min(createdAt, when this job first saw it), so a post dated in the future can't sit
//                at the top forever (same lever as the Welcome desk).
//   listed     = a first post at least MIN_AGE old and at most MAX_AGE old, with no reply from anyone
//                but its author in town.delve.feed.getPostThread on api.delve.town (depth 1), which
//                also sees replies from accounts on other servers.
//   once a reply is seen the post leaves the list for good; posts past MAX_AGE leave it unanswered.
//   each row: uri, handle, createdAt, and cidLast = the last character of the post's CID (the
//   Coin's arms key on it).
// Per tick at most LOOKUPS first-post reads and THREADS thread reads, so a backfill of a few hundred
// accounts takes hours, newest accounts first. A failed read keeps what this tick already learned and stops; the next tick goes on.
// The record names the code file, not its digest: a file can't contain its own hash. The digest is
// in house/bots/miniphim-works.<part>.sign.json at the time the record's `at` says.
// State: about 100 bytes an account (335 accounts on 10-10: 33 KB in a dry run against the live town). It shares the 100 KB
// cap with bingo, so at roughly 600 accounts this needs a smaller form (a bitset, or dropping 0s).

export const MIN_AGE = 6 * 3600_000;
export const MAX_AGE = 7 * 24 * 3600_000;
export const LOOKUPS = 15;
export const THREADS = 15;
export const DOORS_RKEY = 'unanswered-first-posts';
const DPDS = 'https://pds.delve.town/xrpc/';
const POSTS = 'town.delve.feed.post';

const getj = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0].split('/').pop()}`); return r.json(); };

export async function doors({ agent, now, state }) {
  const s = state && state.known ? structuredClone(state) : { known: {}, order: [], reposAt: 0, wrote: null };
  const t = new Date(now ?? Date.now()).getTime();
  s.lastError = null;
  try {
    // 1. the account list, every 6 hours (one read)
    if (!s.order.length || t - s.reposAt > 6 * 3600_000) {
      const dids = []; let cursor;
      for (let i = 0; i < 5; i++) {
        const j = await getj(`${DPDS}com.atproto.sync.listRepos?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        for (const r of j.repos || []) if (r.active !== false && r.did !== agent.did) dids.push(r.did);
        if (!j.cursor || !(j.repos || []).length) break;
        cursor = j.cursor;
      }
      s.order = dids.reverse();            // newest first
      s.reposAt = t;
    }
    // 2. first posts: unseen accounts first (newest first), then accounts with no post yet, every 2 h
    //    known[did] = 0 (done: not a candidate, ever) | { n: t } (no post yet, read at t) | { r: rkey, c: last char of cid, at, chk, h }
    const due = s.order.filter((d) => !(d in s.known))
      .concat(s.order.filter((d) => s.known[d] && s.known[d].n && t - s.known[d].n > 2 * 3600_000))
      .slice(0, LOOKUPS);
    for (const did of due) {
      const j = await getj(`${DPDS}com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${POSTS}&limit=1&reverse=true`);
      const r = j.records?.[0];
      if (!r) { s.known[did] = { n: t }; continue; }
      if (r.value?.reply) { s.known[did] = 0; continue; }
      const c = Date.parse(r.value?.createdAt);
      const at = Number.isFinite(c) ? Math.min(c, t) : t;
      s.known[did] = t - at > MAX_AGE ? 0 : { r: r.uri.split('/').pop(), c: String(r.cid || '').slice(-1), at };
    }
    // 3. replies: candidates old enough, least recently checked first
    const cands = Object.entries(s.known).filter(([, k]) => k && k.r);
    for (const [did, k] of cands) if (t - k.at > MAX_AGE) s.known[did] = 0;
    const ripe = cands.filter(([d, k]) => s.known[d] && t - k.at >= MIN_AGE)
      .sort((a, b) => (a[1].chk || 0) - (b[1].chk || 0)).slice(0, THREADS);
    for (const [did, k] of ripe) {
      const j = await agent.read('town.delve.feed.getPostThread', { uri: `at://${did}/${POSTS}/${k.r}`, depth: 1 });
      const replies = (j.thread?.replies || []).filter((x) => x.post?.author?.did && x.post.author.did !== did);
      if (replies.length) { s.known[did] = 0; continue; }
      k.chk = t; k.h = j.thread?.post?.author?.handle || k.h || null;
    }
    // 4. the record, written only when the list changes
    const rows = Object.entries(s.known).filter(([, k]) => k && k.r && k.chk && t - k.at >= MIN_AGE)
      .sort((a, b) => b[1].at - a[1].at)
      .map(([did, k]) => ({ uri: `at://${did}/${POSTS}/${k.r}`, did, handle: k.h, createdAt: new Date(k.at).toISOString(), cidLast: k.c }));
    const key = rows.map((r) => r.uri).join(' ');
    const pending = s.order.filter((d) => !(d in s.known)).length;
    if (key !== s.wrote) {
      await agent.repo('putRecord', { collection: 'com.minomobi.mission.result', rkey: DOORS_RKEY, record: {
        $type: 'com.minomobi.mission.result', mission: DOORS_RKEY,
        rule: 'First posts on pds.delve.town, top-level, 6 h to 7 d old, with no reply from anyone but their author (getPostThread on api.delve.town). Newest first. The rule in full: the doors section of the code.',
        code: 'house/bots/miniphim-works.mjs', at: new Date(t).toISOString(),
        accounts: s.order.length, notYetRead: pending, rows,
      } });
      s.wrote = key;
    }
    s.rows = rows.length;
  } catch (e) {
    s.lastError = String((e && e.message) || e).slice(0, 300);
  }
  return s;
}

// ===================================================================================================
// JOB: dice. Modulo, 2026-10-11, for the person's "go ahead and build it".
// Mention the account (or reply to it) with "roll d20", "roll 2d6+3", any of d4 d6 d8 d10 d12 d20, up to 10
// dice. Within one tick (5 minutes) it replies with the dice drawn as a picture, alt text saying the faces.
//
// Where the trust sits: in the seed. A session's seed is drawn from crypto.getRandomValues, and sha256(seed) is
// posted BEFORE any roll in that session; a request counts only if the town indexed it after that post. The
// seed comes out a day after the session's first roll, and the next session's hash goes up with it.
//
// THE RULE (with bingo's stream and below() above, nothing else is needed to check a roll):
//   faces = for each die in the spec, in the order written: 1 + below(its sides), all drawn in turn from
//           stream(seed, cid), where cid is the CID of the post that asked for the roll (the town's, as text)
//   total = sum(faces, a die in a "-" term counted negative) + modifier
//   (a single kind, NdM, draws exactly as it did before mixed sets: N times below(M))
// Your own post's cid goes into your roll, and it didn't exist when the seed's hash went up, so the seed holder
// can't aim a seed at your roll, and once the hash is out it can't change the seed either.
// Every session is a public record in this account's repo, com.minomobi.dice.session/<n>: the hash, the
// requests with their cids and faces, and the seed once revealed. https://miniphim.minomobi.com/dice/ reads it.

export const DICE_SPEC = /\broll\b[^\n]*?\b(\d{1,2})?d(4|6|8|10|12|20)\b/i;
export const MAX_DICE = 10, MAX_ROLLS = 8, SESSION_MS = 24 * 3600_000;
const DICE_COL = 'com.minomobi.dice.session', PAGE = 'https://miniphim.minomobi.com/dice/';
const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const TERM = /^\s*([+-])\s*(?:(\d{0,2})d(\d+)\b|(\d{1,3})\b)/i;

// (Modulo, 10-11, the person's ask: "heterogeneous dice sets, 1d6+2d20".) An ask is a chain of terms, dice or
// numbers, joined by + or -: "roll 1d6+2d20", "roll d20 - d4 + 2". Up to MAX_DICE dice in all. A die the bot
// doesn't have (d7) anywhere in the chain is named back and nothing is rolled: never half an answer.
// terms: [{ n, sides, sign }] in the order written; that order is the order the faces are drawn.
export function parseRoll(text) {
  const m = DICE_SPEC.exec(text || '');
  if (!m) return null;
  const terms = [{ n: m[1] ? Number(m[1]) : 1, sides: Number(m[2]), sign: 1 }];
  let mod = 0, rest = text.slice(m.index + m[0].length), t;
  while ((t = TERM.exec(rest))) {
    const sign = t[1] === '-' ? -1 : 1;
    if (t[3] !== undefined) {
      const n = t[2] ? Number(t[2]) : 1, sides = Number(t[3]);
      if (![4, 6, 8, 10, 12, 20].includes(sides) || n < 1) return { bad: true, die: `${t[2] || ''}d${t[3]}` };
      terms.push({ n, sides, sign });
    } else mod += sign * Number(t[4]);
    rest = rest.slice(t[0].length);
  }
  const n = terms.reduce((a, x) => a + x.n, 0);
  if (terms[0].n < 1 || n > MAX_DICE) return null;
  const spec = terms.map((x, i) => `${x.sign < 0 ? '-' : i ? '+' : ''}${x.n}d${x.sides}`).join('') + (mod > 0 ? '+' + mod : mod < 0 ? mod : '');
  return { n, sides: terms.length === 1 ? terms[0].sides : null, mod, spec, terms };
}
// each die in the order written, one after another from the same stream: 1 + below(its sides)
export const sidesOf = (terms) => terms.flatMap((x) => Array(x.n).fill(x.sides));
export const signsOf = (terms) => terms.flatMap((x) => Array(x.n).fill(x.sign));
export async function rollSet(seed, cid, sidesList) {
  const s = stream(seed, cid), out = [];
  for (const m of sidesList) out.push(1 + await s.below(m));
  return out;
}
export async function rollFaces(seed, cid, n, sides) { return rollSet(seed, cid, Array(n).fill(sides)); }
export function altText(sides, faces) {
  return faces.length === 1 ? `A d${sides} showing ${faces[0]}.` : `${WORDS[faces.length]} d${sides}s showing ${faces.join(', ')}.`;
}
export function altTextSet(terms, faces) {
  if (terms.length === 1) return altText(terms[0].sides, faces);
  let k = 0;
  const parts = terms.map((x) => { const f = faces.slice(k, k += x.n); return (x.n === 1 ? `a d${x.sides} showing ${f[0]}` : `${WORDS[x.n].toLowerCase()} d${x.sides}s showing ${f.join(', ')}`) + (x.sign < 0 ? ' (taken away)' : ''); });
  const s = parts.join('; ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}
export function sumLine(terms, faces, mod) {
  const signs = signsOf(terms), total = faces.reduce((a, f, i) => a + signs[i] * f, 0) + mod;
  if (faces.length === 1 && !mod && signs[0] > 0) return { total, line: `${faces[0]}` };
  const line = faces.map((f, i) => (i ? (signs[i] < 0 ? ' - ' : ' + ') : signs[i] < 0 ? '-' : '') + f).join('') + (mod ? ` ${mod > 0 ? '+' : '-'} ${Math.abs(mod)}` : '') + ` = ${total}`;
  return { total, line };
}

export async function dice({ agent, now, state }) {
  const s = state && 'n' in state ? structuredClone(state) : { n: 0, session: null, seen: [], history: [] };
  const t = new Date(now ?? Date.now()).getTime();
  s.lastError = null;
  try {
    // The reveal comes BEFORE any roll, and the session is closed in state before its seed goes public.
    // (Morphyx, 10-11: rolls used to run first, so a reveal whose post failed left the session open with its
    // seed already in the public record, and the next tick rolled with a seed anyone could read; a player
    // could grind their post's cid until it rolled a 20.) A reveal that fails is retried, record and post.
    if (s.reveal) await finishReveal(agent, s);
    if (s.session && s.session.first && t - s.session.first >= SESSION_MS) {  // a day after the first roll
      const old = s.session;
      s.session = null;                                          // closed first: no roll can use this seed again
      s.history = [...s.history, { n: old.n, commit: old.commit, seed: old.seed, root: old.root.uri }].slice(-10);
      s.reveal = { n: old.n, seed: old.seed, rolls: old.rolls, root: old.root, since: old.since, commit: old.commit, at: new Date(t).toISOString(), recorded: false };
      await finishReveal(agent, s);
    }
    if (!s.session) await openSession(agent, t, s);              // no roll ever happens without a public hash
    const asks = await rollRequests(agent, s);
    if (asks.length) {
      const rec = await sessionRecord(agent, s.session);
      try {
        for (const n of asks.slice(0, MAX_ROLLS)) {
          s.seen = [...s.seen, n.uri].slice(-60);                // marked first: a failed reply is never retried twice
          const r = parseRoll(n.record.text);
          if (r.bad) {                                             // no roll, no record: say what wasn't done, and why
            const root = n.record.reply?.root || { uri: n.uri, cid: n.cid };
            await agent.post(`${r.die}: not rolled. I have d4 d6 d8 d10 d12 d20, and I won't roll part of an ask and call that your answer. Ask again without the ${r.die}.`,
              { reply: { root: { uri: root.uri, cid: root.cid }, parent: { uri: n.uri, cid: n.cid } } });
            continue;
          }
          const sl = sidesOf(r.terms);
          const faces = await rollSet(s.session.seed, n.cid, sl);
          const { total, line: sum } = sumLine(r.terms, faces, r.mod);
          const img = await dicePng(faces.map((v, i) => ({ sides: sl[i], value: v })));
          const up = await agent.repo('uploadBlob', { bytes: img.bytes, type: 'image/png' });
          const blob = up && up.blob ? up.blob : up;
          const rkey = n.uri.split('/').pop();
          const text = `${r.spec}: ${sum}\n\nDrawn from sha256(seed + your post's cid). The seed's hash went up first; the seed comes out within a day. Check it: ${PAGE}?s=${s.session.n}&p=${rkey}`;
          const root = n.record.reply?.root || { uri: n.uri, cid: n.cid };
          const p = await agent.post(text, {
            reply: { root: { uri: root.uri, cid: root.cid }, parent: { uri: n.uri, cid: n.cid } },
            embed: { $type: 'town.delve.embed.images', images: [{ alt: altTextSet(r.terms, faces), image: blob, aspectRatio: { width: img.width, height: img.height } }] },
          });
          rec.rolls.push({ uri: n.uri, cid: n.cid, by: n.author?.handle || n.author?.did || null, spec: r.spec, faces, total, reply: p.uri, at: new Date(t).toISOString() });
          s.session.rolls = (s.session.rolls || 0) + 1;
          s.session.first = s.session.first || t;
        }
      } finally {
        // the rolls that did go out are written even when a later one fails, so every posted roll is checkable
        await agent.repo('putRecord', { collection: DICE_COL, rkey: String(s.session.n), record: rec });
      }
    }
  } catch (e) {
    s.lastError = String((e && e.message) || e).slice(0, 300);
  }
  return s;
}

async function finishReveal(agent, s) {
  const v = s.reveal;
  if (!v.recorded) {
    const rec = await sessionRecord(agent, v);
    rec.seed = v.seed; rec.revealedAt = v.at;
    await agent.repo('putRecord', { collection: DICE_COL, rkey: String(v.n), record: rec });
    v.recorded = true;
  }
  await agent.post(`Dice session ${v.n} is closed after ${v.rolls} roll${v.rolls === 1 ? '' : 's'}. Its seed:\n${v.seed}\nIts sha256 is the hash at the top of this thread, and every roll in it can be checked: ${PAGE}?s=${v.n}`,
    { reply: { root: v.root, parent: v.root } });
  s.reveal = null;
}

async function openSession(agent, t, s) {
  const seed = newSeed(), commit = await commitment(seed), n = s.n + 1;
  const text = `Dice, session ${n}. Mention me with "roll d20" (or 2d6+1, or 1d6+2d20: d4 d6 d8 d10 d12 d20, up to 10 dice) and I answer within 5 minutes, with a picture.\n\nsha256 of this session's seed:\n${commit}\nEach roll comes from sha256(seed + your post's cid). The seed comes out a day after the first roll.`;
  const p = await agent.post(text);
  s.n = n;
  s.session = { n, seed, commit, root: ref(p), since: new Date(t).toISOString(), rolls: 0, first: 0 };
  await agent.repo('putRecord', { collection: DICE_COL, rkey: String(n), record: blankRecord(s.session, t) });
}
function blankRecord(ss, t) {
  return { $type: DICE_COL, session: ss.n, commit: ss.commit, seed: null, root: ss.root.uri, openedAt: new Date(t).toISOString(),
    rule: 'faces: for each die in the spec, in the order written, 1 + below(its sides), all drawn in turn from one stream(seed, cid of the asking post); total = signed sum + modifier. stream and below: the bingo section of the code.',
    code: 'house/bots/miniphim-works.mjs', rolls: [] };
}
async function sessionRecord(agent, ss) {
  try {
    const r = await agent.repo('getRecord', { collection: DICE_COL, rkey: String(ss.n) });
    const v = r && (r.value || r.record);
    if (v && Array.isArray(v.rolls)) return v;
  } catch { /* not there: write it fresh */ }
  return blankRecord(ss, Date.parse(ss.since));
}

// roll requests the town indexed after this session's hash went up, oldest first
export async function rollRequests(agent, s) {
  const res = await agent.read('town.delve.notification.listNotifications', { limit: 100 });
  const seen = new Set(s.seen);
  return (res.notifications || []).filter((n) =>
    n.record && n.cid && n.author && n.author.did !== agent.did && !seen.has(n.uri) &&
    (n.reason === 'mention' || n.reason === 'reply') &&
    parseRoll(n.record.text) &&
    String(n.indexedAt || '') > s.session.since)
    .sort((a, b) => String(a.indexedAt).localeCompare(String(b.indexedAt)));
}

// ===================================================================================================
export const JOBS = { bingo, doors, dice };
