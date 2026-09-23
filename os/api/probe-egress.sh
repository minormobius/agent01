#!/usr/bin/env bash
# probe-egress.sh — settle the Codex auth question from INSIDE the container.
#
# Everything in os/api/CODEX.md §5 hinges on one measurement that cannot be
# taken from the agent sandbox: which OpenAI endpoints answer from Cloudflare
# Containers' egress. This script takes it, writes a report, and (by default)
# commits and pushes that report to a kimi/* branch so it can be read from
# anywhere without copying terminal output off a phone.
#
#   bash os/api/probe-egress.sh              # probe, write report, commit, push
#   bash os/api/probe-egress.sh --no-push    # probe and print only
#
# Deliberately boring: no agent judgement is required anywhere in it, so the
# result is a measurement rather than something a model reported.
#
# SAFETY: it sends no credentials and prints no environment. The only secret in
# the container is GITHUB_TOKEN, used solely by `git push` via the insteadOf
# rewrite startup.sh installs. `set -u` is on; `set -e` is NOT, because every
# probe is expected to "fail" in some interesting way and we want them all.

set -uo pipefail

REPO="${REPO:-$HOME/workspace/agent01}"
REPORT_REL="os/api/EGRESS-PROBE.md"
BRANCH="${BRANCH:-kimi/egress-probe}"
PUSH=1
[ "${1:-}" = "--no-push" ] && PUSH=0

# The public Codex client id. Not a secret — it ships in the CLI binary.
CODEX_CLIENT_ID="app_EMoamEEZ73f0CkXaXp7hrann"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# probe <label> <method> <url> [curl args...]
# Records HTTP status and a short body sample. A Cloudflare managed challenge
# is an HTML body titled "Just a moment..." — that is the signature we are
# actually hunting, and a bare status code cannot distinguish it from a real
# 403 from the API.
probe() {
  local label="$1" method="$2" url="$3"; shift 3
  local code body verdict
  code=$(curl -sS -o "$TMP/body" -w '%{http_code}' --max-time 25 \
           -X "$method" "$@" "$url" 2>"$TMP/err") || code="000"
  body=$(head -c 220 "$TMP/body" 2>/dev/null | tr -d '\r' | tr '\n' ' ')

  if grep -qi 'Just a moment\|cf_chl\|challenge-platform' "$TMP/body" 2>/dev/null; then
    verdict="CHALLENGED (Cloudflare bot check)"
  elif [ "$code" = "000" ]; then
    verdict="NO RESPONSE — $(head -c 120 "$TMP/err" | tr '\n' ' ')"
  elif head -c 400 "$TMP/body" 2>/dev/null | grep -q '^\s*{'; then
    verdict="JSON (endpoint answered)"
  else
    verdict="non-JSON body"
  fi

  printf '| `%s` | %s | %s |\n' "$label" "$code" "$verdict" >> "$TMP/table"
  printf '### %s\n\n- status: `%s`\n- verdict: **%s**\n- body: `%s`\n\n' \
    "$label" "$code" "$verdict" "$body" >> "$TMP/detail"

  echo "  $label -> $code  $verdict"
  # Remember the decisive one for the verdict section.
  [ "$label" = "POST auth.openai.com/oauth/device/code" ] && echo "$verdict" > "$TMP/device_verdict"
}

echo "probing OpenAI egress from the container…"
: > "$TMP/table"; : > "$TMP/detail"

# 1. THE decisive one: can we START a device-code login from here?
probe "POST auth.openai.com/oauth/device/code" POST \
  "https://auth.openai.com/oauth/device/code" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "client_id=${CODEX_CLIENT_ID}&scope=openid+profile+email+offline_access"

# 2. Design B depends on these two: refresh, and the subscription inference
#    plane. Both should answer with a JSON 401 on a bogus credential.
probe "POST auth.openai.com/oauth/token" POST \
  "https://auth.openai.com/oauth/token" \
  -H 'Content-Type: application/json' \
  -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"probe-not-a-real-token\",\"client_id\":\"${CODEX_CLIENT_ID}\"}"

