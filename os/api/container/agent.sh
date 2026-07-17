#!/bin/bash
# agent <profile> [claude args...] — launch Claude Code CLI against a model profile.
#
# The harness is ALWAYS Claude Code; a "profile" is an Anthropic-Messages-API-
# compatible endpoint + model id + key, injected by the worker as the
# AGENT_PROFILES env JSON: {"kimi3":{"base":"...","model":"...","key":"..."}, ...}.
# kimi3 → Moonshot's Anthropic-compatible endpoint. Any open model reachable
# through an Anthropic-compatible endpoint (native, or a LiteLLM-style gateway
# speaking /v1/messages) is one more profile — no new code.
#
#   agent            → list profiles
#   agent kimi3      → chat with Kimi in this workspace (repo agent)
#   agent claude     → native Anthropic (needs ANTHROPIC_API_KEY, from set-key)
#   agent kimi3 -p "fix the failing test"   → one-shot (args pass through)

set -euo pipefail

PROFILES_JSON="${AGENT_PROFILES:-{}}"

list_profiles() {
  echo "usage: agent <profile> [claude args...]"
  echo "profiles:"
  node -e '
    const p = JSON.parse(process.env.AGENT_PROFILES || "{}");
    for (const [name, c] of Object.entries(p)) {
      const where = c.base ? c.base : "api.anthropic.com (native)";
      const key = (name === "claude" ? !!process.env.ANTHROPIC_API_KEY : !!c.key);
      console.log(`  ${name.padEnd(10)} ${c.model || "(default model)"} @ ${where} ${key ? "" : "[NO KEY CONFIGURED]"}`);
    }
  '
}

if [ $# -eq 0 ]; then
  list_profiles
  exit 0
fi

PROFILE="$1"
shift

# Extract one field of one profile from AGENT_PROFILES. Node is guaranteed in
# the image; this avoids a jq dependency.
pfield() {
  AGENT_PROFILE_NAME="$PROFILE" AGENT_PROFILE_FIELD="$1" node -e '
    const p = JSON.parse(process.env.AGENT_PROFILES || "{}");
    const prof = p[process.env.AGENT_PROFILE_NAME];
    if (!prof) { process.exit(3); }
    process.stdout.write(String(prof[process.env.AGENT_PROFILE_FIELD] ?? ""));
  '
}

if ! BASE=$(pfield base); then
  echo "agent: unknown profile '$PROFILE'" >&2
  list_profiles >&2
  exit 1
fi
MODEL=$(pfield model)
KEY=$(pfield key)

if [ -n "$BASE" ]; then
  # Third-party Anthropic-compatible endpoint (kimi3 etc.)
  if [ -z "$KEY" ]; then
    echo "agent: profile '$PROFILE' has no key configured on the worker" >&2
    echo "       (wrangler secret put MOONSHOT_API_KEY — see os/RUNBOOK.md)" >&2
    exit 1
  fi
  export ANTHROPIC_BASE_URL="$BASE"
  export ANTHROPIC_AUTH_TOKEN="$KEY"
  # Make sure a browser-provided Anthropic key never shadows the profile key.
  unset ANTHROPIC_API_KEY
  if [ -n "$MODEL" ]; then
    export ANTHROPIC_MODEL="$MODEL"
    # Background/fast tasks route to the same model — third-party endpoints
    # rarely serve Anthropic's small-model ids.
    export ANTHROPIC_SMALL_FAST_MODEL="$MODEL"
  fi
else
  # Native Anthropic — needs the per-connection ANTHROPIC_API_KEY (set-key).
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "agent: no ANTHROPIC_API_KEY — run set-key in the PDS shell, or use a" >&2
    echo "       worker-configured profile (agent kimi3)" >&2
    exit 1
  fi
fi

echo "[agent] profile=$PROFILE model=${MODEL:-default} base=${BASE:-anthropic}"
exec claude "$@"
