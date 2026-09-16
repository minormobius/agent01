#!/bin/bash
# agent [--harness=NAME] <profile> [harness args...]
#
# TWO AXES. A "profile" is a MODEL: an endpoint + model id + key, injected by
# the worker as the AGENT_PROFILES env JSON. A "harness" is the AGENT LOOP that
# drives it. Every (harness, profile) pair is a cell you can run:
#
#   AGENT_PROFILES = {"ds4-flash":{"base":"…/anthropic","oaiBase":"…/v1",
#                                  "model":"deepseek-v4-flash","key":"sk-…"}, …}
#
#   base    Anthropic Messages API endpoint  → what Claude Code speaks
#   oaiBase OpenAI Chat Completions endpoint → what OpenCode speaks
#
# Both are the SAME provider and model; only the wire format differs. A profile
# missing the one its harness needs is a hard error here rather than a confusing
# 404 from the provider ten seconds later.
#
#   respBase OpenAI Responses API endpoint   → what Codex speaks (0.154 dropped
#                                              Chat Completions entirely). For
#                                              the `gpt5` cell this points at
#                                              os-api itself, which swaps the
#                                              capability token for the real
#                                              ChatGPT bearer — see run_codex.
#
#   agent                          → list the matrix
#   agent kimi3                    → Kimi under Claude Code (default harness)
#   agent --harness=opencode ds4-flash
#                                  → DeepSeek V4 Flash under OpenCode
#   agent claude                   → native Anthropic (needs ANTHROPIC_API_KEY,
#                                    from set-key in the PDS shell)
#   agent ds4-flash -p "fix the test"   → one-shot; args pass through verbatim
#
# Adding an open model is still one AGENT_PROFILES entry and no code. Adding a
# harness is one `run_<name>` function below plus an install line in the
# Dockerfile.

set -euo pipefail

HARNESS=claude

while [ $# -gt 0 ]; do
  case "$1" in
    --harness=*) HARNESS="${1#*=}"; shift ;;
    --harness)   HARNESS="${2:-}"; shift 2 ;;
    *) break ;;
  esac
done

# The harness name reaches us from a query string (worker-validated) and is used
# unquoted in paths below — re-assert the shape here so the container is not
# trusting its caller.
if ! printf '%s' "$HARNESS" | grep -qE '^[a-z0-9][a-z0-9-]{0,31}$'; then
  echo "agent: bad harness name '$HARNESS'" >&2
  exit 1
fi

have() { command -v "$1" >/dev/null 2>&1; }

