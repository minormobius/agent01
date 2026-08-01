// Lean post fetcher for Sleuth — uses PDS listRecords (no auth needed)
// No CAR, no WASM, no DuckDB, no embedding model
// 10 API calls = 1000 posts, works on any device

// Fetch recent posts via PDS listRecords (public endpoint, no auth)
export async function fetchRecentPosts(pdsUrl, did, { maxPosts = 1000, onProgress } = {}) {
  const posts = [];
  let cursor = undefined;
  let calls = 0;
  const limit = 100; // API max per call

  while (posts.length < maxPosts) {
    const params = new URLSearchParams({
      repo: did,
      collection: 'app.bsky.feed.post',
      limit: String(limit),
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?${params}`
    );

    if (!res.ok) {
      throw new Error(`listRecords failed: ${res.status}`);
    }

    const data = await res.json();
    const records = data.records || [];
    calls++;

    for (const rec of records) {
      const text = rec.value?.text;
      if (!text || typeof text !== 'string' || text.trim().length === 0) continue;

      let createdAt = rec.value.createdAt || '';
      if (createdAt.length > 10) createdAt = createdAt.slice(0, 10);

      // Extract rkey from URI: at://did/collection/rkey
      const rkey = rec.uri?.split('/').pop() || '';

      posts.push({
        text,
        rkey,
        did,
        createdAt,
        uri: rec.uri,
      });
    }

    if (onProgress) {
      onProgress({ fetched: posts.length, calls });
    }

    cursor = data.cursor;
    if (!cursor || records.length < limit) break; // No more records
  }

  return posts.slice(0, maxPosts);
}

// Simple inverted index for instant keyword search
export class TextIndex {
  constructor() {
    this.docs = [];         // original docs
    this.index = new Map(); // word → Set<docIndex>
    this.docFreq = new Map(); // word → count of docs containing it
  }

  // Build index from docs
  build(docs) {
    this.docs = docs;
    this.index.clear();
    this.docFreq.clear();

    for (let i = 0; i < docs.length; i++) {
      const words = this._tokenize(docs[i].text);
      const seen = new Set();

      for (const word of words) {
        if (!this.index.has(word)) this.index.set(word, new Set());
        this.index.get(word).add(i);

        if (!seen.has(word)) {
          seen.add(word);
          this.docFreq.set(word, (this.docFreq.get(word) || 0) + 1);
        }
      }
    }
  }

  // Search with TF-IDF scoring
  search(query, k = 20) {
    const terms = this._tokenize(query);
    if (terms.length === 0) return [];

    const N = this.docs.length;
    const scores = new Float32Array(N);

    for (const term of terms) {
      const postings = this.index.get(term);
      if (!postings) continue;

      const df = this.docFreq.get(term) || 1;
      const idf = Math.log(1 + N / df);

      for (const idx of postings) {
        scores[idx] += idf;
      }
    }

    // Get top-k
    const results = [];
    for (let i = 0; i < N; i++) {
      if (scores[i] > 0) results.push({ doc: this.docs[i], score: scores[i] });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  _tokenize(text) {
    return text.toLowerCase()
      .replace(/https?:\/\/\S+/g, '') // strip URLs
      .replace(/[^\w\s]/g, ' ')       // strip punctuation
      .split(/\s+/)
      .filter(w => w.length >= 2);
  }

  get size() {
    return this.docs.length;
  }
}
