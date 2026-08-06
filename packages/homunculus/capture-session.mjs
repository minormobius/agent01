/**
 * SessionEnd hook — distils a Claude Code transcript into corpus rows before
 * the container is reclaimed.
 *
 * Claude Code writes a live transcript to
 * ~/.claude/projects/<sanitised-cwd>/<session-id>.jsonl. On a remote session
 * that file lives in an ephemeral container: when the session ends and the
 * container is reclaimed, the transcript goes with it. There is no server-side
 * export — the self-serve claude.ai data export does not include Code
 * sessions, and `claude project` can only purge them. So the transcript has to
 * be captured here, at the end, or not at all.
 *
 * ── The trap this file exists to avoid ──
 *
 * Most records with `type: "user"` are NOT the user. In a real session:
 *
 *     promptSource: {'sdk': 9, None: 109}
 *     content shapes: {'string': 9, 'list:tool_result': 108, 'list:text': 1}
 *
 * 118 user-typed records, of which 9 were actually typed by a human. The rest
 * are tool results being fed back through the user role. Counting them as
 * principal utterances would bury 9 real prompts under 108 blobs of JSON and
 * teach a finetune to emit tool output.
 *
 * The discriminator is the content shape, not the role: a genuine turn carries
 * a string, or a block list with no tool_result in it.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
export const SESSION_DIR = join(REPO, 'packages', 'homunculus', 'log', 'sessions');

// ─── Distillation ────────────────────────────────────────────────

/** Join the text blocks of an assistant message, dropping tool calls. */
function assistantText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** Text of a user record, ignoring provenance. Null if it carries a tool result. */
function userText(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  if (content.some((b) => b?.type === 'tool_result')) return null;
  const text = content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text || null;
}

/**
 * Content shape alone is not enough. Skills and slash commands inject their
 * whole body as a user turn — one `/update-config` invocation arrived as a
 * 15,354-word "user message", against 148 words the principal actually typed
 * in the same session. Left in, a single skill load outweighs a month of real
 * prompts.
 *
 * Claude Code stamps genuinely typed turns with `origin: {kind: 'human'}`;
 * injected ones carry no origin at all. That field is the discriminator where
 * it exists — but older transcripts predate it, and requiring it there would
 * silently reject everything. So: detect whether this transcript uses origin,
 * then apply the strictest rule it supports.
 */
export function provenanceMode(records) {
  return records.some((r) => r?.origin !== undefined) ? 'origin' : 'shape';
}

function isPrincipal(rec, mode) {
  if (mode === 'origin') return rec?.origin?.kind === 'human';
  return true; // Shape-only transcript: userText() already did the filtering.
}

/**
 * Reduce a transcript to alternating principal/assistant turns.
 * Exported for the selftest.
 */
export function distil(lines) {
  const records = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // Transcripts are append-only; a torn last line is normal.
    }
  }

  const mode = provenanceMode(records);
  const turns = [];
  const stats = {
    records: records.length,
    mode,
    prompts: 0,
    replies: 0,
    toolResults: 0,
    injected: 0,
    promptWords: 0,
  };

  for (const rec of records) {
    const msg = rec.message;
    if (!msg || typeof msg !== 'object') continue;

    if (rec.type === 'user') {
      const text = userText(msg.content);
      if (!text) {
        stats.toolResults++;
        continue;
      }
      if (!isPrincipal(rec, mode)) {
        stats.injected++; // A skill or slash-command body, not the principal.
        continue;
      }
      const words = text.split(/\s+/).filter(Boolean).length;
      stats.prompts++;
      stats.promptWords += words;
      turns.push({
        role: 'principal',
        ts: rec.timestamp ?? null,
        branch: rec.gitBranch ?? null,
        source: rec.promptSource ?? null,
        words,
        text,
      });
    } else if (rec.type === 'assistant') {
      const text = assistantText(msg.content);
      if (!text) continue; // A pure tool-call turn says nothing.
      stats.replies++;
      turns.push({
        role: 'assistant',
        ts: rec.timestamp ?? null,
        words: text.split(/\s+/).filter(Boolean).length,
        text,
      });
    }
  }

  return { turns, stats };
}

// ─── Hook entry ──────────────────────────────────────────────────

/** Locate the transcript: the hook usually names it; otherwise reconstruct. */
function findTranscript(payload) {
  if (payload?.transcript_path && existsSync(payload.transcript_path)) {
    return payload.transcript_path;
  }
  const cwd = payload?.cwd ?? process.cwd();
  const slug = cwd.replace(/[/.]/g, '-');
  const guess = join(
    process.env.HOME ?? '/root',
    '.claude',
    'projects',
    slug,
    `${payload?.session_id}.jsonl`
  );
  return existsSync(guess) ? guess : null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const transcript = findTranscript(payload);
  if (!transcript) return;

  const { turns } = distil(readFileSync(transcript, 'utf8').split('\n'));
  if (!turns.length) return;

  mkdirSync(SESSION_DIR, { recursive: true });
  const out = join(SESSION_DIR, `${payload.session_id ?? 'unknown'}.jsonl`);
  appendFileSync(out, turns.map((t) => JSON.stringify(t)).join('\n') + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Same rule as log-prompt.mjs: a capture hook must never break a session.
  try {
    await main();
  } catch {
    /* swallow */
  }
  process.exit(0);
}
