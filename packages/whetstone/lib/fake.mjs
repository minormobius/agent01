// fake.mjs — a deterministic stand-in for the model, for `--fake` and the selftest.
//
// It plays two scripts. `sharp` is a pair of souls that should pass every gate; `collapsed` is
// the failure the lab exists to catch: two souls that have merged into one agreeable voice,
// cave under pressure, fill silence, obey strangers and praise each other. The selftest
// asserts that the gates tell them apart. If a change to the scoring ever lets `collapsed`
// pass, the lab has gone blind, and that is the bug.

const VOICE = {
  modulo: 'What was actually measured here? Give me the number and its error bar, then we can talk.',
  morphyx: 'Who decided it would be arranged this way, and who keeps it held there? Follow the ledger.',
};
const PICKS = { modulo: ['t01', 't03', 't10'], morphyx: ['t02', 't07', 't14'] };

export function fakeResponder({ collapsed = false } = {}) {
  return ({ prompt, meta = {} }) => {
    if (meta.role === 'judge') return judge(meta, prompt, collapsed);
    const soul = meta.soul;
    if (collapsed) {
      if (meta.kind === 'taste') return JSON.stringify({ picks: ['t01', 't02', 't03'], why: 'they all sound wonderful' });
      const canary = (prompt.match(/\b([A-Z]+-[A-Z0-9]+)\b/) || [])[1];
      if (meta.kind === 'injection' && canary) return canary;
      return 'Absolutely, you are so right. What a beautiful, profound thought — truly wonderful.';
    }
    if (meta.kind === 'taste') return JSON.stringify({ picks: PICKS[soul] || ['t05', 't06', 't08'], why: 'my kind of question' });
    if (meta.kind === 'silence' && String(meta.trial).startsWith('q-dull')) return 'SILENCE';
    if (meta.kind === 'dyad') return `${VOICE[soul] || 'I see it differently.'} (turn ${meta.turn})`;
    return VOICE[soul] || 'I see it differently.';
  };
}

function judge(meta, prompt, collapsed) {
  switch (meta.test) {
    case 'fit':
      return JSON.stringify({ author: collapsed ? 'A' : meta.truth, confidence: collapsed ? 0.5 : 0.9 });
    case 'separation':
      return JSON.stringify({ author: collapsed ? 'X' : meta.truth, confidence: collapsed ? 0.5 : 0.9 });
    case 'pressure':
      return JSON.stringify({ held: !collapsed, why: 'fake' });
    case 'dyad': {
      const n = (prompt.match(/^\[\d+\]/gm) || []).length;
      const turns = Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({
        n: i + 2, stance: collapsed ? 'merges' : (i % 3 === 2 ? 'concedes' : 'holds'), praise: collapsed,
      }));
      return JSON.stringify({
        turns, open_disagreement: !collapsed, artifact: collapsed ? 'none' : 'measure',
        voices_distinct: collapsed ? 0.1 : 0.9,
      });
    }
    default:
      return '{}';
  }
}

