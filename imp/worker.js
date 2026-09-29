// imp — the static site, plus two small jobs: where model-written code may run,
// and the build-a-bot A/B ballot.
//
// 1. /ab/ holds blinded build-a-bot sites for the A/B vote (bakeoff/buildabot/):
//    HTML written by a model for a stranger's request. Code like that must never
//    run on a *.mino.mobi origin, which is SAME-SITE with auth.mino.mobi — the SSO
//    cookie (Domain=.mino.mobi, SameSite=Lax) rides on its fetches, and the auth
//    worker trusts any *.mino.mobi origin, so a tenant page there could act as the
//    signed-in user. So /ab/ is served ONLY from imp.minomobi.com: a different
//    registrable domain, exactly as production serves tenants from minomobi.com.
//    Cross-site, the Lax cookie is never sent. The pages run with a normal origin
//    (localStorage works, as in production) under production's lab CSP. On
//    imp.mino.mobi, /ab/* redirects there; on imp.minomobi.com, everything that is
//    not /ab/ (or the kit) redirects back.
//
// 2. /api/ballot/* stores the vote (imp.mino.mobi/vote/). Identity comes from the
//    shared sign-in: the request's SSO cookie or Bearer token is shown to the auth
//    worker (service binding AUTH → mino-auth, /api/me), and only the DIDs in
//    VOTERS may write. Votes live in one Durable Object (SQLite). A voter SEALS a
//    run when done; a sealed run is frozen and its votes become public at
//    /api/ballot/results?run=…, which is how the result is read without anyone
//    else signing in. Writes must come from the imp.mino.mobi origin.
import { DurableObject } from 'cloudflare:workers';

const TENANT_HOST = 'imp.minomobi.com';
const HOME_HOST = 'imp.mino.mobi';

// scripts/lib/headless.mjs CSP (production's), verbatim.
const LAB_CSP = [
  "default-src 'none'",
  "script-src 'self' https://minomobi.com https://lab.minomobi.com 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' https://minomobi.com https://lab.minomobi.com 'unsafe-inline'",
  "img-src 'self' https://minomobi.com https://lab.minomobi.com data: blob: https://cdn.bsky.app",
  "font-src 'self' https://minomobi.com https://lab.minomobi.com",
  "connect-src 'self' https://minomobi.com https://lab.minomobi.com https://auth.mino.mobi https://public.api.bsky.app https://plc.directory https://*.host.bsky.network",
  "media-src 'self' https://minomobi.com https://lab.minomobi.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self' https://minomobi.com https://lab.minomobi.com",
  "frame-src 'self' https://minomobi.com https://lab.minomobi.com",
  "object-src 'none'",
].join('; ');

const RUN_RE = /^ab-[a-z0-9-]{1,40}$/;
const PAIR_RE = /^p\d{2,3}$/;
const PICKS = new Set(['a', 'b', 'tie']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ab = url.pathname === '/ab' || url.pathname.startsWith('/ab/');

    if (url.hostname !== TENANT_HOST && url.pathname.startsWith('/api/ballot/')) return ballotApi(request, env, url);

    if (url.hostname === TENANT_HOST && url.pathname.startsWith('/_kit/')) {
      return withLabHeaders(await env.ASSETS.fetch(new Request(new URL(`/ab${url.pathname}`, url), request)));
    }
    if (url.hostname === TENANT_HOST && !ab) return Response.redirect(`https://${HOME_HOST}${url.pathname}${url.search}`, 302);
    if (url.hostname !== TENANT_HOST && ab) return Response.redirect(`https://${TENANT_HOST}${url.pathname}${url.search}`, 302);

    // Tenant pages link the factory kit as ../_kit/ (from /ab/<run>/<pair>/) or
    // /_kit/ (production's root). One copy lives at /ab/_kit/.
    let res;
    const kit = url.pathname.match(/^\/ab\/[^/]+\/_kit\/(.*)$/);
    if (kit && url.hostname === TENANT_HOST) res = await env.ASSETS.fetch(new Request(new URL(`/ab/_kit/${kit[1]}`, url), request));
    else res = await env.ASSETS.fetch(request);
    if (!ab) return res;
    return withLabHeaders(res);
  },
};

function withLabHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set('Content-Security-Policy', LAB_CSP);
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Who is this? Asks the auth worker with the caller's own credentials.
async function whoami(request, env) {
  const headers = new Headers();
  for (const h of ['Cookie', 'Authorization']) if (request.headers.get(h)) headers.set(h, request.headers.get(h));
  if (![...headers.keys()].length) return null;
  const r = await env.AUTH.fetch(new Request('https://auth.mino.mobi/api/me', { headers }));
  if (!r.ok) return null;
  const me = await r.json().catch(() => null);
  return me?.did ? { did: me.did, handle: me.handle } : null;
}

