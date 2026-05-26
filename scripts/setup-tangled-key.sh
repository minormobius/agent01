#!/usr/bin/env bash
# Run this LOCALLY — NOT in the Claude sandbox.
#
# Generates a tangled deploy key whose PRIVATE half never leaves your machine:
# it's piped straight into the GitHub Actions secret via `gh`, and only the
# PUBLIC half is printed (for you to paste into tangled → Settings → Keys).
# Claude never sees the private key, and it isn't written anywhere persistent.
#
# Prereqs:
#   • gh authenticated with access to the repo (`gh auth login`)
#   • run from inside a clone of minormobius/agent01 (or pass -R below)
#
# Usage:
#   scripts/setup-tangled-key.sh
set -euo pipefail

REPO="${1:-minormobius/agent01}"
KEYFILE="$(mktemp -u)"

cleanup() { rm -f "$KEYFILE" "$KEYFILE.pub" 2>/dev/null || true; }
trap cleanup EXIT

ssh-keygen -t ed25519 -N "" -C "tangled-deploy@minomobi" -f "$KEYFILE" -q

echo "→ Setting GitHub Actions secret TANGLED_SSH_KEY on $REPO (private key, never printed)…"
gh secret set TANGLED_SSH_KEY -R "$REPO" < "$KEYFILE"

echo
echo "──────── PUBLIC KEY — paste into tangled → Settings → Keys ────────"
cat "$KEYFILE.pub"
echo "───────────────────────────────────────────────────────────────────"
echo
echo "✓ Private key is now only in the GH secret; the local copy is wiped on exit."
echo "  Next: set repo variables TANGLED_HANDLE (e.g. you.tngl.sh) and"
echo "  TANGLED_KNOT (default knot1.tangled.sh), create the 'erdos' repo on"
echo "  tangled, set its deploy dir to root, then run the Mirror to Tangled workflow."
