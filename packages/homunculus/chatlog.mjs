/**
 * Claude data-export ingester — turns a claude.ai conversation export into
 * corpus JSONL.
 *
 *   node chatlog.mjs export.zip --inspect        # report what's in there
 *   node chatlog.mjs export.zip --out chats.jsonl
 *   node chatlog.mjs conversations.json --out chats.jsonl
 *
 * This is the highest-value corpus a heavy Claude user has: every prompt they
 * ever typed, already paired with a response. Branch names preserved about
 * four words per session; this preserves the whole exchange.
 *
 * ── Why this file detects rather than assumes ──
 *
 * Anthropic's help centre documents how to *run* an export but not the schema
 * of what comes back, and the format has no compatibility promise. Hard-coding
 * `chat_messages[].sender` would work until it silently didn't — and a corpus
 * builder that silently yields nothing is the worst failure mode here, because
 * an empty JSONL looks exactly like a quiet success.
 *
 * So: `detectShape` finds the message array, the role field and the text
 * location by inspection, `--inspect` prints what it found before you trust
 * it, and extraction refuses to write a file when it recognises nothing.
 */

import { execFileSync } from 'node:child_process';
import { createWriteStream, readFileSync } from 'node:fs';

// Candidate field names, most likely first. Extend rather than replace.
const MESSAGE_KEYS = ['chat_messages', 'messages', 'turns', 'chatMessages'];
const ROLE_KEYS = ['sender', 'role', 'author'];
const TEXT_KEYS = ['text', 'content', 'body'];
const TIME_KEYS = ['created_at', 'createdAt', 'timestamp', 'time'];
const TITLE_KEYS = ['name', 'title', 'summary'];

const HUMAN = new Set(['human', 'user', 'you']);
const ASSISTANT = new Set(['assistant', 'claude', 'ai', 'model', 'bot']);

// ─── Loading ─────────────────────────────────────────────────────

/**
 * Read the export. Accepts the zip Anthropic emails, or a conversations.json
 * already unpacked from it.
 */
export function loadExport(path) {
  if (!path.endsWith('.zip')) return JSON.parse(readFileSync(path, 'utf8'));

  // `unzip -l` first so we can name the member we pull, rather than guessing.
  const listing = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const member =
    listing.find((f) => /(^|\/)conversations\.json$/i.test(f)) ??
    listing.find((f) => f.endsWith('.json') && /conversation/i.test(f));

  if (!member) {
    throw new Error(
      `No conversations.json in ${path}. Members:\n  ${listing.join('\n  ')}`
    );
  }

  // maxBuffer: a heavy user's export runs to hundreds of megabytes.
  const raw = execFileSync('unzip', ['-p', path, member], {
    encoding: 'utf8',
    maxBuffer: 2 ** 31 - 1,
  });
  return JSON.parse(raw);
}

// ─── Shape detection ─────────────────────────────────────────────

const firstKey = (obj, candidates, test = () => true) =>
  candidates.find((k) => obj?.[k] !== undefined && test(obj[k])) ?? null;

/**
 * Work out how this particular export is laid out.
 * Returns the field mapping plus what was sampled to decide it.
 */
export function detectShape(data) {
  // Conversations may be the top-level array, or nested under a key.
  let conversations = null;
  let root = null;
  if (Array.isArray(data)) {
    conversations = data;
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        conversations = v;
        root = k;
        break;
      }
    }
  }
  if (!conversations?.length) return { ok: false, reason: 'no conversation array found' };

  // Sample a conversation that actually has messages — the first one may be
  // an empty stub, and deciding the schema from it would find nothing.
  const messageKey =
    MESSAGE_KEYS.find((k) => conversations.some((c) => Array.isArray(c?.[k]) && c[k].length)) ??
    null;
  if (!messageKey) return { ok: false, reason: 'no message array on any conversation', root };

  const sample = conversations.find((c) => c[messageKey]?.length);
  const msg = sample[messageKey][0];

  const roleKey = firstKey(msg, ROLE_KEYS, (v) => typeof v === 'string');
  const titleKey = firstKey(sample, TITLE_KEYS, (v) => typeof v === 'string');
  const timeKey = firstKey(msg, TIME_KEYS, (v) => typeof v === 'string');

  // Text is either a plain string or a list of content blocks.
  const textKey = firstKey(msg, TEXT_KEYS, (v) => typeof v === 'string' && v.length);
  const blockKey = firstKey(msg, TEXT_KEYS, (v) => Array.isArray(v));

  const roles = new Set();
  for (const c of conversations.slice(0, 200)) {
    for (const m of c?.[messageKey] ?? []) if (roleKey && m?.[roleKey]) roles.add(m[roleKey]);
  }

  return {
    ok: Boolean(roleKey && (textKey || blockKey)),
    reason: roleKey ? (textKey || blockKey ? '' : 'no text field') : 'no role field',
    root,
    conversations: conversations.length,
    messageKey,
    roleKey,
    textKey,
    blockKey,
    titleKey,
    timeKey,
    roles: [...roles],
  };
}

