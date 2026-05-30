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
//   GET  /api/health                -> liveness + commit marker
//
// Cron (every 6h) mines verbose sentences from Project Gutenberg.

const SYLLABLE_RE = /[aeiouy]+/g;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      // Drill
      if (url.pathname === '/api/sentence') return serveSentence(url, env);
      if (url.pathname === '/api/grade' && request.method === 'POST') return gradeSubmission(request, env);

      // Health: sanity check which version of the worker is live and which bindings
      // are wired. Returns 200 with a small JSON body listing route names.
      if (url.pathname === '/api/health') {
        return json({
          ok: true,
          version: 'ask-map-v2',
          routes: [
            '/api/sentence', '/api/grade',
            '/api/fodder/next', '/api/fodder/vote', '/api/fodder/promoted',
            '/api/fodder/stats', '/api/fodder/admin/mine',
            '/api/ask/check', '/api/ask/index', '/api/ask/query', '/api/ask/map', '/api/ask/thread',
            '/api/signal/check', '/api/signal/index', '/api/signal/query', '/api/signal/map', '/api/signal/target',
          ],
          bindings: { ai: !!env.AI, db: !!env.DB, assets: !!env.ASSETS, admin_key_set: !!env.ADMIN_KEY },
        });
      }

      // Fodder
      if (url.pathname === '/api/fodder/next')                         return fodderNext(request, env, url);
      if (url.pathname === '/api/fodder/vote' && request.method === 'POST') return fodderVote(request, env, ctx);
      if (url.pathname === '/api/fodder/promoted')                     return fodderPromoted(env);
      if (url.pathname === '/api/fodder/stats')                        return fodderStats(env);
      if (url.pathname === '/api/fodder/admin/mine' && request.method === 'POST') return fodderAdminMine(request, env, ctx);

      // Ask: vector index over a profile's prose threads.
      if (url.pathname === '/api/ask/check')                           return askCheck(env, url);
      if (url.pathname === '/api/ask/index' && request.method === 'POST') return askIndex(request, env);
      if (url.pathname === '/api/ask/query' && request.method === 'POST') return askQuery(request, env);
      if (url.pathname === '/api/ask/bridge' && request.method === 'POST') return askBridge(request, env);
      if (url.pathname === '/api/ask/map')                             return askMap(env, url);
      if (url.pathname === '/api/ask/thread')                          return askThread(env, url);

      // Signal: vector index over the *targets* of a user's reposts. Mirrors
      // ask's shape but the embedded records belong to other authors —
      // signal_targets is keyed by (subscriber_did, target_uri).
      if (url.pathname === '/api/signal/check')                           return signalCheck(env, url);
      if (url.pathname === '/api/signal/index' && request.method === 'POST') return signalIndex(request, env);
      if (url.pathname === '/api/signal/query' && request.method === 'POST') return signalQuery(request, env);
      if (url.pathname === '/api/signal/map')                             return signalMap(env, url);
      if (url.pathname === '/api/signal/target')                          return signalTarget(env, url);

      if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try { await mineGutenberg(env); } catch (e) { console.error('cron mine failed', e); }
      try { await backfillApprovedRefs(env, REF_BACKFILL_PER_RUN); }
      catch (e) { console.error('cron ref backfill failed', e); }
    })());
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

