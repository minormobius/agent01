// words.mino.mobi — the server for asynchronous games.
//
//   GET  /api/health                     lexicon + layouts, and proof the DAWG loaded
//   POST /api/games                      create a game -> { code, token, state }
//   POST /api/games/:code/join           take a free seat -> { token, seat, state }
//   GET  /api/games/:code?token=         the position, redacted for that seat
//   POST /api/games/:code/move           play / pass / exchange / resign
//   GET  /api/games/:code/hint?token=    the best plays for YOUR rack
//   GET  /api/lexicon?word=              is it a word
//   GET  /api/cross/clues?w=A,B,C        clues for a crossword's answers
//   GET  /api/push/key                   the VAPID public key to subscribe with
//   POST /api/games/:code/subscribe      register this browser for turn pushes
//   POST /api/games/:code/unsubscribe    stop them
//
// WHAT THE SERVER IS FOR. Racks and the bag are hidden information, so they
// cannot live in the browser: the authoritative state stays in D1 and every
// response goes through `redact()`, which is the only function that produces a
// client-safe view. The bot moves are computed HERE too — not because the
// browser could not (it runs the same engine offline), but because a game
// where the opponent's turns are computed by the opponent's client is a game
// that stops when they close the tab.
//
// STORAGE is one row per game holding the whole state as JSON, guarded by a
// version column: a move states the version it saw and the UPDATE only lands if
// nothing changed underneath it. Two players moving at once is not exotic here
// — it is Tuesday, in a four-player game — and the alternative to a compare-
// and-set is a silently lost turn.
//
// Games are on the SHARED atpolls-db. Read ../CLAUDE.md before touching the
// migration: the numbering is repo-wide and a reused number is a merge
// conflict that only shows up in production.

import { Dawg } from './engine/dawg.js';
import { LAYOUTS, LAYOUT_IDS, DEFAULT_LAYOUT, assertLayouts } from './engine/board.js';
import {
  newGame, applyPlay, applyPass, applyExchange, applyResign, redact, botToMove,
  MAX_SEATS, AI_LEVELS,
} from './engine/game.js';
import { takeTurn, topMoves } from './engine/ai.js';
import { rngFrom, makeCode } from './engine/rng.js';
import * as webpush from './lib/webpush.js';
import { parseShard, renderClue } from './cross/gen/clues.js';

const MAX_BODY = 64 * 1024;
/** Who a push service should complain to about our notifications. */
const VAPID_SUBJECT = 'mailto:tips@minomobi.com';
/** A four-player game can have three bots in a row waiting on one human move. */
const MAX_BOT_TURNS = 12;

let DAWG = null;
/** Parsed crossword clue shards, by first letter. One parse per isolate. */
const CLUE_SHARDS = new Map();

/** Load the lexicon once per isolate and keep it — it is ~475 KiB of Uint32. */
async function lexicon(env) {
  if (DAWG) return DAWG;
  const res = await env.ASSETS.fetch(new Request('https://words.mino.mobi/dict/lexicon.dawg'));
  if (!res.ok) throw new Error(`lexicon asset missing (${res.status})`);
  DAWG = new Dawg(new Uint8Array(await res.arrayBuffer()));
  return DAWG;
}

/**
 * Clues for a crossword's answers.
 *
 * WHY THE SERVER DOES THIS AT ALL, when the puzzle itself is generated in the
 * browser: the clue store is about three megabytes and a puzzle needs seventy
 * clues. Shipping the store to the client to answer seventy questions is the
 * wrong shape. The shards stay here, are parsed once per isolate, and a whole
 * 15x15's worth of clues comes back in about six kilobytes.
 *
 * The consequence, stated plainly: OFFLINE PLAY GENERATES A PUZZLE BUT CANNOT
 * CLUE IT. The obvious fix is to precache the shards in the service worker;
 * that is a 2.7 MB decision nobody has made yet.
 */