/** Pull the text out of a message, whichever way this export stores it. */
function textOf(msg, shape) {
  if (shape.textKey && typeof msg[shape.textKey] === 'string' && msg[shape.textKey]) {
    return msg[shape.textKey];
  }
  const blocks = shape.blockKey ? msg[shape.blockKey] : null;
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((b) => (typeof b === 'string' ? b : b?.text ?? ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Normalise whatever this export calls the speaker. */
function roleOf(msg, shape) {
  const raw = String(msg?.[shape.roleKey] ?? '').toLowerCase();
  if (HUMAN.has(raw)) return 'human';
  if (ASSISTANT.has(raw)) return 'assistant';
  return raw || 'unknown';
}

// ─── Extraction ──────────────────────────────────────────────────

/**
 * Flatten the export to one JSONL row per turn.
 *
 * Turns are kept rather than pre-paired: a conversation is a chain, and which
 * slice becomes a training example is the mixture builder's decision, not
 * this one's. `conv` and `i` preserve enough to reassemble any of them.
 */
export async function extract(data, out) {
  const shape = detectShape(data);
  if (!shape.ok) throw new Error(`Unrecognised export shape: ${shape.reason}`);

  const conversations = shape.root ? data[shape.root] : data;
  const sink = createWriteStream(out, { flags: 'w' });

  const stats = { conversations: 0, turns: 0, human: 0, assistant: 0, humanWords: 0, empty: 0 };

  for (const conv of conversations) {
    const messages = conv?.[shape.messageKey];
    if (!Array.isArray(messages) || !messages.length) continue;
    stats.conversations++;

    const title = shape.titleKey ? conv[shape.titleKey] ?? null : null;
    let i = 0;

    for (const msg of messages) {
      const text = textOf(msg, shape);
      if (!text) {
        stats.empty++;
        continue;
      }
      const role = roleOf(msg, shape);
      const words = text.trim().split(/\s+/).filter(Boolean).length;

      if (role === 'human') {
        stats.human++;
        stats.humanWords += words;
      } else if (role === 'assistant') stats.assistant++;

      sink.write(
        JSON.stringify({
          conv: conv.uuid ?? conv.id ?? null,
          title,
          created: shape.timeKey ? msg[shape.timeKey] ?? null : null,
          i: i++,
          role,
          words,
          text,
        }) + '\n'
      );
      stats.turns++;
    }
  }

  // Await the flush: callers read this file immediately, and an unawaited
  // end() hands them a partial or absent one.
  await new Promise((resolve) => sink.end(resolve));
  return { shape, stats };
}

// ─── Report ──────────────────────────────────────────────────────

export function describe(shape) {
  const lines = ['\nDETECTED SHAPE'];
  const say = (k, v) => lines.push(`  ${k.padEnd(18)} ${v}`);
  if (!shape.ok) {
    say('status', `UNRECOGNISED — ${shape.reason}`);
    return lines.join('\n') + '\n';
  }
  say('conversations', shape.conversations.toLocaleString());
  say('nested under', shape.root ?? '(top-level array)');
  say('messages key', shape.messageKey);
  say('role key', shape.roleKey);
  say('text from', shape.textKey ? `${shape.textKey} (string)` : `${shape.blockKey}[] (blocks)`);
  say('title key', shape.titleKey ?? '(none)');
  say('time key', shape.timeKey ?? '(none)');
  say('roles seen', shape.roles.join(', '));
  return lines.join('\n') + '\n';
}

// ─── CLI ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;

  if (!path) {
    console.error('usage: node chatlog.mjs <export.zip|conversations.json> [--inspect] [--out FILE]');
    process.exit(1);
  }

  const data = loadExport(path);

  if (args.includes('--inspect') || !out) {
    console.log(describe(detectShape(data)));
    if (!out) process.exit(0);
  }

  const { shape, stats } = await extract(data, out);
  console.log(describe(shape));
  console.log('EXTRACTED');
  console.log(`  conversations      ${stats.conversations.toLocaleString()}`);
  console.log(`  turns              ${stats.turns.toLocaleString()}`);
  console.log(`  your turns         ${stats.human.toLocaleString()}`);
  console.log(`  your words         ${stats.humanWords.toLocaleString()}`);
  console.log(`  assistant turns    ${stats.assistant.toLocaleString()}`);
  console.log(`  empty (skipped)    ${stats.empty.toLocaleString()}`);
  console.log(`\n  → ${out}\n`);
}
