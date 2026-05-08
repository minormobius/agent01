// rite — sentence editing drill (+ fodder corpus crowdsourcing at /fodder/)
//
// Drill routes:
//   GET  /api/sentence              -> { id, original, style }
//   GET  /api/sentence?id=v007      -> deterministic fetch
//   POST /api/grade                 -> { score, breakdown, references, comment }
//
// Fodder routes (corpus crowdsourcing, served at /fodder/):
//   GET  /api/fodder/next           -> next batch of unvoted candidates
//   POST /api/fodder/vote           -> { id, direction, voter_id }
//   GET  /api/fodder/promoted       -> approved candidates in corpus.json shape
//   GET  /api/fodder/stats          -> totals
//   POST /api/fodder/admin/mine     -> manual mining trigger (X-Admin-Key required)
//
// Cron (every 6h) mines verbose sentences from Project Gutenberg.

const SYLLABLE_RE = /[aeiouy]+/g;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      // Drill
      if (url.pathname === '/api/sentence') return serveSentence(url, env);
      if (url.pathname === '/api/grade' && request.method === 'POST') return gradeSubmission(request, env);

      // Fodder
      if (url.pathname === '/api/fodder/next')                         return fodderNext(request, env, url);
      if (url.pathname === '/api/fodder/vote' && request.method === 'POST') return fodderVote(request, env);
      if (url.pathname === '/api/fodder/promoted')                     return fodderPromoted(env);
      if (url.pathname === '/api/fodder/stats')                        return fodderStats(env);
      if (url.pathname === '/api/fodder/admin/mine' && request.method === 'POST') return fodderAdminMine(request, env);

      if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(mineGutenberg(env).catch((e) => console.error('cron mine failed', e)));
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

// ============================================================================
// FODDER — crowdsourced corpus extension
// ============================================================================

const PROMOTE_THRESHOLD_YES = 5;
const PROMOTE_RATIO = 0.7;
const REJECT_THRESHOLD_NO = 8;
const REJECT_RATIO = 0.7;
const MAX_PER_MINING_RUN = 5;
const FODDER_MIN_WORDS = 40;
const FODDER_MAX_WORDS = 90;
const FODDER_MAX_FLESCH = 35;

const GUTENBERG_BOOKS = [
  { id: 2833, author: 'Henry James',     title: 'The Portrait of a Lady',                style: 'victorian' },
  { id: 432,  author: 'Henry James',     title: 'The Ambassadors',                       style: 'victorian' },
  { id: 209,  author: 'Henry James',     title: 'The Turn of the Screw',                 style: 'victorian' },
  { id: 1023, author: 'Charles Dickens', title: 'Bleak House',                           style: 'victorian' },
  { id: 700,  author: 'George Eliot',    title: 'Middlemarch',                           style: 'victorian' },
  { id: 1144, author: 'Thomas Carlyle',  title: 'Sartor Resartus',                       style: 'victorian' },
  { id: 27200,author: 'Walter Pater',    title: 'The Renaissance',                       style: 'victorian' },
  { id: 4332, author: 'John Ruskin',     title: 'The Stones of Venice, Volume I',        style: 'victorian' },
  { id: 6315, author: 'Edmund Burke',    title: 'Reflections on the Revolution in France', style: 'bureaucratic' },
  { id: 5827, author: 'John Stuart Mill', title: 'On Liberty',                           style: 'academic' },
];

// ---------- /api/fodder/next ----------

async function fodderNext(request, env, url) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const voterId = getVoterId(request);
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '8', 10)));
  const sql = `
    SELECT c.id, c.original, c.style, c.source, c.refs_json, c.word_count, c.flesch,
           c.yes_votes, c.no_votes, c.skip_votes
    FROM fodder_candidates c
    WHERE c.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM fodder_votes v
        WHERE v.candidate_id = c.id AND v.voter_id = ?
      )
    ORDER BY (c.yes_votes + c.no_votes) ASC, c.created_at ASC
    LIMIT ?
  `;
  const { results } = await env.DB.prepare(sql).bind(voterId, limit).all();
  const candidates = (results || []).map(rowToCandidate);
  return json({ voter_id: voterId, candidates });
}

// ---------- /api/fodder/vote ----------

