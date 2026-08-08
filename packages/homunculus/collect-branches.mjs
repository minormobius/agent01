/**
 * Collect the recovery-pass transcripts off every feature branch into one
 * corpus. Run during merge-candidate production, while the repo is private.
 *
 *   node collect-branches.mjs --out ~/sessions.jsonl
 *   node collect-branches.mjs --list          # which branches carry what
 *
 * Each session committed its transcript to homunculus/inbox/<id>.json on its
 * own branch. This fetches all of them, flattens to one turn-per-line JSONL,
 * and reports what it found. It does not delete anything — removal is a
 * separate, deliberate step gated by assert-public-safe.mjs, because deleting
 * a branch's transcript is what makes the repo safe to publish and should not
 * be a silent side effect of collection.
 *
 * `--out` must be outside the repo.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { branchesWithInbox, readInbox } from './branch-corpus.mjs';

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 2 ** 30 });

/**
 * Flatten one inbox file's `{ session, turns:[{role,ts,text}] }` payload into
 * corpus rows. Tolerates the prompts-only `{ messages }` shape too, matching
 * ingest-prompts.mjs.
 */
export function rowsFrom(data, fallbackSession) {
  const session = data?.session ?? fallbackSession;
  const turns = Array.isArray(data) ? data : data?.turns ?? data?.messages ?? [];
  const rows = [];
  for (const t of turns) {
    const text = typeof t === 'string' ? t : t?.text ?? t?.prompt ?? '';
    if (!text.trim()) continue;
    const raw = typeof t === 'string' ? 'principal' : String(t?.role ?? 'principal').toLowerCase();
    const role = ['claude', 'assistant', 'ai'].includes(raw) ? 'assistant' : 'principal';
    rows.push({ session, ts: t?.ts ?? null, role, words: text.trim().split(/\s+/).length, text });
  }
  return rows;
}

export function collect(out) {
  // Bring every branch's tip local so ls-tree/show read from cache.
  git(['fetch', '--force', 'origin', 'refs/heads/*:refs/remotes/origin/*']);

  const carrying = branchesWithInbox();
  const rows = [];
  const report = { branches: carrying.length, files: 0, principal: 0, assistant: 0, errors: [] };
  const seen = new Set();

  for (const { branch } of carrying) {
    for (const entry of readInbox(branch)) {
      report.files++;
      if (entry.error) {
        report.errors.push(`${branch}:${entry.path}`);
        continue;
      }
      const session = entry.path.split('/').pop().replace(/\.json$/, '');
      for (const row of rowsFrom(entry.data, session)) {
        const key = `${row.session} ${row.role} ${row.ts} ${row.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        report[row.role === 'assistant' ? 'assistant' : 'principal']++;
      }
    }
  }

  rows.sort((a, b) => String(a.session).localeCompare(String(b.session)) || String(a.ts).localeCompare(String(b.ts)));
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    git(['fetch', '--force', 'origin', 'refs/heads/*:refs/remotes/origin/*']);
    const carrying = branchesWithInbox();
    console.log(`\n${carrying.length} branch(es) carry transcripts:\n`);
    for (const { branch, files } of carrying) console.log(`  ${branch}  (${files.length})`);
    console.log();
    process.exit(0);
  }

  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  if (!out) {
    console.error('usage: node collect-branches.mjs --out <file-outside-repo> | --list');
    process.exit(1);
  }

  const r = collect(out);
  console.log('\nCOLLECTED FROM BRANCHES');
  console.log(`  branches        ${r.branches}`);
  console.log(`  files           ${r.files}`);
  console.log(`  your turns      ${r.principal.toLocaleString()}`);
  console.log(`  context turns   ${r.assistant.toLocaleString()}`);
  if (r.errors.length) {
    console.log(`\n  UNREADABLE (${r.errors.length}):`);
    for (const e of r.errors) console.log(`    ${e}`);
  }
  console.log(`\n  → ${out}`);
  console.log(`  Now run assert-public-safe.mjs before flipping the repo public.\n`);
}
