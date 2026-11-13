// hyperball's worker: the static site (ASSETS), plus two small routes on this origin.
//   /avatar/<did>   a Bluesky avatar, re-served from here. cdn.bsky.app sends no CORS header, so a page can show an
//                   avatar in an <img> but WebGL can't texture it; from this origin it can. The DID is resolved with
//                   app.bsky.actor.getProfile on the public AppView, the thumbnail fetched, cached a day. No avatar: 404
//                   (the game draws one of its own).
//   /xrpc/app.bsky.actor.{searchActorsTypeahead,getProfile}   forwarded to the public AppView, for the sign-in
//                   field's handle typeahead (packages/oauth-client/typeahead.js, gateway = this origin).
//   POST /api/rooms           a fresh room code: { code } (4 of A–Z 2–9, no I O 0 1)
//   GET  /api/rooms/CODE/ws   the room's websocket: a Durable Object (room.js, HyperballRoom) per code
// Everything else is the static site. Sign-in itself is auth.mino.mobi's (it allows every *.mino.mobi origin).
const API = 'https://public.api.bsky.app';
export const DID = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.%-]+)$/;
import { CODE } from './js/room-core.js';
export { HyperballRoom } from './room.js';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = (rnd = Math.random) => Array.from({ length: 4 }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join('');
const XRPC = new Set(['app.bsky.actor.searchActorsTypeahead', 'app.bsky.actor.getProfile']);

export async function handle(request, env = {}, ctx = {}, f = (...a) => fetch(...a), cache = globalThis.caches?.default) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.startsWith('/avatar/')) return avatar(decodeURIComponent(url.pathname.slice(8)), request, ctx, f, cache);
  if (url.pathname === '/api/rooms' && request.method === 'POST') return Response.json({ code: newCode() }, { headers: { 'cache-control': 'no-store' } });
  const rm = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
  if (rm) {
    const code = rm[1].toUpperCase();
    if (!CODE.test(code)) return new Response('no such room code', { status: 400 });
    if (!env.ROOM) return new Response('rooms are not configured here', { status: 503 });
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(new Request(`https://room/api/rooms/${code}/ws`, request));
  }
  if (request.method === 'GET' && url.pathname.startsWith('/xrpc/')) {
    const method = url.pathname.slice(6);
    if (!XRPC.has(method)) return new Response('not here', { status: 404 });
    const r = await f(`${API}/xrpc/${method}${url.search}`, { headers: { accept: 'application/json' } });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } });
  }
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response('not found', { status: 404 });
}

async function avatar(did, request, ctx, f, cache) {
  if (!DID.test(did)) return new Response('a DID, please', { status: 400 });
  if (cache) { const hit = await cache.match(request); if (hit) return hit; }
  const p = await f(`${API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, { headers: { accept: 'application/json' } });
  if (!p.ok) return new Response('no such profile', { status: 404 });
  const prof = await p.json();
  if (!prof.avatar) return new Response('no avatar', { status: 404, headers: { 'cache-control': 'public, max-age=3600' } });
  const img = await f(String(prof.avatar).replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/'));
  if (!img.ok) return new Response('avatar unavailable', { status: 502 });
  const res = new Response(img.body, { status: 200, headers: { 'content-type': img.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
  if (cache && ctx.waitUntil) ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

export default { fetch: (request, env, ctx) => handle(request, env, ctx) };
