#!/bin/bash
# Container startup: restore workspace (worker /sync → DO storage), configure Claude Code + MCP, start PTY server.
set -e

HOME=/home/coder
WORKSPACE=$HOME/workspace
CLAUDE_DIR=$HOME/.claude

# ─── Restore workspace (worker /sync → DO storage) ────────────────
# On wake, pull the last saved tarball via the Worker sync endpoint.
# First run (404) is fine — we start fresh.

# (Auth is the per-instance CAP_TOKEN minted by the worker — the old shared
#  SYNC_TOKEN is gone; server.js saves with the same token.)
if [ -n "$SYNC_URL" ] && [ -n "$CAP_TOKEN" ] && [ -n "$WORKSPACE_ID" ]; then
  echo "[startup] restoring workspace: $WORKSPACE_ID"
  HTTP_CODE=$(curl -sf -w '%{http_code}' \
    -H "Authorization: Bearer $CAP_TOKEN" \
    "$SYNC_URL/sync/$WORKSPACE_ID" \
    -o /tmp/workspace.tar.gz 2>/dev/null) || HTTP_CODE="000"

  if [ "$HTTP_CODE" = "200" ] && [ -s /tmp/workspace.tar.gz ]; then
    tar xzf /tmp/workspace.tar.gz -C $HOME 2>/dev/null || true
    SIZE=$(du -sh /tmp/workspace.tar.gz 2>/dev/null | cut -f1)
    echo "[startup] workspace restored ($SIZE)"
    rm -f /tmp/workspace.tar.gz
  else
    echo "[startup] no saved workspace (first run)"
  fi
else
  echo "[startup] sync not configured, starting fresh"
fi

# ─── Git config ─────────────────────────────────────────────────────

if [ ! -f "$HOME/.gitconfig" ]; then
  git config --global init.defaultBranch main
  git config --global user.name "os.mino"
  git config --global user.email "editor@minomobi.com"
fi

# Git auth via GITHUB_TOKEN (enables git push to private repos)
if [ -n "$GITHUB_TOKEN" ]; then
  git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
fi

# ─── Claude Code settings + MCP servers ─────────────────────────────
# Only created on first run. User can customize after — changes persist via sync.

mkdir -p "$CLAUDE_DIR"

if [ ! -f "$CLAUDE_DIR/settings.json" ]; then
  cat > "$CLAUDE_DIR/settings.json" << SETTINGS
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(node *)",
      "Bash(python3 *)",
      "Bash(curl *)",
      "Bash(wrangler *)",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep"
    ]
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
SETTINGS
  echo "[startup] created Claude Code settings with GitHub MCP"
fi

# ─── Shell config ───────────────────────────────────────────────────

if [ ! -f "$HOME/.bashrc" ] || ! grep -q 'os.mino' "$HOME/.bashrc" 2>/dev/null; then
  cat >> "$HOME/.bashrc" << 'BASHRC'

# os.mino
export PS1='\[\033[36m\]os.mino\[\033[0m\]:\[\033[33m\]\w\[\033[0m\]\$ '
alias ll='ls -la'
alias c='claude'
alias k='agent kimi3'

# work <slug> — start (or resume) an agent feature branch in the agent01 clone.
# Convention: kimi/* branches. Pushes from here fire GitHub Actions (PAT push),
# but no deploy workflow matches kimi/* globs — a human promotes work by
# merging or adding the branch to a deploy trigger. That's the safety line.
work() {
  local slug="${1:?usage: work <slug>}"
  cd ~/workspace/agent01 || return 1
  git fetch origin main --quiet || true
  git checkout "kimi/$slug" 2>/dev/null || git checkout -b "kimi/$slug" origin/main
}

echo -e "\033[2m  workspace auto-saves every 2 min (DO storage)\033[0m"
echo -e "\033[2m  agent kimi3   — chat/code with Kimi (Claude Code harness)\033[0m"
echo -e "\033[2m  work <slug>   — new kimi/<slug> feature branch in agent01\033[0m"
echo -e "\033[2m  claude        — native Claude Code (needs set-key)\033[0m"
echo ""
BASHRC
fi

# ─── Clone repo on first run ───────────────────────────────────────

if [ ! -d "$WORKSPACE/agent01" ]; then
  echo "[startup] cloning agent01..."
  git clone https://github.com/minormobius/agent01.git "$WORKSPACE/agent01" 2>&1 || true
fi

# ─── Start PTY server ──────────────────────────────────────────────

echo "[startup] ready — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
exec node /home/coder/server.js
