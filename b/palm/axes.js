// palm/axes.js — six readings taken off a repo.
//
// WHAT THIS IS NOT. It is not a trained AI-text detector and it must never be
// described as one. Bluesky caps a post at 300 graphemes and the median post is
// far shorter than that; every published detector degrades badly below ~50 words,
// so a per-post verdict here would be invention. What survives at this length is
// STYLOMETRY IN AGGREGATE: any single number below is noise, but the error on a
// mean over tens of thousands of posts falls as sqrt(N), so the account-level
// reading is real even where none of its parts are.
//
// Every reading is oriented the same way: HIGH = more machine-like. Each returns
// a raw statistic in its own natural unit. Turning that into a position on the
// dial is the job of baseline.js, which compares you to other accounts rather
// than to an absolute scale nobody can calibrate.
//
// Pure functions over the post array from car-stream.js. No network, no DOM.

// ── tokenizing ───────────────────────────────────────────────────────────────
// URLs and @handles are stripped: they are addresses, not writing, and an
// account that posts many links would otherwise read as having a huge vocabulary.
export function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.-]+/g, ' ')
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

const MS_DAY = 86400000;
const SANE_FROM = Date.UTC(2022, 0, 1);                   // ATProto did not exist before this

function times(posts) {
  const t = [];
  for (const p of posts) {
    if (!p.createdAt) continue;
    const ms = Date.parse(p.createdAt);
    // createdAt is client-supplied and occasionally a lie — a clock-skewed post
    // dated 1970 or 2099 would dominate every temporal statistic on its own.
    if (Number.isFinite(ms) && ms > SANE_FROM && ms < Date.now() + MS_DAY) t.push(ms);
  }
  return t.sort((a, b) => a - b);
}

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1));
}

// ── 1. CADENCE — how evenly you arrive ───────────────────────────────────────
// Burstiness after Goh & Barabási: B = (σ − μ) / (σ + μ) over inter-event times.
// B = −1 is a metronome, B = 0 is a Poisson process, B → 1 is heavy bursts.
// Human attention is bursty: sessions, then hours of nothing. Schedulers are not.
// Reported NEGATED so that high = regular = machine-like.
//
// Intervals are capped at 30 days: a single two-year hiatus is a fact about a
// life, not about a rhythm, and uncapped it would swamp σ by itself.
export function cadence(posts) {
  const t = times(posts);
  if (t.length < 30) return { raw: null, n: t.length };
  const gaps = [];
  for (let i = 1; i < t.length; i++) gaps.push(Math.min(t[i] - t[i - 1], 30 * MS_DAY));
  const m = mean(gaps), s = sd(gaps);
  const B = (s + m) === 0 ? 0 : (s - m) / (s + m);
  return { raw: -B, n: gaps.length, burstiness: B, medianGapMin: median(gaps) / 60000 };
}

function median(xs) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const i = a.length >> 1;
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}

// ── 2. VIGIL — whether you sleep ─────────────────────────────────────────────
// Normalised Shannon entropy of the hour-of-day histogram. A person has a trough
// where they are unconscious; an always-on account spreads flat across 24 hours.
// 1.0 = perfectly flat = never sleeps. Entropy is rotation-invariant, which is
// what lets this work without knowing anyone's timezone.
//
// `quietHours` is reported alongside because it is the legible version of the
// same fact: the longest run of hours in which you post below a fifth of your
// average rate.
export function vigil(posts) {
  const t = times(posts);
  if (t.length < 50) return { raw: null, n: t.length };
  const hist = new Array(24).fill(0);
  for (const ms of t) hist[new Date(ms).getUTCHours()]++;
  const total = t.length;
  let H = 0;
  for (const c of hist) { if (c > 0) { const p = c / total; H -= p * Math.log(p); } }
  const avg = total / 24, thresh = avg * 0.2;
  let best = 0, run = 0;
  for (let i = 0; i < 48; i++) {                          // wrap around midnight
    if (hist[i % 24] < thresh) { run++; if (run > best) best = run; } else run = 0;
  }
  return { raw: H / Math.log(24), n: total, quietHours: Math.min(best, 24), hist };
}

