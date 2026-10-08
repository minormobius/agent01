// miniphim-bots — the miniphim's bot accounts (the person, 2026-10-07: "we would set it up, set up the
// cron, but they configure the action").
//
// A bot is a Delvetown account the person made, driven by code the souls wrote: house/bots/<name>.mjs
// in their commons, shipped to bots/ (generated, like api/) only with a passing test and two parts'
// signatures (packages/whetstone/lib/house.mjs planBots). Every five minutes the cron wakes the one
// Durable Object, which runs each bot that is due:
//
//   - signs in with the password the person put in GitHub as BOT_<NAME>_PASSWORD (synced to this
//     worker's secrets by deploy-miniphim.yml) and keeps the session in its own storage, refreshing
//     it rather than signing in every tick;
//   - sets the profile whenever the shipped digest changes: the souls' displayName, description and
//     picture, and Delvetown's bot self-label, always;
//   - calls the tick with an agent that holds the session out of the tick's reach and writes only
//     to the bot's own repo; keeps the state the tick returns, privately, in its own storage.
//
// No posting cap (the person). Two rails against a broken loop: 60 s and 100 writes a tick.
// THE OFF SWITCH is the house's: deploy-miniphim.yml passes miniphim/wrangler.jsonc's OPEN here.
// GET /_bots/ on miniphim.minomobi.com shows what each bot did; it never shows state or secrets.
import bots from './bots/index.mjs';
import soulFeeds from './feeds/index.mjs';
import labFeeds from './lab-feeds/index.mjs';

// Feeds (2026-10-08, the person: "build it"): Delvetown's AppView asks a feed's service for a skeleton,
// a list of post URIs, the same way Bluesky's does. This worker is that service for miniphim.minomobi.com:
// it answers /.well-known/did.json (did:web:miniphim.minomobi.com, with a #bsky_fg service), and
// town.delve.feed.describeFeedGenerator and town.delve.feed.getFeedSkeleton under /xrpc/. A feed is a
// module: default export skeleton({ store, cursor, limit, feed }) -> { feed: [{ post }], cursor? }, and an
// optional refresh({ store, now }) that runs on the cron (every `every` minutes, default 5) with the
// feed's own private storage. The souls' come from house/feeds/ (a test and two signatures, like a bot);
// the lab's from lab-feeds/. A feed is listed by a town.delve.feed.generator record (rkey = its name)
// whose "did" is FEED_DID; the souls write that record in their own repo.
export const HOST = 'miniphim.minomobi.com';
export const FEED_DID = `did:web:${HOST}`;
export const MINIPHIM_DID = 'did:plc:a3vq3hjlkz2nbf67bpv5z6qs';
export const FEEDS = { ...labFeeds, ...soulFeeds };
export const FEED_MS = 25_000;
export const didDoc = () => ({ '@context': ['https://www.w3.org/ns/did/v1'], id: FEED_DID,
  service: [{ id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: `https://${HOST}` }] });
const race = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} took more than ${ms / 1000} s`)), ms))]);

export const PDS = 'https://pds.delve.town';
export const APPVIEW_PROXY = 'did:web:api.delve.town#bsky_appview';
export const ALLOWED_HOSTS = ['plc.directory', 'public.api.bsky.app', 'api.delve.town', 'pds.delve.town'];
export const TICK_MS = 60_000, WRITES = 100, STATE_MAX = 100_000;
const PROFILE = 'town.delve.actor.profile', POST = 'town.delve.feed.post';
const BOT_LABEL = { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'bot' }] };

// The same rule as the house: https to the council's hosts only, no redirects.
let net = globalThis.fetch;
export const _setNet = (f) => { net = f; }; // the selftest's fake network; nothing else calls it
export function guardedFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) {
    return Promise.reject(new Error(`miniphim: fetch to ${url.hostname} is not allowed (only ${ALLOWED_HOSTS.join(', ')})`));
  }
  // Workers has no redirect: 'error'; 'manual' plus a check refuses a redirect the same way.
  return net(input, { ...init, redirect: 'manual' }).then((r) => {
    if (r.status >= 300 && r.status < 400) throw new Error(`miniphim: ${url.hostname} answered a redirect (${r.status}); redirects are refused`);
    return r;
  });
}
globalThis.fetch = guardedFetch;

async function xrpc(nsid, { method = 'GET', params, body, token, bytes, type, proxy } = {}) {
  const url = new URL(`${PDS}/xrpc/${nsid}`);
  for (const [k, v] of Object.entries(params || {})) for (const x of [].concat(v)) url.searchParams.append(k, String(x));
  const r = await globalThis.fetch(url, { signal: AbortSignal.timeout(20_000), method, headers: {
    ...(method === 'POST' ? { 'content-type': bytes ? type : 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(proxy ? { 'atproto-proxy': proxy } : {}) },
    body: method === 'POST' ? (bytes || JSON.stringify(body || {})) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${nsid}: ${r.status} ${j.error || ''} ${j.message || ''}`.trim()), { status: r.status, code: j.error });
  return j;
}

