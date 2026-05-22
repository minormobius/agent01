// Template registry + a thin wrapper that gives each template a stable
// runtime contract. The DO calls into this; templates don't know about
// websockets or storage.

import { template as promptSubmitVote } from './templates/prompt-submit-vote.js';

const TEMPLATES = {
  [promptSubmitVote.id]: promptSubmitVote,
};

export function getTemplate(id) {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`unknown template: ${id}`);
  return t;
}

export function compileGame(mdText) {
  // Peek at frontmatter to find the template id.
  const firstHundred = mdText.slice(0, 2000);
  const m = firstHundred.match(/template\s*:\s*([A-Za-z0-9_\-]+)/);
  if (!m) throw new Error('game .md must declare `template: <id>` in frontmatter');
  const t = getTemplate(m[1]);
  return t.compile(mdText);
}

export function listTemplates() {
  return Object.keys(TEMPLATES);
}
