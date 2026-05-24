#!/usr/bin/env bash
# Publish a self-contained mino.mobi site as a standalone repo on tangled,
# ready to be forked ("remixed"). Run this locally — it needs YOUR tangled
# push credentials, which don't (and shouldn't) live in the repo or the
# Claude sandbox.
#
#   scripts/publish-to-tangled.sh <site-dir> <tangled-git-remote-url>
#
# Example:
#   scripts/publish-to-tangled.sh erdos https://tangled.sh/@you.bsky.social/erdos
#
# Prereq: create an (empty) repo on tangled first via the web UI, copy its
# git remote URL, then run this. Afterwards, in the repo's tangled settings,
# set the deploy directory to the repo root (index.html sits at the top
# level) so it serves at <your-handle>.tngl.sh/<site>.
set -euo pipefail

SITE="${1:?usage: publish-to-tangled.sh <site-dir> <tangled-remote-url>}"
REMOTE="${2:?usage: publish-to-tangled.sh <site-dir> <tangled-remote-url>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/$SITE"
[ -d "$SRC" ] || { echo "✗ no such site dir: $SRC"; exit 1; }
[ -f "$SRC/index.html" ] || { echo "✗ no index.html in $SRC — not a standalone static site"; exit 1; }

# Refuse to publish a site that isn't self-contained (would break once forked).
if grep -qE '\.\./|<script[^>]+src=|<link[^>]+href=' "$SRC/index.html"; then
  echo "⚠  $SITE/index.html references external/relative resources — a fork may not be self-contained."
  echo "   Review the matches before publishing:"
  grep -nE '\.\./|<script[^>]+src=|<link[^>]+href=' "$SRC/index.html" || true
  read -r -p "   Publish anyway? [y/N] " ok
  [ "$ok" = "y" ] || { echo "aborted."; exit 1; }
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "→ staging $SITE in $TMP"
cp -R "$SRC/." "$TMP/"

cat > "$TMP/README.md" <<EOF
# $SITE

A remixable [mino.mobi](https://mino.mobi/$SITE/) site — one self-contained \`index.html\`.

**Remix it:** fork this repo. Tangled will serve your copy at
\`<your-handle>.tngl.sh/$SITE\` once you set the deploy directory to the repo
root in settings. Edit \`index.html\`, push, and your version ships.
EOF

cd "$TMP"
git init -q
git add -A
git commit -qm "Publish $SITE for remixing on tangled"
git branch -M main
git remote add origin "$REMOTE"
echo "→ pushing to $REMOTE"
git push -u origin main

echo
echo "✓ pushed $SITE."
echo "  Next: in tangled settings set the deploy directory to the repo root,"
echo "  then confirm it serves at <your-handle>.tngl.sh/$SITE — and fork it"
echo "  from a second account to prove the remix loop."
