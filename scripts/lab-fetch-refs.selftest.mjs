#!/usr/bin/env node
// lab-fetch-refs.selftest.mjs — the reference fetcher's routing and extraction,
// with no network.
//
// The fixtures below are trimmed from real responses fetched while writing this
// — including the two that matter most, both of which are FAILURES DRESSED AS
// SUCCESSES: ar5iv answering 200 with an "Untitled Document" stub for a paper
// it could not convert, and the arXiv Atom feed carrying the query as its own
// <title> before the paper's. Neither is detectable from a status code.

import assert from 'node:assert/strict';
import {
  urlsIn, arxivId, doiIn, wikiTitle, plan, htmlToText, atomToText, arxivAbsToText,
  openAlexToText, wikiSummaryToText, trimBibliography, clipHead, TOO_SHORT,
} from './lib/refs.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

t('urlsIn takes the address and leaves the punctuation', () => {
  assert.deepEqual(urlsIn('an energy based method like arxiv.org/abs/2006.07859.'),
    ['https://arxiv.org/abs/2006.07859']);
  assert.deepEqual(urlsIn('see (https://example.com/a) and https://example.com/b!'),
    ['https://example.com/a', 'https://example.com/b']);
  assert.deepEqual(urlsIn('a bare doi: 10.1038/nature14539 please'),
    ['https://doi.org/10.1038/nature14539']);
  assert.deepEqual(urlsIn('nothing here'), []);
});

t('urlsIn dedupes and caps', () => {
  assert.deepEqual(urlsIn('https://a.com https://a.com'), ['https://a.com']);
  assert.equal(urlsIn('https://a.com https://b.com https://c.com https://d.com').length, 3);
  assert.equal(urlsIn('https://a.com https://b.com', 1).length, 1);
});

t('arxivId reads every URL shape and keeps an explicit version', () => {
  assert.equal(arxivId('https://arxiv.org/abs/1706.03762'), '1706.03762');
  assert.equal(arxivId('http://arxiv.org/pdf/2006.07859'), '2006.07859');
  assert.equal(arxivId('https://arxiv.org/html/2401.02385v1'), '2401.02385v1');
  assert.equal(arxivId('https://example.com/paper'), null);
});

t('doiIn and wikiTitle', () => {
  assert.equal(doiIn('https://doi.org/10.1038/nature14539'), '10.1038/nature14539');
  assert.equal(doiIn('doi: 10.1145/3386569.3392417'), '10.1145/3386569.3392417');
  assert.equal(doiIn('https://example.com'), null);
  assert.equal(wikiTitle('https://en.wikipedia.org/wiki/Tetromino'), 'Tetromino');
  // Special: and Talk: pages are not articles
  assert.equal(wikiTitle('https://en.wikipedia.org/wiki/Special:Random'), null);
});

