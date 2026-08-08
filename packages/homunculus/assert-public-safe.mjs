/**
 * The flip-back gate.
 *
 *   node assert-public-safe.mjs
 *
 * The recovery pass runs with the repo temporarily private, and the session
 * transcripts sit on feature branches while it does. This refuses to give the
 * all-clear until every one of those transcripts is gone from every branch —
 * because the moment the repo goes public, anything left on a branch is
 * world-readable, and git history means a later "delete the file" commit does
 * not undo that.
 *
 * Exit 0 and "SAFE" only when no branch carries `homunculus/inbox/`. Any hit,
 * exit 1 with the branches named. This is the check you run before flipping
 * visibility, and the answer is a gate, not advice: do not go public on a red.
 *
 * The symmetry with preflight's "prompt log stays unserved" is deliberate —
 * an exposure you have to remember is an exposure that will eventually leak,
 * so it is made mechanical.
 */

import { branchesWithInbox, INBOX } from './branch-corpus.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  const carrying = branchesWithInbox();

  if (!carrying.length) {
    console.log(`\n  SAFE — no branch carries ${INBOX}. The repo may go public.\n`);
    process.exit(0);
  }

  const total = carrying.reduce((n, b) => n + b.files.length, 0);
  console.error(
    `\n  NOT SAFE TO GO PUBLIC.\n\n` +
      `  ${total} transcript file(s) still live on ${carrying.length} branch(es):\n`
  );
  for (const { branch, files } of carrying) {
    console.error(`    ${branch}  (${files.length})`);
  }
  console.error(
    `\n  Collect them (node collect-branches.mjs --out ...), then remove them:\n` +
      `  for each branch, delete ${INBOX} and force-push, or delete the branch.\n` +
      `  Re-run this until it says SAFE. Do not flip the repo to public before then.\n`
  );
  process.exit(1);
}
