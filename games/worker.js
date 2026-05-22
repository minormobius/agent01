// games.mino.mobi — a party-game platform on top of OAuth + a Durable Object.
//
// Surfaces:
//   GET  /                       lobby page (asset)
//   GET  /play.html              room page  (asset)
//   GET  /api/games              list of compiled-game manifests
//   POST /api/rooms              { gameId } -> { code }
//   GET  /api/rooms/:code        room snapshot (for refresh / share preview)
//   GET  /api/rooms/:code/ws     websocket -> RoomCoordinator DO
//
// Auth: phone players hit auth.mino.mobi via packages/oauth-client/auth.js,
// then connect with ?sid=<bearer>. The DO validates the token against
// auth.mino.mobi/api/me on connect.

import { compileGame, listTemplates } from './engine/runtime.js';
export { RoomCoordinator } from './room.js';

const AUTH_BASE = 'https://auth.mino.mobi';
const GAME_DIR = '/games/';

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });
}

function makeCode() {
  // 4-char code, ambiguity-free alphabet (no 0/O, 1/I/L).
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

async function listGames(env) {
  // Catalog lives in /games/index.json — committed alongside the .md files.
  // The ASSETS binding doesn't expose a directory listing, so we maintain
  // a tiny index file. (Pros: deterministic, cacheable. Cons: one more
  // file to keep in sync — worth it for now.)
  const res = await env.ASSETS.fetch(new Request('https://games.mino.mobi/games/index.json'));
  if (!res.ok) return [];
  const list = await res.json();
  return list;
}

async function loadGameMd(env, gameId) {
  const safe = gameId.replace(/[^A-Za-z0-9_\-]/g, '');
  if (!safe) return null;
  const url = `https://games.mino.mobi${GAME_DIR}${safe}.md`;
  const res = await env.ASSETS.fetch(new Request(url));
  if (!res.ok) return null;
  return await res.text();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API ---
    if (path === '/api/health') {
      return json({ ok: true, templates: listTemplates() });
    }

    if (path === '/api/games' && request.method === 'GET') {
      const games = await listGames(env);
      return json({ games });
    }

    if (path === '/api/rooms' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const gameId = String(body.gameId || '');
      const md = await loadGameMd(env, gameId);
      if (!md) return json({ error: 'unknown game' }, 404);
      let compiled;
      try {
        compiled = compileGame(md);
      } catch (e) {
        return json({ error: 'compile failed', detail: String(e.message || e) }, 400);
      }
      // Generate code; collisions are rare but loop a few times to be safe.
      // Don't pre-init the DO — it'll boot on first websocket connect.
      const code = makeCode();
      // Pass the compiled game to the DO via the create call.
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      const init = await stub.fetch('https://room/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, gameId, game: compiled }),
      });
      if (!init.ok) {
        const detail = await init.text();
        return json({ error: 'room init failed', detail }, 500);
      }
      return json({ code, gameId, name: compiled.meta.name });
    }

    const roomMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{4})(?:\/([a-z]+))?$/);
    if (roomMatch) {
      const code = roomMatch[1];
      const sub = roomMatch[2];
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      if (sub === 'ws') {
        return stub.fetch(request);
      }
      if (!sub && request.method === 'GET') {
        return stub.fetch('https://room/snapshot');
      }
      return json({ error: 'not found' }, 404);
    }

    // --- Static assets fallback ---
    return env.ASSETS.fetch(request);
  },
};

export { AUTH_BASE };
