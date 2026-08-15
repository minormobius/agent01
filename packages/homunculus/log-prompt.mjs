/**
 * UserPromptSubmit hook — appends every prompt to the corpus log.
 *
 * Wired up in .claude/settings.json. Claude Code pipes the hook payload in on
 * stdin as JSON; we keep the prompt text, a timestamp, the session id and the
 * branch, and write one JSONL line per turn.
 *
 * Why this exists: the principal's prompts are the densest personal corpus
 * available — intent, unedited, at volume — and they were being thrown away.
 * Branch names preserved about four words per session; this preserves all of
 * it. See ../../packages/homunculus/README.md.
 *
 * Two rules this file must never break:
 *
 *   1. Never fail. A hook that throws interrupts the user's turn. Every path
 *      here is wrapped and exits 0 regardless.
 *   2. Never leak. The repo root is served as static assets, so LOG_DIR must
 *      stay listed in .assetsignore. `preflight` asserts exactly that — see
 *      the "prompt log stays unserved" check.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve against this file, not the cwd — a hook cannot assume where it runs.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
export const LOG_DIR = join(REPO, 'packages', 'homunculus', 'log');
export const LOG_FILE = join(LOG_DIR, 'prompts.jsonl');

/** Current branch, read straight from .git/HEAD to avoid spawning git. */
function branch() {
  try {
    const head = readFileSync(join(REPO, '.git', 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: ') ? head.slice(5).replace('refs/heads/', '') : head.slice(0, 12);
  } catch {
    return null;
  }
}

/** Shape one hook payload into a corpus row. Exported for the selftest. */
export function toRow(payload, now) {
  const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
  return {
    ts: now,
    session: payload?.session_id ?? null,
    branch: branch(),
    chars: prompt.length,
    words: prompt.trim() ? prompt.trim().split(/\s+/).length : 0,
    prompt,
  };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return; // Not JSON on stdin: nothing to log, nothing to complain about.
  }

  const row = toRow(payload, new Date().toISOString());
  if (!row.prompt) return; // Empty submit — no signal, skip the line.

  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_FILE, JSON.stringify(row) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Rule 1: never fail. A logging hook must not be able to break a turn.
  try {
    await main();
  } catch {
    /* swallow */
  }
  process.exit(0);
}