async function ballotApi(request, env, url) {
  const store = env.BALLOT.get(env.BALLOT.idFromName('ballot'));
  const voters = new Set(String(env.VOTERS || '').split(',').map((s) => s.trim()).filter(Boolean));
  const path = url.pathname.slice('/api/ballot/'.length);
  const run = url.searchParams.get('run') || '';

  // public, and only for a sealed run
  if (path === 'results' && request.method === 'GET') {
    if (!RUN_RE.test(run)) return json({ error: 'bad run' }, 400);
    return json(await (await store.fetch(`https://ballot/results?run=${run}`)).json());
  }

  const me = await whoami(request, env);
  if (path === 'me' && request.method === 'GET') return json({ ...(me || {}), signedIn: !!me, voter: !!me && voters.has(me.did) });
  if (!me) return json({ error: 'not signed in' }, 401);
  if (!voters.has(me.did)) return json({ error: 'this ballot has one voter, and it is not this account' }, 403);

  if (path === 'votes' && request.method === 'GET') {
    if (!RUN_RE.test(run)) return json({ error: 'bad run' }, 400);
    return json(await (await store.fetch(`https://ballot/votes?run=${run}`)).json());
  }
  if ((path === 'vote' || path === 'seal') && request.method === 'POST') {
    let from = '';
    try { from = new URL(request.headers.get('Origin') || '').host; } catch {}
    if (from !== HOME_HOST) return json({ error: 'writes come from the ballot page only' }, 403);
    const body = await request.json().catch(() => null);
    if (!body || !RUN_RE.test(body.run || '')) return json({ error: 'bad run' }, 400);
    if (path === 'vote') {
      if (!PAIR_RE.test(body.pair || '')) return json({ error: 'bad pair' }, 400);
      if (body.pick != null && !PICKS.has(body.pick)) return json({ error: 'bad pick' }, 400);
      if (body.note != null && (typeof body.note !== 'string' || body.note.length > 4000)) return json({ error: 'bad note' }, 400);
    }
    const r = await store.fetch(`https://ballot/${path}`, { method: 'POST', body: JSON.stringify({ ...body, did: me.did }) });
    return json(await r.json(), r.status);
  }
  return json({ error: 'not found' }, 404);
}

// One instance holds every vote. Tiny data, one writer: SQLite in a Durable Object.
export class Ballot extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS votes (run TEXT, pair TEXT, did TEXT, pick TEXT, note TEXT, at TEXT, PRIMARY KEY (run, pair, did))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS seals (run TEXT, did TEXT, at TEXT, PRIMARY KEY (run, did))`);
  }

  sealed(run) {
    return this.sql.exec(`SELECT did, at FROM seals WHERE run = ?`, run).toArray();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const reply = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    const run = url.searchParams.get('run');

    if (url.pathname === '/votes') {
      const rows = this.sql.exec(`SELECT pair, pick, note, at FROM votes WHERE run = ?`, run).toArray();
      return reply({ run, sealed: this.sealed(run), votes: Object.fromEntries(rows.map((r) => [r.pair, { pick: r.pick, note: r.note, at: r.at }])) });
    }
    if (url.pathname === '/results') {
      const seals = this.sealed(run);
      if (!seals.length) return reply({ run, sealed: false, note: 'This run has not been sealed; its votes stay private until the voter seals it.' });
      const rows = this.sql.exec(`SELECT pair, pick, note, at FROM votes WHERE run = ? AND did IN (SELECT did FROM seals WHERE run = ?) ORDER BY pair`, run, run).toArray();
      return reply({ run, sealed: true, sealed_at: seals.map((s) => s.at), votes: rows });
    }
    const body = await request.json();
    if (this.sealed(body.run).some((s) => s.did === body.did)) return reply({ error: 'this run is sealed' }, 409);
    const at = new Date().toISOString();
    if (url.pathname === '/vote') {
      this.sql.exec(
        `INSERT INTO votes (run, pair, did, pick, note, at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (run, pair, did) DO UPDATE SET pick = excluded.pick, note = excluded.note, at = excluded.at`,
        body.run, body.pair, body.did, body.pick ?? null, body.note ?? '', at,
      );
      return reply({ ok: true, at });
    }
    if (url.pathname === '/seal') {
      this.sql.exec(`INSERT OR IGNORE INTO seals (run, did, at) VALUES (?, ?, ?)`, body.run, body.did, at);
      return reply({ ok: true, sealed_at: at });
    }
    return reply({ error: 'not found' }, 404);
  }
}
