// refs.mjs — turning "an energy based method like arxiv.org/abs/2006.07859"
// into text an agent with no network can read.
//
// Pure: URL parsing, source routing, and HTML→text. The fetching is in
// scripts/lab-fetch-refs.mjs, so scripts/lab-fetch-refs.selftest.mjs can drive
// all of this on a bare `node` run with no network and no runner.
//
// WHAT WAS WRONG WITH THE FIRST VERSION. It resolved an arXiv link through the
// export API, which returns title, authors and abstract — and stopped there. So
// "build something like this paper" got the agent 150 words of abstract and a
// citation, which is enough to know the paper exists and not enough to build
// anything. Asking for a paper and receiving its blurb is the same failure as
// the thread carry sending "Try again?" without the request.
//
// THE LADDER, because no single arXiv source covers the corpus:
//
//   arxiv.org/html/<id>   native LaTeXML. Best quality, but only papers
//                         submitted since ~Dec 2023 have it — older ones 404.
//   ar5iv.../html/<id>    covers back to the 1990s. Usually excellent (44k
//                         clean chars for Attention Is All You Need) and
//                         occasionally fails outright, emitting an "Untitled
//                         Document" stub of a few hundred characters.
//   arxiv.org/abs/<id>    title, authors, abstract, off the landing page's
//                         citation_* meta tags. Never full text.
//   export API            the same fields from a real API, last because
//                         export.arxiv.org is a SEPARATE HOST with a separate
//                         outage — it times out from this repo's sandbox
//                         entirely, and each dead rung costs a 20s timeout.
//
// Which is why shortness is treated as failure and falls through, rather than
// being handed over as if it were the paper. Both failure modes were observed
// against the live services before this was written, not assumed.
//
// TWO ABSTRACT-ONLY RUNGS AT THE BOTTOM, ON PURPOSE, and the abs page goes
// first: it is served by the host that just answered for /html/, so if arXiv is
// reachable at all, it is. The API is the tidier source and the less certain
// one, which makes it the backstop rather than the default.

/** Bare URLs out of prose. Trailing punctuation belongs to the sentence, not the
 *  address — "like arxiv.org/abs/2006.07859." must not fetch a dot.
 * @param {string} text @param {number} [max] @returns {string[]} */
