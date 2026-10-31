#!/usr/bin/env bash
# run-arm.sh — build one held-out request with one builder, the way it would ship.
#
#   run-arm.sh <baseline|challenger> <request.json> <out-dir>
#
# Run from the root of a FACTORY checkout (origin/claude/minomobi-landing-page-vg37b8,
# lab-www merged in as it stood at the request's time — the workflow sets that up).
# RIG points at a checkout of this branch (bakeoff/buildabot/ lives there, not in
# the factory tree, so the builder never sees the experiment).
#
# baseline   — production's lab-build.yml, pass for pass (PRODUCTION.md): main
#              (60 turns, $5, 32 min) → gates → smoke → repair (20 turns) if broken,
#              else visual (14 turns, $2, 8 min) → content gate again.
# challenger — the same composed prompt plus challenger/method.md, the same model
#              and file tools, plus eyes (eyes-mcp.mjs: look / watch / drive its own
#              page), no turn cap, 90 min; then up to ROUNDS × (a fresh critic with
#              eyes → a revise pass); then the SAME gates, smoke and repair pass.
#
# Writes <out>/site/ (the tenant dir), <out>/meta.json, every pass's transcript,
# and the critic's reports. A build production would have failed is recorded as
# status "failed" with the gate that failed it; its files are kept for the record.
set -uo pipefail

ARM=$1; REQ=$(realpath "$2"); OUT=$(realpath -m "$3")
RIG=${RIG:?set RIG to a checkout of the bakeoff branch}
ROUNDS=${ROUNDS:-2}
MODEL=${BUILD_MODEL:-claude-sonnet-5}
CLAUDE=${CLAUDE_BIN:-claude}
mkdir -p "$OUT"
B=$RIG/bakeoff/buildabot
TMP=${TMPDIR:-/tmp}

field() { node -e 'const j=require(process.argv[1]);process.stdout.write(String(j[process.argv[2]]||""))' "$REQ" "$1"; }
SLUG=$(field slug); REQUESTER=$(field requester); REFS_FROM=$(field refs_from)
TASK=$(node -p 'require(process.argv[1]).task' "$REQ")
DIR=lab/www/$SLUG
PROFILE=lab/_profiles/$REQUESTER.md
[ -n "$SLUG" ] || { echo "::error::no slug in $REQ"; exit 2; }

PASSES=()   # JSON fragments, one per agent pass
STATUS=built; FAILED_AT=""

# ---- stats from a claude transcript (stream-json or json): turns, cost, how it ended
pass_stats() { # name file seconds exit
  node -e '
    const [name, file, secs, code] = process.argv.slice(1);
    let r = null;
    try { for (const l of require("fs").readFileSync(file, "utf8").split("\n")) { try { const j = JSON.parse(l); if (j.type === "result") r = j; } catch {} } } catch {}
    console.log(JSON.stringify({ name, seconds: +secs, exit: +code, turns: r?.num_turns ?? null,
      cost_usd: r?.total_cost_usd ?? null, subtype: r?.subtype ?? null, is_error: r?.is_error ?? null,
      terminal_reason: r?.terminal_reason ?? null }));' "$@"
}

# ---- one claude -p pass. args: name timeout-min prompt-file -- extra claude flags
run_pass() {
  local name=$1 mins=$2 pfile=$3; shift 4
  local t0=$SECONDS code
  timeout --kill-after=30 "${mins}m" sh -c 'printf "%s" "$(cat "$0")" | "$@"' "$pfile" \
    "$CLAUDE" -p --model "$MODEL" --permission-mode acceptEdits "$@" \
    --output-format stream-json --verbose > "$OUT/$name.jsonl" 2> "$OUT/$name.stderr"
  code=$?
  PASSES+=("$(pass_stats "$name" "$OUT/$name.jsonl" $((SECONDS - t0)) $code)")
  echo "  pass $name: exit $code, $((SECONDS - t0))s"
  return $code
}