// ── 3. LEXICON — how wide you draw ───────────────────────────────────────────
// Heaps' law: distinct words V grows as N^β in total words N. β is the honest
// way to compare vocabulary across accounts of wildly different size, which a
// raw type-token ratio cannot do — TTR falls monotonically with length, so it
// would only measure who posts more.
//
// Fitted by least squares on log V against log N at log-spaced checkpoints.
// Reported negated: high = narrow = machine-like.
//
// THE FIT RANGE IS FIXED (64 .. LEX_WORDS words) for every account. β is
// scale-free in theory but drifts in practice, so fitting one account over
// 700k words and another over 20k would compare two different quantities and
// the percentile would be measuring who posts more. Accounts that never reach
// LEX_WORDS are reported with `short: true` and kept out of the baseline.
export const LEX_WORDS = 20000;

export function lexicon(posts) {
  const seen = new Set();
  const pts = [];
  let n = 0, nextMark = 64;
  for (const p of posts) {
    for (const w of words(p.text)) {
      n++;
      seen.add(w);
      if (n >= nextMark) { pts.push([Math.log(n), Math.log(seen.size)]); nextMark = Math.round(nextMark * 1.35); }
      if (n >= LEX_WORDS) break;
    }
    if (n >= LEX_WORDS) break;
  }
  if (pts.length < 6) return { raw: null, n };
  const mx = mean(pts.map((q) => q[0])), my = mean(pts.map((q) => q[1]));
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) * (x - mx); }
  const beta = den === 0 ? 0 : num / den;
  return {
    raw: -beta, n, heaps: beta,
    vocabAtFit: seen.size,                                // distinct words within the fixed fit range
    hapaxRate: countHapax(posts),                         // full history — colour, not the axis
    short: n < LEX_WORDS,
  };
}

function countHapax(posts) {
  const freq = new Map();
  let total = 0;
  for (const p of posts) for (const w of words(p.text)) { freq.set(w, (freq.get(w) || 0) + 1); total++; }
  if (!freq.size) return 0;
  let ones = 0;
  for (const c of freq.values()) if (c === 1) ones++;
  return ones / freq.size;
}

// ── 4. POLISH — how well-formed you are ──────────────────────────────────────
// The reading closest to what an actual detector keys on. Language models are
// relentlessly well-formed: they capitalise, they close their sentences, they do
// not type "sooo" or drop apostrophes, and they reach for the em dash far more
// often than people do. None of these is worth anything alone; the mean of six
// of them over 50,000 posts is worth something.
//
// Posts with no text (image-only) are skipped rather than scored as unpolished.
const CASUAL = /\b(lol|lmao|lmfao|omg|idk|tbh|imo|wtf|ngl|fr|rn|af|smh|yeah|nah|hm+|ugh|oof|eh)\b/i;
const ELONG = /([a-z])\1{2,}/i;                            // sooo, ahhh, nooo

