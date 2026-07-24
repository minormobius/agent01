// lathe/runtime.js — the executors. One per node in engine.js's vocabulary.
//
// THE RULE: the generator's vocabulary is exactly what this file implements. A
// generated permalink that renders an apology is worse than no toy, so nothing is
// aspirational here — every SOURCE, LENS and VIEW the engine can mint runs, against
// public CORS-open Bluesky endpoints, with no auth and no worker round-trip.
//
// DATA ENVELOPE. Everything moves as { port, sets: [{label, rows}] }. One set for a
// single handle or a list; two for a `two`-handle toy, which is what makes
// comparison fall out for free — a non-pair lens simply maps over both sets and the
// view overlays them, while a pair lens (overlap/exclusive) merges the two into one.

const PUB = 'https://public.api.bsky.app/xrpc';

// ── fetch helpers ────────────────────────────────────────────────────────────
async function jget(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}
export function cleanHandle(h) {
  return String(h || '').trim().replace(/^@/, '').replace(/^https?:\/\/(bsky\.app\/profile\/)?/, '').split('/')[0];
}
export async function resolveActor(actor) {
  const a = cleanHandle(actor);
  if (!a) { const e = new Error('give a handle'); e.status = 400; throw e; }
  if (a.startsWith('did:')) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) { const e = new Error(`couldn't resolve “${a}”`); e.status = 404; throw e; }
  return d.did;
}
export async function getProfile(actor) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
}
async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) doc = await jget(`https://plc.directory/${did}`);
  else if (did.startsWith('did:web:')) doc = await jget(`https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`);
  else throw new Error('unsupported DID method');
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds');
  if (!svc) throw new Error('no PDS in DID doc');
  return svc.serviceEndpoint;
}
// Page a cursor-paginated XRPC endpoint up to `limit` items.
async function page(url, key, limit, signal, onProgress) {
  const out = []; let cursor = '';
  for (let i = 0; i < 25 && out.length < limit; i++) {
    const u = url + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    let d; try { d = await jget(u, signal); } catch (e) { if (out.length) break; throw e; }
    const rows = d[key] || [];
    out.push(...rows);
    if (onProgress) onProgress(out.length);
    cursor = d.cursor;
    if (!cursor || !rows.length) break;
  }
  return out.slice(0, limit);
}