list_profiles() {
  echo "usage: agent [--harness=claude|opencode|codex] <profile> [harness args...]"
  echo
  echo "harnesses:"
  for h in claude opencode codex; do
    case "$h" in
      claude)   bin=claude ;;
      opencode) bin=opencode ;;
      codex)    bin=codex ;;
    esac
    if have "$bin"; then echo "  $h (installed)"; else echo "  $h [NOT INSTALLED]"; fi
  done
  echo
  echo "profiles:"
  node -e '
    const p = JSON.parse(process.env.AGENT_PROFILES || "{}");
    for (const [name, c] of Object.entries(p)) {
      const where = c.base ? c.base : c.respBase ? c.respBase : "api.anthropic.com (native)";
      const key = (name === "claude" ? !!process.env.ANTHROPIC_API_KEY : !!c.key);
      const runs = [
        (c.base || name === "claude") ? "claude" : null,
        c.oaiBase ? "opencode" : null,
        c.respBase ? "codex" : null,
      ].filter(Boolean).join(",") || "-";
      console.log(`  ${name.padEnd(10)} ${(c.model || "(default model)").padEnd(20)} @ ${where}`);
      console.log(`  ${"".padEnd(10)} runs under: ${runs}${key ? "" : "   [NO KEY CONFIGURED]"}`);
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
OAI_BASE=$(pfield oaiBase)
RESP_BASE=$(pfield respBase)
MODEL=$(pfield model)
KEY=$(pfield key)

# ─── harness: claude (Claude Code CLI) ──────────────────────────────
run_claude() {
  if [ -n "$BASE" ]; then
    # Third-party Anthropic-compatible endpoint (kimi3, ds4-*).
    if [ -z "$KEY" ]; then
      echo "agent: profile '$PROFILE' has no key configured on the worker" >&2
      echo "       (the worker secret feeding it is missing — see os/RUNBOOK.md)" >&2
      exit 1
    fi
    export ANTHROPIC_BASE_URL="$BASE"
    export ANTHROPIC_AUTH_TOKEN="$KEY"
    # Make sure a browser-provided Anthropic key never shadows the profile key.
    unset ANTHROPIC_API_KEY
    if [ -n "$MODEL" ]; then
      # Route EVERY model tier Claude Code can ask for to the profile model.
      # Third-party endpoints either do not serve Anthropic's model ids at all,
      # or (DeepSeek) silently REMAP them by tier — which would quietly turn a
      # ds4-flash cell into ds4-pro for subagents. Pinning all six is what makes
      # a profile mean exactly one model.
      export ANTHROPIC_MODEL="$MODEL"
      export ANTHROPIC_SMALL_FAST_MODEL="$MODEL"
      export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
      export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
      export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
      export CLAUDE_CODE_SUBAGENT_MODEL="$MODEL"
    fi
  else
    # Native Anthropic — needs the per-connection ANTHROPIC_API_KEY (set-key).
    if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
      echo "agent: no ANTHROPIC_API_KEY — run set-key in the PDS shell, or use a" >&2
      echo "       worker-configured profile (agent kimi3)" >&2
      exit 1
    fi
  fi
  exec claude "$@"
}

# ─── harness: opencode ──────────────────────────────────────────────
# OpenCode is provider-agnostic through the Vercel AI SDK. We register the
# profile as a custom @ai-sdk/openai-compatible provider pointing at the
# provider's OpenAI-shaped endpoint, and pin it as the default model so both
# `opencode run` (headless) and the bare TUI use it.
#
# CONFIG IS PER-PROFILE AND ISOLATED. Two profiles running at once must not
# fight over one config file or one session store, so each gets its own
# XDG_CONFIG_HOME/XDG_DATA_HOME. That also makes conversation history
# per-profile, matching how the Claude Code path keys its --resume session id.
run_opencode() {
  if [ -z "$OAI_BASE" ]; then
    echo "agent: profile '$PROFILE' has no OpenAI-compatible endpoint (oaiBase)," >&2
    echo "       so it cannot run under the opencode harness. Use --harness=claude," >&2
    echo "       or add <PROVIDER>_OAI_BASE_URL in os/api/wrangler.toml." >&2
    exit 1
  fi
  if [ -z "$KEY" ]; then
    echo "agent: profile '$PROFILE' has no key configured on the worker" >&2
    exit 1
  fi
  if [ -z "$MODEL" ]; then
    echo "agent: profile '$PROFILE' has no model id; opencode needs an explicit one" >&2
    exit 1
  fi

  local root="$HOME/.opencode-cells/$PROFILE"
  mkdir -p "$root/config/opencode" "$root/data"
  export XDG_CONFIG_HOME="$root/config"
  export XDG_DATA_HOME="$root/data"

  # The key goes in the environment, and the config REFERENCES it as
  # {env:OPENCODE_CELL_KEY} — so the secret is not written to disk where a
  # later `cat` of the workspace tarball would carry it off-container.
  export OPENCODE_CELL_KEY="$KEY"

  OC_PROFILE="$PROFILE" OC_BASE="$OAI_BASE" OC_MODEL="$MODEL" \
  node -e '
    const fs = require("fs"), path = require("path");
    const { OC_PROFILE, OC_BASE, OC_MODEL } = process.env;
    const cfg = {
      $schema: "https://opencode.ai/config.json",
      provider: {
        [OC_PROFILE]: {
          npm: "@ai-sdk/openai-compatible",
          name: `mino cell: ${OC_PROFILE}`,
          options: { baseURL: OC_BASE, apiKey: "{env:OPENCODE_CELL_KEY}" },
          models: { [OC_MODEL]: { name: OC_MODEL } },
        },
      },
      model: `${OC_PROFILE}/${OC_MODEL}`,
      small_model: `${OC_PROFILE}/${OC_MODEL}`,
    };
    const dir = path.join(process.env.XDG_CONFIG_HOME, "opencode");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "opencode.json"), JSON.stringify(cfg, null, 2));
  '

  exec opencode "$@"
}

