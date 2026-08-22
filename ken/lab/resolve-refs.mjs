/* ken/lab/resolve-refs.mjs — resolve every bibliography entry against a real
   registry, so the citations link to sources instead of asserting them.

   CrossRef for anything with a DOI, arXiv for preprints. Conservative on
   purpose: a candidate is only accepted when the year matches exactly and the
   normalised title is a close match. Everything else is printed for a human to
   look at rather than written silently.

     node ken/lab/resolve-refs.mjs            # report only
     node ken/lab/resolve-refs.mjs --write    # patch refs.js with accepted hits

   Network-only. Never run from the selftest; CI has no business calling out. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REFS_PATH = join(HERE, '..', 'refs.js');
const REFS = (await import(REFS_PATH)).default ?? globalThis.KEN_REFS;

const norm = (s) => s.toLowerCase()
  .replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Token-level Jaccard, which tolerates subtitle and punctuation drift. */
function similarity(a, b) {
  const A = new Set(norm(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(norm(b).split(' ').filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function crossref(entry, { yearFiltered = false } = {}) {
  const q = encodeURIComponent(`${entry.t} ${entry.a.split(/[,&]/)[0]}`);
  // A year filter cuts the noise dramatically for older papers, whose titles
  // are short and collide with everything.
  const yf = yearFiltered
    ? `&filter=from-pub-date:${entry.y}-01-01,until-pub-date:${entry.y}-12-31`
    : '';
  const url = `https://api.crossref.org/works?query.bibliographic=${q}&rows=5${yf}`
            + '&select=DOI,title,issued,type,container-title';
  const res = await fetch(url, { headers: { 'User-Agent': 'ken/1.0 (mailto:majormobius@gmail.com)' } });
  if (!res.ok) return [];
  const items = (await res.json()).message?.items || [];
  /* Reject record types that are ABOUT a work rather than the work: a
     PsycEXTRA dataset stub matched False-Positive Psychology, and a review in
     the American Historical Review matched Chandler's book. Both scored 1.0 on
     title similarity, because the title is the same. */
  const BAD = new Set(['dataset', 'component', 'peer-review', 'grant', 'other']);
  const rank = { 'journal-article': 0, 'book': 0, 'proceedings-article': 1, 'book-chapter': 2, 'report': 3, 'posted-content': 4 };
  return items
    .filter((it) => !BAD.has(it.type))
    .filter((it) => !/^(review|book review)$/i.test((it['container-title'] || [''])[0]))
    .map((it) => ({
      id: `https://doi.org/${it.DOI}`,
      title: (it.title || [''])[0],
      year: (it.issued?.['date-parts'] || [[null]])[0][0],
      venue: (it['container-title'] || [''])[0],
      type: it.type,
      rank: rank[it.type] ?? 5,
      via: 'crossref',
    }));
}

async function arxiv(entry) {
  // all: rather than ti: — the title index misses papers whose stored title
  // differs in punctuation from the published one.
  const q = encodeURIComponent(`all:"${entry.t.replace(/"/g, '')}"`);
  const res = await fetch(`https://export.arxiv.org/api/query?search_query=${q}&max_results=5`);
  if (!res.ok) return [];
  const xml = await res.text();
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const blk = m[1];
    const id = (blk.match(/<id>([^<]+)<\/id>/) || [])[1];
    const title = (blk.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim();
    const year = Number((blk.match(/<published>(\d{4})/) || [])[1]);
    if (id && title) out.push({ id: id.replace('http://', 'https://').replace(/v\d+$/, ''), title, year, via: 'arxiv' });
  }
  return out;
}

/* A venue with no digits carries no volume or page numbers, so it is a
   publisher rather than a journal: a book. CrossRef indexes reviews and later
   editions of books far better than the books themselves, so those go to
   OpenLibrary instead. */
const looksLikeBook = (e) => !/\d/.test(e.v);

async function openlibrary(entry) {
  // Drop an edition marker and any subtitle after a colon: OpenLibrary indexes
  // the main title, and "Organizations" finds nothing when asked for
  // "Organizations: A Study of ...".
  const bare = entry.t.replace(/\s*\(.*?\)\s*/g, '').split(':')[0].trim();
  const author = encodeURIComponent(entry.a.split(/[,&]/)[0].trim());
  const q = encodeURIComponent(bare);
  const res = await fetch(`https://openlibrary.org/search.json?title=${q}&author=${author}&limit=5&fields=key,title,first_publish_year,author_name`);
  if (!res.ok) return [];
  const docs = (await res.json()).docs || [];
  return docs.map((d) => ({
    id: `https://openlibrary.org${d.key}`,
    title: d.title,
    year: d.first_publish_year,
    via: 'openlibrary',
  }));
}

const ACCEPT_SIM = 0.8;

const results = [];
for (const [key, e] of Object.entries(REFS)) {
  const isPreprint = /arxiv/i.test(e.v);
  const isConference = /\b(ICML|ICLR|NeurIPS|ACL|EMNLP|AAAI|CVPR)\b/i.test(e.v);
  let cands = [];
  try {
    if (isPreprint) {
      cands = await arxiv(e);
    } else if (looksLikeBook(e)) {
      cands = await openlibrary(e);  // no CrossRef fallback: it indexes reviews
    } else if (isConference) {
      cands = await arxiv(e);                       // preprint is the stable link
      if (!cands.length) cands = await crossref(e);
    } else {
      cands = await crossref(e);
      if (!cands.length) cands = await crossref(e, { yearFiltered: true });
      if (!cands.length) cands = await arxiv(e);
    }
    // Last resort for a noisy CrossRef match: pin the year at the query level.
    // Never applied to arXiv hits — a preprint legitimately predates its
    // conference year, and re-querying threw away the right answer for gao2023.
    if (cands.length && cands[0].via === 'crossref'
        && !cands.some((c) => c.year === e.y) && !isPreprint && !looksLikeBook(e)) {
      const pinned = await crossref(e, { yearFiltered: true });
      if (pinned.length) cands = pinned;
    }
  } catch (err) {
    results.push({ key, status: 'error', note: String(err).slice(0, 60) });
    continue;
  }
  await sleep(120);

  const scored = cands
    .map((c) => ({ ...c, sim: similarity(e.t, c.title), dy: c.year == null ? 99 : Math.abs(c.year - e.y) }))
    .sort((a, b) => b.sim - a.sim || a.dy - b.dy || (a.rank ?? 5) - (b.rank ?? 5));

  const best = scored[0];
  if (!best) { results.push({ key, status: 'none' }); continue; }

  // A book chapter reprint of a 1991 paper is a worse answer than the paper.
  const exactYear = scored.find((c) => c.dy === 0 && c.sim >= ACCEPT_SIM);  // already rank-ordered
  const pick = exactYear || best;
  // OpenLibrary reports FIRST publication, which for a later edition we cite
  // will sit earlier than our year. Accept that direction only, and only for
  // books, where an edition mismatch still points at the right work.
  const editionOk = pick.via === 'openlibrary' && pick.year != null
    && pick.year <= e.y && e.y - pick.year <= 60;
  // A preprint precedes its conference year, usually by one. Accept that
  // direction only: an arXiv posting AFTER the cited year is a different work.
  const preprintOk = pick.via === 'arxiv' && pick.year != null
    && pick.year <= e.y && e.y - pick.year <= 2;
  const ok = pick.sim >= ACCEPT_SIM && (pick.dy === 0 || editionOk || preprintOk);

  results.push({
    key, status: ok ? 'accept' : 'review',
    url: pick.id, foundTitle: pick.title, foundYear: pick.year,
    wantYear: e.y, sim: Number(pick.sim.toFixed(2)), via: pick.via,
  });
}

const accepted = results.filter((r) => r.status === 'accept');
const review = results.filter((r) => r.status !== 'accept');

console.log(`\n${accepted.length} accepted, ${review.length} for review, of ${results.length}\n`);
console.log('── ACCEPTED ──');
for (const r of accepted) console.log(`  ${r.key.padEnd(20)} ${r.via.padEnd(9)} sim ${r.sim}  ${r.url}`);
console.log('\n── NEEDS A HUMAN ──');
for (const r of review) {
  console.log(`  ${r.key.padEnd(20)} ${r.status}  want ${r.wantYear}, found ${r.foundYear ?? '-'}, sim ${r.sim ?? '-'}`);
  if (r.foundTitle) console.log(`      candidate: ${r.foundTitle.slice(0, 88)}`);
  if (r.url) console.log(`      ${r.url}`);
}

if (process.argv.includes('--write')) {
  let src = readFileSync(REFS_PATH, 'utf8');
  let patched = 0;
  for (const r of accepted) {
    const re = new RegExp(`(\\n    ${r.key}: \\{[\\s\\S]*?)(\\n?\\s*\\},)`);
    if (!re.test(src)) { console.error(`  ! could not locate ${r.key}`); continue; }
    if (new RegExp(`${r.key}: \\{[\\s\\S]{0,600}?u: '`).test(src)) continue; // already linked
    src = src.replace(re, (_m, body, close) => `${body},\n      u: '${r.url}'${close}`);
    patched++;
  }
  writeFileSync(REFS_PATH, src);
  console.log(`\npatched ${patched} entries into refs.js`);
}
