// portrait.mjs — everything known about one account, small enough to prompt with.
//
// WHAT THIS IS FOR. The bot can post an image (scripts/lib/bsky.mjs, uploadBlob)
// and it can generate one (scripts/lib/imagegen.mjs). Neither of those knows
// WHAT to draw. This is the part that reads somebody's repo and hands a model
// enough to invent a picture of them that is about their SUBJECTS, not just
// their statistics.
//
// WHY NOT PALM ALONE. b/palm already reads a whole repo and returns six
// stylometric axes and an archetype — "The Signal Fire — broadcasting, but it
// goes out at night". That is a real reading and it is used here. It is also
// entirely about FORM: cadence, vigil, lexicon, polish, drift, chorus. Ask it
// what somebody is interested in and it has nothing, because it never looks at
// what a word means. A portrait built on palm alone is six numbers wearing a
// hat — every account gets the same picture in a different colour.
//
// So three sources, and each one answers something the others cannot:
//
//   the CAR       every post they ever wrote        subjects, vocabulary, drift
//   the AppView   like and repost counts            which posts actually landed
//   the profile   avatar, banner, bio, counts       what they chose to look like
//
// THE CAR IS THE ONLY COMPLETE SOURCE AND IT IS ONE REQUEST. com.atproto.sync
// .getRepo is public and unauthenticated and returns the entire repository, so
// a 50,000-post history costs one fetch rather than 500 paginated ones. It is
// also the only source with no engagement counts in it at all — likes live in
// OTHER people's repos and only the AppView aggregates them. Hence both.
//
// Pure functions (tokens, interests, greatestHits, tempo, renderDigest) are
// separated from the network so portrait.selftest.mjs can drive them on a bare
// `node` run.

import { writeFileSync } from 'node:fs';
import { streamRepo } from '../../packages/atproto/car.js';
import { resolveHandle, resolvePds } from '../../packages/atproto/pds.js';

/** PALM IS OPTIONAL, AND THAT IS NOT A STYLE PREFERENCE — IT IS NOT ALWAYS
 *  THERE. b/palm is a surface owned by another branch, so on the branch the
 *  factory actually deploys from, b/palm/ does not exist. A top-level import of
 *  it turns "the portrait has no stylometry" into "the script will not start",
 *  which is the difference between a slightly thinner picture and a feature
 *  that cannot run at all.
 *
 *  The CAR reader was moved into packages/atproto/car.js for exactly this
 *  reason — it is shared library code and belongs where shared code lives. The
 *  six axes are palm's own work and stay palm's; this reads them when they are
 *  in the tree and shrugs when they are not. buildDigest already treats palm as
 *  absent when there is no baseline, so the degradation path was already built
 *  and tested; this only widens what counts as absent. */
async function loadPalm() {
  try {
    const [axes, baseline, matrix] = await Promise.all([
      import('../../b/palm/axes.js'),
      import('../../b/palm/baseline.js'),
      import('../../b/palm/matrix.js'),
    ]);
    return { readings: axes.readings, score: baseline.score, archetype: matrix.archetype };
  } catch {
    return null;
  }
}

const APPVIEW = 'https://public.api.bsky.app/xrpc';

/** Words that are top-twenty in every corpus and therefore describe nobody.
 *  Deliberately includes the conversational filler that dominates social text —
 *  "think", "people", "time" are not interests, they are English. */
export const STOP = new Set(`
a about above after again against all also am an and any are aren't as at back be because been
before being below between both but by can cannot can't could couldn't did didn't do does doesn't
doing don't down during each even ever every few for from further get got had hadn't has hasn't
have haven't having he her here hers herself him himself his how i i'm if in into is isn't it it's
its itself just let's like lot make many may me might more most much must my myself need no nor not
now of off on once one only or other ought our ours ourselves out over own really same shan't she
should shouldn't so some still such take than that that's the their theirs them themselves then
there there's these they thing things this those though through to too under until up us very want
was wasn't way we well were weren't what what's when where which while who whom why will with won't
would wouldn't yeah yes yet you your yours yourself yourselves
actually always anything come coming everyone getting give going gonna good great guy guys happen
happened haha know known lol looking love new nice okay people person post posted posts pretty put
right saying says see seeing seen something sure thanks think thinking thought time today told
using wait watch went whole work working world year years bsky social com net org http https www
ain't aren't could've didn't he's how's i'd i'll i've she's should've they'd they'll they're they've
we'd we'll we're we've weren't what've where's who'd who's would've you'd you'll you're you've
it'd that'd that'll there'd there'll here'd hasn't ain't oughta lemme gimme
absolutely actual almost already alright anybody anyone anymore anything anyway basically better best
big bit both certainly clearly definitely different early easy either enough entire especially exactly
far feel feels find found full generally gone gotta guess half happy hear heard help here's honestly
huge idea ideas instead keep keeps kind kinda last late later least less literally little long look
looks maybe mean means mind moment months near need needed never next nobody nothing obviously often
old part parts perhaps place point points possibly probably quite rather reason remember said saying
second seem seems sense several short show side simply since small someone sometimes soon sort sorta
sounds start started stop stuff talk talked talking tell tells thanks thing third three total totally
tried tries true try trying turn turned two understand usually version wanna weeks wonder wondering
whatever whether whose wrong
`.trim().split(/\s+/));

