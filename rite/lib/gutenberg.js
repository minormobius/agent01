// rite/lib/gutenberg — search + fetch Project Gutenberg books for the
// analytical surfaces (atlas / lexicon / redact). Two pieces:
//
//   searchGutenberg(query)    — hits gutendex.com (CORS-friendly Gutenberg
//                               search API) and returns up to 8 results.
//   fetchGutenbergText(id)    — downloads the plain-text body via
//                               read.mino.mobi/gutenberg-proxy, which
//                               strips the Gutenberg header/footer and
//                               returns text/plain with ACAO:*. We've
//                               already used this proxy in fodder mining;
//                               reusing it keeps fetch behavior consistent.

const GUTENDEX = 'https://gutendex.com/books/';
const TEXT_PROXY = 'https://read.mino.mobi/gutenberg-proxy';

export async function searchGutenberg(query, { signal, languages = 'en', limit = 8 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const params = new URLSearchParams({ search: q });
  if (languages) params.set('languages', languages);
  const res = await fetch(`${GUTENDEX}?${params}`, { signal });
  if (!res.ok) throw new Error(`gutendex search failed: ${res.status}`);
  const data = await res.json();
  return (data.results || []).slice(0, limit).map((b) => ({
    id: b.id,
    title: b.title,
    author: (b.authors && b.authors[0] && b.authors[0].name) || 'Unknown',
    languages: b.languages || [],
    downloads: b.download_count || 0,
  }));
}

export async function fetchGutenbergText(id, { signal } = {}) {
  const res = await fetch(`${TEXT_PROXY}?id=${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Gutenberg fetch failed (${res.status}) for #${id}: ${detail}`.trim());
  }
  return await res.text();
}

// Compose a filename suitable for uploadProfile() so the synthetic profile
// strip reads cleanly: "Hamlet — William Shakespeare (Gutenberg #1524)".
export function gutenbergFilename(book) {
  const title = (book.title || 'untitled').slice(0, 60).trim();
  const author = (book.author || 'Unknown').slice(0, 40).trim();
  return `${title} — ${author} (Gutenberg #${book.id}).txt`;
}
