export const STAGES = [
  { id: 'ideate', label: 'Ideate', detail: '12 pitches across genres', status: 'done' },
  { id: 'cut1',   label: 'Round 1 cut', detail: 'rubric · top 4 advance', status: 'done' },
  { id: 'cast',   label: 'Characters', detail: 'v1 · revisit after storyboards', status: 'done' },
  { id: 'outline', label: 'Outline', detail: 'beats · shifts · risks logged', status: 'done' },
  { id: 'cut2',   label: 'Round 2 cut', detail: 'rubric · top 2 advance', status: 'done' },
  { id: 'draft',  label: 'Draft', detail: 'prose pass at full length', status: 'pending' },
  { id: 'ship',   label: 'Ship', detail: 'edit, score, publish', status: 'pending' },
];

export const RUBRIC = [
  {
    key: 'engine',
    label: 'Engine',
    description: 'Is there a small repeated motion that pulls a reader past sentence fifty?',
  },
  {
    key: 'fit',
    label: 'Conceit fit',
    description: 'Does the seed-to-story conceit land structurally, not just thematically?',
  },
  {
    key: 'ending',
    label: 'Ending',
    description: 'Does the final image arrive in closed form — surprising and earned?',
  },
  {
    key: 'voice',
    label: 'Voice',
    description: 'Would the prose be unmistakably different from the other eleven?',
  },
  {
    key: 'risk',
    label: 'Risk',
    description: 'Is the writer on the hook for something that could plausibly fail?',
  },
];

// Each axis scored 1-5. Sum is /25. Top 4 advance.
export const SCORES = {
  'kolmogorov':            { engine: 5, fit: 5, ending: 5, voice: 4, risk: 5 },
  'concordance':           { engine: 5, fit: 5, ending: 4, voice: 4, risk: 4 },
  'lossy':                 { engine: 4, fit: 5, ending: 4, voice: 5, risk: 4 },
  'weight-of-said':        { engine: 5, fit: 4, ending: 4, voice: 4, risk: 5 },
  'compliance-window':     { engine: 5, fit: 5, ending: 5, voice: 5, risk: 4 },
  'sparse-representation': { engine: 4, fit: 5, ending: 4, voice: 3, risk: 3 },
  'tally-stick':           { engine: 5, fit: 5, ending: 5, voice: 4, risk: 4 },
  'length-of-this-post':   { engine: 4, fit: 3, ending: 4, voice: 4, risk: 3 },
  'eight-fourteen':        { engine: 5, fit: 5, ending: 5, voice: 4, risk: 5 },
  'salla':                 { engine: 4, fit: 4, ending: 5, voice: 4, risk: 4 },
  'post-that-read-me-back':{ engine: 4, fit: 5, ending: 5, voice: 4, risk: 4 },
  'pelo':                  { engine: 4, fit: 4, ending: 5, voice: 4, risk: 4 },
};

export function totalFor(id) {
  const s = SCORES[id];
  if (!s) return 0;
  return s.engine + s.fit + s.ending + s.voice + s.risk;
}

// Top 4 by total advance. Ties broken by Engine, then Ending.
export const ADVANCED_IDS = (() => {
  const ranked = Object.keys(SCORES)
    .map(id => ({ id, total: totalFor(id), s: SCORES[id] }))
    .sort((a, b) =>
      b.total - a.total ||
      b.s.engine - a.s.engine ||
      b.s.ending - a.s.ending
    );
  return new Set(ranked.slice(0, 4).map(r => r.id));
})();

export function isAdvanced(id) { return ADVANCED_IDS.has(id); }

// ---- Round 2: pitch + cast + outline in hand. We are scoring the spark. ----

export const RUBRIC_R2 = [
  {
    key: 'spark',
    label: 'Spark',
    description: `The load-bearing scene's voltage. Does it crackle when you imagine reading it?`,
  },
  {
    key: 'force',
    label: 'Character force',
    description: `Do the two contradictions pull on each other? Will the prose discover something the outline did not already say?`,
  },
  {
    key: 'sustain',
    label: 'Engine sustain',
    description: `At beat 4, beat 5, beat 6 — is the small repeated motion still finding new things, or running on fumes?`,
  },
  {
    key: 'edge',
    label: 'Risk legibility',
    description: `Is the named risk the right risk? Does it expose a real edge, not a fake one?`,
  },
  {
    key: 'surprise',
    label: 'Surprise margin',
    description: `Room in the structure for the prose to surprise the writer.`,
  },
];

// Each axis 1-5. Sum is /25. Top 2 advance to draft.
export const SCORES_R2 = {
  'kolmogorov':         { spark: 5, force: 4, sustain: 4, edge: 5, surprise: 4 },
  'compliance-window':  { spark: 5, force: 5, sustain: 5, edge: 5, surprise: 4 },
  'eight-fourteen':     { spark: 4, force: 4, sustain: 3, edge: 5, surprise: 3 },
  'tally-stick':        { spark: 4, force: 4, sustain: 5, edge: 5, surprise: 4 },
};

export function totalR2(id) {
  const s = SCORES_R2[id];
  if (!s) return 0;
  return s.spark + s.force + s.sustain + s.edge + s.surprise;
}

// Top 2. Tiebreak: Spark, then Character force, then Engine sustain.
export const DRAFT_IDS = (() => {
  const ranked = Object.keys(SCORES_R2)
    .map(id => ({ id, total: totalR2(id), s: SCORES_R2[id] }))
    .sort((a, b) =>
      b.total - a.total ||
      b.s.spark - a.s.spark ||
      b.s.force - a.s.force ||
      b.s.sustain - a.s.sustain
    );
  return new Set(ranked.slice(0, 2).map(r => r.id));
})();

export function isDrafting(id) { return DRAFT_IDS.has(id); }
