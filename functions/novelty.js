// Cloudflare Pages Function — semantic novelty analysis for mino.mobi/novelty
//
// POST /novelty { handle, limit, mode, stride, offset }
// → { posts: [{text, date, novelty, uri}, ...], stats: {...} }
//
// Uses Cloudflare Workers AI (bge-base-en-v1.5) for embeddings.
// Requires AI binding in Pages project settings.
//
// Sampling modes:
//   "recent" — fetch the most recent `limit` posts, embed all
//   "even"   — fetch `limit` posts, sample evenly if over embed budget
//   "stride" — fetch `limit` posts, take every `stride`th from `offset`
//
// Respects Cloudflare free tier: ≤50 subrequests per invocation.
// Dynamically allocates embed budget from remaining subrequest headroom.

const BSKY = 'https://public.api.bsky.app';
const MAX_FETCH = 2500;   // max posts to retrieve from API
const EMBED_BATCH = 100;  // Workers AI batch size
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const SUBREQ_BUDGET = 48; // headroom under 50 limit

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

async function fetchJSON(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, (1 << i) * 500));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('Rate limited');
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
    const handle = body.handle;
    const limit = body.limit || 2000;
    const mode = body.mode || 'even';
    const stride = body.stride || 3;
    const offset = body.offset || 0;

    if (!handle) {
      return Response.json({ error: 'handle required' }, { status: 400, headers: CORS });
    }

    const fetchLimit = Math.min(Math.max(limit, 20), MAX_FETCH);

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
    const dim = embeddings[0].length;
    const centroid = new Float64Array(dim);
    const novelties = [];
    let cumulativePathLength = 0;
    let prevEmbedding = null;

    for (let i = 0; i < embeddings.length; i++) {
      const emb = embeddings[i];

      if (i === 0) {
        // First post: no centroid yet, novelty = 0
        novelties.push(0);
        for (let d = 0; d < dim; d++) centroid[d] = emb[d];
      } else {
        // Cosine distance from running centroid
        const sim = cosineSim(emb, centroid);
        const novelty = 1 - sim; // cosine distance in [0, 1]
        novelties.push(novelty);

        // Update running centroid (incremental mean)
        for (let d = 0; d < dim; d++) {
          centroid[d] = (centroid[d] * i + emb[d]) / (i + 1);
        }
      }

      // Cumulative path length in embedding space
      if (prevEmbedding) {
        cumulativePathLength += euclideanDist(emb, prevEmbedding);
      }
      prevEmbedding = emb;
    }

    // Net displacement: distance from first embedding to last
    const netDisplacement = euclideanDist(embeddings[0], embeddings[embeddings.length - 1]);

    // Summary statistics
    const n = novelties.length;
    const mean = novelties.reduce((s, v) => s + v, 0) / n;
    const variance = novelties.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const volume = Math.sqrt(variance); // std dev = "volume" of semantic exploration
    const circuitousness = netDisplacement > 0 ? cumulativePathLength / netDisplacement : 0;

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
        count: n,
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