// ── normalisers ──────────────────────────────────────────────────────────────
function normPost(p) {
  if (!p) return null;
  const rec = p.record || {};
  const facets = rec.facets || [];
  const links = [], tags = [], mentions = [];
  for (const f of facets) {
    for (const ft of (f.features || [])) {
      if (ft.$type === 'app.bsky.richtext.facet#link' && ft.uri) links.push(ft.uri);
      else if (ft.$type === 'app.bsky.richtext.facet#tag' && ft.tag) tags.push(String(ft.tag).toLowerCase());
      else if (ft.$type === 'app.bsky.richtext.facet#mention' && ft.did) mentions.push(ft.did);
    }
  }
  for (const m of String(rec.text || '').matchAll(/#(\w{2,})/g)) tags.push(m[1].toLowerCase());
  const emb = p.embed || {};
  const imgs = (emb.images || (emb.media && emb.media.images) || []).map((im) => ({
    thumb: im.thumb, full: im.fullsize, alt: im.alt || '',
  }));
  return {
    uri: p.uri,
    text: String(rec.text || ''),
    at: Date.parse(rec.createdAt || p.indexedAt || '') || 0,
    author: p.author ? { did: p.author.did, handle: p.author.handle, avatar: p.author.avatar } : null,
    likes: p.likeCount || 0, reposts: p.repostCount || 0, replies: p.replyCount || 0,
    images: imgs, links, tags: [...new Set(tags)], mentions,
    replyToDid: rec.reply && rec.reply.parent && typeof rec.reply.parent.uri === 'string'
      ? (rec.reply.parent.uri.match(/^at:\/\/([^/]+)/) || [])[1] : null,
  };
}
const normAccount = (a) => ({
  did: a.did, handle: a.handle, avatar: a.avatar, displayName: a.displayName || '',
  followers: a.followersCount || 0, follows: a.followsCount || 0, posts: a.postsCount || 0,
  description: a.description || '',
});

// ── SOURCES ──────────────────────────────────────────────────────────────────
// Each returns rows for ONE binding. The driver calls it per binding.
const SRC = {
  async posts(bind, g, ctx) {
    const items = await page(`${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(bind.did)}&limit=100&filter=posts_with_replies`,
      'feed', g.limit, ctx.signal, ctx.progress);
    return items.map((i) => normPost(i.post)).filter(Boolean);
  },
  async media(bind, g, ctx) {
    const items = await page(`${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(bind.did)}&limit=100&filter=posts_with_media`,
      'feed', g.limit, ctx.signal, ctx.progress);
    return items.map((i) => normPost(i.post)).filter(Boolean);
  },
  async likes(bind, g, ctx) { return viaRepo(bind, 'app.bsky.feed.like', g, ctx); },
  async reposts(bind, g, ctx) { return viaRepo(bind, 'app.bsky.feed.repost', g, ctx); },
  async follows(bind, g, ctx) {
    const rows = await page(`${PUB}/app.bsky.graph.getFollows?actor=${encodeURIComponent(bind.did)}&limit=100`,
      'follows', g.limit, ctx.signal, ctx.progress);
    return rows.map(normAccount);
  },
  async followers(bind, g, ctx) {
    const rows = await page(`${PUB}/app.bsky.graph.getFollowers?actor=${encodeURIComponent(bind.did)}&limit=100`,
      'followers', g.limit, ctx.signal, ctx.progress);
    return rows.map(normAccount);
  },
  async mutuals(bind, g, ctx) {
    const [fo, fr] = await Promise.all([
      page(`${PUB}/app.bsky.graph.getFollows?actor=${encodeURIComponent(bind.did)}&limit=100`, 'follows', g.limit, ctx.signal),
      page(`${PUB}/app.bsky.graph.getFollowers?actor=${encodeURIComponent(bind.did)}&limit=100`, 'followers', g.limit, ctx.signal),
    ]);
    const back = new Set(fr.map((a) => a.did));
    return fo.filter((a) => back.has(a.did)).map(normAccount);
  },
  async members(bind, g, ctx) {
    const rows = await page(`${PUB}/app.bsky.graph.getList?list=${encodeURIComponent(bind.list)}&limit=100`,
      'items', g.limit, ctx.signal, ctx.progress);
    return rows.map((i) => normAccount(i.subject || {}));
  },
  async blocks(bind, g, ctx) {
    const pds = await resolvePds(bind.did);
    const recs = await page(`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(bind.did)}&collection=app.bsky.graph.block&limit=100`,
      'records', g.limit, ctx.signal, ctx.progress);
    const dids = recs.map((r) => r.value && r.value.subject).filter(Boolean);
    return hydrateAccounts(dids, ctx.signal);
  },
};
// likes/reposts live in the repo as refs; read them raw then hydrate the targets.
async function viaRepo(bind, collection, g, ctx) {
  const pds = await resolvePds(bind.did);
  const recs = await page(`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(bind.did)}&collection=${collection}&limit=100`,
    'records', Math.min(g.limit, 300), ctx.signal, ctx.progress);
  const uris = recs.map((r) => r.value && r.value.subject && r.value.subject.uri).filter(Boolean);
  const out = [];
  for (let i = 0; i < uris.length; i += 25) {
    const slice = uris.slice(i, i + 25);
    try {
      const d = await jget(`${PUB}/app.bsky.feed.getPosts?uris=${slice.map(encodeURIComponent).join('&uris=')}`, ctx.signal);
      out.push(...(d.posts || []).map(normPost).filter(Boolean));
    } catch { /* a dead target just drops out */ }
    if (ctx.progress) ctx.progress(out.length);
  }
  return out;
}
async function hydrateAccounts(dids, signal) {
  const out = [];
  for (let i = 0; i < dids.length; i += 25) {
    const slice = dids.slice(i, i + 25);
    try {
      const d = await jget(`${PUB}/app.bsky.actor.getProfiles?actors=${slice.map(encodeURIComponent).join('&actors=')}`, signal);
      out.push(...(d.profiles || []).map(normAccount));
    } catch { /* skip */ }
  }
  return out;
}

// ── word machinery (shared by the text lenses) ───────────────────────────────
const STOP = new Set(('a an and are as at be been but by for from had has have he her his i in is it its me my no not of on or our so that the their them then they this to up us was we were what when who will with you your just like get got out about into over more all can do if im dont youre re ve ll s t m d you i’m it’s don’t').split(/\s+/));
// A deliberately small AFINN-style list — enough for a mood curve without shipping
// a lexicon file. (rite/lexicon does the full job with real NRC/AFINN data.)
const AFINN = { good:3,great:3,love:3,loved:3,happy:3,best:3,beautiful:3,wonderful:4,amazing:4,excellent:3,nice:3,fun:3,glad:3,thanks:2,thank:2,cool:2,win:2,won:3,perfect:3,brilliant:4,lovely:3,delight:3,joy:3,hope:2,proud:3,funny:2,sweet:2,yes:1,better:2,strong:2,free:1,easy:1,clear:1,right:1,
  bad:-3,hate:-3,hated:-3,awful:-3,terrible:-3,worst:-3,sad:-2,angry:-3,ugly:-3,horrible:-3,stupid:-2,dumb:-2,broken:-2,fail:-2,failed:-2,failure:-2,wrong:-2,hard:-1,sorry:-1,sick:-2,tired:-2,annoying:-2,boring:-2,hell:-2,damn:-2,shit:-3,fuck:-4,fucking:-3,kill:-3,dead:-2,death:-2,war:-2,lost:-2,lose:-2,pain:-2,fear:-2,afraid:-2,worry:-2,worried:-2,no:-1,never:-1,cant:-1,problem:-2,issue:-1,crisis:-3 };
function tokenize(t) {
  return String(t || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/@[\w.-]+/g, ' ')
    .split(/[^\p{L}\p{N}']+/u).filter(Boolean);
}
const syllables = (w) => Math.max(1, (w.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) || []).length);

// ── LENSES ───────────────────────────────────────────────────────────────────
// rows → rows. Pure; no network.
const LENS = {
  ngrams(rows, p) {
    const n = p.n || 2, counts = new Map();
    for (const post of rows) {
      const t = tokenize(post.text);
      for (let i = 0; i + n - 1 < t.length; i++) {
        const g = t.slice(i, i + n).join(' ');
        if (t.slice(i, i + n).every((w) => STOP.has(w))) continue;
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
    return [...counts].map(([term, weight]) => ({ term, weight })).sort((a, b) => b.weight - a.weight);
  },
  distinctive(rows) {
    const counts = new Map();
    let total = 0;
    for (const post of rows) for (const w of tokenize(post.text)) {
      if (STOP.has(w) || w.length < 3) continue;
      counts.set(w, (counts.get(w) || 0) + 1); total++;
    }
    // weight rare-but-repeated words: frequency × length, damped — no corpus needed
    return [...counts].filter(([, c]) => c > 1)
      .map(([term, c]) => ({ term, weight: +(c * Math.log2(1 + term.length)).toFixed(2), count: c }))
      .sort((a, b) => b.weight - a.weight);
  },
  hashtags(rows) {
    const c = new Map();
    for (const p of rows) for (const t of p.tags) c.set(t, (c.get(t) || 0) + 1);
    return [...c].map(([term, weight]) => ({ term: '#' + term, weight })).sort((a, b) => b.weight - a.weight);
  },
  domains(rows) {
    const c = new Map();
    for (const p of rows) for (const l of p.links) {
      let h; try { h = new URL(l).hostname.replace(/^www\./, ''); } catch { continue; }
      if (/bsky\.(app|social)$/.test(h)) continue;
      c.set(h, (c.get(h) || 0) + 1);
    }
    return [...c].map(([term, weight]) => ({ term, weight })).sort((a, b) => b.weight - a.weight);
  },
  clock(rows) {
    const b = Array.from({ length: 24 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: 0 }));
    for (const p of rows) if (p.at) b[new Date(p.at).getHours()].value++;
    return b;
  },
  weekday(rows) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const b = names.map((label) => ({ label, value: 0 }));
    for (const p of rows) if (p.at) b[new Date(p.at).getDay()].value++;
    return b;
  },
  overTime(rows) {
    const c = new Map();
    for (const p of rows) {
      if (!p.at) continue;
      const d = new Date(p.at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      c.set(k, (c.get(k) || 0) + 1);
    }
    return [...c].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));
  },
  sentiment(rows) {
    const c = new Map();
    for (const p of rows) {
      if (!p.at) continue;
      const d = new Date(p.at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let s = 0, n = 0;
      for (const w of tokenize(p.text)) if (AFINN[w] != null) { s += AFINN[w]; n++; }
      if (!n) continue;
      const cur = c.get(k) || { sum: 0, n: 0 };
      cur.sum += s / n; cur.n++; c.set(k, cur);
    }
    return [...c].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, v]) => ({ label, value: +(v.sum / v.n).toFixed(3) }));
  },
  lengths(rows) {
    return rows.filter((p) => p.text).map((p) => ({
      x: tokenize(p.text).length, y: p.text.length,
      xLabel: 'words', yLabel: 'characters', label: p.text.slice(0, 90), uri: p.uri,
    }));
  },
  readability(rows) {
    return rows.filter((p) => tokenize(p.text).length > 3).map((p) => {
      const w = tokenize(p.text);
      const sents = Math.max(1, (p.text.match(/[.!?]+/g) || []).length);
      const syl = w.reduce((a, x) => a + syllables(x), 0);
      const flesch = 206.835 - 1.015 * (w.length / sents) - 84.6 * (syl / w.length);
      return { x: w.length, y: +flesch.toFixed(1), xLabel: 'words', yLabel: 'Flesch reading ease', label: p.text.slice(0, 90), uri: p.uri };
    });
  },
  engagement(rows) {
    return rows.map((p) => ({
      x: tokenize(p.text).length, y: p.likes + p.reposts,
      xLabel: 'words', yLabel: 'likes + reposts', label: p.text.slice(0, 90), uri: p.uri,
    }));
  },
  pictures(rows) {
    const out = [];
    for (const p of rows) for (const im of p.images) out.push({ ...im, uri: p.uri, text: p.text.slice(0, 120), likes: p.likes });
    return out;
  },
  mentions(rows) {
    const c = new Map();
    for (const p of rows) {
      const from = (p.author && p.author.handle) || 'them';
      for (const did of p.mentions) c.set(from + '\u0000' + did, (c.get(from + '\u0000' + did) || 0) + 1);
    }
    return [...c].map(([k, weight]) => { const [from, to] = k.split('\u0000'); return { from, to, weight }; });   // full did — the driver names it before drawing
  },
  replyTo(rows) {
    const c = new Map();
    for (const p of rows) {
      if (!p.replyToDid) continue;
      const from = (p.author && p.author.handle) || 'them';
      const k = from + '\u0000' + p.replyToDid;
      c.set(k, (c.get(k) || 0) + 1);
    }
    return [...c].map(([k, weight]) => { const [from, to] = k.split('\u0000'); return { from, to, weight }; });   // full did — the driver names it before drawing
  },
  cooccur(rows) {
    const c = new Map();
    for (const p of rows) {
      const keys = [...new Set([...p.tags.map((t) => '#' + t), ...p.links.map((l) => { try { return new URL(l).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean)])];
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const k = [keys[i], keys[j]].sort().join('\u0000');
        c.set(k, (c.get(k) || 0) + 1);
      }
    }
    return [...c].map(([k, weight]) => { const [from, to] = k.split('\u0000'); return { from, to, weight }; })
      .sort((a, b) => b.weight - a.weight);
  },
  reach(rows) {
    return rows.map((a) => ({
      x: a.follows, y: a.followers, xLabel: 'following', yLabel: 'followers',
      label: '@' + a.handle, avatar: a.avatar, handle: a.handle,
    }));
  },
  handles(rows) {
    const c = new Map();
    for (const a of rows) for (const part of String(a.handle || '').split(/[.\-_]/)) {
      if (part.length < 3 || part === 'bsky' || part === 'social' || part === 'com') continue;
      c.set(part, (c.get(part) || 0) + 1);
    }
    return [...c].map(([term, weight]) => ({ term, weight })).sort((a, b) => b.weight - a.weight);
  },
  bios(rows) {
    // Profile descriptions are full of bare URLs; tokenizing "site.com/x" leaves
    // "com" as the loudest word in the crowd, which is noise, not a finding.
    const DEBRIS = new Set(['com', 'org', 'net', 'www', 'http', 'https', 'bsky', 'social', 'app', 'href']);
    const c = new Map();
    for (const a of rows) for (const w of tokenize(a.description)) {
      if (STOP.has(w) || DEBRIS.has(w) || w.length < 3) continue;
      c.set(w, (c.get(w) || 0) + 1);
    }
    return [...c].filter(([, n]) => n > 1)
      .map(([term, weight]) => ({ term, weight })).sort((a, b) => b.weight - a.weight);
  },
};
const short = (d) => (d && d.startsWith('did:') ? d.slice(0, 14) + '…' : d);

// Pair lenses fold TWO sets into one — they are the reason `two` exists.
const PAIR_LENS = {
  overlap(A, B) {
    const inB = new Set(B.map((a) => a.did));
    return A.filter((a) => inB.has(a.did));
  },
  exclusive(A, B) {
    const inB = new Set(B.map((a) => a.did));
    const inA = new Set(A.map((a) => a.did));
    return [...A.filter((a) => !inB.has(a.did)), ...B.filter((a) => !inA.has(a.did))];
  },
};

// ── the driver ───────────────────────────────────────────────────────────────
/**
 * Run a genome against real bindings.
 * @param g       genome from engine.generateToy
 * @param inputs  { handle, other?, list? }
 * @param ctx     { signal, onStage(msg), progress(n) }
 * @returns { port, sets:[{label, rows}], meta }
 */
export async function runToy(g, inputs, ctx = {}) {
  const stage = ctx.onStage || (() => {});
  const bindings = [];

  if (g.subject === 'list') {
    const list = String(inputs.list || '').trim();
    if (!list) throw new Error('give a Bluesky list URL');
    bindings.push({ label: 'the list', list: await toListUri(list) });
  } else {
    stage('resolving…');
    const a = await resolveActor(inputs.handle);
    bindings.push({ label: '@' + cleanHandle(inputs.handle), did: a });
    if (g.subject === 'two') {
      if (!inputs.other) throw new Error('this toy needs a second handle');
      const b = await resolveActor(inputs.other);
      bindings.push({ label: '@' + cleanHandle(inputs.other), did: b });
    }
  }

  // 1. source, per binding
  stage(`gathering ${g.source}…`);
  const sets = [];
  for (const bind of bindings) {
    const rows = await SRC[g.source](bind, g, ctx);
    sets.push({ label: bind.label, rows });
  }
  let port = 'x';

  // 2. lens chain
  let cur = sets;
  for (const step of g.chain) {
    stage(`measuring: ${step.lens}…`);
    if (PAIR_LENS[step.lens]) {
      const merged = PAIR_LENS[step.lens](cur[0] ? cur[0].rows : [], cur[1] ? cur[1].rows : []);
      cur = [{ label: `${sets[0].label} ${step.lens === 'overlap' ? '∩' : '△'} ${sets[1] ? sets[1].label : ''}`, rows: merged }];
    } else {
      cur = cur.map((s) => ({ label: s.label, rows: LENS[step.lens](s.rows, step.params || {}) }));
    }
  }

  // 3. edges built from facets carry raw DIDs; a graph labelled did:plc:xgvzy7…
  //    is unreadable, so resolve them to handles before drawing.
  if (g.port === 'edges' || VIEWS_EDGES.has(g.view)) {
    stage('naming the nodes…');
    cur = await hydrateEdges(cur, ctx.signal);
  }

  // 4. cap what the view has to draw
  const cap = capFor(g.view, g.topK);
  cur = cur.map((s) => ({ label: s.label, rows: cap ? s.rows.slice(0, cap) : s.rows }));

  const total = cur.reduce((a, s) => a + s.rows.length, 0);
  return { port: g.port, sets: cur, meta: { total, bindings: bindings.map((b) => b.label) } };
}
const VIEWS_EDGES = new Set(['graph']);
// Batch-resolve every did:-shaped endpoint to its handle (25 per getProfiles call).
async function hydrateEdges(sets, signal) {
  const dids = new Set();
  for (const s of sets) for (const r of s.rows) {
    if (typeof r.from === 'string' && r.from.startsWith('did:')) dids.add(r.from);
    if (typeof r.to === 'string' && r.to.startsWith('did:')) dids.add(r.to);
  }
  if (!dids.size) return sets;
  const map = new Map();
  const list = [...dids];
  for (let i = 0; i < list.length && i < 200; i += 25) {
    const slice = list.slice(i, i + 25);
    try {
      const d = await jget(`${PUB}/app.bsky.actor.getProfiles?actors=${slice.map(encodeURIComponent).join('&actors=')}`, signal);
      for (const p of (d.profiles || [])) map.set(p.did, p.handle);
    } catch { /* unresolved ones fall back to a truncated did */ }
  }
  const name = (v) => (typeof v === 'string' && v.startsWith('did:')) ? (map.get(v) || short(v)) : v;
  return sets.map((s) => ({ label: s.label, rows: s.rows.map((r) => ({ ...r, from: name(r.from), to: name(r.to) })) }));
}

function capFor(view, topK) {
  if (view === 'ranked' || view === 'cloud') return topK;
  if (view === 'grid') return Math.max(topK, 48);
  if (view === 'wall') return 60;
  if (view === 'graph') return 120;
  if (view === 'scatter' || view === 'histo') return 600;
  return 0;
}
async function toListUri(s) {
  if (s.startsWith('at://')) return s;
  // https://bsky.app/profile/<handle|did>/lists/<rkey>
  const m = s.match(/profile\/([^/]+)\/lists\/([^/?#]+)/);
  if (!m) throw new Error('paste a Bluesky list URL');
  const did = await resolveActor(m[1]);
  return `at://${did}/app.bsky.graph.list/${m[2]}`;
}

// ── VIEWS ────────────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const postUrl = (uri) => { const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/.exec(uri || ''); return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null; };
const SET_COLORS = ['var(--sky)', 'var(--gold)'];

/** Draw `data` into `el`. Returns a short headline string (used by the share sink). */
export function render(el, g, data) {
  el.innerHTML = '';
  const sets = data.sets.filter((s) => s.rows.length);
  if (!sets.length) {
    el.innerHTML = '<p class="empty">Nothing came back for that. Try another handle — or a toy pointed at something they actually do.</p>';
    return 'nothing to report';
  }
  return (VIEW[g.view] || VIEW.ranked)(el, g, sets);
}

const VIEW = {
  ranked(el, g, sets) {
    const wrap = document.createElement('div');
    for (const s of sets) {
      const max = Math.max(...s.rows.map((r) => r.weight || 0), 1);
      const h = sets.length > 1 ? `<div class="set-label">${esc(s.label)}</div>` : '';
      wrap.innerHTML += h + '<ol class="ranked">' + s.rows.map((r) =>
        `<li><span class="t">${esc(r.term)}</span><span class="barwrap"><i style="width:${(100 * (r.weight || 0) / max).toFixed(1)}%"></i></span><span class="w">${r.weight}</span></li>`
      ).join('') + '</ol>';
    }
    el.appendChild(wrap);
    const top = sets[0].rows[0];
    return top ? `“${top.term}” (${top.weight}×) tops the list` : '';
  },
  cloud(el, g, sets) {
    const wrap = document.createElement('div');
    for (const s of sets) {
      const max = Math.max(...s.rows.map((r) => r.weight || 0), 1);
      const h = sets.length > 1 ? `<div class="set-label">${esc(s.label)}</div>` : '';
      wrap.innerHTML += h + '<div class="cloud">' + s.rows.map((r) => {
        const sz = 0.75 + 1.9 * Math.sqrt((r.weight || 0) / max);
        return `<span style="font-size:${sz.toFixed(2)}rem;opacity:${(0.5 + 0.5 * (r.weight / max)).toFixed(2)}">${esc(r.term)}</span>`;
      }).join(' ') + '</div>';
    }
    el.appendChild(wrap);
    return sets[0].rows[0] ? `“${sets[0].rows[0].term}” looms largest` : '';
  },
  bars(el, g, sets) {
    const wrap = document.createElement('div');
    const max = Math.max(...sets.flatMap((s) => s.rows.map((r) => Math.abs(r.value) || 0)), 1);
    for (const s of sets) {
      const h = sets.length > 1 ? `<div class="set-label">${esc(s.label)}</div>` : '';
      wrap.innerHTML += h + '<div class="bars">' + s.rows.map((r) =>
        `<div class="bar"><i style="height:${(100 * Math.abs(r.value) / max).toFixed(1)}%"></i><span>${esc(r.label)}</span><b>${r.value}</b></div>`
      ).join('') + '</div>';
    }
    el.appendChild(wrap);
    const peak = sets[0].rows.slice().sort((a, b) => b.value - a.value)[0];
    return peak ? `peaks at ${peak.label} (${peak.value})` : '';
  },
  histo(el, g, sets) {
    // bucket the y axis of scalar rows
    const wrap = document.createElement('div');
    for (const s of sets) {
      const vals = s.rows.map((r) => r.y).filter((v) => isFinite(v));
      if (!vals.length) continue;
      const lo = Math.min(...vals), hi = Math.max(...vals), B = 18;
      const step = (hi - lo) / B || 1;
      const buckets = Array.from({ length: B }, (_, i) => ({ label: (lo + i * step).toFixed(0), value: 0 }));
      for (const v of vals) buckets[Math.min(B - 1, Math.floor((v - lo) / step))].value++;
      const max = Math.max(...buckets.map((b) => b.value), 1);
      const h = sets.length > 1 ? `<div class="set-label">${esc(s.label)}</div>` : '';
      wrap.innerHTML += h + `<div class="axis-note">${esc(s.rows[0].yLabel || '')}</div><div class="bars">` + buckets.map((b) =>
        `<div class="bar"><i style="height:${(100 * b.value / max).toFixed(1)}%"></i><span>${b.label}</span><b>${b.value}</b></div>`
      ).join('') + '</div>';
    }
    el.appendChild(wrap);
    const n = sets[0].rows.length;
    const mean = sets[0].rows.reduce((a, r) => a + r.y, 0) / (n || 1);
    return `${n} items, averaging ${mean.toFixed(1)} ${sets[0].rows[0].yLabel || ''}`.trim();
  },
  dial(el, g, sets) {
    const c = canvas(el, 460, 460);
    const ctx = c.getContext('2d');
    const W = c.width / devicePixelRatio, H = c.height / devicePixelRatio;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 34;
    const max = Math.max(...sets.flatMap((s) => s.rows.map((r) => r.value)), 1);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1;
    for (const f of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); }
    sets.forEach((s, si) => {
      const N = s.rows.length;
      ctx.beginPath();
      s.rows.forEach((r, i) => {
        const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
        const rr = R * (0.12 + 0.88 * (r.value / max));
        const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = cssColor(SET_COLORS[si] || '--sky'); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = withAlpha(cssColor(SET_COLORS[si] || '--sky'), 0.16); ctx.fill();
    });
    ctx.fillStyle = cssVar('--muted'); ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center';
    sets[0].rows.forEach((r, i) => {
      if (sets[0].rows.length > 12 && i % 2) return;
      const ang = (i / sets[0].rows.length) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(r.label, cx + Math.cos(ang) * (R + 16), cy + Math.sin(ang) * (R + 16) + 4);
    });
    const peak = sets[0].rows.slice().sort((a, b) => b.value - a.value)[0];
    return peak ? `busiest at ${peak.label} (${peak.value})` : '';
  },
  scatter(el, g, sets) {
    const c = canvas(el, 640, 420);
    const ctx = c.getContext('2d');
    const W = c.width / devicePixelRatio, H = c.height / devicePixelRatio;
    const pad = 46;
    const all = sets.flatMap((s) => s.rows);
    const xs = all.map((r) => r.x), ys = all.map((r) => r.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = (v) => pad + (W - pad * 1.4) * ((v - x0) / ((x1 - x0) || 1));
    const sy = (v) => H - pad - (H - pad * 1.5) * ((v - y0) / ((y1 - y0) || 1));
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = cssVar('--rule'); ctx.beginPath();
    ctx.moveTo(pad, H - pad); ctx.lineTo(W - 8, H - pad); ctx.moveTo(pad, H - pad); ctx.lineTo(pad, 10); ctx.stroke();
    sets.forEach((s, si) => {
      ctx.fillStyle = withAlpha(cssColor(SET_COLORS[si] || '--sky'), 0.55);
      for (const r of s.rows) { ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), 3.2, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.fillStyle = cssVar('--muted'); ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.fillText(all[0].xLabel || 'x', W / 2, H - 12);
    ctx.save(); ctx.translate(13, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(all[0].yLabel || 'y', 0, 0); ctx.restore();
    const mx = all.reduce((a, r) => a + r.x, 0) / all.length, my = all.reduce((a, r) => a + r.y, 0) / all.length;
    return `${all.length} posts, averaging ${mx.toFixed(0)} ${all[0].xLabel} and ${my.toFixed(1)} ${all[0].yLabel}`;
  },
  graph(el, g, sets) {
    const rows = sets.flatMap((s) => s.rows);
    const names = [...new Set(rows.flatMap((r) => [r.from, r.to]))];
    const idx = new Map(names.map((n, i) => [n, i]));
    const R = rngLocal(g.seed);
    const nodes = names.map((n) => ({ n, x: R() * 2 - 1, y: R() * 2 - 1, vx: 0, vy: 0, deg: 0 }));
    const links = rows.map((r) => ({ a: idx.get(r.from), b: idx.get(r.to), w: r.weight }));
    for (const l of links) { nodes[l.a].deg += l.w; nodes[l.b].deg += l.w; }
    // Fruchterman-Reingold, the same shape the read/ mythograph uses
    for (let it = 0; it < 320; it++) {
      const k = 0.9, t = 0.1 * (1 - it / 320);
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        let d2 = dx * dx + dy * dy + 0.001; const f = (k * k) / d2 * 0.02;
        nodes[i].vx += dx * f; nodes[i].vy += dy * f; nodes[j].vx -= dx * f; nodes[j].vy -= dy * f;
      }
      for (const l of links) {
        const A = nodes[l.a], B = nodes[l.b];
        const dx = B.x - A.x, dy = B.y - A.y; const f = 0.045 * Math.min(l.w, 5);
        A.vx += dx * f; A.vy += dy * f; B.vx -= dx * f; B.vy -= dy * f;
      }
      for (const n of nodes) { n.x += Math.max(-t, Math.min(t, n.vx)); n.y += Math.max(-t, Math.min(t, n.vy)); n.vx *= 0.82; n.vy *= 0.82; }
    }
    const c = canvas(el, 660, 480);
    const ctx = c.getContext('2d');
    const W = c.width / devicePixelRatio, H = c.height / devicePixelRatio;
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const P = 40;
    const sx = (v) => P + (W - P * 2) * ((v - x0) / ((x1 - x0) || 1));
    const sy = (v) => P + (H - P * 2) * ((v - y0) / ((y1 - y0) || 1));
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = withAlpha(cssColor('var(--sky)'), 0.28);
    for (const l of links) {
      ctx.lineWidth = Math.min(3, 0.5 + l.w * 0.35);
      ctx.beginPath(); ctx.moveTo(sx(nodes[l.a].x), sy(nodes[l.a].y)); ctx.lineTo(sx(nodes[l.b].x), sy(nodes[l.b].y)); ctx.stroke();
    }
    const maxDeg = Math.max(...nodes.map((n) => n.deg), 1);
    ctx.textAlign = 'center'; ctx.font = '10px ui-monospace, monospace';
    for (const n of nodes) {
      const r = 3 + 7 * Math.sqrt(n.deg / maxDeg);
      ctx.fillStyle = cssColor('var(--sky)');
      ctx.beginPath(); ctx.arc(sx(n.x), sy(n.y), r, 0, Math.PI * 2); ctx.fill();
      if (n.deg > maxDeg * 0.18) {
        ctx.fillStyle = cssVar('--text');
        ctx.fillText(n.n.slice(0, 22), sx(n.x), sy(n.y) - r - 4);
      }
    }
    const hub = nodes.slice().sort((a, b) => b.deg - a.deg)[0];
    return hub ? `${nodes.length} nodes, ${links.length} links — “${hub.n}” at the centre` : '';
  },
  grid(el, g, sets) {
    const wrap = document.createElement('div');
    for (const s of sets) {
      const h = sets.length > 1 ? `<div class="set-label">${esc(s.label)}</div>` : '';
      wrap.innerHTML += h + '<div class="grid">' + s.rows.map((a) =>
        `<a class="cell" href="https://bsky.app/profile/${esc(a.handle)}" target="_blank" rel="noopener" title="@${esc(a.handle)}">` +
        (a.avatar ? `<img src="${esc(a.avatar)}" alt="" loading="lazy">` : '<span class="noav"></span>') +
        `<span class="h">@${esc(a.handle)}</span></a>`).join('') + '</div>';
    }
    el.appendChild(wrap);
    const n = sets.reduce((a, s) => a + s.rows.length, 0);
    return `${n} account${n === 1 ? '' : 's'}`;
  },
  wall(el, g, sets) {
    const wrap = document.createElement('div');
    for (const s of sets) {
      const h = sets.length > 1 ? `<div class="set-label">${esc(s.label)}</div>` : '';
      wrap.innerHTML += h + '<div class="wall">' + s.rows.map((im) => {
        const u = postUrl(im.uri);
        return `<a class="plate"${u ? ` href="${u}" target="_blank" rel="noopener"` : ''} title="${esc(im.alt || im.text)}">` +
          `<img src="${esc(im.thumb || im.full)}" alt="${esc(im.alt)}" loading="lazy"></a>`;
      }).join('') + '</div>';
    }
    el.appendChild(wrap);
    const n = sets.reduce((a, s) => a + s.rows.length, 0);
    return `${n} picture${n === 1 ? '' : 's'}`;
  },
};

// ── small dom/canvas helpers ─────────────────────────────────────────────────
function canvas(el, w, h) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const box = el.clientWidth || w;
  const W = Math.min(w, box), H = Math.round(h * (W / w));
  c.width = W * dpr; c.height = H * dpr;
  c.style.width = W + 'px'; c.style.height = H + 'px';
  c.getContext('2d').scale(dpr, dpr);
  el.appendChild(c);
  return c;
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}
function cssColor(v) {
  const m = /var\((--[\w-]+)\)/.exec(v);
  return m ? cssVar(m[1]) : v;
}
function withAlpha(color, a) {
  const c = String(color).trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return c;
}
function rngLocal(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) { h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── what this file actually implements ───────────────────────────────────────
// Exported so runtime.selftest.mjs can assert, node by node, that the engine's
// vocabulary and these executors are the SAME SET. If they ever drift, the
// generator can mint a permalink that cannot run — the one failure mode that
// would make the whole surface dishonest. The test is the guard.
export const REGISTRY = {
  sources: Object.keys(SRC),
  lenses: [...Object.keys(LENS), ...Object.keys(PAIR_LENS)],
  views: Object.keys(VIEW),
};
export const __test = { LENS, PAIR_LENS, normPost, tokenize };
