// fodder — crowdsourced verbose-sentence corpus for rite
//
// Endpoints:
//   GET  /api/next?seen=id1,id2,...   -> next batch of unvoted candidates
//   POST /api/vote                    -> { id, direction, voter_id } -> {ok, status, yes, no}
//   GET  /api/promoted                -> approved candidates in rite/corpus.json shape
//   GET  /api/stats                   -> totals
//   POST /api/admin/mine              -> manually trigger a mining run (header X-Admin-Key)
//   *                                  -> static asset (ASSETS binding)
//
// Cron (every 6h): pick a Gutenberg book from the curated list, fetch via
// read.mino.mobi/gutenberg-proxy, extract verbose sentences, ask Llama for
// 3 reference rewrites, insert as 'pending'.

const PROMOTE_THRESHOLD_YES = 5;
const PROMOTE_RATIO = 0.7;
const REJECT_THRESHOLD_NO = 8;
const REJECT_RATIO = 0.7;
const MAX_PER_MINING_RUN = 5;
const MIN_WORDS = 40;
const MAX_WORDS = 90;
const MAX_FLESCH = 35;

// Curated Gutenberg book list — verbose source material.
// Each entry: { id, author, title, style }
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/next')                     return apiNext(request, env, url);
      if (url.pathname === '/api/vote'  && request.method === 'POST') return apiVote(request, env);
      if (url.pathname === '/api/promoted')                 return apiPromoted(env);
      if (url.pathname === '/api/stats')                    return apiStats(env);
      if (url.pathname === '/api/admin/mine' && request.method === 'POST') return apiAdminMine(request, env);
      if (url.pathname.startsWith('/api/'))                 return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(mineGutenberg(env).catch((e) => console.error('cron mine failed', e)));
  },
};

// ---------- /api/next ----------

async function apiNext(request, env, url) {
  const voterId = getVoterId(request);
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '8', 10)));
  // Pull pending candidates not yet voted on by this voter, ordered by oldest pending first
  // (so each gets eyeballs early).
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

// ---------- /api/vote ----------

async function apiVote(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { id, direction, voter_id } = body || {};
  if (typeof id !== 'string' || typeof voter_id !== 'string') {
    return json({ error: 'missing id or voter_id' }, 400);
  }
  if (!['yes', 'no', 'skip'].includes(direction)) {
    return json({ error: 'bad direction' }, 400);
  }
  if (voter_id.length < 6 || voter_id.length > 64) {
    return json({ error: 'bad voter_id' }, 400);
  }

  // Insert vote (PRIMARY KEY guards against double-votes by same voter on same candidate).
  const insertVote = await env.DB.prepare(
    `INSERT OR IGNORE INTO fodder_votes (candidate_id, voter_id, direction) VALUES (?, ?, ?)`
  ).bind(id, voter_id, direction).run();

  if (!insertVote.meta.changes) {
    // Already voted — return current state without double-counting.
    return await voteResponse(env, id, false);
  }

  // Atomically bump counters.
  const col = direction === 'yes' ? 'yes_votes' : direction === 'no' ? 'no_votes' : 'skip_votes';
  await env.DB.prepare(
    `UPDATE fodder_candidates SET ${col} = ${col} + 1 WHERE id = ?`
  ).bind(id).run();

  // Promotion check.
  await maybePromoteOrReject(env, id);
  return await voteResponse(env, id, true);
}

async function voteResponse(env, id, counted) {
  const row = await env.DB.prepare(
    `SELECT id, status, yes_votes, no_votes, skip_votes FROM fodder_candidates WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json({ ok: true, counted, ...row });
}

async function maybePromoteOrReject(env, id) {
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

// ---------- /api/promoted ----------

async function apiPromoted(env) {
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
  return json({ version: 2, source: 'fodder.mino.mobi', sentences });
}

// ---------- /api/stats ----------

async function apiStats(env) {
  const counts = await env.DB.prepare(`
    SELECT status, COUNT(*) AS n FROM fodder_candidates GROUP BY status
  `).all();
  const totals = { pending: 0, approved: 0, rejected: 0 };
  for (const row of counts.results || []) totals[row.status] = row.n;
  const votesRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM fodder_votes`).first();
  const votersRow = await env.DB.prepare(`SELECT COUNT(DISTINCT voter_id) AS n FROM fodder_votes`).first();
  return json({
    candidates: totals,
    votes_total: votesRow.n,
    voters_total: votersRow.n,
  });
}

