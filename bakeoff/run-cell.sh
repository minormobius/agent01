#!/usr/bin/env bash
# run-cell.sh — run ONE bake-off cell: point one (harness, model) at one brief,
# in a clean checkout, and leave the result where the collector can find it.
#
#   bakeoff/run-cell.sh <harness> <model> [brief] [sample]
#
# Env it needs:
#   MOONSHOT_API_KEY / DEEPSEEK_API_KEY / …  the model's key (per cells.json)
#   BAKEOFF_OUT                              where to write the entry (default: bakeoff/.run/<cell>)
#
# This is the SAME cell abstraction the container's `agent` launcher uses; it is
# reimplemented here rather than shared because the CI runner has no worker to
# hand it AGENT_PROFILES. bakeoff.selftest.mjs pins the two to the same model
# ids so they cannot drift.
#
# The agent gets a full checkout and does whatever it likes to it. We do not
# trust it to be tidy: only <target>/ is harvested, and the scorer re-runs from
# the repo's own copy, so an entry that edits the rubric scores itself nothing.

set -euo pipefail

HARNESS="${1:?usage: run-cell.sh <harness> <model> [brief] [sample]}"
MODEL_KEY="${2:?usage: run-cell.sh <harness> <model> [brief] [sample]}"
BRIEF="${3:-}"
# Sample index. Taste has high variance: the spread WITHIN one model across two
# runs can exceed the gap between models, so a single draw cannot tell you which
# you are looking at. Each sample is a fully independent run from a clean tree.
SAMPLE="${4:-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

read_cfg() {
  node -e '
    const c = require("./bakeoff/cells.json");
    const [what, key, field] = process.argv.slice(1);
    const v = what === "model" ? c.models[key]?.[field] : c.harnesses[key]?.[field];
    if (v === undefined) { console.error(`cells.json: no ${what}.${key}.${field}`); process.exit(1); }
    process.stdout.write(String(v));
  ' "$@"
}

BRIEF="${BRIEF:-$(node -e 'process.stdout.write(require("./bakeoff/cells.json").brief)')}"
TARGET="$(node -e 'process.stdout.write(require("./bakeoff/cells.json").target)')"

MODEL_ID="$(read_cfg model "$MODEL_KEY" model)"
KEY_ENV="$(read_cfg model "$MODEL_KEY" keyEnv)"
ANTHROPIC_BASE="$(read_cfg model "$MODEL_KEY" anthropicBase)"
OPENAI_BASE="$(read_cfg model "$MODEL_KEY" openaiBase)"

CELL="${HARNESS}__${MODEL_KEY}__s${SAMPLE}"
OUT="${BAKEOFF_OUT:-$REPO_ROOT/bakeoff/.run/$CELL}"
BRIEF_FILE="bakeoff/briefs/$BRIEF/BRIEF.md"

KEY="${!KEY_ENV:-}"
if [ -z "$KEY" ]; then
  echo "::notice::cell $CELL skipped — \$$KEY_ENV is not set"
  mkdir -p "$OUT"
  node -e '
    const fs = require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({
      cell: process.argv[2], harness: process.argv[3], model: process.argv[4],
      sample: Number(process.argv[6] || 1),
      status: "skipped", reason: `${process.argv[5]} not configured`,
    }, null, 2));
  ' "$OUT/cell.json" "$CELL" "$HARNESS" "$MODEL_KEY" "$KEY_ENV" "$SAMPLE"
  exit 0
fi

echo "── cell $CELL ────────────────────────────────"
echo "   harness : $HARNESS"
echo "   sample  : $SAMPLE"
echo "   model   : $MODEL_ID"
echo "   brief   : $BRIEF_FILE"
echo "   target  : $TARGET"

if [ ! -f "$BRIEF_FILE" ]; then
  echo "run-cell: no such brief: $BRIEF_FILE" >&2
  exit 1
fi

mkdir -p "$OUT"
START=$(date +%s)
# Remember where the tree started. The diff MUST be taken against this, not
# against the working tree: race-01 recorded 0-byte patches for two cells that
# had in fact written a 50KB page — they COMMITTED their work, so `git diff`
# (unstaged only) saw nothing and the report read "did nothing" for the agents
# that were tidiest. Untracked new files (field.mjs!) are invisible to it too.
START_SHA="$(git rev-parse HEAD)"

# The prompt is the brief, verbatim, plus the one instruction the brief cannot
# carry (it is written to be harness-neutral): finish without asking.
PROMPT_FILE="$(mktemp)"
{
  cat "$BRIEF_FILE"
  cat <<'EOF'

---

You are running non-interactively. Nobody will answer a question, so do not ask
one — make the call, do the work, and record the reasoning in NOTES.md. Run the
scorer as many times as you need before you stop.
EOF
} > "$PROMPT_FILE"

