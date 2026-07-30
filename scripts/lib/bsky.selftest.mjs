// node scripts/lib/bsky.selftest.mjs
// Facet offsets are BYTES, not characters, and getting that wrong produces a post
// that looks right locally and renders a link over the wrong words in the app —
// so the pure half of the posting path is tested and the network half is not.

import { facets, graphemes } from './bsky.mjs';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('— byte offsets, not character offsets —');
{
  const text = 'see arxiv.org/abs/2607.25274 for the paper';
  const [f] = facets(text, { 'arxiv.org/abs/2607.25274': 'https://arxiv.org/abs/2607.25274' });
  ck(f.index.byteStart === 4, 'ascii offset is the character offset');
  ck(Buffer.from(text, 'utf8').subarray(f.index.byteStart, f.index.byteEnd).toString() === 'arxiv.org/abs/2607.25274',
    'the slice covers exactly the link text');

  // "é" is 2 bytes; an offset computed on the JS string would be 1 short here,
  // which is precisely the bug this test exists for.
  const accented = 'Erdős problem — arxiv.org/abs/2607.25928 fell today';
  const [g] = facets(accented, { 'arxiv.org/abs/2607.25928': 'https://arxiv.org/abs/2607.25928' });
  ck(g.index.byteStart === Buffer.from(accented, 'utf8').indexOf('arxiv'), 'non-ascii prefix shifts the byte offset');
  ck(g.index.byteStart > accented.indexOf('arxiv'), 'and the byte offset is LARGER than the string index');
  ck(Buffer.from(accented, 'utf8').subarray(g.index.byteStart, g.index.byteEnd).toString() === 'arxiv.org/abs/2607.25928',
    'the slice is still exactly the link');
}

console.log('— an ambiguous or missing target is an error, never a guess —');
{
  ck(threw(() => facets('a b', { 'nope': 'https://x' })), 'a target that is absent throws');
  ck(threw(() => facets('link link', { 'link': 'https://x' })), 'a target appearing twice throws rather than picking one');
}

console.log('— ordering and mentions —');
{
  const text = 'by @minormobius.bsky.social — arxiv.org/abs/2607.25677';
  const out = facets(text,
    { 'arxiv.org/abs/2607.25677': 'https://arxiv.org/abs/2607.25677' },
    { '@minormobius.bsky.social': 'did:plc:example' });
  ck(out.length === 2, 'links and mentions both emitted');
  ck(out[0].index.byteStart < out[1].index.byteStart, 'facets are sorted by position');
  ck(out[0].features[0].$type === 'app.bsky.richtext.facet#mention', 'the mention comes first here');
  ck(out[1].features[0].$type === 'app.bsky.richtext.facet#link', 'and the link second');
  ck(facets('nothing to mark').length === 0, 'no targets, no facets');
}

console.log('— graphemes, because that is what the 300 limit counts —');
{
  ck(graphemes('abc') === 3, 'ascii');
  ck(graphemes('Erdős') === 5, 'a precomposed accent is one grapheme');
  const family = '👨‍👩‍👧‍👦';
  ck(graphemes(family) <= 4, `a ZWJ family counts as ${graphemes(family)}, not ${family.length} UTF-16 units`);
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);
