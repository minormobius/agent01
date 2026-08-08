/**
 * Ingest the per-session prompt files collected by hand.
 *
 *   node ingest-prompts.mjs ~/Downloads/prompts --out prompts.jsonl
 *
 * Each input is one `my-prompts.json` produced inside a resumed session and
 * saved off by the principal — `{ session, messages: [{ ts, text }] }`.
 *
 * ── Why collection is manual ──
 *
 * The first design had each session encrypt its transcript and push it to a
 * remote ref through git plumbing that left no trace in the working tree.
 * That is indistinguishable from data exfiltration — fetch remote code, read
 * local files, encrypt, egress, hide the evidence — and it was correctly
 * flagged as a security risk. The encryption made it worse rather than safer:
 * encrypting harvested data before it leaves is the strongest signal in that
 * whole pattern.
 *
 * So nothing here reaches the network, and no session pushes anything. A
 * session prints or hands over the principal's own messages; the principal
 * saves the file; this merges what they saved. Slower, and legible at every
 * step, which is the point.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;

const PRINCIPAL = new Set(['me', 'human', 'user', 'principal']);
const ASSISTANT = new Set(['claude', 'assistant', 'ai']);

/**
 * Both sides are kept, and this is the field that decides what happens to
 * them. The exchange is 25:1 assistant-to-principal by word count in a real
 * session — train on it flat and you get a model of the assistant, not of the
 * principal. The assistant turns are conditioning context; loss is masked to
 * the principal's turns at training time.
 *
 * A prompt in isolation is also nearly information-free here: most of them are
 * reactions ("just download the car instead of paging") that mean nothing
 * without the turn they answer. Same reason the Bluesky harvester hydrates
 * reply parents.
 */
function roleOf(raw) {
  const r = String(raw ?? 'principal').toLowerCase();
  if (ASSISTANT.has(r)) return 'assistant';
  if (PRINCIPAL.has(r)) return 'principal';
  return r;
}

/**
 * Merge a directory of per-session prompt files into one JSONL.
 *
 * Tolerant of the shapes a hand-collected pile actually arrives in: the
 * wrapper object, a bare array of messages, and `text`/`prompt` either way.
 * Duplicates are dropped on (session, timestamp, text) — re-saving the same
 * session twice is the likeliest operator slip across ~289 of these.
 */
export function ingest(dir, out) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'));

  const rows = [];
  const seen = new Set();
  const report = {
    files: files.length, sessions: 0, prompts: 0, words: 0,
    replies: 0, replyWords: 0, duplicates: 0, bad: [],
  };

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch {
      report.bad.push(file); // Named, not skipped silently.
      continue;
    }

    // `turns` is the both-sides shape; `messages` the earlier prompts-only one.
    const messages = Array.isArray(parsed) ? parsed : parsed?.turns ?? parsed?.messages;
    if (!Array.isArray(messages)) {
      report.bad.push(file);
      continue;
    }

    const session = parsed?.session ?? file.replace(/\.jsonl?$/, '');
    let kept = 0;

    for (const msg of messages) {
      const text = typeof msg === 'string' ? msg : msg?.text ?? msg?.prompt ?? '';
      if (!text.trim()) continue;

      // A bare string in a bare array is the prompts-only shape: the
      // principal, by construction.
      const role = typeof msg === 'string' ? 'principal' : roleOf(msg?.role);

      const key = `${session} ${role} ${msg?.ts ?? ''} ${text}`;
      if (seen.has(key)) {
        report.duplicates++;
        continue;
      }
      seen.add(key);

      const w = words(text);
      rows.push({ session, ts: msg?.ts ?? null, role, words: w, text });
      if (role === 'principal') {
        report.prompts++;
        report.words += w;
      } else {
        report.replies++;
        report.replyWords += w;
      }
      kept++;
    }
    if (kept) report.sessions++;
  }

  rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return report;
}

// ─── CLI ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;

  if (!dir || !out) {
    console.error('usage: node ingest-prompts.mjs <dir-of-saved-files> --out prompts.jsonl');
    process.exit(1);
  }
  if (!statSync(dir).isDirectory()) {
    console.error(`${dir} is not a directory`);
    process.exit(1);
  }

  const r = ingest(dir, out);
  console.log('\nINGESTED');
  console.log(`  files read      ${r.files}`);
  console.log(`  sessions        ${r.sessions}`);
  console.log(`  your prompts    ${r.prompts.toLocaleString()}`);
  console.log(`  your words      ${r.words.toLocaleString()}`);
  console.log(`  context turns   ${r.replies.toLocaleString()}`);
  console.log(`  context words   ${r.replyWords.toLocaleString()}`);
  if (r.words) {
    console.log(`  ratio           ${(r.replyWords / r.words).toFixed(1)}:1 assistant:you` +
      ' — mask loss to your turns');
  }
  console.log(`  duplicates      ${r.duplicates}`);
  if (r.bad.length) {
    console.log(`\n  UNREADABLE (${r.bad.length}) — re-save these:`);
    for (const f of r.bad) console.log(`    ${f}`);
  }
  console.log(`\n  → ${out}\n`);
}
