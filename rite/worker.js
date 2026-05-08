// rite — sentence editing drill
//
// Routes:
//   GET  /api/sentence            -> { id, original, style }
//   GET  /api/sentence?id=v007    -> deterministic fetch
//   POST /api/grade               -> { score, breakdown, reference, comment }
//   *                              -> static asset (ASSETS binding)

const SYLLABLE_RE = /[aeiouy]+/g;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/sentence') {
      return serveSentence(url, env);
    }
    if (url.pathname === '/api/grade' && request.method === 'POST') {
      return gradeSubmission(request, env);
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

// ---------- corpus loader (lazy, cached in worker isolate) ----------

let _corpus = null;
async function loadCorpus(env) {
  if (_corpus) return _corpus;
  const res = await env.ASSETS.fetch(new Request('https://rite/corpus.json'));
  if (!res.ok) throw new Error('corpus missing');
  const data = await res.json();
  _corpus = data.sentences;
  return _corpus;
}

// ---------- /api/sentence ----------

async function serveSentence(url, env) {
  const sentences = await loadCorpus(env);
  const wantId = url.searchParams.get('id');
  let pick;
  if (wantId) {
    pick = sentences.find((s) => s.id === wantId);
    if (!pick) return json({ error: 'unknown id' }, 404);
  } else {
    pick = sentences[Math.floor(Math.random() * sentences.length)];
  }
  return json({
    id: pick.id,
    style: pick.style,
    original: pick.original,
    word_count: countWords(pick.original),
  });
}

// ---------- /api/grade ----------

async function gradeSubmission(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const { id, edit, elapsed_ms } = body || {};
  if (typeof id !== 'string' || typeof edit !== 'string') {
    return json({ error: 'missing id or edit' }, 400);
  }
  const trimmed = edit.trim();
  if (!trimmed) return json({ error: 'edit is empty' }, 400);
  if (trimmed.length > 1000) return json({ error: 'edit too long' }, 400);

  const sentences = await loadCorpus(env);
  const item = sentences.find((s) => s.id === id);
  if (!item) return json({ error: 'unknown id' }, 404);

  // Schema tolerance: accept either `references` (v2) or `reference` (v1).
  const references = Array.isArray(item.references) && item.references.length
    ? item.references
    : (item.reference ? [item.reference] : []);
  if (!references.length) return json({ error: 'corpus entry missing references' }, 500);

  const origWords = countWords(item.original);
  const refWordCounts = references.map(countWords);
  const targetRefWords = median(refWordCounts);
  const userWords = countWords(trimmed);

  // ---- Brevity: peaks when user length ≈ median reference length.
  //      Penalize verbosity more than brevity.
  const brevityRatio = userWords / targetRefWords;
  let brevity;
  if (brevityRatio <= 1) {
    brevity = 1.0;
  } else if (brevityRatio <= 1.5) {
    brevity = 1 - (brevityRatio - 1) * 0.6;
  } else {
    brevity = Math.max(0, 1 - (brevityRatio - 1) * 0.6);
  }
  if (userWords >= origWords) brevity = Math.min(brevity, 0.1);

  // ---- Clarity: Flesch reading-ease delta vs. the original.
  const origFlesch = flesch(item.original);
  const userFlesch = flesch(trimmed);
  const fleschDelta = userFlesch - origFlesch;
  const clarity = Math.max(0, Math.min(1, fleschDelta / 40));

  // ---- Fidelity: max cosine across all reference rewrites.
  let bestRefIdx = 0;
  let bestCosine = 0;
  let allCosines = references.map(() => 0);
  let fidelityErr = null;
  try {
    allCosines = await embedAndCompareAll(env, trimmed, references);
    for (let i = 0; i < allCosines.length; i++) {
      if (allCosines[i] > bestCosine) {
        bestCosine = allCosines[i];
        bestRefIdx = i;
      }
    }
  } catch (e) {
    fidelityErr = String(e && e.message || e);
    // Fallback: max Jaccard across references.
    allCosines = references.map((r) => jaccard(trimmed, r));
    for (let i = 0; i < allCosines.length; i++) {
      if (allCosines[i] > bestCosine) {
        bestCosine = allCosines[i];
        bestRefIdx = i;
      }
    }
  }
  // Squash: 0.55..0.95 -> 0..1
  const fidelityScaled = Math.max(0, Math.min(1, (bestCosine - 0.55) / 0.4));

  // ---- Time bonus.
  const elapsedSec = Math.max(0, Number(elapsed_ms || 0) / 1000);
  let timeBonus;
  if (elapsedSec <= 10) timeBonus = 1.0;
  else if (elapsedSec <= 60) timeBonus = 1.0 - ((elapsedSec - 10) / 50) * 0.5;
  else timeBonus = 0.5;

  // ---- Final score.
  const baseScore = fidelityScaled * 0.5 + brevity * 0.3 + clarity * 0.2;
  const finalScore = Math.round(baseScore * timeBonus * 100);

  const comment = buildComment({
    fidelityScaled, brevity, clarity, timeBonus,
    userWords, origWords, targetRefWords, fleschDelta,
  });

  return json({
    id,
    score: finalScore,
    breakdown: {
      fidelity: round3(fidelityScaled),
      fidelity_raw_cosine: round3(bestCosine),
      brevity: round3(brevity),
      clarity: round3(clarity),
      time_bonus: round3(timeBonus),
    },
    stats: {
      original_words: origWords,
      reference_words_median: targetRefWords,
      reference_word_counts: refWordCounts,
      user_words: userWords,
      flesch_original: round3(origFlesch),
      flesch_user: round3(userFlesch),
      flesch_delta: round3(fleschDelta),
      elapsed_sec: round3(elapsedSec),
    },
    references: references.map((text, i) => ({
      text,
      similarity: round3(allCosines[i] || 0),
      best: i === bestRefIdx,
    })),
    best_reference: references[bestRefIdx],
    comment,
    notes: fidelityErr ? `embeddings unavailable: ${fidelityErr}` : null,
  });
}

// ---------- helpers ----------

function countWords(s) {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = stripped.match(SYLLABLE_RE);
  return m ? m.length : 1;
}

function flesch(text) {
  const words = text.trim().match(/\S+/g) || [];
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  if (!words.length) return 0;
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
}

function tokenize(s) {
  return (s.toLowerCase().match(/[a-z']+/g) || []);
}

function jaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

async function embedAndCompareAll(env, userText, references) {
  if (!env.AI) throw new Error('AI binding not configured');
  // One batched call: [user, ...references]. Cost stays ~1 neuron per grade.
  const out = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [userText, ...references],
  });
  const vectors = out.data;
  if (!vectors || vectors.length < 2) throw new Error('unexpected embedding shape');
  const userVec = vectors[0];
  return references.map((_, i) => cosine(userVec, vectors[i + 1]));
}

function median(xs) {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function buildComment({ fidelityScaled, brevity, clarity, timeBonus, userWords, origWords, targetRefWords, fleschDelta }) {
  const bits = [];
  if (fidelityScaled < 0.4) bits.push('Meaning drifted — your edit reads as a different sentence.');
  else if (fidelityScaled < 0.7) bits.push('Meaning mostly preserved, but some nuance shifted.');
  else bits.push('Meaning preserved well.');

  if (userWords >= origWords) bits.push(`You didn't shorten it — still ${userWords} words.`);
  else if (userWords <= targetRefWords) bits.push(`Tight: ${userWords} words (typical rewrite is ${targetRefWords}, original ${origWords}).`);
  else bits.push(`Cut ${origWords - userWords} words; the typical rewrite is even tighter at ${targetRefWords}.`);

  if (clarity > 0.5) bits.push('Reading ease improved sharply.');
  else if (clarity > 0.2) bits.push('Modest clarity improvement.');
  else bits.push('Reading ease barely changed.');

  if (timeBonus < 0.7) bits.push('Try to finish faster.');

  return bits.join(' ');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
