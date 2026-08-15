/**
 * Corpus census — answers "is there a there there?" before anyone spends
 * money on a finetune.
 *
 *   node census.mjs corpus.jsonl
 *   node census.mjs corpus.jsonl --json
 *
 * The headline numbers are deliberately pessimistic. Raw post count flatters
 * a corpus: it counts "lol", bare links, and reposts of your own blog as
 * training data. What actually trains a homunculus is substantive text and,
 * above all, (parent, reply) pairs — so those get reported separately and the
 * cheerful number is never the one on the summary line.
 */

import { existsSync, readFileSync } from 'node:fs';

// A post shorter than this carries no recoverable voice. "same", "yes",
// "🙏" — real utterances, zero signal for imitation.
const MIN_SUBSTANTIVE_WORDS = 5;

// Rough chars-per-token for English prose. Good enough for sizing a run;
// swap for a real tokeniser before you budget against it.
const CHARS_PER_TOKEN = 4;

// ─── Loading ─────────────────────────────────────────────────────

export function load(path) {
  if (!existsSync(path)) throw new Error(`No such corpus: ${path}`);
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // Truncated tail from an interrupted harvest.
    }
  }
  return rows;
}

// ─── Measures ────────────────────────────────────────────────────

const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean);

/**
 * Strip a post down to what it contributes as prose: no leading mentions,
 * no bare URLs. What survives is what a model could learn to write.
 */
function proseOf(text) {
  return (text ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^(\s*@[\w.-]+)+/, '')
    .trim();
}