export function urlsIn(text, max = 3) {
  /** @type {string[]} */
  const out = [];
  const re = /\bhttps?:\/\/[^\s<>"')\]]+|\b(?:arxiv\.org|github\.com|en\.wikipedia\.org|doi\.org)\/[^\s<>"')\]]+|\bdoi:\s*10\.\d{4,}\/\S+/gi;
  for (const m of String(text ?? '').matchAll(re)) {
    let u = m[0].replace(/[.,;:!?]+$/, '');
    if (/^doi:/i.test(u)) u = `https://doi.org/${u.replace(/^doi:\s*/i, '')}`;
    else if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    if (!out.includes(u)) out.push(u);
  }
  return out.slice(0, max);
}

/** arXiv id out of any of its URL shapes, version suffix preserved when given. */
export function arxivId(u) {
  const m = String(u ?? '').match(/arxiv\.org\/(?:abs|pdf|html)\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
  return m ? m[1] : null;
}

/** DOI out of a doi.org URL or a bare doi: reference. */
export function doiIn(u) {
  const m = String(u ?? '').match(/(?:doi\.org\/|doi:\s*)(10\.\d{4,}\/[^\s?#]+)/i);
  return m ? m[1].replace(/[.,;:]+$/, '') : null;
}

/** Wikipedia article title, for the REST summary+content API rather than the
 *  40 KB of chrome the rendered page wraps around it. */
export function wikiTitle(u) {
  const m = String(u ?? '').match(/en\.wikipedia\.org\/wiki\/([^\s?#]+)/i);
  return m && !m[1].includes(':') ? m[1] : null;
}

/** Where to actually go for a URL, in order. First one that yields real text
 *  wins; `kind` decides the budget, since a paper is not a README.
 * @param {string} url
 * @returns {{ kind: 'paper'|'article'|'page', tries: {url: string, as: string}[] }} */
export function plan(url) {
  const id = arxivId(url);
  if (id) {
    const bare = id.replace(/v[0-9]+$/, '');
    return {
      kind: 'paper',
      tries: [
        { url: `https://arxiv.org/html/${id}`, as: 'html' },
        ...(id === bare ? [] : [{ url: `https://arxiv.org/html/${bare}`, as: 'html' }]),
        { url: `https://ar5iv.labs.arxiv.org/html/${bare}`, as: 'html' },
        { url: `https://arxiv.org/abs/${bare}`, as: 'arxivabs' },
        { url: `https://export.arxiv.org/api/query?id_list=${bare}`, as: 'atom' },
      ],
    };
  }
  const doi = doiIn(url);
  if (doi) {
    return {
      kind: 'paper',
      // OpenAlex is free, key-less, and answers "what is this and is it open
      // access" in one request. It often knows the arXiv id, which is how a DOI
      // reaches full text at all — publisher pages are usually a paywall.
      tries: [{ url: `https://api.openalex.org/works/doi:${doi}`, as: 'openalex' }],
    };
  }
  const wiki = wikiTitle(url);
  if (wiki) {
    return {
      kind: 'article',
      tries: [
        { url: `https://en.wikipedia.org/api/rest_v1/page/summary/${wiki}`, as: 'wikisummary' },
        { url, as: 'html' },
      ],
    };
  }
  return { kind: 'page', tries: [{ url, as: 'html' }] };
}

/** Below this, an "extraction" is a failure wearing the shape of a success —
 *  ar5iv's stub for a paper it could not convert is ~450 characters of LaTeX
 *  preamble titled "Untitled Document". Handing that over as the paper is worse
 *  than admitting the fetch failed, because nothing downstream can tell. */
export const TOO_SHORT = 2000;

export function htmlToText(body) {
  return String(body ?? '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    // Tags that OPEN a block leave a space where they stood, so every line
    // starts with one. Harmless to read and noisy to assert against.
    .replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** An Atom entry from the arXiv export API — the floor of the ladder.
 *  SCOPED TO <entry>: the feed carries its own <title> (the query) before the
 *  paper's, so matching the whole body returns "arXiv Query: search_query=…" as
 *  the title of the work. Caught by reading the output rather than trusting
 *  that it parsed. */
export function atomToText(body) {
  const entry = (String(body ?? '').match(/<entry>([\s\S]*?)<\/entry>/i) ?? [, ''])[1];
  if (!entry) return '';
  const pick = (tag) => {
    const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  };
  const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/gi)].map((a) => a[1]).join(', ');
  return [
    pick('title') && `TITLE: ${pick('title')}`,
    authors && `AUTHORS: ${authors}`,
    pick('summary') && `\nABSTRACT:\n${pick('summary')}`,
    '\n[abstract only — the full text could not be converted for this paper]',
  ].filter(Boolean).join('\n');
}

/** OpenAlex stores abstracts as an inverted index (word → positions) because of
 *  publisher redistribution terms. Rebuilding it is the only way to read one. */
export function openAlexToText(json) {
  let d;
  try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch { return { text: '', arxiv: null }; }
  if (!d || typeof d !== 'object') return { text: '', arxiv: null };
  const inv = d.abstract_inverted_index;
  let abstract = '';
  if (inv && typeof inv === 'object') {
    /** @type {string[]} */
    const words = [];
    for (const [w, positions] of Object.entries(inv)) {
      for (const p of positions ?? []) words[p] = w;
    }
    abstract = words.filter((w) => w !== undefined).join(' ');
  }
  const locations = [d.best_oa_location, ...(d.locations ?? [])].filter(Boolean);
  const arxiv = locations.map((l) => arxivId(l?.landing_page_url ?? '') || arxivId(l?.pdf_url ?? ''))
    .find(Boolean) ?? null;
  const authors = (d.authorships ?? []).map((a) => a?.author?.display_name).filter(Boolean).slice(0, 12).join(', ');
  const text = [
    d.title && `TITLE: ${d.title}`,
    authors && `AUTHORS: ${authors}`,
    d.publication_year && `YEAR: ${d.publication_year}`,
    abstract && `\nABSTRACT:\n${abstract}`,
  ].filter(Boolean).join('\n');
  return { text, arxiv };
}

/** Title, authors and abstract off an arXiv landing page. The page is 42 KB of
 *  chrome around 1.3 KB that matters, so this reads the citation_* meta tags
 *  and the abstract blockquote rather than running the whole thing through
 *  htmlToText — which yields five thousand characters of navigation. */
export function arxivAbsToText(body) {
  const s = String(body ?? '');
  const meta = (n) => [...s.matchAll(new RegExp(`<meta[^>]+name="${n}"[^>]+content="([^"]*)"`, 'gi'))].map((m) => m[1]);
  const title = meta('citation_title')[0] ?? '';
  const authors = meta('citation_author').join('; ');
  const bq = s.match(/<blockquote[^>]*class="abstract[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i);
  const abstract = bq ? bq[1].replace(/<[^>]+>/g, ' ').replace(/^\s*Abstract:\s*/i, '').replace(/\s+/g, ' ').trim() : '';
  if (!title && !abstract) return '';
  return [
    title && `TITLE: ${title}`,
    authors && `AUTHORS: ${authors}`,
    abstract && `\nABSTRACT:\n${abstract}`,
    '\n[abstract only — the full text could not be converted for this paper]',
  ].filter(Boolean).join('\n');
}

export function wikiSummaryToText(json) {
  let d;
  try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch { return ''; }
  return d?.extract ? `TITLE: ${d.title ?? ''}\n\n${d.extract}` : '';
}

/** A paper's bibliography is a third of its characters and none of its ideas —
 *  for someone building a web page from it, anyway. Cut it, but only when it
 *  really is the tail: "References" appears in prose too, and truncating a paper
 *  at its first mention would be worse than not trimming at all. */
export function trimBibliography(text) {
  const s = String(text ?? '');
  const re = /\n\s*(?:references|bibliography|works cited)\s*\n/gi;
  let cut = -1;
  for (const m of s.matchAll(re)) {
    if (m.index !== undefined && m.index > s.length * 0.5) { cut = m.index; break; }
  }
  return cut < 0 ? s : `${s.slice(0, cut)}\n\n[bibliography trimmed]`;
}

/** Keep the HEAD of a reference, unlike the thread carry which keeps the tail.
 *  A paper front-loads what it is doing; a conversation back-loads it. */
export function clipHead(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}\n\n[truncated at ${max} characters]` : s;
}
