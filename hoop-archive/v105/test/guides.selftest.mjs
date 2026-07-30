// node hoop/v105/test/guides.selftest.mjs
// The bible's guide chain: pickBibleGuides pins one load-bearing guide per zone (Olo·Solen·Sevin·Luna),
// in tier order, against the real content pool — and never breaks when a name is missing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { importWorldExport } from '../story/import.js';
import { pickBibleGuides, BIBLE_GUIDE_NAMES, deriveOpeningCast } from '../story/progression.js';
import { guideForTier } from '../story/decks.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

const HERE = dirname(fileURLToPath(import.meta.url));
const content = importWorldExport(JSON.parse(readFileSync(join(HERE, '../story/world_export.json'), 'utf8'))).content;
const nameOf = (g) => String((g.content || {}).name || '').toLowerCase();

const guides = pickBibleGuides(content);
ok(guides.length === 4, 'four guides, one per zone');
ok(nameOf(guides[0]).includes('olo'), 'tier 1 (The Commons) → Olo Vashti');
ok(nameOf(guides[1]).includes('solen'), 'tier 2 (The Wards) → Factor Solen');
ok(nameOf(guides[2]).includes('sevin'), 'tier 3 (The Upper Rind) → Sevin');
ok(nameOf(guides[3]).includes('luna'), 'tier 4 (The Lower Rind) → Luna');
ok(new Set(guides.map((g) => g.id)).size === 4, 'the four guides are distinct NPCs');

// guideForTier (decks.js) indexes the chain per tier — the seam index.html uses for "return to your guide"
ok(guideForTier(guides, 1).id === guides[0].id && guideForTier(guides, 3).id === guides[2].id, 'guideForTier maps tier → the right zone guide');

// resilience: a name that isn't in the pool falls back to a real NPC (chain never empty)
const fb = pickBibleGuides(content, ['olo', 'nobodyxyz', 'sevin'], 3);
ok(fb.length === 3 && fb.every(Boolean), 'a missing guide name falls back to a real NPC (chain unbroken)');
ok(nameOf(fb[0]).includes('olo') && nameOf(fb[2]).includes('sevin'), 'present names still resolve around a fallback');

// determinism
const a = pickBibleGuides(content).map((g) => g.id).join(), b = pickBibleGuides(content).map((g) => g.id).join();
ok(a === b, 'pickBibleGuides is deterministic');

console.log((bad ? '✗ ' : '✓ ') + 'guides.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