const enc = new TextEncoder();
const byteAt = (s, i) => enc.encode(s.slice(0, i)).length;
export function linkFacets(text) {
  return [...String(text).matchAll(/https?:\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#][^\s<>"']*)?/gi)].map((m) => {
    const u = m[0].replace(/[.,;:!?)\]]+$/, '');
    return { $type: 'town.delve.richtext.facet', index: { byteStart: byteAt(text, m.index), byteEnd: byteAt(text, m.index + u.length) }, features: [{ $type: 'town.delve.richtext.facet#link', uri: u }] };
  });
}
async function mentionFacets(text, resolve) {
  const out = [];
  for (const m of String(text).matchAll(/(^|[\s(])@([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)) {
    const start = m.index + m[1].length, end = start + 1 + m[2].length;
    const did = await resolve(m[2].toLowerCase()).catch(() => null);
    if (did) out.push({ $type: 'town.delve.richtext.facet', index: { byteStart: byteAt(text, start), byteEnd: byteAt(text, end) }, features: [{ $type: 'town.delve.richtext.facet#mention', did }] });
  }
  return out;
}

// The agent a tick gets. The session token lives in this closure, never on the object; every write
// names the bot's own repo, whatever the tick passes.
export function makeAgent({ did, handle, token, call = xrpc, log = [], now = () => new Date().toISOString() }) {
  let writes = 0;
  const write = async (nsid, body) => {
    if (++writes > WRITES) throw new Error(`more than ${WRITES} writes in one tick`);
    const r = await call(nsid, { method: 'POST', token, body: { ...body, repo: did } });
    log.push({ op: nsid.split('.').pop(), uri: r.uri || null, collection: body.collection || null });
    return r;
  };
  const OPS = {
    createRecord: (a) => write('com.atproto.repo.createRecord', a),
    putRecord: (a) => write('com.atproto.repo.putRecord', a),
    deleteRecord: (a) => write('com.atproto.repo.deleteRecord', a),
    applyWrites: (a) => write('com.atproto.repo.applyWrites', a),
    getRecord: (a) => call('com.atproto.repo.getRecord', { params: { ...a, repo: did } }),
    listRecords: (a) => call('com.atproto.repo.listRecords', { params: { ...a, repo: did } }),
    uploadBlob: async ({ bytes, type }) => {
      if (++writes > WRITES) throw new Error(`more than ${WRITES} writes in one tick`);
      return call('com.atproto.repo.uploadBlob', { method: 'POST', token, bytes, type });
    },
  };
  return Object.freeze({
    did, handle,
    async repo(op, args = {}) {
      if (!OPS[op]) throw new Error(`agent.repo: ${op} is not one of ${Object.keys(OPS).join(', ')}`);
      return OPS[op](args);
    },
    async read(nsid, params = {}) {
      if (!/^town\.delve\.[a-zA-Z.]+$/.test(nsid) && nsid !== 'com.atproto.identity.resolveHandle') throw new Error(`agent.read: ${nsid} is not a town.delve.* query`);
      return call(nsid, { params, token, proxy: nsid.startsWith('town.delve.') ? APPVIEW_PROXY : undefined });
    },
    async post(text, { reply, embed, langs = ['en'], facets } = {}) {
      text = String(text);
      const f = facets || [...linkFacets(text), ...await mentionFacets(text, async (h) => (await call('com.atproto.identity.resolveHandle', { params: { handle: h } })).did)]
        .sort((a, b) => a.index.byteStart - b.index.byteStart);
      const record = { $type: POST, text, createdAt: now(), langs, ...(f.length ? { facets: f } : {}), ...(reply ? { reply } : {}), ...(embed ? { embed } : {}) };
      return write('com.atproto.repo.createRecord', { collection: POST, record });
    },
  });
}

export const due = (bot, last, nowMs) => !last || nowMs - Date.parse(last) >= bot.every * 60_000 - 60_000;
const b64bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export class Bots {
  constructor(ctx, env, list = bots, feeds = FEEDS) { this.ctx = ctx; this.env = env; this.bots = list; this.feeds = feeds; }

  // A feed's own corner of this object's storage: nothing else reads or writes it.
  store(name) {
    const pre = `feed:${name}:`, st = this.ctx.storage;
    return {
      get: (k) => st.get(pre + k), put: (k, v) => st.put(pre + k, v), delete: (k) => st.delete(pre + k),
      list: async (prefix = '') => [...(await st.list({ prefix: pre + prefix }))].map(([k, v]) => [k.slice(pre.length), v]),
    };
  }

  async skeleton(name, cursor, limit, feedUri) {
    const f = this.feeds[name];
    if (!f) return { status: 400, body: { error: 'UnknownFeed', message: `no feed ${name}` } };
    const out = await race(f.mod.default({ store: this.store(name), cursor: cursor || undefined, limit, feed: feedUri }), FEED_MS, `feed ${name}`);
    const items = (out?.feed || []).filter((x) => typeof x?.post === 'string' && x.post.startsWith('at://')).slice(0, limit).map((x) => ({ post: x.post }));
    return { status: 200, body: { feed: items, ...(out?.cursor ? { cursor: String(out.cursor) } : {}) } };
  }

  async refreshFeeds(now) {
    for (const [name, f] of Object.entries(this.feeds)) {
      if (typeof f.mod.refresh !== 'function') continue;
      const st = (await this.ctx.storage.get(`feedstatus:${name}`)) || {};
      const every = Math.max(5, Number(f.mod.every) || 5);
      if (st.last_refresh && Date.parse(now) - Date.parse(st.last_refresh) < every * 60_000 - 60_000) continue;
      const rec = { ...st, last_refresh: now };
      try { rec.result = await race(f.mod.refresh({ store: this.store(name), now }), FEED_MS, `refresh ${name}`); rec.last_ok = now; rec.last_error = null; }
      catch (e) { rec.last_error = String(e?.message || e).slice(0, 400); }
      await this.ctx.storage.put(`feedstatus:${name}`, rec);
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/feed') {
      const p = url.searchParams, limit = Math.min(100, Math.max(1, Number(p.get('limit')) || 50));
      try { const r = await this.skeleton(p.get('name'), p.get('cursor'), limit, p.get('feed')); return Response.json(r.body, { status: r.status }); }
      catch (e) { return Response.json({ error: 'FeedFailed', message: String(e?.message || e).slice(0, 300) }, { status: 500 }); }
    }
    if (url.pathname === '/tick') {
      try { return Response.json(await this.tick(url.searchParams.get('now') || new Date().toISOString())); }
      catch (e) { await this.ctx.storage.put('cron:error', { at: new Date().toISOString(), error: String(e?.stack || e).slice(0, 600) }); throw e; }
    }
    return Response.json(await this.status());
  }

  async session(name, bot, password) {
    const key = `session:${name}`, s = await this.ctx.storage.get(key);
    if (s && s.password === await sha(password) && Date.now() - s.at < 90 * 60_000) return s;
    let fresh = null;
    if (s?.refresh && s.password === await sha(password)) {
      try { fresh = await xrpc('com.atproto.server.refreshSession', { method: 'POST', token: s.refresh }); } catch { fresh = null; }
    }
    if (!fresh) fresh = await xrpc('com.atproto.server.createSession', { method: 'POST', body: { identifier: bot.profile.handle, password } });
    if (fresh.handle && fresh.handle !== bot.profile.handle) throw new Error(`the password is for ${fresh.handle}, not ${bot.profile.handle}`);
    const out = { did: fresh.did, handle: fresh.handle || bot.profile.handle, access: fresh.accessJwt, refresh: fresh.refreshJwt, at: Date.now(), password: await sha(password) };
    await this.ctx.storage.put(key, out);
    return out;
  }

  async syncProfile(bot, s) {
    let cur = null;
    try { cur = await xrpc('com.atproto.repo.getRecord', { params: { repo: s.did, collection: PROFILE, rkey: 'self' } }); } catch (e) { if (e.status !== 400 && e.status !== 404) throw e; }
    const rec = { ...(cur?.value || {}), $type: PROFILE, displayName: bot.profile.displayName, description: bot.profile.description, labels: BOT_LABEL };
    if (bot.avatar) rec.avatar = (await xrpc('com.atproto.repo.uploadBlob', { method: 'POST', token: s.access, bytes: b64bytes(bot.avatar), type: 'image/png' })).blob;
    await xrpc('com.atproto.repo.putRecord', { method: 'POST', token: s.access, body: { repo: s.did, collection: PROFILE, rkey: 'self', record: rec, ...(cur?.cid ? { swapRecord: cur.cid } : {}) } });
  }

  async tick(now) {
    const ran = [];
    await this.ctx.storage.put('cron:last', now); // every cron that reaches the bots, whether or not one is due
    for (const [name, bot] of Object.entries(this.bots)) {
      const st = (await this.ctx.storage.get(`status:${name}`)) || { runs: 0 };
      const password = this.env[bot.secret];
      if (!password) { await this.ctx.storage.put(`status:${name}`, { ...st, waiting: `the person has not added ${bot.secret} yet`, digest: bot.digest }); continue; }
      // Due on its clock; and a bot that has never once got as far as its own code tries again at every cron.
      if (!due(bot, st.last_tick, Date.parse(now)) && !(st.last_error && !st.last_ok && st.last_error_stage !== 'tick')) continue;
      const log = [];
      const rec = { ...st, waiting: null, last_tick: now, digest: bot.digest, runs: (st.runs || 0) + 1 };
      // Where it got to, written before each step: a run that dies mid-way still says where.
      let at = null;
      const stage = (s) => { at = s; return this.ctx.storage.put(`status:${name}`, { ...rec, stage: s, stage_at: new Date().toISOString() }); };
      try {
        await stage('signing in');
        const s = await this.session(name, bot, password);
        rec.did = s.did;
        if (st.profile_digest !== bot.digest) { await stage('setting the profile'); await this.syncProfile(bot, s); rec.profile_digest = bot.digest; rec.profile_at = now; }
        await stage('tick');
        const agent = makeAgent({ did: s.did, handle: s.handle, token: s.access, log });
        const state = await this.ctx.storage.get(`state:${name}`);
        const tick = bot.mod.default;
        if (typeof tick !== 'function') throw new Error(`house/bots/${name}.mjs has no default export function`);
        const next = await Promise.race([tick({ agent, now, state: state === undefined ? null : structuredClone(state) }),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`tick took more than ${TICK_MS / 1000} s`)), TICK_MS))]);
        if (next !== undefined) {
          const size = JSON.stringify(next ?? null).length;
          if (size > STATE_MAX) throw new Error(`state is ${size} bytes; the limit is ${STATE_MAX}`);
          await this.ctx.storage.put(`state:${name}`, next ?? null);
        }
        rec.last_ok = now; rec.last_error = null;
      } catch (e) {
        rec.last_error = String(e?.message || e).slice(0, 500); rec.last_error_at = now; rec.last_error_stage = at;
        // A failure before the bot's own code ran (signing in, the profile) is ours, not its turn: it
        // tries again at the next cron instead of waiting out its clock.
        if (at !== 'tick') { rec.last_tick = st.last_tick ?? null; rec.runs = st.runs || 0; }
        if (e?.status === 401) await this.ctx.storage.delete(`session:${name}`);
      }
      rec.last_writes = log.slice(-20); rec.stage = 'done'; rec.stage_at = new Date().toISOString();
      await this.ctx.storage.put(`status:${name}`, rec);
      ran.push(name);
    }
    await this.refreshFeeds(now);
    return { at: now, ran };
  }

  async status() {
    const out = {};
    for (const [name, bot] of Object.entries(this.bots)) {
      const st = (await this.ctx.storage.get(`status:${name}`)) || {};
      out[name] = { handle: bot.profile.handle, displayName: bot.profile.displayName, every_min: bot.every, digest: bot.digest, signed: bot.signed,
        did: st.did || null, waiting: st.waiting || null, runs: st.runs || 0, last_tick: st.last_tick || null, last_ok: st.last_ok || null,
        last_error: st.last_error || null, last_error_at: st.last_error_at || null, profile_at: st.profile_at || null, stage: st.stage || null, stage_at: st.stage_at || null, last_writes: st.last_writes || [] };
    }
    const feeds = {};
    for (const [name, f] of Object.entries(this.feeds)) {
      const st = (await this.ctx.storage.get(`feedstatus:${name}`)) || {};
      feeds[name] = { by: f.by || 'souls', uri: `at://${MINIPHIM_DID}/town.delve.feed.generator/${name}`, refreshes: typeof f.mod.refresh === 'function',
        last_refresh: st.last_refresh || null, last_ok: st.last_ok || null, last_error: st.last_error || null, result: st.result ?? null };
    }
    return { feed_service: FEED_DID, feeds, cron_last: (await this.ctx.storage.get('cron:last')) || null, cron_error: (await this.ctx.storage.get('cron:error')) || null, bots: out, note: 'the miniphim\'s bots: code in house/bots/ of their commons; state is private and not shown here' };
  }
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

