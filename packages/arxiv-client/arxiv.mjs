#!/usr/bin/env node
// arxiv.mjs — arXiv for agents: search, the newest in a category, one paper. No dependencies.
//
//   node arxiv.mjs search "rotation keys decentralized identity" [--max 10] [--cat cs.CR] [--sort relevance|date]
//   node arxiv.mjs recent cs.SI [--max 20]          the newest submissions in a category
//   node arxiv.mjs paper 2410.01234 [2410.05678 …]   by id
//   node arxiv.mjs --selftest                       parse a fixed reply, no network
//
// Prints one JSON object a line: id, title, authors, published, updated, primary, categories,
// summary, abs, pdf. Uses the public API (export.arxiv.org/api/query), the one the buildabot's
// ideas pipeline uses (scripts/ideas-fetch.mjs). arXiv asks for about 3 s between requests:
// one command is one request; if you loop, sleep 3 s between calls.
const API = 'https://export.arxiv.org/api/query';

const unxml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (e, t) => unxml((e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [, ''])[1]);

export function parse(atom) {
  return [...String(atom).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const abs = tag(e, 'id');
    const id = abs.replace(/^https?:\/\/arxiv\.org\/abs\//, '');
    return {
      id, title: tag(e, 'title'),
      authors: [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => unxml(m[1])),
      published: tag(e, 'published'), updated: tag(e, 'updated'),
      primary: (e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [, ''])[1],
      categories: [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1]),
      summary: tag(e, 'summary'),
      abs: abs.replace(/^http:/, 'https:'),
      pdf: ((e.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/) || [, ''])[1] || '').replace(/^http:/, 'https:') || null,
    };
  }).filter((p) => p.id && !/^https?:/.test(p.id));
}

export function url(cmd, args, { max = 10, cat = null, sort = 'relevance' } = {}) {
  const q = new URLSearchParams();
  if (cmd === 'paper') { q.set('id_list', args.join(',')); q.set('max_results', String(args.length)); }
  else if (cmd === 'recent') { q.set('search_query', `cat:${args[0]}`); q.set('sortBy', 'submittedDate'); q.set('sortOrder', 'descending'); q.set('max_results', String(max)); }
  else if (cmd === 'search') {
    // Every word must appear somewhere (title, abstract, authors…); "quoted phrases" stay phrases.
    const terms = (args.join(' ').match(/"[^"]+"|\S+/g) || []).map((w) => `all:${w.startsWith('"') ? w : w.replace(/[^\w.-]/g, '')}`).filter((w) => w !== 'all:');
    q.set('search_query', [...terms, ...(cat ? [`cat:${cat}`] : [])].join(' AND '));
    q.set('sortBy', sort === 'date' ? 'submittedDate' : 'relevance'); q.set('sortOrder', 'descending'); q.set('max_results', String(max));
  } else throw new Error('commands: search, recent, paper');
  return `${API}?${q}`;
}

const FIXTURE = `<feed><entry><id>http://arxiv.org/abs/2410.01234v2</id><updated>2024-10-03T00:00:00Z</updated><published>2024-10-01T00:00:00Z</published>
<title>Who Holds the Keys? &amp; Other
  Questions</title><summary>  A study of rotation keys.  </summary><author><name>A. Author</name></author><author><name>B. Author</name></author>
<link title="pdf" href="http://arxiv.org/pdf/2410.01234v2" rel="related"/><arxiv:primary_category term="cs.CR"/><category term="cs.CR"/><category term="cs.SI"/></entry></feed>`;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--selftest') {
    const [p] = parse(FIXTURE);
    const ok = p.id === '2410.01234v2' && p.title === 'Who Holds the Keys? & Other Questions' && p.authors.length === 2 && p.primary === 'cs.CR'
      && p.categories.join() === 'cs.CR,cs.SI' && p.summary === 'A study of rotation keys.' && p.pdf === 'https://arxiv.org/pdf/2410.01234v2'
      && url('recent', ['cs.SI'], { max: 5 }).includes('sortBy=submittedDate') && url('search', ['a', 'b'], { cat: 'cs.CR' }).includes('all%3Aa+AND+all%3Ab+AND+cat%3Acs.CR');
    if (!ok) { console.error('arxiv selftest: FAILED', JSON.stringify(p)); process.exit(1); }
    console.log('arxiv selftest: parse and query building ok (no network)');
    process.exit(0);
  }
  const opt = {}; const args = [];
  for (let i = 1; i < argv.length; i++) { if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]; else args.push(argv[i]); }
  const r = await fetch(url(argv[0], args, { max: Number(opt.max || 10), cat: opt.cat || null, sort: opt.sort || 'relevance' }), { headers: { 'user-agent': 'miniphim-arxiv/1 (mino.mobi)' } });
  if (!r.ok) { console.error(`arXiv answered ${r.status}`); process.exit(1); }
  for (const p of parse(await r.text())) console.log(JSON.stringify(p));
}