/** Tokens for topic counting: lowercased words, URLs and @handles removed, and
 *  nothing shorter than three characters. Kept separate from palm's own
 *  tokenizer (b/palm/axes.js `words`) on purpose — that one is tuned for
 *  measuring vocabulary breadth and keeps things this one wants gone. */
export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    // CURLY APOSTROPHES FIRST, AND THIS IS NOT COSMETIC. Phones type "it’s"
    // (U+2019) and stoplists are written "it's" (U+0027), so without this every
    // contraction survives the stoplist — the first real run came back with
    // it’s (4836), i’m (2462), that’s (2086) as somebody's top three interests.
    .replace(/[’‘`]/g, "'")
    // A URL WITH NO SCHEME IS STILL A URL. This corpus writes links as
    // "mino.mobi/mappa/", which the scheme-only pattern let through and then
    // tokenised into mino / mobi / mappa — three of the top ten "interests"
    // were fragments of the author's own domain. Anything with a dot and a
    // path goes; the `domains` view below counts it properly instead.
    .replace(/https?:\/\/\S+|\bwww\.\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/g, ' ')
    .replace(/@[a-z0-9][a-z0-9.-]*/g, ' ')
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !/^['-]/.test(w));
}

const top = (map, k) => [...map.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, k)
  .map(([term, n]) => ({ term, n }));

/**
 * What an account is ABOUT, counted off its own text.
 *
 * Five views, because they fail in different places: a hashtag user leaves no
 * distinctive unigrams, a link-poster leaves no words at all, and somebody who
 * only ever replies leaves nothing but handles. Whichever is empty, the others
 * usually are not.
 *
 * NO TF-IDF, AND THAT IS A CHOICE. Weighting against a background corpus is the
 * textbook answer and this repo even has a pool to build one from
 * (b/palm/corpus.json, 77 accounts) — but that pool is a curated roster of
 * posters who all sound rather alike, so "distinctive against it" would mostly
 * surface whatever the roster happens not to talk about. Raw frequency after a
 * hard stoplist is cruder, has no hidden reference class, and the model reading
 * this can be told the counts.
 */
export function interests(posts, { k = 24, recentDays = 365, now = Date.now() } = {}) {
  const uni = new Map(), bi = new Map(), tags = new Map(), domains = new Map(), mentions = new Map();
  const recentUni = new Map();
  const cutoff = now - recentDays * 86400_000;
  let recentPosts = 0;

  for (const p of posts) {
    const text = p.text || '';
    if (!text.trim()) continue;
    const t = Date.parse(p.createdAt || '') || 0;
    const isRecent = t >= cutoff;
    if (isRecent) recentPosts++;

    const ws = tokens(text);
    for (let i = 0; i < ws.length; i++) {
      uni.set(ws[i], (uni.get(ws[i]) || 0) + 1);
      if (isRecent) recentUni.set(ws[i], (recentUni.get(ws[i]) || 0) + 1);
      if (i + 1 < ws.length) {
        const pair = `${ws[i]} ${ws[i + 1]}`;
        bi.set(pair, (bi.get(pair) || 0) + 1);
      }
    }
    for (const m of text.matchAll(/#(\p{L}[\p{L}\p{N}_]{1,30})/gu)) {
      const tag = m[1].toLowerCase();
      tags.set(tag, (tags.get(tag) || 0) + 1);
    }
    // The display text of a link is often truncated ("example.com/some/lo…"),
    // but the host survives truncation, which is the part worth counting. A
    // scheme is optional — half of what people post is "example.com/thing" —
    // so a path is accepted as the other proof that this is a link and not a
    // sentence that happened to contain a full stop.
    for (const m of text.matchAll(/(?:https?:\/\/((?:[a-z0-9-]+\.)+[a-z]{2,})|\b((?:[a-z0-9-]+\.)+[a-z]{2,})\/)/gi)) {
      const host = (m[1] || m[2]).toLowerCase().replace(/^www\./, '');
      domains.set(host, (domains.get(host) || 0) + 1);
    }
    for (const m of text.matchAll(/@([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)) {
      const h = m[1].toLowerCase();
      mentions.set(h, (mentions.get(h) || 0) + 1);
    }
  }

  return {
    terms: top(uni, k),
    // Bigrams are noisier than unigrams and there are more of them, so they get
    // a floor: a pair seen twice is a coincidence, not a subject.
    phrases: top(new Map([...bi].filter(([, n]) => n >= 3)), Math.round(k / 2)),
    lately: top(recentUni, Math.round(k / 2)),
    hashtags: top(tags, 10),
    domains: top(domains, 10),
    talksTo: top(mentions, 10),
    recentPosts,
    recentDays,
  };
}

/**
 * The ten that landed. Ranked by likes plus twice reposts.
 *
 * REPLIES ARE NOT IN THE SCORE, and that is deliberate: a reply count is as
 * easily a pile-on as a hit, and the one thing this must not do is hand the
 * model somebody's worst day and call it a highlight. Reposts count double
 * because a repost costs the reposter something — their own timeline.
 */
export function greatestHits(items, k = 10) {
  const seen = new Set();
  const ranked = [];
  for (const it of items) {
    if (!it || !it.uri || seen.has(it.uri)) continue;
    seen.add(it.uri);
    // A POST WITH NO TEXT TELLS THE PROMPT MODEL NOTHING. The first real run
    // spent slot 4 of 10 on a 108-like post whose whole content was an image
    // the model cannot see. It is a genuine hit and it is not usable here.
    if (!String(it.text || '').trim()) continue;
    const likes = it.likeCount ?? 0, reposts = it.repostCount ?? 0;
    ranked.push({ ...it, likes, reposts, weight: likes + 2 * reposts });
  }
  ranked.sort((a, b) => b.weight - a.weight || String(a.uri).localeCompare(String(b.uri)));
  return ranked.slice(0, k);
}

/** Shape of the posting life: when it started, how fast, how much of it is
 *  conversation rather than broadcast. Cheap, and it is what makes a portrait
 *  read as somebody's account rather than as a generic figure. */
export function tempo(posts) {
  const times = posts.map((p) => Date.parse(p.createdAt || '')).filter(Number.isFinite).sort((a, b) => a - b);
  if (!times.length) return { posts: posts.length, first: null, last: null, perDay: 0, replyShare: 0, peakHour: null };
  const spanDays = Math.max(1, (times[times.length - 1] - times[0]) / 86400_000);
  const hours = new Array(24).fill(0);
  for (const t of times) hours[new Date(t).getUTCHours()]++;
  const replies = posts.filter((p) => p.isReply).length;
  return {
    posts: posts.length,
    first: new Date(times[0]).toISOString().slice(0, 10),
    last: new Date(times[times.length - 1]).toISOString().slice(0, 10),
    // Kept precise rather than pretty — rateText() does the prose. Rounding to
    // one decimal here turned everybody who posts less than weekly into
    // "0.0/day", which reads as a dead account rather than as a quiet one.
    perDay: +(posts.length / spanDays).toFixed(4),
    replyShare: +(replies / posts.length).toFixed(2),
    peakHour: hours.indexOf(Math.max(...hours)),
  };
}

/** Posting rate in the unit that makes it legible. Somebody who posts twice a
 *  month is "1.9/month", not "0.06/day" — same number, and only one of them
 *  tells a model what kind of poster it is looking at. */
export function rateText(perDay) {
  if (perDay >= 1) return `${perDay.toFixed(1)}/day`;
  if (perDay * 7 >= 1) return `${(perDay * 7).toFixed(1)}/week`;
  const perMonth = perDay * 30.44;
  return `${perMonth.toFixed(perMonth < 1 ? 2 : 1)}/month`;
}

/** The whole digest as markdown, because the thing reading it is a language
 *  model and this is the format it reasons best over. Also the artefact a human
 *  reads when a portrait comes out wrong — so it is written to be legible, not
 *  compact. */
export function renderDigest(d) {
  const L = [];
  const list = (rows) => rows.map((r) => `${r.term} (${r.n})`).join(' · ') || '—';

  L.push(`# @${d.handle}${d.displayName ? ` — ${d.displayName}` : ''}`);
  if (d.bio) L.push(`\n> ${d.bio.replace(/\s+/g, ' ').trim()}`);
  L.push('');
  L.push(`${d.tempo.posts.toLocaleString('en-US')} posts in the repo · ${d.tempo.first} → ${d.tempo.last}`
    + ` · ${rateText(d.tempo.perDay)} · ${Math.round(d.tempo.replyShare * 100)}% replies · busiest around ${d.tempo.peakHour}:00 UTC`);
  if (d.counts) L.push(`${d.counts.followers?.toLocaleString('en-US')} followers · following ${d.counts.follows?.toLocaleString('en-US')}`);
  if (d.avatarFile) L.push(`\nTheir avatar is at ${d.avatarFile} — LOOK AT IT.`);

  if (d.palm?.archetype) {
    L.push(`\n## How they post (stylometry, b/palm)\n`);
    L.push(`**${d.palm.archetype.name}** — ${d.palm.archetype.read} (${d.palm.archetype.spread})`);
    L.push(d.palm.axes.map((a) => `${a.label.toLowerCase()} ${a.pct === null ? '—' : Math.round(a.pct)}`).join(' · '));
    L.push(`composite ${d.palm.composite}/100 — ${d.palm.band}`);
  }

  L.push(`\n## What they talk about\n`);
  // PHRASES LEAD, and that ordering is a finding rather than a preference. On a
  // real 50,000-post corpus the unigram list came back "real · day · around ·
  // first · hard" — true, and true of everybody — while the collocations were
  // "book club · moby dick · become water · wizard wednesday". Raw frequency
  // without a background corpus is noisy at the top; a repeated two-word phrase
  // is somebody's actual subject. Both go, in the order they are worth reading.
  L.push(`phrases (repeated collocations — usually the strongest signal here): ${list(d.interests.phrases)}`);
  L.push(`words (raw frequency, so the head of this list is generic): ${list(d.interests.terms)}`);
  L.push(`lately (last ${d.interests.recentDays} days, ${d.interests.recentPosts} posts): ${list(d.interests.lately)}`);
  if (d.interests.hashtags.length) L.push(`hashtags: ${list(d.interests.hashtags)}`);
  if (d.interests.domains.length) L.push(`links to: ${list(d.interests.domains)}`);
  if (d.interests.talksTo.length) L.push(`talks to: ${list(d.interests.talksTo)}`);

  if (d.hits.length) {
    L.push(`\n## Greatest hits — ${d.hitScope}\n`);
    d.hits.forEach((h, i) => {
      L.push(`${i + 1}. (${h.likes}♥ ${h.reposts}↻) ${JSON.stringify((h.text || '').replace(/\s+/g, ' ').slice(0, 280))}`);
    });
  }
  return L.join('\n') + '\n';
}

// ── the network half ─────────────────────────────────────────────────────────

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.split('?')[0].split('/').pop()} ${res.status}`);
  return res.json();
}

export async function fetchProfile(actor) {
  return json(`${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
}

