// Dossier generation pipeline
// Multi-pass LLM analysis over temporally-sampled, topic-clustered posts
//
// Pipeline:
// 1. Temporal bucketing — group posts by quarter via DuckDB
// 2. Topic clustering — k-means on embeddings (client-side)
// 3. LLM Pass 1 — Theme identification from cluster samples
// 4. LLM Pass 2 — Narrative arc tracing per theme
// 5. LLM Pass 3 — Profile synthesis (traits, strengths, interests)

import { embedQuery } from './embeddings.js';

// ---- Temporal bucketing ----

export function bucketByQuarter(docs) {
  const buckets = {};
  for (const doc of docs) {
    if (!doc.createdAt) continue;
    const d = new Date(doc.createdAt);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const key = `${d.getFullYear()}-Q${q}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(doc);
  }
  // Sort keys chronologically
  const sorted = Object.keys(buckets).sort();
  return sorted.map(k => ({ period: k, posts: buckets[k] }));
}

// ---- K-means clustering on embeddings ----

function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are normalized
}

function addVec(target, source) {
  for (let i = 0; i < target.length; i++) target[i] += source[i];
}

function normalizeVec(v) {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export function kmeansCluster(vectors, docs, k = 10, maxIter = 20) {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  k = Math.min(k, vectors.length);

  // Init centroids: k-means++ initialization
  const centroids = [];
  const usedIdx = new Set();

  // First centroid: random
  let idx = Math.floor(Math.random() * vectors.length);
  centroids.push(new Float32Array(vectors[idx]));
  usedIdx.add(idx);

  for (let c = 1; c < k; c++) {
    // Compute distances to nearest centroid
    const dists = new Float32Array(vectors.length);
    let totalDist = 0;
    for (let i = 0; i < vectors.length; i++) {
      if (usedIdx.has(i)) { dists[i] = 0; continue; }
      let maxSim = -1;
      for (const cent of centroids) {
        const sim = cosineSimilarity(vectors[i], cent);
        if (sim > maxSim) maxSim = sim;
      }
      dists[i] = 1 - maxSim; // distance = 1 - similarity
      totalDist += dists[i];
    }
    // Weighted random selection
    let r = Math.random() * totalDist;
    for (let i = 0; i < vectors.length; i++) {
      r -= dists[i];
      if (r <= 0) { idx = i; break; }
    }
    centroids.push(new Float32Array(vectors[idx]));
    usedIdx.add(idx);
  }

  // Iterate
  const assignments = new Int32Array(vectors.length);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;

    // Assign each vector to nearest centroid
    for (let i = 0; i < vectors.length; i++) {
      let bestSim = -2;
      let bestC = 0;
      for (let c = 0; c < k; c++) {
        const sim = cosineSimilarity(vectors[i], centroids[c]);
        if (sim > bestSim) { bestSim = sim; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed++; }
    }

    if (changed === 0) break;

    // Recompute centroids
    for (let c = 0; c < k; c++) {
      const newCent = new Float32Array(dim);
      let count = 0;
      for (let i = 0; i < vectors.length; i++) {
        if (assignments[i] === c) { addVec(newCent, vectors[i]); count++; }
      }
      if (count > 0) {
        for (let j = 0; j < dim; j++) newCent[j] /= count;
        normalizeVec(newCent);
        centroids[c] = newCent;
      }
    }
  }

  // Build clusters
  const clusters = Array.from({ length: k }, () => ({ docs: [], vectors: [] }));
  for (let i = 0; i < vectors.length; i++) {
    clusters[assignments[i]].docs.push(docs[i]);
    clusters[assignments[i]].vectors.push(vectors[i]);
  }

  // Sort by size descending, filter out tiny clusters
  return clusters
    .map((c, i) => ({ ...c, centroid: centroids[i], id: i }))
    .filter(c => c.docs.length >= 3)
    .sort((a, b) => b.docs.length - a.docs.length);
}

// Pick representative posts from a cluster — diverse sample near centroid
export function sampleCluster(cluster, n = 8) {
  const { docs, vectors, centroid } = cluster;
  // Score by similarity to centroid
  const scored = docs.map((d, i) => ({
    doc: d,
    sim: cosineSimilarity(vectors[i], centroid),
  }));
  scored.sort((a, b) => b.sim - a.sim);

  // Take top-n closest to centroid, but spread across time
  const candidates = scored.slice(0, Math.min(n * 3, scored.length));
  candidates.sort((a, b) => {
    const da = a.doc.createdAt ? new Date(a.doc.createdAt).getTime() : 0;
    const db = b.doc.createdAt ? new Date(b.doc.createdAt).getTime() : 0;
    return da - db;
  });

  // Evenly sample across sorted candidates
  const step = Math.max(1, Math.floor(candidates.length / n));
  const sampled = [];
  for (let i = 0; i < candidates.length && sampled.length < n; i += step) {
    sampled.push(candidates[i].doc);
  }
  return sampled;
}

// ---- LLM prompt builders ----

function postCitation(doc) {
  const date = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '?';
  const url = doc.rkey && doc.did
    ? `https://bsky.app/profile/${doc.did}/post/${doc.rkey}`
    : null;
  return { date, url, text: doc.text };
}

function formatPosts(docs) {
  return docs.map((d, i) => {
    const c = postCitation(d);
    return `[${i + 1}] (${c.date}) ${c.text}${c.url ? `\n    → ${c.url}` : ''}`;
  }).join('\n\n');
}

// Pass 1 (no embeddings): Identify themes from a broad chronological sample
export function buildThemePromptFromSample(posts, handle) {
  const formatted = formatPosts(posts);

  return {
    role: 'user',
    content: `You are analyzing the Bluesky posting history for @${handle}. Below is a representative sample of ${posts.length} posts spanning their full history, from earliest to most recent.

Identify the 5-8 main themes/topics this person posts about.

For each theme:
1. A short theme label (2-5 words)
2. A one-sentence description

Then provide their 3-5 dominant interests.

Posts:
${formatted}

Respond in this exact JSON format:
{
  "themes": [
    { "cluster": 1, "label": "...", "description": "..." },
    ...
  ],
  "dominant_interests": ["...", "...", "..."]
}`
  };
}

// Pass 1 (with embeddings): Identify themes from cluster samples
export function buildThemePrompt(clusters, handle) {
  const clusterSummaries = clusters.slice(0, 12).map((cluster, i) => {
    const samples = sampleCluster(cluster, 6);
    return `### Cluster ${i + 1} (${cluster.docs.length} posts)\n${formatPosts(samples)}`;
  }).join('\n\n---\n\n');

  return {
    role: 'user',
    content: `You are analyzing the complete Bluesky posting history for @${handle}. Below are representative posts from ${clusters.length} topic clusters discovered through semantic analysis of all their posts.

For each cluster, identify:
1. A short theme label (2-5 words)
2. A one-sentence description of what this person posts about in this area

Then provide an overall summary: what are this person's 3-5 dominant interests?

${clusterSummaries}

Respond in this exact JSON format:
{
  "themes": [
    { "cluster": 1, "label": "...", "description": "..." },
    ...
  ],
  "dominant_interests": ["...", "...", "..."]
}`
  };
}

// Pass 2: Trace narrative arcs for top themes
export function buildArcPrompt(themeLabel, chronologicalPosts, handle) {
  const formatted = formatPosts(chronologicalPosts);

  return {
    role: 'user',
    content: `You are tracing the narrative arc of @${handle}'s relationship with "${themeLabel}" over time. Below are their posts on this topic, ordered chronologically from earliest to most recent.

Analyze how their perspective, knowledge, engagement, or emotional tone around this topic has evolved. Look for:
- **Origin moment**: When and how did this interest first appear?
- **Evolution**: How did their thinking/posting change over time?
- **Key shifts**: Any turning points, revelations, or changes in stance?
- **Current state**: Where do they stand now on this topic?

IMPORTANT: Cite specific posts by their number [N] and date as evidence for each claim.

Posts on "${themeLabel}":
${formatted}

Respond in this exact JSON format:
{
  "arc_title": "A compelling 5-10 word title for this narrative arc",
  "origin": { "summary": "...", "citations": [1, 3] },
  "evolution": { "summary": "...", "citations": [4, 7, 9] },
  "key_shifts": [
    { "summary": "...", "citations": [5] }
  ],
  "current_state": { "summary": "...", "citations": [12, 14] },
  "arc_type": "one of: discovery, deepening, disillusionment, transformation, ongoing-exploration, mastery, advocacy"
}`
  };
}

// Pass 3: Synthesize full profile
export function buildProfilePrompt(themes, arcs, temporalStats, handle) {
  const arcSummaries = arcs.map((a, i) =>
    `${i + 1}. "${a.arc_title}" (${a.arc_type}): ${a.origin?.summary || ''} → ${a.current_state?.summary || ''}`
  ).join('\n');

  const themeList = themes.map(t => `- ${t.label}: ${t.description}`).join('\n');

  return {
    role: 'user',
    content: `You are creating a personality dossier for @${handle} based on deep analysis of their complete Bluesky posting history.

## Discovered Themes
${themeList}

## Narrative Arcs
${arcSummaries}

## Posting Patterns
- Total posts analyzed: ${temporalStats.totalPosts}
- Active since: ${temporalStats.firstPost}
- Most recent: ${temporalStats.lastPost}
- Most active quarter: ${temporalStats.peakQuarter} (${temporalStats.peakCount} posts)

Create a personality profile with these sections. Be specific, insightful, and reference the evidence. Avoid generic platitudes — ground every claim in what this person actually posts about.

Respond in this exact JSON format:
{
  "tagline": "A witty 5-10 word tagline that captures this person's essence",
  "personality_traits": [
    { "trait": "...", "evidence": "...", "strength": 0.0-1.0 }
  ],
  "strengths": [
    { "strength": "...", "evidence": "..." }
  ],
  "blind_spots": [
    { "area": "...", "observation": "..." }
  ],
  "interests_ranked": [
    { "interest": "...", "depth": "casual|engaged|passionate|obsessed" }
  ],
  "communication_style": "...",
  "surprising_finding": "..."
}`
  };
}

// ---- Pipeline orchestrator ----

export async function generateDossier({
  docs,
  vectors,
  handle,
  streamChat,
  provider,
  apiKey,
  onProgress,
}) {
  const progress = (step, detail) => onProgress?.({ step, detail });

  // Step 1: Temporal stats
  progress('temporal', 'Analyzing posting timeline...');
  const buckets = bucketByQuarter(docs);
  const totalPosts = docs.length;
  const sorted = docs.filter(d => d.createdAt).sort((a, b) =>
    new Date(a.createdAt) - new Date(b.createdAt)
  );
  const firstPost = sorted[0]?.createdAt ? new Date(sorted[0].createdAt).toLocaleDateString() : '?';
  const lastPost = sorted[sorted.length - 1]?.createdAt
    ? new Date(sorted[sorted.length - 1].createdAt).toLocaleDateString() : '?';
  const peakBucket = buckets.reduce((best, b) =>
    b.posts.length > (best?.posts.length || 0) ? b : best, null);
  const temporalStats = {
    totalPosts,
    firstPost,
    lastPost,
    peakQuarter: peakBucket?.period || '?',
    peakCount: peakBucket?.posts.length || 0,
  };

  // Step 2: Discover themes
  // If we have embeddings, cluster. Otherwise, sample broadly and let the LLM find themes.
  let clusters = null;

  if (vectors && vectors.length > 0) {
    progress('clustering', 'Discovering topic clusters...');
    const k = Math.min(12, Math.max(5, Math.floor(docs.length / 100)));
    clusters = kmeansCluster(vectors, docs, k);
    progress('clustering', `Found ${clusters.length} topic clusters`);
  }

  // Step 3: LLM Pass 1 — Themes
  progress('themes', 'Identifying themes...');

  let themePrompt;
  if (clusters && clusters.length > 0) {
    themePrompt = buildThemePrompt(clusters, handle);
  } else {
    // No embeddings — send a broad chronological sample to the LLM
    const sample = sampleTimeline(sorted, 80);
    themePrompt = buildThemePromptFromSample(sample, handle);
  }

  const themeMessages = [
    { role: 'system', content: 'You are a perceptive analyst creating a personality profile from social media posts. Always respond with valid JSON only, no markdown fences.' },
    themePrompt,
  ];

  let themes = [];
  let dominantInterests = [];
  const themeText = await collectStream(streamChat, { provider, apiKey, messages: themeMessages });
  try {
    const parsed = JSON.parse(cleanJson(themeText));
    themes = parsed.themes || [];
    dominantInterests = parsed.dominant_interests || [];
  } catch (e) {
    console.error('Theme parse failed:', e, themeText);
    themes = [];
  }

  // Step 4: LLM Pass 2 — Narrative arcs (top 4 themes)
  const topThemes = themes.slice(0, 4);
  const arcs = [];

  for (let i = 0; i < topThemes.length; i++) {
    const theme = topThemes[i];
    progress('arcs', `Tracing arc ${i + 1}/${topThemes.length}: "${theme.label}"...`);

    // Find posts related to this theme via keyword match from its label/description
    const themeTerms = (theme.label + ' ' + (theme.description || ''))
      .toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    const related = sorted.filter(d => {
      const text = d.text.toLowerCase();
      return themeTerms.some(t => text.includes(t));
    });

    // If we had clusters, use those; otherwise use keyword-matched posts
    let chronPosts;
    if (clusters && clusters.length > 0) {
      const cluster = clusters[theme.cluster - 1] || clusters[i];
      chronPosts = cluster
        ? [...cluster.docs].filter(d => d.createdAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : related;
    } else {
      chronPosts = related.length >= 5 ? related : sorted;
    }

    const arcSample = sampleTimeline(chronPosts, 20);
    const arcPrompt = buildArcPrompt(theme.label, arcSample, handle);
    const arcMessages = [
      { role: 'system', content: 'You are a perceptive narrative analyst. Always respond with valid JSON only, no markdown fences.' },
      arcPrompt,
    ];

    const arcText = await collectStream(streamChat, { provider, apiKey, messages: arcMessages });
    try {
      const parsed = JSON.parse(cleanJson(arcText));
      // Attach citation URLs
      parsed._posts = arcSample.map(postCitation);
      arcs.push(parsed);
    } catch (e) {
      console.error(`Arc parse failed for "${theme.label}":`, e);
      arcs.push({
        arc_title: theme.label,
        arc_type: 'ongoing-exploration',
        origin: { summary: 'Could not trace arc', citations: [] },
        evolution: { summary: '', citations: [] },
        key_shifts: [],
        current_state: { summary: '', citations: [] },
        _posts: arcSample.map(postCitation),
      });
    }
  }

  // Step 5: LLM Pass 3 — Profile synthesis
  progress('profile', 'Synthesizing personality profile...');
  const profilePrompt = buildProfilePrompt(themes, arcs, temporalStats, handle);
  const profileMessages = [
    { role: 'system', content: 'You are a brilliant personality analyst creating an insightful, evidence-based profile. Always respond with valid JSON only, no markdown fences.' },
    profilePrompt,
  ];

  const profileText = await collectStream(streamChat, { provider, apiKey, messages: profileMessages });
  let profile = {};
  try {
    profile = JSON.parse(cleanJson(profileText));
  } catch (e) {
    console.error('Profile parse failed:', e, profileText);
    profile = {
      tagline: `@${handle} on Bluesky`,
      personality_traits: [],
      strengths: [],
      blind_spots: [],
      interests_ranked: [],
      communication_style: 'Could not analyze',
      surprising_finding: '',
    };
  }

  progress('done', 'Dossier complete');

  return {
    handle,
    temporalStats,
    themes,
    dominantInterests,
    arcs,
    profile,
    clusters: clusters ? clusters.map(c => ({ size: c.docs.length })) : [],
    generatedAt: new Date().toISOString(),
  };
}

// ---- Helpers ----

// Evenly sample across a timeline
function sampleTimeline(posts, n) {
  if (posts.length <= n) return posts;
  // Always include first 3 and last 3
  const head = posts.slice(0, 3);
  const tail = posts.slice(-3);
  const middle = posts.slice(3, -3);
  const remaining = n - 6;
  const step = Math.max(1, Math.floor(middle.length / remaining));
  const sampled = [];
  for (let i = 0; i < middle.length && sampled.length < remaining; i += step) {
    sampled.push(middle[i]);
  }
  return [...head, ...sampled, ...tail];
}

// Collect full text from a streaming generator
async function collectStream(streamChat, { provider, apiKey, messages }) {
  let text = '';
  const gen = streamChat({ provider, apiKey, messages });
  for await (const chunk of gen) {
    text += chunk;
  }
  return text;
}

// Clean JSON from LLM output (strip markdown fences etc)
function cleanJson(text) {
  let s = text.trim();
  // Strip markdown code fences
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return s.trim();
}