probe "POST chatgpt.com/backend-api/codex/responses" POST \
  "https://chatgpt.com/backend-api/codex/responses" \
  -H 'Content-Type: application/json' -d '{}'

# 3. Controls — distinguish "OpenAI treats us specially" from "egress is odd".
probe "POST api.openai.com/v1/responses" POST \
  "https://api.openai.com/v1/responses" -H 'Content-Type: application/json' -d '{}'
probe "GET  auth.openai.com/" GET "https://auth.openai.com/"

# ─── Environment facts worth capturing while we are in here ──────────
EGRESS_TRACE=$(curl -sS --max-time 20 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null \
                 | grep -E '^(ip|loc|colo|warp)=' | tr '\n' ' ')
CF_CA="absent"
[ -f /etc/cloudflare/certs/cloudflare-containers-ca.crt ] && CF_CA="PRESENT (egress may intercept HTTPS — Codex would need CODEX_CA_CERTIFICATE)"
NODE_V=$(node --version 2>/dev/null || echo '?')
HAS_CODEX=$(command -v codex >/dev/null 2>&1 && echo yes || echo 'no (expected — not installed yet)')

DEVICE_VERDICT=$(cat "$TMP/device_verdict" 2>/dev/null || echo 'unknown')
case "$DEVICE_VERDICT" in
  JSON*)       DESIGN="**Design A is live** — device-code login can be started from the container. \`codex login --device-auth\` in this PTY is viable." ;;
  CHALLENGED*) DESIGN="**Design B** — device-code initiation is bot-challenged here, exactly as in the sandbox. The credential must be minted on a machine with a real browser; the Durable Object refreshes it and hands sessions short-lived tokens." ;;
  *)           DESIGN="**Inconclusive** — the device-code endpoint neither answered nor challenged. See the detail below before choosing." ;;
esac

# ─── Report ──────────────────────────────────────────────────────────
mkdir -p "$(dirname "$REPO/$REPORT_REL")"
cat > "$REPO/$REPORT_REL" <<REPORT
# Egress probe — measured inside the Cloudflare Container

Generated by \`os/api/probe-egress.sh\` on $(date -u +%Y-%m-%dT%H:%M:%SZ).
This is the measurement \`os/api/CODEX.md\` §6 test #1 asks for: it decides
between Design A and Design B for the ChatGPT-subscription Codex cell.

## Verdict

$DESIGN

## Results

| endpoint | status | verdict |
|---|---|---|
$(cat "$TMP/table")

## Detail

$(cat "$TMP/detail")

## Container facts

- egress: \`${EGRESS_TRACE:-unavailable}\`
- Cloudflare containers CA: $CF_CA
- node: \`$NODE_V\`
- codex installed: $HAS_CODEX

<!-- No credentials are sent or recorded by this probe. -->
REPORT

echo
echo "report written: $REPO/$REPORT_REL"
echo "verdict: $DESIGN"

[ "$PUSH" = "0" ] && { echo "(--no-push: stopping here)"; exit 0; }

cd "$REPO" || { echo "no clone at $REPO — skipping push"; exit 1; }
git fetch origin main --quiet 2>/dev/null
git checkout -B "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
git add "$REPORT_REL"
git -c user.name="os.mino" -c user.email="editor@minomobi.com" \
    commit -q -m "probe: OpenAI egress measured from inside the container" 2>/dev/null \
  || { echo "nothing to commit (identical to last run)"; }
if git push -u origin "$BRANCH" 2>&1 | tail -3; then
  echo "pushed to $BRANCH — readable from GitHub"
else
  echo "push failed (is GITHUB_TOKEN injected?) — the report is still at $REPO/$REPORT_REL"
fi
