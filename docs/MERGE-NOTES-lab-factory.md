# Merging `claude/bsky-bot-deploy-surface-dsmz7x`

Written for whoever assembles the merge candidate. **Consumable — delete it once
this branch has landed.** Everything here was checked against the repo and the
live account on 2026-07-30, not recalled.

The branch carries the Bluesky lab factory: the bot that turns a mention into a
built website, and the ideas pipeline that posts toy-website concepts mined from
arXiv. 215 files, and — unusually — **41 of them are live operational state.**

---

## 1. Merging this ships nothing, and that is not a problem to solve

`main` deploys nothing, deliberately (root `CLAUDE.md`). Everything on this branch
is *already in production* because it was pushed **here**: the worker is deployed,
`BOT_ENABLED = "true"`, `IDEAS_ENABLED: 'true'`, three concepts are publicly
posted and forty-one sites are live. The merge is an integration event.

So: nothing needs to be *verified as deployed* after the merge, and nothing on
this branch needs re-pushing to ship. If a fix is found **during** the merge, it
does not ship by landing on main — it ships by being pushed to this branch.

## 2. Do not delete or rename this branch after merging

`workers/bsky-bot/wrangler.toml` sets

```toml
GITHUB_BRANCH = "claude/bsky-bot-deploy-surface-dsmz7x"
```

That is **live config on a deployed worker**, not a build-time detail. The bot
fires builds by committing `.github/lab-requests/<slug>.json` to that branch (it
cannot use `repository_dispatch` — dispatch only resolves for workflows on the
default branch). Delete the branch and every mention silently stops producing a
site: the commit fails, and the only symptom is the bot going quiet.

The branch is also the only trigger for `deploy-bsky-bot.yml`, and the only
branch `lab-build.yml` accepts a request push from.

To retire it, three things move together: the registry entry, the `GITHUB_BRANCH`
var (**and a redeploy**), and the two workflows' branch filters.

## 3. Two things that fire *because of* the merge — already guarded, don't undo them

Both were found while writing these notes. Both would have gone off on merge day.

### A squash merge would have built a stranger's site

`lab-build.yml` triggers on `push` with `paths: .github/lab-requests/**`. It picks
the request with `git diff-tree --no-commit-id --name-only -r HEAD`, which prints
**nothing for a merge commit** — which is why ordinary merges onto this branch show
up as `skipped`, and why this was invisible.

**A squash merge is not a merge commit.** It is one single-parent commit touching
all forty-one request files, so `diff-tree` lists them all, `tail -1` picks one,
and the factory rebuilds whoever sorts last — full agent cost, publishing, and an
"it's live" reply in a stranger's weeks-old thread. Squash-merging is how this repo
makes pull requests, so this was a matter of time.

Guarded by `branches: ['claude/bsky-bot-deploy-surface-*']` on that push trigger.
Keep that glob equal to the bot's `GITHUB_BRANCH`; **do not widen it to let a
candidate branch through.**

### The merge activates two schedules on main, against a second ledger

`ideas-post.yml` (hourly), `ideas-review.yml` (6-hourly) and `ideas-pull.yml`
(daily) all carry `schedule:`. Those have never fired, because GitHub runs
schedules **only from the default branch** and this pipeline has only ever lived on
feature branches — `workers/cron` is the trampoline that actually starts runs. The
moment this lands on main, all three go live there.

