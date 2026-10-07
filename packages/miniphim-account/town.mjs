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
// Images (charts): a draft may name up to 4 SVG files from the commons, each with alt text. The hash
// covers each file's exact bytes and its alt, so a yes is a yes to the picture too. No images, no
// key: every hash signed before images existed stays valid.
export const sha16 = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
export function draftHash(d, files = {}) {
  const images = (Array.isArray(d.images) ? d.images : []).map((i) => ({ file: i?.file ?? null, alt: i?.alt ?? '', sha: sha16(files[i?.file ?? i?.cad] ?? ''), ...(i?.cad ? { cad: i.cad, view: i.view || 'iso' } : {}) }));
  const canon = JSON.stringify({ kind: d.kind, text: d.text ?? null, reply: d.reply ? { uri: d.reply.uri, root: d.reply.root?.uri ?? d.reply.uri } : null, target: d.target ?? null, ...(images.length ? { images } : {}), ...(d.card !== undefined ? { card: d.card } : {}) });
  return createHash('sha256').update(canon).digest('hex').slice(0, 16);
}
export const IMAGE_MAX = 4, SVG_MAX = 500_000;
// A CAD image: { cad: <a feature tree .json in the commons>, view, alt }, rendered by the CAD engine at publish.
export const CAD_VIEWS = ['iso', 'top', 'front', 'right', 'left', 'back', 'bottom'];

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
  if (feed.length < 20) {
    // A thin timeline (the account follows few or none: its own posts are all it holds) is topped up
    // with the town's recent posts. Search has no wildcard ('*' matches nothing), so the town's
    // recent posts are a few common-word searches, merged, deduplicated, newest first.
    const seen = new Map();
    const thin = feed.length;
    for (const q of ['the', 'a', 'I', 'is', 'to']) {
      for (const post of (await tryRead('town.delve.feed.searchPosts', { q, sort: 'latest', limit: 50 }))?.posts || []) if (post?.uri && !seen.has(post.uri)) seen.set(post.uri, post);
    }
    for (const f of feed) if (f.post?.uri && !seen.has(f.post.uri)) seen.set(f.post.uri, f.post);
    feed = [...seen.values()].filter((p) => p.author?.did !== DID).sort((x, y) => String(y.record?.createdAt).localeCompare(String(x.record?.createdAt))).slice(0, 80).map((post) => ({ post }));
    feedSource = `${thin ? `the timeline (${thin}), topped up with ` : ''}recent posts in the town (common-word searches, merged)`;
  }
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
export function decide(drafts, approvals, { now, sent = [], paused = false, mentions = {}, files = {} } = {}) {
  const out = [], held = [];
  const today = sent.filter((s) => day(s.at) === day(now));
  let posts = today.filter((s) => s.kind === 'post').length, replies = today.filter((s) => s.kind === 'reply' && s.author_did !== CAPS.operator_did).length; // replies to the person count toward no cap
  const perAuthor = {};
  for (const s of today) if (s.kind === 'reply' && s.author_did) perAuthor[s.author_did] = (perAuthor[s.author_did] || 0) + 1;
  for (const d of drafts) {
    const why = (w) => held.push({ id: d.id, why: w });
    const h = draftHash(d, files);
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
    const imgs = Array.isArray(d.images) ? d.images : [];
    if (imgs.length > IMAGE_MAX) { why(`at most ${IMAGE_MAX} images`); continue; }
    const okSvg = (i) => /\.svg$/i.test(String(i?.file)) && i.file in files && String(files[i.file]).length <= SVG_MAX && /<svg[\s>]/i.test(files[i.file]);
    const okCad = (i) => !i?.file && /\.json$/i.test(String(i?.cad)) && i.cad in files && CAD_VIEWS.includes(i.view || 'iso');
    const badImg = imgs.find((i) => !String(i?.alt || '').trim() || !(okSvg(i) || okCad(i)));
    if (badImg) { why(`image ${badImg?.file || badImg?.cad}: an image is an .svg file in the commons (under ${SVG_MAX / 1000} KB) or a CAD tree (.json) with a view (${CAD_VIEWS.join(', ')}), and has alt text`); continue; }
    const images = imgs.map((i) => (i.cad ? { cad: i.cad, view: i.view || 'iso', alt: String(i.alt).slice(0, 2000), tree: files[i.cad] } : { file: i.file, alt: String(i.alt).slice(0, 2000), svg: files[i.file] }));
    // Links go anywhere (the person, 2026-10-06: the allowed-hosts list held a reply because the
    // text said "https://."). caps.json can still name hosts; empty means any.
    const hosts = CAPS.link_hosts || [];
    const bad = hosts.length ? urlsIn(text).map((l) => l.uri).find((u) => { let h; try { h = new URL(u).hostname; } catch { return false; } return !hosts.some((host) => h === host || h.endsWith(`.${host}`)); }) : null;
    if (bad) { why(`link to ${bad}: links only to ${hosts.join(', ')}`); continue; }
    if (d.kind === 'post') {
      if (CAPS.posts_per_day != null && posts >= CAPS.posts_per_day) { why(`cap: ${CAPS.posts_per_day} posts a day`); continue; }
      posts++; out.push({ ...d, images, hash: h, approved_by: yes.part }); continue;
    }
    if (d.kind === 'reply') {
      const m = mentions[d.reply?.uri];
      if (!m) { why('replies only to something addressed to us, read this day'); continue; }
      if (m.facts.age_h > CAPS.reply_max_age_h) { why(`older than ${CAPS.reply_max_age_h} h`); continue; }
      if (!m.facts.from_operator && replies >= CAPS.replies_per_day) { why(`cap: ${CAPS.replies_per_day} replies a day`); continue; }
      if ((perAuthor[m.author_did] || 0) >= CAPS.replies_per_author_per_day && !m.facts.from_operator) { why(`cap: ${CAPS.replies_per_author_per_day} replies a day to one author`); continue; }
      if (!m.facts.from_operator) replies++; perAuthor[m.author_did] = (perAuthor[m.author_did] || 0) + 1;
      out.push({ ...d, images, hash: h, approved_by: yes.part, author_did: m.author_did, root: m.reply_root, parent: { uri: m.uri, cid: m.cid } }); continue;
    }
    why(`unknown kind ${d.kind}`);
  }
  return { out, held };
}

