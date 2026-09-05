/**
 * Known-answer tests for the rule matcher.
 *
 *   node bsky/lib/rulefeed.selftest.mjs
 *
 * A content filter fails QUIETLY: a boundary bug just means a feed with some
 * wrong posts in it, which reads as "the algorithm is a bit off" rather than as
 * a bug. So every rule of the matcher gets a case here, especially the negative
 * ones — what must NOT match is the half that never gets noticed.
 */
import { compile, linksOf, tagsOf, toText, fromText, PRESETS } from './rulefeed.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const post = (text, extra = {}) => ({ text, ...extra });
const link = (uri) => ({ facets: [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri }] }] });

console.log('word boundaries — the bug that quietly poisons a feed');
{
  const m = compile({ any: ['osf', 'arxiv'] });
  check('"osf" matches "on osf today"',        m.test(post('on osf today')), true);
  check('"osf" does NOT match "crossfade"',    m.test(post('a nice crossfade')), false);
  check('"osf" does NOT match "osfjkl"',       m.test(post('osfjkl')), false);
  check('case-insensitive: arXiv',             m.test(post('up on arXiv now')), true);
  check('"arxiv" does NOT match "arxivist"',   m.test(post('a noted arxivist')), false);
}

console.log('\nphrases');
{
  const m = compile({ any: ['"new paper"'] });
  check('phrase matches',                      m.test(post('our new paper is out')), true);
  check('phrase tolerates extra whitespace',   m.test(post('a new  paper today')), true);
  check('words apart do NOT match',            m.test(post('new results, old paper')), false);
  check('phrase is bounded: "renew paper"',    m.test(post('renew paper subscription')), false);
}

console.log('\nlink domains — facets, embeds, and raw text');
{
  const m = compile({ domains: ['arxiv.org', 'doi.org'] });
  check('facet link',        m.test(post('look', link('https://arxiv.org/abs/2401.00001'))), true);
  check('external embed',    m.test(post('look', { embed: { external: { uri: 'https://doi.org/10.1/x' } } })), true);
  check('media external',    m.test(post('look', { embed: { media: { external: { uri: 'https://arxiv.org/a' } } } })), true);
  check('bare url in text',  m.test(post('see https://arxiv.org/abs/2401.1 for more')), true);
  check('subdomain matches', m.test(post('x', link('https://export.arxiv.org/abs/1'))), true);
  check('www. is stripped',  m.test(post('x', link('https://www.arxiv.org/abs/1'))), true);
  check('LOOKALIKE host does NOT match', m.test(post('x', link('https://notarxiv.org/abs/1'))), false);
  check('domain in a PATH does not match', m.test(post('x', link('https://evil.com/arxiv.org/x'))), false);
  check('unparseable url is ignored', m.test(post('x', link('not a url'))), false);
}

console.log('\nDOI');
{
  const m = compile({ doi: true });
  check('doi in text',   m.test(post('10.1038/s41586-024-07123-4 is the one')), true);
  check('doi in a link', m.test(post('here', link('https://doi.org/10.1101/2024.01.01.573817'))), true);
  check('a version number is not a doi', m.test(post('running 10.15/2 now')), false);
  check('plain number is not a doi',     m.test(post('it cost 10.99 dollars')), false);
}

console.log('\nhashtags');
{
  const m = compile({ tags: ['openscience'] });
  check('tags field',   m.test(post('x', { tags: ['OpenScience'] })), true);
  check('tag facet',    m.test(post('x', { facets: [{ features: [{ tag: 'openscience' }] }] })), true);
  check('leading # tolerated', m.test(post('x', { tags: ['#openscience'] })), true);
  check('other tag does not match', m.test(post('x', { tags: ['cooking'] })), false);
}

console.log('\nvetoes, languages, length');
{
  const m = compile({ any: ['preprint'], none: ['crypto'] });
  check('veto beats a match', m.test(post('preprint about crypto')), false);
  check('no veto term passes', m.test(post('preprint about mice')), true);

  const l = compile({ any: ['preprint'], langs: ['en'] });
  check('lang en passes',       l.test(post('preprint', { langs: ['en'] })), true);
  check('lang en-GB passes',    l.test(post('preprint', { langs: ['en-GB'] })), true);
  check('lang ja rejected',     l.test(post('preprint', { langs: ['ja'] })), false);
  check('MISSING langs passes', l.test(post('preprint')), true);

  const c = compile({ any: ['preprint'], minChars: 20 });
  check('short post rejected',  c.test(post('preprint')), false);
  check('short WITH embed kept', c.test(post('preprint', { embed: { external: { uri: 'https://x.com' } } })), true);
}

console.log('\nwhy() explains itself');
{
  const m = compile({ any: ['preprint'], domains: ['arxiv.org'], doi: true });
  const hits = m.why(post('new preprint 10.1038/abc', link('https://arxiv.org/abs/1')));
  check('reports three reasons', hits.length, 3);
  check('names the domain', hits.some((h) => h === 'link arxiv.org'), true);
  check('names the doi', hits.includes('doi'), true);
}

console.log('\nextraction helpers');
{
  check('linksOf dedups nothing but finds all',
    linksOf(post('see https://a.com/1', link('https://b.com/2'))).length, 2);
  check('tagsOf lowercases and strips #',
    tagsOf(post('x', { tags: ['#Open', 'Sci'] })), ['open', 'sci']);
}

console.log('\nthe editable text form round-trips');
{
  const r = { id: 'x', label: 'x', any: ['preprint', '"new paper"'], domains: ['arxiv.org'],
              tags: ['openscience'], none: ['crypto'], doi: true };
  const back = fromText(toText(r), { id: 'x', label: 'x' });
  check('any',     back.any, r.any);
  check('domains', back.domains, r.domains);
  check('tags',    back.tags, r.tags);
  check('none',    back.none, r.none);
  check('doi',     back.doi, true);
  check('comments and blank lines ignored',
    fromText('// note\n\npreprint\n').any, ['preprint']);
}

console.log('\nthe shipped preset behaves');
{
  const m = compile(PRESETS[0]);
  const yes = [
    post('Our new paper is out in Nature today, very proud', link('https://nature.com/articles/x')),
    post('preprint up on bioRxiv, comments welcome — it is about mitochondria'),
    post('This dataset is finally reproducible, methodology written up properly'),
    post('long enough text about a study here', link('https://doi.org/10.1101/2024.01.01.1')),
  ];
  const no = [
    post('new paper towels arrived'),                 // "new paper" IS a phrase hit
    post('gm'),                                        // too short
    post('preprint of my crypto whitepaper is up now, big things'),  // vetoed
    post('just published my sourdough recipe blog'),   // "just published" IS a hit
  ];
  yes.forEach((p, i) => check(`matches sample ${i + 1}`, m.test(p), true));
  check('too-short post rejected', m.test(no[1]), false);
  check('crypto veto works', m.test(no[2]), false);
  // Honest about the false positives a keyword rule WILL have:
  console.log(`     note: "${no[0].text}" -> ${m.test(no[0]) ? 'MATCHES (a known false positive)' : 'no match'}`);
  console.log(`     note: "${no[3].text}" -> ${m.test(no[3]) ? 'MATCHES (a known false positive)' : 'no match'}`);
}

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nrulefeed selftest passed');