set +e
case "$HARNESS" in
  claude)
    ANTHROPIC_BASE_URL="$ANTHROPIC_BASE" \
    ANTHROPIC_AUTH_TOKEN="$KEY" \
    ANTHROPIC_MODEL="$MODEL_ID" \
    ANTHROPIC_SMALL_FAST_MODEL="$MODEL_ID" \
    ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL_ID" \
    ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL_ID" \
    ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL_ID" \
    CLAUDE_CODE_SUBAGENT_MODEL="$MODEL_ID" \
    ANTHROPIC_API_KEY= \
      claude -p --dangerously-skip-permissions < "$PROMPT_FILE" > "$OUT/agent.log" 2>&1
    AGENT_RC=$?
    ;;
  opencode)
    OC_ROOT="$(mktemp -d)"
    mkdir -p "$OC_ROOT/config/opencode" "$OC_ROOT/data"
    export XDG_CONFIG_HOME="$OC_ROOT/config" XDG_DATA_HOME="$OC_ROOT/data"
    export OPENCODE_CELL_KEY="$KEY"
    OC_PROVIDER="$MODEL_KEY" OC_BASE="$OPENAI_BASE" OC_MODEL="$MODEL_ID" node -e '
      const fs = require("fs"), path = require("path");
      const { OC_PROVIDER, OC_BASE, OC_MODEL } = process.env;
      fs.writeFileSync(path.join(process.env.XDG_CONFIG_HOME, "opencode", "opencode.json"), JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        provider: { [OC_PROVIDER]: {
          npm: "@ai-sdk/openai-compatible",
          name: `mino cell: ${OC_PROVIDER}`,
          options: { baseURL: OC_BASE, apiKey: "{env:OPENCODE_CELL_KEY}" },
          models: { [OC_MODEL]: { name: OC_MODEL } },
        } },
        model: `${OC_PROVIDER}/${OC_MODEL}`,
        small_model: `${OC_PROVIDER}/${OC_MODEL}`,
      }, null, 2));
    '
    opencode run --auto - < "$PROMPT_FILE" > "$OUT/agent.log" 2>&1
    AGENT_RC=$?
    ;;
  *)
    echo "run-cell: unknown harness '$HARNESS'" >&2
    exit 1
    ;;
esac
set -e
rm -f "$PROMPT_FILE"

ELAPSED=$(( $(date +%s) - START ))
echo "   agent exited $AGENT_RC after ${ELAPSED}s"

# ── harvest ────────────────────────────────────────────────────────
# Only the target directory counts. Anything the agent changed elsewhere is
# recorded in the diffstat for the human reader but does NOT travel with the
# entry — that is what keeps a cell from editing its own scorer, or wandering
# into another surface.
mkdir -p "$OUT/entry"
if [ -d "$TARGET" ]; then cp -R "$TARGET/." "$OUT/entry/"; fi

# Stage everything so untracked files count, then diff the INDEX against the
# starting commit — that covers all three ways an agent can leave its work:
# unstaged edits, staged edits, and its own commits.
git -c core.fileMode=false add -A -- . ':!bakeoff' >/dev/null 2>&1 || true
git -c core.fileMode=false diff --cached --stat "$START_SHA" -- . ':!bakeoff' > "$OUT/diffstat.txt" 2>/dev/null || true
git -c core.fileMode=false diff --cached "$START_SHA" -- "$TARGET" > "$OUT/entry.patch" 2>/dev/null || true
STRAY=$(git -c core.fileMode=false diff --cached --name-only "$START_SHA" -- . ":!$TARGET" ':!bakeoff' 2>/dev/null | tr '\n' ' ')
git reset -q >/dev/null 2>&1 || true

# The race brief boots the entry in headless Chromium, so scoring can take ~20s
# and writes a filmstrip next to the entry. Failures here are recorded as a
# zero-scoring entry, never as a runner error — a broken entry is a RESULT.
BAKEOFF_CAPTURE_OUT="$OUT/capture" \
  node bakeoff/briefs/"$BRIEF"/score.mjs "$OUT/entry" --json > "$OUT/score.json" 2>"$OUT/score.err" || true

node -e '
  const fs = require("fs");
  const [out, cell, harness, model, modelId, rc, secs, stray, sample] = process.argv.slice(1);
  let score = null;
  try { score = JSON.parse(fs.readFileSync(`${out}/score.json`, "utf8")); } catch (e) {
    score = { error: `scorer produced no JSON: ${e.message}` };
  }
  // Tiered result (gate / skeleton) for the race brief; legacy numeric score
  // for older briefs. Both shapes are carried so one report can render either.
  fs.writeFileSync(`${out}/cell.json`, JSON.stringify({
    cell, harness, model, modelId, sample: Number(sample || 1),
    status: "ran",
    agentExit: Number(rc),
    seconds: Number(secs),
    strayFiles: stray.trim() ? stray.trim().split(/\s+/) : [],
    gate: score.gate ?? null,
    skeleton: score.skeleton ?? null,
    capture: score.capture ?? null,
    score: score.score ?? null, maxScore: score.maxScore ?? null,
    checks: score.checks ?? null,
    error: score.error ?? null,
  }, null, 2));
  if (score.gate) console.log(`   gate ${score.gate.passed ? "PASS" : "FAIL"} · primitives ${score.skeleton?.passed ?? "?"}/${score.skeleton?.of ?? 4}`);
  else console.log(`   scored ${score.score}/${score.maxScore}`);
' "$OUT" "$CELL" "$HARNESS" "$MODEL_KEY" "$MODEL_ID" "$AGENT_RC" "$ELAPSED" "$STRAY" "$SAMPLE"

# Put the tree back so a second cell on the same runner starts clean.
git checkout -- "$TARGET" 2>/dev/null || true
