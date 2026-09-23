/**
 * Stop / SessionEnd hook — ships this session's conversation to the private
 * corpus repo, so it outlives the container.
 *
 * capture-session.mjs already distils the transcript at session end, but into
 * packages/homunculus/log/, which is gitignored and lives in the container: when
 * the container is reclaimed the capture goes with it. That is why recovery
 * passes existed. This is the go-forward half: after every turn, the whole
 * transcript is re-distilled and written to `sessions/<session-id>.json` in a
 * SEPARATE PRIVATE repo (corpus.json names it), committed and pushed.
 *
 * Why a separate repo: agent01 is public. A transcript committed to one of its
 * branches is published (RECOVERY.md, and the assert-public-safe gate). The
 * corpus repo is private and holds nothing else.
 *
 * What it writes: the same distillation capture-session.mjs does — the
 * principal's typed turns and the assistant's text replies. No tool calls, no
 * tool output, no file contents, no skill bodies.
 *
 * Rules, same as the other hooks here:
 *   1. Never fail a turn. Every path exits 0; a failure is one line in
 *      log/ship.log and the local capture still happens.
 *   2. Never touch agent01's working tree or its git state. The corpus clone
 *      lives outside the repo (~/.cache/homunculus-corpus).
 *   3. Nothing covert. Plaintext, a normal clone, a normal commit on the corpus
 *      repo's main branch, documented in CLAUDE.md.
 *
 * The session must be able to push to the corpus repo, which in a cloud session
 * means the repo is attached to it (add_repo, access: push). If it is not, the
 * clone fails, ship.log says so, and nothing else happens.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distil } from './capture-session.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const LOG = join(HERE, 'log', 'ship.log');
export const CONFIG = JSON.parse(readFileSync(join(HERE, 'corpus.json'), 'utf8'));

/** The file written for one session. Pure — exported for the selftest. */
export function sessionRecord(payload, lines, { source, now } = {}) {
  const { turns, stats } = distil(lines);
  if (!turns.some((t) => t.role === 'principal')) return null; // nothing of the principal's: skip
  return {
    session: payload?.session_id ?? 'unknown',
    source: source ?? null,
    captured_at: now ?? null,
    stats: { prompts: stats.prompts, replies: stats.replies, promptWords: stats.promptWords, mode: stats.mode },
    turns,
  };
}

function log(msg) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* rule 1 */ }
}

/** git's own reason is the last line it printed, not the "Cloning into…" banner. */
const why = (e) => String(e.stderr || e.message).trim().split('\n').filter(Boolean).pop();

const git = (args, cwd, timeout = 30000) =>
  execFileSync('git', args, { cwd, timeout, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();

function transcriptPath(payload) {
  if (payload?.transcript_path && existsSync(payload.transcript_path)) return payload.transcript_path;
  const slug = (payload?.cwd ?? process.cwd()).replace(/[/.]/g, '-');
  const guess = join(homedir(), '.claude', 'projects', slug, `${payload?.session_id}.jsonl`);
  return existsSync(guess) ? guess : null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  if (process.env.HOMUNCULUS_SHIP === '0') return; // opt out for one session

  const path = transcriptPath(payload);
  if (!path) return;
  let branch = null;
  try { branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], REPO, 5000); } catch {}
  const record = sessionRecord(payload, readFileSync(path, 'utf8').split('\n'), {
    source: { repo: CONFIG.source, branch },
    now: new Date().toISOString(),
  });
  if (!record) return;

  // One shipper at a time per container: Stop hooks run async and can overlap.
  const clone = join(homedir(), '.cache', 'homunculus-corpus');
  const lock = `${clone}.lock`;
  try { mkdirSync(lock); } catch { return; } // another run holds it; the next turn catches up
  try {
    if (!existsSync(join(clone, '.git'))) {
      // Only the corpus branch is ever fetched: it may live in a repo that also holds code on
      // other branches (chatter), and those are never checked out, touched or pushed.
      const url = `https://github.com/${CONFIG.repo}.git`;
      try { git(['ls-remote', '--heads', url], undefined, 30000); } catch (e) {
        log(`cannot reach ${CONFIG.repo} — is it attached to this session with push access? ${why(e)}`);
        return;
      }
      rmSync(clone, { recursive: true, force: true });
      mkdirSync(clone, { recursive: true });
      git(['init', '-q'], clone);
      git(['remote', 'add', 'origin', url], clone);
      try {
        git(['fetch', '-q', '--depth', '1', 'origin', CONFIG.branch], clone, 60000);
        git(['checkout', '-q', '-B', CONFIG.branch, 'FETCH_HEAD'], clone);
      } catch {
        git(['checkout', '-q', '--orphan', CONFIG.branch], clone); // first ship: the branch starts empty
      }
    } else {
      try { git(['pull', '--rebase', '-q', 'origin', CONFIG.branch], clone); } catch { /* empty repo: nothing to pull */ }
    }

    const rel = join(CONFIG.dir, `${record.session}.json`);
    mkdirSync(join(clone, CONFIG.dir), { recursive: true });
    writeFileSync(join(clone, rel), JSON.stringify(record, null, 1) + '\n');
    if (!git(['status', '--porcelain', '--', rel], clone)) return; // unchanged since the last ship

    git(['add', '--', rel], clone);
    git(['-c', 'user.name=homunculus', '-c', 'user.email=homunculus@users.noreply.github.com',
      'commit', '-q', '-m', `session ${record.session}: ${record.stats.prompts} prompts, ${record.stats.replies} replies`], clone);
    for (let i = 0; i < 3; i++) {
      try { git(['push', '-q', 'origin', `HEAD:${CONFIG.branch}`], clone, 60000); return; }
      catch (e) {
        if (i === 2) { log(`push failed: ${why(e)}`); return; }
        // another session pushed first; files are per-session, so the rebase is always clean
        try { git(['pull', '--rebase', '-q', 'origin', CONFIG.branch], clone); } catch {}
      }
    }
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { await main(); } catch (e) { log(`error: ${e.message}`); }
  process.exit(0);
}
