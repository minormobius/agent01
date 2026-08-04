// Dossier generation pipeline
// Multi-pass LLM analysis over a temporally-sampled reading of someone's posts.
//
// Pipeline:
// 1. Temporal bucketing — group posts by quarter
// 2. LLM Pass 1 — Themes, from a sample spread across the whole timeline
// 3. LLM Pass 2 — Narrative arc per theme, from keyword-matched posts
// 4. LLM Pass 3 — Profile synthesis (traits, strengths, interests)
//
// There used to be a k-means-over-embeddings step between 1 and 2, with a
// second set of prompts fed from the clusters. Sleuth stopped computing
// embeddings when it moved to listRecords + TF-IDF and passed `vectors: null`
// from then on, so that whole path was unreachable — and it stayed in the file
// long enough to be described in the surface's review doc as how this works.
// Deleted rather than left dark. If clustering comes back it needs a vector
// source first, and `git log` has the old code.

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

// Pass 1: Identify themes from a sample spread across the whole timeline
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

  // Step 2: LLM Pass 1 — Themes, from a sample spread across the timeline
  progress('themes', 'Identifying themes...');

  const themePrompt = buildThemePromptFromSample(sampleTimeline(sorted, 80), handle);

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

    // Enough keyword matches to trace an arc? Use them. Otherwise fall back to
    // the whole timeline — a thin arc beats no arc.
    const chronPosts = related.length >= 5 ? related : sorted;

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
