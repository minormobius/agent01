# The build-a-bot in production: what a first build actually runs

Source: `.github/workflows/lab-build.yml` on `origin/claude/minomobi-landing-page-vg37b8`,
read 2026-09-29. Line numbers below refer to that blob. `compose-prompt.mjs` (next to this file)
reproduces the main-pass prompt. Its output is byte-identical to the workflow's own bash; see the
self-check at the end.

## 1. Trigger and runner

- The bot commits `.github/lab-requests/<slug>.json` to `claude/minomobi-landing-page-vg37b8`. The
  `select` job builds only if the **tip commit** touches a request file (`git diff-tree`).
- Job: `ubuntu-latest`, `timeout-minutes: 50`, and the steps run in the order below.
- Fields are read from the request file with `node -p "require(f)[k] || ''"`. These are `slug`,
  `task`, `thread_root`, `requester`, `root_uri/cid`, `parent_uri/cid`, `retire`, `refs_from`,
  `from_idea` and `named`. The slug must match `^[a-z0-9][a-z0-9-]{0,30}$` and the requester must
  match `^[a-z0-9][a-z0-9.-]{0,60}$`.

## 2. What is on disk when the agent starts (a first build)

1. `actions/checkout@v4` runs with `fetch-depth: 0` and `persist-credentials: false`. The checkout
   is the whole repo at the triggering SHA, with no token in `.git/config`.
2. **mode=create** applies when `claude/lab-<slug>` does not exist on origin. The job runs
   `git checkout -B claude/lab-<slug> <sha>`. If `claude/lab-<slug>` does exist, the build is an
   iteration. `claude/lab-train-game` exists today, so production would treat a new train-game
   request as an iteration. `odyssey-trail` has no site branch: its build failed. The bakeoff
   forces `create`.
3. **`origin/claude/lab-www` is merged in** (`git merge --no-edit`). This brings in every published
   tenant under `lab/www/*/` and every `lab/_profiles/*.md`. The agent therefore sees the other
   sites, and it sees its requester's profile, e.g. `lab/_profiles/minormobius.bsky.social.md`.
   Careful: `lab/www/train-game/` **already exists on lab-www**. A faithful *first* build of
   train-game has to remove that directory, or the agent sees the published version.
4. `base` is recorded here. The containment gate later measures against `git status`, not `base`.
5. Refs: `printf "${REFS_FROM:-$TASK}" | node scripts/lab-fetch-refs.mjs /tmp/lab-refs.md /tmp/lab-thread.txt`.
   This step needs the network and is never fatal. When nothing is fetched, no file is written and
   the prompt has no refs section.
6. Assets: first `mkdir -p lab/www/<slug>`, then
   `printf "$REFS_FROM" | node scripts/lab-fetch-assets.mjs lab/www/<slug>`. This can write
   `assets/`, `manifest.json`, `CREDITS.md` and `/tmp/lab-assets-problems.txt`. **So the site dir
   exists, empty, even though the prompt says "The directory does not exist yet".**
7. The prompt is composed (lines 494–1084) and passed through `GITHUB_OUTPUT`. The final newline
   is dropped.

**The agent's cwd is the repo root (`$GITHUB_WORKSPACE`).** A replica must reproduce this:

- Claude Code auto-loads the branch's root `CLAUDE.md` (≈12.6 KB, the production-ops file) as
  project memory. It lazily loads `lab/www/CLAUDE.md` when the agent reads under `lab/www/`.
- The branch has no `.claude/` directory, no `.mcp.json` and no settings. There is no
  user-level `~/.claude` on the runner.
- The agent can Read/Glob/Grep **the whole checkout**, including:
  - `lab/_kit/`: `README.md`, `tokens.css`, `kit.js`, `pds.js`, `auth.js`,
    `three.module.min.js`, `wasm/`, and `fixtures/*.json` (getProfile, getAuthorFeed,
    getFollowers, getPostThread, resolveHandle(.error), searchActors)
  - `lab/_profiles/README.md`
  - `lab/lexicons/`
  - `docs/NO-BUILD.md`
  - `scripts/lab-content-gate.mjs`
  - `cat/`
  - every other tenant
