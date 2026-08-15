/**
 * Sweep the recovery-pass transcripts off the feature branches that carry
 * them. Shared by collect-branches.mjs (gather the corpus) and
 * assert-public-safe.mjs (refuse to go public while any remain).
 *
 * The recovery flow commits each session's transcript to
 * `homunculus/inbox/<session>.json` on that session's own feature branch,
 * while the repo is temporarily private. This module is how that data comes
 * back off the branches — and, more importantly, how we prove it is gone
 * before the repo goes public again. Git keeps history: a transcript left on
 * any branch at flip-back time is exposed, and deleting the file in a later
 * commit does not remove the blob. So "which branches still carry one" is a
 * safety question, not a convenience.
 *
 * `git` is injected so the scanning logic is testable without a repo.
 */

import { execFileSync } from 'node:child_process';

export const INBOX = 'homunculus/inbox/';

const realGit = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 2 ** 30 });

/** Every remote branch name, from ls-remote. */
export function remoteBranches(git = realGit) {
  return git(['ls-remote', '--heads', 'origin'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[1]?.replace('refs/heads/', ''))
    .filter(Boolean);
}

/** The inbox files present on one branch, as their paths. */
export function inboxOnBranch(branch, git = realGit) {
  let listing;
  try {
    listing = git(['ls-tree', '-r', '--name-only', `origin/${branch}`, INBOX]);
  } catch {
    return []; // Branch without the dir at all — ls-tree exits non-zero.
  }
  return listing.split('\n').filter((f) => f.startsWith(INBOX) && f.endsWith('.json'));
}

/**
 * Which branches carry transcripts, and how many each. The list that must be
 * empty before the repo is allowed back to public.
 */
export function branchesWithInbox(git = realGit) {
  const out = [];
  for (const branch of remoteBranches(git)) {
    const files = inboxOnBranch(branch, git);
    if (files.length) out.push({ branch, files });
  }
  return out;
}

/** Read and parse every inbox file on a branch. */
export function readInbox(branch, git = realGit) {
  const rows = [];
  for (const path of inboxOnBranch(branch, git)) {
    let parsed;
    try {
      parsed = JSON.parse(git(['show', `origin/${branch}:${path}`]));
    } catch {
      rows.push({ path, branch, error: true });
      continue;
    }
    rows.push({ path, branch, data: parsed });
  }
  return rows;
}
