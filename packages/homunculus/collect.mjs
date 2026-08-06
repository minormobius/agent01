/**
 * Collect the exported session transcripts back into one corpus.
 *
 * The other half of export-transcript.mjs. Each resumed session pushes to its
 * own refs/heads/corpus/<session-id>; this fetches every one of them, decrypts
 * if needed, and merges them into a single JSONL.
 *
 *   HOMUNCULUS_KEY='passphrase' node collect.mjs --out sessions.jsonl
 *   node collect.mjs --list                        # what's been exported so far
 *
 * Writes only to --out, which must be outside the repo: these are the
 * principal's own words and the repo is public.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 2 ** 30 });

// ─── Refs ────────────────────────────────────────────────────────

/** List the corpus refs on the remote, newest push order not guaranteed. */
export function listRefs() {
  const out = git(['ls-remote', '--heads', 'origin', 'refs/heads/corpus/*']);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.split(/\s+/);
      return { sha, ref: ref.replace('refs/heads/', ''), id: ref.split('/').pop() };
    });
}

/** Fetch every corpus ref into remote-tracking refs in one round trip. */
export function fetchAll() {
  git(['fetch', '--force', 'origin', 'refs/heads/corpus/*:refs/remotes/origin/corpus/*']);
}

/** The single file carried by a corpus commit, or null for a placeholder. */
function readRef(ref) {
  const names = git(['ls-tree', '--name-only', `origin/${ref}`]).split('\n').filter(Boolean);
  if (!names.length) return null; // Overwritten or empty — skip quietly.
  return { name: names[0], body: git(['show', `origin/${ref}:${names[0]}`]) };
}

// ─── Decryption ──────────────────────────────────────────────────

async function unseal(body, passphrase) {
  const { deriveKek, decrypt, fromBase64 } = await import('../atproto/crypto.js');
  const p = JSON.parse(body);
  const kek = await deriveKek(passphrase, fromBase64(p.salt));
  const pt = await decrypt(fromBase64(p.ciphertext), fromBase64(p.iv), kek);
  return new TextDecoder().decode(pt);
}

// ─── Collect ─────────────────────────────────────────────────────

export async function collect(out, passphrase) {
  fetchAll();
  const refs = listRefs();

  const rows = [];
  const report = { refs: refs.length, sessions: 0, empty: 0, failed: [], prompts: 0, words: 0 };

  for (const { ref, id } of refs) {
    const file = readRef(ref);
    if (!file) {
      report.empty++;
      continue;
    }

    let text;
    try {
      text = file.name.endsWith('.enc') ? await unseal(file.body, passphrase) : file.body;
    } catch {
      // Wrong passphrase, or a partial push. Name it rather than dropping it —
      // a silently skipped session is a session you think you have.
      report.failed.push(id);
      continue;
    }

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        row.session = id;
        rows.push(row);
        if (row.role === 'principal') {
          report.prompts++;
          report.words += row.words ?? 0;
        }
      } catch {
        /* torn line */
      }
    }
    report.sessions++;
  }

  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return report;
}

// ─── CLI ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;

  if (args.includes('--list') || !out) {
    const refs = listRefs();
    console.log(`\n${refs.length} exported session(s)\n`);
    for (const r of refs) console.log(`  ${r.sha.slice(0, 8)}  ${r.id}`);
    console.log();
    if (!out) process.exit(0);
  }

  const report = await collect(out, process.env.HOMUNCULUS_KEY);
  console.log('\nCOLLECTED');
  console.log(`  refs found      ${report.refs}`);
  console.log(`  sessions merged ${report.sessions}`);
  console.log(`  placeholders    ${report.empty}`);
  console.log(`  your prompts    ${report.prompts.toLocaleString()}`);
  console.log(`  your words      ${report.words.toLocaleString()}`);
  if (report.failed.length) {
    console.log(`\n  COULD NOT DECRYPT (${report.failed.length}) — wrong key, or pushed plaintext:`);
    for (const id of report.failed) console.log(`    ${id}`);
  }
  console.log(`\n  → ${out}\n`);
}
