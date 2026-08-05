// words.mino.mobi — the server for asynchronous games.
//
//   GET  /api/health                     lexicon + layouts, and proof the DAWG loaded
//   POST /api/games                      create a game -> { code, token, state }
//   POST /api/games/:code/join           take a free seat -> { token, seat, state }
//   GET  /api/games/:code?token=         the position, redacted for that seat
//   POST /api/games/:code/move           play / pass / exchange / resign
//   GET  /api/games/:code/hint?token=    the best plays for YOUR rack
//   GET  /api/lexicon?word=              is it a word
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

const MAX_BODY = 64 * 1024;
/** A four-player game can have three bots in a row waiting on one human move. */
const MAX_BOT_TURNS = 12;

let DAWG = null;

/** Load the lexicon once per isolate and keep it — it is ~475 KiB of Uint32. */
async function lexicon(env) {
  if (DAWG) return DAWG;
  const res = await env.ASSETS.fetch(new Request('https://words.mino.mobi/dict/lexicon.dawg'));
  if (!res.ok) throw new Error(`lexicon asset missing (${res.status})`);
  DAWG = new Dawg(new Uint8Array(await res.arrayBuffer()));
  return DAWG;
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
  if (typeof body.version === 'number' && body.version !== loaded.row.version) {
    return json({ error: 'the game moved on', stale: true, ...view(loaded.state, seat, loaded.row) }, 409);
  }

  const dawg = await lexicon(env);
  const state = loaded.state;
  let res;
  switch (body.kind) {
    case 'play': {
      const placements = Array.isArray(body.placements) ? body.placements.map((p) => ({
        i: Number(p.i), letter: String(p.letter || '').toUpperCase().slice(0, 1), blank: !!p.blank,
      })) : [];
      res = applyPlay(state, seat, placements, dawg);
      break;
    }
    case 'pass':     res = applyPass(state, seat); break;
    case 'exchange': res = applyExchange(state, seat, (body.tiles || []).map((t) => String(t).toUpperCase().slice(0, 1))); break;
    case 'resign':   res = applyResign(state, seat); break;
    default: return fail('unknown move');
  }
  if (!res.ok) return fail(res.error);

  const entries = res.entry ? [res.entry] : [];
  entries.push(...runBots(state, dawg));

  const saved = await saveGame(env, code, state, loaded.row.version);
  if (!saved) {
    // Somebody moved between our read and our write. The move is NOT applied —
    // the client re-reads and decides again, which is the honest outcome.
    const fresh = await loadGame(env, code);
    return json({ error: 'the game moved on', stale: true, ...view(fresh.state, seat, fresh.row) }, 409);
  }
  await logMoves(env, code, entries);

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
      if (path === '/api/games' && request.method === 'POST') return createGame(request, env);

      const m = path.match(/^\/api\/games\/([A-Z0-9]{5})(?:\/(join|move|hint))?$/);
      if (m) {
        const [, code, action] = m;
        if (action === 'join' && request.method === 'POST') return joinGame(request, env, code);
        if (action === 'move' && request.method === 'POST') return move(request, env, code);
        if (action === 'hint') return hint(request, env, code, url);
        if (!action && request.method === 'GET') return getGame(request, env, code, url);
      }
      return fail('not found', 404);
    } catch (e) {
      return json({ error: 'server error', detail: String(e?.message || e) }, 500);
    }
  },
};
