// Cloudflare Pages Function — ternary composition scoring for Bluesky posters
//
// POST /ternary { users: [{ handle, texts }] }
// → { results: [{ handle, flesh, knowledge, argument }] }
//
// Each user's posts are embedded alongside 9 anchor texts (3 per axis).
// Cosine similarity to each axis centroid gives raw scores.
// Scores are min-max normalized across the peer group, then rescaled to sum to 100.

const EMBED_BATCH = 100;
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const FLESH_ANCHORS = [
  'Physical attraction, beauty, desire, sensual experience, bodies, lust',
  'Thirst, seduction, intimacy, visual pleasure, aesthetic admiration of people',
  'Romance, passion, flirtation, hotness, physical connection and touch',
];

const KNOWLEDGE_ANCHORS = [
  'Research, data analysis, scientific discovery, deep learning about topics',
  'Books, papers, intellectual curiosity, understanding complex systems',
  'Technical explanation, expertise, teaching, sharing knowledge and facts',
];

const ARGUMENT_ANCHORS = [
  'Heated debate, strong disagreement, calling out bad takes, fighting online',
  'Political argument, ideological confrontation, taking sides publicly',
  'Critique, rebuttal, polemic, challenging ideas, dunking on opponents',
];

const ANCHOR_COUNT = FLESH_ANCHORS.length + KNOWLEDGE_ANCHORS.length + ARGUMENT_ANCHORS.length;

function cosineSim(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function centroid(embeddings) {
  const dim = embeddings[0].length;
  const c = new Float64Array(dim);
  for (const e of embeddings) {
    for (let i = 0; i < dim; i++) c[i] += e[i];
  }
  for (let i = 0; i < dim; i++) c[i] /= embeddings.length;
  return c;
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

    const { users } = await request.json();
    if (!users || !Array.isArray(users) || users.length === 0) {
      return Response.json(
        { error: 'users array required' },
        { status: 400, headers: CORS }
      );
    }

    // Flatten all post texts with tracking
    const allTexts = [];
    const userBounds = [];
    for (const u of users) {
      if (!u.texts || u.texts.length === 0) continue;
      const start = allTexts.length;
      allTexts.push(...u.texts);
      userBounds.push({ handle: u.handle, start, end: allTexts.length });
    }

    if (userBounds.length < 2) {
      return Response.json(
        { error: 'need at least 2 users with posts' },
        { status: 400, headers: CORS }
      );
    }

    // Append anchor texts
    const anchors = [...FLESH_ANCHORS, ...KNOWLEDGE_ANCHORS, ...ARGUMENT_ANCHORS];
    const anchorStart = allTexts.length;
    allTexts.push(...anchors);

    // Embed everything in batches
    const embeddings = [];
    for (let i = 0; i < allTexts.length; i += EMBED_BATCH) {
      const batch = allTexts.slice(i, i + EMBED_BATCH);
      const result = await ai.run(EMBED_MODEL, { text: batch });
      embeddings.push(...result.data);
    }

    // Extract anchor centroids
    const fleshCenter = centroid(embeddings.slice(anchorStart, anchorStart + 3));
    const knowledgeCenter = centroid(embeddings.slice(anchorStart + 3, anchorStart + 6));
    const argumentCenter = centroid(embeddings.slice(anchorStart + 6, anchorStart + 9));

    // Score each user: mean cosine similarity to each axis centroid
    const rawScores = userBounds.map(({ handle, start, end }) => {
      const userEmbeds = embeddings.slice(start, end);
      let fSum = 0, kSum = 0, aSum = 0;
      for (const emb of userEmbeds) {
        fSum += cosineSim(emb, fleshCenter);
        kSum += cosineSim(emb, knowledgeCenter);
        aSum += cosineSim(emb, argumentCenter);
      }
      const n = userEmbeds.length;
      return { handle, flesh: fSum / n, knowledge: kSum / n, argument: aSum / n };
    });

    // Peer-relative normalization: min-max per axis
    const axes = ['flesh', 'knowledge', 'argument'];
    const mins = {}, maxes = {};
    for (const axis of axes) {
      const vals = rawScores.map(s => s[axis]);
      mins[axis] = Math.min(...vals);
      maxes[axis] = Math.max(...vals);
    }

    const results = rawScores.map(s => {
      const norm = {};
      for (const axis of axes) {
        const range = maxes[axis] - mins[axis] || 0.001;
        norm[axis] = (s[axis] - mins[axis]) / range;
      }
      // Floor to prevent degenerate zeros
      norm.flesh = Math.max(norm.flesh, 0.02);
      norm.knowledge = Math.max(norm.knowledge, 0.02);
      norm.argument = Math.max(norm.argument, 0.02);

      const total = norm.flesh + norm.knowledge + norm.argument;
      return {
        handle: s.handle,
        flesh: Math.round(norm.flesh / total * 100),
        knowledge: Math.round(norm.knowledge / total * 100),
        argument: Math.round(norm.argument / total * 100),
      };
    });

    return Response.json({ results }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
