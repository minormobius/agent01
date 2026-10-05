// town-proxy.mjs — the miniphim's live hands in Delvetown, without the password.
//
// The lab starts this on the runner for a town day; sessions reach it at MINIPHIM_TOWN_URL with
// town/town.mjs (the client, lent into each session). The password stays in this process, every
// call goes through account.mjs's door, and every act is capped here, in code no session reaches.
//
//   POST /read { nsid, params }               a live read of the town (account.mjs TOWN_READS)
//   POST /act  { kind, subject }              follow | unfollow (subject: handle or DID)
//                                             like | unlike     (subject: a post's at:// uri)
//   GET  /                                    what's allowed, and what's left today
//
// Acts take effect at once and need no second part: the protocol the souls chose (a second key,
// one veto) is for what the account SAYS. Posts and replies still go through town/outbox/.
// Each act is logged with the part that made it (header x-soul); the lab keeps the log in the
// commons as town/acts.jsonl, and the per-day caps count it across runs.
import { createServer } from 'node:http';
import { DID, xrpc, TOWN_READS } from './account.mjs';
import { session, PROXY, CAPS, PARTS } from './town.mjs';

const FOLLOW = 'town.delve.graph.follow', LIKE = 'town.delve.feed.like';
const day = (iso) => String(iso).slice(0, 10);

export async function startTownProxy({ password, acts = [], fetchImpl = fetch, now = () => new Date().toISOString(), caps = CAPS } = {}) {
  let token = null;
  const auth = async () => (token ||= await session(password, fetchImpl));
  const log = [];
  let reads = 0;
  const today = () => [...acts, ...log].filter((a) => !a.failed && day(a.at) === day(now()));
  const left = () => {
    const t = today(), n = (k) => t.filter((a) => a.kind === k).length;
    return { follow: caps.follows_per_day - n('follow') - n('unfollow'), like: caps.likes_per_day - n('like') - n('unlike'), reads: caps.reads_per_run - reads };
  };
  const did = async (subject) => {
    const s = String(subject || '').trim().replace(/^@/, '');
    if (/^did:(plc|web):[a-zA-Z0-9._:%-]+$/.test(s)) return s;
    if (!/^[a-z0-9.-]+\.[a-z]+$/i.test(s)) throw new Error('subject must be a handle or a DID');
    return (await xrpc('com.atproto.identity.resolveHandle', { body: { handle: s }, base: 'https://api.delve.town', fetchImpl })).did;
  };
  const mine = async (collection, match) => {
    let cursor;
    for (let i = 0; i < 20; i++) {
      const r = await xrpc('com.atproto.repo.listRecords', { body: { repo: DID, collection, limit: 100, ...(cursor ? { cursor } : {}) }, token: await auth(), fetchImpl });
      const hit = (r.records || []).find((x) => match(x.value));
      if (hit) return hit;
      if (!r.cursor || !(r.records || []).length) return null;
      cursor = r.cursor;
    }
    return null;
  };
  const rkey = (uri) => uri.split('/').pop();

  async function act(kind, subject) {
    const L = left();
    if ((kind === 'follow' || kind === 'unfollow') && L.follow <= 0) throw new Error(`cap: ${caps.follows_per_day} follows and unfollows a day`);
    if ((kind === 'like' || kind === 'unlike') && L.like <= 0) throw new Error(`cap: ${caps.likes_per_day} likes and unlikes a day`);
    if (kind === 'follow' || kind === 'unfollow') {
      const d = await did(subject);
      if (d === DID) throw new Error('that is us');
      const have = await mine(FOLLOW, (v) => v.subject === d);
      if (kind === 'follow') {
        if (have) return { already: true, uri: have.uri, subject: d };
        const r = await xrpc('com.atproto.repo.createRecord', { method: 'POST', token: await auth(), fetchImpl, body: { repo: DID, collection: FOLLOW, record: { $type: FOLLOW, subject: d, createdAt: now() } } });
        return { uri: r.uri, subject: d };
      }
      if (!have) return { already: true, subject: d };
      await xrpc('com.atproto.repo.deleteRecord', { method: 'POST', token: await auth(), fetchImpl, body: { repo: DID, collection: FOLLOW, rkey: rkey(have.uri) } });
      return { removed: have.uri, subject: d };
    }
    if (kind === 'like' || kind === 'unlike') {
      const uri = String(subject || '');
      if (!/^at:\/\/did:[^/]+\/town\.delve\.feed\.post\/[A-Za-z0-9._~-]+$/.test(uri)) throw new Error('subject must be a post uri: at://<did>/town.delve.feed.post/<rkey>');
      const have = await mine(LIKE, (v) => v.subject?.uri === uri);
      if (kind === 'like') {
        if (have) return { already: true, uri: have.uri, subject: uri };
        const p = (await xrpc('town.delve.feed.getPosts', { body: { uris: uri }, token: await auth(), fetchImpl, proxy: PROXY })).posts?.[0];
        if (!p?.cid) throw new Error('no such post (or the town has not indexed it yet)');
        const r = await xrpc('com.atproto.repo.createRecord', { method: 'POST', token: await auth(), fetchImpl, body: { repo: DID, collection: LIKE, record: { $type: LIKE, subject: { uri, cid: p.cid }, createdAt: now() } } });
        return { uri: r.uri, subject: uri };
      }
      if (!have) return { already: true, subject: uri };
      await xrpc('com.atproto.repo.deleteRecord', { method: 'POST', token: await auth(), fetchImpl, body: { repo: DID, collection: LIKE, rkey: rkey(have.uri) } });
      return { removed: have.uri, subject: uri };
    }
    throw new Error('kind must be follow, unfollow, like or unlike (posts and replies go through town/outbox/)');
  }

  const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') return json(res, 200, { reads: [...TOWN_READS], acts: ['follow', 'unfollow', 'like', 'unlike'], left: left(), account: DID });
    let body = ''; for await (const c of req) { body += c; if (body.length > 20_000) return json(res, 413, { error: 'too large' }); }
    let q; try { q = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'body must be JSON' }); }
    const who = String(req.headers['x-soul'] || '').toLowerCase();
    if (!PARTS.includes(who)) return json(res, 400, { error: 'x-soul must be modulo, morphyx or mozzie (the client sets it)' });
    try {
      if (req.url.startsWith('/read')) {
        if (!TOWN_READS.has(q.nsid)) return json(res, 403, { error: `not a read the door allows: ${q.nsid}`, reads: [...TOWN_READS] });
        if (left().reads <= 0) return json(res, 429, { error: `cap: ${caps.reads_per_run} reads a run` });
        reads++;
        const base = q.nsid === 'com.atproto.identity.resolveHandle' ? 'https://api.delve.town' : undefined;
        const out = await xrpc(q.nsid, { body: q.params || {}, ...(base ? { base } : { token: await auth(), proxy: PROXY }), fetchImpl });
        return json(res, 200, out);
      }
      if (req.url.startsWith('/act')) {
        const kind = String(q.kind || '');
        try {
          const r = await act(kind, q.subject);
          if (!r.already) log.push({ at: now(), part: who, kind, subject: q.subject, ...r });
          return json(res, 200, { ...r, left: left() });
        } catch (e) {
          log.push({ at: now(), part: who, kind, subject: q.subject, failed: String(e.message).slice(0, 200) });
          return json(res, /^cap:/.test(e.message) ? 429 : 400, { error: e.message, left: left() });
        }
      }
      return json(res, 404, { error: 'POST /read or /act' });
    } catch (e) { return json(res, 502, { error: String(e.message).slice(0, 300) }); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, log, left, close: () => new Promise((r) => server.close(r)) };
}

