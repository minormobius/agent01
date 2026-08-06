/**
 * Known-answer selftest for the census. No network — the fixture is a
 * hand-counted corpus exercising every category the census separates:
 * substantive prose, a link-only post, a throwaway, a reply to someone else,
 * a self-thread continuation, and a reply whose parent has vanished.
 *
 *   node homunculus.selftest.mjs
 */

import { census, verdict } from './census.mjs';

const ROWS = [
  // 13 words of prose, top-level. Root of the one self-thread.
  {
    uri: 'at://self/p/1', author: 'did:self', replyParent: null, createdAt: '2025-01-01T00:00:00Z',
    text: 'This is a genuinely substantive post about deployment pipelines and their failure modes',
  },
  // Nothing but a URL — zero prose once stripped.
  {
    uri: 'at://self/p/2', author: 'did:self', replyParent: null, createdAt: '2025-02-01T00:00:00Z',
    text: 'https://example.com/thing',
  },
  // One word. Real utterance, no recoverable voice.
  {
    uri: 'at://self/p/3', author: 'did:self', replyParent: null, createdAt: '2025-03-01T00:00:00Z',
    text: 'lol',
  },
  // The only trainable pair: reply to another person, parent hydrated,
  // 11 words of prose after the leading mention is stripped.
  {
    uri: 'at://self/p/4', author: 'did:self', replyParent: 'at://other/p/9', createdAt: '2026-01-01T00:00:00Z',
    text: '@someone I think the second option is better because it fails loudly',
    parentText: 'Which of these two should we ship?', parentAuthor: 'did:other', parentIsSelf: false,
  },
  // Self-reply: hydrated, but a continued thought rather than a response.
  {
    uri: 'at://self/p/5', author: 'did:self', replyParent: 'at://self/p/1', createdAt: '2025-01-01T00:05:00Z',
    text: 'Continuing the thought: the failure mode nobody plans for is the silent one',
    parentText: 'This is a genuinely substantive post about deployment pipelines and their failure modes',
    parentAuthor: 'did:self', parentIsSelf: true,
  },
  // Parent deleted — must be counted as missing, not silently dropped.
  {
    uri: 'at://self/p/6', author: 'did:self', replyParent: 'at://other/p/gone', createdAt: '2026-02-01T00:00:00Z',
    text: 'Answering a ghost post that no longer exists anywhere', parentMissing: true,
  },
];

const EXPECTED = {
  posts: 6,
  substantive: 4,       // p1, p4, p5, p6
  linkOnly: 1,          // p2
  totalWords: 47,       // 13 + 0 + 1 + 11 + 13 + 9
  medianWords: 10,      // sorted [0,1,9,11,13,13]
  meanWords: 7.8,
  replies: 3,           // p4, p5, p6
  hydrated: 2,          // p4, p5
  parentsMissing: 1,    // p6
  pairs: 1,             // p4 only — p5 is a self-reply
  pairWords: 11,
  selfThreads: 1,       // p1 → p5
  longestThread: 2,
  longestThreadWords: 26,
  threadWords: 26,
};

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(20)} ${actual}${ok ? '' : ` (expected ${expected})`}`);
};

console.log('\nhomunculus census — known answers');
const c = census(ROWS);
for (const [key, want] of Object.entries(EXPECTED)) check(key, c[key], want);

console.log('\nderived');
const years = Object.fromEntries(c.perYear);
check('2025 posts', years['2025'], 4);
check('2026 posts', years['2026'], 2);
check('vocab non-empty', c.vocab > 0, true);
check('tokens estimated', c.estTokens > 0, true);

console.log('\nverdict thresholds');
const tiny = verdict(c).join(' ');
check('flags tiny corpus', tiny.includes('Too small to finetune'), true);
check('flags thin dialogue', tiny.includes('voice mimicry only'), true);
check('flags no long form', tiny.includes('cannot train essay generation'), true);
check('flags prose-poor', tiny.includes('teach it to post links'), false); // 4/6 carry prose

const big = verdict({ ...c, estTokens: 5_000_000, pairs: 20_000, longestThreadWords: 900, substantive: 6 }).join(' ');
check('scales up verdict', big.includes('serious LoRA'), true);
check('weights dialogue up', big.includes('Weight it up'), true);

console.log(failures ? `\n${failures} failure(s)\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