FILE_TOOLS=(--allowedTools "Read" "Write" "Edit" "Glob" "Grep" --disallowedTools "Bash" "WebFetch" "WebSearch" "Task" "NotebookEdit")
EYES_CFG=$(node -e 'console.log(JSON.stringify({mcpServers:{eyes:{command:"node",args:[process.argv[1]],env:{EYES_SITE_DIR:process.argv[2],EYES_ROOT:process.argv[3]}}}}))' "$B/eyes-mcp.mjs" "$PWD/$DIR" "$PWD")
EYES_TOOLS=("mcp__eyes__look" "mcp__eyes__watch" "mcp__eyes__drive")

# ---- gates (PRODUCTION.md §4), minus the harness work after them
containment() {
  local bad
  bad=$(git status --porcelain -uall | cut -c4- | grep -v -E "^${DIR}/|^${PROFILE}\$" || true)
  if [ -n "$bad" ]; then echo "$bad" > "$OUT/containment.txt"; return 1; fi
  [ -f "$DIR/index.html" ] && [ -f "$DIR/BRIEF.md" ]
}
smoke() { # [shot] → exit 0 clean / 1 broken / 2 could not check
  node scripts/lab-smoke.mjs "$DIR" ${1:+"$1"} > "$OUT/smoke-$2.txt" 2>&1
}

# ---- compose the production prompt
rm -f /tmp/lab-refs.md /tmp/lab-thread.txt /tmp/lab-assets-problems.txt /tmp/shot.png
printf '%s' "${REFS_FROM:-$TASK}" | node scripts/lab-fetch-refs.mjs /tmp/lab-refs.md /tmp/lab-thread.txt > "$OUT/refs.log" 2>&1 || true
[ -n "$REFS_FROM" ] && { printf '%s' "$REFS_FROM" | node scripts/lab-fetch-assets.mjs "$DIR" > "$OUT/assets.log" 2>&1 || true; }
COMPOSE=(node "$B/compose-prompt.mjs" "$REQ" --repo "$PWD" --mode create)
[ -s /tmp/lab-refs.md ] && COMPOSE+=(--refs /tmp/lab-refs.md)
[ -s /tmp/lab-assets-problems.txt ] && COMPOSE+=(--assets-problems /tmp/lab-assets-problems.txt)
"${COMPOSE[@]}" > "$OUT/prompt.txt" || { echo "::error::compose failed"; exit 2; }
git add -A && git -c user.name=bakeoff -c user.email=bakeoff@localhost commit -q -m "pre-build state" --allow-empty

echo "== $ARM · $SLUG"
if [ "$ARM" = baseline ]; then
  run_pass main 32 "$OUT/prompt.txt" -- --max-turns 60 --max-budget-usd 5 "${FILE_TOOLS[@]}"