async function crossClues(env, url) {
  const asked = String(url.searchParams.get('w') || '')
    .toUpperCase()
    .split(',')
    .map((w) => w.replace(/[^A-Z]/g, ''))
    .filter((w) => w.length >= 3 && w.length <= 15);
  // A 15x15 has ~78 entries; the cap is a bound on work, not a real limit.
  const words = [...new Set(asked)].slice(0, 200);

  const needed = [...new Set(words.map((w) => w[0]))];
  await Promise.all(needed.map(async (letter) => {
    if (CLUE_SHARDS.has(letter)) return;
    const res = await env.ASSETS.fetch(
      new Request(`https://words.mino.mobi/cross/dict/clues/${letter}.txt`)
    );
    CLUE_SHARDS.set(letter, res.ok ? parseShard(await res.text()) : new Map());
  }));

  const clues = {};
  let missing = 0;
  for (const w of words) {
    const rendered = renderClue(CLUE_SHARDS.get(w[0])?.get(w));
    if (rendered) clues[w] = rendered;
    else missing++;
  }
  return new Response(JSON.stringify({ clues, missing }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Clues for a word never change without a deploy, and a deploy replaces
      // the whole asset manifest anyway.
      'cache-control': 'public, max-age=86400',
    },
  });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const fail = (error, status = 400) => json({ error }, status);

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new Error('body too large');
  try { return await request.json(); } catch { return {}; }
}

/** Tokens are stored hashed — a leaked database row must not be a playable seat. */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Names render as text; strip control characters and angle brackets anyway. */
const clean = (s, max = 24) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

// ------------------------------------------------------------- storage ----

async function loadGame(env, code) {
  const row = await env.DB.prepare(
    'SELECT code, layout, seed, status, version, state FROM words_games WHERE code = ?'
  ).bind(code).first();
  if (!row) return null;
  return { row, state: JSON.parse(row.state) };
}

async function seatFor(env, code, token) {
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    'SELECT seat FROM words_seats WHERE code = ? AND token_hash = ?'
  ).bind(code, hash).first();
  return row ? row.seat : null;
}

/**
 * Persist a moved-on state. Compare-and-set on `version`; a false return means
 * somebody else's move landed first and the caller must re-read and retry.
 */
async function saveGame(env, code, state, expectedVersion) {
  const res = await env.DB.prepare(
    `UPDATE words_games
        SET state = ?, status = ?, turn = ?, version = version + 1, updated_at = ?
      WHERE code = ? AND version = ?`
  ).bind(JSON.stringify(state), state.status, state.turn, Date.now(), code, expectedVersion).run();
  return (res.meta?.changes ?? 0) > 0;
}

async function logMoves(env, code, entries) {
  if (!entries.length) return;
  const now = Date.now();
  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO words_moves (code, ply, seat, kind, word, score, payload, created_at) VALUES (?,?,?,?,?,?,?,?)'
  );
  await env.DB.batch(entries.map((e) => stmt.bind(
    code, e.ply, e.seat, e.kind, e.word || null, e.score || 0, JSON.stringify(e), now,
  )));
}

/**
 * Apply one move to a state. Named for its second use: when a compare-and-set
 * misses because of a concurrent bookkeeping write, the same move is applied
 * again to the newer state.
 */
function replayMove(state, seat, body, dawg) {
  switch (body.kind) {
    case 'play': {
      const placements = Array.isArray(body.placements) ? body.placements.map((p) => ({
        i: Number(p.i), letter: String(p.letter || '').toUpperCase().slice(0, 1), blank: !!p.blank,
      })) : [];
      return applyPlay(state, seat, placements, dawg);
    }
    case 'pass': return applyPass(state, seat);
    case 'exchange': return applyExchange(state, seat, (body.tiles || []).map((t) => String(t).toUpperCase().slice(0, 1)));
    case 'resign': return applyResign(state, seat);
    default: return { ok: false, error: 'unknown move' };
  }
}

/** Run every bot that is now to move, collecting their log entries. */
function runBots(state, dawg) {
  const entries = [];
  let guard = 0;
  while (botToMove(state) && guard++ < MAX_BOT_TURNS) {
    const res = takeTurn(state, state.turn, dawg);
    if (!res.ok) break;      // a bot that cannot move must not wedge the game
    if (res.entry) entries.push(res.entry);
  }
  return entries;
}

// The stored row's version is authoritative and is applied AFTER the redacted
// state, never before — see the note in redact().
const view = (state, seat, row) => ({
  ...redact(state, seat),
  code: row.code,
  version: row.version,
});

// ------------------------------------------------------------ push ---------
//
// Turn notifications. The keypair is read from worker secrets when they exist
// and otherwise generated once into words_config — see 0036_words_push.sql for
// why, and for how to move it into a secret later without losing subscribers
// (you cannot: changing the public key invalidates every existing
// subscription, so do it before anyone subscribes or accept that everyone
// re-subscribes).

let VAPID = null;

