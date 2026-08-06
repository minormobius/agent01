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

Open an old session, paste this, press go. Replace `YOUR-PASSPHRASE` first.

````
Run exactly this, then show me the output and stop. Do not change any files,
do not commit, do not push anything else, do not "improve" the script.

```bash
set -e
B=claude/guardian-angel-homunculus-ijgeel
rm -rf /tmp/hom && mkdir -p /tmp/hom/packages/homunculus /tmp/hom/packages/atproto
git fetch -q origin "$B"
for f in packages/homunculus/export-transcript.mjs \
         packages/homunculus/capture-session.mjs \
         packages/atproto/crypto.js; do
  git show "origin/$B:$f" > "/tmp/hom/$f"
done
HOMUNCULUS_KEY='YOUR-PASSPHRASE' node /tmp/hom/packages/homunculus/export-transcript.mjs
```
````

The directory structure under `/tmp/hom` matters — the exporter imports
`../atproto/crypto.js` by relative path, so flattening the files into one
directory breaks it.

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