elif [ "$ARM" = challenger ]; then
  { cat "$OUT/prompt.txt"; cat "$B/challenger/method.md"; } > "$OUT/prompt-challenger.txt"
  run_pass main 90 "$OUT/prompt-challenger.txt" -- --max-turns 400 --max-budget-usd 60 \
    --mcp-config "$EYES_CFG" --strict-mcp-config \
    --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "${EYES_TOOLS[@]}" \
    --disallowedTools "Bash" "WebFetch" "WebSearch" "Task" "NotebookEdit"
  for r in $(seq 1 "$ROUNDS"); do
    [ -f "$DIR/index.html" ] || break
    node -e 'const fs=require("fs");const [t,d,task]=process.argv.slice(1);process.stdout.write(fs.readFileSync(t,"utf8").replace("<<<TASK>>>",task).replaceAll("<<<DIR>>>",d))' \
      "$B/challenger/critic.md" "$DIR" "$TASK" > "$OUT/critic-$r.prompt.txt"
    run_pass "critic-$r" 25 "$OUT/critic-$r.prompt.txt" -- --max-turns 80 \
      --mcp-config "$EYES_CFG" --strict-mcp-config \
      --allowedTools "Read" "Glob" "Grep" "${EYES_TOOLS[@]}" \
      --disallowedTools "Write" "Edit" "Bash" "WebFetch" "WebSearch" "Task" "NotebookEdit"
    node -e 'let r="";for(const l of require("fs").readFileSync(process.argv[1],"utf8").split("\n")){try{const j=JSON.parse(l);if(j.type==="result")r=j.result||""}catch{}}process.stdout.write(r)' \
      "$OUT/critic-$r.jsonl" > "$OUT/critique-$r.md"
    if ! [ -s "$OUT/critique-$r.md" ] || grep -q -E "VERDICT:\s*\**\s*SHIP" "$OUT/critique-$r.md"; then
      echo "  critic $r: ship (or no report)"; break
    fi
    node -e 'const fs=require("fs");const [t,d,task,c]=process.argv.slice(1);process.stdout.write(fs.readFileSync(t,"utf8").replace("<<<TASK>>>",task).replace("<<<CRITIQUE>>>",fs.readFileSync(c,"utf8")).replaceAll("<<<DIR>>>",d))' \
      "$B/challenger/revise.md" "$DIR" "$TASK" "$OUT/critique-$r.md" > "$OUT/revise-$r.prompt.txt"
    run_pass "revise-$r" 45 "$OUT/revise-$r.prompt.txt" -- --max-turns 300 --max-budget-usd 40 \
      --mcp-config "$EYES_CFG" --strict-mcp-config \
      --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "${EYES_TOOLS[@]}" \
      --disallowedTools "Bash" "WebFetch" "WebSearch" "Task" "NotebookEdit"
  done
else
  echo "::error::unknown arm $ARM"; exit 2
fi

# ---- gates, in production's order
gate() { STATUS=failed; FAILED_AT=$1; echo "  gate failed: $1"; }
if [ ! -f "$DIR/index.html" ]; then gate "no index.html"
elif ! containment; then gate "containment"
elif ! node scripts/lab-content-gate.mjs "$DIR" > "$OUT/content-gate-1.txt" 2>&1; then gate "content gate"
else
  smoke /tmp/shot.png 1; S=$?
  [ -s /tmp/shot.png ] && cp /tmp/shot.png "$OUT/shot-1.png"
  if [ $S -eq 1 ]; then
    # production: lab-smoke under GITHUB_ACTIONS prints ::error::smoke … lines
    REPORT=$(grep -E '^::error::smoke' "$OUT/smoke-1.txt" | sed 's/^::error:://' || true)
    SHOT=""
    [ -s /tmp/shot.png ] && SHOT="A SCREENSHOT OF THE BROKEN PAGE IS AT /tmp/shot.png — open it with
Read before you change anything. It is what a visitor sees. If it is blank or
the layout is wrong, that is the real problem and the console errors are
downstream of it."
    cat > "$OUT/repair.prompt.txt" <<EOF
The site you just wrote does not work. It was loaded in a real browser under the
production Content-Security-Policy, and it reported these problems:

${REPORT}

${SHOT}

You have no network tools, so you could not have seen this — that is why it is
being handed to you now. Fix ONLY these problems, in $DIR/, keeping everything
else as it is. Real response shapes for every endpoint you are allowed to call
are checked in at lab/_kit/fixtures/ — read them rather than guessing field
names, which is the usual cause of this. Update BRIEF.md if the fix changed a
decision worth remembering.
EOF
    printf '%s' "$(cat "$OUT/repair.prompt.txt")" > "$OUT/repair.prompt.txt.tmp" && mv "$OUT/repair.prompt.txt.tmp" "$OUT/repair.prompt.txt"
    run_pass repair 50 "$OUT/repair.prompt.txt" -- --max-turns 20 "${FILE_TOOLS[@]}"
    smoke "" 2; S2=$?
    if [ $S2 -ne 0 ] && [ $S2 -ne 2 ]; then gate "smoke (still broken after repair)"; fi
  elif [ $S -eq 0 ] && [ -s /tmp/shot.png ] && [ "$ARM" = baseline ]; then
    rm -rf "$TMP/visual-snap" && cp -r "$DIR" "$TMP/visual-snap"
    cat > "$OUT/visual.prompt.txt" <<EOF