async function vapidKeys(env) {
  if (VAPID) return VAPID;
  if (env.WORDS_VAPID_PUBLIC && env.WORDS_VAPID_PRIVATE) {
    VAPID = { publicKey: env.WORDS_VAPID_PUBLIC, privateKey: env.WORDS_VAPID_PRIVATE, subject: VAPID_SUBJECT };
    return VAPID;
  }
  const row = await env.DB.prepare('SELECT value FROM words_config WHERE key = ?').bind('vapid').first();
  if (row) {
    VAPID = { ...JSON.parse(row.value), subject: VAPID_SUBJECT };
    return VAPID;
  }
  const fresh = await webpush.generateKeys();
  // INSERT OR IGNORE, not INSERT: two cold isolates can race here on the first
  // ever request, and the loser must adopt the winner's key rather than
  // overwrite it — every subscription is bound to whichever key it saw.
  await env.DB.prepare('INSERT OR IGNORE INTO words_config (key, value, created_at) VALUES (?,?,?)')
    .bind('vapid', JSON.stringify(fresh), Date.now()).run();
  const stored = await env.DB.prepare('SELECT value FROM words_config WHERE key = ?').bind('vapid').first();
  VAPID = { ...JSON.parse(stored.value), subject: VAPID_SUBJECT };
  return VAPID;
}