/**
 * Engagement counts, which the CAR does not carry.
 *
 * PAGED, WITH A BUDGET, AND THE BUDGET IS REPORTED. Ten pages is a thousand
 * posts; for most accounts that is the whole history and "top ten ever" is
 * literally true. For a 50,000-post account it is the last thousand, and saying
 * "top ten ever" would be a small lie told to a model that will repeat it in
 * public. So the scope comes back with the data and renderDigest prints it.
 */
export async function fetchFeed(did, { pages = 15, filter = 'posts_no_replies' } = {}) {
  const out = [];
  let cursor, n = 0, exhausted = false;
  while (n < pages) {
    const params = new URLSearchParams({ actor: did, limit: '100', filter });
    if (cursor) params.set('cursor', cursor);
    const data = await json(`${APPVIEW}/app.bsky.feed.getAuthorFeed?${params}`);
    for (const item of data.feed || []) {
      // A repost is somebody else's post on their timeline. It is not theirs and
      // its like count is not theirs either.
      if (item.reason || item.post?.author?.did !== did) continue;
      out.push({
        uri: item.post.uri,
        text: item.post.record?.text || '',
        createdAt: item.post.record?.createdAt || item.post.indexedAt,
        likeCount: item.post.likeCount ?? 0,
        repostCount: item.post.repostCount ?? 0,
        replyCount: item.post.replyCount ?? 0,
      });
    }
    n++;
    cursor = data.cursor;
    if (!cursor) { exhausted = true; break; }
  }
  return { items: out, pages: n, exhausted };
}

