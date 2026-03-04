// Cloudflare Pages Function — topic & valence analysis for Bluesky posts
//
// POST /profile { handle, limit?, days?, k? }
// → { handle, period, topics, posts, valence, stats }
//
// Single endpoint, single model: uses BGE embeddings for both topic clustering
// (k-means) and emotional valence (cosine distance to sentiment anchors).
// No LLM neurons, no second model — just geometry on embeddings.

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

// Sentiment anchors — structurally parallel, semantically opposed.
// Embedded alongside posts; valence = cos(post, pos_centroid) - cos(post, neg_centroid)
const POSITIVE_ANCHORS = [
  'This is great news, very exciting and promising',
  'Impressive results, strong performance, excellent progress',
  'A breakthrough, innovative and genuinely successful',
];
const NEGATIVE_ANCHORS = [
  'This is bad news, very concerning and disappointing',
  'Poor results, weak performance, a serious setback',
  'A failure, problematic and genuinely unsuccessful',
];

// Big Five personality dimensions — anchor pairs per trait.
// Score = cos(post, high_anchor) - cos(post, low_anchor) for each dimension.
const PERSONALITY_ANCHORS = [
  {
    trait: 'openness',
    high: 'Creative, curious, exploring novel ideas and unconventional perspectives',
    low: 'Practical, conventional, focused on proven methods and established facts',
  },
  {
    trait: 'conscientiousness',
    high: 'Organized, disciplined, systematic and thorough in every detail',
    low: 'Spontaneous, flexible, casual and comfortable with ambiguity',
  },
  {
    trait: 'extraversion',
    high: 'Enthusiastic, outgoing, energetically engaging with many people and ideas',
    low: 'Reserved, quiet, reflective and focused inward',
  },
  {
    trait: 'agreeableness',
    high: 'Cooperative, trusting, supportive and eager to find common ground',
    low: 'Competitive, skeptical, challenging assumptions and pushing back',
  },
  {
    trait: 'neuroticism',
    high: 'Anxious, worried, emotionally reactive and easily stressed',
    low: 'Calm, stable, emotionally steady and resilient under pressure',
  },
];
const ANCHOR_COUNT = POSITIVE_ANCHORS.length + NEGATIVE_ANCHORS.length
  + PERSONALITY_ANCHORS.length * 2;

// ── Shared utilities (same as novelty.js) ────────────────────────

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
  throw new Error('Rate limited (429/503 after 4 retries)');
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

async function getAuthorPosts(actor, limit, auth) {
  const baseUrl = auth ? auth.baseUrl : BSKY_PUBLIC;
  const headers = auth ? { Authorization: `Bearer ${auth.token}` } : {};
  const posts = [];
  let cursor;
  let pages = 0;
  do {
    if (pages > 0) await new Promise(r => setTimeout(r, 200));
    pages++;
    const params = new URLSearchParams({ actor, limit: '100', filter: 'posts_no_replies' });
    if (cursor) params.set('cursor', cursor);
    const data = await fetchJSON(`${baseUrl}/xrpc/app.bsky.feed.getAuthorFeed?${params}`, headers);
    for (const item of (data.feed || [])) {
      const post = item.post;
      if (!post?.record?.text) continue;
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

function euclideanDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// ── K-means++ clustering ─────────────────────────────────────────

function kmeans(vectors, k, maxIter = 30) {
  const n = vectors.length;
  const dim = vectors[0].length;

  // K-means++ initialization: pick centroids with distance-weighted probability
  const centroids = [vectors[Math.floor(Math.random() * n)].slice()];
  for (let c = 1; c < k; c++) {
    const dists = vectors.map(v => {
      let minD = Infinity;
      for (const cent of centroids) {
        const d = euclideanDist(v, cent);
        if (d < minD) minD = d;
      }
      return minD * minD;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let r = Math.random() * total;
    let picked = false;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(vectors[i].slice()); picked = true; break; }
    }
    if (!picked) centroids.push(vectors[Math.floor(Math.random() * n)].slice());
  }

  const assignments = new Int32Array(n);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestD = Infinity, bestC = 0;
      for (let c = 0; c < k; c++) {
        const d = euclideanDist(vectors[i], centroids[c]);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed = true; }
    }
    if (!changed) break;

    for (let c = 0; c < k; c++) {
      const newCent = new Float64Array(dim);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          for (let d = 0; d < dim; d++) newCent[d] += vectors[i][d];
          count++;
        }
      }
      if (count > 0) {
        for (let d = 0; d < dim; d++) newCent[d] /= count;
        centroids[c] = newCent;
      }
    }
  }

  return { assignments, centroids };
}