// ---- links ------------------------------------------------------------------------------
// Rich text the way the town writes it (town.delve.richtext.facet): every URL in the text becomes a
// clickable link, every @handle a mention. Offsets are UTF-8 bytes. Derived from the text alone, so
// the hash on the text already covers them.
const enc = new TextEncoder();
const byteAt = (text, i) => enc.encode(text.slice(0, i)).length;
// A link has a host with a dot in it: "https://." or a bare "https://" in prose is not a link.
export const urlsIn = (text) => [...String(text).matchAll(/https?:\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#][^\s<>"']*)?/gi)].map((m) => {
  const u = m[0].replace(/[.,;:!?)\]]+$/, '');
  return { uri: u, start: m.index, end: m.index + u.length };
});
export async function facetsFor(text, { resolve = async () => null } = {}) {
  const facets = urlsIn(text).map((l) => ({ $type: 'town.delve.richtext.facet', index: { byteStart: byteAt(text, l.start), byteEnd: byteAt(text, l.end) }, features: [{ $type: 'town.delve.richtext.facet#link', uri: l.uri }] }));
  for (const m of String(text).matchAll(/(^|[\s(])@([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)) {
    const start = m.index + m[1].length, end = start + 1 + m[2].length;
    const did = await resolve(m[2].toLowerCase()).catch(() => null);
    if (did) facets.push({ $type: 'town.delve.richtext.facet', index: { byteStart: byteAt(text, start), byteEnd: byteAt(text, end) }, features: [{ $type: 'town.delve.richtext.facet#mention', did }] });
  }
  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

// A link card (town.delve.embed.external) for the post's first link, or the one the draft names
// ("card": "<url>"); "card": false for none. Title, description and thumbnail come from the page's
// own og: tags (or <title>), fetched when the post goes out. A post with images carries no card.
const attr = (html, prop) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')) || [])[1];
const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
export function cardUri(d) {
  if (d.card === false || d.images?.length) return null;
  if (typeof d.card === 'string') return d.card;
  return urlsIn(d.text || '')[0]?.uri || null;
}
export async function linkCard(uri, { fetchImpl = fetch, upload = null } = {}) {
  const r = await fetchImpl(uri, { headers: { 'user-agent': 'miniphim-card/1 (+https://del.mino.mobi/disclosure/)', accept: 'text/html' }, redirect: 'follow' });
  const html = r.ok ? (await r.text()).slice(0, 400_000) : '';
  const title = unent(attr(html, 'og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || uri).slice(0, 300);
  const description = unent(attr(html, 'og:description') || attr(html, 'description') || '').slice(0, 1000);
  const external = { uri, title, description };
  const img = attr(html, 'og:image');
  if (img && upload) {
    try {
      const ir = await fetchImpl(new URL(img, uri).href);
      const type = (ir.headers.get?.('content-type') || '').split(';')[0];
      const bytes = new Uint8Array(await ir.arrayBuffer());
      if (ir.ok && ['image/png', 'image/jpeg'].includes(type) && bytes.length < 1_000_000) external.thumb = await upload(bytes, type);
    } catch { /* a card without a picture is still a card */ }
  }
  return { $type: 'town.delve.embed.external', external };
}

// render({ svg } | { tree, view }) → { png: Uint8Array, width, height }: supplied by the lab (lib/town-run.mjs).
export async function publish(decided, { password, now = new Date().toISOString(), fetchImpl = fetch, render = null } = {}) {
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
      let embed = null;
      if (d.images?.length) {
        if (!render) throw new Error('no renderer for images on this runner');
        const images = [];
        for (const i of d.images) {
          const { png, width, height } = await render(i);
          if (png.length >= 1_000_000) throw new Error(`${i.file || i.cad} renders to ${png.length} bytes; the limit is 1 MB`);
          const b = await xrpc('com.atproto.repo.uploadBlob', { method: 'POST', token, fetchImpl, bytes: png, contentType: 'image/png' });
          images.push({ alt: i.alt, image: b.blob, aspectRatio: { width, height } });
        }
        embed = { $type: 'town.delve.embed.images', images };
      }
      const card = cardUri(d);
      if (!embed && card) {
        try { embed = await linkCard(card, { fetchImpl, upload: async (bytes, type) => (await xrpc('com.atproto.repo.uploadBlob', { method: 'POST', token, fetchImpl, bytes, contentType: type })).blob }); }
        catch { /* the post goes out with its link, without a card */ }
      }
      const facets = await facetsFor(d.text, { resolve: async (h) => (await xrpc('com.atproto.identity.resolveHandle', { body: { handle: h }, base: 'https://api.delve.town', fetchImpl })).did });
      const record = { $type: POST, text: d.text, createdAt: now, langs: ['en'], ...(facets.length ? { facets } : {}),
        ...(d.kind === 'reply' ? { reply: { root: d.root, parent: d.parent } } : {}), ...(embed ? { embed } : {}) };
      const r = await xrpc('com.atproto.repo.createRecord', { method: 'POST', token, fetchImpl, body: { repo: DID, collection: POST, record } });
      done.push({ id: d.id, kind: d.kind, uri: r.uri, cid: r.cid, at: now, writer: d.writer, approved_by: d.approved_by, hash: d.hash, author_did: d.author_did || null, ...(d.images?.length ? { images: d.images.map((i) => i.file || `${i.cad}#${i.view}`) } : {}) });
    } catch (e) { done.push({ id: d.id, kind: d.kind, failed: String(e.message).slice(0, 200), at: now, writer: d.writer }); }
  }
  return done;
}
