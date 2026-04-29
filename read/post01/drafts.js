// Round 3 / Round 4 — drafts. Prose, by beat. Versions newest-first;
// versions[0] is the canonical "latest" pulled into the Story view.

import { compliance_window } from './drafts/compliance-window.js';
import { kolmogorov } from './drafts/kolmogorov.js';
import { kolmogorov_v2 } from './drafts/kolmogorov-v2.js';

export const DRAFTS = {
  'compliance-window': {
    title: 'The Compliance Window',
    versions: [compliance_window],
  },
  'kolmogorov': {
    title: 'The Kolmogorov Prize',
    versions: [kolmogorov_v2, kolmogorov],
  },
};

export function latestDraft(id) {
  const d = DRAFTS[id];
  return d ? d.versions[0] : null;
}
