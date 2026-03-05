// Cloudflare Pages Function — ternary composition scoring for Bluesky posters
//
// POST /ternary { users: [{ handle, texts }] }
// → { results: [{ handle, flesh, knowledge, argument }] }
//
// Each user's posts are embedded alongside 18 anchor texts (3 high + 3 low per axis).
// Bipolar scoring: score = cos(post, high_centroid) - cos(post, low_centroid).
// Scores are min-max normalized across the peer group, then rescaled to sum to 100.

const EMBED_BATCH = 100;
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// Bipolar anchor pairs — score = cos(post, high) - cos(post, low)
// Gives much better separation than raw similarity to one pole.
const AXES = [
  {
    axis: 'flesh',
    high: [
      'Physical attraction, beauty, desire, sensual experience, bodies, lust',
      'Music, drugs, food, physical sensation, pleasure, the body alive',
      'Romance, passion, seduction, aesthetic rapture, visceral delight',
    ],
    low: [
      'Abstract reasoning, pure logic, disembodied thought, cerebral analysis',
      'Formal systems, mathematical proof, theoretical frameworks without sensation',
      'Detached observation, clinical neutrality, no feeling, no body',
    ],
  },
  {
    axis: 'knowledge',
    high: [
      'Research, data analysis, scientific discovery, deep investigation',
      'Books, poetry, literary arts, intellectual curiosity, understanding systems',
      'Technical expertise, teaching, sharing knowledge, citing sources and evidence',
    ],
    low: [
      'Gut feeling, vibes, no sources, pure emotional reaction, unexamined opinion',
      'Shitposting, memes, content-free jokes, zero information density',
      'Small talk, idle chatter, saying nothing with many words',
    ],
  },
  {
    axis: 'argument',
    high: [
      'Heated debate, strong disagreement, calling out bad takes, fighting online',
      'Political argument, ideological confrontation, taking sides publicly',
      'Critique, rebuttal, polemic, challenging ideas, dunking on opponents',
    ],
    low: [
      'Sharing my day, here is my cat, what I made for dinner tonight',
      'Quietly posting creative work, art, photos, no opinions attached',
      'Simple life updates, no takes, no discourse, just here and present',
    ],
  },
];

const ANCHOR_COUNT = AXES.length * 6; // 3 high + 3 low per axis

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

    // Append anchor texts: [high_0, high_1, high_2, low_0, low_1, low_2] per axis
    const anchorStart = allTexts.length;
    for (const axis of AXES) {
      allTexts.push(...axis.high, ...axis.low);
    }

    // Embed everything in batches
    const embeddings = [];
    for (let i = 0; i < allTexts.length; i += EMBED_BATCH) {
      const batch = allTexts.slice(i, i + EMBED_BATCH);
      const result = await ai.run(EMBED_MODEL, { text: batch });
      embeddings.push(...result.data);
    }

    // Extract bipolar centroids per axis
    const axisCentroids = [];
    let offset = anchorStart;
    for (const axis of AXES) {
      const highCenter = centroid(embeddings.slice(offset, offset + 3));
      const lowCenter = centroid(embeddings.slice(offset + 3, offset + 6));
      axisCentroids.push({ axis: axis.axis, highCenter, lowCenter });
      offset += 6;
    }

    // Score each user: mean differential (cos_high - cos_low) per axis
    const rawScores = userBounds.map(({ handle, start, end }) => {
      const userEmbeds = embeddings.slice(start, end);
      const scores = {};
      for (const { axis, highCenter, lowCenter } of axisCentroids) {
        let sum = 0;
        for (const emb of userEmbeds) {
          sum += cosineSim(emb, highCenter) - cosineSim(emb, lowCenter);
        }
        scores[axis] = sum / userEmbeds.length;
      }
      return { handle, ...scores };
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
