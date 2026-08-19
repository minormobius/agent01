// node scripts/lib/chat.selftest.mjs
//
// A dossier is prose that does not fit in a DM, so the chunker is the whole
// deliverable on the sending side: get it wrong and the reader gets sentences
// that stop mid-word, or a message the server rejects for being 1,001
// graphemes. The network half is not tested — it is four fetches.

import { chunk, splitParagraphs, recordEmbed, MAX_MESSAGE_GRAPHEMES } from './chat.mjs';
import { graphemes } from './bsky.mjs';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
const within = (parts, limit = MAX_MESSAGE_GRAPHEMES) => parts.every((p) => graphemes(p) <= limit);

console.log('— the limit is never exceeded, whatever the input —');
{
  ck(MAX_MESSAGE_GRAPHEMES === 1000, 'the limit is 1,000 graphemes (chat.bsky.convo.defs#messageInput)');

  const prose = Array.from({ length: 40 }, (_, i) =>
    `Paragraph ${i}. ${'word '.repeat(30)}`).join('\n\n');
  const parts = chunk(prose);
  ck(parts.length > 1, `long prose splits into ${parts.length} messages`);
  ck(within(parts), 'and every one is inside the limit');
  ck(parts.join(' ').includes('Paragraph 39'), 'nothing is dropped off the end');

  // The pathological cases that make a naive chunker loop or overflow.
  ck(within(chunk('x'.repeat(5000))), 'one unbroken 5,000-character word still ships');
  ck(chunk('').length === 0, 'empty text is no messages, not one empty one');
  ck(chunk('   \n\n  ').length === 0, 'whitespace is empty');
  ck(within(chunk('🧑‍🚀'.repeat(600))), 'a ZWJ emoji wall is measured as graphemes, not UTF-16 units');
}

console.log('— it breaks at the largest unit that fits —');
{
  const a = 'A'.repeat(400), b = 'B'.repeat(400), c = 'C'.repeat(400);
  const parts = chunk(`${a}\n\n${b}\n\n${c}`);
  ck(parts.length === 2, 'two 400-char paragraphs pack together, the third starts a message');
  ck(parts[0] === `${a}\n\n${b}` && parts[1] === c, 'and the paragraph boundary is where it cut');

  // A paragraph too big for one message falls to sentences rather than to a
  // blind slice — this is the difference between readable and mid-word.
  const sentences = chunk(`${'Short sentence here. '.repeat(80)}`);
  ck(within(sentences), 'a long paragraph is cut into messages');
  ck(sentences.every((p) => /(\.|\bhere)$/.test(p.trim())),
    'and every cut lands at a sentence end, never mid-word');
}

console.log('— numbering reserves its own width —');
{
  const prose = 'word '.repeat(1200);
  const parts = chunk(prose, { prefix: (i, n) => `${i}/${n} ` });
  ck(parts.length > 1, `numbered into ${parts.length} messages`);
  ck(within(parts), 'THE PREFIX IS INSIDE THE LIMIT — "3/7 " must not push a message to 1,003');
  ck(parts[0].startsWith('1/'), 'the first is numbered 1');
  ck(parts[parts.length - 1].startsWith(`${parts.length}/${parts.length} `),
    'and the last says n/n — the count matches the packing it produced');

  ck(chunk('short', { prefix: (i, n) => `${i}/${n} ` })[0] === 'short',
    'a single message is not numbered — "1/1" on one message is noise');
}

console.log('— paragraphs —');
{
  ck(splitParagraphs('a\n\nb\n\n\nc').length === 3, 'blank lines separate paragraphs');
  ck(splitParagraphs('a\nb').length === 1, 'a single newline does not');
  ck(splitParagraphs('a\r\n\r\nb').length === 2, 'CRLF counts too');
  ck(splitParagraphs(null).length === 0, 'null is no paragraphs, not a crash');
}

console.log('— the record embed, which is what makes citations affordable —');
{
  const e = recordEmbed('at://did:plc:x/app.bsky.feed.post/abc', 'bafy123');
  ck(e.$type === 'app.bsky.embed.record', 'it is a record embed');
  ck(e.record.uri.endsWith('/abc') && e.record.cid === 'bafy123', 'strong ref: uri AND cid');
  ck(threw(() => recordEmbed('at://x', null)), 'a missing cid throws rather than shipping a broken quote');
  ck(threw(() => recordEmbed(null, 'bafy')), 'so does a missing uri');
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);
