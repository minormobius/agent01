#!/usr/bin/env bash
# Copy the shared, no-build OAuth client into board/ so the assets-only worker
# can serve it. Single source of truth stays in packages/ (the copy is
# gitignored). Run locally for dev; deploy-board.yml runs it before deploying.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$here/board/vendor"
cp "$here/packages/oauth-client/auth.js" "$here/board/vendor/auth.js"
echo "Vendored: board/vendor/auth.js"
