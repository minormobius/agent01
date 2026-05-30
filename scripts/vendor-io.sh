#!/usr/bin/env bash
# Copy shared, no-build front-end libs into io/ so the assets-only worker can
# serve them. Keeps a single source of truth in packages/ + js/ (the copies are
# gitignored). Run locally for dev; deploy-io.yml runs it before wrangler deploy.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$here/io/vendor"
cp "$here/packages/oauth-client/auth.js" "$here/io/vendor/auth.js"
cp "$here/js/typeahead.js" "$here/io/typeahead.js"
echo "Vendored: io/vendor/auth.js, io/typeahead.js"