// ── TF-IDF keyword extraction ────────────────────────────────────

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'need','dare','ought','used','to','of','in','for','on','with','at','by','from',
  'as','into','through','during','before','after','above','below','between','out',
  'off','over','under','again','further','then','once','here','there','when',
  'where','why','how','all','each','every','both','few','more','most','other',
  'some','such','no','nor','not','only','own','same','so','than','too','very',
  'just','because','but','and','or','if','while','about','up','it','its','this',
  'that','these','those','me','my','we','our','you','your','he','him','his',
  'she','her','they','them','their','what','which','who','whom','also','like',
  'get','got','new','one','two','don','going','really','think','know',
  'much','many','way','well','back','even','still','now','right','big','good',
  'long','little','old','great','high','small','large','next','early','young',
]);

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function extractKeywords(clusterTexts, allTexts, topN = 5) {
  const clusterTF = {};
  let clusterTokens = 0;
  for (const text of clusterTexts) {
    for (const w of tokenize(text)) {
      clusterTF[w] = (clusterTF[w] || 0) + 1;
      clusterTokens++;
    }
  }
  if (clusterTokens === 0) return [];

  const docFreq = {};
  for (const text of allTexts) {
    const seen = new Set(tokenize(text));
    for (const w of seen) docFreq[w] = (docFreq[w] || 0) + 1;
  }

  const N = allTexts.length;
  const scores = [];
  for (const [word, tf] of Object.entries(clusterTF)) {
    const df = docFreq[word] || 1;
    const tfidf = (tf / clusterTokens) * Math.log(N / df);
    scores.push({ word, score: tfidf });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topN).map(s => s.word);
}

// ── Valence scoring ──────────────────────────────────────────────

function vectorCentroid(embeddings) {
  const dim = embeddings[0].length;
  const c = new Float64Array(dim);
  for (const emb of embeddings) {
    for (let d = 0; d < dim; d++) c[d] += emb[d];
  }
  for (let d = 0; d < dim; d++) c[d] /= embeddings.length;
  return c;
}