# ─── harness: codex (OpenAI Codex CLI) ──────────────────────────────
# Codex 0.154 removed wire_api="chat", so it speaks ONLY the Responses API and
# cannot drive the Chat-Completions endpoints in `oaiBase` (CODEX.md D6). It
# therefore runs against `respBase` — which for the `gpt5` cell is THIS
# DEPLOYMENT'S OWN WORKER, not OpenAI.
#
# That indirection is the design. Codex sends exactly one credential-bearing
# header, `Authorization: Bearer <env_key>` (measured), so `key` here is the
# per-instance CAPABILITY token, and os-api swaps it for the principal's real
# ChatGPT bearer server-side. No OpenAI credential exists in this container, so
# there is nothing for a workspace tarball to carry off and nothing that
# rotates here. See CODEX.md §5 Design C.
#
# CODEX_HOME is per-profile and under $HOME (never /tmp — Codex refuses to
# create its helper binaries under a temp dir), mirroring the .opencode-cells
# isolation so two cells never share a config or a session store.
run_codex() {
  if [ -z "$RESP_BASE" ]; then
    echo "agent: profile '$PROFILE' has no Responses endpoint (respBase), so it" >&2
    echo "       cannot run under the codex harness. Codex dropped Chat" >&2
    echo "       Completions support in 0.154 — see os/api/CODEX.md D6." >&2
    exit 1
  fi
  if [ -z "$KEY" ]; then
    echo "agent: profile '$PROFILE' has no key/capability token from the worker" >&2
    exit 1
  fi
  if [ -z "$MODEL" ]; then
    echo "agent: profile '$PROFILE' has no model id; codex needs an explicit one" >&2
    exit 1
  fi

  local root="$HOME/.codex-cells/$PROFILE"
  mkdir -p "$root"
  export CODEX_HOME="$root"

  # The credential goes in the ENVIRONMENT and config.toml only NAMES the
  # variable — same reason run_opencode does it: nothing secret is written to
  # disk where a later `cat` of the workspace tarball would carry it off.
  export CODEX_CELL_KEY="$KEY"

  # approval/sandbox: the CONTAINER is the security boundary here, which is the
  # documented pattern for running Codex inside one — its own Landlock/seccomp
  # sandbox cannot get the namespaces it wants in here anyway (CODEX.md D7).
  cat > "$root/config.toml" <<CONFIG
model_provider = "$PROFILE"
model = "$MODEL"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[model_providers.$PROFILE]
name = "mino cell: $PROFILE"
base_url = "$RESP_BASE"
env_key = "CODEX_CELL_KEY"
wire_api = "responses"
CONFIG

  exec codex "$@"
}

echo "[agent] harness=$HARNESS profile=$PROFILE model=${MODEL:-default} base=${BASE:-${RESP_BASE:-anthropic}}"

case "$HARNESS" in
  claude)
    have claude   || { echo "agent: claude CLI not installed in this image" >&2; exit 1; }
    run_claude "$@" ;;
  opencode)
    have opencode || { echo "agent: opencode CLI not installed in this image" >&2; exit 1; }
    run_opencode "$@" ;;
  codex)
    have codex    || { echo "agent: codex CLI not installed in this image" >&2; exit 1; }
    run_codex "$@" ;;
  *)
    echo "agent: unknown harness '$HARNESS' (known: claude, opencode, codex)" >&2
    exit 1 ;;
esac
