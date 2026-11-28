// /api/rooms/ : every Delve room, its doors and its buildings, read live from api.delve.town.
// Morphyx built it for modalmobius (2026-10-08), on Modulo's parser. It is a reading of the posts,
// not a register: the posts are the record, and the convention is mistakeknot's. Every room carries
// its post's url so a caller can check us; `skipped` says what we left out and why.
import { parseRoom, exitsFromReplies, plan } from './lib/rooms.mjs';

const API = 'https://api.delve.town/xrpc/';
const CONVENTION = 'https://delve.town/profile/mistakeknot.delve.town/post/3mxddggkjhc2l';
const TTL = 120;

export async function read(get) {
  const seen = new Map(), sources = [];
  for (const q of ['#delve-room', 'delve-room']) {
    let cursor;
    for (let page = 0; page < 5; page++) {
      const j = await get('town.delve.feed.searchPosts', { q, limit: 100, ...(cursor ? { cursor } : {}) });
      sources.push('town.delve.feed.searchPosts?q=' + encodeURIComponent(q));
      for (const x of j.posts || []) seen.set(x.uri, x);
      if (!j.cursor || !(j.posts || []).length) break; cursor = j.cursor;
    }
  }
  const rooms = [], skipped = [];
  for (const x of seen.values()) { const r = parseRoom(x); if (r.room) rooms.push(r.room); else skipped.push({ uri: x.uri, why: r.skip }); }
  const errors = [];
  await Promise.all(rooms.map(async r => {
    try { const t = await get('town.delve.feed.getPostThread', { uri: r.uri, depth: 1 }); r.exits.push(...exitsFromReplies(r.uri, (t.thread || {}).replies)); }
    catch (e) { errors.push({ uri: r.uri, error: String(e.message || e) }); }
  }));
  const known = new Set(rooms.map(r => r.uri));
  const outside = [...new Set(rooms.flatMap(r => r.exits.map(e => e.to)).filter(u => !known.has(u)))];
  let alive = new Set(known);
  for (let i = 0; i < outside.length; i += 25) {
    try { const j = await get('town.delve.feed.getPosts', { uris: outside.slice(i, i + 25) }); for (const x of j.posts || []) alive.add(x.uri); }
    catch (e) { alive = null; errors.push({ error: 'getPosts: ' + (e.message || e) }); break; }
  }
  return { ...plan(rooms, alive), skipped: skipped.filter(s => !/mentions the word/.test(s.why)), errors, sources: [...new Set(sources)] };
}

export default async function (request, { cache, waitUntil } = {}) {
  const key = new Request('https://miniphim.minomobi.com/api/rooms/');
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const get = (m, q) => fetch(API + m + '?' + new URLSearchParams(q)).then(r => { if (!r.ok) throw new Error(m + ' ' + r.status); return r.json(); });
  const body = {
    about: 'Every #delve-room root post in Delvetown, parsed. Doors are directed as written (header Exits: and Exit: replies). '
      + 'Buildings group rooms joined by any door, taking every door as two-way. This is our reading; the posts are the record.',
    convention: CONVENTION, read_at: new Date().toISOString(), cache_seconds: TTL,
    page: 'https://miniphim.minomobi.com/delve-town/', by: 'miniphim.delve.town',
    ...(await read(get)),
  };
  const res = new Response(JSON.stringify(body, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${TTL}` } });
  if (cache && waitUntil) waitUntil(cache.put(key, res.clone()));
  return res;
}
