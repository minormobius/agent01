// Cloudflare Pages Function — semantic novelty analysis for mino.mobi/novelty
//
// POST /novelty { handle: "someone.bsky.social", limit: 200 }
// → { posts: [{text, date, novelty, uri}, ...], stats: {mean, volume, circuitousness, count} }
//
// Uses Cloudflare Workers AI (bge-base-en-v1.5) for embeddings.
// Requires AI binding in Pages project settings.

const BSKY = 'https://public.api.bsky.app';
const MAX_POSTS = 500;
const EMBED_BATCH = 50; // Workers AI batch size
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

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
async function getAuthorPosts(actor, limit) {
  const posts = [];
  let cursor;
  do {
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
  return posts;
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

    const { handle, limit = 200 } = await request.json();
    if (!handle) {
      return Response.json({ error: 'handle required' }, { status: 400, headers: CORS });
    }

    const postLimit = Math.min(Math.max(limit, 20), MAX_POSTS);

    // Fetch posts (reverse chronological)
    const rawPosts = await getAuthorPosts(handle, postLimit);
    if (rawPosts.length < 5) {
      return Response.json({ error: 'Not enough posts (need at least 5)' }, { status: 400, headers: CORS });
    }

    // Reverse to chronological order (oldest first) for running centroid
    rawPosts.reverse();

    // Batch embed all posts
    const texts = rawPosts.map(p => p.text);
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
    const posts = rawPosts.map((p, i) => ({
      text: p.text,
      date: p.date,
      novelty: Math.round(novelties[i] * 1000) / 1000,
      uri: p.uri,
    }));

    return Response.json({
      handle,
      posts,
      stats: {
        count: n,
        mean: Math.round(mean * 1000) / 1000,
        volume: Math.round(volume * 1000) / 1000,
        circuitousness: Math.round(circuitousness * 10) / 10,
      },
    }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