- Absolute paths outside cwd (`/tmp/lab-refs.md`, `/tmp/shot.png`) are Read by the agent. The
  prompt tells it to.
- Writes are allowed only to `lab/www/<slug>/**` and `lab/_profiles/<requester>.md`. The prompt
  states this and a gate enforces it; no tool restricts it.

## 3. Pass 1: main build (lines 1103–1168)

```bash
npm install -g @anthropic-ai/claude-code          # unpinned: whatever is latest at run time
printf '%s' "$PROMPT" | claude -p \
  --model claude-sonnet-5 \
  --max-turns 60 \
  --max-budget-usd 5 \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Edit" "Glob" "Grep" \
  --disallowedTools "Bash" "WebFetch" "WebSearch" "Task" "NotebookEdit" \
  --output-format stream-json --verbose | tee -a /tmp/agent.jsonl
```

- Env: `CLAUDE_CODE_OAUTH_TOKEN` and/or `ANTHROPIC_API_KEY`. No `--system-prompt` and no
  `--append-system-prompt`, so all instructions arrive through stdin.
- Step `timeout-minutes: 32`. The prompt tells the agent it has 20. The step has
  `continue-on-error: true`, so after a timeout whatever is on disk still gets gated.
- One retry, after `sleep 90`, and only when `scripts/lab-agent-outcome.mjs` reports
  `retryable=true` (API overloaded / 529 before the agent started).
- **Outcome step:**
  - If the agent failed but `index.html` exists, the build continues as "salvaged".
  - If it failed and there is no page, the build fails.

## 4. Gates, in order

1. **Containment.** Every path in `git status --porcelain -uall` must match `^lab/www/<slug>/` or
   the exact profile path. `index.html` **and `BRIEF.md`** must exist.
2. **Content gate.** `node scripts/lab-content-gate.mjs lab/www/<slug>` checks:
   - an XRPC allowlist: no firehose, searchPosts or feeds
   - no wallet machinery, password fields, notifications or copied kit
   - no trademark in the name, title, headings or card
   - `og:title` and `og:description` are present
   - asset hashes and credits
3. **Secrets.** The job greps for the literal values of the three secrets and for token shapes.
4. **Smoke test.** `node scripts/lab-smoke.mjs lab/www/<slug> /tmp/shot.png`:
   - The page is served on localhost under the production CSP.
   - Headless Chrome (SwiftShader GL) runs `--dump-dom` with virtual-time 8 s and a 30 s kill.
   - A second Chrome takes the 1200×800 screenshot (45 s kill). A blank screenshot counts as a
     problem.
   - Exit codes: 0 = clean, 1 = broken, 2 = could not check. On 2 the site publishes UNVERIFIED
     and no repair or visual pass runs. If no Chrome is installed, the script exits 0.
5. **Repair pass.** Runs only on exit 1; see §5.
6. **Visual pass.** Runs only if the first smoke run was clean *and* produced a screenshot; see §6.
7. **Re-gate.** `lab-content-gate.mjs` runs again.
8. The rest is harness work and has no agent:
   - name the site from its `<title>` (create mode, unnamed, not a rename)
   - commit and push `claude/lab-<slug>`
   - merge into `claude/lab-www` (this fires deploy-lab)
   - wait up to 4 minutes for the site to serve
   - take a 1200×630 card screenshot, and generate a CARD.json image if one was requested
   - post the Bluesky reply

There is **no bench pass** in production: none of the workflows contains one. There are exactly
three `claude -p` calls in lab-build.yml, the ones in §3, §5 and §6.

## 5. Pass 2: repair (lines 1311–1389, runs only when smoke exits 1)