function median(ns) {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Walk reply chains to find runs of consecutive self-replies. These are the
 * only long-form structure a microblog corpus has, and the only material an
 * essay-length generation could be trained against.
 */
function selfThreads(rows) {
  const byUri = new Map(rows.map((r) => [r.uri, r]));
  const childOf = new Map();
  for (const r of rows) {
    if (r.replyParent && byUri.has(r.replyParent)) childOf.set(r.replyParent, r);
  }

  // A run starts at a self-post whose parent is not itself in the corpus.
  const starts = rows.filter((r) => !r.replyParent || !byUri.has(r.replyParent));
  const runs = [];
  for (const start of starts) {
    const run = [start];
    let cur = start;
    while (childOf.has(cur.uri)) {
      cur = childOf.get(cur.uri);
      run.push(cur);
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}

export function census(rows) {
  const substantive = [];
  const perYear = new Map();
  const lengths = [];
  const vocab = new Map();
  let totalWords = 0;
  let totalChars = 0;
  let linkOnly = 0;

  for (const r of rows) {
    const prose = proseOf(r.text);
    const w = words(prose);
    totalWords += w.length;
    totalChars += prose.length;
    lengths.push(w.length);

    if (!prose && r.text) linkOnly++;
    if (w.length >= MIN_SUBSTANTIVE_WORDS) substantive.push(r);

    for (const token of w) {
      const key = token.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '');
      if (key) vocab.set(key, (vocab.get(key) ?? 0) + 1);
    }

    const year = (r.createdAt ?? '').slice(0, 4) || 'unknown';
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
  }

  const replies = rows.filter((r) => r.replyParent);
  const hydrated = replies.filter((r) => typeof r.parentText === 'string');
  const toOthers = hydrated.filter((r) => !r.parentIsSelf);
  const missing = replies.filter((r) => r.parentMissing).length;

  // The number that decides the project: replies to someone else, with the
  // parent text present, where the reply itself says something.
  const pairs = toOthers.filter((r) => words(proseOf(r.text)).length >= MIN_SUBSTANTIVE_WORDS);

  const runs = selfThreads(rows);
  const runWords = runs.map((run) =>
    run.reduce((n, r) => n + words(proseOf(r.text)).length, 0)
  );

  const hapax = [...vocab.values()].filter((n) => n === 1).length;

  return {
    posts: rows.length,
    substantive: substantive.length,
    linkOnly,
    totalWords,
    estTokens: Math.round(totalChars / CHARS_PER_TOKEN),
    medianWords: median(lengths),
    meanWords: rows.length ? +(totalWords / rows.length).toFixed(1) : 0,
    perYear: [...perYear.entries()].sort(),
    replies: replies.length,
    hydrated: hydrated.length,
    parentsMissing: missing,
    pairs: pairs.length,
    pairWords: pairs.reduce((n, r) => n + words(proseOf(r.text)).length, 0),
    selfThreads: runs.length,
    longestThread: runs.length ? Math.max(...runs.map((r) => r.length)) : 0,
    threadWords: runWords.reduce((a, b) => a + b, 0),
    longestThreadWords: runWords.length ? Math.max(...runWords) : 0,
    vocab: vocab.size,
    hapax,
  };
}

// ─── Report ──────────────────────────────────────────────────────

const n = (x) => x.toLocaleString('en-US');
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

export function report(c) {
  const lines = [];
  const say = (label, value, note = '') =>
    lines.push(`  ${label.padEnd(24)} ${String(value).padStart(12)}  ${note}`);

  lines.push('\nCORPUS');
  say('posts', n(c.posts));
  say('substantive', n(c.substantive), `${pct(c.substantive, c.posts)} — ≥${MIN_SUBSTANTIVE_WORDS} words of prose`);
  say('link-only', n(c.linkOnly), 'no prose once URLs are stripped');
  say('total words', n(c.totalWords));
  say('est. tokens', n(c.estTokens), 'rough; not a real tokeniser');
  say('median / mean words', `${c.medianWords} / ${c.meanWords}`);
  say('vocabulary', n(c.vocab), `${pct(c.hapax, c.vocab)} hapax`);

  lines.push('\nDIALOGUE  (the part that trains a response function)');
  say('replies', n(c.replies), pct(c.replies, c.posts));
  say('parents resolved', n(c.hydrated), c.hydrated ? pct(c.hydrated, c.replies) : 'run --hydrate');
  say('parents missing', n(c.parentsMissing), 'deleted or unreachable');
  say('trainable pairs', n(c.pairs), 'to others, hydrated, substantive');
  say('pair words', n(c.pairWords));

  lines.push('\nLONG FORM  (self-reply runs — all the structure a microblog has)');
  say('self-threads', n(c.selfThreads));
  say('longest thread', `${c.longestThread} posts`, `${n(c.longestThreadWords)} words`);
  say('thread words', n(c.threadWords), pct(c.threadWords, c.totalWords));

  lines.push('\nBY YEAR');
  const peak = Math.max(1, ...c.perYear.map(([, v]) => v));
  for (const [year, count] of c.perYear) {
    const bar = '█'.repeat(Math.max(1, Math.round((count / peak) * 32)));
    lines.push(`  ${year.padEnd(8)} ${String(n(count)).padStart(8)}  ${bar}`);
  }

  lines.push('\nVERDICT');
  for (const v of verdict(c)) lines.push(`  ${v}`);
  return lines.join('\n') + '\n';
}

/**
 * Blunt read on whether this corpus supports a finetune. Thresholds are
 * judgement calls, not results — they are set where the failure modes change
 * kind, not where any paper says to put them.
 */
export function verdict(c) {
  const out = [];

  if (c.estTokens < 100_000) {
    out.push('Too small to finetune. This is a system-prompt-and-examples problem.');
  } else if (c.estTokens < 2_000_000) {
    out.push('LoRA territory. Low rank, few epochs — a full finetune would memorise it.');
  } else {
    out.push('Enough for a serious LoRA, and full finetune is arguable.');
  }

  if (c.pairs < 1_000) {
    out.push('Too few dialogue pairs to learn a response function; expect voice mimicry only.');
  } else if (c.pairs < 10_000) {
    out.push(`${n(c.pairs)} dialogue pairs — enough to learn how you answer, not what you know.`);
  } else {
    out.push(`${n(c.pairs)} dialogue pairs — the strongest signal in this corpus. Weight it up.`);
  }

  if (c.longestThreadWords < 400) {
    out.push('No long-form structure. This corpus cannot train essay generation — do not set that as the eval.');
  } else {
    out.push(`Longest thread is ${n(c.longestThreadWords)} words; self-threads are the only essay-shaped material here.`);
  }

  if (c.posts && c.substantive / c.posts < 0.5) {
    out.push('Over half the posts carry no prose. Filter before training or you teach it to post links.');
  }

  return out;
}

// ─── CLI ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error('usage: node census.mjs <corpus.jsonl> [--json]');
    process.exit(1);
  }
  const c = census(load(path));
  console.log(args.includes('--json') ? JSON.stringify(c, null, 2) : report(c));
}
