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

console.log('\nprefix terms — without these an exclusion list leaks');
{
  const m = compile({ any: ['vaccin*', 'epidemiolog*'] });
  check('vaccin* -> vaccine',      m.test(post('a vaccine study')), true);
  check('vaccin* -> vaccines',     m.test(post('about vaccines')), true);
  check('vaccin* -> vaccination',  m.test(post('vaccination rates')), true);
  check('epidemiolog* -> epidemiology',   m.test(post('epidemiology of it')), true);
  check('epidemiolog* -> epidemiological', m.test(post('epidemiological data')), true);
  check('prefix is still left-bounded', m.test(post('revaccination')), false);
  check('vaccin* does NOT match vacuum', m.test(post('a vacuum chamber')), false);

  const plain = compile({ any: ['vaccine'] });
  check('THE GAP: plain "vaccine" misses "vaccines"', plain.test(post('about vaccines')), false);

  check('a "quoted*" phrase keeps its star literal',
    compile({ any: ['"star *"'] }).test(post('a star * here')), true);
}

console.log('\nnegative domains — an outlet gives a post away');
{
  const m = compile({ any: ['study'], noneDomains: ['politico.com', 'cdc.gov'] });
  check('clean link passes', m.test(post('a study here', link('https://nature.com/x'))), true);
  check('vetoed outlet blocks', m.test(post('a study here', link('https://politico.com/x'))), false);
  check('subdomain of a vetoed outlet blocks',
    m.test(post('a study here', link('https://www.cdc.gov/x'))), false);
  check('lookalike outlet does NOT block',
    m.test(post('a study here', link('https://notpolitico.com/x'))), true);
  check('vetoed outlet in a raw url blocks',
    m.test(post('read https://politico.com/abc for a study')), false);
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

console.log('\nweak terms need a link — the biggest precision win, from live data');
{
  const m = compile({ any: ['arxiv'], weak: ['"new paper"'] });
  check('weak term alone does NOT match', m.test(post('our new paper is lovely')), false);
  check('weak term WITH a link matches',
    m.test(post('our new paper is lovely', link('https://nature.com/x'))), true);
  check('weak term with a bare url in text matches',
    m.test(post('our new paper https://nature.com/x is lovely')), true);
  check('strong term still matches with no link', m.test(post('up on arxiv now')), true);
  check('why() marks the corroboration',
    m.why(post('our new paper', link('https://x.com/1'))).some((h) => h.endsWith('+link')), true);
}

console.log('\nthe six real false positives the live run produced');
{
  const m = compile(PRESETS[0]);
  // Verbatim from measure-firehose run #1, all matched by the old rule.
  const wasWrong = [
    '#Caturday is for lazy mornings and reading the paper with lots of help.',
    'Note to self: Spin some yarn already. This will require excavating the spinning wheel, but the faux-archaeological dig is worth it',
    'I just published a new video prerelease on my member site. Available for certain memberships.',
    "I won't rest until I find proof of Murnane talking summer classes in Budapest",
    'pgvector recall drops off a cliff for me past about 50k chunks on default ivfflat lists, so I moved to HNSW',
    'i need to write a hook that triggers whenever "backwards compatibility" appears in its output',
  ];
  wasWrong.forEach((t, i) => check(`no longer matches #${i + 1}`, m.test(post(t)), false));

  // …and the three it got right must still match.
  check('still matches the arXiv post',
    m.test(post('Common-Witness Certificates and Sharp Feature Bounds for Counterfactual Image Auditing #arXiv #cs.AI')), true);
  check('still matches a nature.com link',
    m.test(post('Yes, I would appreciate that date in the review article also.', link('https://www.nature.com/articles/s41467-026-77068-0.pdf'))), true);
}

console.log('\nthe shipped preset — broad net, subtractive edge');
{
  const m = compile(PRESETS[0]);

  const keep = [
    ['nature paper',   post('Our new paper is out in Nature today, years of work', link('https://nature.com/articles/x'))],
    ['biorxiv',        post('preprint up on bioRxiv this morning, comments welcome')],
    // Weak terms, so they carry a link — which is how a real paper-share looks.
    ['methods',        post('the dataset is finally reproducible and the methodology written up',
                            link('https://osf.io/abc'))],
    ['doi link',       post('long enough text about a study here', link('https://doi.org/10.1101/2024.01.01.1'))],
    ['humanities',     post('New monograph on medieval philology, out with Cambridge now', link('https://cambridge.org/x'))],
    ['archaeology',    post('Our fieldwork season produced a remarkable archaeological sequence',
                            link('https://cambridge.org/antiquity/x'))],
    ['maths',          post('A short proof of the conjecture, now up on arXiv for comment')],
    ['economics',      post('New NBER working paper on labour supply elasticities', link('https://nber.org/p/1'))],
  ];
  for (const [name, p] of keep) check(`keeps ${name}`, m.test(p), true);

  // And the same two WITHOUT a link must not match — that is the gate working.
  check('weak-only + no link is dropped',
    m.test(post('the dataset is finally reproducible and the methodology written up')), false);

  const drop = [
    ['politics term',  post('New paper on how the election was decided in three states')],
    ['scotus',         post('Our study of SCOTUS decisions is published in a law review now')],
    ['gaza',           post('New preprint on casualty estimates in Gaza, methodology inside')],
    ['covid',          post('Our new paper on long covid transmission is out in Nature today')],
    ['vaccine plural', post('The vaccines paper we wrote is finally published, open access')],
    ['epidemiology',   post('New epidemiological study just published, dataset attached')],
    ['public health',  post('This public health preprint has a lovely reproducible pipeline')],
    ['news outlet',    post('Our new paper got written up, worth a read', link('https://politico.com/x'))],
    ['cdc link',       post('New dataset published this week, quite thorough', link('https://cdc.gov/data'))],
  ];
  for (const [name, p] of drop) check(`drops ${name}`, m.test(p), false);

  // Honest about what a keyword rule cannot do:
  const fp = [
    post('new paper towels arrived and they are great, very absorbent stuff'),
    post('just published my sourdough recipe blog after months of testing it'),
  ];
  for (const p of fp) {
    console.log(`     known false positive: "${p.text.slice(0, 44)}…" -> ${m.test(p) ? 'MATCHES' : 'no match'}`);
  }
  console.log(`     strong=${PRESETS[0].any.length} weak=${PRESETS[0].weak.length} domains=${PRESETS[0].domains.length} `
    + `vetoes=${PRESETS[0].none.length} veto-domains=${PRESETS[0].noneDomains.length}`);
}

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nrulefeed selftest passed');
