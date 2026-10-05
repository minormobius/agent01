// town.mjs — the miniphim's hands in Delvetown, held by the lab, never by a soul.
//
// fetchTown(): before a town day, read what's addressed to the account (mentions, replies,
// quotes), its own recent posts, and a slice of the town (timeline, or recent posts when it
// follows nobody). Each mention carries facts computed here, the ones the souls' rules of the
// road decide on: addressed, age, asks, words, own thread, a repeat, and how often we've
// already replied to its author today. The texts are lent to the day's sessions and never kept.
//
// publishOutbox(): after the day, publish what the souls drafted, by their own protocol: a draft
// goes out only with a second part's yes naming its exact hash, and no veto. Every cap is in code
// here (caps.json), where no session can reach. PAUSED stops everything but retraction.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DID, HANDLE, PDS, xrpc, graphemes } from './account.mjs';

export const POST = 'town.delve.feed.post';
export const PROXY = 'did:web:api.delve.town#bsky_appview';
export const PARTS = ['modulo', 'morphyx', 'mozzie'];
export const SIGN = { modulo: 'Modulo', morphyx: 'Morphyx', mozzie: 'Mozzie' };
export const CAPS = JSON.parse(readFileSync(new URL('./caps.json', import.meta.url), 'utf8'));

const day = (iso) => String(iso).slice(0, 10);
const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / 36e5;

// The canonical form a part signs off on: exactly what would be published.
export function draftHash(d) {
  const canon = JSON.stringify({ kind: d.kind, text: d.text ?? null, reply: d.reply ? { uri: d.reply.uri, root: d.reply.root?.uri ?? d.reply.uri } : null, target: d.target ?? null });
  return createHash('sha256').update(canon).digest('hex').slice(0, 16);
}

// ---- reading -------------------------------------------------------------------------------
export async function session(password, fetchImpl = fetch) {
  const s = await xrpc('com.atproto.server.createSession', { method: 'POST', body: { identifier: HANDLE, password }, fetchImpl });
  if (s.did !== DID) throw new Error(`session for ${s.did}, not ${DID}`);
  return s.accessJwt;
}
const read = (nsid, params, token, fetchImpl) => xrpc(nsid, { body: params, token, fetchImpl, proxy: PROXY });

export function factsOf(m, { now, ours, repliedToday }) {
  const text = m.record?.text || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const rootUri = m.record?.reply?.root?.uri || null;
  return {
    addressed: m.reason === 'mention' || m.reason === 'reply' || m.reason === 'quote',
    reason: m.reason,
    age_h: Math.round(hours(m.indexedAt || m.record?.createdAt, now) * 10) / 10,
    asks: /\?/.test(text),
    has_link_or_file: /https?:\/\//.test(text) || !!m.record?.embed,
    words,
    in_our_thread: !!rootUri && ours.has(rootUri),
    replied_to_author_today: repliedToday[m.author?.did] || 0,
    author_is_bot: (m.author?.labels || []).some((l) => l.val === 'bot'),
    from_operator: m.author?.handle === CAPS.operator,
  };
}

export async function fetchTown({ password, now = new Date().toISOString(), fetchImpl = fetch } = {}) {
  const token = await session(password, fetchImpl);
  const errors = [];
  const tryRead = async (nsid, params) => { try { return await read(nsid, params, token, fetchImpl); } catch (e) { errors.push(`${nsid}: ${e.message}`); return null; } };
  const mine = (await tryRead('town.delve.feed.getAuthorFeed', { actor: DID, limit: 50 }))?.feed || [];
  const ours = new Set(mine.map((f) => f.post?.uri).filter(Boolean));
  const repliedToday = {};
  for (const f of mine) {
    const r = f.post?.record; if (!r?.reply || day(r.createdAt) !== day(now)) continue;
    const parentAuthor = f.reply?.parent?.author?.did; if (parentAuthor) repliedToday[parentAuthor] = (repliedToday[parentAuthor] || 0) + 1;
  }
  const notes = (await tryRead('town.delve.notification.listNotifications', { limit: 50 }))?.notifications || [];
  const seenText = new Set();
  const inbox = notes.filter((n) => ['mention', 'reply', 'quote'].includes(n.reason)).map((n) => {
    const facts = factsOf(n, { now, ours, repliedToday });
    const key = (n.record?.text || '').trim().toLowerCase();
    facts.repeat = seenText.has(key); seenText.add(key);
    return { uri: n.uri, cid: n.cid, author: n.author?.handle, author_did: n.author?.did, at: n.indexedAt,
      text: n.record?.text || '', reply_root: n.record?.reply?.root || { uri: n.uri, cid: n.cid }, facts };
  });
  const other = notes.filter((n) => !['mention', 'reply', 'quote'].includes(n.reason)).map((n) => ({ reason: n.reason, author: n.author?.handle, at: n.indexedAt }));
  let feed = (await tryRead('town.delve.feed.getTimeline', { limit: 50 }))?.feed || [];
  let feedSource = 'timeline';
  if (!feed.length) { feed = (await tryRead('town.delve.feed.searchPosts', { q: '*', sort: 'latest', limit: 50 }))?.posts?.map((post) => ({ post })) || []; feedSource = 'recent posts in the town'; }
  return {
    at: now, account: HANDLE, errors,
    inbox, other,
    ours: mine.map((f) => ({ uri: f.post.uri, cid: f.post.cid, at: f.post.record?.createdAt, text: f.post.record?.text, reply: !!f.post.record?.reply, likes: f.post.likeCount || 0, replies: f.post.replyCount || 0 })),
    feed: { source: feedSource, posts: feed.map((f) => ({ uri: f.post?.uri, cid: f.post?.cid, author: f.post?.author?.handle, at: f.post?.record?.createdAt, text: f.post?.record?.text || '', likes: f.post?.likeCount || 0, replies: f.post?.replyCount || 0 })) },
  };
}

