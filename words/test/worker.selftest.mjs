#!/usr/bin/env node
// words — worker selftest. Runs the REAL worker against a real database.
//
//   node words/test/worker.selftest.mjs
//
// The sandbox cannot reach Cloudflare, and a worker that has never been
// executed is a worker whose first run is somebody's game. So this stands up
// what it needs instead: node's built-in SQLite behind a thin D1-shaped
// adapter, the actual migration SQL from poll/apps/api/migrations, and the
// ASSETS binding served off the filesystem. `worker.fetch` is then called with
// ordinary Requests.
//
// It is not Cloudflare. `prepare/bind/first/run/all/batch` and `.meta.changes`
// are the parts of D1 this worker uses, and they behave the same; what it
// cannot test is the platform (custom domains, the real D1's consistency).
// What it CAN test is every route, the seat-token authorisation, hidden
// information never leaving the server, the compare-and-set on concurrent
// moves, and the migration actually creating the tables the SQL expects —
// which is where the bugs were.

// node:sqlite landed in Node 22.5. Fail loudly rather than skipping quietly —
// a test that silently does nothing is worse than one that is not there.
let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.error(`words worker selftest needs node:sqlite (Node >= 22.5); this is ${process.version}`);
  process.exit(1);
}

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => { if (cond) pass++; else failures.push(`${name}${detail ? ` — ${detail}` : ''}`); };
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ------------------------------------------------------------- the shims --