// ── Request handlers ─────────────────────────────────────────────

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
    const { handle, limit = 2000, days = 30, k: requestedK } = body;

    if (!handle) {
      return Response.json({ error: 'handle required' }, { status: 400, headers: CORS });
    }

    // Auth (1 subreq, falls back to public API)
    const auth = await authenticate(env);
    const budget = auth ? SUBREQ_BUDGET - 1 : SUBREQ_BUDGET;

    // Fetch posts (reverse chronological)
    const { posts: rawPosts, pages: fetchPages } = await getAuthorPosts(handle, limit, auth);
    if (rawPosts.length < 5) {
      return Response.json(
        { error: 'Not enough posts (need at least 5)' },
        { status: 400, headers: CORS }
      );
    }

    // Filter to date window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = rawPosts.filter(p => new Date(p.date) >= cutoff);
    if (filtered.length < 5) {
      return Response.json(
        { error: `Not enough posts in last ${days} days (found ${filtered.length}, need 5)` },
        { status: 400, headers: CORS }
      );
    }

    // Chronological order (oldest first)
    filtered.reverse();

    // Cap at embed budget (reserve slots for anchor texts)
    const embedBudget = Math.max(1, budget - fetchPages);
    const maxEmbed = embedBudget * EMBED_BATCH - ANCHOR_COUNT;
    let posts = filtered;
    if (posts.length > maxEmbed) {
      const step = posts.length / maxEmbed;
      const sampled = [];
      for (let i = 0; i < maxEmbed; i++) sampled.push(posts[Math.floor(i * step)]);
      posts = sampled;
    }

    // Embed posts + all anchors in one pass
    // Layout: [posts..., pos_valence x3, neg_valence x3, trait_high x5, trait_low x5]
    const anchorTexts = [
      ...POSITIVE_ANCHORS,
      ...NEGATIVE_ANCHORS,
      ...PERSONALITY_ANCHORS.map(p => p.high),
      ...PERSONALITY_ANCHORS.map(p => p.low),
    ];
    const allTexts = [...posts.map(p => p.text), ...anchorTexts];
    const allEmbeddings = [];
    for (let i = 0; i < allTexts.length; i += EMBED_BATCH) {
      const batch = allTexts.slice(i, i + EMBED_BATCH);
      const result = await ai.run(EMBED_MODEL, { text: batch });
      allEmbeddings.push(...result.data);
    }

    // Slice out embeddings by region
    const postEmbeddings = allEmbeddings.slice(0, posts.length);
    let offset = posts.length;
    const posAnchorEmbeds = allEmbeddings.slice(offset, offset += POSITIVE_ANCHORS.length);
    const negAnchorEmbeds = allEmbeddings.slice(offset, offset += NEGATIVE_ANCHORS.length);
    const traitHighEmbeds = allEmbeddings.slice(offset, offset += PERSONALITY_ANCHORS.length);
    const traitLowEmbeds = allEmbeddings.slice(offset, offset += PERSONALITY_ANCHORS.length);

    // ── Valence: cosine distance to sentiment anchor centroids ──
    const posCenter = vectorCentroid(posAnchorEmbeds);
    const negCenter = vectorCentroid(negAnchorEmbeds);
    const valences = postEmbeddings.map(emb => {
      const posSim = cosineSim(emb, posCenter);
      const negSim = cosineSim(emb, negCenter);
      return Math.round((posSim - negSim) * 1000) / 1000;
    });

    // ── Personality: Big Five trait scores ───────────────────────
    // Per-post score for each trait, then aggregate to mean
    const personality = {};
    for (let t = 0; t < PERSONALITY_ANCHORS.length; t++) {
      const trait = PERSONALITY_ANCHORS[t].trait;
      const highEmb = traitHighEmbeds[t];
      const lowEmb = traitLowEmbeds[t];
      const scores = postEmbeddings.map(emb => cosineSim(emb, highEmb) - cosineSim(emb, lowEmb));
      const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
      personality[trait] = Math.round(mean * 1000) / 1000;
    }

    // ── Topics: k-means clustering on embeddings ────────────────
    const autoK = Math.max(2, Math.min(8, Math.floor(Math.sqrt(posts.length) / 2)));
    const topicK = requestedK || autoK;
    const { assignments } = kmeans(postEmbeddings, topicK);

    // Build topic summaries
    const allPostTexts = posts.map(p => p.text);
    const topics = [];
    for (let c = 0; c < topicK; c++) {
      const memberIndices = [];
      for (let i = 0; i < posts.length; i++) {
        if (assignments[i] === c) memberIndices.push(i);
      }
      if (memberIndices.length === 0) continue;

      // TF-IDF keywords for this cluster
      const clusterTexts = memberIndices.map(i => posts[i].text);
      const keywords = extractKeywords(clusterTexts, allPostTexts, 5);

      // Most central post = cluster representative
      const dim = postEmbeddings[0].length;
      const clusterCent = new Float64Array(dim);
      for (const idx of memberIndices) {
        for (let d = 0; d < dim; d++) clusterCent[d] += postEmbeddings[idx][d];
      }
      for (let d = 0; d < dim; d++) clusterCent[d] /= memberIndices.length;

      let bestIdx = memberIndices[0], bestDist = Infinity;
      for (const idx of memberIndices) {
        const d = euclideanDist(postEmbeddings[idx], clusterCent);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      }

      // Mean valence for this cluster
      const clusterValences = memberIndices.map(i => valences[i]);
      const clusterValMean = clusterValences.reduce((s, v) => s + v, 0) / clusterValences.length;

      topics.push({
        id: c,
        size: memberIndices.length,
        keywords,
        valence: Math.round(clusterValMean * 1000) / 1000,
        representative: { text: posts[bestIdx].text, uri: posts[bestIdx].uri },
      });
    }
    topics.sort((a, b) => b.size - a.size);

    // ── Aggregate valence stats ─────────────────────────────────
    const vMean = valences.reduce((s, v) => s + v, 0) / valences.length;
    const vVar = valences.reduce((s, v) => s + (v - vMean) ** 2, 0) / valences.length;

    // ── Annotated posts ─────────────────────────────────────────
    const annotatedPosts = posts.map((p, i) => ({
      text: p.text,
      date: p.date,
      uri: p.uri,
      topic: assignments[i],
      valence: valences[i],
    }));

    return Response.json({
      handle,
      period: { from: posts[0].date, to: posts[posts.length - 1].date },
      topics,
      posts: annotatedPosts,
      valence: {
        mean: Math.round(vMean * 1000) / 1000,
        stddev: Math.round(Math.sqrt(vVar) * 1000) / 1000,
      },
      personality,
      stats: {
        fetched: rawPosts.length,
        analyzed: posts.length,
        days,
        topicCount: topics.length,
        authenticated: !!auth,
      },
    }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
