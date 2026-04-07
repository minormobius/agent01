// In-memory vector store with cosine similarity search
// Operates on Float32Array vectors (384-dim from bge-small)

export class VectorStore {
  constructor() {
    this.vectors = [];  // Float32Array[]
    this.docs = [];     // { text, rkey, did, createdAt, ... }[]
    this.dim = 0;
  }

  // Add documents with their embeddings
  add(embeddings, documents) {
    if (embeddings.length !== documents.length) {
      throw new Error('Embeddings and documents must have same length');
    }
    if (embeddings.length === 0) return;
    this.dim = embeddings[0].length;
    this.vectors.push(...embeddings);
    this.docs.push(...documents);
  }

  get size() {
    return this.vectors.length;
  }

  // Search for top-k most similar documents to a query vector
  search(queryVector, k = 10) {
    if (this.vectors.length === 0) return [];

    const scores = new Float32Array(this.vectors.length);

    // Cosine similarity (vectors are already normalized)
    for (let i = 0; i < this.vectors.length; i++) {
      let dot = 0;
      const vec = this.vectors[i];
      for (let j = 0; j < this.dim; j++) {
        dot += queryVector[j] * vec[j];
      }
      scores[i] = dot;
    }

    // Get top-k indices
    const indices = Array.from({ length: scores.length }, (_, i) => i);
    indices.sort((a, b) => scores[b] - scores[a]);

    return indices.slice(0, k).map(i => ({
      doc: this.docs[i],
      score: scores[i],
    }));
  }

  // Full-text keyword search (fallback when no embeddings)
  keywordSearch(query, k = 10) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const scored = this.docs.map((doc, i) => {
      const text = doc.text.toLowerCase();
      let hits = 0;
      for (const term of terms) {
        if (text.includes(term)) hits++;
      }
      return { doc, score: hits / terms.length, index: i };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => ({ doc: s.doc, score: s.score }));
  }

  clear() {
    this.vectors = [];
    this.docs = [];
    this.dim = 0;
  }
}