/** The slice of D1 this worker uses, over node:sqlite. */
function makeD1(db) {
  const statement = (sql, params = []) => ({
    bind: (...args) => statement(sql, args),
    first: () => db.prepare(sql).get(...params) ?? null,
    all: () => ({ results: db.prepare(sql).all(...params) }),
    run: () => {
      const r = db.prepare(sql).run(...params);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (stmts) => stmts.map((s) => s.run()),
  };
}

/** ASSETS, served off the working tree. */
const ASSETS = {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    try {
      const body = readFileSync(join(ROOT, path.replace(/^\//, '')));
      return new Response(body, { status: 200 });
    } catch {
      return new Response('not found', { status: 404 });
    }
  },
};

const db = new DatabaseSync(':memory:');
// The migration is the one that ships — not a copy, so a column added there
// and forgotten here cannot pass.
db.exec(readFileSync(join(ROOT, '..', 'poll', 'apps', 'api', 'migrations', '0035_words.sql'), 'utf8'));

const { default: worker } = await import('../worker.js');
const env = { DB: makeD1(db), ASSETS };

const call = async (path, init) => {
  const res = await worker.fetch(new Request(`https://words.mino.mobi${path}`, init), env);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const post = (path, body) => call(path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

// ------------------------------------------------------------- the tests --

{
  const { status, body } = await call('/api/health');
  eq('health is 200', status, 200);
  ok('health says ok', body.ok === true);
  eq('health reports the lexicon', body.words, 168551);
  eq('health lists three boards', body.layouts.length, 3);
}
{
  const { body } = await call('/api/lexicon?word=quixotic');
  ok('lexicon accepts a word', body.valid === true);
  const no = await call('/api/lexicon?word=zzzz');
  ok('lexicon refuses a non-word', no.body.valid === false);
  const junk = await call('/api/lexicon?word=<script>');
  eq('lexicon strips junk before echoing it', junk.body.word, 'SCRIPT');
}

// --- a game against a bot ---
let code, token;
{
  const { status, body } = await post('/api/games', {
    layout: 'hazard',
    seats: [{ kind: 'human', name: 'Ada' }, { kind: 'bot', level: 'steady' }],
  });
  eq('create is 200', status, 200);
  code = body.code;
  token = body.token;
  ok('a code comes back', /^[A-Z0-9]{5}$/.test(code || ''), code);
  ok('a token comes back', (token || '').length >= 32);
  eq('the creator is seat 0', body.seat, 0);
  eq('your rack is dealt', body.rack.length, 7);
  eq('the bag is what is left', body.bagCount, 100 - 14);

  // HIDDEN INFORMATION. This is the assertion that matters most in this file.
  const json = JSON.stringify(body);
  ok('the bag order never leaves the server', !('bag' in body));
  ok('the seed never leaves the server', !json.includes('"seed"'));
  ok('no seat carries a rack', body.seats.every((s) => !('rack' in s)));
  eq('opponent tiles are a count', body.seats[1].tiles, 7);
}
{
  const { status, body } = await call(`/api/games/${code}?token=${token}`);
  eq('read is 200', status, 200);
  eq('it is your turn', body.turn, 0);
  eq('you are seat 0', body.you, 0);
  ok('your rack is yours', body.rack.length === 7);
}
{
  // A spectator (no token) sees the board and nobody's tiles.
  const { body } = await call(`/api/games/${code}`);
  eq('a spectator has no seat', body.you, null);
  eq('a spectator has no rack', body.rack.length, 0);
}
{
  // Someone else's token must not move your seat.
  const other = await post('/api/games', { layout: 'fair', seats: [{ kind: 'human' }, { kind: 'bot' }] });
  const { status, body } = await post(`/api/games/${code}/move`, {
    token: other.body.token, kind: 'pass',
  });
  eq('a foreign token is refused', status, 403);
  ok('and says so', /not your game/.test(body.error || ''));
}
{
  const { status } = await post(`/api/games/${code}/move`, { token: 'deadbeef', kind: 'pass' });
  eq('a bogus token is refused', status, 403);
}

// --- play a legal move, and watch the bot answer ---
{
  const before = (await call(`/api/games/${code}?token=${token}`)).body;
  const hint = await call(`/api/games/${code}/hint?token=${token}`);
  eq('hints are 200', hint.status, 200);
  ok('hints come back', hint.body.hints.length > 0);
  const best = hint.body.hints[0];

  const { status, body } = await post(`/api/games/${code}/move`, {
    token, kind: 'play', placements: best.placements, version: before.version,
  });
  eq('a legal play is accepted', status, 200);
  ok('the play is logged', body.history.some((h) => h.kind === 'play' && h.seat === 0));
  ok('it scored', body.seats[0].score > 0, `${body.seats[0].score}`);
  ok('the bot answered in the same request', body.history.length >= 2, `${body.history.length} entries`);
  eq('and it is your turn again', body.turn, 0);
  ok('your rack was refilled', body.rack.length === 7);
  ok('the version moved', body.version > before.version);
  ok('the moves table was written', db.prepare('SELECT COUNT(*) c FROM words_moves WHERE code = ?').get(code).c >= 2);
}
{
  // An illegal play must be refused by the SERVER, not just the client.
  const cur = (await call(`/api/games/${code}?token=${token}`)).body;
  const { status, body } = await post(`/api/games/${code}/move`, {
    token, kind: 'play', version: cur.version,
    placements: [{ i: 0, letter: 'Z' }, { i: 1, letter: 'X' }],
  });
  eq('a floating play is refused', status, 400);
  ok('with a reason', typeof body.error === 'string' && body.error.length > 0, body.error);
}
{
  // Tiles you do not hold.
  const cur = (await call(`/api/games/${code}?token=${token}`)).body;
  const held = new Set(cur.rack);
  const missing = ['Q', 'Z', 'J', 'X', 'K'].find((t) => !held.has(t)) || 'Q';
  const { status } = await post(`/api/games/${code}/move`, {
    token, kind: 'play', version: cur.version,
    placements: [{ i: 112 + 15, letter: missing }],
  });
  eq('playing a tile you do not hold is refused', status, 400);
}
{
  // Compare-and-set: a move quoting a stale version must not land.
  const cur = (await call(`/api/games/${code}?token=${token}`)).body;
  const { status, body } = await post(`/api/games/${code}/move`, {
    token, kind: 'pass', version: cur.version - 1,
  });
  eq('a stale move is refused', status, 409);
  ok('and is marked stale', body.stale === true);
  const after = (await call(`/api/games/${code}?token=${token}`)).body;
  eq('the game did not move', after.version, cur.version);
}

// --- a game between two people ---
{
  const created = await post('/api/games', {
    layout: 'fair', seats: [{ kind: 'human', name: 'Ada' }, { kind: 'human', name: 'Grace' }],
  });
  const two = created.body.code;
  ok('seat 1 is open', created.body.seats[1].joined === false);

  const join = await post(`/api/games/${two}/join`, { name: 'Grace' });
  eq('joining is 200', join.status, 200);
  eq('the joiner gets seat 1', join.body.seat, 1);
  ok('the joiner gets their own token', join.body.token !== created.body.token);
  eq('the joiner sees their own rack', join.body.rack.length, 7);
  ok('the seat is now taken', join.body.seats[1].joined === true);

  const again = await post(`/api/games/${two}/join`, { name: 'Third' });
  eq('a full game refuses another player', again.status, 409);

  // Seat 1 cannot move first.
  const wrong = await post(`/api/games/${two}/move`, { token: join.body.token, kind: 'pass' });
  eq('out-of-turn is refused', wrong.status, 400);
  ok('and says whose turn it is', /not your turn/.test(wrong.body.error || ''), wrong.body.error);

  // And each player's view hides the other's tiles.
  const adaView = await call(`/api/games/${two}?token=${created.body.token}`);
  const graceView = await call(`/api/games/${two}?token=${join.body.token}`);
  ok('the two players hold different racks',
    adaView.body.rack.join('') !== graceView.body.rack.join('')
    || adaView.body.rack.length === 0);
  eq('each sees their own seat', adaView.body.you, 0);
  eq('and the other sees theirs', graceView.body.you, 1);
}

// --- shapes the API must refuse ---
{
  eq('unknown route is 404', (await call('/api/nope')).status, 404);
  eq('unknown game is 404', (await call('/api/games/ZZZZZ')).status, 404);
  eq('no seats is refused', (await post('/api/games', { seats: [] })).status, 400);
  eq('five seats is refused', (await post('/api/games', { seats: Array(5).fill({ kind: 'human' }) })).status, 400);
  eq('a table of bots is refused', (await post('/api/games', { seats: [{ kind: 'bot' }, { kind: 'bot' }] })).status, 400);
  const junkLayout = await post('/api/games', { layout: '../etc/passwd', seats: [{ kind: 'human' }] });
  eq('an unknown board falls back rather than failing', junkLayout.status, 200);
  eq('...to the default', junkLayout.body.layout, 'hazard');
  const junkMove = await post(`/api/games/${code}/move`, { token, kind: 'nonsense' });
  eq('an unknown move kind is refused', junkMove.status, 400);
}
{
  // A solitaire game against nobody still works, and bots that lead move first.
  const solo = await post('/api/games', { seats: [{ kind: 'bot', level: 'sharp' }, { kind: 'human', name: 'Ada' }] });
  eq('a bot in seat 0 has already moved', solo.body.turn, 1);
  ok('and it is in the log', solo.body.history.length >= 1);
}
{
  // Static assets still serve through the worker.
  const res = await worker.fetch(new Request('https://words.mino.mobi/manifest.webmanifest'), env);
  eq('the manifest serves', res.status, 200);
  const sw = await worker.fetch(new Request('https://words.mino.mobi/sw.js'), env);
  eq('the service worker serves', sw.status, 200);
}

console.log(`words worker selftest: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
