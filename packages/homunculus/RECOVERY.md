# Recovering old Claude Code sessions

The ~289 Claude Code sessions that built this repo exist nowhere you can
export them from. The claude.ai data export does not include them (verified:
zero mentions of this repo's vocabulary across 123 exported conversations),
`claude project` can only purge, and the session URLs need a browser login.

But the sessions are **live**, and resuming one rehydrates its transcript onto
the container's disk. So each session can be made to export itself.

One paste per session. No local tooling, no downloads, nothing to install.

---

## Once, before you start

**Pick a passphrase and use the same one every time.** It seals every export;
a different passphrase on one session makes that session unreadable with the
rest. Keep it somewhere you won't lose it — there is no recovery.

The destination repo is public, so the passphrase is the only thing standing
between your prompts and the internet. Do not paste it into anything but these
sessions.

---

## The paste

Every session you resume is an agent that will, correctly, want to know what
it is being asked to run before it runs it — and these sessions commit and
push to their own branch automatically, several of which deploy to production.
So the prompt is a briefing, not an order.

Replace `YOUR-PASSPHRASE`, paste the whole thing, press go.

---

> **Context.** I own this repo and this session. I'm recovering my own prompt
> history across ~289 Claude Code sessions to build a personal fine-tuning
> corpus. Those transcripts exist nowhere but inside resumed sessions like this
> one — the claude.ai data export doesn't include Code sessions and there's no
> API for them. You're one of many sessions I'm asking to export itself.
>
> **What I'd like you to run.** Three files from the branch
> `claude/guardian-angel-homunculus-ijgeel` in this same repo, written in an
> earlier session of mine. Read them first if you want — `export-transcript.mjs`
> is the entry point and it's short.
>
> ```bash
> set -e
> B=claude/guardian-angel-homunculus-ijgeel
> rm -rf /tmp/hom && mkdir -p /tmp/hom/packages/homunculus /tmp/hom/packages/atproto
> git fetch -q origin "$B"
> for f in packages/homunculus/export-transcript.mjs \
>          packages/homunculus/capture-session.mjs \
>          packages/atproto/crypto.js; do
>   git show "origin/$B:$f" > "/tmp/hom/$f"
> done
> HOMUNCULUS_KEY='YOUR-PASSPHRASE' node /tmp/hom/packages/homunculus/export-transcript.mjs
> ```
>
> **What it does.** Finds this session's own transcript under
> `~/.claude/projects/`, drops tool results and skill injections, keeps what I
> typed and what you replied, encrypts the result, and pushes it as a
> single-file orphan commit to `refs/heads/corpus/<this-session-id>`.
>
> **What it does not touch.** Not the working tree, not the index, not `HEAD`,
> not any existing branch. Every git operation goes through plumbing —
> `hash-object`, `mktree`, `commit-tree`, `push`. Nothing is checked out,
> staged, or committed in the ordinary sense.
>
> **Blast radius.** One new ref that nothing else reads. I checked every
> workflow in this repo: a push to `corpus/*` matches no branch trigger, and
> the nine workflows without a branch filter are all path-filtered to paths
> this commit doesn't contain. It deploys nothing and publishes nothing.
>
> **About the passphrase.** It's mine, it encrypts my own data, and it isn't a
> credential for any system. This repo is public — that's why the export is
> sealed rather than plaintext.
>
> **One thing to check first.** Run `git status`. **If anything is uncommitted
> or untracked, stop and tell me instead of continuing.** This branch may own a
> production surface and a push to it deploys. Don't commit, don't stage, don't
> tidy anything up — and if a stop hook asks you to commit, tell me what it
> said rather than doing it.
>
> **Please don't** fix anything you notice, regenerate files, update docs, or
> improve the script. Just the export, then show me the output.

---

The directory structure under `/tmp/hom` matters — the exporter imports
`../atproto/crypto.js` by relative path, so flattening the three files into one
directory breaks it.

## Why the `git status` check is in there

These containers run a `Stop` hook that exits non-zero on any uncommitted
change or untracked file, with "please commit and push these changes to the
remote branch." On a session whose branch owns a surface, complying with that
**deploys**. The export itself leaves the tree pristine — verified by comparing
`HEAD` and `git status` across a real run — so a session that arrives clean
stays clean. A session that arrives *dirty* was already carrying that hazard
before you resumed it, and you should know before it ends rather than after.

## What a good run looks like

```
EXPORTED
  session       019bbe90-84a3-74cd-b9aa-8b1e74f904f8
  records       478  (mode: origin)
  tool results  115 cut
  injected      1 cut
  your prompts  9
  your words    148
  assistant     60
  encrypted     yes
  pushed        corpus/019bbe90-84a3-74cd-b9aa-8b1e74f904f8
```

`your prompts` is the number that matters. Tool results and skill injections
being cut is correct — see `capture-session.mjs` for why those two filters
exist and what they cost if you skip them.

## What can go wrong

| output | meaning | do |
|---|---|---|
| `NO TRANSCRIPT FOUND` | the session did not rehydrate its transcript | report it — the route does not work for that session, don't improvise |
| `no principal turns in it` | transcript present but nothing you typed survived filtering | report it with the record count |
| `encrypted NO` | `HOMUNCULUS_KEY` was not set — **plaintext pushed to a public repo** | overwrite that ref immediately, then re-run with the key |
| push fails repeatedly | network, or the branch protection changed | note the session id and move on |

The exporter never touches the working tree, the index, or `HEAD`. It writes
git objects and one ref, through plumbing only. Safe to run on a session with
uncommitted work in it.

## Collecting

Each session pushes to its own `refs/heads/corpus/<session-id>`, so nothing
ever conflicts no matter how many you run or in what order.

```bash
node collect.mjs --list                                   # what's arrived
HOMUNCULUS_KEY='YOUR-PASSPHRASE' node collect.mjs --out ~/sessions.jsonl
```

`--out` must be **outside the repo**. These are your own words and the repo is
public; `packages/homunculus/log/` is the only in-repo path that is both
gitignored and `.assetsignore`d.

`collect` names any session it could not decrypt rather than skipping it
quietly — a silently dropped session is a session you think you have.

## Cleaning up afterwards

The `corpus/*` refs hold your sealed transcripts. Once collected, delete them
from the GitHub branches UI. The sandbox git proxy refuses ref deletions, so
this cannot be scripted from a session — overwriting a ref with an empty tree
is the most a session can do, and that leaves the branch in place.