They would not be a second copy of one pipeline. They would be a **second ledger**:
`.github/ideas/queue.jsonl` is a file, committed to whichever branch the run checks
out. A scheduled run on main reads main's frozen snapshot, posts a concept this
branch already marked posted — **a duplicate post under the operator's name** — and
stamps it on main, while review's plans land where no build can see them
(`lab-build` reads the queue from the bot's branch).

Guarded with a job-level `if:` on all three: never from `main`, never from
`github.event.repository.default_branch`. Both clauses on purpose — the payload
field is not guaranteed on every event, and an empty right-hand side fails *open*,
on main, silently.

Removing that guard is only correct as part of deliberately moving the pipeline to
main, ledger and all.

## 4. The live-state files, and the one command you must not skip

44 files in this diff are operational state, all of it still being written while
you merge:

| Files | Written by | Cadence |
|---|---|---|
| `.github/lab-requests/*.json` (41) | the bot, on every accepted mention | whenever somebody asks |
| `.github/ideas/queue.jsonl` | review (appends), post (stamps) | 4×/day, 24×/day |
| `.github/ideas/pool.jsonl` | pull (appends), review (marks) | daily, 4×/day |
| `.github/ideas/seen.json` | pull | daily |

`.gitattributes` gives `.github/ideas/*.jsonl` **`merge=union`**, so those ledgers
cannot produce a conflict marker — a textual rebase on them destroyed a whole
review run on 2026-07-29 (run 30500800107). Union has a cost: a record edited on
both sides survives **twice**, once stamped and once not, and `ideas-post.mjs` takes
the first un-posted entry — so the bare copy gets posted again.

**After any merge that touches `.github/ideas/`, before preflight:**

```bash
node scripts/ideas-dedupe.mjs          # report
node scripts/ideas-dedupe.mjs --write  # collapse
```

It keeps the record that knows more — a stamp outranks a plan outranks a review
mark — and leaves unparseable or keyless lines verbatim.

Two things this implies:

- **`.gitattributes` must land.** Without it the ledgers conflict again on the next
  race. `preflight` fails if that line goes missing, and also if any ideas workflow
  goes back to running `git push` itself instead of `scripts/ideas-push.sh` — the
  fix only works if all three use it.
- **Never rebase or force-push this branch.** Its ledgers are the live ones. A
  force-push loses whatever the bot committed in the meantime, and the lost thing
  is somebody's request.

## 5. `claude/hardware-toy-ideas-lqdtcs` — skip it, or merge it *first*

The ideas pipeline was cherry-picked from that branch onto this one, so the two
overlap on 21 files. Checked, rather than assumed: **everything that branch has and
this one lacks is the older version of code this branch superseded** —

- `renderPost` appending `arxiv.org/abs/<id>` to the post text, the bug that cost
  four good concepts to the length gate on the first live run;
- `createPost` without `app.bsky.embed.external`, so no link card;
- `IDEAS_ENABLED: 'false'`;
- the `git push && break ||` retry loop, in the exact form that lost a review run.

Its `queue.jsonl` / `pool.jsonl` are an older ledger (13 pending at 23:15Z, before
plans existed). Union merge plus `ideas-dedupe` handles *that* correctly — the
richer records win. Its `ideas-mine.yml` was already deleted there (split into
pull + review), so it is not a resurrection risk.

Per the repo's own rule — *branches whose content already landed are stale, skip
them* — the ideas half of that branch is stale. It still holds the `docs/`
pitches, and those are here too.

**If you merge it anyway: merge it BEFORE this branch, never after.** Landing its
older `ideas-gate.mjs`, `ideas-post.mjs`, `lib/bsky.mjs`, `BRIEF.md` or
`ideas-post.yml` on top of these would silently reintroduce the citation-in-text
bug and turn posting off.

## 6. What will *not* fight you

Checked so you do not have to:

- **Zero conflict candidates against `main`.** This branch is ten commits behind
  main (autopilot briefs and bisk digests) and touches none of the same files.
- **No deploy workflow triggers on a branch glob**, so whatever you name the
  candidate branch, it deploys nothing. Only `preflight.yml` runs on `claude/**`.
  The one caveat: do not name the candidate `claude/bsky-bot-deploy-surface-…` or
  `claude/hardware-toy-ideas-…`, which would match the two globs above.
- **`gen-deploy-triggers.mjs` only rewrites `deploy-<surface>.yml`.** It will not
  touch `lab-build.yml` or the three `ideas-*.yml`, so regenerating derived
  artefacts cannot strip the branch filters or the guards.
- **Eight repo-level secrets** are referenced (`BLUESKY_BOT_HANDLE`,
  `BLUESKY_BOT_APP_PASSWORD`, `LAB_DISPATCH_TOKEN`, `OS_AGENT_GITHUB_TOKEN`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY`). Merging changes none of them. They do not reach a PR from a
  fork — if the candidate is ever built that way, these workflows fail closed
  rather than misbehave.

## 7. Preflight, and what it now enforces

```bash
node scripts/preflight.mjs --fix   # regenerate, then re-check
node scripts/preflight.mjs         # must pass — 20 checks
```

New on this branch, and both exist because something got past their absence:

- **`the ideas ledgers have exactly one writer`** — all three ideas workflows must
  call `scripts/ideas-push.sh` and must not run `git push`/`git pull` themselves,
  and `.gitattributes` must still carry the union-merge line. Verified in both
  directions: it fails when either half is removed.
- **`diff-tree jobs check out a parent commit`** — a workflow that diffs `HEAD`
  must set `fetch-depth >= 2`. It scans YAML with run blocks and comments stripped,
  because the first version was defeated by its own error message.

## 8. After the merge, three checks worth thirty seconds

```bash
curl -s https://mino-bsky-bot.majormobius.workers.dev/state
```

- `tick.last.ok` is `true` and `tick.config.everyMs` is `15000` — the DO alarm
  chain is what gives sub-minute response; cron is only its watchdog. A dead chain
  is silent, and this is the only place it shows.
- `buildsInFlight` is small and `buildsThisHour` under `hourlyCap` (12).
- `postingAs` is `did:plc:gd6m4mw3km2betcnbbs6362q`. The handle cannot answer this —
  two accounts have held `minomobi.com`.

Then confirm nothing built on merge: no `Lab build` run should appear for the merge
commit. A `skipped` `select` job is the correct outcome.

## 9. Left undone, so it is not discovered as a surprise

- `_lexicon.lab.minomobi.com TXT "did=did:plc:gd6m4mw3km2betcnbbs6362q"` needs a
  Cloudflare token with Zone → DNS → Edit, or manual creation.
- The auth worker's `WRITE_COLLECTIONS` ceiling is missing three collections
  beyond the lab's two (`com.minomobi.hoop.story.content`,
  `com.minomobi.hoop.story.rumor`, `com.minomobi.ecdysium.save`). Reported,
  deliberately not shipped from here.
- `autopilot-brief.yml`, `bisk-monthly.yml` and `bisk-digest.yml` still carry the
  retry loop whose exhausted form reports success. They do not write the ledgers
  and do not race hourly, so they were left alone — but the fault is real for them
  too.
- Never exercised end to end: response latency under the alarm chain, the
  ideate→craft split on a live run, a build driven from a plan, the visual pass,
  the repair loop, the rename flow.