// ---- publishing ----------------------------------------------------------------------------
// Decide what may go out, without the network: the protocol and every cap. Pure, so the selftest
// can hold it to each rule. `sent` is the account's own log of what it published (uri, kind, at,
// author_did for replies).
export function decide(drafts, approvals, { now, sent = [], paused = false, mentions = {} } = {}) {
  const out = [], held = [];
  const today = sent.filter((s) => day(s.at) === day(now));
  let posts = today.filter((s) => s.kind === 'post').length, replies = today.filter((s) => s.kind === 'reply').length;
  const perAuthor = {};
  for (const s of today) if (s.kind === 'reply' && s.author_did) perAuthor[s.author_did] = (perAuthor[s.author_did] || 0) + 1;
  for (const d of drafts) {
    const why = (w) => held.push({ id: d.id, why: w });
    const h = draftHash(d);
    if (!PARTS.includes(d.writer)) { why(`unknown writer ${d.writer}`); continue; }
    if (d.kind === 'delete') {
      // Retraction: no second key, works while paused, only our own posts.
      if (!String(d.target || '').startsWith(`at://${DID}/${POST}/`)) { why('can only retract our own posts'); continue; }
      out.push({ ...d, hash: h }); continue;
    }
    const mine = approvals.filter((a) => a.id === d.id);
    if (mine.some((a) => a.verdict === 'veto')) { why(`vetoed by ${mine.find((a) => a.verdict === 'veto').part}`); continue; }
    const yes = mine.find((a) => a.verdict === 'yes' && a.part !== d.writer && a.hash === h);
    if (!yes) { why(mine.some((a) => a.verdict === 'yes' && a.hash !== h) ? 'approved a different version (hash changed)' : 'waiting for another part\'s yes'); continue; }
    if (paused) { why('PAUSED'); continue; }
    const text = String(d.text || '');
    if (!text.trim()) { why('empty'); continue; }
    if (graphemes(text) > CAPS.max_graphemes) { why(`over ${CAPS.max_graphemes} graphemes`); continue; }
    if (!new RegExp(`—\\s*${SIGN[d.writer]}\\s*$`).test(text)) { why(`must end with its writer's signature: "— ${SIGN[d.writer]}"`); continue; }
    const links = text.match(/https?:\/\/[^\s)]+/g) || [];
    const bad = links.find((u) => !CAPS.link_hosts.some((host) => new URL(u).hostname === host || new URL(u).hostname.endsWith(`.${host}`)));
    if (bad) { why(`link to ${bad}: links only to ${CAPS.link_hosts.join(', ')}`); continue; }
    if (d.kind === 'post') {
      if (posts >= CAPS.posts_per_day) { why(`cap: ${CAPS.posts_per_day} posts a day`); continue; }
      posts++; out.push({ ...d, hash: h, approved_by: yes.part }); continue;
    }
    if (d.kind === 'reply') {
      const m = mentions[d.reply?.uri];
      if (!m) { why('replies only to something addressed to us, read this day'); continue; }
      if (m.facts.age_h > CAPS.reply_max_age_h) { why(`older than ${CAPS.reply_max_age_h} h`); continue; }
      if (replies >= CAPS.replies_per_day) { why(`cap: ${CAPS.replies_per_day} replies a day`); continue; }
      if ((perAuthor[m.author_did] || 0) >= CAPS.replies_per_author_per_day && !m.facts.from_operator) { why(`cap: ${CAPS.replies_per_author_per_day} replies a day to one author`); continue; }
      replies++; perAuthor[m.author_did] = (perAuthor[m.author_did] || 0) + 1;
      out.push({ ...d, hash: h, approved_by: yes.part, author_did: m.author_did, root: m.reply_root, parent: { uri: m.uri, cid: m.cid } }); continue;
    }
    why(`unknown kind ${d.kind}`);
  }
  return { out, held };
}

export async function publish(decided, { password, now = new Date().toISOString(), fetchImpl = fetch } = {}) {
  if (!decided.length) return [];
  const token = await session(password, fetchImpl);
  const done = [];
  for (const d of decided) {
    try {
      if (d.kind === 'delete') {
        const rkey = d.target.split('/').pop();
        await xrpc('com.atproto.repo.deleteRecord', { method: 'POST', token, fetchImpl, body: { repo: DID, collection: POST, rkey } });
        done.push({ id: d.id, kind: 'delete', target: d.target, at: now, writer: d.writer }); continue;
      }
      const record = { $type: POST, text: d.text, createdAt: now, langs: ['en'],
        ...(d.kind === 'reply' ? { reply: { root: d.root, parent: d.parent } } : {}) };
      const r = await xrpc('com.atproto.repo.createRecord', { method: 'POST', token, fetchImpl, body: { repo: DID, collection: POST, record } });
      done.push({ id: d.id, kind: d.kind, uri: r.uri, cid: r.cid, at: now, writer: d.writer, approved_by: d.approved_by, hash: d.hash, author_did: d.author_did || null });
    } catch (e) { done.push({ id: d.id, kind: d.kind, failed: String(e.message).slice(0, 200), at: now, writer: d.writer }); }
  }
  return done;
}
