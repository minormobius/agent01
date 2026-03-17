/* poetrydb.js — search, fetch, parse PoetryDB poems */

const Poetry = (() => {
  const API = 'https://poetrydb.org';

  // Try proxy first, fall back to direct API
  async function apiFetch(path) {
    // 1. CORS proxy (works in production on Cloudflare Pages)
    try {
      const resp = await fetch(`/poetrydb-proxy?path=${encodeURIComponent(path)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (!data.error) return data;
      }
    } catch (_) { /* fall through */ }

    // 2. Direct (PoetryDB has CORS headers)
    const resp = await fetch(`${API}${path}`);
    if (!resp.ok) throw new Error('PoetryDB request failed');
    return resp.json();
  }

  async function search(query) {
    // Search both title and author in parallel, dedupe
    const [byTitle, authors] = await Promise.all([
      apiFetch(`/title/${encodeURIComponent(query)}`).catch(() => ({ status: 404 })),
      apiFetch(`/author/${encodeURIComponent(query)}`).catch(() => ({ status: 404 }))
    ]);

    const results = [];
    const seen = new Set();

    // Title matches
    if (!byTitle.status && Array.isArray(byTitle)) {
      for (const poem of byTitle) {
        const key = `${poem.author}::${poem.title}`;
        if (!seen.has(key)) { seen.add(key); results.push(poem); }
      }
    }

    // Author matches — if we got author names, fetch their poems
    if (!authors.status && Array.isArray(authors)) {
      // authors could be full poems or just name strings
      const names = typeof authors[0] === 'string' ? authors : [];
      const poems = typeof authors[0] === 'object' ? authors : [];

      for (const poem of poems) {
        const key = `${poem.author}::${poem.title}`;
        if (!seen.has(key)) { seen.add(key); results.push(poem); }
      }

      for (const authorName of names.slice(0, 3)) {
        try {
          const data = await apiFetch(`/author/${encodeURIComponent(authorName)}/title,author,linecount`);
          if (!data.status && Array.isArray(data)) {
            for (const poem of data) {
              const key = `${poem.author}::${poem.title}`;
              if (!seen.has(key)) { seen.add(key); results.push(poem); }
            }
          }
        } catch (_) { /* skip */ }
      }
    }

    return results;
  }

  async function fetchPoem(title, author) {
    const data = await apiFetch(
      `/author,title/${encodeURIComponent(author)};${encodeURIComponent(title)}`
    );
    if (data.status || !Array.isArray(data) || !data.length) throw new Error('Poem not found');
    return data[0];
  }

  async function fetchByAuthor(author) {
    const data = await apiFetch(`/author/${encodeURIComponent(author)}`);
    if (data.status) throw new Error('Author not found');
    return data;
  }

  async function fetchRandom(count) {
    const data = await apiFetch(`/random/${count || 1}`);
    if (data.status) throw new Error('No poems found');
    return data;
  }

  // Convert poem(s) to the chapter format used by the reader
  function toChapters(poems) {
    if (!Array.isArray(poems)) poems = [poems];
    return poems.map(p => ({
      title: p.title,
      text: p.lines.join('\n')
    }));
  }

  return { search, fetchPoem, fetchByAuthor, fetchRandom, toChapters };
})();
