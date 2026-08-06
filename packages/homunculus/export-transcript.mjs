/**
 * Self-export for a resumed Claude Code session.
 *
 * Paste-and-go recovery for sessions whose transcripts exist nowhere else.
 * Resuming a session rehydrates its transcript onto the container's disk, so
 * a resumed session can read its own history and push it somewhere durable
 * before the container is reclaimed again.
 *
 *   node /tmp/export-transcript.mjs
 *   HOMUNCULUS_KEY='passphrase' node /tmp/export-transcript.mjs   # encrypted
 *
 * ── Two constraints that shape the whole file ──
 *
 * 1. It runs inside somebody else's live session, on an old branch, possibly
 *    over uncommitted work. So it must not touch the working tree, the index,
 *    or HEAD. Everything goes through git plumbing — hash-object, mktree,
 *    commit-tree, push — which writes objects and one ref and nothing else.
 *
 * 2. Each session pushes to its own ref, refs/heads/corpus/<session-id>. No
 *    two sessions ever contend, so there is no fetch, no rebase, no retry and
 *    no conflict, however many run. Collection happens later, in one place.
 *
 * The commit is an orphan holding a single file, so it carries none of
 * whatever tree the old branch was sitting on.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { distil } from './capture-session.mjs';

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();

// ─── Locate this session's transcript ────────────────────────────

/**
 * Find the transcript for the session we are running inside.
 *
 * The filename is the session id, which the script has no reliable way to
 * learn from inside — so take the most recently modified transcript for this
 * working directory. That is the live one: it was appended to moments ago by
 * the very prompt that started this script.
 */
export function findOwnTranscript(cwd = process.cwd(), home = process.env.HOME ?? '/root') {
  const dir = join(home, '.claude', 'projects', cwd.replace(/[/.]/g, '-'));
  if (!existsSync(dir)) return null;

  const candidates = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const path = join(dir, f);
      return { path, id: f.replace(/\.jsonl$/, ''), mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return candidates[0] ?? null;
}

// ─── Optional encryption ─────────────────────────────────────────

/**
 * Seal the payload with the repo's existing vault crypto (PBKDF2 → AES-256-GCM).
 *
 * Worth the trouble because the destination repo is public: a plaintext push
 * would publish every prompt in the session to anyone who can read GitHub.
 */
async function seal(text, passphrase) {
  const { deriveKek, encrypt, toBase64 } = await import('../atproto/crypto.js');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(passphrase, salt);
  const { iv, ciphertext } = await encrypt(new TextEncoder().encode(text), kek);
  return JSON.stringify({
    v: 1,
    alg: 'PBKDF2-SHA256/AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  });
}

// ─── Push, without disturbing anything ───────────────────────────

/**
 * Commit `content` as a lone file on an orphan commit and push it to
 * refs/heads/corpus/<id>. Uses plumbing throughout: no checkout, no add,
 * no branch switch, no change to HEAD or the index.
 */
export function pushOrphan(name, content, ref, message) {
  const tmp = join(tmpdir(), `homunculus-${Date.now()}.tmp`);
  writeFileSync(tmp, content);

  const blob = git(['hash-object', '-w', tmp]);
  // mktree reads `<mode> <type> <sha>\t<name>` on stdin.
  const tree = git(['mktree'], { input: `100644 blob ${blob}\t${name}\n` });
  const commit = git(['commit-tree', tree, '-m', message]);

  // Retry only the network step; everything before it is local and atomic.
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      git(['push', 'origin', `${commit}:refs/heads/${ref}`, '--force']);
      return { blob, tree, commit, ref };
    } catch (err) {
      lastErr = err;
      execFileSync('sleep', [String(2 ** attempt)]);
    }
  }
  throw lastErr;
}

// ─── Main ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = findOwnTranscript();
  if (!found) {
    console.error(
      'NO TRANSCRIPT FOUND.\n' +
        `  Looked in: ${join(process.env.HOME ?? '/root', '.claude/projects', process.cwd().replace(/[/.]/g, '-'))}\n` +
        '  This session may not have rehydrated its transcript. Report this back\n' +
        '  rather than improvising — it means the recovery route does not work.'
    );
    process.exit(1);
  }

  const { turns, stats } = distil(readFileSync(found.path, 'utf8').split('\n'));
  if (!stats.prompts) {
    console.error(`Transcript found (${stats.records} records) but no principal turns in it.`);
    process.exit(1);
  }

  const payload = turns.map((t) => JSON.stringify(t)).join('\n') + '\n';
  const key = process.env.HOMUNCULUS_KEY;
  const body = key ? await seal(payload, key) : payload;
  const name = key ? `${found.id}.jsonl.enc` : `${found.id}.jsonl`;

  const result = pushOrphan(
    name,
    body,
    `corpus/${found.id}`,
    `corpus: session ${found.id} — ${stats.prompts} prompts, ${stats.promptWords} words`
  );

  console.log('EXPORTED');
  console.log(`  session       ${found.id}`);
  console.log(`  records       ${stats.records}  (mode: ${stats.mode})`);
  console.log(`  tool results  ${stats.toolResults} cut`);
  console.log(`  injected      ${stats.injected} cut`);
  console.log(`  your prompts  ${stats.prompts}`);
  console.log(`  your words    ${stats.promptWords}`);
  console.log(`  assistant     ${stats.replies}`);
  console.log(`  encrypted     ${key ? 'yes' : 'NO — plaintext in a public repo'}`);
  console.log(`  pushed        ${result.ref}`);
}