// ---------- /api/admin/mine ----------

async function apiAdminMine(request, env) {
  const key = request.headers.get('x-admin-key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: 'forbidden' }, 403);
  const result = await mineGutenberg(env);
  return json(result);
}

// ---------- mining ----------

async function mineGutenberg(env) {
  // Pick a book — round-robin via fodder_state.
  const cursorRow = await env.DB.prepare(`SELECT value FROM fodder_state WHERE key='book_cursor'`).first();
  const cursor = cursorRow ? parseInt(cursorRow.value, 10) || 0 : 0;
  const book = GUTENBERG_BOOKS[cursor % GUTENBERG_BOOKS.length];
  await env.DB.prepare(
    `INSERT INTO fodder_state (key, value, updated_at) VALUES ('book_cursor', ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).bind(String(cursor + 1)).run();

  const proxyUrl = `https://read.mino.mobi/gutenberg-proxy?id=${book.id}`;
  const resp = await fetch(proxyUrl);
  if (!resp.ok) {
    return { ok: false, error: `gutenberg fetch failed: ${resp.status}`, book };
  }
  const text = await resp.text();
  const candidates = harvestSentences(text, MAX_PER_MINING_RUN * 6); // oversample, then prune
  const filtered = candidates
    .filter((s) => {
      const w = countWords(s);
      if (w < MIN_WORDS || w > MAX_WORDS) return false;
      if (flesch(s) > MAX_FLESCH) return false;
      if (/^[A-Z\s]+$/.test(s.trim())) return false; // chapter heading
      return true;
    })
    .slice(0, MAX_PER_MINING_RUN);

  const inserted = [];
  for (const sent of filtered) {
    // Skip if we've already mined this exact sentence.
    const exists = await env.DB.prepare(`SELECT 1 FROM fodder_candidates WHERE original = ? LIMIT 1`).bind(sent).first();
    if (exists) continue;

    let refs;
    try {
      refs = await generateReferences(env, sent);
    } catch (e) {
      console.error('llm refs failed for', book.title, e.message);
      continue;
    }
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

// Strip Gutenberg header/footer, normalize whitespace, split on sentence boundaries.
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
  // Collapse paragraph breaks; preserve sentence boundaries.
  body = body.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, ' ¶ ').replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Naive sentence splitter (good enough for Victorian prose).
  const out = [];
  const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z"'“‘])/);
  for (const raw of sentences) {
    const s = raw.replace(/\s*¶\s*/g, ' ').trim();
    if (s.length < 80 || s.length > 600) continue;
    if (s.includes('  ')) continue;
    if (!/[a-z]/.test(s)) continue;
    out.push(s);
    if (out.length >= want * 4) break; // cap scan
  }
  // Shuffle so successive crons hit different parts of the book.
  shuffle(out);
  return out.slice(0, want);
}

async function generateReferences(env, sentence) {
  if (!env.AI) throw new Error('no AI binding');
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
    if (rw < 3 || rw >= origWords) return true;          // too short or didn't shorten
    if (r.toLowerCase() === original.toLowerCase()) return true;
  }
  return false;
}

// ---------- shared helpers ----------

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
  // No localStorage on first request — synthesize from CF metadata; client will replace next call.
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ua = request.headers.get('user-agent') || '';
  return 'anon-' + shortHash(ip + '|' + ua);
}

function countWords(s) {
  const m = (s || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = stripped.match(/[aeiouy]+/g);
  return m ? m.length : 1;
}

function flesch(text) {
  const words = (text || '').trim().match(/\S+/g) || [];
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  if (!words.length) return 0;
  const syl = words.reduce((a, w) => a + countSyllables(w), 0);
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
}

function shortHash(s) {
  // Tiny non-cryptographic hash; produces a stable 8-char base36 string.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
