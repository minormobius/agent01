#!/usr/bin/env bash
# deploy.sh — ship hoop to hoop.mino.mobi (worker + assets + the HoopRoom DO migration).
#
# This is the canonical deploy command, the same one .github/workflows/deploy-hoop.yml runs.
# Owning branch: claude/hoop-quest-improvements-r78jfp (see deploy-registry.json surface "hoop").
#
# The Claude sandbox CANNOT reach Cloudflare — run this from a laptop or a CI runner that has
# CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment. From the sandbox, prefer
# pushing hoop/** to the owning branch and letting the Action deploy.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./hoop/deploy.sh
#   ./hoop/deploy.sh --dry-run     # wrangler validates + prints the plan, no upload
set -euo pipefail

cd "$(dirname "$0")"   # hoop/

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "✗ Missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID."
  echo "  Set both (or trigger .github/workflows/deploy-hoop.yml, which has them as secrets)."
  exit 1
fi

echo "→ Deploying hoop → hoop.mino.mobi (wrangler deploy)…"
npx wrangler deploy "$@"

echo
echo "✓ Deploy submitted. GOLDEN RULE: confirm the log bound 'hoop.mino.mobi (custom domain)',"
echo "  not a stray <name>.workers.dev — otherwise the live subdomain did not change."
echo "  New version is live at https://hoop.mino.mobi/v097/"