async function fodderVote(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { id, direction, voter_id } = body || {};
  if (typeof id !== 'string' || typeof voter_id !== 'string') {
    return json({ error: 'missing id or voter_id' }, 400);
  }
  if (!['yes', 'no', 'skip'].includes(direction)) return json({ error: 'bad direction' }, 400);
  if (voter_id.length < 6 || voter_id.length > 64) return json({ error: 'bad voter_id' }, 400);

  const insertVote = await env.DB.prepare(
    `INSERT OR IGNORE INTO fodder_votes (candidate_id, voter_id, direction) VALUES (?, ?, ?)`
  ).bind(id, voter_id, direction).run();

  if (!insertVote.meta.changes) return await fodderVoteResponse(env, id, false);

  const col = direction === 'yes' ? 'yes_votes' : direction === 'no' ? 'no_votes' : 'skip_votes';
  await env.DB.prepare(
    `UPDATE fodder_candidates SET ${col} = ${col} + 1 WHERE id = ?`
  ).bind(id).run();

  await fodderMaybePromoteOrReject(env, id);
  return await fodderVoteResponse(env, id, true);
}

async function fodderVoteResponse(env, id, counted) {
  const row = await env.DB.prepare(
    `SELECT id, status, yes_votes, no_votes, skip_votes FROM fodder_candidates WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json({ ok: true, counted, ...row });
}

async function fodderMaybePromoteOrReject(env, id) {
  const row = await env.DB.prepare(
    `SELECT yes_votes, no_votes, status FROM fodder_candidates WHERE id = ?`
  ).bind(id).first();
  if (!row || row.status !== 'pending') return;
  const total = row.yes_votes + row.no_votes;
  if (total === 0) return;
  const yesRatio = row.yes_votes / total;
  if (row.yes_votes >= PROMOTE_THRESHOLD_YES && yesRatio >= PROMOTE_RATIO) {
    await env.DB.prepare(
      `UPDATE fodder_candidates SET status='approved', promoted_at=unixepoch() WHERE id=? AND status='pending'`
    ).bind(id).run();
  } else if (row.no_votes >= REJECT_THRESHOLD_NO && (1 - yesRatio) >= REJECT_RATIO) {
    await env.DB.prepare(
      `UPDATE fodder_candidates SET status='rejected' WHERE id=? AND status='pending'`
    ).bind(id).run();
  }
}

// ---------- /api/fodder/promoted ----------

async function fodderPromoted(env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const { results } = await env.DB.prepare(
    `SELECT id, original, style, source, refs_json, yes_votes, no_votes, promoted_at
     FROM fodder_candidates WHERE status='approved' ORDER BY promoted_at ASC`
  ).all();
  const sentences = (results || []).map((r) => {
    const refs = JSON.parse(r.refs_json);
    return {
      id: r.id,
      style: r.style,
      original: r.original,
      references: [refs.literal, refs.idiomatic, refs.alternative].filter(Boolean),
      source: r.source,
      crowd: { yes: r.yes_votes, no: r.no_votes, promoted_at: r.promoted_at },
    };
  });
  return json({ version: 2, source: 'rite.mino.mobi/fodder', sentences });
}

// ---------- /api/fodder/stats ----------

async function fodderStats(env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM fodder_candidates GROUP BY status`
  ).all();
  const totals = { pending: 0, approved: 0, rejected: 0 };
  for (const row of counts.results || []) totals[row.status] = row.n;
  const votesRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM fodder_votes`).first();
  const votersRow = await env.DB.prepare(`SELECT COUNT(DISTINCT voter_id) AS n FROM fodder_votes`).first();
  return json({
    candidates: totals,
    votes_total: votesRow ? votesRow.n : 0,
    voters_total: votersRow ? votersRow.n : 0,
  });
}

// ---------- /api/fodder/admin/mine ----------

async function fodderAdminMine(request, env) {
  const key = request.headers.get('x-admin-key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: 'forbidden' }, 403);
  const result = await mineGutenberg(env);
  return json(result);
}

// ---------- mining ----------

async function mineGutenberg(env) {
  if (!env.DB) throw new Error('D1 not configured');
  if (!env.AI) throw new Error('AI not configured');

  const cursorRow = await env.DB.prepare(`SELECT value FROM fodder_state WHERE key='book_cursor'`).first();
  const cursor = cursorRow ? parseInt(cursorRow.value, 10) || 0 : 0;
  const book = GUTENBERG_BOOKS[cursor % GUTENBERG_BOOKS.length];
  await env.DB.prepare(
    `INSERT INTO fodder_state (key, value, updated_at) VALUES ('book_cursor', ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).bind(String(cursor + 1)).run();

  const proxyUrl = `https://read.mino.mobi/gutenberg-proxy?id=${book.id}`;
  const resp = await fetch(proxyUrl);
  if (!resp.ok) return { ok: false, error: `gutenberg fetch failed: ${resp.status}`, book };

  const text = await resp.text();
  const candidates = harvestSentences(text, MAX_PER_MINING_RUN * 6);
  const filtered = candidates
    .filter((s) => {
      const w = countWords(s);
      if (w < FODDER_MIN_WORDS || w > FODDER_MAX_WORDS) return false;
      if (flesch(s) > FODDER_MAX_FLESCH) return false;
      if (/^[A-Z\s]+$/.test(s.trim())) return false;
      return true;
    })
    .slice(0, MAX_PER_MINING_RUN);

  const inserted = [];
  for (const sent of filtered) {
    const exists = await env.DB.prepare(
      `SELECT 1 FROM fodder_candidates WHERE original = ? LIMIT 1`
    ).bind(sent).first();
    if (exists) continue;

    let refs;
    try { refs = await fodderGenerateReferences(env, sent); }
    catch (e) { console.error('llm refs failed for', book.title, e.message); continue; }
    if (!refs || !refs.literal || !refs.idiomatic || !refs.alternative) continue;
    if (refsLookBroken(sent, refs)) continue;

    const id = `f-${book.id}-${shortHash(sent)}`;
    const source = `${book.author} — ${book.title} (Gutenberg #${book.id})`;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO fodder_candidates (id, original, style, source, refs_json, word_count, flesch)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, sent, book.style, source, JSON.stringify(refs), countWords(sent), flesch(sent)).run();
    inserted.push(id);
  }

  return { ok: true, book, scanned: candidates.length, kept: filtered.length, inserted: inserted.length, ids: inserted };
}