export function polish(posts) {
  const scored = [];
  for (const p of posts) {
    const s = String(p.text || '').trim();
    if (s.length < 12) continue;
    const first = s[0];
    const sig = [
      /[A-Z]/.test(first) ? 1 : 0,                        // opens with a capital
      /[.!?…"')\]]$/.test(s) ? 1 : 0,                     // closes its sentence
      /—/.test(s) ? 1 : 0,                                // the em dash
      CASUAL.test(s) ? 0 : 1,                             // no internet register
      ELONG.test(s) ? 0 : 1,                              // no elongation
      /\b(dont|cant|wont|im|ive|youre|its a|thats)\b/i.test(s) ? 0 : 1,  // apostrophes intact
    ];
    scored.push({ p, v: sig.reduce((a, b) => a + b, 0) / sig.length });
  }
  if (scored.length < 30) return { raw: null, n: scored.length };
  scored.sort((a, b) => b.v - a.v);
  return {
    raw: mean(scored.map((x) => x.v)),
    n: scored.length,
    // Kept for the card: the posts at either end of your own distribution.
    mostPolished: scored.slice(0, 3).map((x) => x.p),
    leastPolished: scored.slice(-3).reverse().map((x) => x.p),
  };
}

// ── 5. ECHO — how much you repeat yourself ───────────────────────────────────
// Share of word trigrams that you have already used at some earlier point. Every
// writer has stock phrases; the question is the rate. Templated and scheduled
// accounts recycle heavily, and so do people whose posting is mostly one format.
//
// THE TRIGRAM BUDGET IS FIXED for the same reason the Heaps fit range is: a
// repeat rate rises monotonically with corpus size, so an unbudgeted version
// would rank accounts by how much they post. Posts are sampled at a stride
// across the WHOLE history rather than taken from the recent end, so a person
// who changed how they write five years ago is measured over both selves.
export const ECHO_TRIGRAMS = 40000;

// Posts are visited in interleaved passes — every stride-th post, then the ones
// in between — so however far we get before the budget fills, the sample is
// spread across the whole history rather than piled at one end, and no post is
// counted twice. A single strided pass would undershoot the budget whenever
// posts are shorter than the stride assumed.
export function echo(posts, { budget = ECHO_TRIGRAMS } = {}) {
  const seen = new Set();
  let total = 0, repeats = 0;
  const stride = Math.max(1, Math.floor(posts.length / 3000));
  for (let offset = 0; offset < stride && total < budget; offset++) {
    for (let i = offset; i < posts.length && total < budget; i += stride) {
      const w = words(posts[i].text);
      for (let j = 0; j + 2 < w.length && total < budget; j++) {
        const g = w[j] + ' ' + w[j + 1] + ' ' + w[j + 2];
        total++;
        if (seen.has(g)) repeats++; else seen.add(g);
      }
    }
  }
  if (total < 2000) return { raw: null, n: total };
  return { raw: repeats / total, n: total, distinct: seen.size, short: total < budget };
}

// ── 5. DRIFT — whether you are still the same writer ─────────────────────────
// Echo used to hold this spoke and was cut: measured across the pool it
// correlated with Lexicon at r = 0.84, because a narrow vocabulary and a high
// trigram repeat rate are the same fact wearing two hats. Six readings that are
// really five is worse than five honest ones, so this replaced it.
//
// Cosine similarity between the word distribution of your first third and your
// last third. People drift — new obsessions, new jobs, new words, a different
// person at 40 than at 30. A generated or templated account does not. High
// similarity = static = machine-like, which is already the right orientation.
//
// The 40 commonest words are dropped before comparing: every English speaker
// says "the" at the same rate, and leaving them in pins every account at 0.99
// and measures nothing.
const DRIFT_STOPWORDS = 40, DRIFT_VOCAB = 1200;

export function drift(posts) {
  const texted = posts.filter((p) => String(p.text || '').trim().length >= 12);
  if (texted.length < 600) return { raw: null, n: texted.length };
  const third = Math.floor(texted.length / 3);

  const count = (slice) => {
    const m = new Map();
    for (const p of slice) for (const w of words(p.text)) m.set(w, (m.get(w) || 0) + 1);
    return m;
  };
  const early = count(texted.slice(0, third));
  const late = count(texted.slice(-third));

  const combined = new Map();
  for (const m of [early, late]) for (const [w, c] of m) combined.set(w, (combined.get(w) || 0) + c);
  const vocab = [...combined].sort((a, b) => b[1] - a[1])
    .slice(DRIFT_STOPWORDS, DRIFT_STOPWORDS + DRIFT_VOCAB).map((x) => x[0]);
  if (vocab.length < 200) return { raw: null, n: texted.length };

  const totalEarly = [...early.values()].reduce((a, b) => a + b, 0) || 1;
  const totalLate = [...late.values()].reduce((a, b) => a + b, 0) || 1;
  let dot = 0, na = 0, nb = 0;
  for (const w of vocab) {
    const a = (early.get(w) || 0) / totalEarly;
    const b = (late.get(w) || 0) / totalLate;
    dot += a * b; na += a * a; nb += b * b;
  }
  const cos = (na && nb) ? dot / Math.sqrt(na * nb) : 0;
  return { raw: cos, n: texted.length, similarity: cos, vocab: vocab.length, short: texted.length < 600 };
}

// ── 6. CHORUS — whether you answer ───────────────────────────────────────────
// A machine broadcasts. A person is in conversation, with many different people,
// and their replies go to others rather than to their own thread. Composite of
// three shares; reported so that high = broadcasting = machine-like.
export function chorus(posts, ownDid) {
  if (posts.length < 30) return { raw: null, n: posts.length };
  let replies = 0, selfReplies = 0;
  const partners = new Set();
  for (const p of posts) {
    if (!p.isReply) continue;
    replies++;
    if (p.replyTo === ownDid) selfReplies++;
    else if (p.replyTo) partners.add(p.replyTo);
  }
  const replyShare = replies / posts.length;
  const outward = replies ? (replies - selfReplies) / replies : 0;
  // Distinct partners per outward reply, saturating — talking to 500 people is
  // meaningfully different from talking to 5, but not from talking to 5000.
  const outwardReplies = replies - selfReplies;
  const breadth = outwardReplies ? Math.min(1, partners.size / Math.max(1, outwardReplies * 0.25)) : 0;
  const social = (replyShare * 0.5) + (outward * 0.25) + (breadth * 0.25);
  return {
    raw: 1 - social,
    n: posts.length,
    replyShare, selfReplyShare: replies ? selfReplies / replies : 0, partners: partners.size,
  };
}

// ── the hand ─────────────────────────────────────────────────────────────────
// Order is the order they are drawn on the radar, clockwise from the top.
export const AXES = [
  { key: 'cadence', label: 'Cadence', line: 'the life line',      gloss: 'how evenly you arrive',        machine: 'metronomic',  animal: 'bursty',        fn: cadence },
  { key: 'vigil',   label: 'Vigil',   line: 'the sleep line',     gloss: 'whether you sleep',            machine: 'always on',   animal: 'nocturnal gaps', fn: vigil },
  { key: 'lexicon', label: 'Lexicon', line: 'the head line',      gloss: 'how wide you draw',            machine: 'narrow',      animal: 'sprawling',     fn: lexicon },
  { key: 'polish',  label: 'Polish',  line: 'the fate line',      gloss: 'how well-formed you are',      machine: 'immaculate',  animal: 'ragged',        fn: polish },
  { key: 'drift',   label: 'Drift',   line: 'the travel line',    gloss: 'whether you are still you',    machine: 'unchanging',  animal: 'a different person', fn: drift },
  { key: 'chorus',  label: 'Chorus',  line: 'the heart line',     gloss: 'whether you answer',           machine: 'broadcast',   animal: 'in conversation', fn: chorus },
];

/**
 * Take all six readings. Returns raw statistics only — see baseline.js for the
 * comparison that turns these into a dial position.
 */
export function readings(posts, ownDid) {
  const out = {};
  for (const a of AXES) out[a.key] = a.fn(posts, ownDid);
  const t = times(posts);
  return {
    axes: out,
    // Not a spoke — see the note on drift() — but cheap and interesting, so it
    // stays as a footnote on the page rather than being thrown away.
    extra: { echo: echo(posts) },
    meta: {
      posts: posts.length,
      withText: posts.filter((p) => (p.text || '').trim().length >= 12).length,
      firstPost: t.length ? new Date(t[0]).toISOString() : null,
      lastPost: t.length ? new Date(t[t.length - 1]).toISOString() : null,
      span: t.length > 1 ? (t[t.length - 1] - t[0]) / MS_DAY : 0,
    },
  };
}