const stub = (env) => env.BOTS.get(env.BOTS.idFromName('bots'));

export default {
  async scheduled(event, env, ctx) {
    if (env.OPEN !== 'true' || (!Object.keys(bots).length && !Object.keys(FEEDS).length)) return;
    const r = await stub(env).fetch(`https://bots/tick?now=${encodeURIComponent(new Date(event.scheduledTime).toISOString())}`);
    if (!r.ok) throw new Error(`bots tick: ${r.status} ${(await r.text()).slice(0, 300)}`);
  },
  async fetch(req, env) {
    const h = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' };
    if (env.OPEN !== 'true') return new Response(JSON.stringify({ closed: 'the person has closed the house; the bots are stopped' }), { status: 503, headers: h });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...h, 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, atproto-accept-labelers' } });
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('read-only\n', { status: 405, headers: { allow: 'GET, HEAD' } });
    const path = new URL(req.url).pathname;
    // The feed service: its DID document, what it serves, and the skeletons.
    if (path === '/.well-known/did.json') return new Response(JSON.stringify(didDoc(), null, 1), { headers: h });
    if (path === '/xrpc/town.delve.feed.describeFeedGenerator') {
      return new Response(JSON.stringify({ did: FEED_DID, feeds: Object.keys(FEEDS).map((n) => ({ uri: `at://${MINIPHIM_DID}/town.delve.feed.generator/${n}` })) }), { headers: h });
    }
    if (path === '/xrpc/town.delve.feed.getFeedSkeleton') {
      const p = new URL(req.url).searchParams, feed = p.get('feed') || '';
      const m = feed.match(/^at:\/\/[^/]+\/town\.delve\.feed\.generator\/([A-Za-z0-9._~:-]+)$/);
      if (!m) return new Response(JSON.stringify({ error: 'InvalidRequest', message: 'feed must be an at:// URI of a town.delve.feed.generator record' }), { status: 400, headers: h });
      const q = new URLSearchParams({ name: m[1], feed, limit: p.get('limit') || '50', ...(p.get('cursor') ? { cursor: p.get('cursor') } : {}) });
      const r = await stub(env).fetch(`https://bots/feed?${q}`);
      return new Response(await r.text(), { status: r.status, headers: h });
    }
    if (path.startsWith('/xrpc/')) return new Response(JSON.stringify({ error: 'MethodNotImplemented', message: 'this service answers town.delve.feed.describeFeedGenerator and town.delve.feed.getFeedSkeleton' }), { status: 501, headers: h });
    // /_bots/run: one round now, as the cron would, with the result or the error in the answer. Safe to
    // call by anyone: a bot runs only when it is due, so this can't make one post more often.
    if (new URL(req.url).pathname.replace(/\/+$/, '').endsWith('/_bots/run')) {
      if (!Object.keys(bots).length) return new Response(JSON.stringify({ ran: [], note: 'no bots shipped' }), { headers: h });
      try {
        const t = await stub(env).fetch(`https://bots/tick?now=${encodeURIComponent(new Date().toISOString())}`);
        return new Response(JSON.stringify({ status: t.status, result: await t.text() }, null, 1), { status: t.ok ? 200 : 500, headers: h });
      } catch (e) { return new Response(JSON.stringify({ error: String(e?.stack || e).slice(0, 800) }, null, 1), { status: 500, headers: h }); }
    }
    const r = await stub(env).fetch('https://bots/status');
    return new Response(JSON.stringify(await r.json(), null, 1), { headers: h });
  },
};
