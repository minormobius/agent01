#!/usr/bin/env bash
# Commit the ideas ledgers and get them onto the branch, or fail loudly.
#
#   scripts/ideas-push.sh "ideas: posted 2026-07-30T01:00Z" .github/ideas/queue.jsonl
#
# WHY THIS IS A SCRIPT AND NOT THREE COPIES OF A LOOP. Pull, review and post all
# write .github/ideas/ on their own schedules and all push to the same branch, so
# all three race, and all three carried the same twelve-line retry loop:
#
#   for attempt in 1 2 3 4; do
#     git push && break || { git pull --rebase --autostash; sleep $((attempt*2)); }
#   done
#
# That loop had two faults, and both were invisible until they fired.
#
# ONE — it could not survive the conflict it existed to handle. `run:` blocks are
# `bash -e {0}`, and errexit is NOT suspended inside the `{ … }` on the right of
# an `||`, so a failing `git pull --rebase` killed the step on the first attempt
# with a rebase half-applied. Attempts 2-4 never ran. Run 30500800107 died exactly
# there: review appended to queue.jsonl, post had stamped its last line, and git
# said CONFLICT. `merge=union` in .gitattributes is what stops that conflict; this
# script is what stops the next unhandled one from being silent.
#
# TWO — it reported success when it gave up. If the fourth `git push` failed, the
# recovery group ran, `sleep` returned 0, the loop ended, and the step went green
# having pushed nothing. The commit then sat on a runner that was about to be
# deleted. A post recorded nowhere is a post that goes out again next hour, so
# this is the fault that would have duplicated a live post under the operator's
# name.
#
# Everything here is deliberately noisy. There is no human watching these runs.

set -uo pipefail

MESSAGE="${1:?usage: ideas-push.sh <commit message> <path>...}"
shift
[ "$#" -gt 0 ] || { echo "::error::ideas-push.sh needs at least one path"; exit 2; }

BRANCH="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
ATTEMPTS="${IDEAS_PUSH_ATTEMPTS:-4}"

git config user.name "ideas-bot"
git config user.email "admin@mino.mobi"

# Collapse before committing as well as after rebasing. A duplicate can also
# arrive from a generator run twice in one job, and it is cheaper to never commit
# one than to explain one later.
node scripts/ideas-dedupe.mjs --write

git add -- "$@"
if git diff --staged --quiet; then
  echo "nothing to record — the ledgers are unchanged"
  exit 0
fi

git commit -q -m "$MESSAGE"
echo "committed: $MESSAGE"

for attempt in $(seq 1 "$ATTEMPTS"); do
  if git push origin "HEAD:$BRANCH"; then
    echo "pushed on attempt $attempt"
    exit 0
  fi

  echo "push rejected (attempt $attempt of $ATTEMPTS) — rebasing onto origin/$BRANCH"
  if ! git pull --rebase --autostash origin "$BRANCH"; then
    # With merge=union a ledger cannot conflict, so reaching here means something
    # ELSE conflicted, and guessing at it would be worse than stopping. Abort so
    # the working tree is not left mid-rebase, and say what to look at.
    echo "::error::rebase onto origin/$BRANCH conflicted outside the union-merged ledgers — see .gitattributes and resolve by hand"
    git rebase --abort || true
    git status --short || true
    exit 1
  fi

  # Union merge keeps both sides' lines, which for a record edited on both sides
  # means the record twice. Collapse it and fold the result into our own commit,
  # so what lands is one clean commit rather than a commit plus a repair.
  node scripts/ideas-dedupe.mjs --write
  if ! git diff --quiet -- "$@"; then
    echo "union merge left duplicates; collapsed them into the commit"
    git add -- "$@"
    git commit -q --amend --no-edit
  fi

  sleep "$((attempt * 2))"
done

echo "::error::could not push the ideas ledgers to $BRANCH after $ATTEMPTS attempts — the commit exists only on this runner and will be lost"
exit 1
