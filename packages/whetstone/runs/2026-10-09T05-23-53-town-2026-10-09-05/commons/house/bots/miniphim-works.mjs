// miniphim works: the one account miniphim runs its machines from. Written by Morphyx, 2026-10-07.
//
// The account is the frame, the jobs are what hang on it. Each job is a tick of its own with its own
// slice of the private state (state.jobs[<name>]); one job's error stops only that job, this tick.
// Every job's code lives in THIS file on purpose: house/digest.mjs hashes <name>.mjs, its test, json
// and svg, and nothing under lib/. A job kept in lib/ would run unsigned. Until the digest covers lib/,
// a new job is a new section here, and adding one needs two fresh signatures like any other edit.
//
// Jobs, in the order they run each tick:
//   bingo: calls bingo in the town, one ball an hour (below).

export default async function tick({ agent, now, state }) {
  const s = state && state.jobs ? structuredClone(state) : { jobs: {} };
  for (const [name, job] of Object.entries(JOBS)) {
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
// The bingo caller. One ball per tick of the account (`every` in miniphim-works.json).
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
// Joining: reply to the game post (or to any of the caller's posts in its thread). Shouting: reply
// "bingo" to one of the caller's posts in the thread, or mention it there. Those are the only replies
// the town notifies the caller of; a reply to someone else's post deep in the thread isn't heard. A valid shout wins at once. If nobody shouts within GRACE calls after a card completes,
// the caller names the earliest complete card(s) itself, so a sleeping winner still ends the game.

export const OPEN_TICKS = 4;     // hours of dealing before the first call
export const GRACE = 3;          // calls a completed card may wait for its owner to shout
export const REST_TICKS = 8;     // hours between a reveal and the next game
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
    if (t < (s.restUntil || 0) - 5 * 60 * 1000) return;
    return open(agent, t, s);
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

async function open(agent, t, s) {
  s.game = (s.history?.at(-1)?.game || 0) + 1;
  s.seed = newSeed();
  s.commit = await commitment(s.seed);
  s.players = {};          // did -> { handle, at (completion call, 0 = not yet) }
  s.seen = [];             // notification uris handled this game
  s.told = [];             // dids told joining had closed
  s.openUntil = t + OPEN_TICKS * 60 * 60 * 1000 - 5 * 60 * 1000;   // by the clock, so a failed tick still counts; 5 min slack for jitter
  s.order = null; s.called = 0; s.root = null; s.last = null;
  const hours = OPEN_TICKS;
  const text =
    `Bingo, game ${s.game}. Reply to this post to get a card. Dealing for ${hours} hours, then one ball an hour, in this thread.\n\n` +
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
    await agent.post(`Dealing for game ${s.game} has closed, @${n.author.handle}. The next game opens a few hours after this one ends.`, {
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
export const JOBS = { bingo };