```bash
printf '%s' "$REPAIR_PROMPT" | claude -p --model claude-sonnet-5 --max-turns 20 \
  --permission-mode acceptEdits --allowedTools "Read" "Write" "Edit" "Glob" "Grep" \
  --disallowedTools "Bash" "WebFetch" "WebSearch" "Task" "NotebookEdit" \
  --output-format stream-json --verbose
```

- No `--max-budget-usd` and no step timeout (only the job's 50 minutes). The exit code is ignored.
- The job then re-smokes without a screenshot:
  - 0: verified
  - 2: publishes unverified
  - anything else: fails ("still broken after the repair pass").
- The repair pass does **not** receive the task. `REPORT` holds the `smoke [kind] msg` lines from
  the first smoke run. `SHOT` is included only when `/tmp/shot.png` exists and is non-empty.

The prompt, verbatim. `$DIR` is `lab/www/<slug>`, and the leading YAML indent has been stripped:

```
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
```

`SHOT` is set to:

```
A SCREENSHOT OF THE BROKEN PAGE IS AT /tmp/shot.png — open it with
Read before you change anything. It is what a visitor sees. If it is blank or
the layout is wrong, that is the real problem and the console errors are
downstream of it.
```

## 6. Pass 3: visual (lines 1416–1477)

This pass runs only when `verified == 'true'` and a screenshot exists, i.e. the first smoke run was
clean. It never runs after a repair.

```bash
printf '%s' "$VISUAL_PROMPT" | claude -p --model claude-sonnet-5 --max-turns 14 --max-budget-usd 2 \
  --permission-mode acceptEdits --allowedTools "Read" "Write" "Edit" "Glob" "Grep" \
  --disallowedTools "Bash" "WebFetch" "WebSearch" "Task" "NotebookEdit" \
  --output-format stream-json --verbose
```

- Step `timeout-minutes: 8` and `continue-on-error: true`.
- The site dir is snapshotted first. If the agent changed anything, the job re-smokes, and restores
  the snapshot if the page no longer loads clean. The pass cannot fail the build.

The prompt, verbatim. `${TASK}` is the same task text as the main pass:

```
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
```

Each pass is a **fresh `claude -p` session**, with no `--resume` or `--continue`. Its only memory
is the files on disk.

## 7. What a faithful replica must reproduce

- **cwd = a checkout** of the factory branch with `claude/lab-www` merged in. This matters because:
  - the root `CLAUDE.md` is auto-loaded
  - the kit, fixtures, profiles and other tenants are readable
  - on a first build, `lab/www/<slug>/` must be absent or empty
- **The site dir is pre-created, empty,** before the main pass.
- The same flags on all three passes:
  - `acceptEdits`
  - the 5-tool allowlist
  - the bare-name disallow list
  - `claude-sonnet-5`
  - turn/budget caps of 60/$5, 20/none and 14/$2
- The same wall clocks: 32 min, none (inside the 50-minute job) and 8 min. The prompt claims 20.
- The prompt goes in on **stdin**, with no trailing newline.
- `/tmp/lab-refs.md`, if refs exist, and `/tmp/shot.png` must be at those absolute paths, because
  the prompts name them literally.
- Smoke, then repair, then visual, with the same CSP and window sizes. Otherwise passes 2 and 3
  fire under different conditions from production.
- The Claude Code version is unpinned in production, so record the version the replica uses.

## Self-check (2026-09-29)

I extracted the step's bash (lines 507–1084) and ran it with the same env, with `GITHUB_OUTPUT`
pointed at a temp file and `/tmp/lab-*` redirected into a scratch dir. I then compared its
`PROMPT` value with `compose-prompt.mjs` output.

- **Byte-identical** for `odyssey-trail.json` and `train-game.json` (create mode).
- Also byte-identical for two synthetic requests, in both create and iterate mode. Between them
  these exercise:
  - refs, asset problems, and a manifest with CREDITS.md
  - a retire
  - an arXiv-citation idea match and a `from_idea` reply match
  - a thread
  - no requester
  - a task with quotes, `$`, backticks and trailing newlines