// The client, lent into each town and evening session as town/town.mjs. No dependencies.
export const TOWN_CLIENT = `// node town/town.mjs <command> — the town, live, through the lab's proxy (it holds the password; you don't).
//   node town/town.mjs                          what's allowed and what's left today
//   node town/town.mjs read <nsid> [k=v ...]     e.g. read town.delve.graph.getFollows actor=modalmobius.delve.town limit=100
//   node town/town.mjs follow <handle|did>       unfollow <handle|did>
//   node town/town.mjs like <at://...post uri>   unlike <at://...post uri>
// Acts take effect now and need no second part. Posts and replies still go through outbox/.
const base = process.env.MINIPHIM_TOWN_URL;
if (!base) { console.error('no MINIPHIM_TOWN_URL: the town is not open in this session'); process.exit(2); }
const soul = process.env.WHETSTONE_SOUL || '';
const [cmd, ...rest] = process.argv.slice(2);
const call = async (path, body) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-soul': soul }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); console.log(JSON.stringify(j, null, 1)); if (!r.ok) process.exit(1);
};
if (!cmd) await call('/');
else if (cmd === 'read') await call('/read', { nsid: rest[0], params: Object.fromEntries(rest.slice(1).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])) });
else if (['follow', 'unfollow', 'like', 'unlike'].includes(cmd)) await call('/act', { kind: cmd, subject: rest[0] });
else { console.error('commands: read, follow, unfollow, like, unlike'); process.exit(2); }
`;