/**
 * A second, cheap shot at posts older than the feed budget reaches.
 *
 * searchPosts sorted by top returns bangers from the whole indexed history in
 * ONE call, which is exactly the gap paging leaves. It is a bonus source and
 * treated as one: the index is incomplete for old posts, the ranking is
 * undocumented, and any failure here is silent.
 */
export async function searchTop(handle, { limit = 25 } = {}) {
  try {
    const params = new URLSearchParams({ q: '*', author: handle, sort: 'top', limit: String(limit) });
    const data = await json(`${APPVIEW}/app.bsky.feed.searchPosts?${params}`);
    return (data.posts || []).map((p) => ({
      uri: p.uri,
      text: p.record?.text || '',
      createdAt: p.record?.createdAt || p.indexedAt,
      likeCount: p.likeCount ?? 0,
      repostCount: p.repostCount ?? 0,
      replyCount: p.replyCount ?? 0,
    }));
  } catch {
    return [];
  }
}

/** The avatar, onto disk, so the model can look at it.
 *
 *  HOST-PINNED RATHER THAN safe-fetch'd. The URL comes from the AppView and is
 *  always on the Bluesky CDN; anything else arriving in that field is a reason
 *  to stop, not a reason to fetch more carefully. Same allowlist the lab
 *  worker's /_img/ proxy uses, for the same reason. */
