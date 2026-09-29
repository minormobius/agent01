#!/usr/bin/env bash
# prepare.sh <request.json> — make the factory checkout (cwd) look as it did when the request arrived.
#
# The factory branch itself tracks tenant copies (lab/www/*), requester profiles
# and every request file's LATEST turn. Left as they are, a builder can Grep its
# slug and read the published answer and the requester's later complaints — the
# ab-01 pilot did exactly that (a renamed copy of the site, and "pan is inverted
# x" from a follow-up). So those three trees are replaced by their state at the
# request's time (the factory branch, then lab-www over it), the site's own dir
# is removed, and the only request file for this slug is this request. Tooling,
# kit and pipeline stay today's: this measures a change to the pipeline as it is.
set -euo pipefail
REQ=$(realpath "$1")
AT=$(node -p "require('$REQ').requestedAt")
SLUG=$(node -p "require('$REQ').slug")
FT=$(git rev-list -1 --before="$AT" origin/claude/minomobi-landing-page-vg37b8 || true)
LW=$(git rev-list -1 --before="$AT" origin/claude/lab-www || true)
git rm -rq --ignore-unmatch lab/www .github/lab-requests lab/_profiles
rm -rf lab/www .github/lab-requests lab/_profiles
for REF in $FT $LW; do
  for P in lab/www lab/_profiles .github/lab-requests; do
    [ -n "$(git ls-tree --name-only "$REF" -- "$P")" ] && git checkout "$REF" -- "$P"
  done
done
rm -rf "lab/www/$SLUG"
mkdir -p .github/lab-requests
node -e 'const j=require(process.argv[1]);delete j._source;require("fs").writeFileSync(process.argv[2],JSON.stringify(j,null,2)+"\n")' "$REQ" ".github/lab-requests/$SLUG.json"
git add -A && git commit -q -m "held-out: the tree as of $AT, minus $SLUG" --allow-empty
echo "factory tenants/profiles/requests as of $AT (factory ${FT:0:9}, lab-www ${LW:0:9}): $(ls lab/www | wc -l) sites, $(ls .github/lab-requests | wc -l) request files"