async function subscribePush(request, env, code) {
  const body = await readJson(request);
  const seat = await seatFor(env, code, body.token);
  if (seat === null) return fail('not your game', 403);
  const sub = body.subscription || {};
  const endpoint = String(sub.endpoint || '');
  const p256dh = String(sub.keys?.p256dh || '');
  const auth = String(sub.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return fail('bad subscription');

  await env.DB.prepare(
    `INSERT INTO words_push (code, seat, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (code, seat, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
  ).bind(code, seat, endpoint, p256dh, auth, Date.now()).run();
  return json({ ok: true, seat });
}

async function unsubscribePush(request, env, code) {
  const body = await readJson(request);
  const seat = await seatFor(env, code, body.token);
  if (seat === null) return fail('not your game', 403);
  await env.DB.prepare('DELETE FROM words_push WHERE code = ? AND seat = ? AND endpoint = ?')
    .bind(code, seat, String(body.endpoint || '')).run();
  return json({ ok: true });
}

/**
 * Wake whoever is to move. Best effort by design: a push that fails must never
 * fail the move that triggered it, so everything here is caught and swallowed
 * apart from deleting subscriptions the push service says are dead.
 */
async function notifyTurn(env, code, state) {
  try {
    if (state.status !== 'active') return;
    const seat = state.seats[state.turn];
    if (!seat || seat.kind !== 'human' || seat.resigned) return;

    const { results = [] } = await env.DB.prepare(
      'SELECT endpoint, p256dh, auth FROM words_push WHERE code = ? AND seat = ?'
    ).bind(code, state.turn).all();
    if (!results.length) return;

    const last = [...state.history].reverse().find((h) => h.seat !== state.turn);
    const who = last ? (state.seats[last.seat]?.name || 'Someone') : null;
    const what = !last ? 'The game has started.'
      : last.kind === 'play' ? `${who} played ${last.words?.[0] || 'a word'} for ${last.score}.`
      : last.kind === 'pass' ? `${who} passed.`
      : last.kind === 'exchange' ? `${who} swapped tiles.`
      : `${who} resigned.`;

    const payload = JSON.stringify({
      title: 'Your turn',
      body: `${what} You are up in ${code}.`,
      code,
      url: `/?g=${code}`,
      badge: 1,
    });
    const vapid = await vapidKeys(env);

    await Promise.all(results.map(async (row) => {
      const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
      try {
        const res = await webpush.send(subscription, payload, vapid);
        if (webpush.isGone(res.status)) {
          // The browser threw the subscription away. So do we — everywhere,
          // not just for this game.
          await env.DB.prepare('DELETE FROM words_push WHERE endpoint = ?').bind(row.endpoint).run();
        }
      } catch { /* a push service having a bad day is not this move's problem */ }
    }));
  } catch { /* ditto for anything above */ }
}

// ---------------------------------------------------------------- routes --

async function createGame(request, env) {
  const body = await readJson(request);
  const layout = LAYOUT_IDS.includes(body.layout) ? body.layout : DEFAULT_LAYOUT;

  const wanted = Array.isArray(body.seats) ? body.seats : [];
  if (!wanted.length || wanted.length > MAX_SEATS) return fail(`a game seats 1-${MAX_SEATS} players`);
  const seats = wanted.map((s, i) => ({
    kind: s.kind === 'bot' ? 'bot' : 'human',
    level: AI_LEVELS.includes(s.level) ? s.level : 'steady',
    name: clean(s.name) || (s.kind === 'bot' ? `${(AI_LEVELS.includes(s.level) ? s.level : 'steady')} bot` : `Player ${i + 1}`),
  }));
  if (!seats.some((s) => s.kind === 'human')) return fail('somebody has to play');

  // The seed fixes the bag, so it must not be guessable from the game code —
  // otherwise a player can compute every tile their opponent will draw.
  const seed = newToken();
  const code = makeCode(rngFrom(seed), 5);

  // The creator takes the first human seat; every other human seat stays open
  // until somebody opens the link, which is what the lobby shows.
  const mySeat = seats.findIndex((s) => s.kind === 'human');
  const state = newGame({
    seed, layout,
    seats: seats.map((s, i) => ({ ...s, joined: s.kind === 'bot' || i === mySeat })),
  });
  const now = Date.now();

  const existing = await env.DB.prepare('SELECT code FROM words_games WHERE code = ?').bind(code).first();
  if (existing) return fail('code collision, try again', 503);

  await env.DB.prepare(
    `INSERT INTO words_games (code, layout, seed, status, turn, seat_count, state, version, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,1,?,?)`
  ).bind(code, layout, seed, state.status, state.turn, seats.length, JSON.stringify(state), now, now).run();

  const token = newToken();
  const rows = [];
  for (const [i, s] of seats.entries()) {
    rows.push(env.DB.prepare(
      'INSERT INTO words_seats (code, seat, name, kind, token_hash, joined_at) VALUES (?,?,?,?,?,?)'
    ).bind(code, i, s.name, s.kind, i === mySeat ? await sha256(token) : null, i === mySeat ? now : null));
  }
  await env.DB.batch(rows);

  // A game whose first seats are bots starts with them already having moved.
  const dawg = await lexicon(env);
  const entries = runBots(state, dawg);
  if (entries.length) {
    await saveGame(env, code, state, 1);
    await logMoves(env, code, entries);
  }

  const fresh = await loadGame(env, code);
  return json({ code, token, seat: mySeat, ...view(fresh.state, mySeat, fresh.row) });
}

async function joinGame(request, env, code) {
  const body = await readJson(request);
  const loaded = await loadGame(env, code);
  if (!loaded) return fail('no such game', 404);

  const open = await env.DB.prepare(
    'SELECT seat, name FROM words_seats WHERE code = ? AND kind = ? AND token_hash IS NULL ORDER BY seat LIMIT 1'
  ).bind(code, 'human').first();
  if (!open) return fail('every seat is taken', 409);

  const token = newToken();
  const name = clean(body.name) || open.name;
  const res = await env.DB.prepare(
    'UPDATE words_seats SET token_hash = ?, name = ?, joined_at = ? WHERE code = ? AND seat = ? AND token_hash IS NULL'
  ).bind(await sha256(token), name, Date.now(), code, open.seat).run();
  if ((res.meta?.changes ?? 0) === 0) return fail('that seat was just taken', 409);

  // The seat's display name lives in both places; the state blob is what the
  // board renders from.
  loaded.state.seats[open.seat].name = name;
  loaded.state.seats[open.seat].joined = true;
  await saveGame(env, code, loaded.state, loaded.row.version);

  // Somebody just took a seat, so the player to move may have been waiting.
  await notifyTurn(env, code, loaded.state);

  const fresh = await loadGame(env, code);
  return json({ code, token, seat: open.seat, ...view(fresh.state, open.seat, fresh.row) });
}

async function getGame(request, env, code, url) {
  const loaded = await loadGame(env, code);
  if (!loaded) return fail('no such game', 404);
  const seat = await seatFor(env, code, url.searchParams.get('token'));
  return json(view(loaded.state, seat, loaded.row));
}

async function move(request, env, code) {
  const body = await readJson(request);
  const loaded = await loadGame(env, code);
  if (!loaded) return fail('no such game', 404);

  const seat = await seatFor(env, code, body.token);
  if (seat === null) return fail('not your game', 403);

  // STALENESS IS ABOUT MOVES, NOT WRITES. This used to compare the row's
  // `version`, which is bumped by anything that touches the row — including
  // somebody TAKING A SEAT. The result was that the moment a second player
  // joined, the first player's next move was rejected as stale, every time,
  // for a game that had not moved at all. `ply` counts turns taken, which is
  // the thing that can actually invalidate a move: if no turn has been taken
  // since you looked, the board you played against is the board that is there.
  if (typeof body.ply === 'number' && body.ply !== loaded.state.ply) {
    return json({ error: 'the game moved on', stale: true, ...view(loaded.state, seat, loaded.row) }, 409);
  }

  const dawg = await lexicon(env);
  const state = loaded.state;
  if (!['play', 'pass', 'exchange', 'resign'].includes(body.kind)) return fail('unknown move');
  const res = replayMove(state, seat, body, dawg);
  if (!res.ok) return fail(res.error);

  const entries = res.entry ? [res.entry] : [];
  entries.push(...runBots(state, dawg));

  let saved = await saveGame(env, code, state, loaded.row.version);
  if (!saved) {
    // The row changed under us. If no TURN was taken in the meantime it was a
    // join or a subscription, and this move is still perfectly legal — replay
    // it against the newer state rather than throwing away a real move over a
    // bookkeeping write.
    const fresh = await loadGame(env, code);
    if (fresh && fresh.state.ply === loaded.state.ply) {
      const redo = replayMove(fresh.state, seat, body, dawg);
      if (redo.ok) {
        entries.length = 0;
        if (redo.entry) entries.push(redo.entry);
        entries.push(...runBots(fresh.state, dawg));
        saved = await saveGame(env, code, fresh.state, fresh.row.version);
      }
    }
    if (!saved) {
      const now = await loadGame(env, code);
      return json({ error: 'the game moved on', stale: true, ...view(now.state, seat, now.row) }, 409);
    }
  }
  await logMoves(env, code, entries);
  // Wake whoever is up now. Deliberately awaited rather than fired into the
  // void: a Worker stops executing when its response is returned, so a floating
  // promise here would be cancelled mid-flight about as often as it completed.
  // It is bounded and every failure inside is already swallowed.
  await notifyTurn(env, code, state);

  const fresh = await loadGame(env, code);
  return json({ applied: entries, ...view(fresh.state, seat, fresh.row) });
}

async function hint(request, env, code, url) {
  const loaded = await loadGame(env, code);
  if (!loaded) return fail('no such game', 404);
  const seat = await seatFor(env, code, url.searchParams.get('token'));
  if (seat === null) return fail('not your game', 403);
  const dawg = await lexicon(env);
  const rack = loaded.state.seats[seat].rack;
  return json({ hints: topMoves(loaded.state, rack, dawg, 5) });
}

async function checkWord(env, url) {
  const dawg = await lexicon(env);
  const word = String(url.searchParams.get('word') || '').toUpperCase().replace(/[^A-Z]/g, '');
  return json({ word, valid: word.length >= 2 && dawg.has(word) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (path === '/api/health') {
        assertLayouts();
        const dawg = await lexicon(env);
        return json({
          ok: true,
          words: dawg.wordCount,
          layouts: LAYOUT_IDS.map((id) => ({ id, name: LAYOUTS[id].name, blurb: LAYOUTS[id].blurb })),
          levels: AI_LEVELS,
        });
      }
      if (path === '/api/lexicon') return checkWord(env, url);
      if (path === '/api/cross/clues') return crossClues(env, url);
      if (path === '/api/games' && request.method === 'POST') return createGame(request, env);

      // The public key a browser needs before it can subscribe. Generating it
      // here means the very first visitor provisions it, not a human.
      if (path === '/api/push/key') {
        const { publicKey } = await vapidKeys(env);
        return json({ publicKey });
      }

      const m = path.match(/^\/api\/games\/([A-Z0-9]{5})(?:\/(join|move|hint|subscribe|unsubscribe))?$/);
      if (m) {
        const [, code, action] = m;
        if (action === 'join' && request.method === 'POST') return joinGame(request, env, code);
        if (action === 'move' && request.method === 'POST') return move(request, env, code);
        if (action === 'hint') return hint(request, env, code, url);
        if (action === 'subscribe' && request.method === 'POST') return subscribePush(request, env, code);
        if (action === 'unsubscribe' && request.method === 'POST') return unsubscribePush(request, env, code);
        if (!action && request.method === 'GET') return getGame(request, env, code, url);
      }
      return fail('not found', 404);
    } catch (e) {
      return json({ error: 'server error', detail: String(e?.message || e) }, 500);
    }
  },
};