export async function fetchAvatar(url, dest) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !/(^|\.)bsky\.app$/.test(u.hostname)) {
    console.log(`::warning::avatar is not on the Bluesky CDN (${u.hostname}) — skipping it`);
    return null;
  }
  const res = await fetch(u);
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 4_000_000) return null;
  writeFileSync(dest, bytes);
  return dest;
}

/**
 * Everything, assembled.
 *
 * Every source past the CAR is best-effort: a portrait with no engagement data
 * is a worse portrait, and no portrait at all is a worse outcome than that.
 */
export async function buildDigest(actor, {
  feedPages = 15,
  avatarPath = null,
  onProgress = () => {},
  baseline = null,
} = {}) {
  const did = actor.startsWith('did:') ? actor : await resolveHandle(actor);
  const pds = await resolvePds(did);
  onProgress(`resolved ${actor} → ${did} @ ${pds}`);

  const profile = await fetchProfile(did).catch(() => ({}));
  const handle = profile.handle || (actor.startsWith('did:') ? did : actor.replace(/^@/, ''));

  let milestone = 0;
  const repo = await streamRepo(pds, did, {
    onProgress: ({ bytes, posts }) => {
      // A MILESTONE COUNTER, NOT A MODULO. `bytes % 8e6 < 65536` fires once per
      // chunk that happens to land inside the window, and chunks are small — a
      // 91 MB repo printed the same "80 MB" line eight times.
      if (bytes >= milestone) {
        milestone = bytes + 16_000_000;
        onProgress(`  ${(bytes / 1e6).toFixed(0)} MB, ${posts.toLocaleString('en-US')} posts`);
      }
    },
  });
  onProgress(`CAR read: ${repo.posts.length} posts in ${(repo.bytes / 1e6).toFixed(1)} MB`);

  const [feed, searched] = await Promise.all([
    fetchFeed(did, { pages: feedPages }).catch(() => ({ items: [], pages: 0, exhausted: false })),
    searchTop(handle),
  ]);
  const hits = greatestHits([...feed.items, ...searched]);
  const hitScope = feed.exhausted
    ? 'ranked over every post the AppView still indexes'
    : `ranked over the most recent ${feed.items.length} posts plus a "top" search`;

  let palm = null;
  const palmLib = baseline ? await loadPalm() : null;
  if (baseline && palmLib) {
    try {
      const scored = palmLib.score(palmLib.readings(repo.posts, did), baseline);
      palm = {
        axes: scored.axes,
        composite: scored.composite,
        band: scored.band?.name,
        archetype: palmLib.archetype(scored.axes),
      };
    } catch (e) {
      onProgress(`::warning::palm reading failed (${e.message}) — portrait continues without it`);
    }
  }

  const avatarFile = avatarPath ? await fetchAvatar(profile.avatar, avatarPath).catch(() => null) : null;

  return {
    did, handle,
    displayName: profile.displayName || '',
    bio: profile.description || '',
    counts: { followers: profile.followersCount, follows: profile.followsCount, posts: profile.postsCount },
    avatarFile,
    tempo: tempo(repo.posts),
    interests: interests(repo.posts),
    hits, hitScope,
    palm,
    repoBytes: repo.bytes,
  };
}