function harvestSentences(text, want) {
  const startMarker = /\*\*\* START OF (?:THIS|THE) PROJECT GUTENBERG.*?\*\*\*/i;
  const endMarker   = /\*\*\* END OF (?:THIS|THE) PROJECT GUTENBERG.*?\*\*\*/i;
  const sStart = text.match(startMarker);
  const sEnd = text.match(endMarker);
  let body = text;
  if (sStart) body = body.slice(sStart.index + sStart[0].length);
  if (sEnd) {
    const idx = body.search(endMarker);
    if (idx > 0) body = body.slice(0, idx);
  }
  body = body.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, ' ¶ ').replace(/\n/g, ' ').replace(/\s+/g, ' ');

  const out = [];
  const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z"'“‘])/);
  for (const raw of sentences) {
    const s = raw.replace(/\s*¶\s*/g, ' ').trim();
    if (s.length < 80 || s.length > 600) continue;
    if (s.includes('  ')) continue;
    if (!/[a-z]/.test(s)) continue;
    out.push(s);
    if (out.length >= want * 4) break;
  }
  shuffleArr(out);
  return out.slice(0, want);
}

async function fodderGenerateReferences(env, sentence) {
  const prompt = `You rewrite verbose, hard-to-read sentences concisely while preserving meaning.

Original sentence:
${sentence}

Produce three short rewrites of the original:
- "literal": a direct, plain rewrite
- "idiomatic": uses a natural English idiom or saying
- "alternative": a punchier or more casual angle

Each rewrite must be one sentence, under 25 words, and preserve the original meaning.

Return STRICT JSON only, with exactly these three keys: literal, idiomatic, alternative.
No prose, no preamble, no markdown fences. Example:
{"literal":"...","idiomatic":"...","alternative":"..."}`;

  const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: 'You output only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 240,
    temperature: 0.6,
  });
  const raw = (out && (out.response || out.result || '')) + '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  let obj;
  try { obj = JSON.parse(jsonMatch[0]); } catch { return null; }
  return {
    literal:     typeof obj.literal === 'string'     ? obj.literal.trim()     : null,
    idiomatic:   typeof obj.idiomatic === 'string'   ? obj.idiomatic.trim()   : null,
    alternative: typeof obj.alternative === 'string' ? obj.alternative.trim() : null,
  };
}

function refsLookBroken(original, refs) {
  const origWords = countWords(original);
  for (const key of ['literal', 'idiomatic', 'alternative']) {
    const r = refs[key];
    if (!r) return true;
    const rw = countWords(r);
    if (rw < 3 || rw >= origWords) return true;
    if (r.toLowerCase() === original.toLowerCase()) return true;
  }
  return false;
}

// ---------- fodder helpers ----------

function rowToCandidate(r) {
  let refs = {};
  try { refs = JSON.parse(r.refs_json); } catch {}
  return {
    id: r.id,
    original: r.original,
    style: r.style,
    source: r.source,
    word_count: r.word_count,
    flesch: r.flesch,
    references: [refs.literal, refs.idiomatic, refs.alternative].filter(Boolean),
    crowd: { yes: r.yes_votes, no: r.no_votes, skip: r.skip_votes },
  };
}

function getVoterId(request) {
  const fromHeader = request.headers.get('x-voter-id');
  if (fromHeader && fromHeader.length >= 6 && fromHeader.length <= 64) return fromHeader;
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ua = request.headers.get('user-agent') || '';
  return 'anon-' + shortHash(ip + '|' + ua);
}

function shortHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
