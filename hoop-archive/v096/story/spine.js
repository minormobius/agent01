// hoop/story/spine.js — the CHUNK↔CONTENT embeddings-match (huwupy's spine). Pure kernel; the neural
// embedder is INJECTED (so the network call lives behind the rip-out-able llm/ adapter, never here).
//
// THE CONCEPT: our world is procedurally THICK — a chunk carries a building program (econ roles ×
// domains × footprints) and a civ web (the multiplex affiliation graph: bridges, third-places,
// vitality). Story should match that thickness. So we (1) render a chunk's characteristics into a
// descriptor, (2) embed it, (3) retrieve the nearest content spine by cosine kNN over a small corpus
// (brute-force — ARCHITECTURE.md: "semantic retrieval over the bible | kNN, small corpus | No DB").
// If the best match is THINNER than the chunk, `thicknessGap > 0` tells the generator to grow a thicker
// arc rather than crystallize a one-line fragment onto a rich place.
//
// "Run the embeddings serve": `lexicalEmbed` is a deterministic, zero-dep, zero-network embedder (hashed
// term-frequency) so the match WORKS and is node-testable today; pass a neural embedder (Gemini
// text-embedding-004 / huwupy's nomic serve) via the `embed` arg to upgrade the semantics. Same shape.

// ── tokenization + the pure lexical embedder (the always-available fallback serve) ──
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'is', 'it', 'with', 'for', 'on', 'at']);
export function tokenize(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}
const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const EMBED_DIM = 256;
// Deterministic term-frequency vector, L2-normalized. Same text → same vector on every machine
// (atproto-stable: the genState digest can pin which vector steered a generation).
export function lexicalEmbed(text, dim = EMBED_DIM) {
  const v = new Float64Array(dim);
  for (const tok of tokenize(text)) v[hash(tok) % dim] += 1;
  let n = 0; for (let i = 0; i < dim; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1; for (let i = 0; i < dim; i++) v[i] /= n;
  return Array.from(v);
}
export function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  const m = Math.min(a.length, b.length);
  for (let i = 0; i < m; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ── descriptors: render thick characteristics into a stable, weighted text + a thickness scalar ──
// A ChunkProfile (the thin adapter from econ output → here is phase 3) carries, all optional:
//   { roles:{role:weight}, domains:{domain:weight}, factions:{f:weight}, motifs:[str],
//     vitality:0..100, tier:str, bridges:0..1, thirdPlaces:int, label:str }
const SALIENT = 0.0;   // a histogram entry counts toward thickness when its weight exceeds this
function topKeys(obj, min = SALIENT) {
  return Object.entries(obj || {}).filter(([, w]) => (+w || 0) > min)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);
}
// Repeat a token by its (rounded) weight so the embedder weights salient axes — deterministic.
function weighted(obj, min = SALIENT) {
  const out = [];
  for (const [k, w] of Object.entries(obj || {})) { const n = (+w || 0) > min ? Math.max(1, Math.round(+w)) : 0; for (let i = 0; i < n; i++) out.push(k); }
  return out;
}
export function chunkDescriptor(profile = {}) {
  const roles = topKeys(profile.roles), domains = topKeys(profile.domains), factions = topKeys(profile.factions);
  const motifs = (profile.motifs || []).filter(Boolean);
  const parts = [
    ...weighted(profile.roles), ...weighted(profile.domains), ...weighted(profile.factions), ...motifs,
    profile.tier || '', profile.label || '',
    profile.bridges > 0.15 ? 'bridging' : '', (profile.thirdPlaces || 0) >= 2 ? 'social' : '',
  ];
  // thickness = how many DISTINCT salient narrative axes the place demands (the bar an arc must clear)
  const thick = new Set([...roles, ...domains, ...factions, ...motifs]).size;
  return { text: parts.filter(Boolean).join(' '), thickness: thick, roles, domains, factions, motifs };
}
export function contentDescriptor(ci = {}) {
  const c = ci.content || {};
  const tags = ci.tags || [];
  const text = [c.name || '', c.description || c.response || '', ...tags, ci.type || ''].filter(Boolean).join(' ');
  // an item's thickness: its distinct tags + a bonus for a real dialogue tree (an NPC arc is thicker
  // than a lore line) + tier depth. Caps so one over-tagged item can't claim to match every chunk.
  const dialogueDepth = c.dialogue && c.dialogue.nodes ? Object.keys(c.dialogue.nodes).length : 0;
  const thickness = new Set(tags).size + (dialogueDepth > 1 ? 2 : 0) + ((ci.revelation_tier || 1) - 1);
  return { text, thickness, tags };
}

// thicknessGap > 0 ⇒ the arc is THINNER than the chunk demands (generate more, not less). The ratio
// lets a chunk tolerate a slightly-thinner arc (default: an arc must reach 80% of the chunk's thickness).
export function thicknessGap(chunkThickness, itemThickness, ratio = 0.8) {
  return Math.max(0, Math.ceil(chunkThickness * ratio) - itemThickness);
}

// ── the brute-force index + retrieval (small corpus, in-worker) ──
// embed: async (text) => number[]. buildIndex embeds every item once; match embeds the chunk once.
export async function buildIndex(items, embed = (t) => lexicalEmbed(t)) {
  const out = [];
  for (const ci of items || []) {
    const d = contentDescriptor(ci);
    out.push({ item: ci, vec: await embed(d.text), thickness: d.thickness });
  }
  return { entries: out };
}
// Returns ranked candidates [{item, score, thickness, thicknessGap}] for a chunk, best first. `minScore`
// drops weak matches; `k` caps the list. The caller (the generator) reads thicknessGap to decide whether
// to RETRIEVE (gap 0 — a thick enough arc already exists) or GENERATE a thicker arc for this place.
export async function match(profile, index, embed = (t) => lexicalEmbed(t), opts = {}) {
  const { k = 5, minScore = 0 } = opts;
  const cd = chunkDescriptor(profile);
  const qv = await embed(cd.text);
  const ranked = index.entries.map((e) => ({
    item: e.item, score: cosine(qv, e.vec), thickness: e.thickness,
    thicknessGap: thicknessGap(cd.thickness, e.thickness, opts.ratio),
  })).filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score);
  return { chunkThickness: cd.thickness, descriptor: cd.text, candidates: ranked.slice(0, k) };
}
