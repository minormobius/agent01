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
  return net(input, { ...init, redirect: 'error' });
}
globalThis.fetch = guardedFetch;

async function xrpc(nsid, { method = 'GET', params, body, token, bytes, type, proxy } = {}) {
  const url = new URL(`${PDS}/xrpc/${nsid}`);
  for (const [k, v] of Object.entries(params || {})) for (const x of [].concat(v)) url.searchParams.append(k, String(x));
  const r = await globalThis.fetch(url, { method, headers: {
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
  constructor(ctx, env, list = bots) { this.ctx = ctx; this.env = env; this.bots = list; }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/tick') return Response.json(await this.tick(url.searchParams.get('now') || new Date().toISOString()));
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
    for (const [name, bot] of Object.entries(this.bots)) {
      const st = (await this.ctx.storage.get(`status:${name}`)) || { runs: 0 };
      const password = this.env[bot.secret];
      if (!password) { await this.ctx.storage.put(`status:${name}`, { ...st, waiting: `the person has not added ${bot.secret} yet`, digest: bot.digest }); continue; }
      if (!due(bot, st.last_tick, Date.parse(now))) continue;
      const log = [];
      const rec = { ...st, waiting: null, last_tick: now, digest: bot.digest, runs: (st.runs || 0) + 1 };
      try {
        const s = await this.session(name, bot, password);
        rec.did = s.did;
        if (st.profile_digest !== bot.digest) { await this.syncProfile(bot, s); rec.profile_digest = bot.digest; rec.profile_at = now; }
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
        rec.last_error = String(e?.message || e).slice(0, 500); rec.last_error_at = now;
        if (e?.status === 401) await this.ctx.storage.delete(`session:${name}`);
      }
      rec.last_writes = log.slice(-20);
      await this.ctx.storage.put(`status:${name}`, rec);
      ran.push(name);
    }
    return { at: now, ran };
  }

  async status() {
    const out = {};
    for (const [name, bot] of Object.entries(this.bots)) {
      const st = (await this.ctx.storage.get(`status:${name}`)) || {};
      out[name] = { handle: bot.profile.handle, displayName: bot.profile.displayName, every_min: bot.every, digest: bot.digest, signed: bot.signed,
        did: st.did || null, waiting: st.waiting || null, runs: st.runs || 0, last_tick: st.last_tick || null, last_ok: st.last_ok || null,
        last_error: st.last_error || null, last_error_at: st.last_error_at || null, profile_at: st.profile_at || null, last_writes: st.last_writes || [] };
    }
    return { bots: out, note: 'the miniphim\'s bots: code in house/bots/ of their commons; state is private and not shown here' };
  }
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

const stub = (env) => env.BOTS.get(env.BOTS.idFromName('bots'));

export default {
  async scheduled(event, env, ctx) {
    if (env.OPEN !== 'true' || !Object.keys(bots).length) return;
    ctx.waitUntil(stub(env).fetch(`https://bots/tick?now=${encodeURIComponent(new Date(event.scheduledTime).toISOString())}`));
  },
  async fetch(req, env) {
    const h = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' };
    if (env.OPEN !== 'true') return new Response(JSON.stringify({ closed: 'the person has closed the house; the bots are stopped' }), { status: 503, headers: h });
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('read-only\n', { status: 405, headers: { allow: 'GET, HEAD' } });
    const r = await stub(env).fetch('https://bots/status');
    return new Response(JSON.stringify(await r.json(), null, 1), { headers: h });
  },
};
