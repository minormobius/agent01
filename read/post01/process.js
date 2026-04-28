export const STAGES = [
  { id: 'ideate', label: 'Ideate', detail: '12 pitches across genres', status: 'done' },
  { id: 'cut1',   label: 'Round 1 cut', detail: 'rubric · top 4 advance', status: 'done' },
  { id: 'cast',   label: 'Characters', detail: 'v1 · revisit after storyboards', status: 'done' },
  { id: 'outline', label: 'Outline', detail: 'spine + stakes per finalist', status: 'pending' },
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
