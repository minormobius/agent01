// Cloudflare Pages Function — embedding service for mino.mobi/ternary2
//
// POST /ternary-embed { texts: [string, ...] }
// → { embeddings: [[...float], ...] }  (one L2-normalized vector per input)
//
// ternary2 keeps its (facet-max) scoring math in the browser and only offloads
// the embeddings here, so it no longer ships a 110MB in-browser model. Vectors
// are mean-pooled by Workers AI and L2-normalized server-side, so the client's
// plain dot-product scoring behaves as cosine similarity.
//
// Requires the AI binding in the root Pages project (same one functions/ternary.js
// and functions/novelty.js use). Same-origin with ternary2, so no CORS dance —
// the permissive headers below just mirror the sibling functions.

const EMBED_BATCH = 100;            // Workers AI batch size
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const MAX_TEXTS = 500;              // hard cap per request (client batches at 100)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// L2-normalize in place so downstream dot products equal cosine similarity.
function l2normalize(v) {
  let mag = 0;
  for (let i = 0; i < v.length; i++) mag += v[i] * v[i];
  mag = Math.sqrt(mag);
  if (mag === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= mag;
  return v;
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

    const { texts } = await request.json();
    if (!Array.isArray(texts) || texts.length === 0) {
      return Response.json({ error: 'texts array required' }, { status: 400, headers: CORS });
    }
    if (texts.length > MAX_TEXTS) {
      return Response.json(
        { error: `too many texts (max ${MAX_TEXTS} per request)` },
        { status: 400, headers: CORS }
      );
    }
    // bge rejects empty strings; substitute a single space to keep indices aligned.
    const clean = texts.map(t => (typeof t === 'string' && t.trim() ? t : ' '));

    const embeddings = [];
    for (let i = 0; i < clean.length; i += EMBED_BATCH) {
      const batch = clean.slice(i, i + EMBED_BATCH);
      const result = await ai.run(EMBED_MODEL, { text: batch });
      for (const vec of result.data) embeddings.push(l2normalize(vec));
    }

    return Response.json({ embeddings }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
