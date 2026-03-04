// Cloudflare Pages Function — semantic novelty analysis for mino.mobi/novelty
//
// POST /novelty { handle, limit, mode, stride, offset }
// → { posts: [{text, date, novelty, uri}, ...], stats: {...} }
//
// POST /novelty { handles: [h1, h2], limit, mode, stride, offset }
// → { merged: true, stats: { byHandle: {...}, ... } }
//
// Uses Cloudflare Workers AI (bge-base-en-v1.5) for embeddings.
// Requires AI binding in Pages project settings.
//
// Sampling modes:
//   "recent" — fetch the most recent `limit` posts, embed all
//   "even"   — fetch `limit` posts, sample evenly if over embed budget
//   "stride" — target `limit` analyzed posts, fetch limit*stride from API
//
// Respects Cloudflare free tier: ≤50 subrequests per invocation.
// Dynamically allocates embed budget from remaining subrequest headroom.

const BSKY = 'https://public.api.bsky.app';
const MAX_FETCH = 50000;  // safety net; subrequest budget is the real constraint
const EMBED_BATCH = 100;  // Workers AI batch size
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const SUBREQ_BUDGET = 40; // conservative headroom under 50 limit

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

async function fetchJSON(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status === 503) {
      await new Promise(r => setTimeout(r, (1 << i) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('Rate limited (429/503 after 4 retries)');
}

// Fetch author's posts in reverse chronological order
// Returns { posts, pages } where pages = number of API calls made
async function getAuthorPosts(actor, limit) {
  const posts = [];
  let cursor;
  let pages = 0;
  do {
    pages++;
    const params = new URLSearchParams({ actor, limit: '100', filter: 'posts_no_replies' });
    if (cursor) params.set('cursor', cursor);
    const data = await fetchJSON(`${BSKY}/xrpc/app.bsky.feed.getAuthorFeed?${params}`);
    for (const item of (data.feed || [])) {
      const post = item.post;
      if (!post?.record?.text) continue;
      // Skip reposts
      if (item.reason?.$type === 'app.bsky.feed.defs#reasonRepost') continue;
      posts.push({
        text: post.record.text,
        date: post.record.createdAt || post.indexedAt,
        uri: post.uri,
        cid: post.cid,
      });
      if (posts.length >= limit) break;
    }
    cursor = data.cursor;
  } while (cursor && posts.length < limit);
  return { posts, pages };
}

// Cosine similarity between two vectors
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

// Euclidean distance between two vectors
function euclideanDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Compute running centroid novelty and trajectory stats from embeddings
function computeNovelty(embeddings) {
  const dim = embeddings[0].length;
  const centroid = new Float64Array(dim);
  const novelties = [];
  let cumulativePathLength = 0;
  let prevEmbedding = null;

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
    if (prevEmbedding) {
      cumulativePathLength += euclideanDist(emb, prevEmbedding);
    }
    prevEmbedding = emb;
  }

  const netDisplacement = euclideanDist(embeddings[0], embeddings[embeddings.length - 1]);
  const n = novelties.length;
  const mean = novelties.reduce((s, v) => s + v, 0) / n;
  const variance = novelties.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const volume = Math.sqrt(variance);
  const circuitousness = netDisplacement > 0 ? cumulativePathLength / netDisplacement : 0;

  return { novelties, mean, volume, circuitousness };
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const ai = env.SemanticNovelty || env.AI;
    if (!ai) {
      return Response.json(
        { error: 'Workers AI not configured. Add an AI binding in Pages settings.' },
        { status: 503, headers: CORS }
      );
    }

    const body = await request.json();
    const handles = body.handles;
    const handle = body.handle;
    const limit = body.limit || 2000;
    const mode = body.mode || 'even';
    const stride = body.stride || 3;
    const offset = body.offset || 0;

    if (!handle && (!handles || handles.length < 2)) {
      return Response.json({ error: 'handle or handles[] required' }, { status: 400, headers: CORS });
    }

    // ── MERGED MODE ─────────────────────────────────────────────
    if (handles && handles.length >= 2) {
      const perHandle = Math.floor(limit / handles.length);
      let totalPages = 0;
      const taggedPosts = [];

      for (const h of handles) {
        let fetchLim;
        if (mode === 'stride' && stride >= 2) {
          const budgetPerHandle = Math.floor(SUBREQ_BUDGET / handles.length);
          const maxTarget = Math.floor((budgetPerHandle * EMBED_BATCH) / (stride + 1));
          const target = Math.min(perHandle, maxTarget);
          fetchLim = target * stride;
        } else {
          fetchLim = Math.min(perHandle, MAX_FETCH);
        }

        const { posts, pages } = await getAuthorPosts(h, fetchLim);
        totalPages += pages;
        posts.reverse(); // chronological

        let sampled;
        if (mode === 'stride' && stride >= 2) {
          sampled = [];
          for (let i = 0; i < posts.length; i += stride) sampled.push(posts[i]);
        } else {
          sampled = posts;
        }
        for (const p of sampled) taggedPosts.push({ ...p, handle: h });
      }

      // Sort combined posts chronologically
      taggedPosts.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Cap at embed budget
      const embedBudget = Math.max(1, SUBREQ_BUDGET - totalPages);
      const maxEmbed = embedBudget * EMBED_BATCH;
      let posts = taggedPosts;
      if (posts.length > maxEmbed) {
        const step = posts.length / maxEmbed;
        const capped = [];
        for (let i = 0; i < maxEmbed; i++) capped.push(posts[Math.floor(i * step)]);
        posts = capped;
      }

      if (posts.length < 5) {
        return Response.json(
          { error: 'Not enough posts for merged analysis (need at least 5)' },
          { status: 400, headers: CORS }
        );
      }

      // Embed
      const texts = posts.map(p => p.text);
      const embeddings = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const batch = texts.slice(i, i + EMBED_BATCH);
        const result = await ai.run(EMBED_MODEL, { text: batch });
        embeddings.push(...result.data);
      }

      // Shared centroid novelty
      const { novelties, mean, volume, circuitousness } = computeNovelty(embeddings);

      // Per-handle breakdown
      const byHandle = {};
      for (const h of handles) {
        const hNovelties = posts
          .map((p, i) => p.handle === h ? novelties[i] : null)
          .filter(v => v !== null);
        const n = hNovelties.length;
        const hMean = n > 0 ? hNovelties.reduce((s, v) => s + v, 0) / n : 0;
        const hVar = n > 0 ? hNovelties.reduce((s, v) => s + (v - hMean) ** 2, 0) / n : 0;
        byHandle[h] = {
          count: n,
          mean: Math.round(hMean * 1000) / 1000,
          volume: Math.round(Math.sqrt(hVar) * 1000) / 1000,
        };
      }

      return Response.json({
        merged: true,
        handles,
        stats: {
          count: posts.length,
          mean: Math.round(mean * 1000) / 1000,
          volume: Math.round(volume * 1000) / 1000,
          circuitousness: Math.round(circuitousness * 10) / 10,
          byHandle,
        },
      }, { headers: CORS });
    }

    // ── SINGLE HANDLE MODE ──────────────────────────────────────

    // In stride mode, limit = target analyzed posts; fetch limit*stride
    let fetchLimit;
    if (mode === 'stride' && stride >= 2) {
      const maxTarget = Math.floor((SUBREQ_BUDGET * EMBED_BATCH) / (stride + 1));
      const target = Math.min(limit, maxTarget);
      fetchLimit = Math.min(target * stride, MAX_FETCH);
    } else {
      fetchLimit = Math.min(Math.max(limit, 20), MAX_FETCH);
    }

    // Fetch posts (reverse chronological)
    const { posts: rawPosts, pages: fetchPages } = await getAuthorPosts(handle, fetchLimit);
    if (rawPosts.length < 5) {
      return Response.json({ error: 'Not enough posts (need at least 5)' }, { status: 400, headers: CORS });
    }

    // Reverse to chronological order (oldest first) for running centroid
    rawPosts.reverse();

    // Compute embed budget from remaining subrequest allowance
    const embedBudget = Math.max(1, SUBREQ_BUDGET - fetchPages);
    const maxEmbed = embedBudget * EMBED_BATCH;

    // Apply sampling based on mode
    let posts;
    let sampleMethod = 'none';
    let sampleRate = 1;

    if (mode === 'stride' && stride >= 2) {
      // Take every `stride` posts starting at `offset`
      posts = [];
      const off = Math.max(0, Math.min(offset, rawPosts.length - 1));
      for (let i = off; i < rawPosts.length; i += stride) {
        posts.push(rawPosts[i]);
      }
      sampleMethod = 'stride';
      sampleRate = stride;
    } else if (rawPosts.length > maxEmbed) {
      // Even sampling down to maxEmbed
      const step = rawPosts.length / maxEmbed;
      posts = [];
      for (let i = 0; i < maxEmbed; i++) {
        posts.push(rawPosts[Math.floor(i * step)]);
      }
      sampleMethod = 'even';
      sampleRate = Math.round(step * 10) / 10;
    } else {
      posts = rawPosts;
    }

    // Cap at maxEmbed if stride produced too many
    if (posts.length > maxEmbed) {
      const step = posts.length / maxEmbed;
      const capped = [];
      for (let i = 0; i < maxEmbed; i++) {
        capped.push(posts[Math.floor(i * step)]);
      }
      posts = capped;
      sampleMethod = sampleMethod === 'stride' ? 'stride+capped' : 'even';
      sampleRate = Math.round((rawPosts.length / posts.length) * 10) / 10;
    }

    if (posts.length < 5) {
      return Response.json(
        { error: 'Not enough posts after sampling (need at least 5)' },
        { status: 400, headers: CORS }
      );
    }

    // Batch embed sampled posts
    const texts = posts.map(p => p.text);
    const embeddings = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const result = await ai.run(EMBED_MODEL, { text: batch });
      embeddings.push(...result.data);
    }

    // Compute running centroid novelty (Zimmerman method)
    const { novelties, mean, volume, circuitousness } = computeNovelty(embeddings);

    // Build response (chronological order)
    const resultPosts = posts.map((p, i) => ({
      text: p.text,
      date: p.date,
      novelty: Math.round(novelties[i] * 1000) / 1000,
      uri: p.uri,
    }));

    return Response.json({
      handle,
      posts: resultPosts,
      stats: {
        count: novelties.length,
        fetched: rawPosts.length,
        sampled: sampleMethod !== 'none',
        sampleMethod,
        sampleRate,
        mean: Math.round(mean * 1000) / 1000,
        volume: Math.round(volume * 1000) / 1000,
        circuitousness: Math.round(circuitousness * 10) / 10,
      },
    }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