// THE LADDER. No single arXiv source covers the corpus: /html/ 404s for papers
// older than ~Dec 2023, and ar5iv silently fails on some of the rest.
t('plan walks arXiv full text first, abstracts last', () => {
  const p = plan('https://arxiv.org/abs/1706.03762');
  assert.equal(p.kind, 'paper');
  assert.deepEqual(p.tries.map((x) => x.as), ['html', 'html', 'arxivabs', 'atom']);
  assert.match(p.tries[0].url, /arxiv\.org\/html\/1706\.03762/);
  assert.match(p.tries[1].url, /ar5iv/);
  // The abs page is the same host that just answered for /html/; the export API
  // is a separate host and a separate outage, so it goes last.
  assert.match(p.tries[2].url, /^https:\/\/arxiv\.org\/abs\//);
  assert.match(p.tries[3].url, /export\.arxiv\.org/);
});

t('plan keeps a pinned version, then retries bare', () => {
  const p = plan('https://arxiv.org/abs/2401.02385v1');
  assert.deepEqual(p.tries.slice(0, 3).map((x) => x.url), [
    'https://arxiv.org/html/2401.02385v1',
    'https://arxiv.org/html/2401.02385',
    'https://ar5iv.labs.arxiv.org/html/2401.02385',
  ]);
});

t('plan routes DOIs, wikipedia and everything else', () => {
  assert.equal(plan('https://doi.org/10.1038/nature14539').tries[0].as, 'openalex');
  assert.equal(plan('https://en.wikipedia.org/wiki/Tetromino').tries[0].as, 'wikisummary');
  const page = plan('https://example.com/readme');
  assert.equal(page.kind, 'page');
  assert.deepEqual(page.tries, [{ url: 'https://example.com/readme', as: 'html' }]);
});

t('htmlToText drops machinery and decodes entities', () => {
  const out = htmlToText(`<style>a{}</style><script>x</script><p>one &amp; two</p><li>three</li>`);
  assert.equal(out, 'one & two\nthree');
  assert.equal(htmlToText('<svg><path d="M0 0"/></svg><p>after</p>'), 'after');
});

// FIXTURE FROM THE REAL FEED. The <feed> carries its own <title> — the query —
// before the paper's, so matching the whole body returns
// "arXiv Query: search_query=…" as the title of the work.
t('atomToText scopes to <entry>, not the feed', () => {
  const feed = `<feed><title>ArXiv Query: search_query=id_list:1706.03762</title>
    <entry><title>Attention Is All You Need</title>
      <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author>
      <summary>The dominant sequence transduction models…</summary></entry></feed>`;
  const out = atomToText(feed);
  assert.match(out, /TITLE: Attention Is All You Need/);
  assert.doesNotMatch(out, /search_query/);
  assert.match(out, /AUTHORS: Ashish Vaswani, Noam Shazeer/);
  assert.match(out, /\[abstract only/, 'it must say it is not the paper');
  assert.equal(atomToText('<feed><title>no entries</title></feed>'), '');
});

t('arxivAbsToText reads the meta tags, not the 42 KB of chrome', () => {
  const abs = `<html><head>
    <meta name="citation_title" content="Repulsive Curves">
    <meta name="citation_author" content="Yu, Christopher">
    <meta name="citation_author" content="Crane, Keenan">
    </head><body><div>Skip to main content</div><nav>arXiv is now an independent nonprofit!</nav>
    <blockquote class="abstract mathjax"><span class="descriptor">Abstract:</span>
    Curves play a fundamental role across computer graphics.</blockquote></body></html>`;
  const out = arxivAbsToText(abs);
  assert.match(out, /TITLE: Repulsive Curves/);
  assert.match(out, /AUTHORS: Yu, Christopher; Crane, Keenan/);
  assert.match(out, /Curves play a fundamental role/);
  assert.doesNotMatch(out, /Skip to main content|independent nonprofit/,
    'the navigation must not come with it');
  assert.doesNotMatch(out, /Abstract: *Abstract/);
  assert.equal(arxivAbsToText('<html><body>nothing</body></html>'), '');
});

t('openAlexToText rebuilds the inverted-index abstract and finds the arXiv id', () => {
  const work = {
    title: 'Deep learning',
    publication_year: 2015,
    authorships: [{ author: { display_name: 'Yann LeCun' } }],
    abstract_inverted_index: { Deep: [0], learning: [1], allows: [2], models: [3] },
    best_oa_location: { landing_page_url: 'https://arxiv.org/abs/1234.56789' },
  };
  const { text, arxiv } = openAlexToText(work);
  assert.match(text, /TITLE: Deep learning/);
  assert.match(text, /YEAR: 2015/);
  assert.match(text, /Deep learning allows models/, 'positions decide the order, not key order');
  assert.equal(arxiv, '1234.56789');
  assert.deepEqual(openAlexToText('not json'), { text: '', arxiv: null });
  assert.deepEqual(openAlexToText({ title: 'x' }).arxiv, null);
});

t('wikiSummaryToText takes the extract', () => {
  assert.match(wikiSummaryToText({ title: 'Tetromino', extract: 'A tetromino is…' }), /A tetromino is…/);
  assert.equal(wikiSummaryToText({ title: 'x' }), '');
  assert.equal(wikiSummaryToText('nope'), '');
});

// A bibliography is a third of a paper's characters and none of its ideas — for
// somebody building a web page from it. But "References" appears in prose too,
// and cutting at the first mention would be worse than not cutting at all.
t('trimBibliography cuts the tail and leaves the prose', () => {
  const body = `${'body text. '.repeat(200)}\nReferences\n${'[1] Someone et al. '.repeat(50)}`;
  const out = trimBibliography(body);
  assert.match(out, /\[bibliography trimmed\]/);
  assert.match(out, /body text\./);
  assert.doesNotMatch(out, /Someone et al/, 'the citations are what goes');
  const early = `intro\nReferences\n${'the actual paper. '.repeat(300)}`;
  assert.equal(trimBibliography(early), early, 'an early "References" is prose, not the tail');
  assert.equal(trimBibliography('no bibliography here'), 'no bibliography here');
});

t('clipHead keeps the front of a reference and says it truncated', () => {
  const out = clipHead('x'.repeat(500), 100);
  assert.ok(out.startsWith('x'.repeat(100)));
  assert.match(out, /\[truncated at 100 characters\]/);
  assert.equal(clipHead('short', 100), 'short');
});

// THE OTHER FAILURE-DRESSED-AS-SUCCESS. ar5iv answers 200 with this when its
// LaTeX conversion fails. Handing it over as the paper is worse than admitting
// the fetch failed, because nothing downstream can tell the difference.
t('an ar5iv stub is under the too-short floor', () => {
  const stub = htmlToText(`<html><head><title>[2006.07859] Untitled Document</title></head>
    <body><p>[2006.07859] Untitled Document † journal: TOG † journalvolume: X
    \\SetAlFnt \\SetAlCapFnt \\IncMargin -</p></body></html>`);
  assert.ok(stub.length < TOO_SHORT, `stub was ${stub.length} chars, floor is ${TOO_SHORT}`);
  const real = htmlToText(`<p>${'Attention is all you need. '.repeat(200)}</p>`);
  assert.ok(real.length > TOO_SHORT);
});

console.log(`\nlab-fetch-refs.selftest: ${n} checks passed`);
