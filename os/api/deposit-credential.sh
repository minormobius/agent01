#!/usr/bin/env bash
# deposit-credential.sh — hand os-api the ChatGPT credential, once.
#
# RUN THIS ON YOUR OWN MACHINE, not in the container. That is the whole point:
# device-code login is bot-walled from container egress (measured twice — see
# CODEX.md D1 and EGRESS-PROBE.md), so the credential has to be minted where a
# real browser lives. Afterwards it never goes near the container again: the
# container gets a capability token, and os-api swaps it for this credential
# server-side (CODEX.md §5 Design C).
#
#   codex login                       # first, in a browser
#   bash os/api/deposit-credential.sh # then this
#
# Reads the handle and app password interactively, or from OS_HANDLE and
# OS_APP_PASSWORD. The app password is never passed on the command line, so it
# stays out of shell history.

set -uo pipefail

API="${OS_API:-https://os-api.mino.mobi}"
AUTH_JSON="${CODEX_AUTH_JSON:-$HOME/.codex/auth.json}"

die() { echo "error: $*" >&2; exit 1; }

[ -f "$AUTH_JSON" ] || die "no $AUTH_JSON — run \`codex login\` first"

# ── pull just the two tokens out; id_token is an identity assertion we have no
#    use for, so it is not sent at all.
read_tokens() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$AUTH_JSON" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
t=d.get("tokens",d)
print(t.get("access_token","") or "")
print(t.get("refresh_token","") or "")
print(t.get("account_id","") or d.get("account_id","") or "")
PY
  elif command -v node >/dev/null 2>&1; then
    node -e '
      const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
      const t=d.tokens||d;
      console.log(t.access_token||""); console.log(t.refresh_token||"");
      console.log(t.account_id||d.account_id||"");
    ' "$AUTH_JSON"
  else
    die "need python3 or node to read $AUTH_JSON"
  fi
}

{ read -r ACCESS; read -r REFRESH; read -r ACCOUNT; } < <(read_tokens)
[ -n "$REFRESH" ] || die "no refresh_token in $AUTH_JSON — is it a ChatGPT login (auth_mode \"chatgpt\"), not an API key?"
echo "found credential: access ${#ACCESS} chars, refresh ${#REFRESH} chars, account '${ACCOUNT:-none}'"

# ── identity: os-api verifies the deposit against ALLOWED_DIDS, the same gate
#    /ws uses. An app-password session is the simplest way to get an accessJwt.
HANDLE="${OS_HANDLE:-}"
[ -n "$HANDLE" ] || { printf 'bluesky handle (the allowlisted one): '; read -r HANDLE; }
APP_PW="${OS_APP_PASSWORD:-}"
[ -n "$APP_PW" ] || { printf 'app password (hidden): '; read -rs APP_PW; echo; }

DID=$(curl -sS --max-time 20 \
  "https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=$HANDLE" \
  | sed -n 's/.*"did":"\([^"]*\)".*/\1/p')
[ -n "$DID" ] || die "could not resolve handle '$HANDLE'"

PDS=$(curl -sS --max-time 20 "https://plc.directory/$DID" \
  | tr ',' '\n' | sed -n 's/.*"serviceEndpoint":"\([^"]*\)".*/\1/p' | head -1)
PDS="${PDS:-https://bsky.social}"
echo "identity: $HANDLE -> $DID @ $PDS"

SESSION=$(curl -sS --max-time 20 -X POST "$PDS/xrpc/com.atproto.server.createSession" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$HANDLE\",\"password\":\"$APP_PW\"}")
JWT=$(printf '%s' "$SESSION" | sed -n 's/.*"accessJwt":"\([^"]*\)".*/\1/p')
[ -n "$JWT" ] || die "login failed: $(printf '%s' "$SESSION" | head -c 200)"

# ── deposit ──
BODY=$(printf '{"access_token":"%s","refresh_token":"%s","account_id":"%s"}' "$ACCESS" "$REFRESH" "$ACCOUNT")
echo "depositing to $API …"
OUT=$(curl -sS --max-time 30 -X PUT "$API/openai/credential?session=$DID&authMode=pds" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d "$BODY")
echo "$OUT"

case "$OUT" in
  *'"ok":true'*)
    echo
    echo "stored. now, in the container:  agent --harness=codex astra"
    ;;
  *)
    echo
    echo "deposit did not confirm — the reply above says why." >&2
    echo "403 means this DID is not on ALLOWED_DIDS in os/api/wrangler.toml." >&2
    exit 1
    ;;
esac
