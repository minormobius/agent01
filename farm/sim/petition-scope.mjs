// petition-scope.mjs — THE MOAT. The town council (an automated Claude session working player
// petitions) develops on claude/farm-petitions; this script is the mechanical wall that decides
// what that branch may touch. Prompts are soft — petitions are untrusted text and a persuasive
// one might talk a model into anything — so the enforcement is a DIFF CHECK, not an instruction:
// any file outside the sandbox fails the run, and the promotion workflow never ships it.
//
//   ALLOWED  farm/js/themes.js        skins: palettes + unlock predicates (Tier 1)
//            farm/js/achievements.js  deeds — APPEND-ONLY (ids may never vanish or change)
//            farm/commons/**          community content pack (crops etc. — Tier 2, gate-checked)
//            farm/knobs.json          bounded tuning knobs (Tier 2, gate-checked)
//            farm/council/**          the queue + the town ledger
//   DENIED   everything else — above all state.js (save shape), lexicons (public contracts),
//            store/auth (scopes), vendor/ (COPY-NEVER-FORK), the sims and thresholds (the
//            examinee never edits the examiner), workflows and wrangler (deploy rails).
//
// Run: node farm/sim/petition-scope.mjs [<base-ref>]   (default: the farm's owning branch)
import { execFileSync } from 'node:child_process';

export const ALLOWED = [
  /^farm\/js\/themes\.js$/,
  /^farm\/js\/achievements\.js$/,
  /^farm\/commons\//,
  /^farm\/knobs\.json$/,
  /^farm\/council\//,
];

export function checkScope(files) {
  const out = { ok: true, denied: [] };
  for (const f of files) {
    if (!ALLOWED.some((re) => re.test(f))) { out.ok = false; out.denied.push(f); }
  }
  return out;
}

// deeds are public records keyed by id (rkey = achievement id, minted into players' own repos).
// Removing or renaming one would orphan records already published — so the ledger of deeds only
// ever grows. New entries are welcome; history is not negotiable.
export function checkAppendOnly(baseSrc, headSrc) {
  const ids = (src) => new Set([...src.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]));
  const base = ids(baseSrc), head = ids(headSrc);
  const missing = [...base].filter((id) => !head.has(id));
  return { ok: missing.length === 0, missing };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const baseRef = process.argv[2] || 'origin/claude/farmville-atproto-game-745mcr';
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
  const files = git('diff', '--name-only', baseRef + '...HEAD').split('\n').filter(Boolean);
  console.log('━━━ THE MOAT — council diff vs ' + baseRef + ' (' + files.length + ' files) ━━━');
  if (!files.length) { console.log('  (empty diff — nothing to judge)'); process.exit(0); }
  const scope = checkScope(files);
  for (const f of files) console.log((scope.denied.includes(f) ? '  ✗ ' : '  ✓ ') + f);
  if (!scope.ok) {
    console.error('\n✗ OUT OF BOUNDS — the council may not touch: ' + scope.denied.join(', '));
    process.exit(1);
  }
  if (files.includes('farm/js/achievements.js')) {
    const base = git('show', baseRef + ':farm/js/achievements.js');
    const head = git('show', 'HEAD:farm/js/achievements.js');
    const ap = checkAppendOnly(base, head);
    if (!ap.ok) {
      console.error('\n✗ DEEDS ARE APPEND-ONLY — missing ids: ' + ap.missing.join(', '));
      process.exit(1);
    }
    console.log('  ✓ deeds append-only holds');
  }
  console.log('\n✓ the council stayed inside its walls');
}
