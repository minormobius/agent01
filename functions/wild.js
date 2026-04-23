// Cloudflare Pages Function — group novelty analysis for mino.mobi/wild
//
// POST /wild { list }
// → { members: [{did, handle, displayName, avatar, wildness, volume, postCount, wildPost, tamePost}], stats: {...} }
//
// Takes a Bluesky list URI, fetches all members' posts, computes novelty
// against the collective group centroid, and returns per-member wildness scores.
//
// Uses Cloudflare Workers AI (bge-base-en-v1.5) for embeddings.

const BSKY_PUBLIC = 'https://public.api.bsky.app';
const BSKY_AUTH = 'https://bsky.social';
const EMBED_BATCH = 100;
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const SUBREQ_BUDGET = 40;

const AUTH_ACCOUNTS = [
  { handleKey: 'BLUESKY_HANDLE', passwordKey: 'BLUESKY_APP_PASSWORD' },
  { handleKey: 'BLUESKY_MODULO_HANDLE', passwordKey: 'BLUESKY_MODULO_APP_PASSWORD' },
  { handleKey: 'BLUESKY_MORPHYX_HANDLE', passwordKey: 'BLUESKY_MORPHYX_APP_PASSWORD' },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

async function fetchJSON(url, headers = {}) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, Object.keys(headers).length ? { headers } : undefined);
    if (res.status === 429 || res.status === 503) {
      await new Promise(r => setTimeout(r, (1 << i) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('Rate limited after 4 retries');
}

async function authenticate(env) {
  const available = AUTH_ACCOUNTS.filter(a => env[a.handleKey] && env[a.passwordKey]);
  if (available.length === 0) return null;
  const account = available[Math.floor(Math.random() * available.length)];
  try {
    const res = await fetch(`${BSKY_AUTH}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: env[account.handleKey],
        password: env[account.passwordKey],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { token: data.accessJwt, baseUrl: BSKY_AUTH };
  } catch {
    return null;
  }
}

async function getListMembers(listUri) {
  const members = [];
  let cursor;
  let pages = 0;
  do {
    const params = new URLSearchParams({ list: listUri, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const data = await fetchJSON(`${BSKY_PUBLIC}/xrpc/app.bsky.graph.getList?${params}`);
    for (const item of (data.items || [])) {
      const s = item.subject;
      members.push({
        did: s.did,
        handle: s.handle,
        displayName: s.displayName || s.handle,
        avatar: s.avatar || null,
      });
    }
    cursor = data.cursor;
    pages++;
  } while (cursor && pages < 10);
  return { members, pages };
}

// Fetch one page of posts for an actor. Returns { posts, cursor, pages: 1 }.
async function getAuthorPostsPage(actor, auth, cursor) {
  const baseUrl = auth ? auth.baseUrl : BSKY_PUBLIC;
  const headers = auth ? { Authorization: `Bearer ${auth.token}` } : {};
  const params = new URLSearchParams({ actor, limit: '100', filter: 'posts_with_replies' });
  if (cursor) params.set('cursor', cursor);
  const data = await fetchJSON(`${baseUrl}/xrpc/app.bsky.feed.getAuthorFeed?${params}`, headers);
  const posts = [];
  for (const item of (data.feed || [])) {
    const post = item.post;
    if (!post?.record?.text) continue;
    if (item.reason?.$type === 'app.bsky.feed.defs#reasonRepost') continue;
    posts.push({
      text: post.record.text,
      date: post.record.createdAt || post.indexedAt,
      uri: post.uri,
    });
  }
  return { posts, cursor: data.cursor || null };
}

// Evenly sample N items from an array (preserves order)
function evenSample(arr, n) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function cosineSim(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

function computeGroupNovelty(embeddings) {
  const dim = embeddings[0].length;
  const centroid = new Float64Array(dim);
  const novelties = [];

  for (let i = 0; i < embeddings.length; i++) {
    const emb = embeddings[i];
    if (i === 0) {
      novelties.push(0);
      for (let d = 0; d < dim; d++) centroid[d] = emb[d];
    } else {
      const sim = cosineSim(emb, centroid);
      novelties.push(1 - sim);
      for (let d = 0; d < dim; d++) {
        centroid[d] = (centroid[d] * i + emb[d]) / (i + 1);
      }
    }
  }

  const n = novelties.length;
  const mean = novelties.reduce((s, v) => s + v, 0) / n;
  const variance = novelties.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { novelties, mean, volume: Math.sqrt(variance) };
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const ai = env.SemanticNovelty || env.AI;
    if (!ai) {
      return Response.json(
        { error: 'Workers AI not configured' },
        { status: 503, headers: CORS }
      );
    }

    const body = await request.json();
    let listUri = body.list;
    if (!listUri) {
      return Response.json({ error: 'list (AT URI) required' }, { status: 400, headers: CORS });
    }

    // Convert bsky.app list URL to AT URI if needed
    // e.g. https://bsky.app/profile/handle/lists/rkey
    const urlMatch = listUri.match(/bsky\.app\/profile\/([^/]+)\/lists\/([^/?#]+)/);
    if (urlMatch) {
      const [, actor, rkey] = urlMatch;
      // Resolve handle to DID if it's not already one
      let did = actor;
      if (!actor.startsWith('did:')) {
        const resolved = await fetchJSON(
          `${BSKY_PUBLIC}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`
        );
        did = resolved.did;
      }
      listUri = `at://${did}/app.bsky.graph.list/${rkey}`;
    }

    const auth = await authenticate(env);
    let budgetLeft = auth ? SUBREQ_BUDGET - 1 : SUBREQ_BUDGET;

    // Fetch list members
    const { members, pages: listPages } = await getListMembers(listUri);
    budgetLeft -= listPages;

    if (members.length < 2) {
      return Response.json(
        { error: 'List must have at least 2 members' },
        { status: 400, headers: CORS }
      );
    }

    // ── Phase 1: First page for every member (1 subreq each) ─────
    const maxMembers = Math.min(members.length, budgetLeft - 2); // reserve ≥2 for embeds
    const activeMemberList = members.slice(0, maxMembers);
    const memberPosts = new Map();   // did → posts[]
    const memberCursors = new Map(); // did → cursor|null
    let fetchReqs = 0;

    for (const m of activeMemberList) {
      try {
        const { posts, cursor } = await getAuthorPostsPage(m.did, auth, null);
        memberPosts.set(m.did, posts);
        memberCursors.set(m.did, cursor);
        fetchReqs++;
      } catch {
        memberPosts.set(m.did, []);
        memberCursors.set(m.did, null);
        fetchReqs++;
      }
    }

    // ── Phase 2: Spend remaining fetch budget on members with more data ──
    let remaining = budgetLeft - fetchReqs;
    // Reserve at least ceil(total posts so far / EMBED_BATCH) for embedding
    const totalSoFar = [...memberPosts.values()].reduce((n, p) => n + p.length, 0);
    const minEmbedReqs = Math.max(2, Math.ceil(totalSoFar / EMBED_BATCH));
    let extraFetchBudget = Math.max(0, remaining - minEmbedReqs);

    // Prioritize members that returned a cursor (have more posts)
    const fetchable = activeMemberList
      .filter(m => memberCursors.get(m.did))
      .sort((a, b) => (memberPosts.get(a.did)?.length || 0) - (memberPosts.get(b.did)?.length || 0));

    while (extraFetchBudget > 0 && fetchable.length > 0) {
      // Round-robin: one extra page per fetchable member
      const batch = fetchable.splice(0, Math.min(fetchable.length, extraFetchBudget));
      for (const m of batch) {
        const cursor = memberCursors.get(m.did);
        if (!cursor) continue;
        try {
          const { posts, cursor: nextCursor } = await getAuthorPostsPage(m.did, auth, cursor);
          const existing = memberPosts.get(m.did) || [];
          memberPosts.set(m.did, existing.concat(posts));
          memberCursors.set(m.did, nextCursor);
          extraFetchBudget--;
          fetchReqs++;
          if (nextCursor) fetchable.push(m); // still has more
        } catch {
          extraFetchBudget--;
          fetchReqs++;
        }
      }
    }

    // ── Phase 3: Equalize — same N posts per member ─────────────
    remaining = budgetLeft - fetchReqs;
    const maxEmbedPosts = remaining * EMBED_BATCH;
    const activeDids = activeMemberList.filter(m => (memberPosts.get(m.did)?.length || 0) > 0);
    const postsPerMember = Math.max(5, Math.floor(maxEmbedPosts / Math.max(activeDids.length, 1)));

    const taggedPosts = [];
    for (const m of activeDids) {
      const raw = memberPosts.get(m.did) || [];
      // Reverse to chronological (API returns newest first)
      raw.reverse();
      const sampled = evenSample(raw, postsPerMember);
      for (const p of sampled) taggedPosts.push({ ...p, did: m.did });
    }

    if (taggedPosts.length < 5) {
      return Response.json(
        { error: 'Not enough posts from list members (need at least 5)' },
        { status: 400, headers: CORS }
      );
    }

    // Sort pooled posts chronologically for running centroid
    taggedPosts.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Final cap if rounding pushed us over
    let posts = taggedPosts.length > maxEmbedPosts
      ? evenSample(taggedPosts, maxEmbedPosts)
      : taggedPosts;

    // ── Phase 4: Embed ──────────────────────────────────────────
    const texts = posts.map(p => p.text);
    const embeddings = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const result = await ai.run(EMBED_MODEL, { text: batch });
      embeddings.push(...result.data);
    }

    // Compute group novelty
    const { novelties, mean: groupMean, volume: groupVolume } = computeGroupNovelty(embeddings);

    // Aggregate per-member wildness
    const memberResults = [];
    for (const m of activeMemberList) {
      const indices = posts.map((p, i) => p.did === m.did ? i : -1).filter(i => i >= 0);
      if (indices.length === 0) {
        memberResults.push({
          did: m.did, handle: m.handle, displayName: m.displayName, avatar: m.avatar,
          wildness: 0, volume: 0, postCount: 0, wildPost: null, tamePost: null,
        });
        continue;
      }

      const mNovelties = indices.map(i => novelties[i]);
      const n = mNovelties.length;
      const mMean = mNovelties.reduce((s, v) => s + v, 0) / n;
      const mVar = mNovelties.reduce((s, v) => s + (v - mMean) ** 2, 0) / n;

      // Find wildest and tamest posts
      let wildIdx = indices[0], tameIdx = indices[0];
      for (const idx of indices) {
        if (novelties[idx] > novelties[wildIdx]) wildIdx = idx;
        if (novelties[idx] < novelties[tameIdx] && novelties[idx] > 0) tameIdx = idx;
      }

      memberResults.push({
        did: m.did,
        handle: m.handle,
        displayName: m.displayName,
        avatar: m.avatar,
        wildness: Math.round(mMean * 1000) / 1000,
        volume: Math.round(Math.sqrt(mVar) * 1000) / 1000,
        postCount: n,
        wildPost: { text: posts[wildIdx].text, novelty: Math.round(novelties[wildIdx] * 1000) / 1000 },
        tamePost: novelties[tameIdx] > 0
          ? { text: posts[tameIdx].text, novelty: Math.round(novelties[tameIdx] * 1000) / 1000 }
          : null,
      });
    }

    // Sort by wildness for easy rendering
    memberResults.sort((a, b) => a.wildness - b.wildness);

    // Include skipped members (over fetch budget) with null scores
    for (let i = maxMembers; i < members.length; i++) {
      memberResults.push({
        did: members[i].did, handle: members[i].handle,
        displayName: members[i].displayName, avatar: members[i].avatar,
        wildness: null, volume: null, postCount: 0,
        wildPost: null, tamePost: null,
      });
    }

    const totalFetched = [...memberPosts.values()].reduce((n, p) => n + p.length, 0);

    return Response.json({
      members: memberResults,
      stats: {
        listSize: members.length,
        analyzed: activeDids.length,
        totalFetched,
        totalEmbedded: posts.length,
        postsPerMember,
        groupMean: Math.round(groupMean * 1000) / 1000,
        groupVolume: Math.round(groupVolume * 1000) / 1000,
        authenticated: !!auth,
      },
    }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
