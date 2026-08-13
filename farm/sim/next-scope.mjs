// next-scope.mjs — THE TESTING TABLE'S WALLS. Experiments on claude/farm-next may touch the
// GAME — kernel, UI, renderers, themes, achievements — because that is the point: a petition
// becomes playable within the hour. What they may NOT touch is anything whose blast radius
// reaches beyond the players who opted into the testing link:
//
//   - farm/js/store.js + farm/vendor/auth.js   the sync/auth rails (scopes, token handling)
//   - farm/wrangler*.jsonc                     worker names + domains (the golden rule)
//   - farm/lexicons/**                         public record contracts
//   - farm/sim/**                              the examiner (scales, moats, sweeps) — never the examinee's to edit
//   - farm/test/covenant.selftest.mjs          the save covenant's seatbelt
//   - farm/PETITIONS.md, farm/CLAUDE.md        the law and the surface docs
//   - anything outside farm/                   other surfaces, workflows, the auth worker
//
// The save covenant itself (never bump v, keep state in farm.x) is enforced by the covenant
// selftest, which runs — unedited, by this wall — in every testing-table deploy.
// Run: node farm/sim/next-scope.mjs [<base-ref>]
import { execFileSync } from 'node:child_process';

export const DENIED = [
  /^(?!farm\/)/,                            // outside farm/ entirely
  /^farm\/js\/store\.js$/,
  /^farm\/vendor\/auth\.js$/,
  /^farm\/wrangler[^/]*\.jsonc$/,
  /^farm\/lexicons\//,
  /^farm\/sim\//,
  /^farm\/test\/covenant\.selftest\.mjs$/,
  /^farm\/PETITIONS\.md$/,
  /^farm\/CLAUDE\.md$/,
  /^farm\/\.assetsignore$/,
];

export function checkNextScope(files) {
  const out = { ok: true, denied: [] };
  for (const f of files) {
    if (DENIED.some((re) => re.test(f))) { out.ok = false; out.denied.push(f); }
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const baseRef = process.argv[2] || 'origin/claude/farmville-atproto-game-745mcr';
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
  const files = git('diff', '--name-only', baseRef + '...HEAD').split('\n').filter(Boolean);
  console.log('━━━ THE TESTING TABLE\'S WALLS — diff vs ' + baseRef + ' (' + files.length + ' files) ━━━');
  if (!files.length) { console.log('  (empty diff — nothing to judge)'); process.exit(0); }
  const r = checkNextScope(files);
  for (const f of files) console.log((r.denied.includes(f) ? '  ✗ ' : '  ✓ ') + f);
  if (!r.ok) {
    console.error('\n✗ OUT OF BOUNDS for an experiment: ' + r.denied.join(', '));
    process.exit(1);
  }
  console.log('\n✓ the experiment stays on the table');
}