// Baseline word frequencies (per million in general English, from SUBTLEX /
// hermitdave OpenSubtitles via the fetch-lexicons workflow). Used for the
// ask cluster-label scoring so that common words can't bind cluster labels
// even when slightly concentrated in one cluster. Loaded once per isolate.
let _baselineFreqCache = null;
async function getBaselineFreq(env) {
  if (_baselineFreqCache !== null) return _baselineFreqCache;
  try {
    const res = await env.ASSETS.fetch(new Request('https://rite/lexicon/data/baseline.json'));
    _baselineFreqCache = res.ok ? await res.json() : {};
  } catch {
    _baselineFreqCache = {};
  }
  return _baselineFreqCache;
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
const REF_BACKFILL_PER_RUN = 10;       // approved-no-refs candidates the cron tries to fill per tick
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

async function fodderVote(request, env, ctx) {
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

  await fodderMaybePromoteOrReject(env, id, ctx);
  return await fodderVoteResponse(env, id, true);
}

async function fodderVoteResponse(env, id, counted) {
  const row = await env.DB.prepare(
    `SELECT id, status, yes_votes, no_votes, skip_votes FROM fodder_candidates WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json({ ok: true, counted, ...row });
}

async function fodderMaybePromoteOrReject(env, id, ctx) {
  const row = await env.DB.prepare(
    `SELECT yes_votes, no_votes, status FROM fodder_candidates WHERE id = ?`
  ).bind(id).first();
  if (!row || row.status !== 'pending') return;
  const total = row.yes_votes + row.no_votes;
  if (total === 0) return;
  const yesRatio = row.yes_votes / total;
  if (row.yes_votes >= PROMOTE_THRESHOLD_YES && yesRatio >= PROMOTE_RATIO) {
    const result = await env.DB.prepare(
      `UPDATE fodder_candidates SET status='approved', promoted_at=unixepoch() WHERE id=? AND status='pending'`
    ).bind(id).run();
    // If we actually flipped the row to approved, generate references in the background.
    // ctx.waitUntil keeps the worker alive until the promise resolves; the vote
    // response is returned immediately regardless. Cron's backfillApprovedRefs
    // catches anything that fails or runs out of time.
    if (result.meta.changes && ctx) {
      ctx.waitUntil(fillRefsForApproved(env, id).catch((e) => console.error('ref fill failed', id, e)));
    }
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
  const sentences = [];
  let pendingRefs = 0;
  for (const r of results || []) {
    let refs;
    try { refs = JSON.parse(r.refs_json || '{}'); } catch { refs = {}; }
    // Approved-but-no-refs rows are excluded from /api/promoted: the sync
    // script only sees rows that are actually ready to ship into corpus.json.
    if (!refs.literal || !refs.idiomatic || !refs.alternative) {
      pendingRefs++;
      continue;
    }
    sentences.push({
      id: r.id,
      style: r.style,
      original: r.original,
      references: [refs.literal, refs.idiomatic, refs.alternative],
      source: r.source,
      crowd: { yes: r.yes_votes, no: r.no_votes, promoted_at: r.promoted_at },
    });
  }
  return json({ version: 2, source: 'rite.mino.mobi/fodder', pending_refs: pendingRefs, sentences });
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
  // Approved candidates whose refs are still being generated.
  const pendingRefsRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM fodder_candidates
     WHERE status='approved' AND (refs_json IS NULL OR refs_json='' OR refs_json='{}')`
  ).first();
  return json({
    candidates: totals,
    approved_pending_refs: pendingRefsRow ? pendingRefsRow.n : 0,
    votes_total: votesRow ? votesRow.n : 0,
    voters_total: votersRow ? votersRow.n : 0,
  });
}

// ---------- /api/fodder/admin/mine ----------

async function fodderAdminMine(request, env, ctx) {
  const key = request.headers.get('x-admin-key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: 'forbidden' }, 403);
  const url = new URL(request.url);
  // Optional ?action=backfill_refs runs only the ref backfill (no new mining).
  // Useful for filling refs on existing approved-no-refs rows after this change rolls out.
  if (url.searchParams.get('action') === 'backfill_refs') {
    const max = Math.min(50, Math.max(1, parseInt(url.searchParams.get('max') || String(REF_BACKFILL_PER_RUN), 10)));
    const result = await backfillApprovedRefs(env, max);
    return json({ action: 'backfill_refs', ...result });
  }
  const mined = await mineGutenberg(env);
  // Also attempt a small backfill so this endpoint covers both responsibilities.
  const backfilled = await backfillApprovedRefs(env, REF_BACKFILL_PER_RUN);
  return json({ mined, backfilled });
}

// ---------- mining ----------

async function mineGutenberg(env) {
  if (!env.DB) throw new Error('D1 not configured');
  // No AI required at mining time — references are generated lazily on promotion.

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

    const id = `f-${book.id}-${shortHash(sent)}`;
    const source = `${book.author} — ${book.title} (Gutenberg #${book.id})`;
    // refs_json starts empty ('{}'). It gets filled in by fillRefsForApproved
    // once the candidate crosses the promotion threshold.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO fodder_candidates (id, original, style, source, refs_json, word_count, flesch)
       VALUES (?, ?, ?, ?, '{}', ?, ?)`
    ).bind(id, sent, book.style, source, countWords(sent), flesch(sent)).run();
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

// Generate refs for a single approved candidate that doesn't yet have them.
// Skips silently if the row is missing, already has full refs, or the LLM
// produces output that fails the broken-rewrite filter (cron will retry).
async function fillRefsForApproved(env, id) {
  if (!env.DB) throw new Error('D1 not configured');
  if (!env.AI) throw new Error('AI not configured');
  const row = await env.DB.prepare(
    `SELECT original, refs_json FROM fodder_candidates WHERE id = ?`
  ).bind(id).first();
  if (!row) return { ok: false, reason: 'missing' };
  let parsed = {};
  try { parsed = JSON.parse(row.refs_json || '{}'); } catch {}
  if (parsed.literal && parsed.idiomatic && parsed.alternative) {
    return { ok: true, reason: 'already_filled' };
  }
  let refs;
  try { refs = await fodderGenerateReferences(env, row.original); }
  catch (e) { return { ok: false, reason: 'llm_error', error: String(e.message || e) }; }
  if (!refs || !refs.literal || !refs.idiomatic || !refs.alternative) {
    return { ok: false, reason: 'incomplete_refs' };
  }
  if (refsLookBroken(row.original, refs)) {
    return { ok: false, reason: 'refs_broken' };
  }
  await env.DB.prepare(
    `UPDATE fodder_candidates SET refs_json = ? WHERE id = ?`
  ).bind(JSON.stringify(refs), id).run();
  return { ok: true, reason: 'filled' };
}

// Cron-side: scan for approved candidates whose refs_json is still empty
// (e.g. a vote burst exhausted ctx.waitUntil budget, or Llama threw).
async function backfillApprovedRefs(env, max) {
  if (!env.DB) return { ok: false, reason: 'no_db' };
  const { results } = await env.DB.prepare(
    `SELECT id FROM fodder_candidates
     WHERE status = 'approved'
       AND (refs_json IS NULL OR refs_json = '' OR refs_json = '{}')
     ORDER BY promoted_at ASC
     LIMIT ?`
  ).bind(max).all();
  const outcomes = [];
  for (const row of results || []) {
    const r = await fillRefsForApproved(env, row.id);
    outcomes.push({ id: row.id, ...r });
  }
  return { ok: true, attempted: outcomes.length, outcomes };
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

// ============================================================================
// ASK — vector index over a Bluesky profile's prose threads
// ============================================================================
//
// Pipeline:
//   1. Browser pulls user's CAR via PDS, parses with WASM, builds prose
//      thread chains (≥ MIN chars). All client-side; reuses redact pipeline.
//   2. Browser POSTs threads to /api/ask/index. Worker batches embedding
//      calls (@cf/baai/bge-base-en-v1.5, 768 dim) and stores rows in D1
//      with embedding as float32 LE BLOB.
//   3. Browser POSTs query to /api/ask/query. Worker embeds q, loads all
//      vectors for did, computes cosine, returns top-k threads.
//
// First indexing: ~5-15 sec for 500 threads. Subsequent visitors hitting
// the same DID skip embedding entirely and answer queries in ~50 ms.

const ASK_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const ASK_EMBED_DIM = 768;
const ASK_BATCH_SIZE = 96;          // BGE-base's documented per-call max
const ASK_DEFAULT_K = 10;
const ASK_MAX_THREADS_PER_INDEX = 10000;
// BGE retrieval models are asymmetric: queries must be prefixed with this
// instruction string to land in the same region of embedding space as the
// (unprefixed) passages. Skipping this collapses query/passage cosine by
// ~0.1-0.2 — large enough to make most queries return zero useful hits.
const ASK_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

async function askCheck(env, url) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const did = url.searchParams.get('did');
  if (!did) return json({ error: 'missing did' }, 400);
  const meta = await env.DB.prepare(
    `SELECT did, handle, thread_count, post_count, total_chars, indexed_at
     FROM ask_index_meta WHERE did = ?`
  ).bind(did).first();
  if (!meta) return json({ indexed: false, did });
  return json({ indexed: true, ...meta });
}

async function askIndex(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  if (!env.AI) return json({ error: 'AI binding not configured' }, 500);
  const t0 = Date.now();

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { did, handle, threads } = body || {};
  if (typeof did !== 'string' || !Array.isArray(threads)) {
    return json({ error: 'missing did or threads' }, 400);
  }
  if (!did.startsWith('did:')) return json({ error: 'bad did' }, 400);
  if (threads.length === 0) return json({ ok: true, did, newly_indexed: 0, total_threads: 0, time_ms: 0 });
  if (threads.length > ASK_MAX_THREADS_PER_INDEX) {
    return json({ error: `too many threads (${threads.length} > ${ASK_MAX_THREADS_PER_INDEX})` }, 400);
  }

  // Filter threads that aren't already indexed (idempotent re-runs).
  const existing = new Set();
  {
    // Load existing thread_ids for this DID. For very large indexes this could
    // be paginated, but at our scale (≤ a few thousand) one query is fine.
    const { results } = await env.DB.prepare(
      `SELECT thread_id FROM ask_threads WHERE did = ?`
    ).bind(did).all();
    for (const r of results || []) existing.add(r.thread_id);
  }

  const fresh = [];
  for (const t of threads) {
    if (typeof t.thread_id !== 'string' || typeof t.text !== 'string') continue;
    if (existing.has(t.thread_id)) continue;
    if (t.text.length < 50 || t.text.length > 20000) continue;
    fresh.push(t);
  }

  // Batch-embed the fresh threads.
  let embeddedCount = 0;
  for (let i = 0; i < fresh.length; i += ASK_BATCH_SIZE) {
    const batch = fresh.slice(i, i + ASK_BATCH_SIZE);
    const texts = batch.map((t) => t.text);
    const out = await env.AI.run(ASK_EMBED_MODEL, { text: texts });
    if (!out || !out.data || out.data.length !== batch.length) {
      throw new Error(`unexpected embedding shape (got ${out?.data?.length} for ${batch.length})`);
    }

    // D1 batched insert.
    const stmts = [];
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j];
      const vec = out.data[j];
      const blob = floatsToBlob(vec);
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO ask_threads
             (did, thread_id, text, post_count, char_count, flesch, created_at, embedding)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          did, t.thread_id, t.text,
          Number(t.post_count) || 1,
          Number(t.char_count) || t.text.length,
          t.flesch == null ? null : Number(t.flesch),
          t.created_at || null,
          blob
        )
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
    embeddedCount += batch.length;
  }

  // Recompute meta from the canonical rows.
  const rollup = await env.DB.prepare(
    `SELECT COUNT(*) AS thread_count, SUM(char_count) AS total_chars,
            SUM(post_count) AS post_count
       FROM ask_threads WHERE did = ?`
  ).bind(did).first();
  await env.DB.prepare(
    `INSERT INTO ask_index_meta (did, handle, thread_count, post_count, total_chars, indexed_at)
     VALUES (?, ?, ?, ?, ?, unixepoch())
     ON CONFLICT(did) DO UPDATE SET
       handle = excluded.handle,
       thread_count = excluded.thread_count,
       post_count   = excluded.post_count,
       total_chars  = excluded.total_chars,
       indexed_at   = excluded.indexed_at`
  ).bind(
    did,
    typeof handle === 'string' ? handle : null,
    rollup?.thread_count || 0,
    rollup?.post_count || 0,
    rollup?.total_chars || 0
  ).run();

  // Recompute the 2D map projection over the full DID after every index.
  // PCA is the cheapest projection that respects semantic structure; we can
  // upgrade to UMAP later if the layout ever looks blobby.
  let mapTimeMs = 0;
  try {
    const mt0 = Date.now();
    await recomputeAskMap(env, did);
    mapTimeMs = Date.now() - mt0;
  } catch (e) {
    console.error('map recompute failed', e);
  }

  return json({
    ok: true,
    did,
    handle: handle || null,
    total_threads: rollup?.thread_count || 0,
    newly_indexed: embeddedCount,
    skipped_already_indexed: threads.length - fresh.length,
    time_ms: Date.now() - t0,
    map_time_ms: mapTimeMs,
  });
}

async function askThread(env, url) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const did = url.searchParams.get('did');
  const tid = url.searchParams.get('tid');
  if (!did || !tid) return json({ error: 'missing did or tid' }, 400);
  const row = await env.DB.prepare(
    `SELECT thread_id, text, post_count, char_count, flesch, created_at, indexed_at
     FROM ask_threads WHERE did = ? AND thread_id = ?`
  ).bind(did, tid).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json(row);
}

async function askMap(env, url) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const did = url.searchParams.get('did');
  if (!did) return json({ error: 'missing did' }, 400);
  const row = await env.DB.prepare(
    `SELECT did, handle, thread_count, indexed_at, map_json
     FROM ask_index_meta WHERE did = ?`
  ).bind(did).first();
  if (!row) return json({ indexed: false, did }, 200);

  // map_json is either the legacy array form or the new
  // { threads, clusters, silhouette } shape that includes cluster + KNN data.
  // Normalize to one response shape so the client doesn't have to care.
  function unpack(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) return { map: parsed, clusters: null, silhouette: null };
      return { map: parsed.threads || [], clusters: parsed.clusters || null, silhouette: parsed.silhouette ?? null };
    } catch { return { map: [], clusters: null, silhouette: null }; }
  }
  let { map, clusters, silhouette } = unpack(row.map_json);

  // Self-heal: if meta says we have indexed threads but the map is empty (old
  // bad-blob runs, mid-recompute failures), retry inline.
  let healed = false;
  let diagnostic = null;
  if (!map.length && row.thread_count > 0) {
    diagnostic = await recomputeAskMap(env, did, { diagnostic: true });
    if (diagnostic && diagnostic.wrote) {
      healed = true;
      const refreshed = await env.DB.prepare(
        `SELECT map_json FROM ask_index_meta WHERE did = ?`
      ).bind(did).first();
      ({ map, clusters, silhouette } = unpack(refreshed?.map_json));
    }
  }

  return json({
    indexed: true,
    did: row.did,
    handle: row.handle,
    thread_count: row.thread_count,
    indexed_at: row.indexed_at,
    map,
    clusters,
    silhouette,
    healed,
    diagnostic,
  });
}

async function recomputeAskMap(env, did, opts = {}) {
  const { results } = await env.DB.prepare(
    `SELECT thread_id, text, char_count, created_at, embedding
     FROM ask_threads WHERE did = ? ORDER BY char_count DESC`
  ).bind(did).all();
  const totalRows = results?.length || 0;
  if (!totalRows) {
    return opts.diagnostic ? { wrote: false, total: 0, decoded: 0, reason: 'no rows' } : null;
  }

  const vectors = [];
  const meta = [];
  let badCount = 0;
  let badShapeCount = 0;
  let sampleBadType = null;
  for (const r of results) {
    const v = blobToFloats(r.embedding);
    if (!v) {
      badCount++;
      if (sampleBadType == null) sampleBadType = typeof r.embedding;
      continue;
    }
    if (v.length !== ASK_EMBED_DIM) {
      badShapeCount++;
      continue;
    }
    vectors.push(v);
    meta.push(r);
  }
  if (vectors.length < 2) {
    if (opts.diagnostic) {
      return {
        wrote: false,
        total: totalRows,
        decoded: vectors.length,
        bad_blobs: badCount,
        bad_shape: badShapeCount,
        sample_bad_type: sampleBadType,
        reason: 'too few decodable vectors',
      };
    }
    return null;
  }

  const coords = pca2D(vectors, ASK_EMBED_DIM);

  // Normalize each axis to [0, 1] so the client can map straight to viewBox.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;

  // Same caps signal applies — at 3000 threads the KNN pass alone is
  // ~7B float ops and blows past Cloudflare's CPU budget (the 1102
  // "Worker exceeded resource limits" symptom). KNN is a nice-to-have
  // (the "you keep coming back to these threads" hint); silhouette is
  // descriptive; both drop quality for very large corpora rather than
  // breaking the recompute entirely.
  const KNN_CAP_ASK = 1500;
  let labels = null;
  let silhouette = null;
  let clusterMeta = null;
  let neighborsList = null;
  if (vectors.length >= 12) {
    const K = Math.min(8, Math.max(3, Math.round(Math.sqrt(vectors.length / 15))));
    const km = kmeansSpherical(vectors, K, ASK_EMBED_DIM, 30);
    labels = km.labels;
    const silSample = vectors.length > 1500 ? 250 : 400;
    silhouette = silhouetteSampled(vectors, labels, silSample);
    const clusterTexts = Array.from({ length: K }, () => []);
    for (let i = 0; i < meta.length; i++) clusterTexts[labels[i]].push(meta[i].text || '');
    // Bring the SUBTLEX baseline into cluster labeling so common words
    // ("that", "with", "from") can't bind labels even when slightly
    // concentrated in one cluster — same two-dimensional distinctiveness
    // logic the lexicon Distinctive view uses.
    const baselineFreq = await getBaselineFreq(env);
    const labelsPer = labelClusters(clusterTexts, baselineFreq, 5);
    const sizes = new Array(K).fill(0);
    for (const l of labels) sizes[l]++;
    clusterMeta = labelsPer.map((words, i) => ({
      id: i,
      label: words.slice(0, 3).join(' · ') || 'cluster ' + (i + 1),
      words,
      size: sizes[i],
      ratio: Math.round((sizes[i] / labels.length) * 1000) / 1000,
    }));
  }

  // Per-thread 3 nearest neighbors in full embedding space — works even when
  // clusters are weak. O(N² · dim) is the killer; cap and skip for larger
  // corpora.
  if (vectors.length >= 4 && vectors.length <= KNN_CAP_ASK) {
    neighborsList = computeKNN(vectors, 3);
  }

  const map = new Array(meta.length);
  for (let i = 0; i < meta.length; i++) {
    const r = meta[i];
    const [x, y] = coords[i];
    map[i] = {
      tid: r.thread_id,
      x: Math.round(((x - minX) / sx) * 1000) / 1000,
      y: Math.round(((y - minY) / sy) * 1000) / 1000,
      n: r.char_count,
      c: (r.created_at || '').slice(0, 10),
      s: (r.text || '').slice(0, 280).replace(/\s+/g, ' ').trim(),
      k: labels ? labels[i] : null,                    // cluster id
      nn: neighborsList ? neighborsList[i].map((j) => meta[j].thread_id) : null,
    };
  }
  // map_json holds both the per-thread array AND cluster metadata so the
  // existing /api/ask/map endpoint can return everything in one trip.
  const payload = clusterMeta || silhouette != null
    ? { threads: map, clusters: clusterMeta, silhouette }
    : map;                                              // back-compat: array form
  await env.DB.prepare(
    `UPDATE ask_index_meta SET map_json = ? WHERE did = ?`
  ).bind(JSON.stringify(payload), did).run();
  if (opts.diagnostic) {
    return {
      wrote: true,
      total: totalRows,
      decoded: vectors.length,
      bad_blobs: badCount,
      bad_shape: badShapeCount,
      sample_bad_type: sampleBadType,
      clusters: clusterMeta ? clusterMeta.length : 0,
      silhouette,
    };
  }
  return null;
}

// Top-2-component PCA via power iteration. Runs O(iters * n * dim) and avoids
// ever materializing the dim×dim covariance matrix. For n=10k, dim=768,
// iters=30 it lands in ~5 seconds on a Worker, well inside the CPU limit.
function pca2D(vectors, dim) {
  const n = vectors.length;
  const ITERS = 30;

  // Mean-center.
  const mean = new Float32Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i];
  for (let i = 0; i < dim; i++) mean[i] /= n;
  const centered = new Array(n);
  for (let r = 0; r < n; r++) {
    const v = vectors[r];
    const c = new Float32Array(dim);
    for (let i = 0; i < dim; i++) c[i] = v[i] - mean[i];
    centered[r] = c;
  }

  // Compute Cov*v as X^T (X v) without ever forming Cov.
  const Xv = new Float32Array(n);
  function multiplyCov(v, deflate) {
    for (let i = 0; i < n; i++) {
      const row = centered[i];
      let s = 0;
      for (let j = 0; j < dim; j++) s += row[j] * v[j];
      Xv[i] = s;
    }
    const out = new Float32Array(dim);
    for (let i = 0; i < n; i++) {
      const xv = Xv[i];
      const row = centered[i];
      for (let j = 0; j < dim; j++) out[j] += row[j] * xv;
    }
    if (deflate) {
      for (const u of deflate) {
        let dot = 0;
        for (let i = 0; i < dim; i++) dot += out[i] * u[i];
        for (let i = 0; i < dim; i++) out[i] -= dot * u[i];
      }
    }
    return out;
  }

  function powerIter(deflate) {
    // Deterministic random init keeps maps stable across re-indexes.
    let v = new Float32Array(dim);
    let seed = 1234567 ^ (deflate ? 89 : 0);
    for (let i = 0; i < dim; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      v[i] = ((seed >>> 8) / (1 << 24)) - 0.5;
    }
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) v[i] /= norm;

    for (let iter = 0; iter < ITERS; iter++) {
      const Av = multiplyCov(v, deflate);
      let nm = 0;
      for (let i = 0; i < dim; i++) nm += Av[i] * Av[i];
      nm = Math.sqrt(nm) || 1;
      for (let i = 0; i < dim; i++) v[i] = Av[i] / nm;
    }
    return v;
  }

  const pc1 = powerIter(null);
  const pc2 = powerIter([pc1]);

  const out = new Array(n);
  for (let r = 0; r < n; r++) {
    const c = centered[r];
    let x = 0, y = 0;
    for (let i = 0; i < dim; i++) { x += c[i] * pc1[i]; y += c[i] * pc2[i]; }
    out[r] = [x, y];
  }
  return out;
}

async function askQuery(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  if (!env.AI) return json({ error: 'AI binding not configured' }, 500);
  const t0 = Date.now();

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { did, q } = body || {};
  const k = Math.max(1, Math.min(50, Number(body?.k) || ASK_DEFAULT_K));
  if (typeof did !== 'string' || typeof q !== 'string' || !q.trim()) {
    return json({ error: 'missing did or q' }, 400);
  }

  // Embed query — BGE retrieval needs the asymmetric prefix on the query side.
  const out = await env.AI.run(ASK_EMBED_MODEL, { text: [ASK_QUERY_PREFIX + q] });
  const queryVec = out?.data?.[0];
  if (!queryVec || queryVec.length !== ASK_EMBED_DIM) {
    return json({ error: 'embedding failed' }, 500);
  }

  // Two-pass top-K. First pass SELECTs only (thread_id, embedding) so
  // we don't carry every thread's text into memory — at 5000+ threads
  // the full-row pull was triggering 1102 "exceeded resource limits".
  // Second pass fetches text + metadata for just the winners.
  const { results } = await env.DB.prepare(
    `SELECT thread_id, embedding FROM ask_threads WHERE did = ?`
  ).bind(did).all();
  const rows = results || [];
  if (!rows.length) {
    return json({ q, hits: [], indexed: false, time_ms: Date.now() - t0 });
  }

  const qNorm = vecNorm(queryVec);
  const top = [];                                          // ascending by score, length ≤ k
  for (const r of rows) {
    const v = blobToFloats(r.embedding);
    if (!v || v.length !== ASK_EMBED_DIM) continue;
    const score = cosineFast(queryVec, v, qNorm);
    if (top.length < k) {
      top.push({ thread_id: r.thread_id, score });
      top.sort((a, b) => a.score - b.score);
    } else if (score > top[0].score) {
      top[0] = { thread_id: r.thread_id, score };
      top.sort((a, b) => a.score - b.score);
    }
  }

  if (!top.length) {
    return json({ q, indexed: true, total_threads: rows.length, hits: [], time_ms: Date.now() - t0 });
  }

  const winnerTids = top.map((t) => t.thread_id);
  const winnerPlaceholders = winnerTids.map(() => '?').join(',');
  const { results: winnerRows } = await env.DB.prepare(
    `SELECT thread_id, text, post_count, char_count, flesch, created_at
     FROM ask_threads WHERE did = ? AND thread_id IN (${winnerPlaceholders})`
  ).bind(did, ...winnerTids).all();
  const byTid = new Map((winnerRows || []).map((r) => [r.thread_id, r]));

  top.reverse();
  const hits = top.map(({ thread_id, score }) => {
    const r = byTid.get(thread_id) || {};
    return {
      thread_id,
      text: r.text || '',
      post_count: r.post_count || 0,
      char_count: r.char_count || 0,
      flesch: r.flesch == null ? null : r.flesch,
      created_at: r.created_at || '',
      score,
    };
  });

  return json({
    q,
    indexed: true,
    total_threads: rows.length,
    hits,
    time_ms: Date.now() - t0,
  });
}

// Bridge: take the centroid of N input thread embeddings, find the existing
// threads closest to that centroid. The "thought-shaped hole" interpretation
// of the question "what bridges idea A and idea B?" — return the writer's
// own threads that sit between the inputs in 768-d semantic space.
//
// Same machinery as askQuery but the target vector is computed from
// stored embeddings (no Workers AI inference) rather than embedding a
// query string. Cheap: just DB reads + a JS averaging pass + cosine scan.
async function askBridge(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const t0 = Date.now();
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { did } = body || {};
  const k = Math.max(1, Math.min(20, Number(body?.k) || 5));
  const tids = Array.isArray(body?.tids)
    ? body.tids.filter((t) => typeof t === 'string' && t.length).slice(0, 8)
    : [];
  if (typeof did !== 'string' || tids.length < 2) {
    return json({ error: 'missing did or need ≥ 2 tids' }, 400);
  }

  // Load embeddings for the input tids.
  const placeholders = tids.map(() => '?').join(',');
  const inputRes = await env.DB.prepare(
    `SELECT thread_id, embedding FROM ask_threads
     WHERE did = ? AND thread_id IN (${placeholders})`
  ).bind(did, ...tids).all();
  const vectors = [];
  for (const r of inputRes.results || []) {
    const v = blobToFloats(r.embedding);
    if (v && v.length === ASK_EMBED_DIM) vectors.push(v);
  }
  if (vectors.length < 2) {
    return json({ error: `only ${vectors.length} input(s) had decodable embeddings; need ≥ 2` }, 400);
  }

  // Centroid in full 768-d space.
  const avg = new Float32Array(ASK_EMBED_DIM);
  for (const v of vectors) for (let i = 0; i < ASK_EMBED_DIM; i++) avg[i] += v[i];
  for (let i = 0; i < ASK_EMBED_DIM; i++) avg[i] /= vectors.length;
  const avgNorm = vecNorm(avg);

  // Top-K heap scan. Two design choices that keep big corpora in budget:
  //   1. SELECT only (thread_id, embedding) — skip text from the wide
  //      scan. Carrying 5000 × ~10 KB text strings into worker memory
  //      is what tripped the 1102 "exceeded resource limits".
  //   2. Maintain a sorted-ascending top[] of length ≤ k. We only
  //      keep thread_id + score during the scan; the actual text gets
  //      fetched in a second pinpoint query against just the winners.
  const inputSet = new Set(tids);
  const { results } = await env.DB.prepare(
    `SELECT thread_id, embedding FROM ask_threads WHERE did = ?`
  ).bind(did).all();
  const totalScanned = (results || []).length;

  const top = [];                                          // ascending by score, length ≤ k
  for (const r of results || []) {
    if (inputSet.has(r.thread_id)) continue;
    const v = blobToFloats(r.embedding);
    if (!v || v.length !== ASK_EMBED_DIM) continue;
    const score = cosineFast(avg, v, avgNorm);
    if (top.length < k) {
      top.push({ thread_id: r.thread_id, score });
      top.sort((a, b) => a.score - b.score);
    } else if (score > top[0].score) {
      top[0] = { thread_id: r.thread_id, score };
      top.sort((a, b) => a.score - b.score);
    }
  }

  if (!top.length) {
    return json({
      inputs: tids,
      avg_basis: vectors.length,
      total_scanned: totalScanned,
      hits: [],
      time_ms: Date.now() - t0,
    });
  }

  // Pin-point fetch of text + metadata for just the winners.
  const winnerTids = top.map((t) => t.thread_id);
  const winnerPlaceholders = winnerTids.map(() => '?').join(',');
  const { results: winnerRows } = await env.DB.prepare(
    `SELECT thread_id, text, char_count, created_at FROM ask_threads
     WHERE did = ? AND thread_id IN (${winnerPlaceholders})`
  ).bind(did, ...winnerTids).all();
  const byTid = new Map((winnerRows || []).map((r) => [r.thread_id, r]));

  // Reverse to descending (best first); join in text.
  top.reverse();
  const hits = top.map(({ thread_id, score }) => {
    const r = byTid.get(thread_id) || {};
    return {
      thread_id,
      text: r.text || '',
      char_count: r.char_count || 0,
      created_at: r.created_at || '',
      score,
    };
  });

  return json({
    inputs: tids,
    avg_basis: vectors.length,
    total_scanned: totalScanned,
    hits,
    time_ms: Date.now() - t0,
  });
}

// ----- clustering / KNN ---------------------------------------------------
//
// All distance math happens in full 768-d embedding space, not on the 2D PCA
// projection. PCA on personal-corpus BGE embeddings often shows a smooth
// blob even when topical structure exists in the high-dim space — clusters
// found here may not separate visibly on the 2D map, and that's OK.

// Deterministic PRNG so cluster results are stable across re-indexes.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function euclideanSq(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

// K-means with k-means++ init. Vectors are BGE-base unit-normalized; for
// unit vectors, minimizing L2 == maximizing cosine, so plain Euclidean is
// the right distance.
function kmeansSpherical(vectors, K, dim, maxIter = 30) {
  const N = vectors.length;
  const rng = mulberry32(0xC0FFEE);

  // k-means++ init: first centroid random, subsequent ones sampled
  // proportional to squared distance from nearest existing centroid.
  const centroids = [new Float32Array(vectors[Math.floor(rng() * N)])];
  while (centroids.length < K) {
    const dists = new Float64Array(N);
    let total = 0;
    for (let i = 0; i < N; i++) {
      let m = Infinity;
      for (const c of centroids) {
        const d = euclideanSq(vectors[i], c);
        if (d < m) m = d;
      }
      dists[i] = m; total += m;
    }
    if (total <= 0) break;
    let r = rng() * total;
    let pick = N - 1;
    for (let i = 0; i < N; i++) { r -= dists[i]; if (r <= 0) { pick = i; break; } }
    centroids.push(new Float32Array(vectors[pick]));
  }

  const labels = new Int32Array(N);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // Assign each vector to its closest centroid.
    for (let i = 0; i < N; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = euclideanSq(vectors[i], centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    if (!changed && iter > 0) break;
    // Recompute centroids as the mean of assigned members.
    const sums = Array.from({ length: centroids.length }, () => new Float32Array(dim));
    const counts = new Int32Array(centroids.length);
    for (let i = 0; i < N; i++) {
      const v = vectors[i];
      const s = sums[labels[i]];
      for (let j = 0; j < dim; j++) s[j] += v[j];
      counts[labels[i]]++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] === 0) continue;     // keep stale centroid; better than empty
      for (let j = 0; j < dim; j++) sums[c][j] /= counts[c];
      centroids[c] = sums[c];
    }
  }
  return { labels: Array.from(labels), centroids };
}

// Mean silhouette score. O(N²·dim) — fine for N ≤ 1k. For larger corpora
// we subsample the points we score (still using the full corpus as the
// reference for inter/intra-cluster distance means).
function silhouetteSampled(vectors, labels, maxScored = 400) {
  const N = vectors.length;
  if (N < 3) return null;
  const K = Math.max(...labels) + 1;
  const byCluster = Array.from({ length: K }, () => []);
  for (let i = 0; i < N; i++) byCluster[labels[i]].push(i);

  // Sample points to score if N is large.
  const indices = [];
  if (N <= maxScored) {
    for (let i = 0; i < N; i++) indices.push(i);
  } else {
    const rng = mulberry32(0xBEEF);
    const seen = new Set();
    while (indices.length < maxScored) {
      const k = Math.floor(rng() * N);
      if (!seen.has(k)) { seen.add(k); indices.push(k); }
    }
  }

  let total = 0;
  let counted = 0;
  for (const i of indices) {
    const own = labels[i];
    const same = byCluster[own];
    if (same.length < 2) continue;     // silhouette undefined for singletons
    let a = 0;
    for (const j of same) if (j !== i) a += Math.sqrt(euclideanSq(vectors[i], vectors[j]));
    a /= (same.length - 1);
    let b = Infinity;
    for (let c = 0; c < K; c++) {
      if (c === own) continue;
      const arr = byCluster[c];
      if (!arr.length) continue;
      let mean = 0;
      for (const j of arr) mean += Math.sqrt(euclideanSq(vectors[i], vectors[j]));
      mean /= arr.length;
      if (mean < b) b = mean;
    }
    const s = (b - a) / Math.max(a, b);
    if (Number.isFinite(s)) { total += s; counted++; }
  }
  return counted ? Math.round((total / counted) * 1000) / 1000 : null;
}

// Top distinctive words per cluster. Scoring is two-dimensional, mirroring
// the lexicon /Distinctive view's logic but applied per-cluster:
//
//   lift   = (count_in_cluster / cluster_tokens)
//          / (count_in_corpus  / corpus_tokens)
//          → how concentrated is this word in this cluster vs the corpus average
//          → 1.0 = uniform; > 1 = this cluster's word; >> 1 = signature word
//
//   score  = lift / log(8 + baseline_per_million_in_english)
//          → divides out common-baseline words ("that", "from") so they
//             can't bind clusters even when slightly more concentrated;
//             rewards rare-in-English words that pop in this cluster.
//
// Filters: length ≥ 4, count ≥ 2, must be in the SUBTLEX baseline (rejects
// typos / proper nouns / tokenizer junk), lift ≥ 1.5 (must be distinctly
// over-represented here, not just slightly more common). If baseline data
// isn't loaded yet we fall back to the within-corpus-only count²/(total+5)
// scoring so something still renders.
function labelClusters(clusterTexts, baselineFreq, topN = 5) {
  const K = clusterTexts.length;
  const clusterCounts = Array.from({ length: K }, () => new Map());
  const totalCounts = new Map();
  const clusterTokens = new Array(K).fill(0);
  let corpusTokens = 0;
  for (let c = 0; c < K; c++) {
    for (const text of clusterTexts[c]) {
      const tokens = tokenizeForLabels(text);
      for (const w of tokens) {
        clusterCounts[c].set(w, (clusterCounts[c].get(w) || 0) + 1);
        totalCounts.set(w, (totalCounts.get(w) || 0) + 1);
        clusterTokens[c]++;
        corpusTokens++;
      }
    }
  }

  const hasBaseline = baselineFreq && Object.keys(baselineFreq).length > 100;
  const labelsPer = [];
  for (let c = 0; c < K; c++) {
    const ct = clusterTokens[c];
    if (!ct) { labelsPer.push([]); continue; }
    const scored = [];
    for (const [w, count] of clusterCounts[c]) {
      if (count < 2) continue;
      if (w.length < 4) continue;
      const total = totalCounts.get(w) || count;
      if (total < 3) continue;

      let score;
      if (hasBaseline) {
        const baseline = baselineFreq[w];
        if (!baseline || baseline <= 0) continue;     // unknown to English baseline: usually junk
        const clusterRate = count / ct;
        const corpusRate = total / corpusTokens;
        const lift = clusterRate / corpusRate;
        if (lift < 1.5) continue;                      // must be distinctly *this cluster's* word
        score = lift / Math.log(8 + baseline);
      } else {
        // Fallback: cluster-only scoring (used to be the only logic).
        score = (count * count) / (total + 5);
      }
      scored.push({ w, score });
    }
    scored.sort((a, b) => b.score - a.score);
    labelsPer.push(scored.slice(0, topN).map((x) => x.w));
  }
  return labelsPer;
}

// Length ≥ 4, all-letter words; we have no shared stopword set on the
// server side, but length + the scoring formula's punishment of
// across-cluster prevalence keeps common words out of labels naturally.
function tokenizeForLabels(text) {
  const out = [];
  const lower = (text || '').toLowerCase();
  const re = /[a-z']{4,}/g;
  let m;
  while ((m = re.exec(lower)) !== null) {
    out.push(m[0].replace(/^'+|'+$/g, ''));
  }
  return out;
}

// For each vector, return indices of its k nearest neighbors (excluding self).
// O(N²·dim). Used to surface "this thread keeps coming back to..." on click,
// which works even when global cluster structure is weak.
function computeKNN(vectors, k) {
  const N = vectors.length;
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    // Track the k smallest distances seen so far.
    const top = [];               // [{ idx, d }] sorted ascending by d
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const d = euclideanSq(vectors[i], vectors[j]);
      if (top.length < k) {
        top.push({ idx: j, d });
        top.sort((a, b) => a.d - b.d);
      } else if (d < top[top.length - 1].d) {
        top[top.length - 1] = { idx: j, d };
        top.sort((a, b) => a.d - b.d);
      }
    }
    out[i] = top.map((x) => x.idx);
  }
  return out;
}

// ----- ask helpers -----

function floatsToBlob(arr) {
  // D1's `bind()` treats ArrayBuffer as BLOB. Passing a Uint8Array view falls
  // through to other types in some runtimes (gets stringified, stored as TEXT).
  // Always hand D1 a freshly-sliced ArrayBuffer.
  const f32 = arr instanceof Float32Array ? arr : new Float32Array(arr);
  if (f32.byteOffset === 0 && f32.byteLength === f32.buffer.byteLength) {
    return f32.buffer;
  }
  return f32.buffer.slice(f32.byteOffset, f32.byteOffset + f32.byteLength);
}

function blobToFloats(blob) {
  // D1 has historically returned BLOBs in several shapes depending on adapter
  // version: ArrayBuffer, Uint8Array (or other view), number[] of byte values,
  // and — when stored corruptly via Uint8Array bind — a string. Handle all.
  if (blob == null) return null;
  let buf;
  if (blob instanceof ArrayBuffer) {
    buf = blob;
  } else if (ArrayBuffer.isView(blob)) {
    // Slice to a contiguous, aligned ArrayBuffer.
    buf = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
  } else if (Array.isArray(blob)) {
    buf = new Uint8Array(blob).buffer;
  } else {
    // String/object/other: data was stored corruptly — caller should signal.
    return null;
  }
  if (buf.byteLength % 4 !== 0) return null;
  return new Float32Array(buf);
}

function vecNorm(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  return Math.sqrt(n) || 1;
}

function cosineFast(q, v, qNorm) {
  // Compute dot product and ||v|| in one pass; reuse precomputed ||q||.
  let dot = 0, vn = 0;
  for (let i = 0; i < v.length; i++) {
    dot += q[i] * v[i];
    vn  += v[i] * v[i];
  }
  const denom = qNorm * (Math.sqrt(vn) || 1);
  return dot / denom;
}

// ---- signal: vector index over a user's REPOST targets --------------------
//
// Shape mirrors ask: one POST /api/signal/index batch-embeds the targets and
// recomputes the 2D map; GET /api/signal/map returns coords + clusters; POST
// /api/signal/query runs cosine semantic search. The key difference is the
// "row" semantic — each row is a post by some OTHER author that this
// subscriber chose to amplify. The map is a portrait of taste, not voice.

const SIGNAL_MAX_TARGETS_PER_INDEX = 5000;

async function signalCheck(env, url) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const did = url.searchParams.get('did');
  if (!did) return json({ error: 'missing did' }, 400);
  const meta = await env.DB.prepare(
    `SELECT subscriber_did AS did, handle, target_count, indexed_at
       FROM signal_index_meta WHERE subscriber_did = ?`
  ).bind(did).first();
  if (!meta) return json({ indexed: false, did });
  return json({ indexed: true, ...meta });
}

async function signalIndex(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  if (!env.AI) return json({ error: 'AI binding not configured' }, 500);
  const t0 = Date.now();

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { did, handle, targets, skip_recompute } = body || {};
  if (typeof did !== 'string' || !Array.isArray(targets)) {
    return json({ error: 'missing did or targets' }, 400);
  }
  if (!did.startsWith('did:')) return json({ error: 'bad did' }, 400);
  if (targets.length === 0) return json({ ok: true, did, newly_indexed: 0, total_targets: 0, time_ms: 0 });
  if (targets.length > SIGNAL_MAX_TARGETS_PER_INDEX) {
    return json({ error: `too many targets (${targets.length} > ${SIGNAL_MAX_TARGETS_PER_INDEX})` }, 400);
  }

  // Idempotent re-runs: don't re-embed targets we already have for this subscriber.
  const existing = new Set();
  {
    const { results } = await env.DB.prepare(
      `SELECT target_uri FROM signal_targets WHERE subscriber_did = ?`
    ).bind(did).all();
    for (const r of results || []) existing.add(r.target_uri);
  }

  const fresh = [];
  for (const t of targets) {
    if (typeof t.uri !== 'string' || typeof t.text !== 'string') continue;
    if (existing.has(t.uri)) continue;
    if (t.text.length < 50 || t.text.length > 8000) continue;
    fresh.push(t);
  }

  let embeddedCount = 0;
  for (let i = 0; i < fresh.length; i += ASK_BATCH_SIZE) {
    const batch = fresh.slice(i, i + ASK_BATCH_SIZE);
    const texts = batch.map((t) => t.text);
    const out = await env.AI.run(ASK_EMBED_MODEL, { text: texts });
    if (!out || !out.data || out.data.length !== batch.length) {
      throw new Error(`unexpected embedding shape (got ${out?.data?.length} for ${batch.length})`);
    }
    const stmts = [];
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j];
      const vec = out.data[j];
      const blob = floatsToBlob(vec);
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO signal_targets
             (subscriber_did, target_uri, target_did, target_rkey, text,
              author_handle, author_display, reposted_at, created_at, embedding)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          did,
          t.uri,
          t.target_did || '',
          t.target_rkey || '',
          t.text,
          t.author_handle || null,
          t.author_display || null,
          t.reposted_at || null,
          t.created_at || null,
          blob
        )
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
    embeddedCount += batch.length;
  }

  // Rollup canonical count from rows.
  const rollup = await env.DB.prepare(
    `SELECT COUNT(*) AS target_count
       FROM signal_targets WHERE subscriber_did = ?`
  ).bind(did).first();
  await env.DB.prepare(
    `INSERT INTO signal_index_meta (subscriber_did, handle, target_count, indexed_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(subscriber_did) DO UPDATE SET
       handle       = excluded.handle,
       target_count = excluded.target_count,
       indexed_at   = excluded.indexed_at`
  ).bind(did, typeof handle === 'string' ? handle : null, rollup?.target_count || 0).run();

  // Recompute the 2D map at the END of a chunked upload, not after every chunk.
  // For 3000-target indexes the recompute (PCA + k-means + KNN over the full
  // corpus) is ~5-10 seconds of JS CPU — running it 4 times in a row blows
  // through the Worker CPU budget (1102 "exceeded resource limits"). Clients
  // chunk via INDEX_POST_BATCH and pass `skip_recompute: true` on every
  // non-final POST. On the final POST, recompute fires once over the now-
  // complete row set.
  let mapTimeMs = 0;
  if (!skip_recompute) {
    try {
      const mt0 = Date.now();
      await recomputeSignalMap(env, did);
      mapTimeMs = Date.now() - mt0;
    } catch (e) {
      console.error('signal map recompute failed', e);
    }
  }

  return json({
    ok: true,
    did,
    handle: handle || null,
    total_targets: rollup?.target_count || 0,
    newly_indexed: embeddedCount,
    skipped_already_indexed: targets.length - fresh.length,
    recompute_ran: !skip_recompute,
    time_ms: Date.now() - t0,
    map_time_ms: mapTimeMs,
  });
}

async function signalTarget(env, url) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const did = url.searchParams.get('did');
  const uri = url.searchParams.get('uri');
  if (!did || !uri) return json({ error: 'missing did or uri' }, 400);
  const row = await env.DB.prepare(
    `SELECT target_uri, target_did, target_rkey, text, author_handle, author_display,
            reposted_at, created_at, indexed_at
       FROM signal_targets WHERE subscriber_did = ? AND target_uri = ?`
  ).bind(did, uri).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json(row);
}

async function signalMap(env, url) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  const did = url.searchParams.get('did');
  if (!did) return json({ error: 'missing did' }, 400);
  const row = await env.DB.prepare(
    `SELECT subscriber_did AS did, handle, target_count, indexed_at, map_json
       FROM signal_index_meta WHERE subscriber_did = ?`
  ).bind(did).first();
  if (!row) return json({ indexed: false, did }, 200);

  function unpack(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) return { map: parsed, clusters: null, silhouette: null };
      return { map: parsed.targets || [], clusters: parsed.clusters || null, silhouette: parsed.silhouette ?? null };
    } catch { return { map: [], clusters: null, silhouette: null }; }
  }
  let { map, clusters, silhouette } = unpack(row.map_json);

  // Self-heal — same pattern as askMap.
  let healed = false;
  let diagnostic = null;
  if (!map.length && row.target_count > 0) {
    diagnostic = await recomputeSignalMap(env, did, { diagnostic: true });
    if (diagnostic && diagnostic.wrote) {
      healed = true;
      const refreshed = await env.DB.prepare(
        `SELECT map_json FROM signal_index_meta WHERE subscriber_did = ?`
      ).bind(did).first();
      ({ map, clusters, silhouette } = unpack(refreshed?.map_json));
    }
  }

  return json({
    indexed: true,
    did: row.did,
    handle: row.handle,
    target_count: row.target_count,
    indexed_at: row.indexed_at,
    map,
    clusters,
    silhouette,
    healed,
    diagnostic,
  });
}

async function recomputeSignalMap(env, did, opts = {}) {
  const { results } = await env.DB.prepare(
    `SELECT target_uri, text, author_handle, reposted_at, created_at, embedding
       FROM signal_targets WHERE subscriber_did = ? ORDER BY reposted_at DESC`
  ).bind(did).all();
  const totalRows = results?.length || 0;
  if (!totalRows) {
    return opts.diagnostic ? { wrote: false, total: 0, decoded: 0, reason: 'no rows' } : null;
  }

  const vectors = [];
  const meta = [];
  let badCount = 0;
  let badShapeCount = 0;
  for (const r of results) {
    const v = blobToFloats(r.embedding);
    if (!v) { badCount++; continue; }
    if (v.length !== ASK_EMBED_DIM) { badShapeCount++; continue; }
    vectors.push(v);
    meta.push(r);
  }
  if (vectors.length < 2) {
    if (opts.diagnostic) return { wrote: false, total: totalRows, decoded: vectors.length, bad_blobs: badCount, bad_shape: badShapeCount, reason: 'too few decodable vectors' };
    return null;
  }

  const coords = pca2D(vectors, ASK_EMBED_DIM);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;

  // Tighter caps than ask: a signal index can carry 3000+ rows, where ask
  // typically tops out at a few hundred. The expensive passes scale O(N²) or
  // O(N²·dim) — we have to gate them more aggressively to fit the Worker
  // CPU budget (~30s on Workers Paid).
  //   - KNN: O(N²·dim). Skip above 1500 rows; the "you keep coming back to
  //     these reposts" UX is a nice-to-have, not a load-bearing feature.
  //   - silhouette: O(M·N·dim) where M = sample size. Drop sample to 250
  //     for big indexes (the score is descriptive, not algorithmic).
  //   - k-means + PCA: O(N·dim·iters). Cheap enough at 3000, no change.
  const KNN_CAP_SIGNAL = 1500;
  let labels = null;
  let silhouette = null;
  let clusterMeta = null;
  let neighborsList = null;
  if (vectors.length >= 12) {
    const K = Math.min(8, Math.max(3, Math.round(Math.sqrt(vectors.length / 15))));
    const km = kmeansSpherical(vectors, K, ASK_EMBED_DIM, 30);
    labels = km.labels;
    const silSample = vectors.length > 1500 ? 250 : 400;
    silhouette = silhouetteSampled(vectors, labels, silSample);
    const clusterTexts = Array.from({ length: K }, () => []);
    for (let i = 0; i < meta.length; i++) clusterTexts[labels[i]].push(meta[i].text || '');
    const baselineFreq = await getBaselineFreq(env);
    const labelsPer = labelClusters(clusterTexts, baselineFreq, 5);
    const sizes = new Array(K).fill(0);
    for (const l of labels) sizes[l]++;
    clusterMeta = labelsPer.map((words, i) => ({
      id: i,
      label: words.slice(0, 3).join(' · ') || 'cluster ' + (i + 1),
      words,
      size: sizes[i],
      ratio: Math.round((sizes[i] / labels.length) * 1000) / 1000,
    }));
  }
  if (vectors.length >= 4 && vectors.length <= KNN_CAP_SIGNAL) {
    neighborsList = computeKNN(vectors, 3);
  }

  const map = new Array(meta.length);
  for (let i = 0; i < meta.length; i++) {
    const r = meta[i];
    const [x, y] = coords[i];
    map[i] = {
      tid: r.target_uri,
      x: Math.round(((x - minX) / sx) * 1000) / 1000,
      y: Math.round(((y - minY) / sy) * 1000) / 1000,
      n: (r.text || '').length,
      c: (r.reposted_at || r.created_at || '').slice(0, 10),
      s: (r.text || '').slice(0, 280).replace(/\s+/g, ' ').trim(),
      a: r.author_handle || '',
      k: labels ? labels[i] : null,
      nn: neighborsList ? neighborsList[i].map((j) => meta[j].target_uri) : null,
    };
  }
  const payload = clusterMeta || silhouette != null
    ? { targets: map, clusters: clusterMeta, silhouette }
    : map;
  await env.DB.prepare(
    `UPDATE signal_index_meta SET map_json = ? WHERE subscriber_did = ?`
  ).bind(JSON.stringify(payload), did).run();
  if (opts.diagnostic) {
    return {
      wrote: true,
      total: totalRows,
      decoded: vectors.length,
      bad_blobs: badCount,
      bad_shape: badShapeCount,
      clusters: clusterMeta ? clusterMeta.length : 0,
      silhouette,
    };
  }
  return null;
}

async function signalQuery(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 500);
  if (!env.AI) return json({ error: 'AI binding not configured' }, 500);
  const t0 = Date.now();

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { did, q } = body || {};
  const k = Math.max(1, Math.min(50, Number(body?.k) || ASK_DEFAULT_K));
  if (typeof did !== 'string' || typeof q !== 'string' || !q.trim()) {
    return json({ error: 'missing did or q' }, 400);
  }

  const out = await env.AI.run(ASK_EMBED_MODEL, { text: [ASK_QUERY_PREFIX + q] });
  const queryVec = out?.data?.[0];
  if (!queryVec || queryVec.length !== ASK_EMBED_DIM) {
    return json({ error: 'embedding failed' }, 500);
  }

  const { results } = await env.DB.prepare(
    `SELECT target_uri, text, author_handle, reposted_at, created_at, embedding
       FROM signal_targets WHERE subscriber_did = ?`
  ).bind(did).all();
  const rows = results || [];
  if (!rows.length) return json({ q, hits: [], indexed: false, time_ms: Date.now() - t0 });

  const qNorm = vecNorm(queryVec);
  const scored = [];
  for (const r of rows) {
    const v = blobToFloats(r.embedding);
    if (!v || v.length !== ASK_EMBED_DIM) continue;
    const score = cosineFast(queryVec, v, qNorm);
    scored.push({
      target_uri: r.target_uri,
      text: r.text,
      author_handle: r.author_handle,
      reposted_at: r.reposted_at,
      created_at: r.created_at,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return json({
    q,
    indexed: true,
    total_targets: rows.length,
    hits: scored.slice(0, k),
    time_ms: Date.now() - t0,
  });
}
