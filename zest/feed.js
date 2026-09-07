// zest/feed.js — getting posts and vectors into the tab, and being honest about
// which of them you actually got.
//
// Three things can independently fail or be missing, and each has a real
// fallback rather than a spinner that never resolves:
//
//   posts       → the worker's /api/feed. No fallback: no posts, no game.
//   vectors     → Workers AI via /api/embed. Falls back to the LEXICAL hash
//                 embedder in embed-geometry.js. The shapes stay meaningful,
//                 but they mean spelling rather than meaning, and the HUD says
//                 so in as many words.
//   corpus basis→ /api/basis. Falls back to a basis fitted on THIS session's
//                 posts. Shapes stay internally consistent and comparable
//                 within the session; they are just not comparable with what
//                 anyone else saw. The HUD says that too.
//
// Nothing here silently degrades. A page that quietly swapped a language model
// for a string hash would be the exact failure this project is about.

import { hashEmbed, makeBasis } from './embed-geometry.js';

export const MODES = {
  SEMANTIC: 'semantic',   // Workers AI bge-base-en-v1.5
  LEXICAL: 'lexical',     // the hashing fallback
};

export const BASIS_MODES = {
  CORPUS: 'corpus',       // the shared, versioned, server-side basis
  SESSION: 'session',     // fitted here, now, on what we happen to have
};

/** Decode the worker's base64 Float32 payload. */
function floatsFromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export async function loadPosts({ src = 'simcluster', limit = 60, cursor = '' } = {}) {
  const u = new URL('/api/feed', location.origin);
  u.searchParams.set('src', src);
  u.searchParams.set('limit', String(limit));
  if (cursor) u.searchParams.set('cursor', cursor);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const data = await res.json();
  return { posts: data.posts || [], cursor: data.cursor || '', label: data.label || src };
}

/**
 * Embed a batch of posts. Always resolves — the worst case is lexical vectors.
 * @returns {{vectors: Float32Array[], mode: string, note: string}}
 */
export async function embedTexts(texts) {
  if (!texts.length) return { vectors: [], mode: MODES.SEMANTIC, note: '' };
  try {
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) throw new Error(`embed ${res.status}`);
    const data = await res.json();
    const vectors = (data.vectors || []).map((v) => (v ? floatsFromB64(v) : null));
    const missing = vectors.filter((v) => !v).length;
    if (vectors.length !== texts.length || missing === texts.length) throw new Error('no vectors returned');
    // Partial failure: fill the holes lexically rather than dropping posts, and
    // mark the batch so the HUD cannot claim a clean semantic run.
    for (let i = 0; i < texts.length; i++) if (!vectors[i]) vectors[i] = hashEmbed(texts[i], data.dim || 768);
    return {
      vectors,
      mode: missing ? MODES.LEXICAL : MODES.SEMANTIC,
      note: missing ? `${missing} of ${texts.length} posts fell back to the lexical embedder` : '',
    };
  } catch (err) {
    return {
      vectors: texts.map((t) => hashEmbed(t, 768)),
      mode: MODES.LEXICAL,
      note: 'the embedding model is unreachable — shapes below read spelling, not meaning',
    };
  }
}

/**
 * The shared basis, or a session-local one. Never throws.
 * @returns {{basis: object, mode: string, n: number, note: string, builtAt: number|null}}
 */
export async function loadBasis(fallbackVectors) {
  try {
    const res = await fetch('/api/basis');
    const data = await res.json();
    if (data && data.status === 'ready' && data.basis && data.basis.mean) {
      return {
        basis: data.basis,
        mode: BASIS_MODES.CORPUS,
        n: data.n || data.basis.n || 0,
        builtAt: data.builtAt || null,
        note: '',
      };
    }
  } catch (err) {
    /* fall through */
  }
  const basis = makeBasis(fallbackVectors);
  return {
    basis,
    mode: BASIS_MODES.SESSION,
    n: fallbackVectors.length,
    builtAt: null,
    note: `fitted on this session’s ${fallbackVectors.length} posts — shapes are comparable here, but not with anyone else’s screen`,
  };
}

/** Feed sources the worker knows about. */
export const SOURCES = [
  { key: 'simcluster', name: 'SimCluster', blurb: 'this repo’s own feed generator' },
  { key: 'hot', name: 'Discover', blurb: 'what’s hot on Bluesky' },
];