Here is a screenshot of the page you just built, taken in a real browser at
1200x800 under the production Content-Security-Policy: /tmp/shot.png

READ THAT IMAGE FIRST. It is the only look at your own work you get, and it is
what a visitor sees. The page already loads without console errors — this pass
is about whether it is RIGHT, which no check before now could tell you.

What it was asked for:
${TASK}

Fix only things that are VISIBLY BROKEN: nothing rendered, content off-screen or
overlapping, text unreadable against its background, a canvas that is blank or
the wrong size, controls with no visible label, a layout obviously collapsed.

CHANGING NOTHING IS A GOOD OUTCOME AND USUALLY THE RIGHT ONE. Do not restyle, do
not refactor, do not add features, do not 'polish'. You cannot see hover states,
animation or anything below the fold, so do not guess at them. If the picture
looks like the request, say so and stop.

Write only inside $DIR/. If you changed something, add a line to BRIEF.md saying
what the screenshot showed.
EOF
    printf '%s' "$(cat "$OUT/visual.prompt.txt")" > "$OUT/visual.prompt.txt.tmp" && mv "$OUT/visual.prompt.txt.tmp" "$OUT/visual.prompt.txt"
    run_pass visual 8 "$OUT/visual.prompt.txt" -- --max-turns 14 --max-budget-usd 2 "${FILE_TOOLS[@]}"
    if ! diff -rq "$TMP/visual-snap" "$DIR" > /dev/null 2>&1; then
      smoke "" 3 || { echo "  visual pass broke the page — restoring"; rm -rf "$DIR" && cp -r "$TMP/visual-snap" "$DIR"; }
    fi
  fi
  if [ "$STATUS" = built ]; then
    node scripts/lab-content-gate.mjs "$DIR" > "$OUT/content-gate-2.txt" 2>&1 || gate "content gate (re-gate)"
    containment || gate "containment (after later passes)"
  fi
fi

# ---- secrets: the credential must not be in anything we keep
for v in "${CLAUDE_CODE_OAUTH_TOKEN:-}" "${ANTHROPIC_API_KEY:-}"; do
  [ -n "$v" ] && grep -rqF -- "$v" "$DIR" "$OUT" 2>/dev/null && { gate "secret in output"; rm -rf "$DIR"; }
done

mkdir -p "$OUT/site" && [ -d "$DIR" ] && cp -r "$DIR/." "$OUT/site/"
[ -f "$PROFILE" ] && git diff HEAD -- "$PROFILE" > "$OUT/profile.diff"
OUT_META="$OUT/meta.json" node -e '
  const [arm, slug, status, failed, ver, ...passes] = process.argv.slice(1);
  const p = passes.map((x) => JSON.parse(x));
  const sum = (k) => p.reduce((a, x) => a + (x[k] || 0), 0);
  require("fs").writeFileSync(process.env.OUT_META, JSON.stringify({ arm, slug, status, failed_at: failed || null,
    claude_version: ver, turns: sum("turns"), cost_usd: +sum("cost_usd").toFixed(4), seconds: sum("seconds"), passes: p }, null, 2) + "\n");' \
  "$ARM" "$SLUG" "$STATUS" "$FAILED_AT" "$("$CLAUDE" --version 2>/dev/null | head -1)" "${PASSES[@]}"
echo "== $ARM · $SLUG: $STATUS${FAILED_AT:+ ($FAILED_AT)}"
